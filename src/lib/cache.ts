/**
 * Cache 缓存层封装
 * 基于 Redis 提供高级缓存操作功能
 */
import { RedisClient, RedisConfig } from './redis.js';
import type { Redis } from 'ioredis';

// 缓存选项
export interface CacheOptions {
  ttl?: number; // 过期时间（秒）
  tags?: string[]; // 缓存标签
}

// 缓存条目
export interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  tags?: string[];
}

// 缓存统计
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Cache 管理类
 * 提供类型安全的缓存操作、标签管理、批量操作等功能
 */
export class Cache {
  private redis: RedisClient;
  private prefix: string;
  private defaultTTL: number;
  private stats: CacheStats = { hits: 0, misses: 0, hitRate: 0 };

  constructor(
    redisConfig?: RedisConfig,
    options?: {
      prefix?: string;
      defaultTTL?: number;
    }
  ) {
    this.redis = new RedisClient(redisConfig);
    this.prefix = options?.prefix || 'cache:';
    this.defaultTTL = options?.defaultTTL || 3600; // 默认 1 小时
  }

  /**
   * 生成带前缀的键
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * 生成标签键
   */
  private getTagKey(tag: string): string {
    return `${this.prefix}tag:${tag}`;
  }

  /**
   * 建立连接
   */
  async connect(): Promise<void> {
    await this.redis.connect();
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(this.getKey(key));

      if (data === null) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      const entry: CacheEntry<T> = JSON.parse(data);

      // 检查是否过期（双重检查）
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.delete(key);
        this.stats.misses++;
        this.stats.hits--;
        this.updateHitRate();
        return null;
      }

      return entry.value;
    } catch (error) {
      console.error(`[Cache] 获取缓存失败 [${key}]:`, error);
      return null;
    }
  }

  /**
   * 设置缓存值
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl ?? this.defaultTTL;
      const fullKey = this.getKey(key);

      const entry: CacheEntry<T> = {
        value,
        expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
        tags: options?.tags,
      };

      // 存储缓存数据
      await this.redis.set(fullKey, JSON.stringify(entry), ttl);

      // 如果设置了标签，更新标签索引
      if (options?.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          const tagKey = this.getTagKey(tag);
          await this.redis.getClient().sadd(tagKey, fullKey);
          // 设置标签索引的过期时间
          await this.redis.expire(tagKey, Math.max(ttl, 86400)); // 至少保留 1 天
        }
      }
    } catch (error) {
      console.error(`[Cache] 设置缓存失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(key));
    } catch (error) {
      console.error(`[Cache] 删除缓存失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.redis.expire(this.getKey(key), seconds);
    } catch (error) {
      console.error(`[Cache] 设置过期时间失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 检查缓存是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      console.error(`[Cache] 检查缓存存在失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 获取或设置缓存（Cache-Aside 模式）
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, options?: CacheOptions): Promise<T> {
    // 先尝试获取缓存
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，执行工厂函数
    const value = await factory();

    // 存储到缓存
    await this.set(key, value, options);

    return value;
  }

  /**
   * 批量获取缓存
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (keys.length === 0) return [];

      const fullKeys = keys.map(k => this.getKey(k));
      const client = this.redis.getClient();
      const values = await client.mget(...fullKeys);

      return values.map((data: string | null, index: number) => {
        if (data === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;

        try {
          const entry: CacheEntry<T> = JSON.parse(data);

          // 检查是否过期
          if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.delete(keys[index]);
            this.stats.misses++;
            this.stats.hits--;
            return null;
          }

          return entry.value;
        } catch {
          this.stats.misses++;
          this.stats.hits--;
          return null;
        }
      });
    } finally {
      this.updateHitRate();
    }
  }

  /**
   * 获取底层 Redis 客户端
   */
  getRedisClient(): Redis {
    return this.redis.getClient();
  }

  /**
   * 批量设置缓存
   */
  async mset<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
    if (entries.length === 0) return;

    try {
      const client = this.redis.getClient();
      const pipeline = client.pipeline();

      for (const { key, value, options } of entries) {
        const ttl = options?.ttl ?? this.defaultTTL;
        const fullKey = this.getKey(key);

        const entry: CacheEntry<T> = {
          value,
          expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
          tags: options?.tags,
        };

        pipeline.set(fullKey, JSON.stringify(entry), 'EX', ttl);

        // 处理标签
        if (options?.tags && options.tags.length > 0) {
          for (const tag of options.tags) {
            const tagKey = this.getTagKey(tag);
            pipeline.sadd(tagKey, fullKey);
            pipeline.expire(tagKey, Math.max(ttl, 86400));
          }
        }
      }

      await pipeline.exec();
    } catch (error) {
      console.error('[Cache] 批量设置缓存失败:', error);
      throw error;
    }
  }

  /**
   * 根据标签删除缓存
   */
  async deleteByTag(tag: string): Promise<number> {
    try {
      const tagKey = this.getTagKey(tag);
      const client = this.redis.getClient();

      // 获取标签下的所有键
      const keys = await client.smembers(tagKey);

      if (keys.length === 0) return 0;

      // 删除所有缓存
      const pipeline = client.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }

      // 删除标签索引
      pipeline.del(tagKey);

      await pipeline.exec();

      return keys.length;
    } catch (error) {
      console.error(`[Cache] 按标签删除缓存失败 [${tag}]:`, error);
      throw error;
    }
  }

  /**
   * 清空所有缓存（带前缀的）
   */
  async clear(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const pattern = `${this.prefix}*`;
      let cursor = '0';

      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');

      console.log('[Cache] 缓存已清空');
    } catch (error) {
      console.error('[Cache] 清空缓存失败:', error);
      throw error;
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, hitRate: 0 };
  }

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; message: string }> {
    return this.redis.healthCheck();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

// 默认缓存实例
let defaultCache: Cache | null = null;

/**
 * 获取默认缓存实例
 */
export function getCache(config?: RedisConfig): Cache {
  if (!defaultCache) {
    defaultCache = new Cache(config);
  }
  return defaultCache;
}

/**
 * 重置默认缓存实例
 */
export function resetCache(): void {
  defaultCache = null;
}

export default Cache;
