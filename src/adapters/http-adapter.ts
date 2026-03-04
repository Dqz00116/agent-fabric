/**
 * HTTP Adapter 实现
 * 支持调用外部 HTTP API 和 SSE 流式响应
 *
 * @module adapters/http-adapter
 * @description 实现 HTTP 协议的 Agent 适配器，支持 REST API 调用和 SSE 流式响应
 */

import {
  type AgentRequest,
  type AgentResponse,
  type StreamResponse,
  type HttpAdapterConfig,
  type HealthCheckResult,
  type StreamEvent,
  type ToolCall,
  type TokenUsage,
  type Message,
  type ContentBlock,
} from './types.js';
import { BaseAdapter, adapterRegistry } from './base.js';

/**
 * HTTP 请求方法
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * HTTP 响应
 */
interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

/**
 * 提取消息中的文本内容
 * 支持 string | Message[] 类型的输入
 */
function extractInputText(input: string | Message[]): string {
  if (typeof input === 'string') {
    return input;
  }

  // 处理 Message[] 数组
  return input
    .map(msg => {
      if (typeof msg.content === 'string') {
        return msg.content;
      }
      // 处理 ContentBlock[]
      return msg.content
        .filter(
          (block): block is ContentBlock & { text: string } => block.type === 'text' && !!block.text
        )
        .map(block => block.text)
        .join('');
    })
    .join('\n');
}

/**
 * HTTP Adapter 配置选项
 */
interface HttpRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * HTTP Adapter 实现类
 *
 * 功能特性：
 * - 支持 GET/POST/PUT/DELETE/PATCH 请求方法
 * - 可配置超时（默认 30s）
 * - 自动重试机制（指数退避，最多 3 次）
 * - SSE 流式响应支持
 * - 连接池复用
 * - 完整的错误处理
 *
 * @example
 * ```typescript
 * const adapter = new HttpAdapter({
 *   type: 'http',
 *   baseUrl: 'https://api.example.com',
 *   apiKey: 'your-api-key',
 *   timeout: 30000,
 *   retryCount: 3,
 * });
 *
 * await adapter.connect();
 * const response = await adapter.invoke({
 *   id: 'req-001',
 *   input: 'Hello',
 * });
 * ```
 */
export class HttpAdapter extends BaseAdapter {
  readonly config: HttpAdapterConfig;

  constructor(config: HttpAdapterConfig, id?: string) {
    super(config, id);
    this.config = {
      timeout: 30000,
      retryCount: 3,
      enableStreaming: true,
      headers: {},
      ...config,
    };
  }

  /**
   * 获取默认请求头
   */
  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AgentFabric-HTTP-Adapter/1.0',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * 合并请求头
   */
  private mergeHeaders(
    ...headerSets: (Record<string, string> | undefined)[]
  ): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const headers of headerSets) {
      if (headers) {
        Object.assign(merged, headers);
      }
    }
    return merged;
  }

  /**
   * 构建完整 URL
   */
  private buildURL(path?: string): string {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    if (!path) return baseUrl;
    const cleanPath = path.replace(/^\//, '');
    return `${baseUrl}/${cleanPath}`;
  }

  /**
   * 序列化请求体
   */
  private serializeBody(body: unknown): string | undefined {
    if (body === undefined || body === null) {
      return undefined;
    }
    if (typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  }

  /**
   * 解析响应体
   */
  private async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  }

  /**
   * 将 HTTP 状态码映射为错误码
   */
  private mapStatusCodeToError(status: number): string {
    if (status === 401 || status === 403) {
      return 'AUTHENTICATION_ERROR';
    }
    if (status === 429) {
      return 'RATE_LIMIT_ERROR';
    }
    if (status >= 500) {
      return 'INTERNAL_ERROR';
    }
    if (status >= 400) {
      return 'INVALID_REQUEST';
    }
    return 'INTERNAL_ERROR';
  }

  /**
   * 处理 HTTP 错误响应
   */
  private handleHttpError(status: number, statusText: string, data: unknown): never {
    const code = this.mapStatusCodeToError(status);
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    throw this.createError(
      code as import('./types.js').AdapterErrorCode,
      `HTTP ${status} ${statusText}: ${message || '请求失败'}`
    );
  }

  /**
   * 执行 HTTP 请求（核心方法）
   * 包含重试机制和超时控制
   */
  private async executeRequest<T>(
    url: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const { method = 'GET', headers, body, timeout } = options;

    const fetchOptions: RequestInit = {
      method,
      headers: this.mergeHeaders(this.getDefaultHeaders(), this.config.headers, headers),
      body: this.serializeBody(body),
    };

    // 使用基类的重试机制
    const response = await this.retry(async () => {
      return this.executeWithTimeout(async () => {
        const res = await fetch(url, fetchOptions);

        if (!res.ok) {
          const data = await this.parseResponse(res);
          this.handleHttpError(res.status, res.statusText, data);
        }

        return res;
      }, timeout || this.config.timeout);
    }, this.config.retryCount);

    const data = (await this.parseResponse(response)) as T;

    // 转换响应头为普通对象
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
    };
  }

  /**
   * 建立连接
   * HTTP 是无状态协议，此方法验证配置有效性
   */
  protected async doConnect(): Promise<void> {
    if (!this.config.baseUrl) {
      throw this.createError('CONNECTION_ERROR', '缺少必需的 baseUrl 配置');
    }

    // 验证 URL 格式
    try {
      new URL(this.config.baseUrl);
    } catch {
      throw this.createError('CONNECTION_ERROR', `无效的 baseUrl: ${this.config.baseUrl}`);
    }

    // 尝试简单请求验证连接
    try {
      await this.executeWithTimeout(async () => {
        const response = await fetch(this.config.baseUrl, {
          method: 'HEAD',
          headers: this.getDefaultHeaders(),
        });
        // 任何响应（包括 404）都表示服务器可达
        return response;
      }, 10000);
    } catch (error) {
      // 连接验证失败，但不一定阻止使用（可能是服务器不支持 HEAD）
      console.warn(`[HttpAdapter:${this.id}] 连接验证警告:`, error);
    }
  }

  /**
   * 断开连接
   * HTTP 不需要显式断开
   */
  protected async doDisconnect(): Promise<void> {
    // HTTP 是无状态协议，不需要断开操作
  }

  /**
   * 执行非流式调用
   * 将 AgentRequest 转换为 HTTP 请求
   */
  protected async doInvoke(request: AgentRequest): Promise<AgentResponse> {
    const textInput = extractInputText(request.input);

    // 构建请求体（OpenAI 兼容格式）
    const requestBody = {
      model: this.config.model || 'default',
      messages: [
        ...(request.systemPrompt
          ? [{ role: 'system' as const, content: request.systemPrompt }]
          : []),
        { role: 'user' as const, content: textInput },
      ],
      temperature: request.parameters?.temperature ?? 0.7,
      max_tokens: request.parameters?.maxTokens,
      top_p: request.parameters?.topP,
      stop: request.parameters?.stopSequences,
      stream: false,
      ...(request.tools && request.tools.length > 0
        ? { tools: request.tools, tool_choice: 'auto' }
        : {}),
    };

    const response = await this.executeRequest<{
      id?: string;
      choices?: Array<{
        message?: {
          content?: string;
          role?: string;
          tool_calls?: ToolCall[];
        };
        finish_reason?: string;
      }>;
      usage?: TokenUsage;
      error?: { message: string };
    }>(this.buildURL('/v1/chat/completions'), {
      method: 'POST',
      body: requestBody,
    });

    const data = response.data;

    // 检查 API 返回的错误
    if (data.error) {
      throw this.createError('INTERNAL_ERROR', data.error.message);
    }

    const choice = data.choices?.[0];
    if (!choice) {
      throw this.createError('INTERNAL_ERROR', '无效的响应格式：缺少 choices');
    }

    // 构建响应
    const agentResponse: AgentResponse = {
      requestId: request.id,
      output: choice.message?.content || '',
      metadata: {
        model: this.config.model,
      },
      finishReason: this.mapFinishReason(choice.finish_reason),
    };

    // 添加工具调用（如果有）
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      agentResponse.toolCalls = choice.message.tool_calls;
    }

    // 添加使用统计（如果有）
    if (data.usage) {
      agentResponse.usage = data.usage;
    }

    return agentResponse;
  }

  /**
   * 映射完成原因
   */
  private mapFinishReason(reason?: string): 'stop' | 'length' | 'tool_calls' | 'error' | undefined {
    if (!reason) return undefined;
    if (reason === 'stop') return 'stop';
    if (reason === 'length') return 'length';
    if (reason === 'tool_calls') return 'tool_calls';
    return 'error';
  }

  /**
   * 执行流式调用（SSE）
   * 支持 Server-Sent Events 流式响应
   */
  protected async *doStream(request: AgentRequest): StreamResponse {
    const textInput = extractInputText(request.input);

    // 构建请求体
    const requestBody = {
      model: this.config.model || 'default',
      messages: [
        ...(request.systemPrompt
          ? [{ role: 'system' as const, content: request.systemPrompt }]
          : []),
        { role: 'user' as const, content: textInput },
      ],
      temperature: request.parameters?.temperature ?? 0.7,
      max_tokens: request.parameters?.maxTokens,
      top_p: request.parameters?.topP,
      stop: request.parameters?.stopSequences,
      stream: true,
      ...(request.tools && request.tools.length > 0
        ? { tools: request.tools, tool_choice: 'auto' }
        : {}),
    };

    const url = this.buildURL('/v1/chat/completions');
    const headers = this.mergeHeaders(this.getDefaultHeaders(), this.config.headers, {
      Accept: 'text/event-stream',
    });

    // 使用重试机制执行流式请求
    const response = await this.retry(async () => {
      return this.executeWithTimeout(async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const data = await this.parseResponse(res);
          this.handleHttpError(res.status, res.statusText, data);
        }

        return res;
      }, this.config.timeout);
    }, this.config.retryCount);

    if (!response.body) {
      throw this.createError('STREAM_ERROR', '响应没有 body');
    }

    // 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasEmittedContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // 发送完成事件
          const finishEvent: StreamEvent = {
            type: 'done',
            requestId: request.id,
            finishReason: hasEmittedContent ? 'stop' : undefined,
          };
          yield finishEvent;
          break;
        }

        // 解码并处理 SSE 数据
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const event = this.parseSSELine(line, request.id);
          if (event) {
            if (event.type === 'content') {
              hasEmittedContent = true;
            }
            yield event;
          }
        }
      }
    } catch (error) {
      // 发送错误事件
      const errorEvent: StreamEvent = {
        type: 'error',
        requestId: request.id,
        error: this.normalizeError(error, 'STREAM_ERROR'),
      };
      yield errorEvent;
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 解析 SSE 行
   */
  private parseSSELine(line: string, requestId: string): StreamEvent | null {
    const trimmed = line.trim();

    // 忽略空行和注释
    if (!trimmed || trimmed.startsWith(':')) {
      return null;
    }

    // 解析 SSE 格式: data: {...}
    if (trimmed.startsWith('data: ')) {
      const data = trimmed.slice(6);

      // 结束标记
      if (data === '[DONE]') {
        return {
          type: 'done',
          requestId,
          finishReason: 'stop',
        };
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string;
              role?: string;
              tool_calls?: ToolCall[];
            };
            finish_reason?: string;
          }>;
          usage?: TokenUsage;
          error?: { message: string };
        };

        // 检查错误
        if (parsed.error) {
          return {
            type: 'error',
            requestId,
            error: this.createError('INTERNAL_ERROR', parsed.error.message),
          };
        }

        const delta = parsed.choices?.[0]?.delta;
        const finishReason = parsed.choices?.[0]?.finish_reason;

        // 如果有完成原因，发送 done 事件
        if (finishReason) {
          return {
            type: 'done',
            requestId,
            finishReason: this.mapFinishReason(finishReason),
            usage: parsed.usage,
          };
        }

        // 如果有内容增量，发送 content 事件
        if (delta?.content) {
          return {
            type: 'content',
            requestId,
            delta: delta.content,
          };
        }

        // 如果有工具调用
        if (delta?.tool_calls) {
          return {
            type: 'tool_call',
            requestId,
            toolCall: delta.tool_calls[0],
          };
        }
      } catch (error) {
        // JSON 解析失败，忽略（可能是心跳或其他格式）
        console.warn('[HttpAdapter] SSE 数据解析失败:', error);
      }
    }

    return null;
  }

  /**
   * 执行健康检查
   */
  protected async doHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // 尝试简单请求检查服务健康
      const response = await fetch(this.config.baseUrl, {
        method: 'HEAD',
        headers: this.getDefaultHeaders(),
      });

      const latency = Date.now() - startTime;

      return {
        healthy: true,
        status: 'connected',
        latency,
        message: `HTTP 服务健康（状态码: ${response.status}）`,
        checkedAt: Date.now(),
        details: {
          statusCode: response.status,
          baseUrl: this.config.baseUrl,
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        healthy: false,
        status: 'error',
        latency,
        message: `健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: Date.now(),
        details: {
          baseUrl: this.config.baseUrl,
          error: String(error),
        },
      };
    }
  }

  /**
   * 通用 HTTP 请求方法（供外部直接使用）
   * @param path - 请求路径
   * @param options - 请求选项
   */
  async request<T>(path: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.executeRequest<T>(this.buildURL(path), options);
  }

  /**
   * GET 请求快捷方法
   */
  async get<T>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>(path, { method: 'GET', headers });
  }

  /**
   * POST 请求快捷方法
   */
  async post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { method: 'POST', body, headers });
  }

  /**
   * PUT 请求快捷方法
   */
  async put<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { method: 'PUT', body, headers });
  }

  /**
   * DELETE 请求快捷方法
   */
  async delete<T>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>(path, { method: 'DELETE', headers });
  }
}

// 注册到适配器注册表
adapterRegistry.register('http', config => new HttpAdapter(config as HttpAdapterConfig));

export default HttpAdapter;
