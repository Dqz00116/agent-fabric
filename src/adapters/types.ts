/**
 * Agent Adapter 类型定义
 * 提供统一的 Adapter 接口和数据结构
 *
 * @module adapters/types
 * @description 定义所有 Adapter 必须实现的接口和相关的数据结构
 */

// =============================================================================
// 基础类型定义
// =============================================================================

/**
 * 消息角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 消息内容类型
 */
export type ContentType = 'text' | 'image' | 'file' | 'tool_call' | 'tool_result';

/**
 * 流式事件类型
 */
export type StreamEventType = 'content' | 'error' | 'done' | 'tool_call';

/**
 * 适配器状态
 */
export type AdapterStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// =============================================================================
// 消息相关类型
// =============================================================================

/**
 * 消息内容块
 */
export interface ContentBlock {
  /** 内容类型 */
  type: ContentType;
  /** 文本内容 */
  text?: string;
  /** 图片 URL/base64 */
  imageUrl?: string;
  /** 文件 URL/base64 */
  fileUrl?: string;
  /** 工具调用信息 */
  toolCall?: ToolCall;
  /** 工具结果 */
  toolResult?: ToolResult;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/**
 * 工具结果
 */
export interface ToolResult {
  /** 对应工具调用 ID */
  toolCallId: string;
  /** 结果内容 */
  content: string;
  /** 是否出错 */
  isError?: boolean;
}

/**
 * 对话消息
 */
export interface Message {
  /** 消息 ID */
  id?: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容（支持多模态） */
  content: string | ContentBlock[];
  /** 消息元数据 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  timestamp?: number;
}

// =============================================================================
// 请求/响应类型
// =============================================================================

/**
 * Agent 请求上下文
 */
export interface AgentContext {
  /** 会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 请求 ID（用于追踪） */
  requestId?: string;
  /** 额外的上下文数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 请求结构
 */
export interface AgentRequest {
  /** 请求唯一 ID */
  id: string;
  /** 用户输入消息 */
  input: string | Message[];
  /** 请求上下文 */
  context?: AgentContext;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 可用工具列表 */
  tools?: ToolDefinition[];
  /** 请求配置参数 */
  parameters?: RequestParameters;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具参数 JSON Schema */
  parameters: Record<string, unknown>;
}

/**
 * 请求参数
 */
export interface RequestParameters {
  /** 温度参数 (0-2) */
  temperature?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** Top-P 采样 */
  topP?: number;
  /** 停止序列 */
  stopSequences?: string[];
  /** 是否启用流式输出 */
  stream?: boolean;
  /** 模型名称 */
  model?: string;
  /** 额外模型特定参数 */
  [key: string]: unknown;
}

/**
 * Agent 响应结构（非流式）
 */
export interface AgentResponse {
  /** 响应对应的请求 ID */
  requestId: string;
  /** 响应内容 */
  output: string | ContentBlock[];
  /** 工具调用请求（如果有） */
  toolCalls?: ToolCall[];
  /** 使用统计 */
  usage?: TokenUsage;
  /** 响应元数据 */
  metadata?: ResponseMetadata;
  /** 完成原因 */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  /** 输入 token 数 */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 总 token 数 */
  totalTokens: number;
}

/**
 * 响应元数据
 */
export interface ResponseMetadata {
  /** 模型名称 */
  model?: string;
  /** 响应时间（毫秒） */
  responseTime?: number;
  /** 创建时间戳 */
  createdAt?: number;
  /** 额外元数据 */
  [key: string]: unknown;
}

// =============================================================================
// 流式事件类型
// =============================================================================

/**
 * 流式事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: StreamEventType;
  /** 事件对应请求 ID */
  requestId: string;
  /** 内容增量（type=content 时） */
  delta?: string;
  /** 完整内容块（type=content 时可选） */
  contentBlock?: ContentBlock;
  /** 工具调用（type=tool_call 时） */
  toolCall?: ToolCall;
  /** 错误信息（type=error 时） */
  error?: AdapterError;
  /** 完成原因（type=done 时） */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  /** 使用统计（type=done 时） */
  usage?: TokenUsage;
}

/**
 * 流式响应迭代器
 */
export type StreamResponse = AsyncIterableIterator<StreamEvent>;

// =============================================================================
// 配置类型
// =============================================================================

/**
 * 基础适配器配置
 */
export interface BaseAdapterConfig {
  /** 适配器类型 */
  type: string;
  /** 适配器名称 */
  name?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 启用流式输出 */
  enableStreaming?: boolean;
  /** 额外配置 */
  [key: string]: unknown;
}

/**
 * HTTP 适配器配置
 */
export interface HttpAdapterConfig extends BaseAdapterConfig {
  type: 'http';
  /** 基础 URL */
  baseUrl: string;
  /** API 密钥 */
  apiKey?: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 模型名称 */
  model?: string;
}

/**
 * MCP 适配器配置
 */
export interface McpAdapterConfig extends BaseAdapterConfig {
  type: 'mcp';
  /** MCP 服务器名称 */
  serverName: string;
  /** 命令 */
  command?: string;
  /** 参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * Stdio 适配器配置
 */
export interface StdioAdapterConfig extends BaseAdapterConfig {
  type: 'stdio';
  /** 命令 */
  command: string;
  /** 参数 */
  args?: string[];
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
}

/** 适配器配置联合类型 */
export type AdapterConfig = HttpAdapterConfig | McpAdapterConfig | StdioAdapterConfig;

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 适配器错误码
 */
export type AdapterErrorCode =
  | 'CONNECTION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | 'STREAM_ERROR'
  | 'NOT_SUPPORTED';

/**
 * 适配器错误
 */
export interface AdapterError {
  /** 错误码 */
  code: AdapterErrorCode;
  /** 错误消息 */
  message: string;
  /** 原始错误 */
  cause?: Error;
  /** 是否可重试 */
  retryable?: boolean;
  /** 建议重试延迟（毫秒） */
  retryAfter?: number;
}

// =============================================================================
// 健康检查类型
// =============================================================================

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  /** 是否健康 */
  healthy: boolean;
  /** 状态信息 */
  status: AdapterStatus;
  /** 延迟（毫秒） */
  latency?: number;
  /** 详细消息 */
  message: string;
  /** 上次检查时间 */
  checkedAt: number;
  /** 额外信息 */
  details?: Record<string, unknown>;
}

// =============================================================================
// Adapter 核心接口
// =============================================================================

/**
 * Agent Adapter 统一接口
 * 所有具体的 Adapter 实现都必须实现此接口
 *
 * @example
 * ```typescript
 * class MyAdapter implements AgentAdapter {
 *   async connect(): Promise<void> {
 *     // 建立连接
 *   }
 *
 *   async invoke(request: AgentRequest): Promise<AgentResponse> {
 *     // 执行调用
 *   }
 *
 *   async *stream(request: AgentRequest): StreamResponse {
 *     // 流式输出
 *   }
 *
 *   async disconnect(): Promise<void> {
 *     // 断开连接
 *   }
 *
 *   async healthCheck(): Promise<HealthCheckResult> {
 *     // 健康检查
 *   }
 * }
 * ```
 */
export interface AgentAdapter {
  /** 适配器配置 */
  readonly config: AdapterConfig;

  /** 当前状态 */
  readonly status: AdapterStatus;

  /** 是否已连接 */
  readonly isConnected: boolean;

  /** 是否支持流式输出 */
  readonly supportsStreaming: boolean;

  /**
   * 建立连接
   * @throws {AdapterError} 连接失败时抛出
   */
  connect(): Promise<void>;

  /**
   * 执行非流式调用
   * @param request - Agent 请求
   * @returns Agent 响应
   * @throws {AdapterError} 调用失败时抛出
   */
  invoke(request: AgentRequest): Promise<AgentResponse>;

  /**
   * 执行流式调用
   * @param request - Agent 请求
   * @returns 流式事件异步迭代器
   * @throws {AdapterError} 调用失败时抛出
   */
  stream?(request: AgentRequest): StreamResponse;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 健康检查
   * @returns 健康检查结果
   */
  healthCheck(): Promise<HealthCheckResult>;
}

// =============================================================================
// 适配器事件类型
// =============================================================================

/**
 * 适配器事件类型
 */
export type AdapterEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'request_start'
  | 'request_end'
  | 'stream_start'
  | 'stream_end';

/**
 * 适配器事件
 */
export interface AdapterEvent {
  /** 事件类型 */
  type: AdapterEventType;
  /** 适配器 ID */
  adapterId: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件数据 */
  data?: unknown;
  /** 错误信息（如果有） */
  error?: AdapterError;
}

/**
 * 适配器事件监听器
 */
export type AdapterEventListener = (event: AdapterEvent) => void | Promise<void>;

// =============================================================================
// 工具类型
// =============================================================================

/**
 * 提取消息中的文本内容
 */
export function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter(
      (block): block is ContentBlock & { text: string } => block.type === 'text' && !!block.text
    )
    .map(block => block.text)
    .join('');
}

/**
 * 创建文本内容块
 */
export function createTextContent(text: string): ContentBlock {
  return { type: 'text', text };
}

/**
 * 创建工具调用内容块
 */
export function createToolCallContent(toolCall: ToolCall): ContentBlock {
  return { type: 'tool_call', toolCall };
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}
