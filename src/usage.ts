/**
 * Token Usage Tracking for LLM Legal Council
 * 
 * Tracks token consumption and costs across all API calls.
 * Essential for cost management when running multiple frontier models.
 * 
 * NOTE: This system is model-agnostic. Pricing data is maintained as a
 * reference lookup, but unknown models fall back to conservative estimates.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelUsage {
  modelId: string;
  calls: number;
  usage: TokenUsage;
  estimatedCostUsd: number;
  pricingSource: 'known' | 'estimated';
}

export interface SessionUsage {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  
  /** Usage broken down by model */
  byModel: Map<string, ModelUsage>;
  
  /** Usage broken down by stage */
  byStage: {
    stage1: TokenUsage;
    stage2: TokenUsage;
    stage3: TokenUsage;
  };
  
  /** Aggregate totals */
  totals: TokenUsage;
  
  /** Total estimated cost */
  totalCostUsd: number;
  
  /** Whether any costs are estimated (vs. known pricing) */
  hasEstimatedCosts: boolean;
}

/**
 * Reference pricing table per 1K tokens
 * 
 * This is a REFERENCE LOOKUP, not a hardcoded dependency.
 * Unknown models fall back to DEFAULT_PRICING.
 * Prices change frequently - verify with your provider.
 */
const KNOWN_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'anthropic/claude-3-opus': { input: 0.015, output: 0.075 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
  
  // OpenAI
  'openai/gpt-4o': { input: 0.005, output: 0.015 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'openai/gpt-4-turbo': { input: 0.01, output: 0.03 },
  'openai/o1-preview': { input: 0.015, output: 0.06 },
  'openai/o1-mini': { input: 0.003, output: 0.012 },
  
  // Google
  'google/gemini-pro': { input: 0.00025, output: 0.0005 },
  'google/gemini-pro-1.5': { input: 0.00125, output: 0.005 },
  'google/gemini-2.0-flash': { input: 0.001, output: 0.004 },
  
  // xAI
  'x-ai/grok-2': { input: 0.005, output: 0.01 },
  'x-ai/grok-3': { input: 0.005, output: 0.015 },
  
  // Meta
  'meta-llama/llama-3.1-405b': { input: 0.003, output: 0.003 },
  'meta-llama/llama-3.1-70b': { input: 0.0008, output: 0.0008 },
  
  // Mistral
  'mistralai/mistral-large': { input: 0.004, output: 0.012 },
  'mistralai/mixtral-8x7b': { input: 0.0006, output: 0.0006 },
};

// Conservative default for unknown models
const DEFAULT_PRICING = { input: 0.01, output: 0.03 };

/**
 * Get pricing for a model
 * Returns pricing source to indicate confidence
 */
export function getModelPricing(modelId: string): { 
  pricing: { input: number; output: number }; 
  source: 'known' | 'estimated' 
} {
  // Try exact match
  if (KNOWN_PRICING[modelId]) {
    return { pricing: KNOWN_PRICING[modelId], source: 'known' };
  }
  
  // Try prefix match (handles versioned model strings)
  for (const [key, pricing] of Object.entries(KNOWN_PRICING)) {
    if (modelId.startsWith(key) || modelId.includes(key.split('/')[1])) {
      return { pricing, source: 'known' };
    }
  }
  
  return { pricing: DEFAULT_PRICING, source: 'estimated' };
}

/**
 * Calculate cost for a single API call
 */
export function calculateCost(modelId: string, usage: TokenUsage): { 
  cost: number; 
  source: 'known' | 'estimated' 
} {
  const { pricing, source } = getModelPricing(modelId);
  const inputCost = (usage.promptTokens / 1000) * pricing.input;
  const outputCost = (usage.completionTokens / 1000) * pricing.output;
  return { cost: inputCost + outputCost, source };
}

/**
 * Token usage tracker for a deliberation session
 */
export class UsageTracker {
  private session: SessionUsage;

  constructor(sessionId: string) {
    this.session = {
      sessionId,
      startTime: new Date(),
      byModel: new Map(),
      byStage: {
        stage1: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        stage2: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        stage3: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      },
      totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      totalCostUsd: 0,
      hasEstimatedCosts: false
    };
  }

  /**
   * Record usage from an API call
   */
  recordUsage(
    modelId: string, 
    stage: 1 | 2 | 3, 
    usage: TokenUsage | undefined
  ): void {
    if (!usage) {
      // If no usage data, estimate from typical response sizes
      usage = {
        promptTokens: 500,
        completionTokens: 1000,
        totalTokens: 1500
      };
    }

    const { cost, source } = calculateCost(modelId, usage);
    
    if (source === 'estimated') {
      this.session.hasEstimatedCosts = true;
    }

    // Update model breakdown
    const existing = this.session.byModel.get(modelId);
    if (existing) {
      existing.calls += 1;
      existing.usage.promptTokens += usage.promptTokens;
      existing.usage.completionTokens += usage.completionTokens;
      existing.usage.totalTokens += usage.totalTokens;
      existing.estimatedCostUsd += cost;
    } else {
      this.session.byModel.set(modelId, {
        modelId,
        calls: 1,
        usage: { ...usage },
        estimatedCostUsd: cost,
        pricingSource: source
      });
    }

    // Update stage breakdown
    const stageKey = `stage${stage}` as keyof typeof this.session.byStage;
    this.session.byStage[stageKey].promptTokens += usage.promptTokens;
    this.session.byStage[stageKey].completionTokens += usage.completionTokens;
    this.session.byStage[stageKey].totalTokens += usage.totalTokens;

    // Update totals
    this.session.totals.promptTokens += usage.promptTokens;
    this.session.totals.completionTokens += usage.completionTokens;
    this.session.totals.totalTokens += usage.totalTokens;
    this.session.totalCostUsd += cost;
  }

  /**
   * Get current session usage
   */
  getUsage(): SessionUsage {
    return {
      ...this.session,
      endTime: new Date()
    };
  }

  /**
   * Get usage summary for display
   */
  getSummary(): UsageSummary {
    const usage = this.getUsage();
    const modelBreakdown: ModelUsageSummary[] = [];
    
    for (const [modelId, modelUsage] of usage.byModel) {
      modelBreakdown.push({
        model: modelId.split('/')[1] || modelId,  // Remove provider prefix for display
        fullModelId: modelId,
        calls: modelUsage.calls,
        tokens: modelUsage.usage.totalTokens,
        cost: modelUsage.estimatedCostUsd,
        pricingSource: modelUsage.pricingSource
      });
    }

    // Sort by cost descending
    modelBreakdown.sort((a, b) => b.cost - a.cost);

    return {
      totalTokens: usage.totals.totalTokens,
      totalCost: usage.totalCostUsd,
      hasEstimatedCosts: usage.hasEstimatedCosts,
      durationMs: usage.endTime 
        ? usage.endTime.getTime() - usage.startTime.getTime()
        : Date.now() - usage.startTime.getTime(),
      byModel: modelBreakdown,
      byStage: {
        stage1: usage.byStage.stage1.totalTokens,
        stage2: usage.byStage.stage2.totalTokens,
        stage3: usage.byStage.stage3.totalTokens
      }
    };
  }
}

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  hasEstimatedCosts: boolean;
  durationMs: number;
  byModel: ModelUsageSummary[];
  byStage: {
    stage1: number;
    stage2: number;
    stage3: number;
  };
}

export interface ModelUsageSummary {
  model: string;
  fullModelId: string;
  calls: number;
  tokens: number;
  cost: number;
  pricingSource: 'known' | 'estimated';
}

/**
 * Format usage summary for CLI display
 */
export function formatUsageSummary(summary: UsageSummary): string {
  const lines: string[] = [];
  
  const costNote = summary.hasEstimatedCosts ? ' (some estimated)' : '';
  
  lines.push('┌─────────────────────────────────────────────────────┐');
  lines.push('│                  TOKEN USAGE SUMMARY                │');
  lines.push('├─────────────────────────────────────────────────────┤');
  lines.push(`│  Total Tokens:     ${summary.totalTokens.toLocaleString().padStart(10)}                    │`);
  lines.push(`│  Total Cost:       $${summary.totalCost.toFixed(4).padStart(9)}${costNote.padEnd(20)}│`);
  lines.push(`│  Duration:         ${(summary.durationMs / 1000).toFixed(1).padStart(7)}s                      │`);
  lines.push('├─────────────────────────────────────────────────────┤');
  lines.push('│  BY STAGE                                           │');
  lines.push(`│    Stage 1 (Analysis):    ${summary.byStage.stage1.toLocaleString().padStart(8)} tokens        │`);
  lines.push(`│    Stage 2 (Peer Review): ${summary.byStage.stage2.toLocaleString().padStart(8)} tokens        │`);
  lines.push(`│    Stage 3 (Synthesis):   ${summary.byStage.stage3.toLocaleString().padStart(8)} tokens        │`);
  lines.push('├─────────────────────────────────────────────────────┤');
  lines.push('│  BY MODEL                                           │');
  
  for (const model of summary.byModel) {
    const modelName = model.model.substring(0, 18).padEnd(18);
    const cost = `$${model.cost.toFixed(4)}`.padStart(8);
    const marker = model.pricingSource === 'estimated' ? '~' : ' ';
    lines.push(`│  ${marker} ${modelName} ${model.tokens.toLocaleString().padStart(6)} tk  ${cost}   │`);
  }
  
  if (summary.hasEstimatedCosts) {
    lines.push('├─────────────────────────────────────────────────────┤');
    lines.push('│  ~ = estimated pricing (model not in reference)     │');
  }
  
  lines.push('└─────────────────────────────────────────────────────┘');
  
  return lines.join('\n');
}

/**
 * Format compact usage for inline display
 */
export function formatUsageCompact(summary: UsageSummary): string {
  const estimate = summary.hasEstimatedCosts ? '~' : '';
  return `${summary.totalTokens.toLocaleString()} tokens | ${estimate}$${summary.totalCost.toFixed(4)} | ${(summary.durationMs / 1000).toFixed(1)}s`;
}
