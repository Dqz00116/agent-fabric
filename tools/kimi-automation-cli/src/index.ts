#!/usr/bin/env node
/**
 * Kimi Automation CLI
 * 全自动化任务执行工具 - 仅支持配置文件
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { writeFileSync } from 'fs';
import { loadConfig, validateConfig, generatePrompt } from './config.js';
import { TaskMasterClient } from './taskmaster.js';
import { listPlans } from './taskmaster-config.js';
import { ExecutionEngine } from './engine.js';
import { assessTaskContext, estimateTokens } from './context-assessor.js';
import { 
  assessTaskDifficulty, 
  getDifficultyDescription, 
  getDifficultyEmoji,
  defaultDifficultyModelMap,
  getDifficultyDistribution,
} from './difficulty-assessor.js';
import { LogManager } from './logger.js';
import type { AutomationConfig } from './types.js';

const program = new Command();

program
  .name('kimi-auto')
  .description('Kimi CLI 全自动化任务执行工具 - 仅支持配置文件')
  .version('1.0.0');

program
  .command('run')
  .description('启动自动化执行')
  .option('-c, --config <path>', '配置文件路径', 'kimi-auto.config.json')
  .option('--dry-run', '只显示将要执行的任务，不实际执行')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      validateConfig(config);
      
      console.log('配置信息:');
      console.log(`  配置文件: ${options.config}`);
      console.log(`  计划名称: ${config.planName}`);
      console.log(`  计划路径: ${config.planPath}`);
      console.log(`  工作目录: ${config.workDir}`);
      console.log(`  技能路径: ${config.skillPath}`);
      console.log(`  最大并发: ${config.maxConcurrency}`);
      console.log(`  超时时间: ${config.sessionTimeout / 60000}分钟`);
      console.log(`  最大上下文: ${config.maxContextLength} tokens`);
      console.log(`  任务拆分: ${config.enableTaskSplit ? '启用' : '禁用'} (阈值: ${config.splitThreshold * 100}%)`);
      console.log(`  难度评估: ${config.enableDifficultyAssessment ? '启用' : '禁用'}`);
      if (config.enableDifficultyAssessment) {
        console.log('  难度模型映射:');
        console.log(`    [低] 简单: ${config.difficultyModelMap.low.model} (${config.difficultyModelMap.low.name})`);
        console.log(`    [中] 中等: ${config.difficultyModelMap.medium.model} (${config.difficultyModelMap.medium.name})`);
        console.log(`    [高] 困难: ${config.difficultyModelMap.high.model} (${config.difficultyModelMap.high.name})`);
      }
      console.log(`  错误400继续: ${config.continueOnError400 ? '启用' : '禁用'}`);
      console.log(`  最大重试: ${config.maxRetries}次`);
      console.log(`  交互处理: ${config.interactionConfig.enabled ? '启用' : '禁用'}`);
      if (config.interactionConfig.enabled) {
        console.log(`    自动响应: "${config.interactionConfig.autoResponse}"`);
        console.log(`    stdin延迟: ${config.interactionConfig.stdinCloseDelay}ms`);
      }
      console.log(`  日志记录: ${config.loggerConfig.enabled ? '启用' : '禁用'}`);
      if (config.loggerConfig.enabled) {
        console.log(`    日志目录: ${config.loggerConfig.logDir}`);
        console.log(`    日志级别: ${config.loggerConfig.logLevel}`);
        console.log(`    按Task合并: ${config.loggerConfig.groupByTask ? '是' : '否'}`);
        console.log(`    保留成功日志: ${config.loggerConfig.keepSuccessLogs ? '是' : '否'}`);
      }
      console.log();
      
      if (options.dryRun) {
        await dryRun(config);
      } else {
        await runAutomation(config);
      }
    } catch (error) {
      console.error('错误:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('plan')
  .description('显示执行计划')
  .option('-c, --config <path>', '配置文件路径', 'kimi-auto.config.json')
  .option('--assess-all', '评估所有可执行任务的上下文需求')
  .option('--difficulty-all', '评估所有可执行任务的难度')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      validateConfig(config);
      
      const client = new TaskMasterClient(
        config.skillPath,
        config.planName,
        config.planPath
      );
      
      const tasks = await client.getExecutableTasks();
      const progress = await client.getProgress();
      
      console.log('执行计划概览');
      console.log(`计划: ${config.planName}`);
      console.log(`总进度: ${progress.percentage}% (${progress.completed}/${progress.total})`);
      console.log(`运行中: ${progress.inProgress}, 待处理: ${progress.pending}`);
      console.log();
      
      console.log('可执行任务:');
      for (const task of tasks) {
        const status = task.readyToStart ? '[就绪]' : '[等待依赖]';
        
        // 显示难度
        let difficultyInfo = '';
        if (config.enableDifficultyAssessment || options.difficultyAll) {
          const assessment = assessTaskDifficulty(task, config.difficultyModelMap);
          difficultyInfo = `${getDifficultyEmoji(assessment.difficulty)} ${getDifficultyDescription(assessment.difficulty)} `;
        }
        
        console.log(`  ${status} ${difficultyInfo}${task.id} (${task.priority}): ${task.title}`);
        
        if (!task.readyToStart && task.blockingDependencies.length > 0) {
          console.log(`      依赖: ${task.blockingDependencies.join(', ')}`);
        }
      }
      
      // 评估所有任务上下文
      if (options.assessAll) {
        console.log();
        console.log('上下文评估:');
        for (const task of tasks.filter(t => t.readyToStart)) {
          const assessment = assessTaskContext(task, config.maxContextLength);
          const status = assessment.exceedsLimit ? '⚠️  需要拆分' : '✓ 正常';
          console.log(`  ${task.id}: ${assessment.estimatedTokens} tokens ${status}`);
          if (assessment.exceedsLimit) {
            console.log(`      建议拆分为 ${assessment.suggestedSplits} 个子任务`);
          }
        }
      }
      
      // 评估所有任务难度
      if (options.difficultyAll) {
        console.log();
        console.log('难度评估:');
        const distribution = { low: 0, medium: 0, high: 0 };
        for (const task of tasks.filter(t => t.readyToStart)) {
          const assessment = assessTaskDifficulty(task, config.difficultyModelMap);
          distribution[assessment.difficulty]++;
          console.log(`  ${task.id}: ${getDifficultyEmoji(assessment.difficulty)} ${getDifficultyDescription(assessment.difficulty)} (${assessment.score}分) → ${assessment.recommendedModel}`);
        }
        console.log();
        console.log('难度分布:');
        console.log(`  [低] 简单: ${distribution.low}`);
        console.log(`  [中] 中等: ${distribution.medium}`);
        console.log(`  [高] 困难: ${distribution.high}`);
      }
    } catch (error) {
      console.error('错误:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('assess')
  .description('评估任务上下文需求')
  .argument('<taskId>', '任务ID')
  .option('-c, --config <path>', '配置文件路径', 'kimi-auto.config.json')
  .action(async (taskId, options) => {
    try {
      const config = loadConfig(options.config);
      validateConfig(config);
      
      const client = new TaskMasterClient(
        config.skillPath,
        config.planName,
        config.planPath
      );
      
      const task = await client.getTask(taskId);
      if (!task) {
        console.error(`任务 ${taskId} 不存在`);
        return;
      }
      
      console.log(`任务评估: ${task.id} - ${task.title}`);
      console.log(`描述: ${task.description}`);
      console.log();
      
      // 上下文评估
      const contextAssessment = assessTaskContext(task, config.maxContextLength);
      
      console.log('上下文评估结果:');
      console.log(`  预估 Tokens: ${contextAssessment.estimatedTokens}`);
      console.log(`  最大限制: ${config.maxContextLength}`);
      console.log(`  拆分阈值: ${Math.round(config.maxContextLength * config.splitThreshold)}`);
      console.log(`  需要拆分: ${contextAssessment.exceedsLimit ? '是' : '否'}`);
      
      if (contextAssessment.exceedsLimit) {
        console.log();
        console.log(`建议拆分为 ${contextAssessment.suggestedSplits} 个子任务:`);
        for (const subTask of contextAssessment.subTasks) {
          console.log();
          console.log(`  子任务 ${subTask.id}:`);
          console.log(`    标题: ${subTask.title}`);
          console.log(`    描述: ${subTask.description}`);
          console.log(`    预估 Tokens: ${subTask.estimatedTokens}`);
        }
      }
      
      // 难度评估
      console.log();
      const difficultyAssessment = assessTaskDifficulty(task, config.difficultyModelMap);
      console.log('难度评估结果:');
      console.log(`  难度等级: ${getDifficultyEmoji(difficultyAssessment.difficulty)} ${getDifficultyDescription(difficultyAssessment.difficulty)}`);
      console.log(`  综合得分: ${difficultyAssessment.score}分`);
      console.log(`  推荐模型: ${difficultyAssessment.recommendedModel}`);
    } catch (error) {
      console.error('错误:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('difficulty')
  .description('评估任务难度')
  .argument('[taskId]', '任务ID（可选，不提供则显示所有任务难度分布）')
  .option('-c, --config <path>', '配置文件路径', 'kimi-auto.config.json')
  .action(async (taskId, options) => {
    try {
      const config = loadConfig(options.config);
      validateConfig(config);
      
      const client = new TaskMasterClient(
        config.skillPath,
        config.planName,
        config.planPath
      );
      
      if (taskId) {
        // 评估单个任务
        const task = await client.getTask(taskId);
        if (!task) {
          console.error(`任务 ${taskId} 不存在`);
          return;
        }
        
        console.log(`任务难度评估: ${task.id} - ${task.title}`);
        console.log(`描述: ${task.description}`);
        console.log();
        
        const assessment = assessTaskDifficulty(task, config.difficultyModelMap);
        
        console.log('难度评估结果:');
        console.log(`  难度等级: ${getDifficultyEmoji(assessment.difficulty)} ${getDifficultyDescription(assessment.difficulty)}`);
        console.log(`  综合得分: ${assessment.score}分`);
        console.log();
        console.log('评分详情:');
        console.log(`  复杂度得分: ${assessment.factors.complexityScore}/100 (实现步骤数量)`);
        console.log(`  工时得分: ${assessment.factors.hoursScore}/100 (预估工时)`);
        console.log(`  依赖得分: ${assessment.factors.dependenciesScore}/100 (依赖任务数量)`);
        console.log(`  产物得分: ${assessment.factors.artifactsScore}/100 (产物文件数量)`);
        console.log(`  标准得分: ${assessment.factors.criteriaScore}/100 (验收标准数量)`);
        console.log();
        console.log('模型配置:');
        const modelConfig = config.difficultyModelMap[assessment.difficulty];
        console.log(`  模型名称: ${modelConfig.name}`);
        console.log(`  模型ID: ${modelConfig.model}`);
        console.log(`  最大Tokens: ${modelConfig.maxTokens}`);
        console.log(`  Temperature: ${modelConfig.temperature}`);
        console.log(`  超时时间: ${Math.round(modelConfig.timeout / 60000)}分钟`);
        console.log(`  描述: ${modelConfig.description}`);
        console.log();
        console.log('预估信息:');
        console.log(`  预估Tokens: ${assessment.estimatedTokens}`);
        console.log(`  建议超时: ${Math.round(assessment.suggestedTimeout / 60000)}分钟`);
      } else {
        // 显示所有任务难度分布
        const tasks = await client.getExecutableTasks();
        const readyTasks = tasks.filter(t => t.readyToStart);
        
        console.log('任务难度分布统计');
        console.log(`计划: ${config.planName}`);
        console.log(`可执行任务数: ${readyTasks.length}`);
        console.log();
        
        const distribution = getDifficultyDistribution(readyTasks, config.difficultyModelMap);
        
        console.log('难度分布:');
        console.log(`  [低] 简单: ${distribution.low} 个任务`);
        console.log(`     模型: ${config.difficultyModelMap.low.model}`);
        console.log(`  [中] 中等: ${distribution.medium} 个任务`);
        console.log(`     模型: ${config.difficultyModelMap.medium.model}`);
        console.log(`  [高] 困难: ${distribution.high} 个任务`);
        console.log(`     模型: ${config.difficultyModelMap.high.model}`);
      }
    } catch (error) {
      console.error('错误:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('plans')
  .description('列出 TaskMaster 中所有可用计划')
  .option('-c, --config <path>', '配置文件路径', 'kimi-auto.config.json')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      // skillPath 从配置读取
      const skillPath = resolve(config.skillPath);
      const plans = listPlans(skillPath);
      
      console.log('可用计划列表:');
      console.log();
      
      for (const plan of plans) {
        console.log(`  ${plan.name}`);
        console.log(`    路径: ${plan.path}`);
        console.log(`    描述: ${plan.description}`);
        console.log();
      }
      
      console.log(`共 ${plans.length} 个计划`);
    } catch (error) {
      console.error('错误:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('查看和管理日志')
  .option('-c, --config <path>', '配置文件路径', 'kimi-auto.config.json')
  .option('--list', '列出所有日志', true)
  .option('--task <taskId>', '筛选特定任务')
  .option('--success', '只显示成功的')
  .option('--failed', '只显示失败的')
  .option('--stats', '显示统计信息')
  .option('--tail <n>', '显示最近 N 条', '10')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      
      const logManager = new LogManager(config.loggerConfig);
      
      if (options.stats) {
        const stats = logManager.getStats();
        console.log('日志统计信息');
        console.log('====================');
        console.log(`总任务数: ${stats.totalTasks}`);
        console.log(`成功: ${stats.successCount}`);
        console.log(`失败: ${stats.failureCount}`);
        console.log(`总尝试次数: ${stats.totalAttempts}`);
        console.log(`平均耗时: ${stats.avgDuration}ms`);
        console.log(`总交互次数: ${stats.totalInteractions}`);
        return;
      }
      
      const filterOptions: {
        taskId?: string;
        success?: boolean;
      } = {};
      
      if (options.task) filterOptions.taskId = options.task;
      if (options.success) filterOptions.success = true;
      if (options.failed) filterOptions.success = false;
      
      const logs = logManager.listLogs(filterOptions);
      const tailCount = parseInt(options.tail, 10);
      const recentLogs = logs.slice(0, tailCount);
      
      console.log(`日志列表 (最近 ${recentLogs.length}/${logs.length} 条)`);
      console.log('====================');
      
      for (const log of recentLogs) {
        const meta = log.metadata;
        const lastExec = meta.executions[meta.executions.length - 1];
        const status = meta.successful ? '✓' : lastExec?.endTime ? '✗' : '...';
        const duration = meta.finalDuration ? `${meta.finalDuration}ms` : 'N/A';
        const difficulty = meta.difficulty ? getDifficultyEmoji(meta.difficulty) : '';
        
        console.log();
        console.log(`${status} ${meta.taskId} ${difficulty}`);
        console.log(`   尝试次数: ${meta.totalAttempts}`);
        console.log(`   模型: ${meta.model || 'default'}`);
        console.log(`   总耗时: ${duration}`);
        console.log(`   总交互: ${meta.totalInteractions}次`);
        console.log(`   最后更新: ${new Date(meta.lastAttemptTime).toLocaleString()}`);
        if (lastExec?.error) {
          console.log(`   错误: ${lastExec.error.substring(0, 100)}...`);
        }
      }
      
      if (recentLogs.length > 0) {
        console.log();
        console.log('使用以下命令查看详细日志:');
        console.log(`  type "${recentLogs[0].logFile}"`);
      }
    } catch (error) {
      console.error('错误:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('初始化配置文件')
  .option('-o, --output <path>', '输出路径', 'kimi-auto.config.json')
  .action((options) => {
    const defaultConfig = {
      skillPath: 'E:\\Agent\\agent-fabric\\docs\\plans\\taskmaster-skill',
      workDir: 'E:\\Agent\\agent-fabric',
      maxConcurrency: 3,
      sessionTimeout: 1800000,
      pollInterval: 5000,
      kimiCliPath: 'kimi',
      autoApprove: true,
      agentFile: './agent.yaml',  // 使用自定义 Agent 配置（禁用 AskUserQuestion）
      maxContextLength: 128000,
      enableTaskSplit: true,
      splitThreshold: 0.8,
      maxRetries: 2,
      retryDelay: 5000,
      continueOnError400: true,
      continuePrompt: '继续刚才的任务',
      enableDifficultyAssessment: true,
      difficultyModelMap: {
        low: {
          name: '轻量模型',
          model: 'moonshot-v1-8k',
          maxTokens: 8000,
          temperature: 0.7,
          timeout: 600000,
          description: '适用于简单任务'
        },
        medium: {
          name: '标准模型',
          model: 'moonshot-v1-32k',
          maxTokens: 32000,
          temperature: 0.7,
          timeout: 1200000,
          description: '适用于中等复杂度任务'
        },
        high: {
          name: '强力模型',
          model: 'moonshot-v1-128k',
          maxTokens: 128000,
          temperature: 0.5,
          timeout: 2400000,
          description: '适用于复杂任务'
        }
      },
      interactionConfig: {
        enabled: true,
        autoResponse: '继续执行任务，无需确认',
        responseDelay: 500,
        maxInteractions: 5,
        stdinCloseDelay: 2000,
        addAntiInteractivePrefix: true
      },
      loggerConfig: {
        enabled: true,
        logDir: './logs',
        maxLogFiles: 100,
        maxLogAge: 30,
        logLevel: 'info',
        consoleOutput: false,
        groupByTask: true,        // 按 Task 合并日志
        keepSuccessLogs: false,   // 不保留成功任务的详细日志
        keepMetadataOnly: true,   // 成功后只保留元数据摘要
        compressOldLogs: true,    // 压缩旧日志
      },
      subagents: {
        enabled: true,               // 启用子 Agent
        maxParallelSubagents: 3,     // 最大并行子 Agent 数
        defaultTimeout: 300000,      // 默认超时 5 分钟
      },
      promptTemplate: '阅读{{skillPath}}\\SKILL.md这个技能，然后执行第一个可开始的任务',
      taskSplitPromptTemplate: '这个任务比较复杂，需要拆分成多个部分执行。请先完成以下部分：'
    };
    
    writeFileSync(options.output, JSON.stringify(defaultConfig, null, 2));
    console.log(`配置文件已创建: ${options.output}`);
    console.log();
    console.log('说明:');
    console.log('  - 所有配置都通过此文件管理');
    console.log('  - 使用 "kimi-auto init" 创建新配置');
    console.log('  - 使用 "kimi-auto run -c <path>" 指定其他配置文件');
  });

async function dryRun(config: AutomationConfig): Promise<void> {
  const client = new TaskMasterClient(
    config.skillPath,
    config.planName,
    config.planPath
  );
  
  const tasks = await client.getExecutableTasks();
  const readyTasks = tasks.filter(t => t.readyToStart);
  
  console.log('【试运行模式】将要执行的任务:');
  console.log();
  
  for (let i = 0; i < Math.min(readyTasks.length, config.maxConcurrency); i++) {
    const task = readyTasks[i];
    const prompt = generatePrompt(config, task.id);
    
    console.log(`任务 ${i + 1}: ${task.id}`);
    console.log(`标题: ${task.title}`);
    
    // 难度评估
    if (config.enableDifficultyAssessment) {
      const difficultyAssessment = assessTaskDifficulty(task, config.difficultyModelMap);
      console.log(`难度: ${getDifficultyEmoji(difficultyAssessment.difficulty)} ${getDifficultyDescription(difficultyAssessment.difficulty)} (${difficultyAssessment.score}分)`);
      console.log(`模型: ${difficultyAssessment.recommendedModel}`);
    }
    
    // 上下文评估
    if (config.enableTaskSplit) {
      const contextAssessment = assessTaskContext(task, config.maxContextLength);
      if (contextAssessment.exceedsLimit) {
        console.log(`上下文: ${contextAssessment.estimatedTokens} tokens (将拆分为 ${contextAssessment.suggestedSplits} 个子任务)`);
      } else {
        console.log(`上下文: ${contextAssessment.estimatedTokens} tokens (正常)`);
      }
    }
    
    console.log(`提示词: ${prompt.substring(0, 100)}...`);
    console.log();
  }
  
  console.log(`总计 ${readyTasks.length} 个任务可执行`);
}

async function runAutomation(config: AutomationConfig): Promise<void> {
  const engine = new ExecutionEngine(config, {
    onTaskStart: (taskId, sessionId, difficulty, model) => {
      const diffStr = difficulty ? `[${getDifficultyDescription(difficulty)}]` : '';
      const modelStr = model ? `[${model}]` : '';
      console.log(`[${new Date().toISOString()}] 任务开始: ${taskId} ${diffStr} ${modelStr} (Session: ${sessionId})`);
    },
    onTaskComplete: (taskId, result) => {
      console.log(`[${new Date().toISOString()}] 任务完成: ${taskId} (${result.duration}ms)`);
    },
    onTaskFailed: (taskId, error) => {
      console.error(`[${new Date().toISOString()}] 任务失败: ${taskId} - ${error}`);
    },
    onTaskSplit: (taskId, count) => {
      console.log(`[${new Date().toISOString()}] 任务拆分: ${taskId} 拆分为 ${count} 个子任务`);
    },
    onTaskRetry: (taskId, attempt) => {
      console.log(`[${new Date().toISOString()}] 任务重试: ${taskId} 第 ${attempt} 次`);
    },
    onTaskContinue: (taskId, reason) => {
      console.log(`[${new Date().toISOString()}] 任务继续: ${taskId} 原因: ${reason}`);
    },
    onComplete: (report) => {
      console.log();
      console.log('=== 执行报告 ===');
      console.log(report.summary);
      console.log();
      console.log('详细信息:');
      console.log(`  计划: ${report.planName}`);
      console.log(`  成功: ${report.stats.completed}`);
      console.log(`  失败: ${report.stats.failed}`);
      console.log(`  拆分: ${report.stats.split}`);
      console.log(`  重试: ${report.stats.retried}`);
      console.log('  难度分布:');
      console.log(`    [低] 简单: ${report.stats.byDifficulty.low}`);
      console.log(`    [中] 中等: ${report.stats.byDifficulty.medium}`);
      console.log(`    [高] 困难: ${report.stats.byDifficulty.high}`);
    }
  });
  
  process.on('SIGINT', () => {
    console.log('\n收到中断信号，正在停止...');
    engine.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    engine.stop();
    process.exit(0);
  });
  
  await engine.start();
}

program.parse();
