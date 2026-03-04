/**
 * 优化的日志系统
 * - 按 Task 合并日志（重试时追加到同一文件）
 * - 简化格式（合并 .log 和 .meta.json）
 * - 支持只保留失败日志
 * - 更好的清理策略
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { resolve, join } from 'path';
import type { SessionConfig, SessionResult, TaskDifficulty } from './types.js';

export interface LoggerConfig {
  enabled: boolean;
  logDir: string;
  maxLogFiles: number;        // 最大保留日志文件数
  maxLogAge: number;          // 最大保留天数
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  consoleOutput: boolean;     // 是否同时输出到控制台
  
  // 新增优化配置
  groupByTask: boolean;       // 按 Task 合并日志（相同 Task 的重试追加到同一文件）
  keepSuccessLogs: boolean;   // 是否保留成功任务的详细日志
  keepMetadataOnly: boolean;  // 成功后只保留元数据（删除详细日志）
  compressOldLogs: boolean;   // 是否压缩旧日志（保留元数据）
}

export const defaultLoggerConfig: LoggerConfig = {
  enabled: true,
  logDir: './logs',
  maxLogFiles: 100,
  maxLogAge: 30,              // 30天
  logLevel: 'info',
  consoleOutput: false,
  
  // 优化配置默认值
  groupByTask: true,          // 默认按 Task 合并
  keepSuccessLogs: false,     // 默认不保留成功任务的详细日志
  keepMetadataOnly: true,     // 成功后只保留元数据摘要
  compressOldLogs: true,      // 压缩旧日志
};

/** 执行记录 */
export interface ExecutionRecord {
  sessionId: string;
  startTime: string;
  endTime?: string;
  duration: number;
  success: boolean;
  error?: string;
  retryCount: number;
  interactionCount: number;
  model?: string;
}

/** Task 日志元数据 */
export interface TaskLogMetadata {
  taskId: string;
  difficulty?: TaskDifficulty;
  model?: string;
  firstAttemptTime: string;
  lastAttemptTime: string;
  totalAttempts: number;
  successful: boolean;
  finalDuration: number;
  totalInteractions: number;
  executions: ExecutionRecord[];
}

/** 日志文件信息 */
interface LogFileInfo {
  name: string;
  path: string;
  stat: ReturnType<typeof statSync>;
  isMetadata: boolean;
}

/**
 * Session 日志记录器（优化版）
 * 
 * 关键优化：
 * 1. 按 Task 合并 - 相同 taskId 的日志追加到同一文件
 * 2. 单一文件格式 - 使用 .tasklog 后缀，包含元数据和详细日志
 * 3. 成功清理 - 成功后可选择只保留元数据摘要
 */
export class SessionLogger {
  private config: LoggerConfig;
  private sessionId: string;
  private taskId: string;
  private logFilePath: string;
  private metadata: TaskLogMetadata;
  private buffer: string[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private currentExecution: ExecutionRecord;
  private isFirstExecution: boolean = false;

  constructor(
    config: LoggerConfig,
    sessionConfig: SessionConfig,
    model?: string
  ) {
    this.config = config;
    this.sessionId = sessionConfig.id;
    this.taskId = sessionConfig.taskId;
    
    // 确保日志目录存在
    this.ensureLogDir();
    
    // 生成日志文件路径（按 task 分组）
    const safeTaskId = sessionConfig.taskId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const logFileName = `${safeTaskId}.tasklog`;
    this.logFilePath = resolve(this.config.logDir, logFileName);
    
    // 检查是否是首次执行
    this.isFirstExecution = !existsSync(this.logFilePath);
    
    // 初始化当前执行记录
    this.currentExecution = {
      sessionId: sessionConfig.id,
      startTime: new Date().toISOString(),
      duration: 0,
      success: false,
      retryCount: sessionConfig.retryCount || 0,
      interactionCount: 0,
      model: model || sessionConfig.modelConfig?.model,
    };
    
    // 加载或初始化元数据
    this.metadata = this.loadOrInitMetadata(sessionConfig);
    
    // 写入本次执行的开始标记
    this.writeExecutionStart(sessionConfig);
    
    // 启动定时刷新
    this.startFlushInterval();
    
    // 定期清理旧日志
    if (this.isFirstExecution) {
      this.cleanupOldLogs();
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * 加载或初始化元数据
   */
  private loadOrInitMetadata(sessionConfig: SessionConfig): TaskLogMetadata {
    if (existsSync(this.logFilePath)) {
      try {
        const content = readFileSync(this.logFilePath, 'utf8');
        const metadataMatch = content.match(/<!-- METADATA: ([\s\S]*?) -->/);
        if (metadataMatch) {
          const existing = JSON.parse(metadataMatch[1]) as TaskLogMetadata;
          existing.totalAttempts++;
          existing.lastAttemptTime = new Date().toISOString();
          return existing;
        }
      } catch (error) {
        // 解析失败，创建新的
      }
    }
    
    // 初始化新的元数据
    this.isFirstExecution = true;
    return {
      taskId: sessionConfig.taskId,
      difficulty: sessionConfig.difficulty,
      model: sessionConfig.modelConfig?.model,
      firstAttemptTime: new Date().toISOString(),
      lastAttemptTime: new Date().toISOString(),
      totalAttempts: 1,
      successful: false,
      finalDuration: 0,
      totalInteractions: 0,
      executions: [],
    };
  }

  /**
   * 写入执行开始标记
   */
  private writeExecutionStart(sessionConfig: SessionConfig): void {
    const header = [
      '',
      '========================================',
      `Execution #${this.metadata.totalAttempts}`,
      '========================================',
      `Session ID: ${this.sessionId}`,
      `Task ID: ${sessionConfig.taskId}`,
      `Difficulty: ${sessionConfig.difficulty || 'N/A'}`,
      `Model: ${sessionConfig.modelConfig?.model || 'default'}`,
      `Start Time: ${this.currentExecution.startTime}`,
      `Retry Count: ${sessionConfig.retryCount || 0}`,
      `Sub Tasks: ${sessionConfig.subTasks?.length || 0}`,
      '----------------------------------------',
      '',
    ].join('\n');

    this.buffer.push(header);
    this.flush();
  }

  /**
   * 记录输出（stdout）
   */
  logOutput(data: string): void {
    if (!this.config.enabled) return;
    
    const timestamp = new Date().toISOString();
    const lines = data.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        const logLine = `[${timestamp}] [OUT] ${line}`;
        this.buffer.push(logLine);
        
        if (this.config.consoleOutput) {
          console.log(logLine);
        }
      }
    }
  }

  /**
   * 记录错误（stderr）
   */
  logError(data: string): void {
    if (!this.config.enabled) return;
    
    const timestamp = new Date().toISOString();
    const lines = data.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        const logLine = `[${timestamp}] [ERR] ${line}`;
        this.buffer.push(logLine);
        
        if (this.config.consoleOutput) {
          console.error(logLine);
        }
      }
    }
  }

  /**
   * 记录信息
   */
  logInfo(message: string, metadata?: Record<string, unknown>): void {
    if (!this.config.enabled) return;
    if (!this.shouldLog('info')) return;
    
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [INFO] ${message}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      logLine += ` | ${JSON.stringify(metadata)}`;
    }
    
    this.buffer.push(logLine);
    
    if (this.config.consoleOutput) {
      console.log(logLine);
    }
  }

  /**
   * 记录警告
   */
  logWarn(message: string, metadata?: Record<string, unknown>): void {
    if (!this.config.enabled) return;
    if (!this.shouldLog('warn')) return;
    
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [WARN] ${message}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      logLine += ` | ${JSON.stringify(metadata)}`;
    }
    
    this.buffer.push(logLine);
    
    if (this.config.consoleOutput) {
      console.warn(logLine);
    }
  }

  /**
   * 更新交互计数
   */
  updateInteractionCount(count: number): void {
    this.currentExecution.interactionCount = count;
  }

  /**
   * 完成日志记录
   */
  finalize(result: SessionResult): void {
    if (!this.config.enabled) return;
    
    // 停止定时刷新
    this.stopFlushInterval();
    
    // 刷新剩余缓冲区
    this.flush();
    
    // 更新当前执行记录
    this.currentExecution.endTime = new Date().toISOString();
    this.currentExecution.duration = result.duration;
    this.currentExecution.success = result.success;
    this.currentExecution.error = result.error;
    
    // 添加到执行历史
    this.metadata.executions.push({ ...this.currentExecution });
    this.metadata.lastAttemptTime = this.currentExecution.endTime;
    this.metadata.successful = result.success;
    this.metadata.finalDuration = result.duration;
    this.metadata.totalInteractions += this.currentExecution.interactionCount;
    
    // 写入执行结束标记
    const footer = [
      '',
      '----------------------------------------',
      `End Time: ${this.currentExecution.endTime}`,
      `Duration: ${result.duration}ms`,
      `Success: ${result.success}`,
      result.error ? `Error: ${result.error}` : '',
      `Interactions: ${this.currentExecution.interactionCount}`,
      '========================================',
      '',
    ].join('\n');
    
    appendFileSync(this.logFilePath, footer + '\n');
    
    // 更新元数据
    this.updateMetadata();
    
    // 根据配置处理成功/失败的日志
    if (result.success) {
      this.handleSuccessLog();
    } else {
      this.handleFailureLog();
    }
    
    console.log(`[Session ${this.sessionId}] 日志已保存: ${this.logFilePath}`);
  }

  /**
   * 处理成功日志
   */
  private handleSuccessLog(): void {
    if (!this.config.keepSuccessLogs) {
      // 删除详细日志，只保留元数据摘要
      if (this.config.keepMetadataOnly) {
        this.compressToMetadataOnly();
      }
    }
  }

  /**
   * 处理失败日志
   */
  private handleFailureLog(): void {
    // 失败时始终保留完整日志，不做任何处理
    // 可以在这里添加额外的标记或通知
  }

  /**
   * 压缩为只保留元数据
   */
  private compressToMetadataOnly(): void {
    try {
      const summary = [
        '# Task Execution Summary',
        '',
        `Task ID: ${this.metadata.taskId}`,
        `Status: ✅ SUCCESS`,
        `Total Attempts: ${this.metadata.totalAttempts}`,
        `Final Duration: ${this.metadata.finalDuration}ms`,
        `Total Interactions: ${this.metadata.totalInteractions}`,
        `Completed At: ${this.metadata.lastAttemptTime}`,
        '',
        '## Execution History',
        ...this.metadata.executions.map((e, i) => 
          `- Attempt ${i + 1}: ${e.success ? '✅' : '❌'} ${e.duration}ms (${e.model || 'default'})`
        ),
        '',
        '<!-- METADATA: ' + JSON.stringify(this.metadata) + ' -->',
        '',
      ].join('\n');
      
      writeFileSync(this.logFilePath, summary);
    } catch (error) {
      console.error(`[SessionLogger] 压缩日志失败: ${error}`);
    }
  }

  /**
   * 更新元数据到文件
   */
  private updateMetadata(): void {
    try {
      // 读取现有内容
      let content = '';
      if (existsSync(this.logFilePath)) {
        content = readFileSync(this.logFilePath, 'utf8');
      }
      
      // 移除旧的元数据标记
      content = content.replace(/\n<!-- METADATA: [\s\S]*? -->\n?$/, '');
      
      // 添加新的元数据标记
      const metadataTag = `\n<!-- METADATA: ${JSON.stringify(this.metadata)} -->\n`;
      
      writeFileSync(this.logFilePath, content + metadataTag);
    } catch (error) {
      console.error(`[SessionLogger] 更新元数据失败: ${error}`);
    }
  }

  /**
   * 检查是否应该记录该级别的日志
   */
  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level);
    return messageLevel >= configLevel;
  }

  /**
   * 启动定时刷新
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 1000);
  }

  /**
   * 停止定时刷新
   */
  private stopFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * 刷新缓冲区到文件
   */
  private flush(): void {
    if (this.buffer.length === 0) return;
    
    const content = this.buffer.join('\n') + '\n';
    this.buffer = [];
    
    try {
      appendFileSync(this.logFilePath, content);
    } catch (error) {
      console.error(`[SessionLogger] 写入日志失败: ${error}`);
    }
  }

  /**
   * 清理旧日志
   */
  private cleanupOldLogs(): void {
    try {
      const files = readdirSync(this.config.logDir);
      const logFiles: LogFileInfo[] = files
        .filter(f => f.endsWith('.tasklog'))
        .map(f => ({
          name: f,
          path: join(this.config.logDir, f),
          stat: statSync(join(this.config.logDir, f)),
          isMetadata: false,
        }))
        .sort((a, b) => (b.stat?.mtime.getTime() || 0) - (a.stat?.mtime.getTime() || 0));
      
      // 按数量清理
      if (logFiles.length > this.config.maxLogFiles) {
        const toDelete = logFiles.slice(this.config.maxLogFiles);
        for (const file of toDelete) {
          try {
            unlinkSync(file.path);
          } catch (error) {
            // 忽略删除错误
          }
        }
      }
      
      // 按时间清理
      const now = Date.now();
      const maxAge = this.config.maxLogAge * 24 * 60 * 60 * 1000;
      
      for (const file of logFiles) {
        if (file.stat && now - file.stat.mtime.getTime() > maxAge) {
          try {
            // 对于旧日志，如果配置压缩则压缩，否则删除
            if (this.config.compressOldLogs && !this.isCompressed(file.path)) {
              this.compressOldLog(file.path);
            } else {
              unlinkSync(file.path);
            }
          } catch (error) {
            // 忽略清理错误
          }
        }
      }
    } catch (error) {
      // 忽略清理错误
    }
  }

  /**
   * 检查日志是否已压缩
   */
  private isCompressed(path: string): boolean {
    try {
      const content = readFileSync(path, 'utf8');
      return content.startsWith('# Task Execution Summary');
    } catch {
      return false;
    }
  }

  /**
   * 压缩旧日志
   */
  private compressOldLog(path: string): void {
    try {
      const content = readFileSync(path, 'utf8');
      const metadataMatch = content.match(/<!-- METADATA: ([\s\S]*?) -->/);
      
      if (metadataMatch) {
        const metadata = JSON.parse(metadataMatch[1]) as TaskLogMetadata;
        const summary = [
          '# Task Execution Summary (Archived)',
          '',
          `Task ID: ${metadata.taskId}`,
          `Status: ${metadata.successful ? '✅ SUCCESS' : '❌ FAILED'}`,
          `Total Attempts: ${metadata.totalAttempts}`,
          `Final Duration: ${metadata.finalDuration}ms`,
          `Last Updated: ${metadata.lastAttemptTime}`,
          '',
          '<!-- METADATA: ' + JSON.stringify(metadata) + ' -->',
          '',
        ].join('\n');
        
        writeFileSync(path, summary);
      }
    } catch (error) {
      // 压缩失败则删除
      unlinkSync(path);
    }
  }

  /**
   * 获取日志文件路径
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * 获取元数据
   */
  getMetadata(): TaskLogMetadata {
    return this.metadata;
  }
}

/**
 * 全局日志管理器
 */
export class LogManager {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultLoggerConfig, ...config };
    this.ensureLogDir();
  }

  /**
   * 创建 Session 日志记录器
   */
  createSessionLogger(sessionConfig: SessionConfig, model?: string): SessionLogger {
    return new SessionLogger(this.config, sessionConfig, model);
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * 列出所有日志
   */
  listLogs(options?: {
    taskId?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
  }): Array<{
    logFile: string;
    metadata: TaskLogMetadata;
  }> {
    const results: Array<{
      logFile: string;
      metadata: TaskLogMetadata;
    }> = [];

    try {
      const files = readdirSync(this.config.logDir);
      const logFiles = files.filter(f => f.endsWith('.tasklog'));

      for (const logFile of logFiles) {
        const logPath = join(this.config.logDir, logFile);

        try {
          const content = readFileSync(logPath, 'utf8');
          const metadataMatch = content.match(/<!-- METADATA: ([\s\S]*?) -->/);
          
          if (!metadataMatch) continue;
          
          const metadata: TaskLogMetadata = JSON.parse(metadataMatch[1]);

          // 应用过滤条件
          if (options?.taskId && metadata.taskId !== options.taskId) continue;
          if (options?.success !== undefined && metadata.successful !== options.success) continue;
          if (options?.startDate && new Date(metadata.firstAttemptTime).getTime() < options.startDate.getTime()) continue;
          if (options?.endDate && new Date(metadata.lastAttemptTime).getTime() > options.endDate.getTime()) continue;

          results.push({
            logFile: logPath,
            metadata,
          });
        } catch (error) {
          // 忽略解析错误
        }
      }

      // 按最后尝试时间倒序
      return results.sort((a, b) => 
        new Date(b.metadata.lastAttemptTime).getTime() - new Date(a.metadata.lastAttemptTime).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  /**
   * 读取日志内容
   */
  readLog(logFile: string): string {
    try {
      return readFileSync(logFile, 'utf8');
    } catch (error) {
      return '';
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTasks: number;
    successCount: number;
    failureCount: number;
    avgDuration: number;
    totalAttempts: number;
    totalInteractions: number;
  } {
    const logs = this.listLogs();
    
    const successCount = logs.filter(l => l.metadata.successful).length;
    const failureCount = logs.filter(l => !l.metadata.successful).length;
    const totalDuration = logs.reduce((sum, l) => sum + l.metadata.finalDuration, 0);
    const totalAttempts = logs.reduce((sum, l) => sum + l.metadata.totalAttempts, 0);
    const totalInteractions = logs.reduce((sum, l) => sum + l.metadata.totalInteractions, 0);

    return {
      totalTasks: logs.length,
      successCount,
      failureCount,
      avgDuration: logs.length > 0 ? Math.round(totalDuration / logs.length) : 0,
      totalAttempts,
      totalInteractions,
    };
  }

  /**
   * 清理所有日志
   */
  clearAll(): void {
    try {
      const files = readdirSync(this.config.logDir);
      for (const file of files) {
        if (file.endsWith('.tasklog')) {
          unlinkSync(join(this.config.logDir, file));
        }
      }
    } catch (error) {
      console.error(`[LogManager] 清理日志失败: ${error}`);
    }
  }
}

export default { SessionLogger, LogManager, defaultLoggerConfig };
