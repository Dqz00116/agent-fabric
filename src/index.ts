#!/usr/bin/env node

/**
 * AgentFabric - AI Agent 框架入口
 */

import { buildApp } from './app.js';
import { logger, loggers } from './lib/logger.js';
import { loadConfig, type AppConfig } from './config/index.js';

export const VERSION = '1.0.0';

export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
}

export class AgentFabric {
  private config: AgentConfig;
  private appConfig: AppConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    // 加载并验证配置
    this.appConfig = loadConfig();
  }

  public getConfig(): AgentConfig {
    return this.config;
  }

  public getAppConfig(): AppConfig {
    return this.appConfig;
  }

  public async start(): Promise<void> {
    const { server, log, database, redis } = this.appConfig;

    // 使用结构化日志替代 console.log
    logger.info(`🚀 AgentFabric v${VERSION} starting...`);
    logger.info(`📦 Agent: ${this.config.name} v${this.config.version}`);

    // 记录配置信息
    logger.info(
      {
        environment: server.nodeEnv,
        port: server.port,
        host: server.host,
        logLevel: log.level,
        database: {
          url: database.url.replace(/:\/\/.*@/, '://***@'), // 脱敏
        },
        redis: {
          host: redis.host,
          port: redis.port,
        },
      },
      'Configuration loaded'
    );

    try {
      // 创建 Fastify 应用
      const app = await buildApp();

      // 启动服务器
      const address = await app.listen({
        port: server.port,
        host: server.host,
      });

      logger.info(`✅ Server listening on ${address}`);

      // 优雅关闭处理
      const gracefulShutdown = async (signal: string) => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);

        try {
          await app.close();
          logger.info('Server closed successfully');
          process.exit(0);
        } catch (err) {
          logger.error(err as Error, 'Error during shutdown');
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      // 未处理异常处理
      process.on('uncaughtException', err => {
        logger.fatal(err, 'Uncaught exception');
        process.exit(1);
      });

      process.on('unhandledRejection', reason => {
        logger.fatal({ reason }, 'Unhandled rejection');
        process.exit(1);
      });

      // 开发环境：每秒记录一次系统状态
      if (server.nodeEnv === 'development') {
        const systemLogger = loggers.system;
        setInterval(() => {
          const usage = process.memoryUsage();
          systemLogger.debug(
            {
              memory: {
                rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
              },
              uptime: `${Math.round(process.uptime())}s`,
            },
            'System status'
          );
        }, 30000); // 每 30 秒
      }
    } catch (err) {
      logger.fatal(err as Error, 'Failed to start server');
      process.exit(1);
    }
  }
}

// CLI 入口
const isMainModule =
  import.meta.url.endsWith(process.argv[1] || '') ||
  import.meta.url === `file://${process.argv[1] || ''}` ||
  process.argv[1]?.endsWith('index.js');

if (isMainModule) {
  const fabric = new AgentFabric({
    name: 'agent-fabric',
    version: VERSION,
    description: 'AI Agent Framework',
  });

  fabric.start().catch(err => {
    logger.error(err, 'Failed to start AgentFabric');
    process.exit(1);
  });
}
