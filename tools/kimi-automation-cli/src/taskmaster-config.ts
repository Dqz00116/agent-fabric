/**
 * TaskMaster 配置读取模块
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface TaskMasterPlanConfig {
  path: string;
  description: string;
}

export interface TaskMasterConfig {
  version: string;
  description: string;
  plans: Record<string, TaskMasterPlanConfig>;
  settings: {
    defaultPlan: string;
    autoCreatePlan: boolean;
    logRetentionDays: number;
  };
}

/**
 * 读取 TaskMaster 配置文件
 */
export function loadTaskMasterConfig(skillPath: string): TaskMasterConfig {
  const configPath = join(skillPath, 'config.json');
  const content = readFileSync(configPath, 'utf8');
  return JSON.parse(content) as TaskMasterConfig;
}

/**
 * 获取计划路径
 */
export function getPlanPath(skillPath: string, planName?: string): { planName: string; planPath: string } {
  const config = loadTaskMasterConfig(skillPath);
  
  // 使用指定的 planName 或 defaultPlan
  const targetPlan = planName || config.settings.defaultPlan;
  
  if (!targetPlan) {
    throw new Error('未指定计划名称，且 TaskMaster 配置中没有默认计划');
  }
  
  const planConfig = config.plans[targetPlan];
  if (!planConfig) {
    const availablePlans = Object.keys(config.plans).join(', ');
    throw new Error(`计划 "${targetPlan}" 不存在。可用计划: ${availablePlans}`);
  }
  
  return { planName: targetPlan, planPath: planConfig.path };
}

/**
 * 列出所有可用计划
 */
export function listPlans(skillPath: string): Array<{ name: string; path: string; description: string }> {
  const config = loadTaskMasterConfig(skillPath);
  
  return Object.entries(config.plans).map(([name, planConfig]) => ({
    name,
    path: planConfig.path,
    description: planConfig.description,
  }));
}

export default { loadTaskMasterConfig, getPlanPath, listPlans };
