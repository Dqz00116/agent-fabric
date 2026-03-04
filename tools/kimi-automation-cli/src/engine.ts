/**
 * 执行引擎 - 核心调度逻辑
 * 集成上下文评估、任务拆分、错误400处理、难度评估
 */

import { TaskMasterClient } from './taskmaster.js';
import { SessionManager } from './session.js';
import { assessTaskContext, estimateTokens } from './context-assessor.js';
import { 
  assessTaskDifficulty, 
  getDifficultyDescription, 
  getDifficultyEmoji,
  getModelRecommendation,
  defaultDifficultyModelMap,
} from './difficulty-assessor.js';
import type { 
  AutomationConfig, 
  ExecutableTask, 
  SessionConfig, 
  ExecutionStats, 
  ExecutionReport,
  SubTask,
  TaskDifficulty,
} from './types.js';
import { generatePrompt } from './config.js';
import type { SessionResult } from './types.js';

export interface EngineEvents {
  onTaskStart?: (taskId: string, sessionId: string, difficulty?: TaskDifficulty, model?: string) => void;
  onTaskComplete?: (taskId: string, result: SessionResult) => void;
  onTaskFailed?: (taskId: string, error: string) => void;
  onTaskSplit?: (taskId: string, subTaskCount: number) => void;
  onTaskRetry?: (taskId: string, attempt: number) => void;
  onTaskContinue?: (taskId: string, reason: string) => void;
  onProgress?: (stats: ExecutionStats) => void;
  onComplete?: (report: ExecutionReport) => void;
}

export class ExecutionEngine {
  private config: AutomationConfig;
  private taskmaster: TaskMasterClient;
  private sessionManager: SessionManager;
  private events: EngineEvents;
  private stats: ExecutionStats;
  private runningSessions: Map<string, SessionConfig> = new Map();
  private isRunning = false;
  
  constructor(config: AutomationConfig, events: EngineEvents = {}) {
    this.config = config;
    this.events = events;
    
    this.taskmaster = new TaskMasterClient(
      config.skillPath,
      config.planName,
      config.planPath
    );
    
    this.sessionManager = new SessionManager({
      kimiCliPath: config.kimiCliPath,
      workDir: config.workDir,
      autoApprove: config.autoApprove,
      timeout: config.sessionTimeout,
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay,
      continueOnError400: config.continueOnError400,
      continuePrompt: config.continuePrompt,
      maxContextLength: config.maxContextLength,
      enableDifficultyAssessment: config.enableDifficultyAssessment,
      difficultyModelMap: config.difficultyModelMap,
      interactionConfig: config.interactionConfig,
      loggerConfig: config.loggerConfig,
    });
    
    this.stats = {
      total: 0, completed: 0, failed: 0, timeout: 0, pending: 0, running: 0,
      retried: 0, split: 0,
      byDifficulty: { low: 0, medium: 0, high: 0 },
      startTime: Date.now(),
    };
  }
  
  async start(): Promise<ExecutionReport> {
    if (this.isRunning) throw new Error('Engine is already running');
    
    this.isRunning = true;
    this.stats.startTime = Date.now();
    
    console.log('启动自动化执行引擎');
    console.log(`  计划名称: ${this.config.planName}`);
    console.log(`  计划路径: ${this.config.planPath}`);
    console.log(`  工作目录: ${this.config.workDir}`);
    console.log(`  技能路径: ${this.config.skillPath}`);
    console.log(`  最大并发: ${this.config.maxConcurrency}`);
    console.log(`  超时时间: ${this.config.sessionTimeout / 60000}分钟`);
    console.log(`  最大上下文: ${this.config.maxContextLength} tokens`);
    console.log(`  任务拆分: ${this.config.enableTaskSplit ? '启用' : '禁用'} (阈值: ${this.config.splitThreshold * 100}%)`);
    console.log(`  难度评估: ${this.config.enableDifficultyAssessment ? '启用' : '禁用'}`);
    if (this.config.enableDifficultyAssessment) {
      console.log('  难度模型映射:');
      console.log(`    🟢 简单: ${this.config.difficultyModelMap.low.model}`);
      console.log(`    🟡 中等: ${this.config.difficultyModelMap.medium.model}`);
      console.log(`    🔴 困难: ${this.config.difficultyModelMap.high.model}`);
    }
    console.log(`  错误400继续: ${this.config.continueOnError400 ? '启用' : '禁用'}`);
    console.log(`  最大重试: ${this.config.maxRetries}次`);
    console.log();
    
    await this.runScheduler();
    
    while (this.runningSessions.size > 0) {
      await this.sleep(this.config.pollInterval);
    }
    
    this.isRunning = false;
    this.stats.endTime = Date.now();
    
    const report = this.generateReport();
    this.events.onComplete?.(report);
    return report;
  }
  
  private async runScheduler(): Promise<void> {
    while (this.isRunning) {
      if (this.runningSessions.size >= this.config.maxConcurrency) {
        await this.sleep(this.config.pollInterval);
        continue;
      }
      
      const executableTasks = await this.taskmaster.getExecutableTasks();
      const readyTasks = executableTasks.filter(t => t.readyToStart);
      
      if (readyTasks.length === 0) {
        const progress = await this.taskmaster.getProgress();
        if (progress.inProgress === 0 && progress.pending === 0) {
          console.log('所有任务已完成');
          break;
        }
        console.log(`等待依赖完成... (${progress.inProgress} 运行中, ${progress.pending} 待处理)`);
        await this.sleep(this.config.pollInterval);
        continue;
      }
      
      for (const task of readyTasks) {
        if (this.runningSessions.size >= this.config.maxConcurrency) break;
        
        let alreadyRunning = false;
        for (const session of this.runningSessions.values()) {
          if (session.taskId === task.id) { alreadyRunning = true; break; }
        }
        
        if (!alreadyRunning) await this.startTask(task);
      }
      
      await this.sleep(this.config.pollInterval);
    }
  }
  
  private async startTask(task: ExecutableTask): Promise<void> {
    await this.taskmaster.startTask(task.id);
    
    const sessionId = this.sessionManager.generateSessionId(task.id);
    let prompt = generatePrompt(this.config, task.id);
    let subTasks: SubTask[] | undefined;
    let difficulty: TaskDifficulty | undefined;
    let modelConfig = this.config.difficultyModelMap.medium; // 默认中等
    
    // 难度评估
    if (this.config.enableDifficultyAssessment) {
      console.log(`[${task.id}] 评估任务难度...`);
      const difficultyAssessment = assessTaskDifficulty(task, this.config.difficultyModelMap);
      difficulty = difficultyAssessment.difficulty;
      modelConfig = this.config.difficultyModelMap[difficulty];
      
      console.log(`[${task.id}] 难度评估: ${getDifficultyEmoji(difficulty)} ${getDifficultyDescription(difficulty)} (${difficultyAssessment.score}分)`);
      console.log(`[${task.id}] 推荐模型: ${difficultyAssessment.recommendedModel}`);
      console.log(`[${task.id}] 预估耗时: ${Math.round(difficultyAssessment.suggestedTimeout / 60000)}分钟`);
      
      this.stats.byDifficulty[difficulty]++;
    }
    
    // 上下文评估和任务拆分
    if (this.config.enableTaskSplit) {
      console.log(`[${task.id}] 评估上下文长度...`);
      const contextAssessment = assessTaskContext(task, modelConfig.maxTokens);
      
      if (contextAssessment.exceedsLimit) {
        console.log(`[${task.id}] 任务需要拆分: 预估 ${contextAssessment.estimatedTokens} tokens > ${modelConfig.maxTokens * this.config.splitThreshold} 阈值`);
        console.log(`[${task.id}] 拆分为 ${contextAssessment.suggestedSplits} 个子任务`);
        
        subTasks = contextAssessment.subTasks;
        this.stats.split++;
        this.events.onTaskSplit?.(task.id, subTasks.length);
      } else {
        console.log(`[${task.id}] 上下文评估通过: 预估 ${contextAssessment.estimatedTokens} tokens`);
      }
    }
    
    const sessionConfig: SessionConfig = {
      id: sessionId,
      taskId: task.id,
      workDir: this.config.workDir,
      prompt,
      status: 'running',
      startTime: Date.now(),
      subTasks,
      currentSubTaskIndex: 0,
      difficulty,
      modelConfig,
    };
    
    this.runningSessions.set(sessionId, sessionConfig);
    this.stats.running++;
    
    const modelName = difficulty ? modelConfig.model : 'default';
    console.log(`启动任务 ${task.id}: ${task.title}${difficulty ? ` [${getDifficultyDescription(difficulty)}]` : ''}${subTasks ? ` (${subTasks.length}个子任务)` : ''} [模型: ${modelName}]`);
    
    this.events.onTaskStart?.(task.id, sessionId, difficulty, modelConfig.model);
    this.executeSession(sessionConfig);
  }
  
  private async executeSession(sessionConfig: SessionConfig): Promise<void> {
    try {
      const result = await this.sessionManager.execute(sessionConfig);
      
      sessionConfig.endTime = Date.now();
      sessionConfig.output = result.output;
      
      // 更新重试统计
      if (sessionConfig.retryCount && sessionConfig.retryCount > 0) {
        this.stats.retried += sessionConfig.retryCount;
      }
      
      if (result.success) {
        sessionConfig.status = 'completed';
        this.stats.completed++;
        console.log(`任务 ${sessionConfig.taskId} 完成 (${result.duration}ms)`);
        await this.taskmaster.completeTask(sessionConfig.taskId);
        this.events.onTaskComplete?.(sessionConfig.taskId, result);
      } else {
        sessionConfig.status = 'failed';
        sessionConfig.error = result.error;
        this.stats.failed++;
        console.error(`任务 ${sessionConfig.taskId} 失败: ${result.error}`);
        
        if (result.isError400) {
          this.events.onTaskContinue?.(sessionConfig.taskId, '错误400');
        }
        
        this.events.onTaskFailed?.(sessionConfig.taskId, result.error || 'Unknown error');
      }
    } catch (error) {
      sessionConfig.status = 'failed';
      sessionConfig.error = error instanceof Error ? error.message : String(error);
      this.stats.failed++;
      console.error(`任务 ${sessionConfig.taskId} 异常: ${sessionConfig.error}`);
      this.events.onTaskFailed?.(sessionConfig.taskId, sessionConfig.error);
    } finally {
      this.stats.running--;
      this.runningSessions.delete(sessionConfig.id);
      this.events.onProgress?.({ ...this.stats });
    }
  }
  
  stop(): void {
    console.log('停止执行引擎');
    this.isRunning = false;
    this.sessionManager.killAllSessions();
  }
  
  private generateReport(): ExecutionReport {
    const duration = (this.stats.endTime || Date.now()) - this.stats.startTime;
    return {
      planName: this.config.planName,
      stats: { ...this.stats },
      sessions: Array.from(this.runningSessions.values()),
      summary: `执行完成! 总耗时: ${this.formatDuration(duration)}, 成功: ${this.stats.completed}, 失败: ${this.stats.failed}, 拆分: ${this.stats.split}, 重试: ${this.stats.retried}, 难度分布: 🟢${this.stats.byDifficulty.low} 🟡${this.stats.byDifficulty.medium} 🔴${this.stats.byDifficulty.high}`,
    };
  }
  
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ExecutionEngine;
