/**
 * Zod Schemas for Structured LLM Output
 * 
 * These schemas enforce JSON mode responses from LLMs.
 * No more regex parsing of free-form text.
 */

import { z } from 'zod';

// ============================================================================
// Stage 1: Individual Analysis Schema
// ============================================================================

export const Stage1AnalysisSchema = z.object({
  assessment: z.string().describe('Core assessment of the legal question'),
  strengths: z.array(z.string()).describe('Key strengths of the position'),
  weaknesses: z.array(z.string()).describe('Key weaknesses or vulnerabilities'),
  risks: z.array(z.object({
    risk: z.string(),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high'])
  })).describe('Identified risk factors'),
  confidence: z.enum(['low', 'medium', 'high']).describe('Overall confidence level'),
  confidenceRationale: z.string().describe('Brief justification for confidence level'),
  thresholdIssues: z.array(z.object({
    issue: z.string(),
    status: z.enum(['known', 'assumed', 'unknown']),
    basis: z.string().optional()
  })).optional().describe('Threshold issues checked (jurisdiction, standing, timeliness)'),
  adversarialArgument: z.string().optional().describe('Strongest argument opposing counsel could make')
});

export type Stage1Analysis = z.infer<typeof Stage1AnalysisSchema>;

// ============================================================================
// Stage 2: Peer Review Schema
// ============================================================================

export const AnalysisEvaluationSchema = z.object({
  legalAccuracy: z.number().min(1).max(5),
  issueIdentification: z.number().min(1).max(5),
  riskCalibration: z.number().min(1).max(5),
  practicalUtility: z.number().min(1).max(5),
  comment: z.string().optional()
});

export const Stage2ReviewSchema = z.object({
  evaluations: z.record(z.string(), AnalysisEvaluationSchema)
    .describe('Scores for each analysis, keyed by label (A, B, C, etc.)'),
  ranking: z.array(z.string())
    .describe('Ordered list of analysis labels, best first'),
  rankingRationale: z.string()
    .describe('Brief explanation for the ranking')
});

export type Stage2Review = z.infer<typeof Stage2ReviewSchema>;

// ============================================================================
// Stage 3: Chairman Synthesis Schema
// ============================================================================

export const IdentifiedIssueSchema = z.object({
  issue: z.string(),
  severity: z.enum(['critical', 'significant', 'minor']),
  flaggedByCount: z.number().int().min(1),
  unanimous: z.boolean(),
  explanation: z.string().optional()
});

export const RiskFactorSchema = z.object({
  risk: z.string(),
  likelihood: z.enum(['unlikely', 'possible', 'likely']),
  impact: z.enum(['low', 'medium', 'high']),
  councilAgreement: z.enum(['unanimous', 'majority', 'split'])
});

export const DissentingViewSchema = z.object({
  position: z.string(),
  reasoning: z.string(),
  supportedByCount: z.number().int().min(1),
  noteworthy: z.boolean()
});

export const WeaknessSchema = z.object({
  weakness: z.string(),
  location: z.string().optional(),
  exploitability: z.enum(['easily attacked', 'vulnerable', 'minor concern']),
  suggestedFix: z.string().optional()
});

export const ActionItemSchema = z.object({
  item: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
  blocking: z.boolean()
});

export const SourceAttributionSchema = z.object({
  label: z.string().describe('Analysis label (A, B, C, etc.)'),
  reliedOnFor: z.array(z.string()).describe('What conclusions this analysis contributed to')
});

export const Stage3SynthesisSchema = z.object({
  consensus: z.object({
    reached: z.boolean(),
    position: z.string(),
    confidence: z.number().min(0).max(1),
    agreementCount: z.number().int(),
    totalMembers: z.number().int()
  }),
  
  issues: z.array(IdentifiedIssueSchema),
  
  risk: z.object({
    overallLevel: z.enum(['low', 'medium', 'high']),
    factors: z.array(RiskFactorSchema),
    catastrophizingDetected: z.boolean(),
    understatingDetected: z.boolean(),
    calibrationNotes: z.string()
  }),
  
  dissent: z.array(DissentingViewSchema),
  
  weaknesses: z.array(WeaknessSchema),
  
  openQuestions: z.array(z.string()),
  
  actionItems: z.array(ActionItemSchema),
  
  sourceAttribution: z.array(SourceAttributionSchema).optional()
    .describe('Which analyses contributed to which conclusions - enables audit trail')
});

export type Stage3Synthesis = z.infer<typeof Stage3SynthesisSchema>;

// ============================================================================
// JSON Schema Conversion for OpenRouter
// ============================================================================

/**
 * Convert Zod schema to JSON Schema format for OpenRouter's response_format
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): object {
  // Simplified conversion - in production, use zod-to-json-schema library
  return {
    type: 'object',
    additionalProperties: true
  };
}

/**
 * Get the JSON schema string for Stage 1 analysis
 */
export const stage1JsonSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'stage1_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        assessment: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        risks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              risk: { type: 'string' },
              likelihood: { type: 'string', enum: ['low', 'medium', 'high'] },
              impact: { type: 'string', enum: ['low', 'medium', 'high'] }
            },
            required: ['risk', 'likelihood', 'impact']
          }
        },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        confidenceRationale: { type: 'string' },
        thresholdIssues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              issue: { type: 'string' },
              status: { type: 'string', enum: ['known', 'assumed', 'unknown'] },
              basis: { type: 'string' }
            },
            required: ['issue', 'status']
          }
        },
        adversarialArgument: { type: 'string' }
      },
      required: ['assessment', 'strengths', 'weaknesses', 'risks', 'confidence', 'confidenceRationale']
    }
  }
};

/**
 * Get the JSON schema string for Stage 2 review
 */
export const stage2JsonSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'stage2_review',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        evaluations: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              legalAccuracy: { type: 'number', minimum: 1, maximum: 5 },
              issueIdentification: { type: 'number', minimum: 1, maximum: 5 },
              riskCalibration: { type: 'number', minimum: 1, maximum: 5 },
              practicalUtility: { type: 'number', minimum: 1, maximum: 5 },
              comment: { type: 'string' }
            },
            required: ['legalAccuracy', 'issueIdentification', 'riskCalibration', 'practicalUtility']
          }
        },
        ranking: { type: 'array', items: { type: 'string' } },
        rankingRationale: { type: 'string' }
      },
      required: ['evaluations', 'ranking', 'rankingRationale']
    }
  }
};

/**
 * Get the JSON schema string for Stage 3 synthesis
 */
export const stage3JsonSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'stage3_synthesis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        consensus: {
          type: 'object',
          properties: {
            reached: { type: 'boolean' },
            position: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            agreementCount: { type: 'integer' },
            totalMembers: { type: 'integer' }
          },
          required: ['reached', 'position', 'confidence', 'agreementCount', 'totalMembers']
        },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              issue: { type: 'string' },
              severity: { type: 'string', enum: ['critical', 'significant', 'minor'] },
              flaggedByCount: { type: 'integer' },
              unanimous: { type: 'boolean' },
              explanation: { type: 'string' }
            },
            required: ['issue', 'severity', 'flaggedByCount', 'unanimous']
          }
        },
        risk: {
          type: 'object',
          properties: {
            overallLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            factors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  risk: { type: 'string' },
                  likelihood: { type: 'string', enum: ['unlikely', 'possible', 'likely'] },
                  impact: { type: 'string', enum: ['low', 'medium', 'high'] },
                  councilAgreement: { type: 'string', enum: ['unanimous', 'majority', 'split'] }
                },
                required: ['risk', 'likelihood', 'impact', 'councilAgreement']
              }
            },
            catastrophizingDetected: { type: 'boolean' },
            understatingDetected: { type: 'boolean' },
            calibrationNotes: { type: 'string' }
          },
          required: ['overallLevel', 'factors', 'catastrophizingDetected', 'understatingDetected', 'calibrationNotes']
        },
        dissent: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              position: { type: 'string' },
              reasoning: { type: 'string' },
              supportedByCount: { type: 'integer' },
              noteworthy: { type: 'boolean' }
            },
            required: ['position', 'reasoning', 'supportedByCount', 'noteworthy']
          }
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weakness: { type: 'string' },
              location: { type: 'string' },
              exploitability: { type: 'string', enum: ['easily attacked', 'vulnerable', 'minor concern'] },
              suggestedFix: { type: 'string' }
            },
            required: ['weakness', 'exploitability']
          }
        },
        openQuestions: { type: 'array', items: { type: 'string' } },
        actionItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              rationale: { type: 'string' },
              blocking: { type: 'boolean' }
            },
            required: ['item', 'priority', 'rationale', 'blocking']
          }
        }
      },
      required: ['consensus', 'issues', 'risk', 'dissent', 'weaknesses', 'openQuestions', 'actionItems']
    }
  }
};
