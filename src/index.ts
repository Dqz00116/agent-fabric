#!/usr/bin/env node

/**
 * AgentFabric - AI Agent 框架入口
 */

export const VERSION = '1.0.0';

export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
}

export class AgentFabric {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  public getConfig(): AgentConfig {
    return this.config;
  }

  public start(): void {
    // eslint-disable-next-line no-console
    console.log(`🚀 AgentFabric v${VERSION} started`);
    // eslint-disable-next-line no-console
    console.log(`📦 Agent: ${this.config.name} v${this.config.version}`);
  }
}

// CLI 入口
const isMainModule =
  import.meta.url.endsWith(process.argv[1] || '') ||
  import.meta.url === `file://${process.argv[1] || ''}` ||
  process.argv[1]?.endsWith('index.js');

if (isMainModule) {
  const fabric = new AgentFabric({
    name: 'agent-fabric',
    version: VERSION,
    description: 'AI Agent Framework',
  });

  fabric.start();
}
