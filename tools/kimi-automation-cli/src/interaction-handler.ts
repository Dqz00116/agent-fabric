/**
 * 交互式对话处理模块
 * 检测并自动响应 Kimi CLI 的交互请求
 * 增强支持 k2.5 模型的交互式选项
 */

import type { ChildProcess } from 'child_process';

export interface InteractionConfig {
  enabled: boolean;
  autoResponse: string;
  responseDelay: number;
  maxInteractions: number;
  stdinCloseDelay: number;
  addAntiInteractivePrefix: boolean;
  selectionStrategy: 'first' | 'default' | 'continue' | 'smart';  // 选项选择策略
}

export const defaultInteractionConfig: InteractionConfig = {
  enabled: true,
  autoResponse: '继续执行任务，无需确认',
  responseDelay: 500,
  maxInteractions: 10,  // 增加默认交互次数
  stdinCloseDelay: 2000,
  addAntiInteractivePrefix: true,
  selectionStrategy: 'smart',  // 默认使用智能选择
};

/**
 * 交互检测模式
 */
const INTERACTION_PATTERNS = [
  // 问号结尾
  /\?\s*$/m,
  // 中文输入请求
  /请输入[：:]?/i,
  // 确认请求
  /请确认[：:]?/i,
  /是否需要确认/i,
  // 英文确认
  /continue\?/i,
  /proceed\?/i,
  /confirm\?/i,
  /ok\?/i,
  // 是/否选择
  /\(\s*y\/n\s*\)/i,
  /\(\s*yes\/no\s*\)/i,
  /\[Y\/n\]/i,
  /\[yes\/no\]/i,
  // 命令行提示符（可能是等待输入）
  /^>\s*$/m,
  /^>>>\s*$/m,
  /^\$\s*$/m,
  // 等待输入
  /waiting for input/i,
  /please enter/i,
  /provide your/i,
  // 选择提示
  /请选择/i,
  /select one/i,
  /choose an option/i,
  /choose one/i,
  // 澄清问题
  /你能澄清一下/i,
  /能否提供更多/i,
  /can you clarify/i,
  /could you provide more/i,
  // 暂停等待
  /press any key to continue/i,
  /按任意键继续/i,
  /press enter/i,
  /按回车/i,
  // k2.5 模型常见交互模式
  /选项[：:]/i,
  /options?\s*[:：]/i,
  /^(\d+[\.\)\-]\s+|\([\da-z]\)\s+|\[[\da-z]\]\s+)/im,  // 数字或字母选项前缀
  /\n\s*\d+\.\s+\S+/m,  // 数字编号选项
  /\n\s*[a-z]\.\s+\S+/m,  // 字母编号选项
  /\n\s*\(\d+\)\s+\S+/m,  // 括号数字选项
  /\n\s*\([a-z]\)\s+\S+/m,  // 括号字母选项
  /your choice[：:]/i,
  /enter.*choice/i,
  /输入.*选择/i,
  /选择.*编号/i,
  /想要.*(如何|怎样)/i,
  /would you like/i,
  /how would you like/i,
  /which.*(option|one)/i,
  /multiple.*choice/i,
  /单选|多选/i,
];

/**
 * k2.5 AskUserQuestion 结构化问答检测模式
 */
const STRUCTURED_QA_PATTERNS = {
  // JSON 格式的 AskUserQuestion
  jsonQuestion: /\{\s*"question"\s*:\s*"([^"]+)"/i,
  jsonOptions: /"options"\s*:\s*(\[[^\]]+\])/i,
  // 工具调用格式
  toolCall: /AskUserQuestion|ask_user_question/i,
  // 结构化问题标记
  structuredMarker: /┌─\s*.*[问题|Question].*\s*─┐/,
  // 选项面板格式
  optionPanel: /│\s*[○●◯◉]\s*.+\s*│/,
  // 问题提示
  questionPrompt: /(?:请选择|请回答|Which|What|How).*[:：]\s*$/m,
};

/**
 * 选项项
 */
export interface OptionItem {
  key: string;
  text: string;
  isDefault?: boolean;
  isRecommended?: boolean;
}

/**
 * 解析结果
 */
export interface ParsedOptions {
  hasOptions: boolean;
  options: OptionItem[];
  prompt: string;
  optionType: 'number' | 'letter' | 'mixed' | 'yn' | 'unknown';
}

/**
 * 交互处理器
 */
export class InteractionHandler {
  private config: InteractionConfig;
  private interactionCount = 0;
  private lastResponseTime = 0;
  private outputBuffer = '';
  private isDestroyed = false;
  private recentOptions: ParsedOptions | null = null;

  constructor(config: Partial<InteractionConfig> = {}) {
    this.config = { ...defaultInteractionConfig, ...config };
  }

  /**
   * 设置交互处理
   */
  setup(
    child: ChildProcess,
    sessionId: string,
    onInteraction?: (type: string, content: string) => void
  ): void {
    if (!this.config.enabled) return;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let checkTimeout: ReturnType<typeof setTimeout> | null = null;

    // 监听 stdout
    child.stdout?.on('data', (data: Buffer) => {
      if (this.isDestroyed) return;
      
      const text = data.toString('utf8');
      stdoutBuffer += text;
      this.outputBuffer += text;

      // 防抖检测
      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        this.checkAndRespond(child, stdoutBuffer, sessionId, onInteraction);
        stdoutBuffer = '';
      }, this.config.responseDelay);
    });

    // 监听 stderr
    child.stderr?.on('data', (data: Buffer) => {
      if (this.isDestroyed) return;
      
      const text = data.toString('utf8');
      stderrBuffer += text;

      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        this.checkAndRespond(child, stderrBuffer, sessionId, onInteraction, true);
        stderrBuffer = '';
      }, this.config.responseDelay);
    });

    // 进程结束时清理
    child.on('close', () => {
      this.isDestroyed = true;
      if (checkTimeout) clearTimeout(checkTimeout);
    });
  }

  /**
   * 检测并响应交互
   */
  private checkAndRespond(
    child: ChildProcess,
    text: string,
    sessionId: string,
    onInteraction?: (type: string, content: string) => void,
    isStderr = false
  ): void {
    if (this.interactionCount >= this.config.maxInteractions) {
      console.log(`[Session ${sessionId}] 交互次数超过限制 (${this.config.maxInteractions})，停止自动响应`);
      return;
    }

    // 检测交互提示
    const interaction = this.detectInteraction(text);
    if (!interaction) return;

    // 防止重复响应（1秒内不重复响应相同类型的交互）
    const now = Date.now();
    if (now - this.lastResponseTime < 1000) return;

    this.interactionCount++;
    this.lastResponseTime = now;

    console.log(`[Session ${sessionId}] 检测到交互请求 (${this.interactionCount}/${this.config.maxInteractions}): ${interaction.type}`);
    
    onInteraction?.(interaction.type, interaction.content);

    // 发送自动响应（传入选项信息）
    this.sendResponse(child, interaction.type, interaction.options);
  }

  /**
   * 检测结构化问答 (k2.5 AskUserQuestion)
   */
  private detectStructuredQA(text: string): { type: string; content: string; options?: ParsedOptions } | null {
    // 检测是否包含结构化问答标记
    const hasStructuredMarker = STRUCTURED_QA_PATTERNS.structuredMarker.test(text) ||
                                 STRUCTURED_QA_PATTERNS.optionPanel.test(text) ||
                                 STRUCTURED_QA_PATTERNS.toolCall.test(text);
    
    // 解析选项
    const parsedOptions = this.parseOptions(text);
    
    if (hasStructuredMarker || parsedOptions.hasOptions) {
      this.recentOptions = parsedOptions;
      
      return {
        type: 'structured_qa',
        content: text.slice(-500),  // 取最后500字符
        options: parsedOptions,
      };
    }
    
    return null;
  }

  /**
   * 解析选项
   */
  private parseOptions(text: string): ParsedOptions {
    const options: OptionItem[] = [];
    const lines = text.split('\n');
    let optionType: ParsedOptions['optionType'] = 'unknown';
    let prompt = '';
    
    // 提取问题描述（在选项之前的文本）
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // 检测是否是选项行
      if (this.isOptionLine(line)) {
        continue;
      }
      
      // 检测到非选项行，可能是问题描述
      if (!prompt && line.length > 3) {
        prompt = line;
        break;
      }
    }
    
    // 解析各种格式的选项
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 匹配数字选项: 1. xxx, 1) xxx, [1] xxx
      const numberMatch = trimmed.match(/^(?:\[?(\d+)\]?[\.\)\-\s]+|\(\s*(\d+)\s*\)\s*)(.+)$/);
      if (numberMatch) {
        const key = numberMatch[1] || numberMatch[2];
        const text = numberMatch[3].trim();
        options.push({
          key,
          text,
          isDefault: text.includes('(默认)') || text.includes('(default)') || text.includes('(推荐)') || text.includes('(recommended)'),
        });
        optionType = 'number';
        continue;
      }
      
      // 匹配字母选项: a. xxx, a) xxx, [a] xxx, (a) xxx
      const letterMatch = trimmed.match(/^(?:\[?([a-zA-Z])\]?[\.\)\-\s]+|\(\s*([a-zA-Z])\s*\)\s*)(.+)$/);
      if (letterMatch) {
        const key = letterMatch[1] || letterMatch[2];
        const text = letterMatch[3].trim();
        options.push({
          key,
          text,
          isDefault: text.includes('(默认)') || text.includes('(default)') || text.includes('(推荐)') || text.includes('(recommended)'),
        });
        optionType = optionType === 'number' ? 'mixed' : 'letter';
        continue;
      }
      
      // 匹配特殊选项标记
      const specialMatch = trimmed.match(/^[○◯]\s*(.+)$/);
      if (specialMatch) {
        options.push({
          key: String(options.length + 1),
          text: specialMatch[1].trim(),
        });
        if (optionType === 'unknown') optionType = 'number';
      }
    }
    
    return {
      hasOptions: options.length > 0,
      options,
      prompt,
      optionType,
    };
  }

  /**
   * 检测是否是选项行
   */
  private isOptionLine(line: string): boolean {
    return /^(?:\[?\d+\]?[\.\)\-\s]+|\(\s*\d+\s*\)\s*|\[?[a-zA-Z]\]?[\.\)\-\s]+|\(\s*[a-zA-Z]\s*\)\s*|[○◯]\s+)/.test(line.trim());
  }

  /**
   * 检测交互类型
   */
  private detectInteraction(text: string): { type: string; content: string; options?: ParsedOptions } | null {
    // 首先检测结构化问答 (k2.5)
    const structuredQA = this.detectStructuredQA(text);
    if (structuredQA) {
      return structuredQA;
    }
    
    // 检查是否匹配常规交互模式
    for (const pattern of INTERACTION_PATTERNS) {
      if (pattern.test(text)) {
        // 提取交互内容（前后文）
        const lines = text.split('\n');
        const lastLines = lines.slice(-5).join('\n'); // 取最后5行
        
        // 同时解析可能的选项
        const parsedOptions = this.parseOptions(text);
        
        return {
          type: this.categorizeInteraction(pattern),
          content: lastLines.trim(),
          options: parsedOptions.hasOptions ? parsedOptions : undefined,
        };
      }
    }

    // 检测长暂停（可能是等待输入但没有明确提示）
    // 这个需要在更上层通过超时来检测
    return null;
  }

  /**
   * 分类交互类型
   */
  private categorizeInteraction(pattern: RegExp): string {
    if (pattern.source.includes('确认') || pattern.source.includes('confirm')) {
      return 'confirmation';
    }
    if (pattern.source.includes('输入') || pattern.source.includes('enter') || pattern.source.includes('provide')) {
      return 'input_request';
    }
    if (pattern.source.includes('选择') || pattern.source.includes('select') || pattern.source.includes('choose')) {
      return 'selection';
    }
    if (pattern.source.includes('澄清') || pattern.source.includes('clarify')) {
      return 'clarification';
    }
    if (pattern.source.includes('continue') || pattern.source.includes('proceed')) {
      return 'continuation';
    }
    return 'general';
  }

  /**
   * 发送自动响应
   */
  private sendResponse(
    child: ChildProcess, 
    type: string, 
    options?: ParsedOptions
  ): void {
    if (!child.stdin || child.stdin.destroyed) return;

    let response = this.config.autoResponse;

    // 如果有选项，使用智能选择
    if (options?.hasOptions && options.options.length > 0) {
      response = this.selectBestOption(options, type);
    } else {
      // 根据交互类型定制响应
      switch (type) {
        case 'structured_qa':
          response = '1';  // 结构化问答默认选第一个
          break;
        case 'confirmation':
          response = 'y';  // 或者 'yes'
          break;
        case 'continuation':
          response = '';  // 直接回车
          break;
        case 'selection':
          response = '1';  // 选择第一个选项
          break;
        case 'clarification':
          response = '请基于现有信息继续执行，使用最佳实践';
          break;
        default:
          response = this.config.autoResponse;
      }
    }

    try {
      // 添加换行符发送
      child.stdin.write(response + '\n');
    } catch (error) {
      // stdin 可能已关闭，忽略错误
    }
  }

  /**
   * 智能选择最佳选项
   */
  private selectBestOption(options: ParsedOptions, contextType: string): string {
    const strategy = this.config.selectionStrategy;
    
    // 策略 1: 选择第一个选项
    if (strategy === 'first' && options.options.length > 0) {
      return options.options[0].key;
    }
    
    // 策略 2: 选择默认/推荐选项
    if (strategy === 'default' || strategy === 'smart') {
      const defaultOption = options.options.find(o => o.isDefault);
      if (defaultOption) {
        return defaultOption.key;
      }
    }
    
    // 策略 3: 智能分析选择
    if (strategy === 'smart') {
      // 根据问题内容和选项文本智能选择
      const smartChoice = this.analyzeAndChoose(options, contextType);
      if (smartChoice) {
        return smartChoice;
      }
    }
    
    // 策略 4: 继续/确认类型
    if (strategy === 'continue') {
      const continueKeywords = ['继续', '确认', '是', 'yes', 'ok', 'proceed', 'continue', '执行'];
      for (const option of options.options) {
        if (continueKeywords.some(kw => option.text.toLowerCase().includes(kw.toLowerCase()))) {
          return option.key;
        }
      }
    }
    
    // 默认返回第一个选项
    return options.options[0]?.key || '1';
  }

  /**
   * 分析问题内容智能选择
   */
  private analyzeAndChoose(options: ParsedOptions, contextType: string): string | null {
    const prompt = options.prompt.toLowerCase();
    
    // 关键字匹配表
    const keywordMap: Record<string, string[]> = {
      'continue': ['继续', '执行', '确认', 'proceed', 'continue', 'confirm', 'yes', '是', 'ok', '执行'],
      'skip': ['跳过', 'skip', '忽略', 'ignore', 'none', '无', '否', 'no'],
      'safe': ['安全', '保守', 'safe', 'conservative', '稳健'],
      'aggressive': ['激进', '完整', '全部', 'all', 'full', 'complete'],
      'auto': ['自动', 'auto', '智能', 'smart', '推荐', 'recommended', '默认', 'default'],
      'cancel': ['取消', 'cancel', '退出', 'exit', '放弃', 'abort'],
    };
    
    // 根据上下文类型优先匹配
    const priorityKeywords = contextType === 'confirmation' 
      ? ['continue', 'auto', 'safe']
      : ['auto', 'continue', 'safe'];
    
    for (const keywordType of priorityKeywords) {
      const keywords = keywordMap[keywordType];
      for (const option of options.options) {
        const text = option.text.toLowerCase();
        if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
          return option.key;
        }
      }
    }
    
    // 检测问题意图
    if (prompt.includes('如何') || prompt.includes('how') || prompt.includes('怎样')) {
      // 询问方式，选择推荐/默认选项
      const autoOption = options.options.find(o => 
        /推荐|默认|自动|recommended|default|auto/.test(o.text)
      );
      if (autoOption) return autoOption.key;
    }
    
    if (prompt.includes('确认') || prompt.includes('confirm') || prompt.includes('是否')) {
      // 确认问题，选择肯定选项
      const yesOption = options.options.find(o => 
        /是|yes|确认|confirm|ok|继续|continue/.test(o.text)
      );
      if (yesOption) return yesOption.key;
    }
    
    return null;
  }

  /**
   * 获取交互统计
   */
  getStats(): { 
    interactionCount: number; 
    lastResponseTime: number;
    recentOptions?: ParsedOptions;
  } {
    return {
      interactionCount: this.interactionCount,
      lastResponseTime: this.lastResponseTime,
      recentOptions: this.recentOptions || undefined,
    };
  }

  /**
   * 获取最近解析的选项
   */
  getRecentOptions(): ParsedOptions | null {
    return this.recentOptions;
  }

  /**
   * 销毁处理器
   */
  destroy(): void {
    this.isDestroyed = true;
  }
}

/**
 * 生成非交互式提示词前缀
 * 特别针对 k2.5 模型的 AskUserQuestion 交互进行优化
 */
export function generateNonInteractivePrompt(basePrompt: string): string {
  const prefix = `【重要指令】请按照以下规则执行任务：

1. **自主执行**：直接执行任务，不要询问澄清问题
2. **合理假设**：遇到不确定的情况，根据最佳实践做出合理假设并继续
3. **无需确认**：不要要求确认，直接执行操作
4. **默认选择**：遇到选择时，选择最合理的默认选项（通常是第一个选项或标记为"推荐"的选项）
5. **一次性完成**：尽量一次性完成任务，不要分多次询问
6. **结果导向**：专注于交付结果，而非过程确认
7. **错误处理**：如果遇到错误，尝试自动恢复或采用替代方案

**关于交互式选择的特别说明**：
- 不要向我展示选项列表让我选择
- 对于 Yes/No 问题，直接选择 Yes 并继续
- 对于多选项问题，自动选择最合理的选项（优先：推荐项 > 第一项 > 默认项）
- 对于"如何继续"的问题，选择能推进任务完成的选项
- 使用你的判断直接执行，不要等待我的输入

如果确实遇到无法自动处理的情况，请明确说明原因，然后选择最合理的默认行为继续。

---

`;

  return prefix + basePrompt;
}

/**
 * 生成 k2.5 专用非交互式系统提示词
 * 更强的约束，防止产生 AskUserQuestion
 */
export function generateK25NonInteractivePrompt(basePrompt: string): string {
  const prefix = `【系统指令 - 自动执行模式】

你是一个自动化执行助手。你的任务是直接执行用户请求，无需交互确认。

执行原则：
1. **禁止交互**：不要调用 AskUserQuestion 工具，不要展示选项列表
2. **自主决策**：所有选择自行决定，基于最佳实践选择最优方案
3. **直接执行**：收到指令后立即执行，不需要任何确认步骤
4. **默认行为**：
   - 确认类问题：选择"是/Yes/继续"
   - 选择类问题：选择第一项或标记为"推荐"的选项
   - 方式类问题：选择标准/推荐/自动的方式
   - 范围类问题：选择适度/平衡的范围

5. **执行策略**：
   - 优先选择最安全、最标准的做法
   - 当多个选项都可接受时，选择最简单的方案
   - 不要询问"你希望如何"，直接执行你认为最好的方案

6. **输出要求**：
   - 直接展示执行结果
   - 简要说明你的选择理由（一到两句话）
   - 继续下一步操作

任务指令：

`;

  return prefix + basePrompt;
}

/**
    * 检测可能的交互式输出（用于超时检测）
 */
export function isPotentialInteractiveOutput(text: string): boolean {
  // 检测是否有未完成的问题或提示
  const incompletePatterns = [
    /[?？]\s*$/,  // 以问号结尾
    /[:：]\s*$/,  // 以冒号结尾（可能是输入提示）
    />\s*$/,      // 以 > 结尾
    /waiting/i,
    /pending/i,
  ];

  return incompletePatterns.some(p => p.test(text.trim()));
}

export default {
  InteractionHandler,
  generateNonInteractivePrompt,
  generateK25NonInteractivePrompt,
  isPotentialInteractiveOutput,
  defaultInteractionConfig,
  INTERACTION_PATTERNS,
  STRUCTURED_QA_PATTERNS,
};
