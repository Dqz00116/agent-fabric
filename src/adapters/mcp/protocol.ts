/**
 * MCP (Model Context Protocol) 协议类型定义
 *
 * @module adapters/mcp/protocol
 * @description 定义 MCP 协议的 JSON-RPC 消息格式和类型
 *
 * MCP 协议基于 JSON-RPC 2.0，用于与本地 MCP Server 通信
 * 参考: https://modelcontextprotocol.io
 */

// =============================================================================
// JSON-RPC 基础类型
// =============================================================================

/**
 * JSON-RPC 请求 ID
 */
export type JsonRpcId = string | number | null;

/**
 * JSON-RPC 2.0 请求
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 响应
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 错误
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 通知（无 id）
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 消息（请求、响应或通知）
 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// =============================================================================
// MCP 协议错误码
// =============================================================================

export const McpErrorCode = {
  // 标准 JSON-RPC 错误码
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP 特定错误码
  INITIALIZATION_FAILED: -32000,
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
  CAPABILITY_NOT_SUPPORTED: -32003,
  SERVER_NOT_INITIALIZED: -32004,
} as const;

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode];

// =============================================================================
// MCP 初始化相关
// =============================================================================

/**
 * MCP 协议版本
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * 客户端能力
 */
export interface ClientCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, never>;
}

/**
 * 服务器能力
 */
export interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, never>;
}

/**
 * 初始化请求参数
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * 初始化响应结果
 */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

// =============================================================================
// MCP Tools 相关
// =============================================================================

/**
 * MCP Tool 定义
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * tools/list 请求参数
 */
export interface ToolsListParams {
  cursor?: string;
}

/**
 * tools/list 响应结果
 */
export interface ToolsListResult {
  tools: McpTool[];
  nextCursor?: string;
}

/**
 * tools/call 请求参数
 */
export interface ToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * Tool 调用结果内容
 */
export interface ToolResultContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

/**
 * tools/call 响应结果
 */
export interface ToolsCallResult {
  content: ToolResultContent[];
  isError?: boolean;
}

// =============================================================================
// MCP 其他类型
// =============================================================================

/**
 * 资源内容
 */
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * 提示内容
 */
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: ResourceContent;
  };
}

/**
 * 提示定义
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: {
    name: string;
    description?: string;
    required?: boolean;
  }[];
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 创建 JSON-RPC 请求
 */
export function createJsonRpcRequest(
  id: JsonRpcId,
  method: string,
  params?: Record<string, unknown>
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

/**
 * 创建 JSON-RPC 响应
 */
export function createJsonRpcResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * 创建 JSON-RPC 错误响应
 */
export function createJsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

/**
 * 创建 JSON-RPC 通知
 */
export function createJsonRpcNotification(
  method: string,
  params?: Record<string, unknown>
): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

/**
 * 检查消息是否为 JSON-RPC 响应
 */
export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return 'result' in message || 'error' in message;
}

/**
 * 检查消息是否为 JSON-RPC 请求
 */
export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'method' in message && 'id' in message && !('result' in message);
}

/**
 * 检查消息是否为 JSON-RPC 通知
 */
export function isJsonRpcNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return 'method' in message && !('id' in message);
}

/**
 * 解析 JSON-RPC 消息（处理可能的换行符分隔的批量消息）
 */
export function parseJsonRpcMessages(data: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  const lines = data.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const message = JSON.parse(line) as JsonRpcMessage;
      if (message.jsonrpc === '2.0') {
        messages.push(message);
      }
    } catch {
      // 忽略解析失败的行
    }
  }

  return messages;
}

/**
 * 序列化 JSON-RPC 消息
 */
export function serializeJsonRpcMessage(message: JsonRpcMessage): string {
  return JSON.stringify(message) + '\n';
}
