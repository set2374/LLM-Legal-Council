/**
 * Deliberation to Podcast Converter
 *
 * Converts LLM Legal Council deliberation results into content
 * suitable for NotebookLM podcast generation.
 */

import {
  CouncilDeliberation,
  IdentifiedIssue,
  CalibratedRisk,
  DissentingView,
  ActionItem,
} from '../types.js';
import {
  GeneratePodcastRequest,
  DeliberationToPodcastOptions,
  NotebookLMContentTooLargeError,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_TOKENS = 100000;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKENS * ESTIMATED_CHARS_PER_TOKEN;

// ============================================================================
// Main Converter
// ============================================================================

/**
 * Convert a council deliberation into a podcast generation request
 */
export function deliberationToPodcastRequest(
  deliberation: CouncilDeliberation,
  options: DeliberationToPodcastOptions = {}
): GeneratePodcastRequest {
  const content = formatDeliberationContent(deliberation, options);

  // Estimate token count
  const estimatedTokens = Math.ceil(content.length / ESTIMATED_CHARS_PER_TOKEN);
  if (estimatedTokens > MAX_TOKENS) {
    throw new NotebookLMContentTooLargeError(estimatedTokens, MAX_TOKENS);
  }

  // Generate title
  const title = options.title || generateTitle(deliberation);

  // Generate description
  const description = options.description || generateDescription(deliberation);

  // Generate focus prompt
  const focus = options.focus || generateFocusPrompt(deliberation);

  return {
    podcastConfig: {
      focus,
      length: options.length || 'STANDARD',
      languageCode: options.languageCode || 'en-US',
    },
    contexts: [{ text: content }],
    title,
    description,
  };
}

/**
 * Format deliberation content for podcast generation
 */
export function formatDeliberationContent(
  deliberation: CouncilDeliberation,
  options: DeliberationToPodcastOptions = {}
): string {
  const sections: string[] = [];

  // Header
  sections.push(formatHeader(deliberation));

  // Original Query
  sections.push(formatQuery(deliberation));

  // Consensus
  sections.push(formatConsensus(deliberation));

  // Issues Identified
  if (deliberation.issuesIdentified.length > 0) {
    sections.push(formatIssues(deliberation.issuesIdentified));
  }

  // Risk Assessment
  if (options.includeRiskDetails !== false) {
    sections.push(formatRiskAssessment(deliberation.riskAssessment));
  }

  // Dissenting Views
  if (options.includeDissent !== false && deliberation.dissent.length > 0) {
    sections.push(formatDissent(deliberation.dissent));
  }

  // Weaknesses
  if (deliberation.weaknessesFound.length > 0) {
    sections.push(formatWeaknesses(deliberation));
  }

  // Open Questions
  if (deliberation.openQuestions.length > 0) {
    sections.push(formatOpenQuestions(deliberation.openQuestions));
  }

  // Action Items
  if (options.includeActionItems !== false && deliberation.actionItems.length > 0) {
    sections.push(formatActionItems(deliberation.actionItems));
  }

  // Audit Summary (optional)
  if (options.includeAudit && deliberation._audit) {
    sections.push(formatAuditSummary(deliberation));
  }

  // Footer
  sections.push(formatFooter(deliberation));

  return sections.join('\n\n');
}

// ============================================================================
// Section Formatters
// ============================================================================

function formatHeader(deliberation: CouncilDeliberation): string {
  const queryTypeDisplay = deliberation.queryType
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `
# Legal Council Deliberation Summary

**Session ID:** ${deliberation.sessionId}
**Date:** ${new Date(deliberation.timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}
**Type:** ${queryTypeDisplay}
**Council Members:** ${deliberation.metadata.participatingModels.length} models participated
**Chairman:** ${deliberation.metadata.chairmanModel}
`.trim();
}

function formatQuery(deliberation: CouncilDeliberation): string {
  return `
## Legal Question Under Deliberation

${deliberation.query}
`.trim();
}

function formatConsensus(deliberation: CouncilDeliberation): string {
  const { consensus } = deliberation;
  const confidencePercent = Math.round(consensus.confidence * 100);

  let statusLine: string;
  if (consensus.reached) {
    statusLine = `The council reached consensus with ${confidencePercent}% confidence. ${consensus.agreementCount} out of ${consensus.totalMembers} council members agreed on this position.`;
  } else {
    statusLine = `The council did not reach full consensus. Only ${consensus.agreementCount} out of ${consensus.totalMembers} members agreed. The dissenting views are preserved below for your consideration.`;
  }

  return `
## Council Consensus

${statusLine}

### Position

${consensus.position}
`.trim();
}

function formatIssues(issues: IdentifiedIssue[]): string {
  // Group by severity
  const critical = issues.filter((i) => i.severity === 'critical');
  const significant = issues.filter((i) => i.severity === 'significant');
  const minor = issues.filter((i) => i.severity === 'minor');

  const sections: string[] = ['## Issues Identified'];

  if (critical.length > 0) {
    sections.push('### Critical Issues');
    sections.push(
      critical
        .map((issue) => {
          const unanimous = issue.unanimous ? ' (Unanimous)' : ` (Flagged by ${issue.flaggedByCount} members)`;
          return `- **${issue.issue}**${unanimous}${issue.explanation ? `\n  ${issue.explanation}` : ''}`;
        })
        .join('\n\n')
    );
  }

  if (significant.length > 0) {
    sections.push('### Significant Issues');
    sections.push(
      significant
        .map((issue) => {
          const unanimous = issue.unanimous ? ' (Unanimous)' : ` (Flagged by ${issue.flaggedByCount} members)`;
          return `- ${issue.issue}${unanimous}`;
        })
        .join('\n')
    );
  }

  if (minor.length > 0) {
    sections.push('### Minor Issues');
    sections.push(minor.map((issue) => `- ${issue.issue}`).join('\n'));
  }

  return sections.join('\n\n');
}

function formatRiskAssessment(risk: CalibratedRisk): string {
  const sections: string[] = [
    '## Risk Assessment',
    `**Overall Risk Level:** ${risk.overallLevel.toUpperCase()}`,
  ];

  if (risk.calibrationNotes) {
    sections.push(`**Calibration Notes:** ${risk.calibrationNotes}`);
  }

  if (risk.catastrophizingDetected) {
    sections.push(
      '> **Note:** Some council members may have overstated risks. The assessment above has been calibrated to account for this.'
    );
  }

  if (risk.understatingDetected) {
    sections.push(
      '> **Note:** Some council members may have understated risks. Exercise additional caution.'
    );
  }

  if (risk.factors.length > 0) {
    sections.push('### Risk Factors');
    sections.push(
      risk.factors
        .map((factor) => {
          const agreement =
            factor.councilAgreement === 'unanimous'
              ? 'All members agree'
              : factor.councilAgreement === 'majority'
                ? 'Majority view'
                : 'Split opinion';
          return `- **${factor.risk}**
  - Likelihood: ${factor.likelihood}
  - Impact: ${factor.impact}
  - ${agreement}`;
        })
        .join('\n\n')
    );
  }

  return sections.join('\n\n');
}

function formatDissent(dissent: DissentingView[]): string {
  const noteworthy = dissent.filter((d) => d.noteworthy);
  const other = dissent.filter((d) => !d.noteworthy);

  const sections: string[] = [
    '## Dissenting Views',
    'The following alternative perspectives were raised by council members. While not representing the consensus view, they may warrant consideration.',
  ];

  if (noteworthy.length > 0) {
    sections.push('### Noteworthy Dissents');
    sections.push(
      noteworthy
        .map(
          (d) =>
            `**Position:** ${d.position}\n\n**Reasoning:** ${d.reasoning}\n\n*Supported by ${d.supportedByCount} council member(s)*`
        )
        .join('\n\n---\n\n')
    );
  }

  if (other.length > 0) {
    sections.push('### Other Minority Views');
    sections.push(
      other.map((d) => `- ${d.position}${d.reasoning ? `: ${d.reasoning}` : ''}`).join('\n')
    );
  }

  return sections.join('\n\n');
}

function formatWeaknesses(deliberation: CouncilDeliberation): string {
  const sections: string[] = [
    '## Weaknesses Identified',
    'The following weaknesses were identified in the work product or position under review:',
  ];

  const byExploitability = {
    'easily attacked': deliberation.weaknessesFound.filter((w) => w.exploitability === 'easily attacked'),
    vulnerable: deliberation.weaknessesFound.filter((w) => w.exploitability === 'vulnerable'),
    'minor concern': deliberation.weaknessesFound.filter((w) => w.exploitability === 'minor concern'),
  };

  for (const [level, weaknesses] of Object.entries(byExploitability)) {
    if (weaknesses.length > 0) {
      sections.push(`### ${level.charAt(0).toUpperCase() + level.slice(1)}`);
      sections.push(
        weaknesses
          .map((w) => {
            let text = `- **${w.weakness}**`;
            if (w.location) text += `\n  - Location: ${w.location}`;
            if (w.suggestedFix) text += `\n  - Suggested Fix: ${w.suggestedFix}`;
            return text;
          })
          .join('\n\n')
      );
    }
  }

  return sections.join('\n\n');
}

function formatOpenQuestions(questions: string[]): string {
  return `
## Open Questions

The following questions remain unresolved and may require additional information or analysis:

${questions.map((q) => `- ${q}`).join('\n')}
`.trim();
}

function formatActionItems(items: ActionItem[]): string {
  const high = items.filter((i) => i.priority === 'high');
  const medium = items.filter((i) => i.priority === 'medium');
  const low = items.filter((i) => i.priority === 'low');

  const sections: string[] = ['## Recommended Action Items'];

  if (high.length > 0) {
    sections.push('### High Priority');
    sections.push(
      high
        .map((item) => {
          const blocking = item.blocking ? ' **[BLOCKING]**' : '';
          return `- ${item.item}${blocking}\n  - *${item.rationale}*`;
        })
        .join('\n\n')
    );
  }

  if (medium.length > 0) {
    sections.push('### Medium Priority');
    sections.push(medium.map((item) => `- ${item.item}`).join('\n'));
  }

  if (low.length > 0) {
    sections.push('### Low Priority');
    sections.push(low.map((item) => `- ${item.item}`).join('\n'));
  }

  return sections.join('\n\n');
}

function formatAuditSummary(deliberation: CouncilDeliberation): string {
  const audit = deliberation._audit!;

  return `
## Process Audit Summary

**Chairman Selection:** ${audit.chairmanSelection.method}
${audit.chairmanSelection.rationale}

**Process Integrity:** ${audit.processIntegrity.score.toUpperCase()}
${audit.processIntegrity.flags.length > 0 ? `Flags: ${audit.processIntegrity.flags.join(', ')}` : 'No flags raised.'}

${audit.crossStageAnomalies.length > 0 ? `**Anomalies Detected:** ${audit.crossStageAnomalies.length}` : ''}
`.trim();
}

function formatFooter(deliberation: CouncilDeliberation): string {
  const durationSec = (deliberation.metadata.durationMs / 1000).toFixed(1);

  return `
---

*This deliberation was conducted by the LLM Legal Council system.*
*Duration: ${durationSec} seconds | Models: ${deliberation.metadata.participatingModels.length} | Estimated tokens: ${deliberation.metadata.estimatedTokens.toLocaleString()}*

**Disclaimer:** This AI-generated analysis is for informational purposes only and does not constitute legal advice. All conclusions should be verified by a licensed attorney.
`.trim();
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateTitle(deliberation: CouncilDeliberation): string {
  // Extract key terms from the query
  const query = deliberation.query.toLowerCase();

  // Common legal terms to look for
  const terms = [
    'breach of contract',
    'fiduciary duty',
    'negligence',
    'liability',
    'damages',
    'settlement',
    'motion',
    'summary judgment',
    'discovery',
    'litigation',
    'claim',
    'defense',
    'strategy',
  ];

  const found = terms.find((term) => query.includes(term));

  if (found) {
    return `Legal Council: ${found.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Analysis`;
  }

  // Default title
  const typeDisplay = deliberation.queryType
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `Legal Council ${typeDisplay}`;
}

function generateDescription(deliberation: CouncilDeliberation): string {
  const consensusStatus = deliberation.consensus.reached
    ? `Consensus reached with ${Math.round(deliberation.consensus.confidence * 100)}% confidence`
    : 'No full consensus reached';

  const issueCount = deliberation.issuesIdentified.length;
  const riskLevel = deliberation.riskAssessment.overallLevel;

  return `Multi-model legal deliberation summary. ${consensusStatus}. ${issueCount} issues identified. Overall risk: ${riskLevel}.`;
}

function generateFocusPrompt(deliberation: CouncilDeliberation): string {
  const parts: string[] = [];

  // Focus on the query type
  switch (deliberation.queryType) {
    case 'risk-assessment':
      parts.push('Focus on the risk assessment findings and their practical implications.');
      break;
    case 'weakness-identification':
      parts.push('Emphasize the weaknesses found and suggested remediation strategies.');
      break;
    case 'stress-test':
    case 'devils-advocate':
      parts.push('Highlight the counterarguments and potential vulnerabilities.');
      break;
    case 'issue-spotting':
      parts.push('Focus on the legal issues identified and their severity.');
      break;
    default:
      parts.push('Provide a balanced overview of the deliberation findings.');
  }

  // Add context based on results
  if (!deliberation.consensus.reached) {
    parts.push('Give attention to the dissenting views as they represent important alternative perspectives.');
  }

  if (deliberation.issuesIdentified.some((i) => i.severity === 'critical')) {
    parts.push('Emphasize the critical issues that require immediate attention.');
  }

  return parts.join(' ');
}

/**
 * Estimate the token count of content
 */
export function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / ESTIMATED_CHARS_PER_TOKEN);
}

/**
 * Check if deliberation content will fit within token limits
 */
export function willFitInTokenLimit(
  deliberation: CouncilDeliberation,
  options: DeliberationToPodcastOptions = {}
): { fits: boolean; estimatedTokens: number; maxTokens: number } {
  const content = formatDeliberationContent(deliberation, options);
  const estimatedTokens = estimateTokenCount(content);

  return {
    fits: estimatedTokens <= MAX_TOKENS,
    estimatedTokens,
    maxTokens: MAX_TOKENS,
  };
}
