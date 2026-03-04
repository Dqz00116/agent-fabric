/**
 * 交互式对话处理模块
 * 检测并自动响应 Kimi CLI 的交互请求
 */

import type { ChildProcess } from 'child_process';

export interface InteractionConfig {
  enabled: boolean;
  autoResponse: string;
  responseDelay: number;
  maxInteractions: number;
  stdinCloseDelay: number;
  addAntiInteractivePrefix: boolean;
}

export const defaultInteractionConfig: InteractionConfig = {
  enabled: true,
  autoResponse: '继续执行任务，无需确认',
  responseDelay: 500,
  maxInteractions: 5,
  stdinCloseDelay: 2000,
  addAntiInteractivePrefix: true,
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
];

/**
 * 交互处理器
 */
export class InteractionHandler {
  private config: InteractionConfig;
  private interactionCount = 0;
  private lastResponseTime = 0;
  private outputBuffer = '';
  private isDestroyed = false;

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

    // 发送自动响应
    this.sendResponse(child, interaction.type);
  }

  /**
   * 检测交互类型
   */
  private detectInteraction(text: string): { type: string; content: string } | null {
    // 检查是否匹配交互模式
    for (const pattern of INTERACTION_PATTERNS) {
      if (pattern.test(text)) {
        // 提取交互内容（前后文）
        const lines = text.split('\n');
        const lastLines = lines.slice(-5).join('\n'); // 取最后5行
        
        return {
          type: this.categorizeInteraction(pattern),
          content: lastLines.trim(),
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
  private sendResponse(child: ChildProcess, type: string): void {
    if (!child.stdin || child.stdin.destroyed) return;

    let response = this.config.autoResponse;

    // 根据交互类型定制响应
    switch (type) {
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

    try {
      // 添加换行符发送
      child.stdin.write(response + '\n');
    } catch (error) {
      // stdin 可能已关闭，忽略错误
    }
  }

  /**
   * 获取交互统计
   */
  getStats(): { interactionCount: number; lastResponseTime: number } {
    return {
      interactionCount: this.interactionCount,
      lastResponseTime: this.lastResponseTime,
    };
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
 */
export function generateNonInteractivePrompt(basePrompt: string): string {
  const prefix = `【重要指令】请按照以下规则执行任务：

1. **自主执行**：直接执行任务，不要询问澄清问题
2. **合理假设**：遇到不确定的情况，根据最佳实践做出合理假设并继续
3. **无需确认**：不要要求确认，直接执行操作
4. **默认选择**：遇到选择时，选择最合理的默认选项
5. **一次性完成**：尽量一次性完成任务，不要分多次询问
6. **结果导向**：专注于交付结果，而非过程确认
7. **错误处理**：如果遇到错误，尝试自动恢复或采用替代方案

如果确实遇到无法自动处理的情况，请明确说明原因，然后选择最合理的默认行为继续。

---

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
  isPotentialInteractiveOutput,
  defaultInteractionConfig,
  INTERACTION_PATTERNS,
};
