/**
 * MCP (Model Context Protocol) Adapter 实现
 *
 * @module adapters/mcp-adapter
 * @description 实现基于 stdio 传输的 MCP 协议适配器
 *
 * 特性：
 * - 启动和管理 MCP Server 进程
 * - JSON-RPC 2.0 通信
 * - Tools 能力发现和调用
 * - 进程异常检测和自动清理
 */

import { ChildProcess, spawn } from 'child_process';
import { BaseAdapter } from './base.js';
import {
  type AgentRequest,
  type AgentResponse,
  type StreamResponse,
  type McpAdapterConfig,
  type HealthCheckResult,
  type ToolDefinition,
  type StreamEvent,
} from './types.js';
import {
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcResponse,
  type McpTool,
  type ToolsListResult,
  type ToolsCallResult,
  type InitializeResult,
  type ServerCapabilities,
  MCP_PROTOCOL_VERSION,
  createJsonRpcRequest,
  createJsonRpcNotification,
  parseJsonRpcMessages,
  serializeJsonRpcMessage,
} from './mcp/protocol.js';

/**
 * 待处理的请求
 */
interface PendingRequest {
  id: JsonRpcId;
  resolve: (value: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * MCP Adapter 配置选项
 */
export interface McpAdapterOptions {
  /** 命令 */
  command: string;
  /** 参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;
  /** 初始化超时时间（毫秒） */
  initTimeout?: number;
  /** 请求超时时间（毫秒） */
  requestTimeout?: number;
}

/**
 * MCP Adapter 实现
 *
 * 通过 stdio 与本地 MCP Server 进程通信，支持：
 * - 进程生命周期管理（启动、监控、终止）
 * - JSON-RPC 消息通信
 * - Tools 发现和调用
 * - 健康检查
 */
export class McpAdapter extends BaseAdapter {
  private process: ChildProcess | null = null;
  private requestIdCounter = 0;
  private pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private messageBuffer = '';
  private serverCapabilities: ServerCapabilities = {};
  private toolsCache: McpTool[] = [];
  private toolsCacheTime = 0;
  private readonly toolsCacheTtl = 60000; // 1 分钟缓存
  private initTimeout: number;
  private requestTimeout: number;

  constructor(config: McpAdapterConfig, id?: string) {
    super(config, id);

    const mcpConfig = config as McpAdapterConfig & McpAdapterOptions;
    this.initTimeout = mcpConfig.initTimeout ?? 30000;
    this.requestTimeout = mcpConfig.requestTimeout ?? 60000;
  }

  /**
   * 获取适配器配置（类型安全访问）
   */
  private get mcpConfig(): McpAdapterConfig & McpAdapterOptions {
    return this.config as McpAdapterConfig & McpAdapterOptions;
  }

  // ===========================================================================
  // 连接管理
  // ===========================================================================

  /**
   * 建立与 MCP Server 的连接
   * 启动子进程并执行初始化握手
   */
  protected async doConnect(): Promise<void> {
    const { command, args = [], env, cwd } = this.mcpConfig;

    // 启动 MCP Server 进程
    this.process = spawn(command, args, {
      env: { ...process.env, ...env },
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 设置进程事件监听
    this.setupProcessHandlers();

    // 设置消息处理
    this.setupMessageHandling();

    // 等待进程启动
    await this.waitForProcessReady();

    // 执行 MCP 初始化握手
    await this.performInitialization();
  }

  /**
   * 断开与 MCP Server 的连接
   * 优雅地关闭进程
   */
  protected async doDisconnect(): Promise<void> {
    // 清理待处理的请求
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timer);
      request.reject(new Error('Adapter disconnected'));
      this.pendingRequests.delete(id);
    }

    // 发送关闭通知
    if (this.process?.stdin?.writable) {
      try {
        const notification = createJsonRpcNotification('notifications/initialized', {});
        this.process.stdin.write(serializeJsonRpcMessage(notification));
      } catch {
        // 忽略发送错误
      }
    }

    // 终止进程
    await this.terminateProcess();
  }

  /**
   * 设置进程事件处理器
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    // 进程退出
    this.process.on('exit', (code, signal) => {
      console.log(`[McpAdapter:${this.id}] 进程退出: code=${code}, signal=${signal}`);
      this._status = 'error';
      this.emit('error', {
        code: 'CONNECTION_ERROR',
        message: `MCP Server 进程退出 (code: ${code}, signal: ${signal})`,
      });
      this.cleanup();
    });

    // 进程错误
    this.process.on('error', error => {
      console.error(`[McpAdapter:${this.id}] 进程错误:`, error);
      this._status = 'error';
      this.emit('error', {
        code: 'CONNECTION_ERROR',
        message: `MCP Server 进程错误: ${error.message}`,
        cause: error,
      });
    });

    // stderr 输出（通常是日志）
    this.process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString('utf8').trim();
      if (output) {
        console.log(`[McpAdapter:${this.id}] Server log:`, output);
      }
    });
  }

  /**
   * 设置消息处理
   */
  private setupMessageHandling(): void {
    if (!this.process?.stdout) return;

    this.process.stdout.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString('utf8');
      this.processMessageBuffer();
    });

    this.process.stdout.on('error', error => {
      console.error(`[McpAdapter:${this.id}] 标准输出错误:`, error);
    });
  }

  /**
   * 处理消息缓冲区
   */
  private processMessageBuffer(): void {
    const lines = this.messageBuffer.split('\n');

    // 保留最后一个不完整的行
    this.messageBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const messages = parseJsonRpcMessages(trimmed);
        for (const message of messages) {
          this.handleMessage(message);
        }
      } catch (error) {
        console.error(`[McpAdapter:${this.id}] 消息解析错误:`, error);
      }
    }
  }

  /**
   * 处理接收到的 JSON-RPC 消息
   */
  private handleMessage(message: JsonRpcMessage): void {
    // 处理响应
    if ('id' in message && ('result' in message || 'error' in message)) {
      const response = message as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(`RPC Error ${response.error.code}: ${response.error.message}`));
        } else {
          pending.resolve(response);
        }
      }
      return;
    }

    // 处理通知（如工具列表变更）
    if ('method' in message && !('id' in message)) {
      this.handleNotification(message.method, message.params);
    }
  }

  /**
   * 处理服务器通知
   */
  private handleNotification(method: string, params?: Record<string, unknown>): void {
    switch (method) {
      case 'notifications/tools/list_changed':
        console.log(`[McpAdapter:${this.id}] Tools 列表已变更`);
        this.toolsCache = []; // 清除缓存
        break;
      case 'notifications/resources/list_changed':
        console.log(`[McpAdapter:${this.id}] Resources 列表已变更`);
        break;
      case 'notifications/prompts/list_changed':
        console.log(`[McpAdapter:${this.id}] Prompts 列表已变更`);
        break;
      default:
        console.log(`[McpAdapter:${this.id}] 收到通知:`, method, params);
    }
  }

  /**
   * 等待进程就绪
   */
  private waitForProcessReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Process not spawned'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('MCP Server 进程启动超时'));
      }, this.initTimeout);

      this.process.once('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.process.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * 执行 MCP 初始化握手
   */
  private async performInitialization(): Promise<void> {
    const initRequest = createJsonRpcRequest(this.generateRequestId(), 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: true },
      },
      clientInfo: {
        name: 'agent-fabric',
        version: '1.0.0',
      },
    });

    const response = await this.sendRequest(initRequest, this.initTimeout);

    if (response.error) {
      throw new Error(`初始化失败: ${response.error.message}`);
    }

    const result = response.result as InitializeResult;
    this.serverCapabilities = result.capabilities;

    console.log(
      `[McpAdapter:${this.id}] 已连接到 ${result.serverInfo.name} v${result.serverInfo.version}`
    );

    // 发送初始化完成通知
    this.sendNotification('notifications/initialized', {});
  }

  /**
   * 终止进程
   */
  private async terminateProcess(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;

    // 尝试优雅关闭
    if (!proc.killed) {
      proc.kill('SIGTERM');

      // 等待进程退出或超时
      await Promise.race([
        new Promise<void>(resolve => proc.once('exit', resolve)),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ]);

      // 如果进程仍在运行，强制终止
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }

    this.process = null;
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.process = null;
    this.toolsCache = [];
    this.messageBuffer = '';

    // 拒绝所有待处理的请求
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timer);
      request.reject(new Error('MCP Server 连接已断开'));
      this.pendingRequests.delete(id);
    }
  }

  // ===========================================================================
  // 调用方法
  // ===========================================================================

  /**
   * 执行非流式调用
   * 将 Agent 请求转换为 MCP Tool 调用
   */
  protected async doInvoke(request: AgentRequest): Promise<AgentResponse> {
    const toolName = this.extractToolName(request);
    const toolArgs = this.extractToolArguments(request);

    // 调用 MCP Tool
    const result = await this.callTool(toolName, toolArgs);

    // 转换响应格式
    const output = this.convertToolResultToOutput(result);

    return {
      requestId: request.id,
      output,
      metadata: {
        model: `mcp:${this.mcpConfig.serverName || 'unknown'}`,
        createdAt: Date.now(),
      },
      finishReason: result.isError ? 'error' : 'stop',
    };
  }

  /**
   * 执行流式调用
   * MCP 协议本身不直接支持流式，这里模拟流式输出
   */
  protected async *doStream(request: AgentRequest): StreamResponse {
    try {
      // 发送开始事件
      yield this.createStreamEvent(request.id, 'content', { delta: '' });

      // 执行调用
      const result = await this.doInvoke(request);

      // 分段输出结果
      const output =
        typeof result.output === 'string'
          ? result.output
          : result.output.map(b => b.text || '').join('');

      // 模拟流式输出（按行分割）
      const lines = output.split('\n');
      for (const line of lines) {
        yield this.createStreamEvent(request.id, 'content', { delta: line + '\n' });
      }

      // 发送完成事件
      yield this.createStreamEvent(request.id, 'done', {
        finishReason: result.finishReason,
        usage: result.usage,
      });
    } catch (error) {
      yield this.createStreamEvent(request.id, 'error', {
        error: this.normalizeError(error, 'INTERNAL_ERROR'),
      });
    }
  }

  /**
   * 创建流式事件
   */
  private createStreamEvent(
    requestId: string,
    type: StreamEvent['type'],
    data: Partial<StreamEvent>
  ): StreamEvent {
    return {
      type,
      requestId,
      ...data,
    } as StreamEvent;
  }

  // ===========================================================================
  // Tool 调用
  // ===========================================================================

  /**
   * 调用 MCP Tool
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<ToolsCallResult> {
    const response = await this.sendRequest(
      createJsonRpcRequest(this.generateRequestId(), 'tools/call', {
        name,
        arguments: args,
      }),
      this.requestTimeout
    );

    if (response.error) {
      throw new Error(`Tool 调用失败: ${response.error.message}`);
    }

    return response.result as ToolsCallResult;
  }

  /**
   * 获取 MCP Tools 列表
   */
  async listTools(): Promise<McpTool[]> {
    // 使用缓存
    const now = Date.now();
    if (this.toolsCache.length > 0 && now - this.toolsCacheTime < this.toolsCacheTtl) {
      return this.toolsCache;
    }

    const response = await this.sendRequest(
      createJsonRpcRequest(this.generateRequestId(), 'tools/list', {}),
      this.requestTimeout
    );

    if (response.error) {
      throw new Error(`获取 Tools 列表失败: ${response.error.message}`);
    }

    const result = response.result as ToolsListResult;
    this.toolsCache = result.tools;
    this.toolsCacheTime = now;

    return result.tools;
  }

  /**
   * 将 MCP Tool 转换为 ToolDefinition
   */
  async getToolDefinitions(): Promise<ToolDefinition[]> {
    const tools = await this.listTools();
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema.properties || {},
    }));
  }

  // ===========================================================================
  // 健康检查
  // ===========================================================================

  /**
   * 执行健康检查
   */
  protected async doHealthCheck(): Promise<HealthCheckResult> {
    if (!this.process || this.process.killed) {
      return {
        healthy: false,
        status: 'error',
        message: 'MCP Server 进程未运行',
        checkedAt: Date.now(),
      };
    }

    const startTime = Date.now();

    try {
      // 尝试获取工具列表作为健康检查
      await this.listTools();

      return {
        healthy: true,
        status: 'connected',
        latency: Date.now() - startTime,
        message: 'MCP Server 运行正常',
        checkedAt: Date.now(),
        details: {
          serverCapabilities: this.serverCapabilities,
          cachedToolsCount: this.toolsCache.length,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        latency: Date.now() - startTime,
        message: `健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: Date.now(),
      };
    }
  }

  // ===========================================================================
  // JSON-RPC 通信
  // ===========================================================================

  /**
   * 发送 JSON-RPC 请求并等待响应
   */
  private sendRequest(
    request: { id: JsonRpcId; method: string; params?: Record<string, unknown> },
    timeout: number
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('MCP Server 未连接'));
        return;
      }

      const id = request.id;

      // 设置超时
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`请求超时（${timeout}ms）`));
      }, timeout);

      // 存储待处理请求
      this.pendingRequests.set(id, {
        id,
        resolve,
        reject,
        timer,
      });

      // 发送请求
      const message = createJsonRpcRequest(id, request.method, request.params);
      const data = serializeJsonRpcMessage(message);

      try {
        this.process.stdin.write(data, error => {
          if (error) {
            clearTimeout(timer);
            this.pendingRequests.delete(id);
            reject(error);
          }
        });
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * 发送通知（不需要响应）
   */
  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) return;

    try {
      const notification = createJsonRpcNotification(method, params);
      this.process.stdin.write(serializeJsonRpcMessage(notification));
    } catch (error) {
      console.error(`[McpAdapter:${this.id}] 发送通知失败:`, error);
    }
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): number {
    return ++this.requestIdCounter;
  }

  // ===========================================================================
  // 工具方法
  // ===========================================================================

  /**
   * 从 AgentRequest 提取 Tool 名称
   */
  private extractToolName(request: AgentRequest): string {
    // 从 metadata 中获取 tool 名称
    if (request.metadata?.toolName) {
      return String(request.metadata.toolName);
    }

    // 从输入中提取第一个 tool 名称
    if (request.tools && request.tools.length > 0) {
      return request.tools[0].name;
    }

    // 默认使用输入作为 tool 名称
    const input =
      typeof request.input === 'string'
        ? request.input
        : request.input.map(m => m.content).join(' ');

    // 尝试解析 JSON 格式的输入
    try {
      const parsed = JSON.parse(input);
      if (parsed.tool) {
        return parsed.tool;
      }
    } catch {
      // 不是 JSON，使用默认
    }

    throw new Error('无法确定要调用的 Tool 名称');
  }

  /**
   * 从 AgentRequest 提取 Tool 参数
   */
  private extractToolArguments(request: AgentRequest): Record<string, unknown> {
    // 从 metadata 中获取参数
    if (request.metadata?.toolArgs) {
      return request.metadata.toolArgs as Record<string, unknown>;
    }

    // 从输入中解析参数
    const input =
      typeof request.input === 'string'
        ? request.input
        : request.input.map(m => m.content).join(' ');

    try {
      const parsed = JSON.parse(input);
      if (parsed.args) {
        return parsed.args;
      }
      // 如果整个输入就是参数对象
      if (typeof parsed === 'object' && parsed !== null && !parsed.tool) {
        return parsed;
      }
    } catch {
      // 不是 JSON，返回空对象
    }

    return {};
  }

  /**
   * 将 Tool 结果转换为输出格式
   */
  private convertToolResultToOutput(result: ToolsCallResult): string {
    if (result.isError) {
      return `Tool 执行出错: ${result.content.map(c => c.text).join('\n')}`;
    }

    return result.content
      .map(c => {
        if (c.type === 'text') return c.text || '';
        if (c.type === 'image') return `[Image: ${c.mimeType}]`;
        if (c.type === 'resource') return `[Resource: ${c.resource?.uri}]`;
        return '';
      })
      .join('\n');
  }

  /**
   * 检查进程是否正在运行
   */
  isProcessRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * 获取缓存的 Tools 列表（不触发网络请求）
   */
  getCachedTools(): McpTool[] {
    return [...this.toolsCache];
  }

  /**
   * 清除 Tools 缓存
   */
  clearToolsCache(): void {
    this.toolsCache = [];
    this.toolsCacheTime = 0;
  }
}

export default McpAdapter;
