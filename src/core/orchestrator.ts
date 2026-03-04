/**
 * 编排器 (Orchestrator) 核心实现
 * 负责请求路由、Agent 选择和执行管理
 *
 * @module core/orchestrator
 * @description 提供完整的请求编排和执行生命周期管理
 */

import type { AgentRegistry } from '../services/agent-registry.js';
import type { AgentAdapter, AgentRequest, AgentResponse, StreamEvent } from '../adapters/types.js';
import { adapterRegistry } from '../adapters/base.js';
import { Router, type RouteRequest, type RouteResult } from './router.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 编排请求
 */
export interface OrchestratorRequest {
  /** 命名空间 */
  namespace: string;
  /** Agent 名称 */
  agentName: string;
  /** 用户输入 */
  input: string;
  /** 是否流式输出 */
  stream?: boolean;
  /** 会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 请求参数 */
  parameters?: Record<string, unknown>;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 编排结果
 */
export interface OrchestratorResult {
  /** 是否成功 */
  success: boolean;
  /** 响应（非流式） */
  response?: AgentResponse;
  /** 流式响应（流式） */
  stream?: AsyncIterableIterator<StreamEvent>;
  /** 错误信息 */
  error?: string;
  /** 错误码 */
  errorCode?: OrchestratorErrorCode;
  /** 执行元数据 */
  executionMetadata?: ExecutionMetadata;
}

/**
 * 执行元数据
 */
export interface ExecutionMetadata {
  /** 请求 ID */
  requestId: string;
  /** Agent ID */
  agentId: string;
  /** 命名空间 ID */
  namespaceId: string;
  /** 适配器类型 */
  adapterType: string;
  /** 总执行时间（毫秒） */
  totalTime: number;
  /** 路由时间（毫秒） */
  routingTime?: number;
  /** 执行状态 */
  status: ExecutionStatus;
  /** 开始时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt?: number;
}

/**
 * 执行状态
 */
export type ExecutionStatus = 
  | 'routing'
  | 'connecting'
  | 'executing'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * 编排器错误码
 */
export type OrchestratorErrorCode =
  | 'ROUTE_FAILED'
  | 'ADAPTER_NOT_FOUND'
  | 'ADAPTER_CREATE_FAILED'
  | 'ADAPTER_CONNECT_FAILED'
  | 'EXECUTION_FAILED'
  | 'STREAM_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'INTERNAL_ERROR';

/**
 * 执行上下文
 */
export interface ExecutionContext {
  /** 请求 ID */
  requestId: string;
  /** 取消信号 */
  abortController: AbortController;
  /** 开始时间 */
  startTime: number;
  /** 当前状态 */
  status: ExecutionStatus;
}

/**
 * 编排器配置
 */
export interface OrchestratorConfig {
  /** 默认超时时间（毫秒） */
  defaultTimeout: number;
  /** 是否自动连接 Adapter */
  autoConnect: boolean;
  /** 是否启用请求追踪 */
  enableTracing: boolean;
  /** 最大并发请求数 */
  maxConcurrentRequests: number;
}

// =============================================================================
// 编排错误类
// =============================================================================

/**
 * 编排错误
 */
export class OrchestratorError extends Error {
  readonly code: OrchestratorErrorCode;
  readonly requestId?: string;
  readonly cause?: Error;

  constructor(
    code: OrchestratorErrorCode,
    message: string,
    requestId?: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'OrchestratorError';
    this.code = code;
    this.requestId = requestId;
    this.cause = cause;
  }
}

// =============================================================================
// Orchestrator 类
// =============================================================================

/**
 * 编排器类
 * 负责请求的完整生命周期管理
 */
export class Orchestrator {
  /** Agent Registry */
  private registry: AgentRegistry;
  
  /** 路由器 */
  private router: Router;
  
  /** 配置 */
  private config: OrchestratorConfig;
  
  /** 执行上下文映射 */
  private executions = new Map<string, ExecutionContext>();
  
  /** 活跃请求计数 */
  private activeRequests = 0;
  
  /** 是否已初始化 */
  private initialized = false;

  /**
   * 构造函数
   * @param registry - Agent Registry 实例
   * @param config - 可选配置
   */
  constructor(
    registry: AgentRegistry,
    config?: Partial<OrchestratorConfig>
  ) {
    this.registry = registry;
    this.router = new Router(registry);
    this.config = {
      defaultTimeout: 30000,
      autoConnect: true,
      enableTracing: true,
      maxConcurrentRequests: 100,
      ...config,
    };
  }

  /**
   * 初始化编排器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[Orchestrator] 初始化...');
    
    // 确保 Registry 已初始化
    await this.registry.initialize();
    
    this.initialized = true;
    logger.info('[Orchestrator] 初始化完成');
  }

  /**
   * 关闭编排器
   */
  async shutdown(): Promise<void> {
    logger.info('[Orchestrator] 关闭中...');
    
    // 取消所有活跃请求
    for (const [requestId, context] of this.executions) {
      logger.warn(`[Orchestrator] 取消活跃请求: ${requestId}`);
      context.abortController.abort();
    }
    
    this.executions.clear();
    this.activeRequests = 0;
    this.initialized = false;
    
    logger.info('[Orchestrator] 已关闭');
  }

  /**
   * 执行请求（非流式）
   * @param request - 编排请求
   * @returns 编排结果
   */
  async execute(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      await this.ensureInitialized();
      
      // 检查并发限制
      if (this.activeRequests >= this.config.maxConcurrentRequests) {
        throw new OrchestratorError(
          'INTERNAL_ERROR',
          'Too many concurrent requests',
          requestId
        );
      }

      this.activeRequests++;
      
      // 创建执行上下文
      const context = this.createExecutionContext(requestId);
      this.executions.set(requestId, context);

      // 1. 路由阶段
      context.status = 'routing';
      const routeResult = await this.routeRequest(request, requestId);
      
      if (!routeResult.success || !routeResult.target) {
        throw new OrchestratorError(
          'ROUTE_FAILED',
          routeResult.error || 'Routing failed',
          requestId
        );
      }

      const { target } = routeResult;

      // 2. 获取或创建 Adapter
      context.status = 'connecting';
      const adapter = await this.getOrCreateAdapter(target.agentId);

      // 3. 连接 Adapter（如果需要）
      if (this.config.autoConnect && !adapter.isConnected) {
        await adapter.connect();
      }

      // 4. 执行请求
      context.status = 'executing';
      const agentRequest = this.buildAgentRequest(request, requestId);
      
      const response = await this.executeWithTimeout(
        () => adapter.invoke(agentRequest),
        this.config.defaultTimeout,
        requestId
      );

      // 5. 完成
      context.status = 'completed';
      const totalTime = Date.now() - startTime;

      const result: OrchestratorResult = {
        success: true,
        response,
        executionMetadata: {
          requestId,
          agentId: target.agentId,
          namespaceId: target.namespaceId,
          adapterType: target.adapterType,
          totalTime,
          routingTime: routeResult.routingTime,
          status: 'completed',
          startedAt: startTime,
          endedAt: Date.now(),
        },
      };

      logger.info(`[Orchestrator] 请求执行成功: ${requestId} (${totalTime}ms)`);
      
      return result;
    } catch (error) {
      const errorResult = this.handleExecutionError(error, requestId, startTime);
      return errorResult;
    } finally {
      this.cleanupExecution(requestId);
      this.activeRequests--;
    }
  }

  /**
   * 执行流式请求
   * @param request - 编排请求
   * @returns 流式编排结果
   */
  async executeStream(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      await this.ensureInitialized();
      
      if (this.activeRequests >= this.config.maxConcurrentRequests) {
        throw new OrchestratorError(
          'INTERNAL_ERROR',
          'Too many concurrent requests',
          requestId
        );
      }

      this.activeRequests++;
      
      // 创建执行上下文
      const context = this.createExecutionContext(requestId);
      this.executions.set(requestId, context);

      // 1. 路由
      context.status = 'routing';
      const routeResult = await this.routeRequest(request, requestId);
      
      if (!routeResult.success || !routeResult.target) {
        throw new OrchestratorError(
          'ROUTE_FAILED',
          routeResult.error || 'Routing failed',
          requestId
        );
      }

      const { target } = routeResult;

      // 2. 获取 Adapter
      context.status = 'connecting';
      const adapter = await this.getOrCreateAdapter(target.agentId);

      // 3. 连接
      if (this.config.autoConnect && !adapter.isConnected) {
        await adapter.connect();
      }

      // 4. 检查是否支持流式
      if (!adapter.supportsStreaming) {
        throw new OrchestratorError(
          'STREAM_ERROR',
          'Adapter does not support streaming',
          requestId
        );
      }

      // 5. 开始流式执行
      context.status = 'streaming';
      const agentRequest = this.buildAgentRequest(request, requestId);
      
      // 创建流式响应包装器
      const stream = this.createStreamWrapper(
        adapter.stream!(agentRequest),
        requestId,
        target,
        startTime,
        routeResult.routingTime
      );

      return {
        success: true,
        stream,
        executionMetadata: {
          requestId,
          agentId: target.agentId,
          namespaceId: target.namespaceId,
          adapterType: target.adapterType,
          totalTime: 0, // 流式请求在结束时更新
          routingTime: routeResult.routingTime,
          status: 'streaming',
          startedAt: startTime,
        },
      };
    } catch (error) {
      const errorResult = this.handleExecutionError(error, requestId, startTime);
      return errorResult;
    }
  }

  /**
   * 取消请求
   * @param requestId - 请求 ID
   */
  cancel(requestId: string): boolean {
    const context = this.executions.get(requestId);
    if (!context) {
      return false;
    }

    context.abortController.abort();
    context.status = 'cancelled';
    
    logger.info(`[Orchestrator] 请求已取消: ${requestId}`);
    
    return true;
  }

  /**
   * 获取执行状态
   * @param requestId - 请求 ID
   */
  getExecutionStatus(requestId: string): ExecutionStatus | null {
    return this.executions.get(requestId)?.status || null;
  }

  /**
   * 获取活跃请求数
   */
  getActiveRequestCount(): number {
    return this.activeRequests;
  }

  /**
   * 获取 Router 实例（用于扩展）
   */
  getRouter(): Router {
    return this.router;
  }

  // ===========================================================================
  // 私有方法
  // ===========================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private createExecutionContext(requestId: string): ExecutionContext {
    return {
      requestId,
      abortController: new AbortController(),
      startTime: Date.now(),
      status: 'routing',
    };
  }

  private async routeRequest(
    request: OrchestratorRequest,
    requestId: string
  ): Promise<RouteResult> {
    const routeRequest: RouteRequest = {
      namespace: request.namespace,
      agentName: request.agentName,
      requestId,
    };

    return this.router.route(routeRequest);
  }

  private async getOrCreateAdapter(agentId: string): Promise<AgentAdapter> {
    // 检查是否已有实例
    const existingAdapter = await this.registry.getAdapterInstance(agentId);
    if (existingAdapter) {
      return existingAdapter;
    }

    // 获取 Agent 信息
    const agent = await this.registry.findById(agentId);
    if (!agent) {
      throw new OrchestratorError(
        'ADAPTER_NOT_FOUND',
        `Agent not found: ${agentId}`
      );
    }

    // 创建新 Adapter 实例
    try {
      const adapter = adapterRegistry.create(agent.adapterConfig);
      await this.registry.setAdapterInstance(agentId, adapter);
      return adapter;
    } catch (error) {
      throw new OrchestratorError(
        'ADAPTER_CREATE_FAILED',
        `Failed to create adapter: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  private buildAgentRequest(
    request: OrchestratorRequest,
    requestId: string
  ): AgentRequest {
    return {
      id: requestId,
      input: request.input,
      context: {
        sessionId: request.sessionId,
        userId: request.userId,
        requestId,
        metadata: request.metadata,
      },
      parameters: request.parameters,
      metadata: {
        ...request.metadata,
        orchestratedAt: Date.now(),
      },
    };
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
    requestId: string
  ): Promise<T> {
    const context = this.executions.get(requestId);
    
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new OrchestratorError('TIMEOUT', `Request timeout (${timeout}ms)`, requestId));
        }, timeout);

        // 如果取消，清除定时器
        context?.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new OrchestratorError('CANCELLED', 'Request cancelled', requestId));
        });
      }),
    ]);
  }

  private createStreamWrapper(
    sourceStream: AsyncIterableIterator<StreamEvent>,
    requestId: string,
    target: { agentId: string; namespaceId: string; adapterType: string; agentName: string },
    startTime: number,
    routingTime?: number
  ): AsyncIterableIterator<StreamEvent> {
    const executions = this.executions;
    const cleanup = () => this.cleanupExecution(requestId);
    const decrementActive = () => { this.activeRequests--; };
    
    // 记录路由信息用于调试
    logger.debug(`[Orchestrator] 创建流式包装器: agent=${target.agentName}, routingTime=${routingTime}ms`);

    return {
      [Symbol.asyncIterator](): AsyncIterableIterator<StreamEvent> {
        return this;
      },

      async next(): Promise<IteratorResult<StreamEvent>> {
        try {
          const result = await sourceStream.next();
          
          if (result.done) {
            // 流结束，清理
            const context = executions.get(requestId);
            if (context) {
              context.status = 'completed';
            }
            cleanup();
            decrementActive();
            
            logger.info(`[Orchestrator] 流式请求完成: ${requestId} (${Date.now() - startTime}ms)`);
          }
          
          return result;
        } catch (error) {
          cleanup();
          decrementActive();
          
          logger.error(`[Orchestrator] 流式请求出错: ${requestId}`, error);
          throw error;
        }
      },

      async return(): Promise<IteratorResult<StreamEvent>> {
        cleanup();
        decrementActive();
        return sourceStream.return?.() || { done: true, value: undefined };
      },

      async throw(e: unknown): Promise<IteratorResult<StreamEvent>> {
        cleanup();
        decrementActive();
        return sourceStream.throw?.(e) || { done: true, value: undefined };
      },
    };
  }

  private handleExecutionError(
    error: unknown,
    requestId: string,
    startTime: number
  ): OrchestratorResult {
    let errorCode: OrchestratorErrorCode = 'EXECUTION_FAILED';
    let errorMessage: string;

    if (error instanceof OrchestratorError) {
      errorCode = error.code;
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    logger.error(`[Orchestrator] 请求执行失败: ${requestId}`, error);

    return {
      success: false,
      error: errorMessage,
      errorCode,
      executionMetadata: {
        requestId,
        agentId: '',
        namespaceId: '',
        adapterType: '',
        totalTime: Date.now() - startTime,
        status: 'failed',
        startedAt: startTime,
        endedAt: Date.now(),
      },
    };
  }

  private cleanupExecution(requestId: string): void {
    this.executions.delete(requestId);
  }

  private generateRequestId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建编排器实例
 */
export function createOrchestrator(
  registry: AgentRegistry,
  config?: Partial<OrchestratorConfig>
): Orchestrator {
  return new Orchestrator(registry, config);
}

export default Orchestrator;
