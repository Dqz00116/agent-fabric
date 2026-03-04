/**
 * Core 模块导出
 * 编排器和相关组件
 *
 * @module core
 */

// Router
export {
  Router,
  createRouter,
  RoutingError,
  type RouteTarget,
  type RouteRequest,
  type RouteResult,
  type RouteErrorCode,
  type RoutingStrategy,
  type AgentSelectionContext,
} from './router.js';

// Orchestrator
export {
  Orchestrator,
  createOrchestrator,
  OrchestratorError,
  type OrchestratorRequest,
  type OrchestratorResult,
  type ExecutionMetadata,
  type ExecutionStatus,
  type OrchestratorErrorCode,
  type ExecutionContext,
  type OrchestratorConfig,
} from './orchestrator.js';
