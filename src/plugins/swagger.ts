import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

/**
 * Swagger/OpenAPI 文档插件配置
 */
export default fp(async function (fastify: FastifyInstance) {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'AgentFabric API',
        description: 'AgentFabric - AI Agent 框架 API 文档',
        version: '1.0.0',
        contact: {
          name: 'AgentFabric Team',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000/api',
          description: '本地开发服务器',
        },
      ],
      tags: [
        { name: 'Health', description: '健康检查相关接口' },
        { name: 'Agent', description: 'Agent 管理相关接口' },
        { name: 'Workflow', description: '工作流管理相关接口' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
  });

  fastify.log.info('Swagger plugin registered');
});
