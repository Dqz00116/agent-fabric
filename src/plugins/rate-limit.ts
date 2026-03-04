/**
 * 限流与熔断插件
 *
 * 功能：
 * - 基于 Redis 的分布式限流
 * - 全局限流规则（默认 100 req/min）
 * - namespace 级别动态限流配置
 * - 限流触发日志记录
 * - 友好的错误提示（RATE_LIMIT_EXCEEDED + retryAfter）
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getRedisClient } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// 限流配置缓存（避免频繁查询数据库）
interface RateLimitConfig {
  max: number;
  timeWindow: number;
  enabled: boolean;
  updatedAt: Date;
}

// namespace 限流配置缓存
const namespaceConfigCache = new Map<string, RateLimitConfig>();
const CACHE_TTL_MS = 60 * 1000; // 缓存 60 秒

/**
 * 从数据库获取 namespace 限流配置
 * TODO: 需要创建 RateLimitConfig 模型
 */
async function getNamespaceRateLimitConfig(_namespace: string): Promise<RateLimitConfig | null> {
  // 临时返回 null，使用默认配置
  return null;
}

/**
 * 获取 namespace 限流配置（带缓存）
 */
async function getCachedNamespaceConfig(namespace: string): Promise<RateLimitConfig | null> {
  const cached = namespaceConfigCache.get(namespace);
  const now = new Date();

  // 检查缓存是否有效
  if (cached && now.getTime() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  // 从数据库获取新配置
  const config = await getNamespaceRateLimitConfig(namespace);
  if (config) {
    namespaceConfigCache.set(namespace, config);
  }

  return config;
}

/**
 * 清除 namespace 配置缓存
 */
function clearNamespaceCache(namespace?: string): void {
  if (namespace) {
    namespaceConfigCache.delete(namespace);
    logger.info({ namespace }, '已清除 namespace 限流配置缓存');
  } else {
    namespaceConfigCache.clear();
    logger.info('已清除所有 namespace 限流配置缓存');
  }
}

/**
 * 提取请求中的 namespace
 * 优先从 header 的 x-namespace 获取，其次从 url 路径提取
 */
function extractNamespace(request: FastifyRequest): string | null {
  // 优先从 header 获取
  const headerNamespace = request.headers['x-namespace'] as string;
  if (headerNamespace) {
    return headerNamespace;
  }

  // 从 URL 路径提取 /api/:namespace/...
  const urlMatch = request.url.match(/^\/api\/([^/]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

/**
 * 记录限流触发日志
 */
function logRateLimitExceeded(
  request: FastifyRequest,
  _reply: FastifyReply,
  namespace: string | null,
  retryAfter: number
): void {
  logger.warn(
    {
      requestId: request.id,
      ip: request.ip,
      url: request.url,
      method: request.method,
      namespace,
      userAgent: request.headers['user-agent'],
      retryAfter,
    },
    '限流触发 - 请求过于频繁'
  );
}

/**
 * 自定义限流错误响应
 */
function createRateLimitErrorResponse(retryAfter: number) {
  return {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后重试',
      retryAfter,
      retryAfterMs: retryAfter * 1000,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * 限流插件
 */
const rateLimitPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 获取 Redis 客户端
  const redisClient = getRedisClient();

  // 注册 @fastify/rate-limit 插件
  await fastify.register(rateLimit, {
    // 使用 Redis 存储限流计数
    redis: redisClient.getClient(),

    // 默认全局限流规则：100 req/min
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: (process.env.RATE_LIMIT_WINDOW_MS || '60000') as unknown as number,

    // 自定义 key 生成器（基于 IP + namespace）
    keyGenerator: (request: FastifyRequest): string => {
      const namespace = extractNamespace(request);
      const ip = request.ip;
      return namespace ? `ratelimit:${namespace}:${ip}` : `ratelimit:global:${ip}`;
    },

    // 自定义错误响应
    errorResponseBuilder: (request: FastifyRequest, context) => {
      const retryAfter = Math.ceil((context.after as unknown) as number);
      const namespace = extractNamespace(request);

      // 记录限流触发日志
      logRateLimitExceeded(request, { statusCode: 429 } as FastifyReply, namespace, retryAfter);

      return createRateLimitErrorResponse(retryAfter);
    },

    // 跳过某些路径的限流
    skipOnError: true,

    // 添加限流响应头
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  /**
   * 动态限流钩子 - 根据 namespace 配置调整限流规则
   */
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    const namespace = extractNamespace(request);
    if (!namespace) {
      return;
    }

    // 获取 namespace 限流配置
    const config = await getCachedNamespaceConfig(namespace);
    if (!config || !config.enabled) {
      return;
    }

    // 在请求对象上附加限流配置，供后续使用
    (request as FastifyRequest & { rateLimitConfig?: RateLimitConfig }).rateLimitConfig = config;
  });

  /**
   * 获取 namespace 限流配置 API
   */
  fastify.get('/api/admin/rate-limit/:namespace', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { namespace } = request.params as { namespace: string };
    const config = await getCachedNamespaceConfig(namespace);

    if (!config) {
      return { 
        success: false, 
        error: { 
          code: 'CONFIG_NOT_FOUND', 
          message: `Namespace ${namespace} 的限流配置不存在` 
        } 
      };
    }

    return {
      success: true,
      data: {
        namespace,
        max: config.max,
        timeWindow: config.timeWindow,
        enabled: config.enabled,
      },
    };
  });

  /**
   * 刷新 namespace 限流配置缓存 API
   */
  fastify.post('/api/admin/rate-limit/:namespace/refresh', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { namespace } = request.params as { namespace: string };
    clearNamespaceCache(namespace);

    // 重新加载配置
    const config = await getCachedNamespaceConfig(namespace);

    return {
      success: true,
      data: {
        namespace,
        config,
        message: '限流配置缓存已刷新',
      },
    };
  });

  logger.info('Rate limit plugin registered');
};

// 使用 fastify-plugin 包装
export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '4.x',
  dependencies: ['redis'], // 确保 Redis 插件先加载
});

// 导出工具函数
export { extractNamespace, getCachedNamespaceConfig };
