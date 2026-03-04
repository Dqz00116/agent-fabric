/**
 * Agent Registry 实现
 * 管理 Agent 的生命周期和发现
 *
 * @module services/agent-registry
 * @description 提供 Agent 注册、注销、查询和健康状态管理功能
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { AgentAdapter, AdapterConfig, HealthCheckResult } from '../adapters/types.js';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * Agent 状态
 */
export type AgentStatus = 'active' | 'inactive' | 'error' | 'unknown';

/**
 * 注册表中的 Agent 信息
 */
export interface RegisteredAgent {
  /** Agent ID */
  id: string;
  /** 所属命名空间 ID */
  namespaceId: string;
  /** Agent 名称 */
  name: string;
  /** 适配器类型 */
  adapterType: string;
  /** 适配器配置 */
  adapterConfig: AdapterConfig;
  /** Agent 能力列表 */
  capabilities: string[];
  /** 当前状态 */
  status: AgentStatus;
  /** 是否启用 */
  isEnabled: boolean;
  /** 描述 */
  description?: string;
  /** 关联的适配器实例（运行时） */
  adapterInstance?: AgentAdapter;
  /** 最后健康检查时间 */
  lastHealthCheckAt: number;
  /** 最后健康检查结果 */
  lastHealthResult?: HealthCheckResult;
  /** 注册时间 */
  registeredAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * Agent 注册选项
 */
export interface RegisterAgentOptions {
  namespaceId: string;
  name: string;
  adapterType: string;
  adapterConfig: AdapterConfig;
  capabilities?: string[];
  description?: string;
  isEnabled?: boolean;
}

/**
 * Agent 更新选项
 */
export interface UpdateAgentOptions {
  name?: string;
  adapterType?: string;
  adapterConfig?: AdapterConfig;
  capabilities?: string[];
  description?: string;
  isEnabled?: boolean;
  status?: AgentStatus;
}

/**
 * Agent 查询过滤器
 */
export interface AgentFilter {
  namespaceId?: string;
  status?: AgentStatus;
  isEnabled?: boolean;
  adapterType?: string;
  capability?: string;
}

/**
 * Agent 变更事件类型
 */
export type AgentRegistryEventType =
  | 'agent:registered'
  | 'agent:unregistered'
  | 'agent:updated'
  | 'agent:statusChanged'
  | 'agent:healthChecked';

/**
 * Agent 变更事件
 */
export interface AgentRegistryEvent {
  type: AgentRegistryEventType;
  agentId: string;
  namespaceId: string;
  timestamp: number;
  data?: unknown;
}

/**
 * Agent 事件监听器
 */
export type AgentRegistryEventListener = (event: AgentRegistryEvent) => void | Promise<void>;

// =============================================================================
// Agent Registry 类
// =============================================================================

/**
 * Agent Registry 类
 * 提供 Agent 注册、发现、状态管理等功能
 */
export class AgentRegistry {
  /** 内存缓存：Agent ID -> Agent 信息 */
  private agents = new Map<string, RegisteredAgent>();

  /** 命名空间索引：namespaceId -> Set<agentId> */
  private namespaceIndex = new Map<string, Set<string>>();

  /** 事件监听器 */
  private listeners = new Map<AgentRegistryEventType, Set<AgentRegistryEventListener>>();
  private globalListeners = new Set<AgentRegistryEventListener>();

  /** 健康检查定时器 */
  private healthCheckTimer?: NodeJS.Timeout;

  /** 是否已初始化 */
  private initialized = false;

  /** 初始化锁，防止并发初始化 */
  private initPromise?: Promise<void>;

  /**
   * 初始化注册表
   * 从数据库加载所有 Agent 信息到内存缓存
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 防止并发初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      logger.info('[AgentRegistry] 开始初始化...');

      // 从数据库加载所有 Agent
      const agents = await prisma.agent.findMany();

      for (const agent of agents) {
        const registeredAgent = this.mapDbAgentToRegistered(agent);
        this.agents.set(registeredAgent.id, registeredAgent);
        this.addToNamespaceIndex(registeredAgent.namespaceId, registeredAgent.id);
      }

      this.initialized = true;
      logger.info(`[AgentRegistry] 初始化完成，加载了 ${agents.length} 个 Agent`);

      // 启动定期健康检查
      this.startHealthCheckInterval();
    } catch (error) {
      logger.error('[AgentRegistry] 初始化失败:', error);
      throw error;
    } finally {
      this.initPromise = undefined;
    }
  }

  /**
   * 关闭注册表
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.agents.clear();
    this.namespaceIndex.clear();
    this.initialized = false;

    logger.info('[AgentRegistry] 已关闭');
  }

  // ===========================================================================
  // Agent 注册/注销
  // ===========================================================================

  /**
   * 注册新 Agent
   * @param options - 注册选项
   * @returns 注册的 Agent 信息
   */
  async register(options: RegisterAgentOptions): Promise<RegisteredAgent> {
    await this.ensureInitialized();

    // 检查命名空间是否存在
    const namespace = await prisma.namespace.findUnique({
      where: { id: options.namespaceId },
    });

    if (!namespace) {
      throw new Error(`命名空间不存在: ${options.namespaceId}`);
    }

    // 检查同命名空间下是否已有同名 Agent
    const existingByName = await this.findByName(options.namespaceId, options.name);
    if (existingByName) {
      throw new Error(`命名空间 ${options.namespaceId} 中已存在名为 ${options.name} 的 Agent`);
    }

    // 创建数据库记录
    const dbAgent = await prisma.agent.create({
      data: {
        namespaceId: options.namespaceId,
        name: options.name,
        description: options.description,
        config: {
          adapterType: options.adapterType,
          adapterConfig: options.adapterConfig,
          capabilities: options.capabilities || [],
        } as Prisma.InputJsonValue,
        tools: [],
        isActive: options.isEnabled ?? true,
      },
    });

    // 创建内存对象
    const registeredAgent: RegisteredAgent = {
      id: dbAgent.id,
      namespaceId: options.namespaceId,
      name: options.name,
      adapterType: options.adapterType,
      adapterConfig: options.adapterConfig,
      capabilities: options.capabilities || [],
      description: options.description,
      status: 'unknown',
      isEnabled: options.isEnabled ?? true,
      lastHealthCheckAt: 0,
      registeredAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 存入内存缓存
    this.agents.set(registeredAgent.id, registeredAgent);
    this.addToNamespaceIndex(registeredAgent.namespaceId, registeredAgent.id);

    // 触发事件
    this.emit('agent:registered', registeredAgent);

    logger.info(`[AgentRegistry] Agent 已注册: ${registeredAgent.id} (${registeredAgent.name})`);

    return registeredAgent;
  }

  /**
   * 注销 Agent
   * @param agentId - Agent ID
   */
  async unregister(agentId: string): Promise<void> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    // 断开适配器连接（如果有）
    if (agent.adapterInstance) {
      try {
        await agent.adapterInstance.disconnect();
      } catch (error) {
        logger.warn(`[AgentRegistry] 断开 Agent ${agentId} 连接时出错:`, error);
      }
    }

    // 删除数据库记录
    await prisma.agent.delete({
      where: { id: agentId },
    });

    // 从内存缓存删除
    this.agents.delete(agentId);
    this.removeFromNamespaceIndex(agent.namespaceId, agentId);

    // 触发事件
    this.emit('agent:unregistered', { agentId, namespaceId: agent.namespaceId });

    logger.info(`[AgentRegistry] Agent 已注销: ${agentId}`);
  }

  /**
   * 更新 Agent 信息
   * @param agentId - Agent ID
   * @param options - 更新选项
   */
  async update(agentId: string, options: UpdateAgentOptions): Promise<RegisteredAgent> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    // 检查名称冲突
    if (options.name && options.name !== agent.name) {
      const existing = await this.findByName(agent.namespaceId, options.name);
      if (existing && existing.id !== agentId) {
        throw new Error(`命名空间 ${agent.namespaceId} 中已存在名为 ${options.name} 的 Agent`);
      }
    }

    // 构建更新数据
    const config = {
      adapterType: options.adapterType || agent.adapterType,
      adapterConfig: options.adapterConfig || agent.adapterConfig,
      capabilities: options.capabilities || agent.capabilities,
    };

    // 更新数据库
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        name: options.name,
        description: options.description,
        config: config as Prisma.InputJsonValue,
        isActive: options.isEnabled ?? agent.isEnabled,
      },
    });

    // 更新内存缓存
    const updatedAgent: RegisteredAgent = {
      ...agent,
      name: options.name ?? agent.name,
      adapterType: options.adapterType ?? agent.adapterType,
      adapterConfig: options.adapterConfig ?? agent.adapterConfig,
      capabilities: options.capabilities ?? agent.capabilities,
      description: options.description ?? agent.description,
      isEnabled: options.isEnabled ?? agent.isEnabled,
      status: options.status ?? agent.status,
      updatedAt: Date.now(),
    };

    this.agents.set(agentId, updatedAgent);

    // 触发事件
    this.emit('agent:updated', updatedAgent);

    logger.info(`[AgentRegistry] Agent 已更新: ${agentId}`);

    return updatedAgent;
  }

  // ===========================================================================
  // Agent 查询
  // ===========================================================================

  /**
   * 按 ID 查找 Agent
   * @param agentId - Agent ID
   */
  async findById(agentId: string): Promise<RegisteredAgent | null> {
    await this.ensureInitialized();
    return this.agents.get(agentId) || null;
  }

  /**
   * 按命名空间查找所有 Agent
   * @param namespaceId - 命名空间 ID
   */
  async findByNamespace(namespaceId: string): Promise<RegisteredAgent[]> {
    await this.ensureInitialized();

    const agentIds = this.namespaceIndex.get(namespaceId);
    if (!agentIds || agentIds.size === 0) {
      return [];
    }

    const result: RegisteredAgent[] = [];
    for (const agentId of Array.from(agentIds)) {
      const agent = this.agents.get(agentId);
      if (agent) {
        result.push(agent);
      }
    }

    return result;
  }

  /**
   * 按命名空间和名称查找 Agent
   * @param namespaceId - 命名空间 ID
   * @param name - Agent 名称
   */
  async findByName(namespaceId: string, name: string): Promise<RegisteredAgent | null> {
    await this.ensureInitialized();

    const agents = await this.findByNamespace(namespaceId);
    return agents.find(a => a.name === name) || null;
  }

  /**
   * 查找所有 Agent（支持过滤）
   * @param filter - 过滤器
   */
  async findAll(filter?: AgentFilter): Promise<RegisteredAgent[]> {
    await this.ensureInitialized();

    let result = Array.from(this.agents.values());

    if (filter) {
      if (filter.namespaceId) {
        result = result.filter(a => a.namespaceId === filter.namespaceId);
      }
      if (filter.status) {
        result = result.filter(a => a.status === filter.status);
      }
      if (filter.isEnabled !== undefined) {
        result = result.filter(a => a.isEnabled === filter.isEnabled);
      }
      if (filter.adapterType) {
        result = result.filter(a => a.adapterType === filter.adapterType);
      }
      if (filter.capability) {
        result = result.filter(a => a.capabilities.includes(filter.capability!));
      }
    }

    return result;
  }

  /**
   * 检查 Agent 是否存在
   * @param agentId - Agent ID
   */
  async exists(agentId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.agents.has(agentId);
  }

  /**
   * 获取 Agent 总数
   */
  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.agents.size;
  }

  /**
   * 获取指定命名空间的 Agent 数量
   * @param namespaceId - 命名空间 ID
   */
  async countByNamespace(namespaceId: string): Promise<number> {
    await this.ensureInitialized();
    return this.namespaceIndex.get(namespaceId)?.size || 0;
  }

  // ===========================================================================
  // Agent 状态管理
  // ===========================================================================

  /**
   * 更新 Agent 状态
   * @param agentId - Agent ID
   * @param status - 新状态
   * @param healthResult - 健康检查结果（可选）
   */
  async updateStatus(
    agentId: string,
    status: AgentStatus,
    healthResult?: HealthCheckResult
  ): Promise<void> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.updatedAt = Date.now();

    if (healthResult) {
      agent.lastHealthCheckAt = Date.now();
      agent.lastHealthResult = healthResult;
    }

    // 只触发状态变更事件
    if (oldStatus !== status) {
      this.emit('agent:statusChanged', {
        agentId,
        namespaceId: agent.namespaceId,
        oldStatus,
        newStatus: status,
      });
    }
  }

  /**
   * 获取 Agent 健康状态
   * @param agentId - Agent ID
   */
  async getHealthStatus(agentId: string): Promise<HealthCheckResult | null> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return agent.lastHealthResult || null;
  }

  /**
   * 执行健康检查
   * @param agentId - Agent ID
   */
  async healthCheck(agentId: string): Promise<HealthCheckResult> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    if (!agent.adapterInstance) {
      const result: HealthCheckResult = {
        healthy: false,
        status: 'error',
        message: 'Adapter 实例未创建',
        checkedAt: Date.now(),
      };
      await this.updateStatus(agentId, 'error', result);
      return result;
    }

    try {
      const result = await agent.adapterInstance.healthCheck();
      const newStatus: AgentStatus = result.healthy ? 'active' : 'error';
      await this.updateStatus(agentId, newStatus, result);

      this.emit('agent:healthChecked', {
        agentId,
        namespaceId: agent.namespaceId,
        result,
      });

      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        healthy: false,
        status: 'error',
        message: `健康检查异常: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: Date.now(),
      };
      await this.updateStatus(agentId, 'error', result);
      return result;
    }
  }

  /**
   * 对所有 Agent 执行健康检查
   */
  async healthCheckAll(): Promise<Map<string, HealthCheckResult>> {
    await this.ensureInitialized();

    const results = new Map<string, HealthCheckResult>();

    for (const agentId of Array.from(this.agents.keys())) {
      try {
        const result = await this.healthCheck(agentId);
        results.set(agentId, result);
      } catch (error) {
        logger.error(`[AgentRegistry] 健康检查失败: ${agentId}`, error);
      }
    }

    return results;
  }

  // ===========================================================================
  // Adapter 实例管理
  // ===========================================================================

  /**
   * 设置 Agent 的 Adapter 实例
   * @param agentId - Agent ID
   * @param adapter - Adapter 实例
   */
  async setAdapterInstance(agentId: string, adapter: AgentAdapter): Promise<void> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    // 断开旧的连接
    if (agent.adapterInstance) {
      try {
        await agent.adapterInstance.disconnect();
      } catch (error) {
        logger.warn(`[AgentRegistry] 断开旧 Adapter 连接时出错: ${agentId}`, error);
      }
    }

    agent.adapterInstance = adapter;
    agent.updatedAt = Date.now();

    logger.info(`[AgentRegistry] Adapter 实例已设置: ${agentId}`);
  }

  /**
   * 获取 Agent 的 Adapter 实例
   * @param agentId - Agent ID
   */
  async getAdapterInstance(agentId: string): Promise<AgentAdapter | undefined> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    return agent?.adapterInstance;
  }

  /**
   * 清除 Agent 的 Adapter 实例
   * @param agentId - Agent ID
   */
  async clearAdapterInstance(agentId: string): Promise<void> {
    await this.ensureInitialized();

    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    if (agent.adapterInstance) {
      try {
        await agent.adapterInstance.disconnect();
      } catch (error) {
        logger.warn(`[AgentRegistry] 断开 Adapter 连接时出错: ${agentId}`, error);
      }
      agent.adapterInstance = undefined;
    }

    logger.info(`[AgentRegistry] Adapter 实例已清除: ${agentId}`);
  }

  // ===========================================================================
  // 事件系统
  // ===========================================================================

  /**
   * 添加事件监听器
   * @param event - 事件类型
   * @param listener - 监听器函数
   */
  on(event: AgentRegistryEventType | 'all', listener: AgentRegistryEventListener): void {
    if (event === 'all') {
      this.globalListeners.add(listener);
    } else {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event)!.add(listener);
    }
  }

  /**
   * 移除事件监听器
   * @param event - 事件类型
   * @param listener - 监听器函数
   */
  off(event: AgentRegistryEventType | 'all', listener: AgentRegistryEventListener): void {
    if (event === 'all') {
      this.globalListeners.delete(listener);
    } else {
      this.listeners.get(event)?.delete(listener);
    }
  }

  /**
   * 添加一次性事件监听器
   * @param event - 事件类型
   * @param listener - 监听器函数
   */
  once(event: AgentRegistryEventType, listener: AgentRegistryEventListener): void {
    const onceWrapper: AgentRegistryEventListener = e => {
      this.off(event, onceWrapper);
      return listener(e);
    };
    this.on(event, onceWrapper);
  }

  // ===========================================================================
  // 私有方法
  // ===========================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private addToNamespaceIndex(namespaceId: string, agentId: string): void {
    if (!this.namespaceIndex.has(namespaceId)) {
      this.namespaceIndex.set(namespaceId, new Set());
    }
    this.namespaceIndex.get(namespaceId)!.add(agentId);
  }

  private removeFromNamespaceIndex(namespaceId: string, agentId: string): void {
    this.namespaceIndex.get(namespaceId)?.delete(agentId);
  }

  private mapDbAgentToRegistered(dbAgent: {
    id: string;
    namespaceId: string;
    name: string;
    description: string | null;
    config: unknown;
    isActive: boolean;
  }): RegisteredAgent {
    const config = (dbAgent.config as Record<string, unknown>) || {};

    return {
      id: dbAgent.id,
      namespaceId: dbAgent.namespaceId,
      name: dbAgent.name,
      description: dbAgent.description || undefined,
      adapterType: (config.adapterType as string) || 'unknown',
      adapterConfig: (config.adapterConfig as AdapterConfig) || { type: 'http', baseUrl: '' },
      capabilities: (config.capabilities as string[]) || [],
      status: dbAgent.isActive ? 'unknown' : 'inactive',
      isEnabled: dbAgent.isActive,
      lastHealthCheckAt: 0,
      registeredAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private emit(type: AgentRegistryEventType, data: unknown): void {
    const event: AgentRegistryEvent = {
      type,
      agentId:
        (data as { id?: string; agentId?: string }).id ||
        (data as { id?: string; agentId?: string }).agentId ||
        '',
      namespaceId: (data as { namespaceId?: string }).namespaceId || '',
      timestamp: Date.now(),
      data,
    };

    // 触发特定事件监听器
    const listeners = this.listeners.get(type);
    if (listeners) {
      Array.from(listeners).forEach(listener => {
        try {
          void listener(event);
        } catch (err) {
          logger.error(`[AgentRegistry] 事件监听器出错:`, err);
        }
      });
    }

    // 触发全局监听器
    Array.from(this.globalListeners).forEach(listener => {
      try {
        void listener(event);
      } catch (err) {
        logger.error(`[AgentRegistry] 全局事件监听器出错:`, err);
      }
    });
  }

  private startHealthCheckInterval(): void {
    // 每 60 秒执行一次健康检查
    this.healthCheckTimer = setInterval(() => {
      this.healthCheckAll().catch(error => {
        logger.error('[AgentRegistry] 定期健康检查失败:', error);
      });
    }, 60000);

    logger.info('[AgentRegistry] 定期健康检查已启动（间隔: 60s）');
  }
}

// =============================================================================
// 导出单例
// =============================================================================

/**
 * 全局 Agent Registry 实例
 */
export const agentRegistry = new AgentRegistry();

export default agentRegistry;
