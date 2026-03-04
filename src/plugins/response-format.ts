import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * 标准 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
  meta: {
    requestId: string;
    timestamp: string;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * 响应格式化插件
 * 为 Fastify 实例添加 sendSuccess 和 sendError 方法
 */
export default fp(
  async function (fastify: FastifyInstance) {
    // 添加成功响应装饰器
    fastify.decorateReply('sendSuccess', function <
      T,
    >(this: FastifyReply, data: T, pagination?: ApiResponse<T>['meta']['pagination']) {
      const response: ApiResponse<T> = {
        success: true,
        data,
        meta: {
          requestId: (this.request as FastifyRequest).id,
          timestamp: new Date().toISOString(),
        },
      };

      if (pagination) {
        response.meta.pagination = pagination;
      }

      return this.send(response);
    });

    // 添加错误响应装饰器
    fastify.decorateReply(
      'sendError',
      function (
        this: FastifyReply,
        code: string,
        message: string,
        statusCode: number = 400,
        details?: Record<string, string>
      ) {
        const response: ApiResponse = {
          success: false,
          error: {
            code,
            message,
          },
          meta: {
            requestId: (this.request as FastifyRequest).id,
            timestamp: new Date().toISOString(),
          },
        };

        if (details) {
          response.error!.details = details;
        }

        return this.status(statusCode).send(response);
      }
    );

    fastify.log.info('Response format plugin registered');
  },
  { name: 'response-format' }
);

// 类型声明扩展
declare module 'fastify' {
  interface FastifyReply {
    sendSuccess<T>(data: T, pagination?: ApiResponse<T>['meta']['pagination']): FastifyReply;
    sendError(
      code: string,
      message: string,
      statusCode?: number,
      details?: Record<string, string>
    ): FastifyReply;
  }
}
