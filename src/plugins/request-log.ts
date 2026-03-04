/**
 * 请求日志中间件
 *
 * 功能：
 * - 请求开始/结束记录
 * - 耗时统计
 * - 状态码记录
 * - 生成 requestId
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { logger, requestContext, loggers } from '../lib/logger.js';

// HTTP 日志记录器
const httpLogger = loggers.http;

// 扩展 Fastify 类型声明
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTime: number;
  }
}

/**
 * 生成 requestId
 */
function generateRequestId(): string {
  return randomUUID();
}

/**
 * 判断是否需要记录请求体
 * （过滤敏感端点和大数据）
 */
function shouldLogBody(url: string): boolean {
  const excludedPaths = ['/health', '/ready', '/metrics', '/documentation'];

  return !excludedPaths.some(path => url.includes(path));
}

/**
 * 脱敏请求体
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'];
  const sanitized = { ...(body as Record<string, unknown>) };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[Redacted]';
    }
  }

  return sanitized;
}

/**
 * 记录请求开始
 */
function logRequestStart(request: FastifyRequest): void {
  const { method, url, headers, body } = request;
  const requestId = request.requestId;

  const logData: Record<string, unknown> = {
    requestId,
    method,
    url,
    userAgent: headers['user-agent'],
    contentType: headers['content-type'],
    ip: request.ip,
  };

  // 开发环境记录请求体
  if (process.env.NODE_ENV !== 'production' && body && shouldLogBody(url)) {
    logData.body = sanitizeBody(body);
  }

  httpLogger.info(logData, 'Request started');
}

/**
 * 记录请求完成
 */
function logRequestComplete(request: FastifyRequest, reply: FastifyReply): void {
  const { method, url } = request;
  const requestId = request.requestId;
  const statusCode = reply.statusCode;
  const duration = Date.now() - request.startTime;

  // 根据状态码确定日志级别
  const isError = statusCode >= 400;
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  const logData: Record<string, unknown> = {
    requestId,
    method,
    url,
    statusCode,
    duration,
    durationMs: `${duration}ms`,
    contentLength: reply.getHeader('content-length'),
    contentType: reply.getHeader('content-type'),
  };

  const message = `Request completed`;

  if (isError) {
    httpLogger[logLevel](logData, message);
  } else {
    httpLogger.info(logData, message);
  }
}

/**
 * 记录请求错误
 */
function logRequestError(request: FastifyRequest, error: Error, statusCode?: number): void {
  const { method, url } = request;
  const requestId = request.requestId;
  const duration = Date.now() - request.startTime;

  httpLogger.error(
    {
      requestId,
      method,
      url,
      statusCode,
      duration,
      err: error,
    },
    'Request failed'
  );
}

/**
 * 请求日志插件
 */
const requestLogPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 添加 onRequest hook
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 生成 requestId（优先使用客户端传入的）
    const requestId = (request.headers['x-request-id'] as string) || generateRequestId();

    // 设置到请求对象
    request.requestId = requestId;
    request.startTime = Date.now();

    // 设置响应头
    reply.header('x-request-id', requestId);

    // 使用 AsyncLocalStorage 存储请求上下文
    const store = new Map<string, unknown>();
    store.set('requestId', requestId);
    store.set('startTime', request.startTime);

    // 在请求上下文中执行
    return new Promise((resolve, reject) => {
      requestContext.run(store, async () => {
        try {
          logRequestStart(request);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  // 添加 onSend hook（响应发送前）
  fastify.addHook(
    'onSend',
    async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      // 在请求上下文中记录
      const store = requestContext.getStore();
      if (store) {
        logRequestComplete(request, reply);
      }
      return payload;
    }
  );

  // 添加 onError hook
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    logRequestError(request, error, reply.statusCode);
  });

  // 添加 onClose hook（应用关闭时刷新日志）
  fastify.addHook('onClose', async () => {
    logger.info('Server closing, flushing logs...');
  });

  logger.info('Request logging plugin registered');
};

// 使用 fastify-plugin 包装
export default fp(requestLogPlugin, {
  name: 'request-log',
  fastify: '4.x',
});

// 导出用于手动记录的工具函数
export { logRequestStart, logRequestComplete, logRequestError, generateRequestId };
