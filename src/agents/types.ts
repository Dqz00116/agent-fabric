/**
 * LLM Agent 类型定义
 *
 * @module agents/types
 * @description 定义 LLM Agent 的配置、请求和响应类型
 */

import type {
  AgentResponse,
  Message,
  ToolDefinition,
  TokenUsage,
} from '../adapters/types.js';

// =============================================================================
// LLM Agent 配置
// =============================================================================

/**
 * LLM 提供商类型
 */
export type LLMProvider = 'openai' | 'azure' | 'anthropic' | 'custom';

/**
 * LLM Agent 配置
 */
export interface LLMAgentConfig {
  /** 提供商类型 */
  provider: LLMProvider;
  /** 模型名称 */
  model: string;
  /** API Key（可选，可从环境变量或 Secret Context 获取） */
  apiKey?: string;
  /** 基础 URL（可选，用于自定义端点或代理） */
  baseUrl?: string;
  /** 温度参数 (0-2) */
  temperature?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** Top-P 采样 */
  topP?: number;
  /** 停止序列 */
  stopSequences?: string[];
  /** 系统提示词 */
  systemPrompt?: string;
  /** 请求超时时间（毫秒） */
  timeout?: number;
  /** 额外参数 */
  extraParams?: Record<string, unknown>;
}

/**
 * LLM Agent 初始化选项
 */
export interface LLMAgentOptions {
  /** Agent ID */
  id?: string;
  /** Agent 名称 */
  name: string;
  /** Agent 配置 */
  config: LLMAgentConfig;
  /** 可用工具列表 */
  tools?: ToolDefinition[];
  /** 是否启用流式输出 */
  enableStreaming?: boolean;
}

// =============================================================================
// LLM 请求/响应
// =============================================================================

/**
 * LLM 调用选项
 */
export interface LLMInvokeOptions {
  /** 用户输入 */
  input: string | Message[];
  /** 系统提示词（覆盖配置中的） */
  systemPrompt?: string;
  /** 可用工具 */
  tools?: ToolDefinition[];
  /** 是否使用流式输出 */
  _stream?: boolean;  // 保留字段，内部使用
  /** 覆盖默认参数 */
  parameters?: Partial<Omit<LLMAgentConfig, 'provider' | 'model' | 'apiKey' | 'baseUrl'>>;
}

/**
 * LLM 响应（扩展基础响应）
 */
export interface LLMResponse extends AgentResponse {
  /** Token 使用量 */
  usage: TokenUsage;
  /** 模型名称 */
  model: string;
  /** 提供商 */
  provider: LLMProvider;
}

/**
 * LLM 流式事件
 */
export interface LLMStreamEvent {
  /** 事件类型 */
  type: 'content' | 'tool_call' | 'error' | 'done';
  /** 内容增量 */
  delta?: string;
  /** 工具调用 */
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  /** 完成原因 */
  finishReason?: string;
  /** Token 使用量（仅在 done 事件） */
  usage?: TokenUsage;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * LLM 流式响应
 */
export type LLMStreamResponse = AsyncIterableIterator<LLMStreamEvent>;

// =============================================================================
// LLM Agent 接口
// =============================================================================

/**
 * LLM Agent 统一接口
 */
export interface LLMAgent {
  /** Agent ID */
  readonly id: string;
  /** Agent 名称 */
  readonly name: string;
  /** Agent 配置 */
  readonly config: LLMAgentConfig;
  
  /**
   * 执行非流式调用
   * @param options - 调用选项
   */
  invoke(options: LLMInvokeOptions): Promise<LLMResponse>;
  
  /**
   * 执行流式调用
   * @param options - 调用选项
   */
  stream(options: LLMInvokeOptions): LLMStreamResponse;
  
  /**
   * 更新配置
   * @param config - 新的配置（部分更新）
   */
  updateConfig(config: Partial<LLMAgentConfig>): void;
  
  /**
   * 获取当前配置
   */
  getConfig(): LLMAgentConfig;
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 验证 LLM 配置
 * @param config - 配置对象
 */
export function validateLLMConfig(config: LLMAgentConfig): void {
  if (!config.provider) {
    throw new Error('LLM 配置错误: provider 是必需的');
  }
  
  if (!config.model) {
    throw new Error('LLM 配置错误: model 是必需的');
  }
  
  const validProviders: LLMProvider[] = ['openai', 'azure', 'anthropic', 'custom'];
  if (!validProviders.includes(config.provider)) {
    throw new Error(`LLM 配置错误: 不支持的 provider "${config.provider}"`);
  }
  
  if (config.temperature !== undefined) {
    if (config.temperature < 0 || config.temperature > 2) {
      throw new Error('LLM 配置错误: temperature 必须在 0-2 范围内');
    }
  }
  
  if (config.maxTokens !== undefined) {
    if (config.maxTokens < 1) {
      throw new Error('LLM 配置错误: maxTokens 必须大于 0');
    }
  }
  
  if (config.topP !== undefined) {
    if (config.topP < 0 || config.topP > 1) {
      throw new Error('LLM 配置错误: topP 必须在 0-1 范围内');
    }
  }
}

/**
 * 合并消息
 * @param systemPrompt - 系统提示词
 * @param input - 用户输入
 */
export function buildMessages(
  systemPrompt: string | undefined,
  input: string | Message[]
): Message[] {
  const messages: Message[] = [];
  
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
      timestamp: Date.now(),
    });
  }
  
  if (typeof input === 'string') {
    messages.push({
      role: 'user',
      content: input,
      timestamp: Date.now(),
    });
  } else {
    messages.push(...input);
  }
  
  return messages;
}

/**
 * 生成唯一 ID
 */
export function generateAgentId(): string {
  return `llm-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}
