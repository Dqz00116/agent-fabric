/**
 * Adapters 模块统一导出
 *
 * @module adapters
 * @description Agent 适配器模块，提供多种协议适配器实现
 */

// 类型定义
export * from './types.js';

// 基础类
export { BaseAdapter, AdapterRegistry, adapterRegistry } from './base.js';

// HTTP 适配器
export { HttpAdapter } from './http-adapter.js';

// MCP 适配器
export { McpAdapter } from './mcp-adapter.js';
