/**
 * 任务难度评估模块
 * 分析任务复杂度并为不同难度分配不同模型
 */

import type { Task, TaskDifficulty, DifficultyAssessment, DifficultyModelMap, ModelConfig } from './types.js';
import { estimateTokens } from './context-assessor.js';

/** 默认难度模型映射 */
export const defaultDifficultyModelMap: DifficultyModelMap = {
  low: {
    name: '轻量模型',
    model: 'moonshot-v1-8k',
    maxTokens: 8000,
    temperature: 0.7,
    timeout: 10 * 60 * 1000, // 10分钟
    description: '适用于简单任务，如文档更新、配置修改、小功能添加',
  },
  medium: {
    name: '标准模型',
    model: 'moonshot-v1-32k',
    maxTokens: 32000,
    temperature: 0.7,
    timeout: 20 * 60 * 1000, // 20分钟
    description: '适用于中等复杂度任务，如 API 开发、组件实现',
  },
  high: {
    name: '强力模型',
    model: 'moonshot-v1-128k',
    maxTokens: 128000,
    temperature: 0.5,
    timeout: 40 * 60 * 1000, // 40分钟
    description: '适用于复杂任务，如架构设计、核心模块开发',
  },
};

/** 权重配置 */
const WEIGHTS = {
  complexity: 0.3,    // 复杂度权重
  hours: 0.25,        // 工时权重
  dependencies: 0.15, // 依赖权重
  artifacts: 0.15,    // 产物权重
  criteria: 0.15,     // 验收标准权重
};

/** 评分阈值 */
const THRESHOLDS = {
  low: { min: 0, max: 25 },
  medium: { min: 25, max: 50 },
  high: { min: 50, max: 100 },
};

/**
 * 评估任务难度
 */
export function assessTaskDifficulty(
  task: Task,
  modelMap: DifficultyModelMap = defaultDifficultyModelMap
): DifficultyAssessment {
  // 计算各维度得分
  const complexityScore = calculateComplexityScore(task);
  const hoursScore = calculateHoursScore(task);
  const dependenciesScore = calculateDependenciesScore(task);
  const artifactsScore = calculateArtifactsScore(task);
  const criteriaScore = calculateCriteriaScore(task);
  
  // 计算总分
  const totalScore = 
    complexityScore * WEIGHTS.complexity +
    hoursScore * WEIGHTS.hours +
    dependenciesScore * WEIGHTS.dependencies +
    artifactsScore * WEIGHTS.artifacts +
    criteriaScore * WEIGHTS.criteria;
  
  // 确定难度等级
  const difficulty = determineDifficultyLevel(totalScore);
  
  // 获取推荐模型
  const recommendedModel = modelMap[difficulty];
  
  // 估算 tokens
  const estimatedTokens = estimateTaskTokens(task);
  
  // 建议超时时间
  const suggestedTimeout = Math.max(
    recommendedModel.timeout,
    task.hours * 60 * 60 * 1000 // 基于工时的估算
  );
  
  return {
    difficulty,
    score: Math.round(totalScore),
    factors: {
      complexityScore: Math.round(complexityScore),
      hoursScore: Math.round(hoursScore),
      dependenciesScore: Math.round(dependenciesScore),
      artifactsScore: Math.round(artifactsScore),
      criteriaScore: Math.round(criteriaScore),
    },
    recommendedModel: recommendedModel.model,
    estimatedTokens,
    suggestedTimeout,
  };
}

/**
 * 计算复杂度得分（基于实现步骤）
 */
function calculateComplexityScore(task: Task): number {
  const steps = task.content?.implementation_steps?.length || 0;
  
  if (steps === 0) return 30; // 没有步骤说明的中等难度
  if (steps <= 2) return 10;  // 简单
  if (steps <= 5) return 30;  // 中等
  if (steps <= 10) return 60; // 较难
  return 90; // 困难
}

/**
 * 计算工时得分
 */
function calculateHoursScore(task: Task): number {
  const hours = task.hours;
  
  if (hours <= 2) return 10;   // 快速任务
  if (hours <= 4) return 25;   // 半日任务
  if (hours <= 8) return 45;   // 全日任务
  if (hours <= 16) return 70;  // 双日任务
  return 90; // 长期任务
}

/**
 * 计算依赖得分
 */
function calculateDependenciesScore(task: Task): number {
  const deps = task.dependencies?.length || 0;
  
  if (deps === 0) return 5;   // 无依赖
  if (deps <= 1) return 15;   // 单依赖
  if (deps <= 3) return 35;   // 少量依赖
  if (deps <= 5) return 60;   // 中等依赖
  return 85; // 大量依赖
}

/**
 * 计算产物得分
 */
function calculateArtifactsScore(task: Task): number {
  const artifacts = task.artifacts?.length || 0;
  
  if (artifacts === 0) return 10;
  if (artifacts <= 2) return 20;
  if (artifacts <= 5) return 40;
  if (artifacts <= 10) return 65;
  return 90;
}

/**
 * 计算验收标准得分
 */
function calculateCriteriaScore(task: Task): number {
  const criteria = task.acceptance_criteria?.length || 0;
  
  if (criteria === 0) return 20;
  if (criteria <= 2) return 25;
  if (criteria <= 4) return 45;
  if (criteria <= 7) return 65;
  return 90;
}

/**
 * 确定难度等级
 */
function determineDifficultyLevel(score: number): TaskDifficulty {
  if (score < THRESHOLDS.medium.min) return 'low';
  if (score < THRESHOLDS.high.min) return 'medium';
  return 'high';
}

/**
 * 估算任务 tokens
 */
function estimateTaskTokens(task: Task): number {
  const text = [
    task.title,
    task.description,
    task.content?.background || '',
    task.content?.goals || '',
    task.content?.technical_requirements || '',
    ...(task.content?.implementation_steps || []),
    ...(task.acceptance_criteria || []),
  ].join(' ');
  
  return estimateTokens(text);
}

/**
 * 获取难度描述
 */
export function getDifficultyDescription(difficulty: TaskDifficulty): string {
  const descriptions: Record<TaskDifficulty, string> = {
    low: '简单',
    medium: '中等',
    high: '困难',
  };
  return descriptions[difficulty];
}

/**
 * 获取难度标记
 */
export function getDifficultyEmoji(difficulty: TaskDifficulty): string {
  const marks: Record<TaskDifficulty, string> = {
    low: '[低]',
    medium: '[中]',
    high: '[高]',
  };
  return marks[difficulty];
}

/**
 * 验证模型配置
 */
export function validateModelConfig(config: ModelConfig): string[] {
  const errors: string[] = [];
  
  if (!config.model) {
    errors.push('模型名称不能为空');
  }
  
  if (config.maxTokens < 1000) {
    errors.push('maxTokens 必须大于 1000');
  }
  
  if (config.timeout < 60000) {
    errors.push('timeout 必须大于 1 分钟');
  }
  
  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    errors.push('temperature 必须在 0-2 之间');
  }
  
  return errors;
}

/**
 * 验证难度模型映射
 */
export function validateDifficultyModelMap(map: Partial<DifficultyModelMap>): string[] {
  const errors: string[] = [];
  const requiredKeys: TaskDifficulty[] = ['low', 'medium', 'high'];
  
  for (const key of requiredKeys) {
    if (!map[key]) {
      errors.push(`缺少 ${key} 难度的模型配置`);
      continue;
    }
    
    const configErrors = validateModelConfig(map[key]!);
    if (configErrors.length > 0) {
      errors.push(`${key} 难度配置错误:`, ...configErrors);
    }
  }
  
  return errors;
}

/**
 * 获取模型建议
 */
export function getModelRecommendation(
  difficulty: TaskDifficulty,
  modelMap: DifficultyModelMap = defaultDifficultyModelMap
): string {
  const config = modelMap[difficulty];
  return `${config.name} (${config.model}) - ${config.description}`;
}

/**
 * 批量评估任务难度
 */
export function batchAssessDifficulty(
  tasks: Task[],
  modelMap: DifficultyModelMap = defaultDifficultyModelMap
): Array<{ task: Task; assessment: DifficultyAssessment }> {
  return tasks.map(task => ({
    task,
    assessment: assessTaskDifficulty(task, modelMap),
  }));
}

/**
 * 统计难度分布
 */
export function getDifficultyDistribution(
  tasks: Task[],
  modelMap: DifficultyModelMap = defaultDifficultyModelMap
): { low: number; medium: number; high: number } {
  const distribution = { low: 0, medium: 0, high: 0 };
  
  for (const task of tasks) {
    const assessment = assessTaskDifficulty(task, modelMap);
    distribution[assessment.difficulty]++;
  }
  
  return distribution;
}

export default {
  assessTaskDifficulty,
  getDifficultyDescription,
  getDifficultyEmoji,
  validateModelConfig,
  validateDifficultyModelMap,
  getModelRecommendation,
  batchAssessDifficulty,
  getDifficultyDistribution,
  defaultDifficultyModelMap,
};
