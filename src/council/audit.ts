/**
 * Audit Trail Builder for LLM Legal Council
 * 
 * Collects metrics throughout deliberation and builds comprehensive audit trail.
 * Detects anomalies and assesses process integrity.
 */

import {
  Stage1Result,
  Stage2Result,
  Stage3Result,
  CouncilAudit,
  ChairmanSelectionAudit,
  Stage1Audit,
  Stage1ModelMetrics,
  Stage2Audit,
  Stage3Audit,
  AuditAnomaly,
  AnomalyType,
  ProcessIntegrity,
  IndividualAnalysis,
  AggregateRanking
} from '../types.js';

const MINIMUM_QUORUM = 2;

/** Metrics collected during Stage 1 execution */
export interface Stage1Metrics {
  modelId: string;
  label: string;
  startTime: number;
  endTime?: number;
  tokensUsed?: number;
  confidenceStated?: 'low' | 'medium' | 'high';
  thresholdIssuesIdentified?: number;
  citationsUsed?: number;
  adversarialArgumentProvided?: boolean;
  retries: number;
  success: boolean;
  error?: string;
}

/** Audit collector - accumulates data during deliberation */
export class AuditCollector {
  private sessionId: string;
  private startTime: number;
  private stage1Metrics: Map<string, Stage1Metrics> = new Map();
  private chairmanSelection?: ChairmanSelectionAudit;
  
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startTime = Date.now();
  }

  /** Record Stage 1 model start */
  recordStage1Start(modelId: string, label: string): void {
    this.stage1Metrics.set(modelId, {
      modelId,
      label,
      startTime: Date.now(),
      retries: 0,
      success: false
    });
  }

  /** Record Stage 1 model completion */
  recordStage1Complete(
    modelId: string, 
    analysis: IndividualAnalysis,
    tokensUsed?: number
  ): void {
    const metrics = this.stage1Metrics.get(modelId);
    if (metrics) {
      metrics.endTime = Date.now();
      metrics.tokensUsed = tokensUsed;
      metrics.confidenceStated = analysis.confidence;
      metrics.success = true;
      
      // Extract metrics from structured analysis if available
      const structured = analysis._structured as Record<string, unknown> | undefined;
      if (structured) {
        // Count threshold issues
        const thresholdIssues = structured.thresholdIssues as unknown[];
        metrics.thresholdIssuesIdentified = Array.isArray(thresholdIssues) 
          ? thresholdIssues.length 
          : 0;
        
        // Check for adversarial argument
        metrics.adversarialArgumentProvided = Boolean(structured.adversarialArgument);
        
        // Estimate citations (rough: count case-like patterns in content)
        metrics.citationsUsed = this.countCitations(analysis.content);
      }
    }
  }

  /** Record Stage 1 model failure */
  recordStage1Failure(modelId: string, error: string): void {
    const metrics = this.stage1Metrics.get(modelId);
    if (metrics) {
      metrics.endTime = Date.now();
      metrics.success = false;
      metrics.error = error;
    }
  }

  /** Record Stage 1 retry */
  recordStage1Retry(modelId: string): void {
    const metrics = this.stage1Metrics.get(modelId);
    if (metrics) {
      metrics.retries++;
    }
  }

  /** Record chairman selection */
  recordChairmanSelection(selection: ChairmanSelectionAudit): void {
    this.chairmanSelection = selection;
  }

  /** Build complete audit trail */
  buildAudit(
    stage1: Stage1Result,
    stage2: Stage2Result,
    stage3: Stage3Result,
    councilModels: string[]
  ): CouncilAudit {
    const timestamp = new Date().toISOString();
    const durationMs = Date.now() - this.startTime;

    // Build stage audits
    const stage1Audit = this.buildStage1Audit(stage1, councilModels);
    const stage2Audit = this.buildStage2Audit(stage1, stage2);
    const stage3Audit = this.buildStage3Audit(stage1, stage2, stage3);

    // Detect cross-stage anomalies
    const crossStageAnomalies = this.detectCrossStageAnomalies(
      stage1, stage2, stage3, stage1Audit, stage2Audit
    );

    // Calculate process integrity
    const processIntegrity = this.calculateProcessIntegrity(
      stage1Audit,
      stage2Audit,
      stage3Audit,
      crossStageAnomalies,
      councilModels.length
    );

    return {
      sessionId: this.sessionId,
      timestamp,
      durationMs,
      chairmanSelection: this.chairmanSelection!,
      stage1: stage1Audit,
      stage2: stage2Audit,
      stage3: stage3Audit,
      crossStageAnomalies,
      processIntegrity
    };
  }

  /** Build Stage 1 audit */
  private buildStage1Audit(stage1: Stage1Result, councilModels: string[]): Stage1Audit {
    const anomalies: AuditAnomaly[] = [];
    const perModelMetrics: Record<string, Stage1ModelMetrics> = {};

    const modelsQueried = councilModels;
    const modelsResponded: string[] = [];
    const modelsFailed: string[] = [];

    // Calculate average latency for outlier detection
    const latencies: number[] = [];
    
    for (const [modelId, metrics] of this.stage1Metrics) {
      if (metrics.success && metrics.endTime) {
        const latency = metrics.endTime - metrics.startTime;
        latencies.push(latency);
        modelsResponded.push(modelId);
        
        perModelMetrics[modelId] = {
          latencyMs: latency,
          tokensUsed: metrics.tokensUsed ?? 0,
          confidenceStated: metrics.confidenceStated ?? 'medium',
          thresholdIssuesIdentified: metrics.thresholdIssuesIdentified ?? 0,
          citationsUsed: metrics.citationsUsed ?? 0,
          adversarialArgumentProvided: metrics.adversarialArgumentProvided ?? false,
          retries: metrics.retries
        };
      } else {
        modelsFailed.push(modelId);
        
        anomalies.push({
          stage: 1,
          severity: 'warning',
          type: 'model-failure',
          description: `Model ${modelId} failed to respond: ${metrics.error || 'Unknown error'}`,
          affectedModels: [modelId],
          recommendation: 'Consider model availability or configuration'
        });
      }
    }

    // Detect latency outliers
    if (latencies.length >= 2) {
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      for (const [modelId, metrics] of this.stage1Metrics) {
        if (metrics.success && metrics.endTime) {
          const latency = metrics.endTime - metrics.startTime;
          if (latency > avgLatency * 2) {
            anomalies.push({
              stage: 1,
              severity: 'info',
              type: 'latency-outlier',
              description: `Model ${modelId} took ${latency}ms (avg: ${Math.round(avgLatency)}ms)`,
              affectedModels: [modelId]
            });
          }
        }
      }
    }

    // Detect excessive retries
    for (const [modelId, metrics] of this.stage1Metrics) {
      if (metrics.retries >= 2) {
        anomalies.push({
          stage: 1,
          severity: 'warning',
          type: 'retry-excessive',
          description: `Model ${modelId} required ${metrics.retries} retries`,
          affectedModels: [modelId],
          recommendation: 'Check model reliability or prompt compatibility'
        });
      }
    }

    // Check quorum risk
    if (modelsResponded.length === MINIMUM_QUORUM) {
      anomalies.push({
        stage: 1,
        severity: 'warning',
        type: 'quorum-risk',
        description: `Bare minimum quorum (${MINIMUM_QUORUM}) - deliberation quality may be reduced`,
        recommendation: 'Consider adding council members for more robust deliberation'
      });
    }

    return {
      modelsQueried,
      modelsResponded,
      modelsFailed,
      perModelMetrics,
      anomalies
    };
  }

  /** Build Stage 2 audit */
  private buildStage2Audit(stage1: Stage1Result, stage2: Stage2Result): Stage2Audit {
    const anomalies: AuditAnomaly[] = [];

    // Calculate ranking statistics per analysis
    const perAnalysisRankings: Record<string, {
      averageRank: number;
      rankVariance: number;
      highestRank: number;
      lowestRank: number;
    }> = {};

    for (const ranking of stage2.aggregateRankings) {
      const positions: number[] = [];
      for (const review of stage2.peerReviews) {
        const pos = review.ranking.indexOf(ranking.label);
        if (pos !== -1) {
          positions.push(pos + 1);
        }
      }

      if (positions.length > 0) {
        const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
        const variance = positions.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / positions.length;
        
        perAnalysisRankings[ranking.label] = {
          averageRank: avg,
          rankVariance: variance,
          highestRank: Math.min(...positions),
          lowestRank: Math.max(...positions)
        };
      }
    }

    // Build agreement matrix
    const agreementMatrix: Record<string, { agreedWith: string[]; disagreedWith: string[] }> = {};
    
    for (const review of stage2.peerReviews) {
      agreementMatrix[review.reviewerLabel] = { agreedWith: [], disagreedWith: [] };
      
      for (const otherReview of stage2.peerReviews) {
        if (review.reviewerLabel === otherReview.reviewerLabel) continue;
        
        // Check if top picks match
        if (review.ranking[0] === otherReview.ranking[0]) {
          agreementMatrix[review.reviewerLabel].agreedWith.push(otherReview.reviewerLabel);
        } else {
          agreementMatrix[review.reviewerLabel].disagreedWith.push(otherReview.reviewerLabel);
        }
      }
    }

    // Determine ranking consensus
    const topPicks = stage2.peerReviews.map(r => r.ranking[0]);
    const uniqueTopPicks = new Set(topPicks).size;
    let rankingConsensus: 'strong' | 'moderate' | 'weak' | 'none';
    
    if (uniqueTopPicks === 1) {
      rankingConsensus = 'strong';
    } else if (uniqueTopPicks <= Math.ceil(stage2.peerReviews.length / 2)) {
      rankingConsensus = 'moderate';
    } else if (uniqueTopPicks < stage2.peerReviews.length) {
      rankingConsensus = 'weak';
    } else {
      rankingConsensus = 'none';
    }

    // Detect outlier reviews
    const outlierReviews: Array<{ reviewerLabel: string; deviation: string }> = [];
    
    for (const review of stage2.peerReviews) {
      // Check if this reviewer's top pick differs significantly from aggregate
      const topPick = review.ranking[0];
      const aggregateRank = stage2.aggregateRankings.find(r => r.label === topPick);
      
      if (aggregateRank && aggregateRank.averageRank > stage1.analyses.length - 0.5) {
        outlierReviews.push({
          reviewerLabel: review.reviewerLabel,
          deviation: `Ranked ${topPick} first while aggregate ranked it last`
        });
        
        anomalies.push({
          stage: 2,
          severity: 'info',
          type: 'ranking-outlier',
          description: `Reviewer ${review.reviewerLabel} ranked analysis ${topPick} first, but aggregate ranked it last`,
          affectedModels: [review._reviewerModelId || review.reviewerLabel]
        });
      }
    }

    // Detect citation consensus (potential shared hallucination)
    const citationsAcrossAnalyses = this.extractCitationsPerAnalysis(stage1.analyses);
    const citationCounts = new Map<string, string[]>();
    
    for (const [label, citations] of Object.entries(citationsAcrossAnalyses)) {
      for (const citation of citations) {
        const normalized = citation.toLowerCase().trim();
        if (!citationCounts.has(normalized)) {
          citationCounts.set(normalized, []);
        }
        citationCounts.get(normalized)!.push(label);
      }
    }

    // Flag citations appearing in 3+ analyses
    for (const [citation, labels] of citationCounts) {
      if (labels.length >= 3) {
        anomalies.push({
          stage: 2,
          severity: 'warning',
          type: 'citation-consensus',
          description: `${labels.length} analyses cited "${citation}" - verify independently for shared hallucination`,
          affectedModels: labels,
          recommendation: 'Run independent citation verification on shared authority'
        });
      }
    }

    return {
      reviewsCompleted: stage2.peerReviews.length,
      rankingConsensus,
      agreementMatrix,
      perAnalysisRankings,
      outlierReviews,
      citationsAcrossAnalyses,
      anomalies
    };
  }

  /** Build Stage 3 audit */
  private buildStage3Audit(
    stage1: Stage1Result,
    stage2: Stage2Result,
    stage3: Stage3Result
  ): Stage3Audit {
    const anomalies: AuditAnomaly[] = [];
    const synthesis = stage3.synthesis;

    // Count dissent
    const dissentPreserved = synthesis.dissent.length;
    
    // Estimate suppressed dissent (analyses that disagreed but weren't preserved)
    const uniquePositions = new Set(stage1.analyses.map(a => {
      const structured = a._structured as Record<string, unknown> | undefined;
      return structured?.assessment as string || '';
    })).size;
    const dissentSuppressed = Math.max(0, uniquePositions - 1 - dissentPreserved);

    if (dissentSuppressed > 0) {
      anomalies.push({
        stage: 3,
        severity: 'warning',
        type: 'dissent-suppression',
        description: `${dissentSuppressed} potentially distinct position(s) not preserved in dissent`,
        recommendation: 'Review stage 1 analyses for suppressed minority views'
      });
    }

    // Check for synthesis divergence from rankings
    // If synthesis heavily relies on lowest-ranked analysis, flag it
    const sourceReliance: Record<string, number> = {};
    for (const analysis of stage1.analyses) {
      sourceReliance[analysis.label] = 0;
    }

    // Estimate source reliance from synthesis content (simplified)
    const synthesisText = JSON.stringify(synthesis).toLowerCase();
    for (const analysis of stage1.analyses) {
      const analysisText = analysis.content.toLowerCase();
      // Count key phrase overlap (simplified metric)
      const keyPhrases = analysisText.split(/[.!?]/).slice(0, 3);
      for (const phrase of keyPhrases) {
        if (phrase.length > 20 && synthesisText.includes(phrase.substring(0, 30))) {
          sourceReliance[analysis.label]++;
        }
      }
    }

    // Check for single-source dominance
    const relianceValues = Object.values(sourceReliance);
    const totalReliance = relianceValues.reduce((a, b) => a + b, 0);
    if (totalReliance > 0) {
      const maxReliance = Math.max(...relianceValues);
      const dominantLabel = Object.entries(sourceReliance).find(([, v]) => v === maxReliance)?.[0];
      
      if (maxReliance / totalReliance > 0.7) {
        anomalies.push({
          stage: 3,
          severity: 'warning',
          type: 'single-source-dominance',
          description: `Synthesis appears to rely heavily on analysis ${dominantLabel}`,
          recommendation: 'Verify synthesis incorporates diverse council perspectives'
        });
      }
    }

    // Check for synthesis divergence from peer rankings
    const topRanked = stage2.aggregateRankings[0]?.label;
    if (topRanked && sourceReliance[topRanked] === 0 && totalReliance > 0) {
      const dominantLabel = Object.entries(sourceReliance)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      
      if (dominantLabel) {
        const dominantRanking = stage2.aggregateRankings.find(r => r.label === dominantLabel);
        if (dominantRanking && dominantRanking.averageRank > stage1.analyses.length / 2) {
          anomalies.push({
            stage: 3,
            severity: 'critical',
            type: 'synthesis-divergence',
            description: `Synthesis relies on analysis ${dominantLabel} (low-ranked) while ignoring ${topRanked} (top-ranked)`,
            recommendation: 'Review chairman synthesis for bias or error'
          });
        }
      }
    }

    return {
      chairmanModel: stage3.chairmanModel,
      consensusReached: synthesis.consensus.reached,
      dissentPreserved,
      dissentSuppressed,
      riskCalibration: {
        catastrophizingDetected: synthesis.risk.catastrophizingDetected,
        understatingDetected: synthesis.risk.understatingDetected,
        calibrationAction: synthesis.risk.calibrationNotes || 'None noted'
      },
      citationsInSynthesis: this.countCitations(JSON.stringify(synthesis)),
      sourceReliance,
      anomalies
    };
  }

  /** Detect cross-stage anomalies */
  private detectCrossStageAnomalies(
    stage1: Stage1Result,
    stage2: Stage2Result,
    stage3: Stage3Result,
    stage1Audit: Stage1Audit,
    stage2Audit: Stage2Audit
  ): AuditAnomaly[] {
    const anomalies: AuditAnomaly[] = [];

    // Confidence mismatch: model stated high confidence but ranked last
    for (const analysis of stage1.analyses) {
      if (analysis.confidence === 'high') {
        const ranking = stage2.aggregateRankings.find(r => r.label === analysis.label);
        if (ranking && ranking.averageRank >= stage1.analyses.length - 0.5) {
          anomalies.push({
            stage: 'cross-stage',
            severity: 'warning',
            type: 'confidence-mismatch',
            description: `Analysis ${analysis.label} stated "high" confidence but was ranked last by peers`,
            affectedModels: [analysis._modelId || analysis.label],
            recommendation: 'Review analysis for overconfidence or peer misunderstanding'
          });
        }
      }
    }

    // Threshold gap: analysis missed threshold issue that others caught
    const thresholdCounts = new Map<string, string[]>();
    
    for (const analysis of stage1.analyses) {
      const structured = analysis._structured as Record<string, unknown> | undefined;
      const issues = structured?.thresholdIssues as Array<{ issue: string }> | undefined;
      
      if (Array.isArray(issues)) {
        for (const issue of issues) {
          const normalized = issue.issue?.toLowerCase() || '';
          if (!thresholdCounts.has(normalized)) {
            thresholdCounts.set(normalized, []);
          }
          thresholdCounts.get(normalized)!.push(analysis.label);
        }
      }
    }

    // Find threshold issues identified by majority but missed by some
    const majority = Math.ceil(stage1.analyses.length / 2);
    for (const [issue, identifiers] of thresholdCounts) {
      if (identifiers.length >= majority) {
        const missers = stage1.analyses
          .filter(a => !identifiers.includes(a.label))
          .map(a => a.label);
        
        if (missers.length > 0) {
          anomalies.push({
            stage: 'cross-stage',
            severity: 'warning',
            type: 'threshold-gap',
            description: `Threshold issue "${issue}" identified by ${identifiers.length} analyses but missed by ${missers.join(', ')}`,
            affectedModels: missers,
            recommendation: 'Review missed threshold issue for potential blind spot'
          });
        }
      }
    }

    return anomalies;
  }

  /** Calculate overall process integrity */
  private calculateProcessIntegrity(
    stage1Audit: Stage1Audit,
    stage2Audit: Stage2Audit,
    stage3Audit: Stage3Audit,
    crossStageAnomalies: AuditAnomaly[],
    totalModels: number
  ): ProcessIntegrity {
    const flags: string[] = [];
    const recommendations: string[] = [];
    let score: 'high' | 'medium' | 'low' = 'high';

    // Collect all anomalies
    const allAnomalies = [
      ...stage1Audit.anomalies,
      ...stage2Audit.anomalies,
      ...stage3Audit.anomalies,
      ...crossStageAnomalies
    ];

    // Count by severity
    const criticalCount = allAnomalies.filter(a => a.severity === 'critical').length;
    const warningCount = allAnomalies.filter(a => a.severity === 'warning').length;

    // Critical anomalies → low integrity
    if (criticalCount > 0) {
      score = 'low';
      flags.push(`${criticalCount} critical anomal${criticalCount > 1 ? 'ies' : 'y'} detected`);
      recommendations.push('Review critical anomalies before relying on synthesis');
    }

    // Multiple warnings → medium integrity
    if (warningCount >= 3 && score !== 'low') {
      score = 'medium';
      flags.push(`${warningCount} warnings detected`);
    }

    // Quorum concerns
    if (stage1Audit.modelsResponded.length === MINIMUM_QUORUM) {
      flags.push('Bare minimum quorum achieved');
      if (score === 'high') score = 'medium';
    }

    // Model failures
    if (stage1Audit.modelsFailed.length > 0) {
      flags.push(`${stage1Audit.modelsFailed.length} model(s) failed to respond`);
    }

    // Ranking consensus
    if (stage2Audit.rankingConsensus === 'none') {
      flags.push('No ranking consensus among reviewers');
      recommendations.push('Council disagreed significantly - review individual analyses');
      if (score === 'high') score = 'medium';
    }

    // Citation consensus (shared hallucination risk)
    const citationAnomalies = allAnomalies.filter(a => a.type === 'citation-consensus');
    if (citationAnomalies.length > 0) {
      flags.push(`${citationAnomalies.length} potential shared citation(s) - verify independently`);
      recommendations.push('Run independent citation check on shared authorities');
    }

    // Dissent suppression
    if (stage3Audit.dissentSuppressed > 0) {
      flags.push(`${stage3Audit.dissentSuppressed} dissenting view(s) may not be preserved`);
      recommendations.push('Review stage 1 analyses for important minority positions');
    }

    return { score, flags, recommendations };
  }

  /** Extract citations from analysis text (rough pattern matching) */
  private extractCitationsPerAnalysis(
    analyses: IndividualAnalysis[]
  ): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    
    for (const analysis of analyses) {
      result[analysis.label] = this.extractCitations(analysis.content);
    }
    
    return result;
  }

  /** Extract citation-like patterns from text */
  private extractCitations(text: string): string[] {
    const citations: string[] = [];
    
    // Pattern: "Name v. Name" or "Matter of Name"
    const casePattern = /(?:Matter of |In re )?[A-Z][a-zA-Z']+ v\. [A-Z][a-zA-Z']+/g;
    const matterPattern = /Matter of [A-Z][a-zA-Z']+/g;
    
    const caseMatches = text.match(casePattern) || [];
    const matterMatches = text.match(matterPattern) || [];
    
    citations.push(...caseMatches, ...matterMatches);
    
    // Pattern: Reporter citations like "123 N.Y.2d 456"
    const reporterPattern = /\d{1,3}\s+(?:N\.Y\.\d*d?|A\.D\.\d*d?|F\.\d*d?|S\.Ct\.|U\.S\.)\s+\d+/g;
    const reporterMatches = text.match(reporterPattern) || [];
    citations.push(...reporterMatches);
    
    return [...new Set(citations)];
  }

  /** Count citations in text */
  private countCitations(text: string): number {
    return this.extractCitations(text).length;
  }
}

/**
 * Chairman Selection Logic
 */
export interface ChairmanSelectionResult {
  model: string;
  method: 'user-specified' | 'algorithmic' | 'fallback';
  rationale: string;
  alternativesConsidered?: Array<{ model: string; averageRank: number }>;
}

export function selectChairman(
  stage1: Stage1Result,
  stage2: Stage2Result,
  userOverride?: string
): ChairmanSelectionResult {
  // User override takes precedence
  if (userOverride) {
    const participated = stage1.analyses.some(a => a._modelId === userOverride);
    if (participated) {
      return {
        model: userOverride,
        method: 'user-specified',
        rationale: 'User specified chairman'
      };
    }
    // User specified model didn't participate - log and fall through
    console.warn(`User-specified chairman ${userOverride} did not participate in Stage 1`);
  }

  // Algorithmic: highest-ranked analysis author becomes chairman
  const rankings = stage2.aggregateRankings;
  
  if (rankings.length > 0) {
    // Rankings are already sorted by averageRank (ascending)
    const topRanked = rankings[0];
    const topAnalysis = stage1.analyses.find(a => a.label === topRanked.label);
    
    if (topAnalysis && topAnalysis._modelId) {
      // Build alternatives list
      const alternativesConsidered = rankings.slice(0, Math.min(3, rankings.length)).map(r => {
        const analysis = stage1.analyses.find(a => a.label === r.label);
        return {
          model: analysis?._modelId || r.label,
          averageRank: r.averageRank
        };
      });

      return {
        model: topAnalysis._modelId,
        method: 'algorithmic',
        rationale: `Highest peer-ranked analysis (avg rank ${topRanked.averageRank.toFixed(2)})`,
        alternativesConsidered
      };
    }
  }

  // Fallback: first responding model
  const firstResponder = stage1.analyses[0];
  return {
    model: firstResponder?._modelId || 'unknown',
    method: 'fallback',
    rationale: 'Fallback to first responding model (ranking data unavailable)'
  };
}
