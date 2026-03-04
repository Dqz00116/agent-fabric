/**
 * 上下文长度评估与任务拆分模块
 */

import type { Task, SubTask, ContextAssessment } from './types.js';

// 默认 token 估算比例（字符数 : tokens ≈ 4 : 1）
const CHARS_PER_TOKEN = 4;

// 预留 token 数量（系统提示、响应等）
const RESERVED_TOKENS = 2000;

/**
 * 估算文本的 token 数量
 */
export function estimateTokens(text: string): number {
  // 简单的估算：中文字符按 1 token，英文按 0.25 token
  let tokens = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      tokens += 1; // 中文字符
    } else if (/[a-zA-Z]/.test(char)) {
      tokens += 0.25; // 英文字母
    } else {
      tokens += 0.5; // 其他字符
    }
  }
  return Math.ceil(tokens);
}

/**
 * 估算任务的上下文需求
 */
export function assessTaskContext(
  task: Task,
  maxContextLength: number,
  skillContent?: string
): ContextAssessment {
  // 构建完整的任务提示词
  const fullPrompt = buildFullTaskPrompt(task, skillContent);
  const estimatedTokens = estimateTokens(fullPrompt) + RESERVED_TOKENS;
  
  // 判断是否超过阈值
  const threshold = maxContextLength * 0.8; // 80% 阈值
  const exceedsLimit = estimatedTokens > threshold;
  
  // 计算建议拆分数
  let suggestedSplits = 1;
  if (exceedsLimit) {
    suggestedSplits = Math.ceil(estimatedTokens / (threshold * 0.6));
    suggestedSplits = Math.max(2, Math.min(suggestedSplits, 5)); // 最多拆5个
  }
  
  // 生成子任务
  const subTasks = exceedsLimit 
    ? splitTaskIntoSubTasks(task, suggestedSplits)
    : [];
  
  return {
    estimatedTokens,
    exceedsLimit,
    suggestedSplits,
    subTasks,
  };
}

/**
 * 构建完整任务提示词（用于估算）
 */
function buildFullTaskPrompt(task: Task, skillContent?: string): string {
  const parts: string[] = [];
  
  // Skill 内容
  if (skillContent) {
    parts.push('SKILL 文档:', skillContent);
  }
  
  // 任务信息
  parts.push(
    '任务信息:',
    `ID: ${task.id}`,
    `标题: ${task.title}`,
    `描述: ${task.description}`,
  );
  
  // 详细内容
  if (task.content) {
    if (task.content.background) {
      parts.push('背景:', task.content.background);
    }
    if (task.content.goals) {
      parts.push('目标:', task.content.goals);
    }
    if (task.content.technical_requirements) {
      parts.push('技术要求:', task.content.technical_requirements);
    }
    if (task.content.implementation_steps && task.content.implementation_steps.length > 0) {
      parts.push('实现步骤:', ...task.content.implementation_steps);
    }
  }
  
  // 验收标准
  if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
    parts.push('验收标准:', ...task.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`));
  }
  
  // 产物文件
  if (task.artifacts && task.artifacts.length > 0) {
    parts.push('产物文件:', ...task.artifacts);
  }
  
  return parts.join('\n');
}

/**
 * 拆分任务为子任务
 */
function splitTaskIntoSubTasks(task: Task, splitCount: number): SubTask[] {
  const subTasks: SubTask[] = [];
  
  // 如果任务有实现步骤，按步骤拆分
  if (task.content?.implementation_steps && task.content.implementation_steps.length >= splitCount) {
    const stepsPerSubTask = Math.ceil(task.content.implementation_steps.length / splitCount);
    
    for (let i = 0; i < splitCount; i++) {
      const startIdx = i * stepsPerSubTask;
      const endIdx = Math.min(startIdx + stepsPerSubTask, task.content.implementation_steps.length);
      const steps = task.content.implementation_steps.slice(startIdx, endIdx);
      
      if (steps.length === 0) continue;
      
      const subTaskPrompt = buildSubTaskPrompt(task, i + 1, splitCount, steps);
      
      subTasks.push({
        id: `${task.id}-sub${i + 1}`,
        title: `${task.title} (部分 ${i + 1}/${splitCount})`,
        description: `实现步骤 ${startIdx + 1} 到 ${endIdx}`,
        estimatedTokens: estimateTokens(subTaskPrompt),
        prompt: subTaskPrompt,
        status: 'pending',
      });
    }
  } else {
    // 按产物文件拆分
    const artifactsPerSubTask = Math.ceil((task.artifacts?.length || 1) / splitCount);
    
    for (let i = 0; i < splitCount; i++) {
      const startIdx = i * artifactsPerSubTask;
      const endIdx = Math.min(startIdx + artifactsPerSubTask, task.artifacts?.length || 1);
      const artifacts = task.artifacts?.slice(startIdx, endIdx) || [`${task.id}-part${i + 1}`];
      
      const subTaskPrompt = buildSubTaskPromptByArtifacts(task, i + 1, splitCount, artifacts);
      
      subTasks.push({
        id: `${task.id}-sub${i + 1}`,
        title: `${task.title} (部分 ${i + 1}/${splitCount})`,
        description: `实现产物: ${artifacts.join(', ')}`,
        estimatedTokens: estimateTokens(subTaskPrompt),
        prompt: subTaskPrompt,
        status: 'pending',
      });
    }
  }
  
  return subTasks;
}

/**
 * 构建子任务提示词（按步骤）
 */
function buildSubTaskPrompt(
  task: Task,
  partIndex: number,
  totalParts: number,
  steps: string[]
): string {
  return [
    `【任务拆分 - 部分 ${partIndex}/${totalParts}】`,
    ``,
    `主任务: ${task.id} - ${task.title}`,
    `描述: ${task.description}`,
    ``,
    `本部分需要完成的步骤:`,
    ...steps.map((step, i) => `${i + 1}. ${step}`),
    ``,
    `注意:`,
    `- 这是多部分任务的第 ${partIndex} 部分`,
    `- 完成后需要保留中间结果`,
    `- 如果后续还有部分，需要做好交接准备`,
    `- 验收标准（本部分相关）:`,
    ...(task.acceptance_criteria?.slice(0, 2) || []).map(c => `  * ${c}`),
  ].join('\n');
}

/**
 * 构建子任务提示词（按产物）
 */
function buildSubTaskPromptByArtifacts(
  task: Task,
  partIndex: number,
  totalParts: number,
  artifacts: string[]
): string {
  return [
    `【任务拆分 - 部分 ${partIndex}/${totalParts}】`,
    ``,
    `主任务: ${task.id} - ${task.title}`,
    `描述: ${task.description}`,
    ``,
    `本部分需要实现的产物:`,
    ...artifacts.map(a => `- ${a}`),
    ``,
    `背景信息:`,
    task.content?.background || '',
    ``,
    `注意:`,
    `- 这是多部分任务的第 ${partIndex} 部分`,
    `- 专注于上述产物的实现`,
    `- 确保产物符合项目规范`,
    `- 完成后更新任务状态`,
  ].join('\n');
}

/**
 * 获取任务复杂度级别
 */
export function getTaskComplexity(task: Task): 'low' | 'medium' | 'high' {
  const criteria = task.acceptance_criteria?.length || 0;
  const artifacts = task.artifacts?.length || 0;
  const steps = task.content?.implementation_steps?.length || 0;
  const hours = task.hours;
  
  const score = criteria * 2 + artifacts * 1.5 + steps + hours * 0.5;
  
  if (score < 10) return 'low';
  if (score < 20) return 'medium';
  return 'high';
}

/**
 * 预估任务执行时间（毫秒）
 */
export function estimateExecutionTime(task: Task): number {
  const complexity = getTaskComplexity(task);
  const baseTime = task.hours * 60 * 60 * 1000; // 工时转换为毫秒
  
  // 根据复杂度调整
  const multipliers = {
    low: 0.8,
    medium: 1.0,
    high: 1.5,
  };
  
  return baseTime * multipliers[complexity];
}

export default {
  estimateTokens,
  assessTaskContext,
  getTaskComplexity,
  estimateExecutionTime,
};
