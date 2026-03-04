/**
 * TaskMaster Skill 交互模块
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import type { Task, Plan, ExecutableTask, TaskStatus } from './types.js';

/** TaskMaster CLI 封装 */
export class TaskMasterClient {
  private skillPath: string;
  private planName: string;
  private planPath: string;
  
  constructor(skillPath: string, planName: string, planPath: string) {
    this.skillPath = skillPath;
    this.planName = planName;
    this.planPath = planPath;
  }
  
  /** 执行 TaskMaster 命令 */
  private async executeCommand(args: string[]): Promise<string> {
    const cliPath = join(this.skillPath, 'cli', 'task.js');
    
    return new Promise((resolve, reject) => {
      const child = spawn('node', [cliPath, ...args], {
        cwd: this.skillPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });
      
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error('Command failed'));
        }
      });
      
      child.on('error', reject);
    });
  }
  
  /** 获取计划数据 */
  async getPlan(): Promise<Plan> {
    const dataPath = join(this.planPath, 'data.json');
    const content = readFileSync(dataPath, 'utf8');
    return JSON.parse(content) as Plan;
  }
  
  /** 获取所有可执行的任务 */
  async getExecutableTasks(): Promise<ExecutableTask[]> {
    const plan = await this.getPlan();
    const tasks: ExecutableTask[] = [];
    
    for (const task of plan.tasks) {
      if (task.status === 'pending' && !task.archived) {
        const deps = await this.checkDependencies(task.id);
        tasks.push({ ...task, ...deps });
      }
    }
    
    const priorityOrder = { P0: 0, P1: 1, P2: 2 };
    return tasks.sort((a, b) => {
      if (a.readyToStart && !b.readyToStart) return -1;
      if (!a.readyToStart && b.readyToStart) return 1;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  /** 检查任务依赖 */
  async checkDependencies(taskId: string) {
    try {
      const output = await this.executeCommand(['deps', this.planName, taskId]);
      const blockingDependencies: string[] = [];
      let readyToStart = output.includes('所有依赖已完成') || output.includes('✅');
      
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/[⏳❌].*(TASK-\d+)/);
        if (match) blockingDependencies.push(match[1]);
      }
      
      return { readyToStart, blockingDependencies };
    } catch {
      return { readyToStart: false, blockingDependencies: [] };
    }
  }
  
  /** 开始任务 */
  async startTask(taskId: string): Promise<boolean> {
    try {
      await this.executeCommand(['start', this.planName, taskId]);
      return true;
    } catch {
      return false;
    }
  }
  
  /** 完成任务 */
  async completeTask(taskId: string): Promise<boolean> {
    try {
      await this.executeCommand(['done', this.planName, taskId]);
      return true;
    } catch {
      return false;
    }
  }
  
  /** 获取进度 */
  async getProgress() {
    const plan = await this.getPlan();
    const total = plan.tasks.length;
    const completed = plan.tasks.filter(t => t.status === 'completed' || t.archived).length;
    const inProgress = plan.tasks.filter(t => t.status === 'in_progress').length;
    const pending = plan.tasks.filter(t => t.status === 'pending' && !t.archived).length;
    
    return { total, completed, inProgress, pending, percentage: Math.round((completed / total) * 100) };
  }
  
  /** 获取单个任务 */
  async getTask(taskId: string): Promise<Task | null> {
    const plan = await this.getPlan();
    return plan.tasks.find(t => t.id === taskId) || null;
  }
}

export default TaskMasterClient;
