import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createNamespace,
  listNamespaces,
  getNamespaceDetail,
  updateNamespace,
  deleteNamespace,
  isNamespaceNameExists,
  validateNamespaceName,
  type ListNamespacesParams,
  type CreateNamespaceInput,
  type UpdateNamespaceInput,
} from '../services/namespace.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors.js';

/**
 * Namespace 管理路由
 */
export default async function (fastify: FastifyInstance) {
  // POST /api/v1/namespaces - 创建
  fastify.post(
    '/v1/namespaces',
    {
      schema: {
        tags: ['Namespaces'],
        summary: '创建 Namespace',
        security: [{ apiKey: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 50 },
          },
          required: ['name'],
        },
      },
      preHandler: [fastify.requireScope(['admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as CreateNamespaceInput;

      const validation = validateNamespaceName(name);
      if (!validation.valid) {
        throw new BadRequestError(validation.error!);
      }

      const exists = await isNamespaceNameExists(name);
      if (exists) {
        throw new ConflictError(`Namespace "${name}" already exists`);
      }

      const namespace = await createNamespace({ name });

      return reply.status(201).send({
        success: true,
        data: {
          id: namespace.id,
          name: namespace.name,
          createdAt: namespace.createdAt.toISOString(),
          updatedAt: namespace.updatedAt.toISOString(),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // GET /api/v1/namespaces - 列表
  fastify.get(
    '/v1/namespaces',
    {
      schema: {
        tags: ['Namespaces'],
        summary: '列出 Namespaces',
        security: [{ apiKey: [] }],
      },
      preHandler: [fastify.requireScope(['read', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
      };

      const params: ListNamespacesParams = {
        page: parseInt(query.page || '1', 10),
        pageSize: parseInt(query.pageSize || '10', 10),
        search: query.search,
      };

      const result = await listNamespaces(params);

      return reply.send({
        success: true,
        data: {
          items: result.items.map(item => ({
            id: item.id,
            name: item.name,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          })),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // GET /api/v1/namespaces/:id - 详情
  fastify.get(
    '/v1/namespaces/:id',
    {
      schema: {
        tags: ['Namespaces'],
        summary: '获取 Namespace 详情',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
      preHandler: [fastify.requireScope(['read', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const namespace = await getNamespaceDetail(id);

      if (!namespace) {
        throw new NotFoundError('Namespace not found');
      }

      return reply.send({
        success: true,
        data: {
          id: namespace.id,
          name: namespace.name,
          createdAt: namespace.createdAt.toISOString(),
          updatedAt: namespace.updatedAt.toISOString(),
          stats: namespace._count || { agents: 0, apiKeys: 0, requests: 0 },
          agents: (namespace.agents || []).map(agent => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            isActive: agent.isActive,
            createdAt: agent.createdAt.toISOString(),
          })),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // PUT /api/v1/namespaces/:id - 更新
  fastify.put(
    '/v1/namespaces/:id',
    {
      schema: {
        tags: ['Namespaces'],
        summary: '更新 Namespace',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 50 },
          },
        },
      },
      preHandler: [fastify.requireScope(['write', 'admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const updates = request.body as UpdateNamespaceInput;

      if (updates.name) {
        const validation = validateNamespaceName(updates.name);
        if (!validation.valid) {
          throw new BadRequestError(validation.error!);
        }

        const exists = await isNamespaceNameExists(updates.name, id);
        if (exists) {
          throw new ConflictError(`Namespace "${updates.name}" already exists`);
        }
      }

      const namespace = await updateNamespace(id, updates);

      if (!namespace) {
        throw new NotFoundError('Namespace not found');
      }

      return reply.send({
        success: true,
        data: {
          id: namespace.id,
          name: namespace.name,
          createdAt: namespace.createdAt.toISOString(),
          updatedAt: namespace.updatedAt.toISOString(),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  // DELETE /api/v1/namespaces/:id - 删除
  fastify.delete(
    '/v1/namespaces/:id',
    {
      schema: {
        tags: ['Namespaces'],
        summary: '删除 Namespace',
        description: '删除命名空间及其关联的所有数据（agents, apiKeys, requests）',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
      preHandler: [fastify.requireScope(['admin'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const deleted = await deleteNamespace(id);

      if (!deleted) {
        throw new NotFoundError('Namespace not found');
      }

      return reply.send({
        success: true,
        data: {
          message: 'Namespace deleted successfully',
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
