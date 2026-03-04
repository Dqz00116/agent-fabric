import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * 健康检查路由
 * GET /api/health
 */
export default async function (fastify: FastifyInstance) {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: '健康检查',
        description: '检查服务是否正常运行',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  version: { type: 'string', example: '1.0.0' },
                  uptime: { type: 'number' },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  requestId: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.sendSuccess({
        status: 'ok',
        version: '1.0.0',
        uptime: process.uptime(),
      });
    }
  );
}
