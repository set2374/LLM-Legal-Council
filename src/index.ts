/**
 * LLM Legal Council
 * 
 * Multi-model deliberation system for legal analysis, critique, and risk assessment.
 * 
 * @example
 * ```typescript
 * import { LegalCouncilOrchestrator, loadCouncilConfig, createOpenRouterClient } from 'llm-legal-council';
 * 
 * const config = loadCouncilConfig();
 * const client = createOpenRouterClient(process.env.OPENROUTER_API_KEY!);
 * const orchestrator = new LegalCouncilOrchestrator(client, config);
 * 
 * const result = await orchestrator.deliberate({
 *   query: "Evaluate the strength of our breach of fiduciary duty claim",
 *   queryType: "risk-assessment",
 *   jurisdiction: "NY"
 * });
 * ```
 * 
 * @packageDocumentation
 */

// Core orchestrator
export { 
  LegalCouncilOrchestrator, 
  CouncilQuorumError,
  ProgressEvent,
  ProgressCallback 
} from './council/orchestrator.js';

// OpenRouter client
export { 
  createOpenRouterClient, 
  OpenRouterClient,
  OpenRouterError 
} from './council/openrouter.js';

// Configuration
export { 
  loadCouncilConfig, 
  validateConfig, 
  ConfigurationError,
  CouncilConfig,
  councilUseCases,
  isAppropriateForCouncil 
} from './config.js';

// Types
export type {
  CouncilQuery,
  CouncilQueryType,
  CouncilDeliberation,
  ConsensusResult,
  IdentifiedIssue,
  CalibratedRisk,
  RiskFactor,
  DissentingView,
  IdentifiedWeakness,
  ActionItem,
  DeliberationMetadata,
  Stage1Result,
  Stage2Result,
  Stage3Result,
  IndividualAnalysis,
  PeerReview,
  AggregateRanking,
  CouncilMember,
  CouncilAudit,
  ChairmanSelectionAudit,
  Stage1Audit,
  Stage2Audit,
  Stage3Audit,
  AuditAnomaly,
  AnomalyType,
  ProcessIntegrity
} from './types.js';

// Project system
export { 
  loadProject, 
  createProjectTemplate, 
  saveProject,
  ProjectError,
  LoadedProject 
} from './project.js';

// Usage tracking
export { 
  UsageTracker, 
  formatUsageSummary,
  UsageSummary,
  ModelUsage 
} from './usage.js';

// Skills
export {
  loadSkills,
  formatSkillsContext,
  getStageSystemPrompt,
  validateSkillsExist,
  LoadedSkills,
  Skill
} from './skills.js';

// Audit
export {
  AuditCollector,
  selectChairman,
  ChairmanSelectionResult
} from './council/audit.js';
