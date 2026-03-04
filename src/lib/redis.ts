/**
 * Redis Client 封装
 * 提供 Redis 连接管理、基础操作和健康检查功能
 */
import { Redis, RedisOptions } from 'ioredis';

// Redis 连接配置
export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  enableAutoPipelining?: boolean;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  lazyConnect?: boolean;
}

// 连接状态
export interface ConnectionStatus {
  connected: boolean;
  ready: boolean;
  reconnecting: boolean;
  options: RedisOptions;
}

/**
 * Redis Client 封装类
 * 支持连接池、自动重连、健康检查
 */
export class RedisClient {
  private client: Redis | null = null;
  private config: RedisConfig;
  private isConnecting = false;

  constructor(config: RedisConfig = {}) {
    this.config = {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      enableAutoPipelining: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      lazyConnect: true,
      ...config,
    };
  }

  /**
   * 获取 Redis 连接配置
   */
  private getRedisOptions(): RedisOptions {
    const baseOptions: RedisOptions = {
      enableAutoPipelining: this.config.enableAutoPipelining,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      connectTimeout: this.config.connectTimeout,
      lazyConnect: this.config.lazyConnect,
      retryStrategy: (times: number) => {
        // 重连策略：指数退避，最大延迟 3000ms
        const delay = Math.min(times * 50, 3000);
        console.log(`[Redis] 第 ${times} 次重连，延迟 ${delay}ms`);
        return delay;
      },
      reconnectOnError: err => {
        // 遇到以下错误时触发重连
        const targetErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
        const shouldReconnect = targetErrors.some(e => err.message.includes(e));
        if (shouldReconnect) {
          console.log(`[Redis] 连接错误，触发重连: ${err.message}`);
          return true;
        }
        return false;
      },
    };

    // 优先使用 URL 连接
    if (this.config.url) {
      return {
        ...baseOptions,
        lazyConnect: true,
      };
    }

    // 使用单独配置连接
    return {
      ...baseOptions,
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      lazyConnect: true,
    };
  }

  /**
   * 建立 Redis 连接
   */
  async connect(): Promise<Redis> {
    if (this.client?.status === 'ready') {
      return this.client;
    }

    if (this.isConnecting) {
      throw new Error('[Redis] 连接正在进行中');
    }

    this.isConnecting = true;

    try {
      const options = this.getRedisOptions();

      if (this.config.url) {
        this.client = new Redis(this.config.url, options);
      } else {
        this.client = new Redis(options);
      }

      // 设置事件监听
      this.setupEventListeners();

      // 主动连接
      await this.client.connect();

      console.log('[Redis] 连接成功');
      return this.client;
    } catch (error) {
      console.error('[Redis] 连接失败:', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * 设置 Redis 事件监听
   */
  private setupEventListeners(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('[Redis] 已连接到服务器');
    });

    this.client.on('ready', () => {
      console.log('[Redis] 连接已就绪');
    });

    this.client.on('error', err => {
      console.error('[Redis] 错误:', err.message);
    });

    this.client.on('close', () => {
      console.log('[Redis] 连接已关闭');
    });

    this.client.on('reconnecting', () => {
      console.log('[Redis] 正在重新连接...');
    });

    this.client.on('end', () => {
      console.log('[Redis] 连接已结束');
    });
  }

  /**
   * 获取 Redis 实例
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('[Redis] 客户端未初始化，请先调用 connect()');
    }
    return this.client;
  }

  /**
   * 获取原生 Redis 实例（用于 pipeline 等高级操作）
   */
  get redisClient(): Redis | null {
    return this.client;
  }

  /**
   * 获取键值
   */
  async get(key: string): Promise<string | null> {
    const client = await this.connect();
    return client.get(key);
  }

  /**
   * 设置键值
   */
  async set(key: string, value: string, ttl?: number): Promise<'OK' | null> {
    const client = await this.connect();
    if (ttl && ttl > 0) {
      return client.set(key, value, 'EX', ttl);
    }
    return client.set(key, value);
  }

  /**
   * 删除键
   */
  async del(key: string): Promise<number> {
    const client = await this.connect();
    return client.del(key);
  }

  /**
   * 设置过期时间（秒）
   */
  async expire(key: string, seconds: number): Promise<number> {
    const client = await this.connect();
    return client.expire(key, seconds);
  }

  /**
   * 获取过期时间（秒）
   */
  async ttl(key: string): Promise<number> {
    const client = await this.connect();
    return client.ttl(key);
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<number> {
    const client = await this.connect();
    return client.exists(key);
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; message: string }> {
    const startTime = Date.now();

    try {
      const client = await this.connect();
      const pong = await client.ping();
      const latency = Date.now() - startTime;

      if (pong === 'PONG') {
        return {
          healthy: true,
          latency,
          message: `Redis 连接正常，延迟 ${latency}ms`,
        };
      }

      return {
        healthy: false,
        latency,
        message: `Redis 响应异常: ${pong}`,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        healthy: false,
        latency,
        message: `Redis 健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): ConnectionStatus {
    if (!this.client) {
      return {
        connected: false,
        ready: false,
        reconnecting: false,
        options: this.getRedisOptions(),
      };
    }

    return {
      connected: this.client.status === 'ready' || this.client.status === 'connect',
      ready: this.client.status === 'ready',
      reconnecting: this.client.status === 'reconnecting',
      options: this.getRedisOptions(),
    };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log('[Redis] 已断开连接');
    }
  }

  /**
   * 强制关闭连接
   */
  async forceDisconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      console.log('[Redis] 已强制断开连接');
    }
  }
}

// 单例实例
let globalRedisClient: RedisClient | null = null;

/**
 * 获取全局 Redis 客户端实例
 */
export function getRedisClient(config?: RedisConfig): RedisClient {
  if (!globalRedisClient) {
    globalRedisClient = new RedisClient(config);
  }
  return globalRedisClient;
}

/**
 * 重置全局 Redis 客户端实例
 */
export function resetRedisClient(): void {
  globalRedisClient = null;
}

export default RedisClient;
