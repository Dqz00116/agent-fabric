import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyApiKey, hasAnyScope, type VerifyResult } from '../services/api-key.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../lib/logger.js';

// 扩展 Fastify 类型声明
declare module 'fastify' {
  interface FastifyRequest {
    /** 认证信息 */
    auth?: {
      /** 是否已认证 */
      authenticated: boolean;
      /** Namespace ID */
      namespaceId?: string;
      /** 权限范围 */
      scopes?: string[];
    };
  }
}

/**
 * 认证插件选项
 */
export interface AuthPluginOptions {
  /** 是否启用认证（默认: true） */
  enabled?: boolean;
  /** 公开路由（无需认证） */
  publicRoutes?: string[];
  /** 公开路由前缀 */
  publicPrefixes?: string[];
}

/**
 * 从请求头中提取 API Key
 */
function extractApiKey(request: FastifyRequest): string | undefined {
  // 优先从 X-API-Key 头获取
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey === 'string') {
    return apiKey;
  }

  // 支持 Authorization: Bearer <key> 格式
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

/**
 * 检查路由是否公开
 */
function isPublicRoute(url: string, publicRoutes: string[], publicPrefixes: string[]): boolean {
  // 精确匹配
  if (publicRoutes.includes(url)) {
    return true;
  }

  // 前缀匹配
  return publicPrefixes.some(prefix => url.startsWith(prefix));
}

/**
 * 认证插件
 *
 * 为 Fastify 应用添加 API Key 认证支持
 */
export default fp<AuthPluginOptions>(
  async function (fastify: FastifyInstance, options: AuthPluginOptions = {}) {
    const {
      enabled = true,
      publicRoutes = ['/health', '/api/health'],
      publicPrefixes = ['/docs', '/api/docs', '/swagger', '/api/swagger'],
    } = options;

    // 如果禁用认证，直接返回
    if (!enabled) {
      logger.warn('API Key authentication is disabled');
      return;
    }

    /**
     * 认证钩子函数
     */
    async function authHook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      const url = request.url;

      // 跳过公开路由
      if (isPublicRoute(url, publicRoutes, publicPrefixes)) {
        request.auth = { authenticated: false };
        return;
      }

      // 提取 API Key
      const apiKey = extractApiKey(request);

      // 验证 API Key
      const result: VerifyResult = await verifyApiKey(apiKey);

      // 处理验证结果
      if (!result.valid) {
        // 记录认证失败日志
        logger.warn(
          {
            requestId: request.id,
            url: request.url,
            method: request.method,
            error: result.error,
            hasKey: !!apiKey,
          },
          'Authentication failed'
        );

        // 根据错误类型返回不同状态码
        switch (result.error) {
          case 'MISSING':
            throw new UnauthorizedError('API Key is required');
          case 'INVALID':
            throw new ForbiddenError('Invalid API Key');
          case 'DISABLED':
            throw new ForbiddenError('API Key is disabled');
          case 'EXPIRED':
            throw new ForbiddenError('API Key has expired');
          default:
            throw new UnauthorizedError('Authentication failed');
        }
      }

      // 认证成功，设置请求上下文
      request.auth = {
        authenticated: true,
        namespaceId: result.namespaceId,
        scopes: result.scopes,
      };

      // 记录认证成功日志（仅调试级别）
      logger.debug(
        {
          requestId: request.id,
          namespaceId: result.namespaceId,
          scopes: result.scopes,
        },
        'Authentication successful'
      );
    }

    /**
     * 预处理钩子 - 在路由处理前执行认证
     */
    fastify.addHook('onRequest', authHook);

    /**
     * 装饰器 - 要求特定权限范围
     */
    fastify.decorate('requireScope', function (requiredScopes: string | string[]) {
      const scopes = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

      return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
        // 检查是否已认证
        if (!request.auth?.authenticated) {
          throw new UnauthorizedError('Authentication required');
        }

        // 检查权限范围
        const userScopes = request.auth.scopes || [];
        if (!hasAnyScope(userScopes, scopes)) {
          logger.warn(
            {
              requestId: request.id,
              namespaceId: request.auth.namespaceId,
              requiredScopes: scopes,
              userScopes,
            },
            'Permission denied'
          );
          throw new ForbiddenError(`Required scope(s): ${scopes.join(', ')}`);
        }
      };
    });

    /**
     * 装饰器 - 获取当前 namespaceId
     */
    fastify.decorateReply('getNamespaceId', function (this: FastifyReply): string | undefined {
      const request = this.request;
      return request.auth?.namespaceId;
    });

    logger.info('Authentication plugin registered');
  },
  {
    name: 'auth',
    dependencies: ['response-format'], // 确保在响应格式化插件之后加载
  }
);

// 扩展 Fastify 实例类型
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * 创建权限检查中间件
     * @param scopes - 需要的权限范围
     */
    requireScope(
      scopes: string | string[]
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyReply {
    /**
     * 获取当前请求的 namespaceId
     */
    getNamespaceId(): string | undefined;
  }
}
