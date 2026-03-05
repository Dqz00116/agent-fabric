/**
 * 子 Agent 管理器
 * 支持并行执行多个子任务
 */

import { spawn } from 'child_process';
import type { AutomationConfig } from './types.js';

export interface SubAgentTask {
  id: string;
  name: string;
  description: string;
  subagentName: string;  // 使用的子 Agent 名称 (coder, reviewer, researcher, test-runner)
  prompt: string;
  workDir?: string;
  timeout?: number;
  dependencies?: string[];  // 依赖的其他任务 ID
}

export interface SubAgentResult {
  taskId: string;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

export interface SubAgentConfig {
  name: string;
  description: string;
  agentFile: string;
}

/**
 * 子 Agent 管理器
 */
export class SubAgentManager {
  private config: AutomationConfig;
  private activeTasks = new Map<string, ReturnType<typeof spawn>>();

  constructor(config: AutomationConfig) {
    this.config = config;
  }

  /**
   * 并行执行多个子 Agent 任务
   */
  async executeParallel(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const maxParallel = this.config.subagents?.maxParallelSubagents || 3;
    const results: SubAgentResult[] = [];
    const pendingTasks = [...tasks];
    const runningTasks = new Map<string, Promise<SubAgentResult>>();
    const completedTaskIds = new Set<string>();

    console.log(`[SubAgentManager] 开始执行 ${tasks.length} 个子任务，最大并行数: ${maxParallel}`);

    while (pendingTasks.length > 0 || runningTasks.size > 0) {
      // 启动新的任务（直到达到最大并行数）
      while (runningTasks.size < maxParallel && pendingTasks.length > 0) {
        const readyTask = pendingTasks.find(t => 
          !t.dependencies || t.dependencies.every(dep => completedTaskIds.has(dep))
        );

        if (!readyTask) break;

        // 从待处理列表移除
        const index = pendingTasks.indexOf(readyTask);
        pendingTasks.splice(index, 1);

        // 启动任务
        const taskPromise = this.executeSubAgent(readyTask);
        runningTasks.set(readyTask.id, taskPromise);

        // 任务完成后处理
        taskPromise.then(result => {
          results.push(result);
          completedTaskIds.add(result.taskId);
          runningTasks.delete(result.taskId);
          
          if (result.success) {
            console.log(`[SubAgentManager] 任务 ${readyTask.name} (${readyTask.id}) 完成`);
          } else {
            console.log(`[SubAgentManager] 任务 ${readyTask.name} (${readyTask.id}) 失败: ${result.error}`);
          }
        });
      }

      // 等待至少一个任务完成
      if (runningTasks.size > 0) {
        await Promise.race(runningTasks.values());
      }

      // 检查是否有任务依赖失败
      const failedTasks = results.filter(r => !r.success).map(r => r.taskId);
      for (const pending of pendingTasks) {
        if (pending.dependencies?.some(dep => failedTasks.includes(dep))) {
          console.log(`[SubAgentManager] 任务 ${pending.name} 因依赖失败而被跳过`);
          results.push({
            taskId: pending.id,
            success: false,
            output: '',
            error: '依赖任务失败',
            duration: 0,
          });
          completedTaskIds.add(pending.id);
          const idx = pendingTasks.indexOf(pending);
          pendingTasks.splice(idx, 1);
        }
      }
    }

    console.log(`[SubAgentManager] 所有子任务执行完成: 成功 ${results.filter(r => r.success).length}/${results.length}`);
    return results;
  }

  /**
   * 执行单个子 Agent 任务
   */
  private async executeSubAgent(task: SubAgentTask): Promise<SubAgentResult> {
    const startTime = Date.now();
    const timeout = task.timeout || this.config.subagents?.defaultTimeout || 300000;
    const workDir = task.workDir || this.config.workDir;

    // 构建参数
    const args = this.buildSubAgentArgs(task);

    return new Promise((resolve) => {
      console.log(`[SubAgent ${task.name}] 启动执行...`);

      const child = spawn(this.config.kimiCliPath, args, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          KIMI_SESSION_ID: '',
          KIMI_CONTEXT: '',
        },
      });

      this.activeTasks.set(task.id, child);

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        this.killTask(task.id);
        resolve({
          taskId: task.id,
          success: false,
          output: stdout,
          error: `子 Agent 超时 (${timeout}ms)`,
          duration: Date.now() - startTime,
        });
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        this.activeTasks.delete(task.id);

        const duration = Date.now() - startTime;
        
        resolve({
          taskId: task.id,
          success: code === 0,
          output: stdout,
          error: stderr || (code !== 0 ? `退出码: ${code}` : undefined),
          duration,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        this.activeTasks.delete(task.id);

        resolve({
          taskId: task.id,
          success: false,
          output: stdout,
          error: error.message,
          duration: Date.now() - startTime,
        });
      });

      // 发送任务提示词
      if (task.prompt) {
        try {
          child.stdin?.write(task.prompt);
          child.stdin?.end();
        } catch (error) {
          // 忽略错误
        }
      }
    });
  }

  /**
   * 构建子 Agent 参数
   */
  private buildSubAgentArgs(task: SubAgentTask): string[] {
    const args: string[] = [
      '--work-dir', task.workDir || this.config.workDir,
      '--print',
      '--yolo',
    ];

    // 使用主 Agent 配置（包含子 Agent 定义）
    if (this.config.agentFile) {
      args.push('--agent-file', this.config.agentFile);
    }

    return args;
  }

  /**
   * 终止指定任务
   */
  killTask(taskId: string): boolean {
    const child = this.activeTasks.get(taskId);
    if (child && !child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 3000);
      this.activeTasks.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * 终止所有任务
   */
  killAllTasks(): void {
    for (const [id, child] of this.activeTasks) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
    this.activeTasks.clear();
  }

  /**
   * 获取活跃任务数
   */
  getActiveCount(): number {
    return this.activeTasks.size;
  }
}

export default SubAgentManager;
