#!/usr/bin/env node
/**
 * 日志系统测试脚本
 * 运行: pnpm tsx scripts/test-logger.ts
 */

import { logger, loggers, requestContext } from '../src/lib/logger.js';

console.log('========================================');
console.log('  日志系统功能测试');
console.log('========================================\n');

// 测试 1: 基础日志级别
console.log('--- 测试 1: 基础日志级别 ---');
logger.trace('This is a TRACE level log');
logger.debug('This is a DEBUG level log');
logger.info('This is an INFO level log');
logger.warn('This is a WARN level log');
logger.error(new Error('Test error'), 'This is an ERROR level log');
logger.fatal(new Error('Fatal error'), 'This is a FATAL level log');

// 测试 2: 带上下文的日志
console.log('\n--- 测试 2: 带上下文的日志 ---');
logger.info({
  userId: 'user-123',
  action: 'login',
  ip: '192.168.1.1',
}, 'User logged in');

// 测试 3: 模块分类日志
console.log('\n--- 测试 3: 模块分类日志 ---');
loggers.http.info({ method: 'GET', url: '/api/users', statusCode: 200 }, 'HTTP request');
loggers.db.info({ query: 'SELECT * FROM users', duration: '15ms' }, 'Database query');
loggers.redis.info({ operation: 'GET', key: 'session:123' }, 'Redis operation');
loggers.system.info({ memory: '45MB', uptime: '120s' }, 'System status');

// 测试 4: 请求上下文（requestId）
console.log('\n--- 测试 4: 请求上下文（requestId）---');
const store = new Map<string, unknown>();
store.set('requestId', 'req-test-456');

requestContext.run(store, () => {
  logger.info('This log should have requestId in context');
  logger.info({ userId: '789' }, 'User action with requestId');
});

// 测试 5: 错误日志（包含堆栈）
console.log('\n--- 测试 5: 错误日志 ---');
try {
  throw new Error('Something went wrong!');
} catch (err) {
  logger.error(err as Error, 'Caught an error');
}

// 测试 6: 子日志实例
console.log('\n--- 测试 6: 子日志实例 ---');
const childLogger = logger.child({ requestId: 'child-789', traceId: 'trace-abc' });
childLogger.info('This is from child logger');

// 测试 7: 脱敏测试
console.log('\n--- 测试 7: 敏感信息脱敏 ---');
logger.info({
  user: {
    name: 'John',
    password: 'secret123', // 应该被脱敏
    apiKey: 'key-abc-123', // 应该被脱敏
  },
  headers: {
    authorization: 'Bearer token123', // 应该被脱敏
    'content-type': 'application/json',
  },
}, 'Sensitive data test');

console.log('\n========================================');
console.log('  测试完成！请检查上面的日志输出');
console.log('========================================');
