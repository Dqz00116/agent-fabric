import Fastify, { FastifyInstance } from 'fastify';
import autoLoad from '@fastify/autoload';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 创建 Fastify 应用实例
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // 禁用 Fastify 内置日志，使用 Pino
    logger: false,
    pluginTimeout: 10000,
    // 启用请求 ID
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // 自动加载插件（按字母顺序加载）
  await app.register(autoLoad, {
    dir: join(__dirname, 'plugins'),
    options: { prefix: '' },
  });

  // 自动加载路由
  await app.register(autoLoad, {
    dir: join(__dirname, 'routes'),
    options: { prefix: '/api' },
  });

  logger.info('Fastify application built successfully');

  return app;
}
