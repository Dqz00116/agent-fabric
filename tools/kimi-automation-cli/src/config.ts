/**
 * 配置管理
 * 仅支持配置文件方式
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { AutomationConfig } from './types.js';
import { getPlanPath } from './taskmaster-config.js';
import { defaultDifficultyModelMap } from './difficulty-assessor.js';
import { defaultInteractionConfig } from './interaction-handler.js';
import { defaultLoggerConfig } from './logger.js';

/** 默认配置 */
export const defaultConfig: AutomationConfig = {
  planPath: '',
  planName: '',
  workDir: process.cwd(),
  skillPath: 'E:\\Agent\\agent-fabric\\docs\\plans\\taskmaster-skill',
  
  maxConcurrency: 3,
  sessionTimeout: 30 * 60 * 1000,  // 30 分钟
  pollInterval: 5000,               // 5 秒
  
  kimiCliPath: 'kimi',
  autoApprove: true,
  
  // 上下文管理配置
  maxContextLength: 128000,
  enableTaskSplit: true,
  splitThreshold: 0.8,
  
  // 错误处理配置
  maxRetries: 2,
  retryDelay: 5000,
  continueOnError400: true,
  continuePrompt: '继续刚才的任务',
  
  // 难度评估配置
  enableDifficultyAssessment: true,
  difficultyModelMap: defaultDifficultyModelMap,
  
  // 交互处理配置
  interactionConfig: defaultInteractionConfig,
  
  // 日志配置
  loggerConfig: defaultLoggerConfig,
  
  // 提示词模板
  promptTemplate: '阅读{{skillPath}}\\SKILL.md这个技能，然后执行第一个可开始的任务',
  taskSplitPromptTemplate: '这个任务比较复杂，需要拆分成多个部分执行。请先完成以下部分：',
};

/**
 * 深度合并对象
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] === undefined) continue;
    
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>) as T[Extract<keyof T, string>];
    } else {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }
  
  return result;
}

/**
 * 加载配置文件
 * @param configPath 配置文件路径，默认为当前目录下的 kimi-auto.config.json
 */
export function loadConfig(configPath?: string): AutomationConfig {
  const configPathToLoad = configPath || 'kimi-auto.config.json';
  
  if (!existsSync(configPathToLoad)) {
    console.log(`未找到配置文件 ${configPathToLoad}，使用默认配置`);
    console.log('提示: 使用 "kimi-auto init" 创建配置文件');
    return { ...defaultConfig };
  }
  
  try {
    const content = readFileSync(configPathToLoad, 'utf8');
    const userConfig = JSON.parse(content) as Partial<AutomationConfig>;
    
    // 深度合并配置
    const mergedConfig = deepMerge({ ...defaultConfig }, userConfig);
    
    console.log(`已加载配置文件: ${configPathToLoad}`);
    return mergedConfig;
    
  } catch (error) {
    console.warn(`警告: 无法加载配置文件 ${configPathToLoad}:`, error);
    console.log('使用默认配置');
    return { ...defaultConfig };
  }
}

/**
 * 解析计划配置（从 TaskMaster 配置读取）
 */
export function resolvePlanConfig(config: AutomationConfig): AutomationConfig {
  if (!config.skillPath) {
    throw new Error('skillPath 不能为空');
  }
  
  const resolvedSkillPath = resolve(config.skillPath);
  
  try {
    const { planName, planPath } = getPlanPath(resolvedSkillPath, config.planName || undefined);
    config.planName = planName;
    config.planPath = planPath;
    config.skillPath = resolvedSkillPath;
  } catch (error) {
    throw new Error(`无法解析计划配置: ${error instanceof Error ? error.message : error}`);
  }
  
  return config;
}

/** 验证配置 */
export function validateConfig(config: AutomationConfig): void {
  const errors: string[] = [];
  
  if (!config.skillPath) {
    errors.push('skillPath (TaskMaster Skill 路径) 不能为空');
  }
  
  if (!existsSync(config.skillPath)) {
    errors.push(`skillPath 不存在: ${config.skillPath}`);
  }
  
  if (config.maxConcurrency < 1) {
    errors.push('并发数必须大于 0');
  }
  
  if (config.sessionTimeout < 60000) {
    errors.push('超时时间必须大于 1 分钟');
  }
  
  if (config.maxContextLength < 1000) {
    errors.push('最大上下文长度必须大于 1000 tokens');
  }
  
  if (config.splitThreshold <= 0 || config.splitThreshold > 1) {
    errors.push('拆分阈值必须在 0-1 之间');
  }
  
  if (config.maxRetries < 0) {
    errors.push('重试次数不能为负数');
  }
  
  // 验证难度模型映射
  if (config.difficultyModelMap) {
    const modelErrors = validateDifficultyModelMap(config.difficultyModelMap);
    if (modelErrors.length > 0) {
      errors.push(...modelErrors);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`配置验证失败:\n${errors.join('\n')}`);
  }
  
  // 验证通过后，解析计划配置
  resolvePlanConfig(config);
}

/**
 * 验证难度模型映射
 */
function validateDifficultyModelMap(map: Partial<AutomationConfig['difficultyModelMap']>): string[] {
  const errors: string[] = [];
  const requiredKeys = ['low', 'medium', 'high'] as const;
  
  for (const key of requiredKeys) {
    const cfg = map[key];
    if (!cfg) {
      errors.push(`缺少 ${key} 难度的模型配置`);
      continue;
    }
    
    if (!cfg.model) {
      errors.push(`${key} 难度的模型名称不能为空`);
    }
    
    if (cfg.maxTokens < 1000) {
      errors.push(`${key} 难度的 maxTokens 必须大于 1000`);
    }
    
    if (cfg.timeout < 60000) {
      errors.push(`${key} 难度的 timeout 必须大于 1 分钟`);
    }
  }
  
  return errors;
}

/** 生成提示词 */
export function generatePrompt(config: AutomationConfig, taskId?: string): string {
  let prompt = config.promptTemplate
    .replace(/{{skillPath}}/g, config.skillPath)
    .replace(/{{planName}}/g, config.planName)
    .replace(/{{workDir}}/g, config.workDir);
  
  if (taskId) {
    prompt = prompt.replace(/{{taskId}}/g, taskId);
  }
  
  return prompt;
}

/** 生成任务拆分提示词 */
export function generateTaskSplitPrompt(config: AutomationConfig, subTaskIndex: number, totalSubTasks: number): string {
  return config.taskSplitPromptTemplate
    .replace(/{{subTaskIndex}}/g, String(subTaskIndex))
    .replace(/{{totalSubTasks}}/g, String(totalSubTasks));
}

export default { defaultConfig, loadConfig, validateConfig, generatePrompt, generateTaskSplitPrompt, resolvePlanConfig };
