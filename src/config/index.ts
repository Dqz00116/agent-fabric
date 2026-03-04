/**
 * 配置管理系统
 * 实现环境变量加载、验证和热重载
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync, watchFile, unwatchFile } from 'fs';
import { resolve } from 'path';
import { appConfigSchema, type AppConfig } from './schema.js';

/**
 * 配置加载错误
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly details: string[]
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 全局配置实例
 */
let currentConfig: AppConfig | null = null;

/**
 * 配置监听器列表
 */
const configListeners: Array<(config: AppConfig) => void> = [];

/**
 * 配置文件监控状态
 */
let isWatching = false;

/**
 * 加载环境变量
 * 生产环境禁止使用.env文件
 */
function loadEnv(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const envPath = resolve(process.cwd(), '.env');

  // 生产环境检查
  if (nodeEnv === 'production') {
    if (existsSync(envPath)) {
      // eslint-disable-next-line no-console
      console.warn(
        '\x1b[33m[Config Warning] 生产环境禁止使用 .env 文件，请使用环境变量或 Secrets 管理\x1b[0m'
      );
    }
    // 生产环境不从.env文件加载，只使用系统环境变量
    return;
  }

  // 开发/测试环境加载.env文件
  if (existsSync(envPath)) {
    const result = dotenvConfig({ path: envPath });
    if (result.error) {
      throw new Error(`加载 .env 文件失败: ${result.error.message}`);
    }
  }
}

/**
 * 将环境变量映射到配置对象
 */
function mapEnvToConfig(): Record<string, unknown> {
  return {
    server: {
      port: process.env.SERVER_PORT,
      host: process.env.SERVER_HOST,
      nodeEnv: process.env.NODE_ENV,
    },
    database: {
      url: process.env.DATABASE_URL,
      logging: process.env.DATABASE_LOGGING,
      poolSize: process.env.DATABASE_POOL_SIZE,
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB,
      tls: process.env.REDIS_TLS,
    },
    log: {
      level: process.env.LOG_LEVEL,
      file: process.env.LOG_FILE,
      filePath: process.env.LOG_FILE_PATH,
      colorize: process.env.LOG_COLORIZE,
    },
    security: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      bcryptRounds: process.env.BCRYPT_ROUNDS,
      corsOrigin: process.env.CORS_ORIGIN,
      helmet: process.env.SECURITY_HELMET,
    },
  };
}

/**
 * 验证配置
 */
function validateConfig(rawConfig: Record<string, unknown>): AppConfig {
  const result = appConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const issues = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigValidationError('配置验证失败', issues);
  }

  return result.data;
}

/**
 * 加载并验证配置
 */
function loadConfigInternal(): AppConfig {
  // 加载环境变量
  loadEnv();

  // 映射并验证配置
  const rawConfig = mapEnvToConfig();
  return validateConfig(rawConfig);
}

/**
 * 格式化配置错误信息
 */
function formatConfigErrors(errors: string[]): string {
  const lines = ['配置加载失败，请检查以下错误:', ''];
  errors.forEach((error, index) => {
    lines.push(`  ${index + 1}. ${error}`);
  });
  lines.push('');
  lines.push('提示: 复制 .env.example 到 .env 并根据需要修改配置');
  return lines.join('\n');
}

/**
 * 初始化配置
 * 失败时会抛出错误并显示详细的错误信息
 */
export function loadConfig(): AppConfig {
  try {
    currentConfig = loadConfigInternal();
    return currentConfig;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(formatConfigErrors(error.details));
      process.exit(1);
    }
    throw error;
  }
}

/**
 * 获取当前配置
 * 如果配置未加载，会自动加载
 */
export function getConfig(): AppConfig {
  if (!currentConfig) {
    return loadConfig();
  }
  return currentConfig;
}

/**
 * 重新加载配置
 * 用于热重载场景
 */
export function reloadConfig(): AppConfig {
  currentConfig = null;
  const newConfig = loadConfig();

  // 通知所有监听器
  configListeners.forEach(listener => {
    try {
      listener(newConfig);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Config] 配置监听器执行失败:', error);
    }
  });

  return newConfig;
}

/**
 * 添加配置变更监听器
 * @param listener 配置变更回调函数
 * @returns 取消监听的函数
 */
export function onConfigChange(listener: (config: AppConfig) => void): () => void {
  configListeners.push(listener);

  // 返回取消监听的函数
  return () => {
    const index = configListeners.indexOf(listener);
    if (index > -1) {
      configListeners.splice(index, 1);
    }
  };
}

/**
 * 启用配置文件热重载（仅开发环境）
 * 监控 .env 文件变化，自动重新加载配置
 */
export function enableHotReload(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // 只在开发环境启用热重载
  if (nodeEnv !== 'development') {
    // eslint-disable-next-line no-console
    console.log('[Config] 热重载仅在开发环境可用');
    return;
  }

  if (isWatching) {
    return; // 已经启用
  }

  const envPath = resolve(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    // eslint-disable-next-line no-console
    console.warn('[Config] 未找到 .env 文件，热重载未启用');
    return;
  }

  // 监听 .env 文件变化
  watchFile(envPath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      // eslint-disable-next-line no-console
      console.log('[Config] 检测到配置文件变更，正在重新加载...');
      try {
        reloadConfig();
        // eslint-disable-next-line no-console
        console.log('[Config] 配置重载成功');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Config] 配置重载失败:', error);
      }
    }
  });

  isWatching = true;
  // eslint-disable-next-line no-console
  console.log('[Config] 配置热重载已启用');
}

/**
 * 禁用配置文件热重载
 */
export function disableHotReload(): void {
  if (!isWatching) {
    return;
  }

  const envPath = resolve(process.cwd(), '.env');
  unwatchFile(envPath);
  isWatching = false;

  // eslint-disable-next-line no-console
  console.log('[Config] 配置热重载已禁用');
}

/**
 * 检查配置热重载是否已启用
 */
export function isHotReloadEnabled(): boolean {
  return isWatching;
}

// 默认导出
export { appConfigSchema };
export type { AppConfig } from './schema.js';
export default {
  load: loadConfig,
  get: getConfig,
  reload: reloadConfig,
  onChange: onConfigChange,
  enableHotReload,
  disableHotReload,
  isHotReloadEnabled,
};
