/**
 * 日志系统 - 基于 Pino 的结构化日志
 *
 * 特性：
 * - JSON 格式输出
 * - 包含 requestId、timestamp、level 字段
 * - 错误日志包含堆栈信息
 * - 生产环境日志级别可配置
 * - 异步日志避免阻塞
 * - 敏感信息脱敏
 */

import { pino } from 'pino';
import type { Logger as PinoLogger, LoggerOptions } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

// 存储请求上下文（用于获取 requestId）
export const requestContext = new AsyncLocalStorage<Map<string, unknown>>();

// 日志级别类型
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// 日志配置接口
interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
  redactPaths: string[];
}

// 获取环境变量配置的日志级别
const getDefaultLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL as LogLevel;
  const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  return validLevels.includes(envLevel) ? envLevel : 'info';
};

// 判断是否为开发环境
const isDev = process.env.NODE_ENV !== 'production';

// 默认配置
const defaultConfig: LoggerConfig = {
  level: getDefaultLevel(),
  prettyPrint: isDev,
  redactPaths: [
    'req.headers.authorization',
    'req.headers["x-api-key"]',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    '*.password',
    '*.secret',
    '*.token',
    '*.apiKey',
    '*.api_key',
  ],
};

// 创建 Pino 配置
const createPinoOptions = (config: LoggerConfig): LoggerOptions => {
  const baseOptions: LoggerOptions = {
    level: config.level,
    base: {
      pid: process.pid,
    },
    // 自定义时间戳格式（ISO 8601）
    timestamp: pino.stdTimeFunctions.isoTime,
    // 脱敏配置
    redact: {
      paths: config.redactPaths,
      remove: false, // 不脱敏，而是替换为 [Redacted]
    },
    // 错误序列化器
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    // 格式化选项
    formatters: {
      // 自定义日志级别名称
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
      // 添加 requestId 到日志
      bindings: bindings => {
        const context = requestContext.getStore();
        const requestId = context?.get('requestId');
        return {
          ...bindings,
          ...(requestId ? { requestId } : {}),
        };
      },
    },
  };

  // 开发环境使用 pretty print
  if (config.prettyPrint) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
          ignore: 'pid,hostname',
          messageFormat: '{msg} {req.url}',
        },
      },
    };
  }

  return baseOptions;
};

// 创建根日志实例
const rootLogger = pino(createPinoOptions(defaultConfig));

/**
 * 日志类
 * 封装 Pino 提供更易用的 API
 */
export class Logger {
  private logger: PinoLogger;
  private context?: Record<string, unknown>;

  constructor(name: string, context?: Record<string, unknown>) {
    this.logger = rootLogger.child({ name });
    this.context = context;
  }

  /**
   * 获取带上下文的日志数据
   */
  private enrichData(
    obj: object | string,
    ...args: unknown[]
  ): { msg?: string; [key: string]: unknown } {
    const data: Record<string, unknown> = {};

    // 合并上下文
    if (this.context) {
      Object.assign(data, this.context);
    }

    // 处理参数
    if (typeof obj === 'string') {
      data.msg = obj;
      if (args.length > 0) {
        data.args = args;
      }
    } else {
      Object.assign(data, obj);
    }

    // 获取请求上下文中的 requestId
    const requestContextStore = requestContext.getStore();
    if (requestContextStore) {
      const requestId = requestContextStore.get('requestId');
      if (requestId) {
        data.requestId = requestId;
      }
    }

    return data;
  }

  /**
   * Trace 级别日志
   */
  trace(obj: object, msg?: string, ...args: unknown[]): void;
  trace(msg: string, ...args: unknown[]): void;
  trace(obj: object | string, msg?: string, ...args: unknown[]): void {
    if (typeof obj === 'string') {
      this.logger.trace(this.enrichData(obj, msg, ...args));
    } else {
      this.logger.trace(this.enrichData(obj, msg, ...args));
    }
  }

  /**
   * Debug 级别日志
   */
  debug(obj: object, msg?: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  debug(obj: object | string, msg?: string, ...args: unknown[]): void {
    if (typeof obj === 'string') {
      this.logger.debug(this.enrichData(obj, msg, ...args));
    } else {
      this.logger.debug(this.enrichData(obj, msg, ...args));
    }
  }

  /**
   * Info 级别日志
   */
  info(obj: object, msg?: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  info(obj: object | string, msg?: string, ...args: unknown[]): void {
    if (typeof obj === 'string') {
      this.logger.info(this.enrichData(obj, msg, ...args));
    } else {
      this.logger.info(this.enrichData(obj, msg, ...args));
    }
  }

  /**
   * Warn 级别日志
   */
  warn(obj: object, msg?: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  warn(obj: object | string, msg?: string, ...args: unknown[]): void {
    if (typeof obj === 'string') {
      this.logger.warn(this.enrichData(obj, msg, ...args));
    } else {
      this.logger.warn(this.enrichData(obj, msg, ...args));
    }
  }

  /**
   * Error 级别日志
   * 自动捕获错误堆栈
   */
  error(obj: object, msg?: string, ...args: unknown[]): void;
  error(err: Error, msg?: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  error(obj: Error | object | string, msg?: string, ...args: unknown[]): void {
    const data = this.enrichData({}, msg, ...args);

    if (obj instanceof Error) {
      data.err = obj;
      data.msg = msg || obj.message;
    } else if (typeof obj === 'string') {
      data.msg = obj;
    } else {
      Object.assign(data, obj);
    }

    this.logger.error(data);
  }

  /**
   * Fatal 级别日志
   */
  fatal(obj: object, msg?: string, ...args: unknown[]): void;
  fatal(err: Error, msg?: string, ...args: unknown[]): void;
  fatal(msg: string, ...args: unknown[]): void;
  fatal(obj: Error | object | string, msg?: string, ...args: unknown[]): void {
    const data = this.enrichData({}, msg, ...args);

    if (obj instanceof Error) {
      data.err = obj;
      data.msg = msg || obj.message;
    } else if (typeof obj === 'string') {
      data.msg = obj;
    } else {
      Object.assign(data, obj);
    }

    this.logger.fatal(data);
  }

  /**
   * 创建子日志实例（带额外上下文）
   */
  child(context: Record<string, unknown>): Logger {
    return new Logger((this.logger.bindings()?.name as string) || 'logger', {
      ...this.context,
      ...context,
    });
  }
}

// 导出根日志实例
export { rootLogger };

// 导出默认日志实例（app 主日志）
export const logger = new Logger('app');

// 导出按模块分类的日志实例
export const loggers = {
  app: logger,
  http: new Logger('http'),
  db: new Logger('database'),
  redis: new Logger('redis'),
  agent: new Logger('agent'),
  system: new Logger('system'),
};

// 导出类型
export type { PinoLogger };
