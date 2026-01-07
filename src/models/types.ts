/**
 * Model Types for LLM Legal Council Model Selector
 */

export interface ModelPricing {
  /** Cost per million input tokens (USD) */
  promptPerMillion: number;
  /** Cost per million output tokens (USD) */
  completionPerMillion: number;
  /** Per-request fee if applicable */
  requestFee?: number;
}

export interface ModelCapabilities {
  /** Supports function/tool calling */
  functionCalling: boolean;
  /** Supports JSON mode output */
  jsonMode: boolean;
  /** Supports vision/image input */
  vision: boolean;
  /** Supports streaming */
  streaming: boolean;
  /** Supports system messages */
  systemPrompt: boolean;
}

export interface CouncilAnalysis {
  /** Overall suitability score for legal council (1-10) */
  councilScore: number;
  /** Model's strengths for council deliberation */
  strengths: string[];
  /** Model's weaknesses for council deliberation */
  weaknesses: string[];
  /** Recommended council role */
  recommendedRole: 'lead-analyst' | 'red-team' | 'judge' | 'contrarian' | 'chairman' | 'generalist';
  /** Whether recommended for chairman synthesis */
  chairmanSuitable: boolean;
  /** Brief analysis summary */
  summary: string;
}

export interface OpenRouterModel {
  /** Model identifier (e.g., "anthropic/claude-sonnet-4") */
  id: string;
  /** Display name */
  name: string;
  /** Provider name */
  provider: string;
  /** Model description */
  description: string;
  /** Context window size in tokens */
  contextLength: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Pricing information */
  pricing: ModelPricing;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Architecture type */
  architecture?: string;
  /** Model tier classification */
  tier: 'frontier' | 'flagship' | 'standard' | 'budget' | 'free';
  /** Whether this model is recommended for legal council */
  legalCouncilRecommended: boolean;
  /** Detailed council analysis */
  councilAnalysis?: CouncilAnalysis;
  /** Last updated timestamp */
  updatedAt?: string;
}

export interface CouncilConfiguration {
  /** Seat A - typically lead analyst */
  seatA: string;
  /** Seat B - typically red team */
  seatB: string;
  /** Seat C - typically judge */
  seatC: string;
  /** Seat D - optional contrarian */
  seatD?: string;
  /** Chairman model for synthesis */
  chairman: string;
}

export interface ModelSelectorOptions {
  /** Filter by tier */
  tiers?: Array<'frontier' | 'flagship' | 'standard' | 'budget' | 'free'>;
  /** Filter by minimum context length */
  minContextLength?: number;
  /** Filter by maximum price per million tokens */
  maxPricePerMillion?: number;
  /** Only show council-recommended models */
  councilRecommendedOnly?: boolean;
  /** Only show chairman-suitable models */
  chairmanSuitableOnly?: boolean;
  /** Required capabilities */
  requiredCapabilities?: Partial<ModelCapabilities>;
}
