import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

/**
 * 示例路由 - 测试 HTTP 接入和响应格式
 *
 * GET /api/example - 获取示例列表
 * GET /api/example/:id - 获取单个示例
 * POST /api/example - 创建示例
 */
export default async function (fastify: FastifyInstance) {
  // GET /api/example - 列表
  fastify.get(
    '/example',
    {
      schema: {
        tags: ['Example'],
        summary: '获取示例列表',
        description: '测试 GET 请求和分页响应',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            pageSize: { type: 'integer', default: 10 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  items: { type: 'array' },
                  total: { type: 'integer' },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  requestId: { type: 'string' },
                  timestamp: { type: 'string' },
                  pagination: {
                    type: 'object',
                    properties: {
                      page: { type: 'integer' },
                      pageSize: { type: 'integer' },
                      total: { type: 'integer' },
                      totalPages: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page = 1, pageSize = 10 } = request.query as { page: number; pageSize: number };

      // 模拟数据
      const items = [
        { id: 1, name: 'Example 1' },
        { id: 2, name: 'Example 2' },
        { id: 3, name: 'Example 3' },
      ];
      const total = items.length;
      const totalPages = Math.ceil(total / pageSize);

      return reply.sendSuccess({ items, total }, { page, pageSize, total, totalPages });
    }
  );

  // GET /api/example/:id - 详情
  fastify.get(
    '/example/:id',
    {
      schema: {
        tags: ['Example'],
        summary: '获取示例详情',
        description: '测试 GET 请求和单个资源响应',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      if (id === 'not-found') {
        throw new NotFoundError('Example not found');
      }

      return reply.sendSuccess({ id: parseInt(id), name: `Example ${id}` });
    }
  );

  // POST /api/example - 创建
  fastify.post(
    '/example',
    {
      schema: {
        tags: ['Example'],
        summary: '创建示例',
        description: '测试 POST 请求和请求体解析',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
          },
          required: ['name'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  createdAt: { type: 'string' },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  requestId: { type: 'string' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, description } = request.body as { name: string; description?: string };

      if (name === 'error') {
        throw new BadRequestError('Invalid name provided');
      }

      const newItem = {
        id: Date.now(),
        name,
        description,
        createdAt: new Date().toISOString(),
      };

      return reply.status(201).sendSuccess(newItem);
    }
  );

  // POST /api/example/validation-error - 测试验证错误
  fastify.post(
    '/example/validation-error',
    {
      schema: {
        tags: ['Example'],
        summary: '测试验证错误',
        description: '测试 ValidationError 响应',
      },
    },
    async () => {
      throw new BadRequestError('Validation failed');
    }
  );
}
