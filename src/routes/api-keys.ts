import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  deleteApiKey,
  type ApiKeyMetadata,
} from '../services/api-key.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

/**
 * API Key 管理路由
 *
 * POST   /api/api-keys      - 创建 API Key
 * GET    /api/api-keys      - 列出所有 API Key
 * GET    /api/api-keys/:id  - 获取单个 API Key
 * PATCH  /api/api-keys/:id  - 更新 API Key
 * DELETE /api/api-keys/:id  - 删除 API Key
 */
export default async function (fastify: FastifyInstance) {
  // POST /api/api-keys - 创建 API Key
  fastify.post(
    '/api-keys',
    {
      schema: {
        tags: ['API Keys'],
        summary: '创建 API Key',
        description: '为当前 namespace 创建新的 API Key',
        security: [{ apiKey: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'API Key 名称' },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              description: '权限范围（如: read, write, admin）',
            },
            expiresInDays: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
              description: '过期天数（可选）',
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  key: { type: 'string', description: '原始 API Key（仅显示一次）' },
                  scopes: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
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
      // 需要 write 或 admin 权限
      preHandler: [fastify.requireScope(['write', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const namespaceId = request.auth?.namespaceId;
      if (!namespaceId) {
        throw new BadRequestError('Namespace not found in request');
      }

      const { name, scopes, expiresInDays } = request.body as {
        name?: string;
        scopes?: string[];
        expiresInDays?: number;
      };

      // 计算过期时间
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      // 创建 API Key
      const result = await createApiKey(namespaceId, {
        name,
        scopes: scopes || ['read'],
        expiresAt,
      });

      return reply.status(201).send({
        success: true,
        data: {
          id: result.apiKey.id,
          name: result.apiKey.name,
          key: result.plainKey, // 仅显示一次
          scopes: result.apiKey.scopes,
          isActive: result.apiKey.isActive,
          expiresAt: result.apiKey.expiresAt?.toISOString() || null,
          createdAt: result.apiKey.createdAt.toISOString(),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // GET /api/api-keys - 列出 API Keys
  fastify.get(
    '/api-keys',
    {
      schema: {
        tags: ['API Keys'],
        summary: '列出 API Keys',
        description: '获取当前 namespace 的所有 API Key',
        security: [{ apiKey: [] }],
        querystring: {
          type: 'object',
          properties: {
            includeInactive: {
              type: 'string',
              enum: ['true', 'false'],
              description: '是否包含已禁用的 Key',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    scopes: { type: 'array', items: { type: 'string' } },
                    isActive: { type: 'boolean' },
                    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  requestId: { type: 'string' },
                  timestamp: { type: 'string' },
                  total: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      // 需要 read 或 admin 权限
      preHandler: [fastify.requireScope(['read', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const namespaceId = request.auth?.namespaceId;
      if (!namespaceId) {
        throw new BadRequestError('Namespace not found in request');
      }

      const { includeInactive } = request.query as { includeInactive?: string };
      const apiKeys = await listApiKeys(namespaceId);

      // 过滤已禁用的 Key
      const filteredKeys =
        includeInactive === 'true' ? apiKeys : apiKeys.filter(key => key.isActive);

      return reply.send({
        success: true,
        data: filteredKeys.map((key: ApiKeyMetadata) => ({
          id: key.id,
          name: key.name,
          scopes: key.scopes,
          isActive: key.isActive,
          lastUsedAt: key.lastUsedAt?.toISOString() || null,
          expiresAt: key.expiresAt?.toISOString() || null,
          createdAt: key.createdAt.toISOString(),
        })),
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
          total: filteredKeys.length,
        },
      });
    }
  );

  // GET /api/api-keys/:id - 获取单个 API Key
  fastify.get(
    '/api-keys/:id',
    {
      schema: {
        tags: ['API Keys'],
        summary: '获取 API Key 详情',
        description: '获取指定 API Key 的详细信息',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'API Key ID' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  scopes: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
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
      preHandler: [fastify.requireScope(['read', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const namespaceId = request.auth?.namespaceId;
      if (!namespaceId) {
        throw new BadRequestError('Namespace not found in request');
      }

      const { id } = request.params as { id: string };
      const apiKey = await getApiKey(namespaceId, id);

      if (!apiKey) {
        throw new NotFoundError('API Key not found');
      }

      return reply.send({
        success: true,
        data: {
          id: apiKey.id,
          name: apiKey.name,
          scopes: apiKey.scopes,
          isActive: apiKey.isActive,
          lastUsedAt: apiKey.lastUsedAt?.toISOString() || null,
          expiresAt: apiKey.expiresAt?.toISOString() || null,
          createdAt: apiKey.createdAt.toISOString(),
          updatedAt: apiKey.updatedAt.toISOString(),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // PATCH /api/api-keys/:id - 更新 API Key
  fastify.patch(
    '/api-keys/:id',
    {
      schema: {
        tags: ['API Keys'],
        summary: '更新 API Key',
        description: '更新 API Key 的名称、权限或状态',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'API Key ID' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '新的名称' },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              description: '新的权限范围',
            },
            isActive: {
              type: 'boolean',
              description: '启用/禁用状态',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: '新的过期时间（null 表示永不过期）',
            },
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
                  id: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  scopes: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  updatedAt: { type: 'string', format: 'date-time' },
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
      preHandler: [fastify.requireScope(['write', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const namespaceId = request.auth?.namespaceId;
      if (!namespaceId) {
        throw new BadRequestError('Namespace not found in request');
      }

      const { id } = request.params as { id: string };
      const updates = request.body as {
        name?: string;
        scopes?: string[];
        isActive?: boolean;
        expiresAt?: string;
      };

      const apiKey = await updateApiKey(namespaceId, id, {
        ...updates,
        expiresAt: updates.expiresAt ? new Date(updates.expiresAt) : undefined,
      });

      if (!apiKey) {
        throw new NotFoundError('API Key not found');
      }

      return reply.send({
        success: true,
        data: {
          id: apiKey.id,
          name: apiKey.name,
          scopes: apiKey.scopes,
          isActive: apiKey.isActive,
          expiresAt: apiKey.expiresAt?.toISOString() || null,
          updatedAt: apiKey.updatedAt.toISOString(),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // DELETE /api/api-keys/:id - 删除 API Key
  fastify.delete(
    '/api-keys/:id',
    {
      schema: {
        tags: ['API Keys'],
        summary: '删除 API Key',
        description: '永久删除 API Key',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'API Key ID' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  deletedId: { type: 'string' },
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
      preHandler: [fastify.requireScope(['admin'])], // 仅 admin 可删除
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const namespaceId = request.auth?.namespaceId;
      if (!namespaceId) {
        throw new BadRequestError('Namespace not found in request');
      }

      const { id } = request.params as { id: string };
      const deleted = await deleteApiKey(namespaceId, id);

      if (!deleted) {
        throw new NotFoundError('API Key not found');
      }

      return reply.send({
        success: true,
        data: {
          message: 'API Key deleted successfully',
          deletedId: id,
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );
}
