/**
 * 配置验证模式定义
 * 使用 Zod 进行严格的类型验证
 */

import { z } from 'zod';

/**
 * 服务器配置验证模式
 */
export const serverSchema = z.object({
  /** 服务端口 */
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  /** 服务主机 */
  host: z.string().default('0.0.0.0'),
  /** 节点环境 */
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

/**
 * 数据库配置验证模式
 */
export const databaseSchema = z.object({
  /** 数据库连接URL */
  url: z.string().min(1, '数据库连接URL不能为空'),
  /** 是否启用日志 */
  logging: z.coerce.boolean().default(false),
  /** 连接池大小 */
  poolSize: z.coerce.number().int().min(1).default(10),
});

/**
 * Redis配置验证模式
 */
export const redisSchema = z.object({
  /** Redis主机 */
  host: z.string().default('localhost'),
  /** Redis端口 */
  port: z.coerce.number().int().min(1).max(65535).default(6379),
  /** Redis密码（可选） */
  password: z.string().optional(),
  /** Redis数据库索引 */
  db: z.coerce.number().int().min(0).max(15).default(0),
  /** 是否启用TLS */
  tls: z.coerce.boolean().default(false),
});

/**
 * 日志配置验证模式
 */
export const logSchema = z.object({
  /** 日志级别 */
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** 是否输出到文件 */
  file: z.coerce.boolean().default(false),
  /** 日志文件路径 */
  filePath: z.string().optional(),
  /** 是否启用彩色输出 */
  colorize: z.coerce.boolean().default(true),
});

/**
 * 安全配置验证模式
 */
export const securitySchema = z.object({
  /** JWT密钥 */
  jwtSecret: z.string().min(1, 'JWT密钥不能为空'),
  /** JWT过期时间（秒） */
  jwtExpiresIn: z.coerce.number().int().min(60).default(7200),
  /** 密码加盐轮数 */
  bcryptRounds: z.coerce.number().int().min(4).max(31).default(10),
  /** 允许的CORS来源 */
  corsOrigin: z.string().default('*'),
  /** 是否启用Helmet安全头 */
  helmet: z.coerce.boolean().default(true),
});

/**
 * 应用配置验证模式
 */
export const appConfigSchema = z.object({
  server: serverSchema,
  database: databaseSchema,
  redis: redisSchema,
  log: logSchema,
  security: securitySchema,
});

/**
 * 应用配置类型
 */
export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * 服务器配置类型
 */
export type ServerConfig = z.infer<typeof serverSchema>;

/**
 * 数据库配置类型
 */
export type DatabaseConfig = z.infer<typeof databaseSchema>;

/**
 * Redis配置类型
 */
export type RedisConfig = z.infer<typeof redisSchema>;

/**
 * 日志配置类型
 */
export type LogConfig = z.infer<typeof logSchema>;

/**
 * 安全配置类型
 */
export type SecurityConfig = z.infer<typeof securitySchema>;
