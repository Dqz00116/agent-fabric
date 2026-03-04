/**
 * 日志系统单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, loggers, requestContext } from '../src/lib/logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
  });

  it('should create a logger with name', () => {
    expect(logger).toBeDefined();
  });

  it('should log info messages', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('Test message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should log with context', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info({ userId: '123' }, 'User action');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should log error with stack trace', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Test error');
    logger.error(error, 'Error occurred');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Loggers', () => {
  it('should have all predefined loggers', () => {
    expect(loggers.app).toBeDefined();
    expect(loggers.http).toBeDefined();
    expect(loggers.db).toBeDefined();
    expect(loggers.redis).toBeDefined();
    expect(loggers.agent).toBeDefined();
    expect(loggers.system).toBeDefined();
  });
});

describe('RequestContext', () => {
  it('should store request context', async () => {
    const store = new Map<string, unknown>();
    store.set('requestId', 'test-123');

    await new Promise<void>((resolve) => {
      requestContext.run(store, () => {
        const context = requestContext.getStore();
        expect(context?.get('requestId')).toBe('test-123');
        resolve();
      });
    });
  });
});
