/**
 * Type Definitions for LLM Legal Council
 * 
 * Output structures designed for integration with attorney agent workflow.
 * The council produces structured critique; the agent addresses it.
 */

// ============================================================================
// Council Query Types
// ============================================================================

export interface CouncilQuery {
  /** The legal issue or work product to deliberate on */
  query: string;
  
  /** Type of deliberation requested */
  queryType: CouncilQueryType;
  
  /** Jurisdiction context */
  jurisdiction?: string;
  
  /** Practice area context */
  practiceArea?: string;
  
  /** Additional context (case facts, procedural posture, etc.) */
  context?: Record<string, unknown>;
  
  /** Work product being reviewed (for critique tasks) */
  workProduct?: string;
}

export type CouncilQueryType = 
  | 'issue-spotting'
  | 'risk-assessment'
  | 'weakness-identification'
  | 'strategy-evaluation'
  | 'stress-test'
  | 'devils-advocate'
  | 'settlement-evaluation'
  | 'brainstorm'
  | 'general-deliberation';

// ============================================================================
// Stage Results
// ============================================================================

export interface Stage1Result {
  /** Individual analyses from each council member */
  analyses: IndividualAnalysis[];
  
  /** Whether all expected council members responded */
  complete: boolean;
  
  /** Any errors encountered */
  errors: StageError[];
}

export interface IndividualAnalysis {
  /** Anonymized identifier (A, B, C, etc.) - NOT the model name */
  label: string;
  
  /** The analysis content (JSON stringified for display) */
  content: string;
  
  /** Self-reported confidence */
  confidence: 'low' | 'medium' | 'high';
  
  /** Key points extracted */
  keyPoints: string[];
  
  /** Internal tracking only - not exposed in peer review */
  _modelId?: string;
  
  /** Structured analysis object (from JSON mode) - internal only */
  _structured?: unknown;
}

export interface Stage2Result {
  /** Peer reviews from each council member */
  peerReviews: PeerReview[];
  
  /** Aggregate rankings across all reviewers */
  aggregateRankings: AggregateRanking[];
  
  /** Whether all expected reviews completed */
  complete: boolean;
  
  /** Any errors encountered */
  errors: StageError[];
}

export interface PeerReview {
  /** Which reviewer (anonymized) */
  reviewerLabel: string;
  
  /** Scores for each analysis */
  evaluations: Record<string, AnalysisEvaluation>;
  
  /** Final ranking (ordered list of analysis labels) */
  ranking: string[];
  
  /** Explanation for the ranking order */
  rankingRationale: string;
  
  /** Internal tracking only */
  _reviewerModelId?: string;
}

export interface AnalysisEvaluation {
  legalAccuracy: number;      // 1-5
  issueIdentification: number; // 1-5
  riskCalibration: number;    // 1-5
  practicalUtility: number;   // 1-5
  comment?: string;
}

export interface AggregateRanking {
  /** Analysis label (A, B, C, etc.) */
  label: string;
  
  /** Average rank position (lower is better) */
  averageRank: number;
  
  /** How consistent were rankings across reviewers */
  rankingConsistency: number;  // 0-1
}

export interface Stage3Result {
  /** The synthesized deliberation output */
  synthesis: Stage3Synthesis;
  
  /** Which model served as chairman */
  chairmanModel: string;
  
  /** Whether synthesis completed successfully */
  complete: boolean;
  
  /** Any errors encountered */
  errors: StageError[];
}

export interface StageError {
  stage: 1 | 2 | 3;
  modelId?: string;
  message: string;
  recoverable: boolean;
}

// ============================================================================
// Stage 3 Synthesis (matches Zod schema)
// ============================================================================

export interface Stage3Synthesis {
  consensus: {
    reached: boolean;
    position: string;
    confidence: number;
    agreementCount: number;
    totalMembers: number;
  };
  
  issues: IdentifiedIssue[];
  
  risk: CalibratedRisk;
  
  dissent: DissentingView[];
  
  weaknesses: IdentifiedWeakness[];
  
  openQuestions: string[];
  
  actionItems: ActionItem[];
}

// ============================================================================
// Final Output Structure (for Attorney Agent Consumption)
// ============================================================================

export interface CouncilDeliberation {
  /** Echo of the original query */
  query: string;
  queryType: CouncilQueryType;
  
  /** Session tracking */
  sessionId: string;
  timestamp: string;
  
  /** Consensus assessment */
  consensus: ConsensusResult;
  
  /** Issues identified during deliberation */
  issuesIdentified: IdentifiedIssue[];
  
  /** Risk assessment (calibrated across models) */
  riskAssessment: CalibratedRisk;
  
  /** Dissenting views (preserved, not flattened) */
  dissent: DissentingView[];
  
  /** Weaknesses found (for work product review) */
  weaknessesFound: IdentifiedWeakness[];
  
  /** Open questions requiring more information */
  openQuestions: string[];
  
  /** Action items for attorney to address */
  actionItems: ActionItem[];
  
  /** Raw stage results for audit/debugging */
  _stageResults?: {
    stage1: Stage1Result;
    stage2: Stage2Result;
    stage3: Stage3Result;
  };
  
  /** Detailed usage breakdown */
  _usage?: import('./usage.js').UsageSummary;
  
  /** Process audit trail */
  _audit?: CouncilAudit;
  
  /** Metadata */
  metadata: DeliberationMetadata;
}

export interface ConsensusResult {
  /** Whether meaningful consensus was reached */
  reached: boolean;
  
  /** The consensus position (if reached) */
  position: string;
  
  /** Confidence in the consensus (0-1) */
  confidence: number;
  
  /** How many council members agreed */
  agreementCount: number;
  
  /** Total council members */
  totalMembers: number;
}

export interface IdentifiedIssue {
  /** Description of the issue */
  issue: string;
  
  /** How severe is this issue */
  severity: 'critical' | 'significant' | 'minor';
  
  /** How many council members flagged this */
  flaggedByCount: number;
  
  /** Was this unanimously identified */
  unanimous: boolean;
  
  /** Brief explanation of why this matters */
  explanation?: string;
}

export interface CalibratedRisk {
  /** Overall risk level (calibrated across models) */
  overallLevel: 'low' | 'medium' | 'high';
  
  /** Specific risk factors identified */
  factors: RiskFactor[];
  
  /** Did any model appear to catastrophize? */
  catastrophizingDetected: boolean;
  
  /** Did any model appear to understate risk? */
  understatingDetected: boolean;
  
  /** Calibration notes */
  calibrationNotes: string;
}

export interface RiskFactor {
  /** Description of the risk */
  risk: string;
  
  /** Likelihood assessment */
  likelihood: 'unlikely' | 'possible' | 'likely';
  
  /** Potential impact if realized */
  impact: 'low' | 'medium' | 'high';
  
  /** Was this risk assessment agreed upon */
  councilAgreement: 'unanimous' | 'majority' | 'split';
}

export interface DissentingView {
  /** The dissenting position */
  position: string;
  
  /** Reasoning for the dissent */
  reasoning: string;
  
  /** How many council members held this view */
  supportedByCount: number;
  
  /** Should this be given weight despite being minority view */
  noteworthy: boolean;
}

export interface IdentifiedWeakness {
  /** Description of the weakness */
  weakness: string;
  
  /** Where in the work product this appears */
  location?: string;
  
  /** How exploitable is this weakness */
  exploitability: 'easily attacked' | 'vulnerable' | 'minor concern';
  
  /** Suggested remediation */
  suggestedFix?: string;
}

export interface ActionItem {
  /** What needs to be done */
  item: string;
  
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  
  /** Why this matters */
  rationale: string;
  
  /** Is this blocking (must address before proceeding) */
  blocking: boolean;
}

export interface DeliberationMetadata {
  /** Total deliberation time in ms */
  durationMs: number;
  
  /** Models that participated */
  participatingModels: string[];
  
  /** Chairman model */
  chairmanModel: string;
  
  /** Estimated token usage */
  estimatedTokens: number;
  
  /** Estimated cost */
  estimatedCostUsd: number;
  
  /** Number of debate rounds */
  debateRounds: number;
}

// ============================================================================
// Council Member Types
// ============================================================================

export interface CouncilMember {
  /** Model identifier (e.g., 'anthropic/claude-sonnet-4-20250514') */
  modelId: string;
  
  /** Anonymized label for this session (A, B, C, etc.) */
  sessionLabel?: string;
  
  /** Role in the council */
  role: 'member' | 'chairman';
}

// ============================================================================
// Database Types (for D1 storage)
// ============================================================================

export interface CouncilSession {
  id: string;
  query: string;
  query_type: CouncilQueryType;
  jurisdiction?: string;
  practice_area?: string;
  context?: string;  // JSON
  status: 'pending' | 'stage1' | 'stage2' | 'stage3' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  result?: string;  // JSON of CouncilDeliberation
}

export interface AnalysisRecord {
  id: string;
  session_id: string;
  stage: 1 | 2 | 3;
  model_id: string;
  label: string;
  content: string;
  created_at: string;
}

// ============================================================================
// Audit Trail Types
// ============================================================================

export interface CouncilAudit {
  /** Session identification */
  sessionId: string;
  timestamp: string;
  durationMs: number;
  
  /** Chairman selection audit */
  chairmanSelection: ChairmanSelectionAudit;
  
  /** Stage 1 audit */
  stage1: Stage1Audit;
  
  /** Stage 2 audit */
  stage2: Stage2Audit;
  
  /** Stage 3 audit */
  stage3: Stage3Audit;
  
  /** Cross-stage anomaly detection */
  crossStageAnomalies: AuditAnomaly[];
  
  /** Overall process integrity assessment */
  processIntegrity: ProcessIntegrity;
}

export interface ChairmanSelectionAudit {
  /** How chairman was selected */
  method: 'user-specified' | 'algorithmic' | 'fallback';
  
  /** Selected model */
  selectedModel: string;
  
  /** Explanation for selection */
  rationale: string;
  
  /** Other models considered (for algorithmic selection) */
  alternativesConsidered?: Array<{
    model: string;
    averageRank: number;
  }>;
}

export interface Stage1Audit {
  /** Models that were queried */
  modelsQueried: string[];
  
  /** Models that responded successfully */
  modelsResponded: string[];
  
  /** Models that failed */
  modelsFailed: string[];
  
  /** Per-model metrics */
  perModelMetrics: Record<string, Stage1ModelMetrics>;
  
  /** Stage-specific anomalies */
  anomalies: AuditAnomaly[];
}

export interface Stage1ModelMetrics {
  /** Response latency */
  latencyMs: number;
  
  /** Tokens consumed */
  tokensUsed: number;
  
  /** Self-reported confidence */
  confidenceStated: 'low' | 'medium' | 'high';
  
  /** Number of threshold issues identified */
  thresholdIssuesIdentified: number;
  
  /** Number of citations used */
  citationsUsed: number;
  
  /** Whether adversarial argument was provided */
  adversarialArgumentProvided: boolean;
  
  /** Number of retries required */
  retries: number;
}

export interface Stage2Audit {
  /** Number of reviews completed */
  reviewsCompleted: number;
  
  /** Degree of ranking consensus */
  rankingConsensus: 'strong' | 'moderate' | 'weak' | 'none';
  
  /** Agreement matrix showing which reviewers agreed */
  agreementMatrix: Record<string, {
    agreedWith: string[];
    disagreedWith: string[];
  }>;
  
  /** Per-analysis ranking statistics */
  perAnalysisRankings: Record<string, {
    averageRank: number;
    rankVariance: number;
    highestRank: number;
    lowestRank: number;
  }>;
  
  /** Reviews that deviated significantly from others */
  outlierReviews: Array<{
    reviewerLabel: string;
    deviation: string;
  }>;
  
  /** Citations used across analyses (for shared hallucination detection) */
  citationsAcrossAnalyses?: Record<string, string[]>;
  
  /** Stage-specific anomalies */
  anomalies: AuditAnomaly[];
}

export interface Stage3Audit {
  /** Chairman model used */
  chairmanModel: string;
  
  /** Whether consensus was reached */
  consensusReached: boolean;
  
  /** Number of dissenting views preserved in output */
  dissentPreserved: number;
  
  /** Number of dissenting views not included in output */
  dissentSuppressed: number;
  
  /** Risk calibration assessment */
  riskCalibration: {
    catastrophizingDetected: boolean;
    understatingDetected: boolean;
    calibrationAction: string;
  };
  
  /** Number of citations in final synthesis */
  citationsInSynthesis: number;
  
  /** Which analysis labels were most heavily relied upon */
  sourceReliance: Record<string, number>;
  
  /** Stage-specific anomalies */
  anomalies: AuditAnomaly[];
}

export interface AuditAnomaly {
  /** Which stage detected this */
  stage: 1 | 2 | 3 | 'cross-stage';
  
  /** Severity level */
  severity: 'critical' | 'warning' | 'info';
  
  /** Type of anomaly */
  type: AnomalyType;
  
  /** Human-readable description */
  description: string;
  
  /** Models involved (if applicable) */
  affectedModels?: string[];
  
  /** Recommended action */
  recommendation?: string;
}

export type AnomalyType = 
  | 'confidence-mismatch'      // Model's confidence didn't match peer assessment
  | 'citation-consensus'       // Multiple models cited same case (potential shared hallucination)
  | 'threshold-gap'            // Model missed threshold issue others caught
  | 'ranking-outlier'          // One reviewer ranked dramatically different
  | 'synthesis-divergence'     // Chairman's synthesis contradicts peer rankings
  | 'latency-outlier'          // One model took dramatically longer
  | 'retry-excessive'          // Model required multiple retries
  | 'dissent-suppression'      // Noteworthy dissent not preserved in synthesis
  | 'quorum-risk'              // Barely met quorum
  | 'single-source-dominance'  // Synthesis relies heavily on one analysis
  | 'model-failure';           // Model failed to respond

export interface ProcessIntegrity {
  /** Overall integrity score */
  score: 'high' | 'medium' | 'low';
  
  /** Flags raised during assessment */
  flags: string[];
  
  /** Recommendations for user */
  recommendations: string[];
}
