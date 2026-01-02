/**
 * LLM Legal Council Configuration
 * 
 * ARCHITECTURE PRINCIPLE: This file defines STRUCTURE, not INTELLIGENCE.
 * 
 * The code knows there are "seats" on the council.
 * Which models occupy those seats is determined at runtime via environment.
 * There are NO hardcoded model defaults.
 * 
 * This is the "Board Seat" architecture - the software defines the governance
 * structure, and the specific intelligences are appointed at deployment.
 */

// ============================================================================
// Council Structure (Model-Agnostic)
// ============================================================================

export interface CouncilConfig {
  /** Models occupying council seats (populated from environment) */
  councilModels: string[];
  
  /** 
   * User-specified chairman override (only set if CHAIRMAN_MODEL env var exists).
   * When undefined, algorithmic selection chooses highest-ranked analyst.
   */
  chairmanOverrideModel?: string;
  
  /** Fallback chairman if algorithmic selection fails (first council model) */
  fallbackChairmanModel: string;
  
  /** Minimum seats that must be filled for a valid council */
  minimumSeats: number;
  
  /** Maximum seats supported */
  maximumSeats: number;
  
  /** Maximum concurrent API calls (prevents rate limiting with large councils) */
  concurrencyLimit: number;
  
  /** 
   * Models that don't reliably support JSON schema mode.
   * These will use JSON-prompting fallback with extraction.
   */
  jsonFallbackModels?: string[];
  
  /** Legal context defaults */
  legalContext: {
    defaultJurisdiction: string;
  };
}

/**
 * Load council configuration from environment variables.
 * 
 * Required environment variables:
 *   COUNCIL_MODEL_1 through COUNCIL_MODEL_N - Council member models
 * 
 * Optional:
 *   CHAIRMAN_MODEL - Override algorithmic chairman selection
 *   DEFAULT_JURISDICTION - Default jurisdiction (defaults to "NY")
 * 
 * At least 2 council models must be defined for quorum.
 * 
 * Chairman Selection (v0.5+):
 *   By default, the highest-ranked analyst from Stage 2 becomes chairman.
 *   Set CHAIRMAN_MODEL to override this with a specific model.
 */
export function loadCouncilConfig(): CouncilConfig {
  const models: string[] = [];
  
  // Load council seats from environment (COUNCIL_MODEL_1 through COUNCIL_MODEL_10)
  for (let i = 1; i <= 10; i++) {
    const modelId = process.env[`COUNCIL_MODEL_${i}`];
    if (modelId && modelId.trim()) {
      models.push(modelId.trim());
    }
  }
  
  // Validate minimum quorum
  if (models.length < 2) {
    throw new ConfigurationError(
      `Council requires at least 2 models. Found ${models.length}.\n\n` +
      `Set COUNCIL_MODEL_1, COUNCIL_MODEL_2, etc. in your environment or .env file.\n\n` +
      `Example .env configuration:\n` +
      `  OPENROUTER_API_KEY=your_key_here\n` +
      `  COUNCIL_MODEL_1=provider/model-name-1\n` +
      `  COUNCIL_MODEL_2=provider/model-name-2\n` +
      `  COUNCIL_MODEL_3=provider/model-name-3\n\n` +
      `Model identifiers must match your API provider's naming convention.`
    );
  }
  
  // Chairman override only set if explicitly provided
  const chairmanOverride = process.env.CHAIRMAN_MODEL?.trim() || undefined;
  
  // Parse JSON fallback models from env (comma-separated list)
  const jsonFallbackModelsEnv = process.env.COUNCIL_JSON_FALLBACK_MODELS?.trim();
  const jsonFallbackModels = jsonFallbackModelsEnv 
    ? jsonFallbackModelsEnv.split(',').map(m => m.trim()).filter(Boolean)
    : undefined;
  
  return {
    councilModels: models,
    chairmanOverrideModel: chairmanOverride,
    fallbackChairmanModel: models[0],
    minimumSeats: 2,
    maximumSeats: 10,
    concurrencyLimit: (() => {
      const raw = Number.parseInt(process.env.COUNCIL_CONCURRENCY_LIMIT ?? '3', 10);
      return Number.isFinite(raw) && raw > 0 ? raw : 3;
    })(),
    jsonFallbackModels,
    legalContext: {
      defaultJurisdiction: process.env.DEFAULT_JURISDICTION || 'NY'
    }
  };
}

/**
 * Validate that required configuration is present.
 * Returns errors rather than throwing - use for pre-flight checks.
 */
export function validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check API key
  if (!process.env.OPENROUTER_API_KEY) {
    errors.push('OPENROUTER_API_KEY is required');
  }
  
  // Check for council models
  const models: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const model = process.env[`COUNCIL_MODEL_${i}`]?.trim();
    if (model) {
      models.push(model);
    }
  }
  
  if (models.length === 0) {
    errors.push('No council models defined. Set COUNCIL_MODEL_1, COUNCIL_MODEL_2, etc.');
  } else if (models.length === 1) {
    errors.push('Only 1 council model defined. At least 2 required for deliberation.');
  } else if (models.length === 2) {
    warnings.push('Only 2 council models defined. Consider adding more for diverse perspectives.');
  }
  
  // Note: CHAIRMAN_MODEL is optional - algorithmic selection is the default (v0.5+)
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

// ============================================================================
// Use Case Definitions (What the council is FOR)
// ============================================================================

export const councilUseCases = {
  appropriate: [
    'Issue spotting on draft motions or briefs',
    'Risk assessment for litigation strategy',
    'Identifying weaknesses in legal arguments',
    'Stress testing case theories',
    'Devil\'s advocate analysis',
    'Evaluating strength of claims or defenses',
    'Reality-checking damage calculations',
    'Brainstorming strategic alternatives',
    'Reviewing discovery responses for gaps',
    'Assessing settlement positions',
    'Comparing strategic alternatives',
    'Reviewing draft for logical fallacies'
  ],
  inappropriate: [
    'Drafting documents (use an attorney agent)',
    'Writing persuasive briefs',
    'Creating final work product',
    'Client correspondence',
    'Court filings',
    'Contract drafting',
    'Demand letters',
    'Discovery responses'
  ]
};

/**
 * Check if a query is appropriate for council deliberation
 * 
 * The council is for CRITIQUE and DELIBERATION, not document drafting.
 * However, critiquing/reviewing a draft IS appropriate.
 */
export function isAppropriateForCouncil(query: string): { appropriate: boolean; reason?: string } {
  const q = query.toLowerCase();
  
  // If the user is clearly asking for critique/review, allow - even if "draft" appears
  const critiqueSignals = /\b(review|critique|analy[sz]e|issue[- ]?spot|weakness|stress[- ]?test|risk[- ]?assess|devil'?s[- ]?advocate|evaluate|assess|check|identify|find|spot|flag)\b/;
  if (critiqueSignals.test(q)) {
    return { appropriate: true };
  }
  
  // Block explicit drafting intent ("draft a motion", "write the complaint", etc.)
  const draftingIntent = /\b(draft|write|prepare|compose|generate|create)\s+(a|an|the|my|our)?\s*\b(motion|brief|complaint|answer|letter|memo|memorandum|contract|response|pleading|filing|document)\b/;
  if (draftingIntent.test(q)) {
    return {
      appropriate: false,
      reason:
        `This appears to be a drafting request. The council is for critique and deliberation, not generating filings. ` +
        `If you meant to review an existing draft, use words like "review," "critique," "analyze," or "issue-spot."`
    };
  }
  
  return { appropriate: true };
}

// ============================================================================
// Prompt Templates (Structure, not model-specific)
// ============================================================================

export const councilPrompts = {
  // Stage 1: Independent analysis
  stage1Analysis: `You are a legal analyst participating in a multi-model deliberation council.

TASK: Analyze the following legal issue independently. Do not hedge excessively.

ISSUE: {issue}
{context}

Provide:
1. Your assessment of the core legal question
2. Key strengths of the position
3. Key weaknesses or vulnerabilities  
4. Risk factors (be specific, not catastrophic)
5. Your confidence level (low/medium/high) with brief justification

Be direct. Disagreement with other analysts is expected and valuable.`,

  // Stage 2: Anonymized peer review
  stage2Review: `You are reviewing anonymized legal analyses from your peers.

YOUR TASK: Evaluate each analysis on its merits. Do NOT try to guess which analyst produced each response.

ANALYSES TO REVIEW:
{analyses}

For each analysis, assess:
1. Legal accuracy (1-5)
2. Identification of key issues (1-5)
3. Risk calibration - neither catastrophizing nor dismissive (1-5)
4. Practical utility (1-5)

Then provide your FINAL RANKING from best to worst.`,

  // Stage 3: Chairman synthesis (preserves dissent)
  stage3Synthesis: `You are the Chairman of a Legal Deliberation Council.

Your role is to SYNTHESIZE, not to override. Preserve genuine disagreement.

ORIGINAL ISSUE: {issue}

STAGE 1 ANALYSES:
{analyses}

STAGE 2 PEER RANKINGS:
{rankings}

Provide a synthesis that includes:

1. CONSENSUS POSITION (if any)
   - What do most/all analysts agree on?
   - Confidence level of this consensus

2. ISSUES IDENTIFIED
   - List all issues raised, noting how many analysts flagged each
   - Severity assessment (critical/significant/minor)

3. RISK ASSESSMENT
   - Synthesize risk views across analysts
   - Flag if any analyst's risk assessment appears disproportionate
   - Provide calibrated risk summary

4. DISSENTING VIEWS (CRITICAL - DO NOT OMIT)
   - If analysts disagreed, preserve each distinct position
   - Do not manufacture false consensus
   - A split council is more useful than forced agreement

5. OPEN QUESTIONS
   - What remains unresolved?
   - What additional information would help?

6. ACTION ITEMS
   - Specific items for the attorney to address
   - Prioritized by importance

Be direct and practical. This output will be used by a human attorney.`
};
