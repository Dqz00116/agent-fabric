/**
 * 请求路由器
 * 负责根据 namespace + agent 名称路由到对应的 Agent
 *
 * @module core/router
 * @description 提供请求路由、Agent 查找和选择策略
 */

import type { RegisteredAgent, AgentRegistry } from '../services/agent-registry.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 路由目标
 */
export interface RouteTarget {
  /** Agent ID */
  agentId: string;
  /** 命名空间 ID */
  namespaceId: string;
  /** Agent 名称 */
  agentName: string;
  /** 适配器类型 */
  adapterType: string;
  /** 路由元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 路由请求
 */
export interface RouteRequest {
  /** 命名空间 */
  namespace: string;
  /** Agent 名称 */
  agentName: string;
  /** 请求 ID（用于追踪） */
  requestId?: string;
  /** 路由策略（可选，默认使用名称匹配） */
  strategy?: RoutingStrategy;
  /** 策略配置 */
  strategyConfig?: Record<string, unknown>;
}

/**
 * 路由结果
 */
export interface RouteResult {
  /** 是否成功 */
  success: boolean;
  /** 路由目标（成功时） */
  target?: RouteTarget;
  /** 错误信息（失败时） */
  error?: string;
  /** 错误码 */
  errorCode?: RouteErrorCode;
  /** 路由耗时（毫秒） */
  routingTime?: number;
}

/**
 * 路由错误码
 */
export type RouteErrorCode =
  | 'NAMESPACE_NOT_FOUND'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_INACTIVE'
  | 'AGENT_UNHEALTHY'
  | 'INVALID_REQUEST'
  | 'ROUTING_ERROR';

/**
 * 路由策略类型
 */
export type RoutingStrategy = 'name-match' | 'round-robin' | 'random' | 'weighted';

/**
 * Agent 选择上下文
 */
export interface AgentSelectionContext {
  /** 候选 Agent 列表 */
  candidates: RegisteredAgent[];
  /** 请求 ID */
  requestId: string;
  /** 策略配置 */
  config?: Record<string, unknown>;
}

// =============================================================================
// 路由错误类
// =============================================================================

/**
 * 路由错误
 */
export class RoutingError extends Error {
  readonly code: RouteErrorCode;
  readonly namespace?: string;
  readonly agentName?: string;

  constructor(
    code: RouteErrorCode,
    message: string,
    namespace?: string,
    agentName?: string
  ) {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
    this.namespace = namespace;
    this.agentName = agentName;
  }
}

// =============================================================================
// Router 类
// =============================================================================

/**
 * 请求路由器类
 * 负责解析请求并路由到正确的 Agent
 */
export class Router {
  /** Agent Registry 实例 */
  private registry: AgentRegistry;

  /** 路由策略映射 */
  private strategies: Map<RoutingStrategy, AgentSelectionStrategy>;

  /**
   * 构造函数
   * @param registry - Agent Registry 实例
   */
  constructor(registry: AgentRegistry) {
    this.registry = registry;
    
    // 初始化路由策略
    this.strategies = new Map([
      ['name-match', new NameMatchStrategy()],
      ['round-robin', new RoundRobinStrategy()],
      ['random', new RandomStrategy()],
      ['weighted', new WeightedStrategy()],
    ]);
  }

  /**
   * 路由请求到目标 Agent
   * @param request - 路由请求
   * @returns 路由结果
   */
  async route(request: RouteRequest): Promise<RouteResult> {
    const startTime = Date.now();
    const requestId = request.requestId || generateRequestId();

    try {
      logger.debug(`[Router] 开始路由: namespace=${request.namespace}, agent=${request.agentName}`);

      // 验证请求
      this.validateRequest(request);

      // 查找 Agent
      const agent = await this.findAgent(request.namespace, request.agentName);
      
      if (!agent) {
        return {
          success: false,
          error: `Agent not found: ${request.namespace}/${request.agentName}`,
          errorCode: 'AGENT_NOT_FOUND',
          routingTime: Date.now() - startTime,
        };
      }

      // 检查 Agent 状态
      const statusCheck = this.checkAgentStatus(agent);
      if (!statusCheck.ok) {
        return {
          success: false,
          error: statusCheck.error,
          errorCode: statusCheck.errorCode,
          routingTime: Date.now() - startTime,
        };
      }

      // 构建路由目标
      const target: RouteTarget = {
        agentId: agent.id,
        namespaceId: agent.namespaceId,
        agentName: agent.name,
        adapterType: agent.adapterType,
        metadata: {
          capabilities: agent.capabilities,
          status: agent.status,
          requestId,
        },
      };

      const routingTime = Date.now() - startTime;
      
      logger.info(`[Router] 路由成功: ${request.namespace}/${request.agentName} -> ${agent.id} (${routingTime}ms)`);

      return {
        success: true,
        target,
        routingTime,
      };
    } catch (error) {
      const routingTime = Date.now() - startTime;
      
      if (error instanceof RoutingError) {
        logger.warn(`[Router] 路由失败: ${error.message}`);
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
          routingTime,
        };
      }

      logger.error('[Router] 路由异常:', error);
      return {
        success: false,
        error: `Routing error: ${error instanceof Error ? error.message : String(error)}`,
        errorCode: 'ROUTING_ERROR',
        routingTime,
      };
    }
  }

  /**
   * 批量路由（用于负载均衡场景）
   * @param request - 路由请求
   * @returns 路由结果列表
   */
  async routeBatch(request: RouteRequest & { count: number }): Promise<RouteResult[]> {
    const results: RouteResult[] = [];
    
    for (let i = 0; i < request.count; i++) {
      const result = await this.route({
        ...request,
        requestId: `${request.requestId || generateRequestId()}-${i}`,
      });
      results.push(result);
    }
    
    return results;
  }

  /**
   * 使用策略选择 Agent
   * @param namespace - 命名空间
   * @param strategy - 选择策略
   * @returns 选中的 Agent 或 null
   */
  async selectAgent(
    namespace: string,
    strategy: RoutingStrategy = 'name-match',
    config?: Record<string, unknown>
  ): Promise<RegisteredAgent | null> {
    const agents = await this.registry.findByNamespace(namespace);
    const activeAgents = agents.filter(a => a.isEnabled && a.status === 'active');

    if (activeAgents.length === 0) {
      return null;
    }

    const selectionStrategy = this.strategies.get(strategy);
    if (!selectionStrategy) {
      logger.warn(`[Router] 未知的路由策略: ${strategy}，使用默认策略`);
      return activeAgents[0];
    }

    return selectionStrategy.select({
      candidates: activeAgents,
      requestId: generateRequestId(),
      config,
    });
  }

  /**
   * 注册自定义路由策略
   * @param name - 策略名称
   * @param strategy - 策略实现
   */
  registerStrategy(name: RoutingStrategy, strategy: AgentSelectionStrategy): void {
    this.strategies.set(name, strategy);
    logger.info(`[Router] 注册路由策略: ${name}`);
  }

  // ===========================================================================
  // 私有方法
  // ===========================================================================

  /**
   * 验证路由请求
   */
  private validateRequest(request: RouteRequest): void {
    if (!request.namespace?.trim()) {
      throw new RoutingError('INVALID_REQUEST', 'Namespace is required', request.namespace);
    }

    if (!request.agentName?.trim()) {
      throw new RoutingError('INVALID_REQUEST', 'Agent name is required', request.namespace, request.agentName);
    }
  }

  /**
   * 查找 Agent
   */
  private async findAgent(namespace: string, agentName: string): Promise<RegisteredAgent | null> {
    // 首先尝试作为 namespaceId 查找
    let agents = await this.registry.findByNamespace(namespace);
    
    // 如果没找到，可能需要通过其他方式解析 namespace
    if (agents.length === 0) {
      // TODO: 支持通过 namespace 名称查找
      logger.debug(`[Router] 未找到命名空间: ${namespace}`);
    }

    // 在命名空间内按名称查找
    return agents.find(a => a.name === agentName) || null;
  }

  /**
   * 检查 Agent 状态
   */
  private checkAgentStatus(agent: RegisteredAgent): { ok: boolean; error?: string; errorCode?: RouteErrorCode } {
    if (!agent.isEnabled) {
      return {
        ok: false,
        error: `Agent is disabled: ${agent.name}`,
        errorCode: 'AGENT_INACTIVE',
      };
    }

    if (agent.status === 'inactive') {
      return {
        ok: false,
        error: `Agent is inactive: ${agent.name}`,
        errorCode: 'AGENT_INACTIVE',
      };
    }

    if (agent.status === 'error') {
      return {
        ok: false,
        error: `Agent is in error state: ${agent.name}`,
        errorCode: 'AGENT_UNHEALTHY',
      };
    }

    return { ok: true };
  }
}

// =============================================================================
// Agent 选择策略
// =============================================================================

/**
 * Agent 选择策略接口
 */
interface AgentSelectionStrategy {
  /**
   * 选择 Agent
   * @param context - 选择上下文
   * @returns 选中的 Agent
   */
  select(context: AgentSelectionContext): RegisteredAgent | null;
}

/**
 * 名称匹配策略（默认）
 * 按名称精确匹配
 */
class NameMatchStrategy implements AgentSelectionStrategy {
  select(context: AgentSelectionContext): RegisteredAgent | null {
    // 名称匹配在路由层处理，这里只返回第一个候选
    return context.candidates[0] || null;
  }
}

/**
 * 轮询策略
 */
class RoundRobinStrategy implements AgentSelectionStrategy {
  private counters = new Map<string, number>();

  select(context: AgentSelectionContext): RegisteredAgent | null {
    const key = `${context.requestId}`;
    const current = this.counters.get(key) || 0;
    const index = current % context.candidates.length;
    
    this.counters.set(key, current + 1);
    
    // 清理计数器
    if (this.counters.size > 1000) {
      this.cleanupCounters();
    }
    
    return context.candidates[index];
  }

  private cleanupCounters(): void {
    // 简单清理：保留最近的 100 个
    const entries = Array.from(this.counters.entries());
    this.counters = new Map(entries.slice(-100));
  }
}

/**
 * 随机策略
 */
class RandomStrategy implements AgentSelectionStrategy {
  select(context: AgentSelectionContext): RegisteredAgent | null {
    const index = Math.floor(Math.random() * context.candidates.length);
    return context.candidates[index];
  }
}

/**
 * 权重策略（预留）
 */
class WeightedStrategy implements AgentSelectionStrategy {
  select(context: AgentSelectionContext): RegisteredAgent | null {
    // TODO: 实现基于权重的选择
    // 目前退化为随机选择
    const index = Math.floor(Math.random() * context.candidates.length);
    return context.candidates[index];
  }
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 生成请求 ID
 */
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

// 导出单例创建函数
export function createRouter(registry: AgentRegistry): Router {
  return new Router(registry);
}

export default Router;
