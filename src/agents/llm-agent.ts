/**
 * LLM Agent 实现
 * 基于 OpenAI SDK 的大模型调用实现
 *
 * @module agents/llm-agent
 * @description 提供非流式和流式 LLM 调用功能
 */

import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { ClientOptions } from 'openai';
import { logger } from '../lib/logger.js';
import type {
  Message,
  ToolDefinition,
  TokenUsage,
  HealthCheckResult,
} from '../adapters/types.js';
import { BaseAdapter } from '../adapters/base.js';
import type { HttpAdapterConfig } from '../adapters/types.js';
import {
  type LLMAgentConfig,
  type LLMAgentOptions,
  type LLMResponse,
  type LLMStreamEvent,
  validateLLMConfig,
  generateAgentId,
} from './types.js';

// =============================================================================
// LLM Agent 适配器配置
// =============================================================================

/**
 * LLM Agent 适配器配置
 */
export interface LLMAdapterConfig extends Omit<HttpAdapterConfig, 'baseUrl'> {
  type: 'http';
  /** 提供商 */
  provider: 'openai' | 'azure' | 'custom' | 'anthropic';
  /** 模型名称 */
  model: string;
  /** 基础 URL（可选） */
  baseUrl?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** Top-P */
  topP?: number;
  /** 停止序列 */
  stopSequences?: string[];
}

// =============================================================================
// LLM Agent 实现
// =============================================================================

/**
 * LLM Agent 类
 * 实现基于 OpenAI SDK 的大模型调用
 */
export class LLMAgent extends BaseAdapter {
  /** Agent ID */
  readonly agentId: string;
  
  /** Agent 名称 */
  readonly name: string;
  
  /** LLM 配置 */
  private llmConfig: LLMAgentConfig;
  
  /** OpenAI 客户端 */
  private client: OpenAI | null = null;
  
  /** 可用工具 */
  private tools: ToolDefinition[];
  
  /**
   * 是否支持流式输出
   */
  get supportsStreaming(): boolean {
    return this.config.enableStreaming ?? true;
  }

  /**
   * 构造函数
   * @param options - 初始化选项
   */
  constructor(options: LLMAgentOptions) {
    const agentId = options.id || generateAgentId();
    
    // 构建符合 HttpAdapterConfig 的配置
    const adapterConfig: HttpAdapterConfig = {
      type: 'http',
      name: options.name,
      baseUrl: options.config.baseUrl || 'https://api.openai.com/v1',
      apiKey: options.config.apiKey,
      timeout: options.config.timeout || 60000,
      enableStreaming: options.enableStreaming ?? true,
    };
    
    super(adapterConfig, agentId);
    
    // 验证配置
    validateLLMConfig(options.config);
    
    this.agentId = agentId;
    this.name = options.name;
    this.llmConfig = { ...options.config };
    this.tools = options.tools || [];
    // enableStreaming 通过 getter 从父类 config 获取
    
    logger.info(`[LLMAgent:${this.agentId}] 创建成功: ${this.name} (${this.llmConfig.model})`);
  }

  // ===========================================================================
  // 配置管理
  // ===========================================================================

  /**
   * 获取当前 LLM 配置
   */
  getConfig(): LLMAgentConfig {
    return { ...this.llmConfig };
  }

  /**
   * 更新配置（部分更新）
   * @param config - 新的配置
   */
  updateConfig(config: Partial<LLMAgentConfig>): void {
    const newConfig = { ...this.llmConfig, ...config };
    validateLLMConfig(newConfig);
    this.llmConfig = newConfig;
    
    // 如果关键配置变更，需要重新创建客户端
    if (config.apiKey || config.baseUrl || config.provider) {
      this.client = null;
    }
    
    logger.info(`[LLMAgent:${this.agentId}] 配置已更新`);
  }

  /**
   * 设置可用工具
   * @param tools - 工具定义列表
   */
  setTools(tools: ToolDefinition[]): void {
    this.tools = tools;
  }

  // ===========================================================================
  // 连接管理（BaseAdapter 抽象方法实现）
  // ===========================================================================

  /**
   * 建立连接（创建 OpenAI 客户端）
   */
  protected async doConnect(): Promise<void> {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      throw new Error('OpenAI API Key 未配置');
    }
    
    const clientConfig: ClientOptions = {
      apiKey,
      timeout: this.llmConfig.timeout || 60000,
      baseURL: this.llmConfig.baseUrl,
    };
    
    this.client = new OpenAI(clientConfig);
    
    logger.info(`[LLMAgent:${this.agentId}] OpenAI 客户端已创建`);
  }

  /**
   * 断开连接
   */
  protected async doDisconnect(): Promise<void> {
    this.client = null;
    logger.info(`[LLMAgent:${this.agentId}] 已断开连接`);
  }

  // ===========================================================================
  // 调用方法（BaseAdapter 抽象方法实现）
  // ===========================================================================

  /**
   * 执行非流式调用
   * @param request - Agent 请求
   */
  protected async doInvoke(request: import('../adapters/types.js').AgentRequest): Promise<import('../adapters/types.js').AgentResponse> {
    if (!this.client) {
      throw new Error('OpenAI 客户端未初始化，请先调用 connect()');
    }
    
    const messages = this.buildOpenAIMessages(
      request.systemPrompt || this.llmConfig.systemPrompt,
      request.input
    );
    
    const tools = this.buildOpenAITools(request.tools || this.tools);
    
    try {
      const response: ChatCompletion = await this.client.chat.completions.create({
        model: this.llmConfig.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: this.llmConfig.temperature,
        max_tokens: this.llmConfig.maxTokens,
        top_p: this.llmConfig.topP,
        stop: this.llmConfig.stopSequences,
        ...this.llmConfig.extraParams,
      });
      
      const choice = response.choices[0];
      const message = choice.message;
      
      // 构建响应
      const llmResponse: LLMResponse = {
        requestId: request.id,
        output: message.content || '',
        toolCalls: message.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        })),
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        metadata: {
          model: response.model,
          provider: this.llmConfig.provider,
          responseTime: 0, // 由 BaseAdapter 填充
          createdAt: Date.now(),
          finishReason: choice.finish_reason || 'stop',
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        model: response.model,
        provider: this.llmConfig.provider,
      };
      
      logger.debug(`[LLMAgent:${this.agentId}] 调用成功: ${llmResponse.usage.totalTokens} tokens`);
      
      return llmResponse;
    } catch (error) {
      logger.error(`[LLMAgent:${this.agentId}] 调用失败:`, error);
      throw this.normalizeOpenAIError(error);
    }
  }

  /**
   * 执行流式调用
   * @param request - Agent 请求
   */
  protected async *doStream(request: import('../adapters/types.js').AgentRequest): import('../adapters/types.js').StreamResponse {
    if (!this.client) {
      throw new Error('OpenAI 客户端未初始化，请先调用 connect()');
    }
    
    const messages = this.buildOpenAIMessages(
      request.systemPrompt || this.llmConfig.systemPrompt,
      request.input
    );
    
    const tools = this.buildOpenAITools(request.tools || this.tools);
    
    try {
      const stream = await this.client.chat.completions.create({
        model: this.llmConfig.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: this.llmConfig.temperature,
        max_tokens: this.llmConfig.maxTokens,
        top_p: this.llmConfig.topP,
        stop: this.llmConfig.stopSequences,
        stream: true,
        ...this.llmConfig.extraParams,
      });
      
      let usage: TokenUsage | undefined;
      
      for await (const chunk of stream) {
        const event = this.parseStreamChunk(chunk, request.id);
        
        if (event.type === 'done' && 'usage' in event && event.usage) {
          usage = event.usage;
        }
        
        // 转换为标准 StreamEvent
        if (event.type === 'content') {
          yield {
            type: 'content',
            requestId: request.id,
            delta: event.delta || '',
          };
        } else if (event.type === 'done') {
          yield {
            type: 'done',
            requestId: request.id,
            finishReason: event.finishReason as 'stop' | 'length' | 'tool_calls' | 'error',
            usage: event.usage,
          };
        }
      }
      
      logger.debug(`[LLMAgent:${this.agentId}] 流式调用完成${usage ? `: ${usage.totalTokens} tokens` : ''}`);
    } catch (error) {
      logger.error(`[LLMAgent:${this.agentId}] 流式调用失败:`, error);
      
      const normalizedError = this.normalizeOpenAIError(error);
      yield {
        type: 'error',
        requestId: request.id,
        error: {
          code: normalizedError.code,
          message: normalizedError.message,
          retryable: normalizedError.retryable,
        },
      };
    }
  }

  // ===========================================================================
  // 健康检查（BaseAdapter 抽象方法实现）
  // ===========================================================================

  /**
   * 执行健康检查
   */
  protected async doHealthCheck(): Promise<HealthCheckResult> {
    if (!this.client) {
      return {
        healthy: false,
        status: 'error',
        message: 'OpenAI 客户端未初始化',
        checkedAt: Date.now(),
      };
    }
    
    try {
      const startTime = Date.now();
      
      // 发送一个简单的请求来验证连接
      await this.client.chat.completions.create({
        model: this.llmConfig.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
      });
      
      const latency = Date.now() - startTime;
      
      return {
        healthy: true,
        status: 'connected',
        latency,
        message: `LLM Agent 健康，延迟 ${latency}ms`,
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        message: `健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: Date.now(),
      };
    }
  }

  // ===========================================================================
  // 私有工具方法
  // ===========================================================================

  /**
   * 获取 API Key
   */
  private getApiKey(): string | undefined {
    // 优先使用配置中的 API Key
    if (this.llmConfig.apiKey) {
      return this.llmConfig.apiKey;
    }
    
    // 从环境变量获取
    if (this.llmConfig.provider === 'openai') {
      return process.env.OPENAI_API_KEY;
    }
    
    return undefined;
  }

  /**
   * 构建 OpenAI 消息格式
   */
  private buildOpenAIMessages(
    systemPrompt: string | undefined,
    input: string | Message[]
  ): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];
    
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }
    
    if (typeof input === 'string') {
      messages.push({
        role: 'user',
        content: input,
      });
    } else {
      for (const msg of input) {
        // 跳过 system 消息（已单独处理）
        if (msg.role === 'system') continue;
        
        if (msg.role === 'tool') {
          // 工具消息需要特殊处理，这里简化处理
          continue;
        }
        messages.push({
          role: msg.role,
          content: typeof msg.content === 'string' 
            ? msg.content 
            : msg.content.map(c => c.text || '').join(''),
        } as ChatCompletionMessageParam);
      }
    }
    
    return messages;
  }

  /**
   * 构建 OpenAI 工具格式
   */
  private buildOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(chunk: ChatCompletionChunk, _requestId: string): LLMStreamEvent {
    const choice = chunk.choices[0];
    
    if (!choice) {
      // 可能是 usage 信息
      if (chunk.usage) {
        return {
          type: 'done',
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }
      return { type: 'content', delta: '' };
    }
    
    const delta = choice.delta;
    
    // 工具调用
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      const toolCall = delta.tool_calls[0];
      return {
        type: 'tool_call',
        toolCall: {
          id: toolCall.id || '',
          name: toolCall.function?.name || '',
          arguments: toolCall.function?.arguments || '',
        },
      };
    }
    
    // 内容增量
    if (delta.content) {
      return {
        type: 'content',
        delta: delta.content,
      };
    }
    
    // 完成
    if (choice.finish_reason) {
      return {
        type: 'done',
        finishReason: choice.finish_reason,
      };
    }
    
    return { type: 'content', delta: '' };
  }

  /**
   * 映射完成原因
   */
  private mapFinishReason(
    reason: string | null | undefined
  ): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  /**
   * 标准化 OpenAI 错误
   */
  private normalizeOpenAIError(error: unknown): {
    code: import('../adapters/types.js').AdapterErrorCode;
    message: string;
    retryable?: boolean;
  } {
    if (error instanceof OpenAI.APIError) {
      const code = error.status === 401 
        ? 'AUTHENTICATION_ERROR' 
        : error.status === 429 
          ? 'RATE_LIMIT_ERROR' 
          : error.status === 408 || error.code === 'ETIMEDOUT'
            ? 'TIMEOUT_ERROR'
            : 'INTERNAL_ERROR';
      
      return {
        code,
        message: error.message || 'OpenAI API 错误',
        retryable: code === 'RATE_LIMIT_ERROR' || code === 'TIMEOUT_ERROR' || code === 'INTERNAL_ERROR',
      };
    }
    
    if (error instanceof Error) {
      return {
        code: 'INTERNAL_ERROR',
        message: error.message,
        retryable: true,
      };
    }
    
    return {
      code: 'INTERNAL_ERROR',
      message: '未知错误',
      retryable: true,
    };
  }
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建 LLM Agent
 * @param options - 初始化选项
 */
export function createLLMAgent(options: LLMAgentOptions): LLMAgent {
  return new LLMAgent(options);
}

export default LLMAgent;
