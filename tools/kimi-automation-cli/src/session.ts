/**
 * Kimi CLI Session 管理模块
 * 支持上下文评估、任务拆分、错误400自动继续、难度模型选择、交互式对话处理
 */

import { spawn } from 'child_process';
import type { SessionConfig, SessionResult, SubTask, ModelConfig, TaskDifficulty } from './types.js';
import { InteractionHandler, generateNonInteractivePrompt } from './interaction-handler.js';
import { SessionLogger, LogManager } from './logger.js';

export interface SessionManagerConfig {
  kimiCliPath: string;
  workDir: string;
  autoApprove: boolean;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  continueOnError400: boolean;
  continuePrompt: string;
  maxContextLength: number;
  enableDifficultyAssessment: boolean;
  difficultyModelMap: Record<TaskDifficulty, ModelConfig>;
  interactionConfig: {
    enabled: boolean;
    autoResponse: string;
    responseDelay: number;
    maxInteractions: number;
    stdinCloseDelay: number;
    addAntiInteractivePrefix: boolean;
  };
  loggerConfig: {
    enabled: boolean;
    logDir: string;
    maxLogFiles: number;
    maxLogAge: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    consoleOutput: boolean;
  };
}

export class SessionManager {
  private config: SessionManagerConfig;
  private activeSessions: Map<string, ReturnType<typeof spawn>> = new Map();
  private interactionHandlers: Map<string, InteractionHandler> = new Map();
  private loggers: Map<string, SessionLogger> = new Map();
  private logManager: LogManager;
  
  constructor(config: SessionManagerConfig) {
    this.config = config;
    this.logManager = new LogManager(config.loggerConfig);
  }
  
  /**
   * 获取日志管理器
   */
  getLogManager(): LogManager {
    return this.logManager;
  }
  
  generateSessionId(taskId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `kauto-${taskId}-${timestamp}-${random}`;
  }
  
  /**
   * 根据难度获取模型配置
   */
  getModelForDifficulty(difficulty?: TaskDifficulty): ModelConfig {
    if (!difficulty || !this.config.enableDifficultyAssessment) {
      return {
        name: '默认模型',
        model: '',
        maxTokens: this.config.maxContextLength,
        timeout: this.config.timeout,
      };
    }
    return this.config.difficultyModelMap[difficulty];
  }
  
  /**
   * 准备提示词（添加防交互前缀）
   */
  private preparePrompt(prompt: string): string {
    if (this.config.interactionConfig.addAntiInteractivePrefix) {
      return generateNonInteractivePrompt(prompt);
    }
    return prompt;
  }
  
  /**
   * 执行 Session（支持子任务和重试）
   */
  async execute(sessionConfig: SessionConfig): Promise<SessionResult> {
    // 准备提示词（添加防交互前缀）
    sessionConfig.prompt = this.preparePrompt(sessionConfig.prompt);
    
    // 获取模型配置
    const modelConfig = sessionConfig.modelConfig || 
      this.getModelForDifficulty(sessionConfig.difficulty);
    
    // 如果有子任务，按顺序执行
    if (sessionConfig.subTasks && sessionConfig.subTasks.length > 0) {
      return this.executeSubTasks(sessionConfig, modelConfig);
    }
    
    // 普通执行（支持重试）
    return this.executeWithRetry(sessionConfig, modelConfig);
  }
  
  /**
   * 按顺序执行子任务
   */
  private async executeSubTasks(
    sessionConfig: SessionConfig,
    modelConfig: ModelConfig
  ): Promise<SessionResult> {
    const subTasks = sessionConfig.subTasks!;
    const results: string[] = [];
    let totalDuration = 0;
    let totalInteractions = 0;
    
    console.log(`[Session ${sessionConfig.id}] 任务已拆分为 ${subTasks.length} 个子任务`);
    
    for (let i = 0; i < subTasks.length; i++) {
      const subTask = subTasks[i];
      sessionConfig.currentSubTaskIndex = i;
      
      console.log(`[Session ${sessionConfig.id}] 执行子任务 ${i + 1}/${subTasks.length}: ${subTask.title}`);
      
      const subSessionConfig: SessionConfig = {
        ...sessionConfig,
        id: `${sessionConfig.id}-sub${i + 1}`,
        prompt: this.preparePrompt(subTask.prompt),
        modelConfig, // 继承父任务的模型配置
      };
      
      const result = await this.executeWithRetry(subSessionConfig, modelConfig);
      
      subTask.status = result.success ? 'completed' : 'failed';
      subTask.output = result.output;
      subTask.error = result.error;
      
      results.push(`\n=== 子任务 ${i + 1}/${subTasks.length} ===\n${result.output}`);
      totalDuration += result.duration;
      
      // 累加交互统计
      const handler = this.interactionHandlers.get(subSessionConfig.id);
      if (handler) {
        const stats = handler.getStats();
        totalInteractions += stats.interactionCount;
      }
      
      if (!result.success) {
        return {
          success: false,
          output: results.join('\n'),
          error: `子任务 ${i + 1} 失败: ${result.error}`,
          duration: totalDuration,
        };
      }
      
      // 子任务间隔，避免过载
      if (i < subTasks.length - 1) {
        await this.sleep(2000);
      }
    }
    
    // 添加交互统计信息
    const finalOutput = totalInteractions > 0
      ? results.join('\n') + `\n\n[系统] 子任务执行过程中处理了 ${totalInteractions} 次交互请求`
      : results.join('\n');
    
    return {
      success: true,
      output: finalOutput,
      duration: totalDuration,
    };
  }
  
  /**
   * 执行单个 Session（支持错误400继续和重试）
   */
  private async executeWithRetry(
    sessionConfig: SessionConfig,
    modelConfig: ModelConfig
  ): Promise<SessionResult> {
    let lastResult: SessionResult | null = null;
    const maxRetries = sessionConfig.isContinuation ? 1 : this.config.maxRetries;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        console.log(`[Session ${sessionConfig.id}] 第 ${attempt} 次重试...`);
        await this.sleep(this.config.retryDelay * attempt);
      }
      
      const result = await this.executeOnce(sessionConfig, modelConfig);
      lastResult = result;
      
      // 成功，直接返回
      if (result.success) {
        // 添加交互统计到输出
        const handler = this.interactionHandlers.get(sessionConfig.id);
        if (handler) {
          const stats = handler.getStats();
          if (stats.interactionCount > 0) {
            result.output += `\n\n[系统] 执行过程中自动处理了 ${stats.interactionCount} 次交互请求`;
          }
        }
        return result;
      }
      
      // 检查是否是错误400
      if (result.isError400 && this.config.continueOnError400 && !sessionConfig.isContinuation) {
        console.log(`[Session ${sessionConfig.id}] 检测到错误400，尝试继续任务...`);
        
        const continueResult = await this.executeContinuation(sessionConfig, modelConfig, result.output);
        
        if (continueResult.success) {
          // 合并交互统计
          const originalHandler = this.interactionHandlers.get(sessionConfig.id);
          const continueHandler = this.interactionHandlers.get(`${sessionConfig.id}-continue`);
          const totalInteractions = (originalHandler?.getStats().interactionCount || 0) + 
                                    (continueHandler?.getStats().interactionCount || 0);
          
          let combinedOutput = result.output + '\n\n=== 继续执行后 ===\n' + continueResult.output;
          if (totalInteractions > 0) {
            combinedOutput += `\n\n[系统] 执行过程中自动处理了 ${totalInteractions} 次交互请求`;
          }
          
          return {
            success: true,
            output: combinedOutput,
            duration: result.duration + continueResult.duration,
          };
        }
      }
      
      // 如果不是可重试的错误，直接返回
      if (!result.retryable) {
        return result;
      }
      
      // 更新重试计数
      sessionConfig.retryCount = (sessionConfig.retryCount || 0) + 1;
    }
    
    return lastResult!;
  }
  
  /**
   * 继续执行被中断的任务（错误400处理）
   */
  private async executeContinuation(
    originalConfig: SessionConfig,
    modelConfig: ModelConfig,
    previousOutput: string
  ): Promise<SessionResult> {
    const continueConfig: SessionConfig = {
      ...originalConfig,
      id: `${originalConfig.id}-continue`,
      prompt: this.preparePrompt(this.config.continuePrompt),
      isContinuation: true,
      originalPrompt: originalConfig.prompt,
      modelConfig,
    };
    
    return this.executeOnce(continueConfig, modelConfig);
  }
  
  /**
   * 执行一次 Session
   */
  private async executeOnce(
    sessionConfig: SessionConfig,
    modelConfig: ModelConfig
  ): Promise<SessionResult> {
    const startTime = Date.now();
    const args = this.buildKimiArgs(sessionConfig, modelConfig);
    
    // 使用模型特定的超时时间
    const timeout = modelConfig.timeout || this.config.timeout;
    
    // 创建日志记录器
    const logger = this.logManager.createSessionLogger(sessionConfig, modelConfig.model);
    this.loggers.set(sessionConfig.id, logger);
    
    return new Promise((resolve) => {
      const child = spawn(this.config.kimiCliPath, args, {
        cwd: this.config.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          KIMI_SESSION_ID: '',
          KIMI_CONTEXT: '',
        },
      });
      
      this.activeSessions.set(sessionConfig.id, child);
      
      // 设置交互处理器
      let interactionHandler: InteractionHandler | null = null;
      if (this.config.interactionConfig.enabled) {
        interactionHandler = new InteractionHandler(this.config.interactionConfig);
        interactionHandler.setup(
          child, 
          sessionConfig.id,
          (type, content) => {
            console.log(`[Session ${sessionConfig.id}] 自动响应交互: ${type}`);
          }
        );
        this.interactionHandlers.set(sessionConfig.id, interactionHandler);
      }
      
      let stdout = '';
      let stderr = '';
      let stdinClosed = false;
      
      const timeoutId = setTimeout(() => {
        this.killSession(sessionConfig.id);
        resolve({
          success: false,
          output: stdout,
          error: `Session timeout after ${timeout}ms`,
          duration: Date.now() - startTime,
          retryable: true,
        });
      }, timeout);
      
      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stdout += text;
        logger.logOutput(text);
      });
      
      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stderr += text;
        logger.logError(text);
      });
      
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        // 清理交互处理器
        interactionHandler?.destroy();
        this.interactionHandlers.delete(sessionConfig.id);
        this.activeSessions.delete(sessionConfig.id);
        
        const duration = Date.now() - startTime;
        const isError400 = this.checkIsError400(stdout + stderr);
        
        // 记录交互统计到日志
        const interactionStats = interactionHandler?.getStats();
        if (interactionStats) {
          logger.updateInteractionCount(interactionStats.interactionCount);
        }
        
        const result: SessionResult = code === 0 ? {
          success: true,
          output: stdout,
          duration,
        } : {
          success: false,
          output: stdout,
          error: stderr || `Process exited with code ${code}`,
          duration,
          isError400,
          retryable: code !== 0 && !isError400,
          needsContinuation: isError400,
        };
        
        // 完成日志记录
        logger.finalize(result);
        this.loggers.delete(sessionConfig.id);
        
        resolve(result);
      });
      
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        interactionHandler?.destroy();
        this.interactionHandlers.delete(sessionConfig.id);
        this.activeSessions.delete(sessionConfig.id);
        
        resolve({
          success: false,
          output: stdout,
          error: error.message,
          duration: Date.now() - startTime,
          retryable: true,
        });
      });
      
      // 发送提示词，但延迟关闭 stdin
      if (sessionConfig.prompt) {
        try {
          child.stdin?.write(sessionConfig.prompt);
          
          // 延迟关闭 stdin，给交互响应留出时间
          setTimeout(() => {
            if (!stdinClosed && !child.killed) {
              child.stdin?.end();
              stdinClosed = true;
            }
          }, this.config.interactionConfig.stdinCloseDelay);
        } catch (error) {
          // stdin 可能已关闭，忽略错误
        }
      }
    });
  }
  
  /**
   * 构建 Kimi CLI 参数
   */
  private buildKimiArgs(sessionConfig: SessionConfig, modelConfig: ModelConfig): string[] {
    const args: string[] = [
      '--work-dir', this.config.workDir,
      '--session', sessionConfig.id,
      '--print',
      '--yolo',
    ];
    
    // 添加模型参数（如果配置了）
    if (modelConfig.model) {
      args.push('--model', modelConfig.model);
    }
    
    
    return args;
  }
  
  /**
   * 检查是否是错误400
   */
  private checkIsError400(output: string): boolean {
    const error400Patterns = [
      /error\s*400/i,
      /400\s*error/i,
      /bad\s*request/i,
      /context\s*length\s*exceeded/i,
      /token\s*limit\s*exceeded/i,
      /maximum\s*context\s*length/i,
      /请求错误/i,
      /上下文长度/i,
    ];
    
    return error400Patterns.some(pattern => pattern.test(output));
  }
  
  killSession(sessionId: string): boolean {
    const child = this.activeSessions.get(sessionId);
    if (child && !child.killed) {
      child.kill('SIGTERM');
      
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 3000);
      
      // 清理交互处理器
      const handler = this.interactionHandlers.get(sessionId);
      if (handler) {
        handler.destroy();
        this.interactionHandlers.delete(sessionId);
      }
      
      // 记录终止到日志
      const logger = this.loggers.get(sessionId);
      if (logger) {
        logger.logWarn('Session terminated by user');
      }
      
      this.activeSessions.delete(sessionId);
      return true;
    }
    return false;
  }
  
  killAllSessions(): void {
    for (const [id, child] of this.activeSessions) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
      // 清理交互处理器
      const handler = this.interactionHandlers.get(id);
      if (handler) {
        handler.destroy();
      }
      // 记录终止到日志
      const logger = this.loggers.get(id);
      if (logger) {
        logger.logWarn('Session terminated by user (kill all)');
      }
    }
    this.activeSessions.clear();
    this.interactionHandlers.clear();
  }
  
  getActiveCount(): number {
    return this.activeSessions.size;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SessionManager;
