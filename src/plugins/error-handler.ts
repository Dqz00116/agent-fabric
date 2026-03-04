import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../lib/logger.js';

/**
 * 全局错误处理插件
 */
export default fp(async function (fastify: FastifyInstance) {
  // 设置错误处理钩子
  fastify.setErrorHandler(
    (error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
      logger.error(
        {
          requestId: request.id,
          error: {
            message: error.message,
            code: (error as AppError).code,
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
          },
          url: request.url,
          method: request.method,
        },
        'Request error'
      );

      // 处理应用自定义错误
      if (error instanceof AppError) {
        const errorResponse: Record<string, unknown> = {
          code: error.code,
          message: error.message,
        };

        // 验证错误添加详细信息
        if (error instanceof ValidationError && error.details) {
          errorResponse.details = error.details;
        }

        return reply.status(error.statusCode).send({
          success: false,
          error: errorResponse,
          meta: {
            requestId: request.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 处理 Fastify 验证错误
      if (error.validation) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
          meta: {
            requestId: request.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 处理其他错误（不暴露内部信息）
      const isDevelopment = process.env.NODE_ENV === 'development';
      const statusCode = (error as FastifyError).statusCode || 500;

      const errorResponse: Record<string, unknown> = {
        code: 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal Server Error' : error.message,
      };

      // 开发环境显示详细错误
      if (isDevelopment && statusCode >= 500) {
        errorResponse.stack = error.stack;
      }

      return reply.status(statusCode).send({
        success: false,
        error: errorResponse,
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // 设置 404 处理
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    logger.warn(
      {
        requestId: request.id,
        url: request.url,
        method: request.method,
      },
      'Route not found'
    );

    return reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${request.method} ${request.url}`,
      },
      meta: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
      },
    });
  });

  fastify.log.info('Error handler plugin registered');
});
