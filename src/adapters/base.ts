/**
 * Agent Adapter 基础实现
 * 提供 Adapter 的抽象基类，实现通用功能
 *
 * @module adapters/base
 * @description 所有具体 Adapter 的基类，提供状态管理、事件系统、重试机制等
 */

import {
  type AgentAdapter,
  type AgentRequest,
  type AgentResponse,
  type StreamResponse,
  type AdapterConfig,
  type AdapterStatus,
  type HealthCheckResult,
  type AdapterEvent,
  type AdapterEventType,
  type AdapterEventListener,
  type AdapterError,
  type AdapterErrorCode,
  generateId,
} from './types.js';

/**
 * 抽象基类 - Agent Adapter
 *
 * 提供以下通用功能：
 * - 状态管理（connected/disconnected/connecting/error）
 * - 事件系统（支持事件监听和触发）
 * - 请求生命周期管理
 * - 基础健康检查框架
 *
 * @abstract
 * @example
 * ```typescript
 * class MyHttpAdapter extends BaseAdapter {
 *   protected async doConnect(): Promise<void> {
 *     // 实现连接逻辑
 *   }
 *
 *   protected async doInvoke(request: AgentRequest): Promise<AgentResponse> {
 *     // 实现调用逻辑
 *   }
 *
 *   // ... 其他抽象方法
 * }
 * ```
 */
export abstract class BaseAdapter implements AgentAdapter {
  /** 适配器配置 */
  readonly config: AdapterConfig;

  /** 适配器唯一 ID */
  readonly id: string;

  /** 当前状态 */
  protected _status: AdapterStatus = 'disconnected';

  /** 最后健康检查时间 */
  protected lastHealthCheck = 0;

  /** 最后健康检查结果 */
  protected lastHealthResult: HealthCheckResult | null = null;

  /** 事件监听器映射 */
  private eventListeners: Map<AdapterEventType, Set<AdapterEventListener>> = new Map();

  /** 全局监听器（监听所有事件） */
  private globalListeners: Set<AdapterEventListener> = new Set();

  /**
   * 构造函数
   * @param config - 适配器配置
   * @param id - 可选的适配器 ID，不提供则自动生成
   */
  constructor(config: AdapterConfig, id?: string) {
    this.config = {
      timeout: 30000,
      retryCount: 3,
      enableStreaming: true,
      ...config,
    };
    this.id = id || generateId();
  }

  /**
   * 获取当前状态
   */
  get status(): AdapterStatus {
    return this._status;
  }

  /**
   * 检查是否已连接
   */
  get isConnected(): boolean {
    return this._status === 'connected';
  }

  /**
   * 检查是否正在连接
   */
  get isConnecting(): boolean {
    return this._status === 'connecting';
  }

  /**
   * 检查是否支持流式输出
   * 子类可以重写此方法
   */
  get supportsStreaming(): boolean {
    return this.config.enableStreaming ?? true;
  }

  // ===========================================================================
  // 连接管理
  // ===========================================================================

  /**
   * 建立连接
   * 实现状态管理和事件触发，具体连接逻辑由子类实现
   */
  async connect(): Promise<void> {
    if (this._status === 'connected') {
      console.log(`[Adapter:${this.id}] 已经连接`);
      return;
    }

    if (this._status === 'connecting') {
      throw this.createError('CONNECTION_ERROR', '连接正在进行中');
    }

    this._status = 'connecting';
    this.emit('connected', { status: 'connecting' });

    try {
      await this.doConnect();
      this._status = 'connected';
      this.emit('connected', { status: 'connected' });
    } catch (error) {
      this._status = 'error';
      const adapterError = this.normalizeError(error, 'CONNECTION_ERROR');
      this.emit('error', { error: adapterError }, adapterError);
      throw adapterError;
    }
  }

  /**
   * 断开连接
   * 实现状态管理和事件触发，具体断开逻辑由子类实现
   */
  async disconnect(): Promise<void> {
    if (this._status === 'disconnected') {
      return;
    }

    try {
      await this.doDisconnect();
    } catch (error) {
      console.error(`[Adapter:${this.id}] 断开连接时出错:`, error);
    } finally {
      this._status = 'disconnected';
      this.emit('disconnected', { status: 'disconnected' });
    }
  }

  /**
   * 抽象方法：执行实际连接
   * 子类必须实现此方法
   * @abstract
   */
  protected abstract doConnect(): Promise<void>;

  /**
   * 抽象方法：执行实际断开
   * 子类必须实现此方法
   * @abstract
   */
  protected abstract doDisconnect(): Promise<void>;

  // ===========================================================================
  // 调用方法
  // ===========================================================================

  /**
   * 执行非流式调用
   * 提供请求生命周期管理和错误处理
   */
  async invoke(request: AgentRequest): Promise<AgentResponse> {
    this.ensureConnected();

    const startTime = Date.now();
    const requestId = request.id || generateId();

    this.emit('request_start', { requestId, request });

    try {
      const response = await this.executeWithTimeout(
        () => this.doInvoke({ ...request, id: requestId }),
        this.config.timeout
      );

      const responseWithMetadata: AgentResponse = {
        ...response,
        metadata: {
          ...response.metadata,
          responseTime: Date.now() - startTime,
          createdAt: Date.now(),
        },
      };

      this.emit('request_end', { requestId, response: responseWithMetadata });
      return responseWithMetadata;
    } catch (error) {
      const adapterError = this.normalizeError(error, 'INTERNAL_ERROR');
      this.emit('request_end', { requestId, error: adapterError }, adapterError);
      throw adapterError;
    }
  }

  /**
   * 执行流式调用
   * 提供流生命周期管理和错误处理
   */
  async *stream(request: AgentRequest): StreamResponse {
    if (!this.supportsStreaming) {
      throw this.createError('NOT_SUPPORTED', '此适配器不支持流式输出');
    }

    this.ensureConnected();

    const startTime = Date.now();
    const requestId = request.id || generateId();

    this.emit('stream_start', { requestId, request });

    try {
      const stream = this.doStream({ ...request, id: requestId });
      for await (const event of stream) {
        yield event;
      }

      this.emit('stream_end', {
        requestId,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      const adapterError = this.normalizeError(error, 'STREAM_ERROR');
      this.emit('stream_end', { requestId, error: adapterError }, adapterError);
      throw adapterError;
    }
  }

  /**
   * 抽象方法：执行实际非流式调用
   * 子类必须实现此方法
   * @abstract
   */
  protected abstract doInvoke(request: AgentRequest): Promise<AgentResponse>;

  /**
   * 抽象方法：执行实际流式调用
   * 子类必须实现此方法
   * @abstract
   */
  protected abstract doStream(request: AgentRequest): StreamResponse;

  // ===========================================================================
  // 健康检查
  // ===========================================================================

  /**
   * 执行健康检查
   * 提供缓存机制，避免频繁检查
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const now = Date.now();
    const cacheDuration = 5000; // 5 秒内使用缓存结果

    // 使用缓存结果（如果足够新鲜）
    if (this.lastHealthResult && now - this.lastHealthCheck < cacheDuration) {
      return this.lastHealthResult;
    }

    const startTime = Date.now();

    try {
      const result = await this.doHealthCheck();
      this.lastHealthResult = result;
      this.lastHealthCheck = now;
      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        healthy: false,
        status: 'error',
        latency: Date.now() - startTime,
        message: `健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: now,
      };
      this.lastHealthResult = result;
      this.lastHealthCheck = now;
      return result;
    }
  }

  /**
   * 抽象方法：执行实际健康检查
   * 子类必须实现此方法
   * @abstract
   */
  protected abstract doHealthCheck(): Promise<HealthCheckResult>;

  // ===========================================================================
  // 事件系统
  // ===========================================================================

  /**
   * 添加事件监听器
   * @param event - 事件类型或 'all' 监听所有事件
   * @param listener - 监听器函数
   */
  on(event: AdapterEventType | 'all', listener: AdapterEventListener): void {
    if (event === 'all') {
      this.globalListeners.add(listener);
    } else {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, new Set());
      }
      this.eventListeners.get(event)!.add(listener);
    }
  }

  /**
   * 移除事件监听器
   * @param event - 事件类型或 'all'
   * @param listener - 监听器函数
   */
  off(event: AdapterEventType | 'all', listener: AdapterEventListener): void {
    if (event === 'all') {
      this.globalListeners.delete(listener);
    } else {
      this.eventListeners.get(event)?.delete(listener);
    }
  }

  /**
   * 添加一次性事件监听器
   * @param event - 事件类型
   * @param listener - 监听器函数
   */
  once(event: AdapterEventType, listener: AdapterEventListener): void {
    const onceWrapper: AdapterEventListener = e => {
      this.off(event, onceWrapper);
      return listener(e);
    };
    this.on(event, onceWrapper);
  }

  /**
   * 触发事件
   * @param type - 事件类型
   * @param data - 事件数据
   * @param error - 错误信息（如果有）
   */
  protected emit(type: AdapterEventType, data?: unknown, error?: AdapterError): void {
    const event: AdapterEvent = {
      type,
      adapterId: this.id,
      timestamp: Date.now(),
      data,
      error,
    };

    // 触发特定事件监听器
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      Array.from(listeners).forEach(listener => {
        try {
          void listener(event);
        } catch (err) {
          console.error(`[Adapter:${this.id}] 事件监听器出错:`, err);
        }
      });
    }

    // 触发全局监听器
    Array.from(this.globalListeners).forEach(listener => {
      try {
        void listener(event);
      } catch (err) {
        console.error(`[Adapter:${this.id}] 全局事件监听器出错:`, err);
      }
    });
  }

  // ===========================================================================
  // 工具方法
  // ===========================================================================

  /**
   * 确保适配器已连接
   * @throws {AdapterError} 未连接时抛出错误
   */
  protected ensureConnected(): void {
    if (this._status !== 'connected') {
      throw this.createError('CONNECTION_ERROR', '适配器未连接，请先调用 connect()');
    }
  }

  /**
   * 执行带超时的操作
   * @param operation - 异步操作
   * @param timeoutMs - 超时时间（毫秒）
   */
  protected async executeWithTimeout<T>(
    operation: () => Promise<T> | T,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs ?? this.config.timeout ?? 30000;

    if (timeout <= 0) {
      return Promise.resolve(operation());
    }

    return Promise.race([
      Promise.resolve(operation()),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(this.createError('TIMEOUT_ERROR', `操作超时（${timeout}ms）`));
        }, timeout);
      }),
    ]);
  }

  /**
   * 创建适配器错误
   * @param code - 错误码
   * @param message - 错误消息
   * @param cause - 原始错误
   */
  protected createError(code: AdapterErrorCode, message: string, cause?: Error): AdapterError {
    return {
      code,
      message,
      cause,
      retryable: this.isRetryableError(code),
    };
  }

  /**
   * 标准化错误为 AdapterError
   * @param error - 原始错误
   * @param defaultCode - 默认错误码
   */
  protected normalizeError(error: unknown, defaultCode: AdapterErrorCode): AdapterError {
    if (error && typeof error === 'object' && 'code' in error) {
      return error as AdapterError;
    }

    const message = error instanceof Error ? error.message : String(error);
    return this.createError(defaultCode, message, error instanceof Error ? error : undefined);
  }

  /**
   * 判断错误是否可重试
   * @param code - 错误码
   */
  protected isRetryableError(code: AdapterErrorCode): boolean {
    const retryableCodes: AdapterErrorCode[] = [
      'CONNECTION_ERROR',
      'TIMEOUT_ERROR',
      'RATE_LIMIT_ERROR',
      'INTERNAL_ERROR',
    ];
    return retryableCodes.includes(code);
  }

  /**
   * 延迟函数
   * @param ms - 延迟毫秒数
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带重试的执行
   * @param operation - 异步操作
   * @param maxRetries - 最大重试次数
   */
  protected async retry<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T> {
    const retries = maxRetries ?? this.config.retryCount ?? 3;
    let lastError: Error | undefined;

    for (let i = 0; i <= retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (i < retries) {
          const delayMs = Math.min(1000 * Math.pow(2, i), 10000);
          console.log(`[Adapter:${this.id}] 第 ${i + 1} 次重试，延迟 ${delayMs}ms`);
          await this.delay(delayMs);
        }
      }
    }

    throw lastError;
  }
}

/**
 * 适配器工厂函数类型
 */
export type AdapterFactory<TConfig extends AdapterConfig> = (config: TConfig) => BaseAdapter;

/**
 * 适配器注册表
 * 用于管理适配器类型的注册和创建
 */
export class AdapterRegistry {
  private factories: Map<string, AdapterFactory<AdapterConfig>> = new Map();

  /**
   * 注册适配器工厂
   * @param type - 适配器类型
   * @param factory - 工厂函数
   */
  register<TConfig extends AdapterConfig>(
    type: TConfig['type'],
    factory: AdapterFactory<TConfig>
  ): void {
    this.factories.set(type, factory as AdapterFactory<AdapterConfig>);
  }

  /**
   * 创建适配器实例
   * @param config - 适配器配置
   */
  create(config: AdapterConfig): BaseAdapter {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`未知的适配器类型: ${config.type}`);
    }
    return factory(config);
  }

  /**
   * 检查是否支持某类型
   * @param type - 适配器类型
   */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * 获取支持的类型列表
   */
  getTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}

// 全局适配器注册表实例
export const adapterRegistry = new AdapterRegistry();

export default BaseAdapter;
