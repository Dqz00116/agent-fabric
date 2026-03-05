/**
 * 类型定义
 */

/** 任务状态 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'archived';

/** 任务优先级 */
export type TaskPriority = 'P0' | 'P1' | 'P2';

/** 任务难度等级 */
export type TaskDifficulty = 'low' | 'medium' | 'high';

/** TaskMaster 任务 */
export interface Task {
  id: string;
  phase: string;
  title: string;
  description: string;
  hours: number;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];
  acceptance_criteria: string[];
  artifacts: string[];
  archived: boolean;
  content?: {
    background?: string;
    goals?: string;
    technical_requirements?: string;
    implementation_steps?: string[];
    notes?: string;
    references?: string;
  };
}

/** TaskMaster 计划 */
export interface Plan {
  version: string;
  created_at: string;
  meta: {
    title: string;
    estimated_weeks: number;
    total_hours: number;
    total_tasks: number;
  };
  phases: Phase[];
  tasks: Task[];
}

/** 阶段 */
export interface Phase {
  id: string;
  name: string;
  week: string;
  deliverable: string;
  task_count: number;
  hours: number;
}

/** 难度评估结果 */
export interface DifficultyAssessment {
  difficulty: TaskDifficulty;
  score: number;
  factors: {
    complexityScore: number;
    hoursScore: number;
    dependenciesScore: number;
    artifactsScore: number;
    criteriaScore: number;
  };
  recommendedModel: string;
  estimatedTokens: number;
  suggestedTimeout: number;
}

/** 模型配置 */
export interface ModelConfig {
  name: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  timeout: number;
  description?: string;
}

/** 难度模型映射 */
export type DifficultyModelMap = {
  [K in TaskDifficulty]: ModelConfig;
};

/** Session 配置 */
export interface SessionConfig {
  id: string;
  taskId: string;
  workDir: string;
  prompt: string;
  status: SessionStatus;
  startTime?: number;
  endTime?: number;
  output?: string;
  error?: string;
  retryCount?: number;
  isContinuation?: boolean;
  originalPrompt?: string;
  subTasks?: SubTask[];
  currentSubTaskIndex?: number;
  difficulty?: TaskDifficulty;
  modelConfig?: ModelConfig;
}

/** Session 状态 */
export type SessionStatus = 
  | 'pending'      // 等待执行
  | 'running'      // 执行中
  | 'completed'    // 成功完成
  | 'failed'       // 执行失败
  | 'timeout'      // 超时
  | 'retrying'     // 重试中
  | 'split';       // 任务已拆分

/** 子任务 */
export interface SubTask {
  id: string;
  title: string;
  description: string;
  estimatedTokens: number;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
}

/** 上下文评估结果 */
export interface ContextAssessment {
  estimatedTokens: number;
  exceedsLimit: boolean;
  suggestedSplits: number;
  subTasks: SubTask[];
}

/** CLI 配置 */
export interface AutomationConfig {
  // 基础配置
  planPath: string;
  planName: string;
  workDir: string;
  skillPath: string;
  
  // 并行配置
  maxConcurrency: number;
  
  // Session 配置
  sessionTimeout: number;      // Session 超时时间（毫秒）
  pollInterval: number;        // 状态轮询间隔（毫秒）
  
  // Kimi CLI 配置
  kimiCliPath: string;
  autoApprove: boolean;
  agentFile?: string;           // 自定义 Agent 配置文件路径
  
  // 上下文管理配置
  maxContextLength: number;    // 最大上下文长度（tokens）
  enableTaskSplit: boolean;    // 是否启用任务拆分
  splitThreshold: number;      // 拆分阈值（超过此比例时拆分）
  
  // 错误处理配置
  maxRetries: number;          // 最大重试次数
  retryDelay: number;          // 重试延迟（毫秒）
  continueOnError400: boolean; // 遇到错误400是否继续
  continuePrompt: string;      // 继续任务的提示词
  
  // 难度评估配置
  enableDifficultyAssessment: boolean;  // 启用难度评估
  difficultyModelMap: DifficultyModelMap; // 难度模型映射
  
  // 交互处理配置
  interactionConfig: {
    enabled: boolean;               // 启用交互处理
    autoResponse: string;           // 自动响应内容
    responseDelay: number;          // 响应延迟（毫秒）
    maxInteractions: number;        // 最大交互次数
    stdinCloseDelay: number;        // stdin 关闭延迟
    addAntiInteractivePrefix: boolean; // 添加非交互式提示词前缀
  };
  
  // 日志配置
  loggerConfig: {
    enabled: boolean;               // 启用日志
    logDir: string;                 // 日志目录
    maxLogFiles: number;            // 最大保留日志文件数
    maxLogAge: number;              // 最大保留天数
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    consoleOutput: boolean;         // 是否同时输出到控制台
    groupByTask: boolean;           // 按 Task 合并日志
    keepSuccessLogs: boolean;       // 是否保留成功任务的详细日志
    keepMetadataOnly: boolean;      // 成功后只保留元数据
    compressOldLogs: boolean;       // 是否压缩旧日志
  };
  
  // 提示词模板
  promptTemplate: string;
  taskSplitPromptTemplate: string;
  
  // 子 Agent 配置
  subagents?: {
    enabled: boolean;              // 是否启用子 Agent
    maxParallelSubagents: number;  // 最大并行子 Agent 数量
    defaultTimeout: number;        // 子 Agent 默认超时（毫秒）
  };
}

/** 执行统计 */
export interface ExecutionStats {
  total: number;
  completed: number;
  failed: number;
  timeout: number;
  pending: number;
  running: number;
  retried: number;
  split: number;
  byDifficulty: {
    low: number;
    medium: number;
    high: number;
  };
  startTime: number;
  endTime?: number;
}

/** 执行报告 */
export interface ExecutionReport {
  planName: string;
  stats: ExecutionStats;
  sessions: SessionConfig[];
  summary: string;
}

/** 可执行任务 */
export interface ExecutableTask extends Task {
  readyToStart: boolean;
  blockingDependencies: string[];
}

/** TaskMaster CLI 输出 */
export interface TaskMasterOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Session 执行结果 */
export interface SessionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  needsContinuation?: boolean;
  isError400?: boolean;
  retryable?: boolean;
}
