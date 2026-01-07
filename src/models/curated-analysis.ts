/**
 * Curated Model Analysis for LLM Legal Council
 *
 * Expert analysis of each model's strengths and weaknesses for legal deliberation.
 * This serves as both:
 * 1. Fallback data when OpenRouter API is unavailable
 * 2. Council-specific analysis overlaid on API-fetched models
 *
 * Analysis criteria:
 * - Legal reasoning capability
 * - Citation accuracy and hallucination resistance
 * - Adversarial thinking ability
 * - Synthesis and summarization quality
 * - Instruction following (for structured JSON output)
 * - Context utilization
 */

import { OpenRouterModel, CouncilAnalysis } from './types.js';

/**
 * Curated analysis keyed by model ID
 */
export const CURATED_MODEL_ANALYSIS: Record<string, OpenRouterModel> = {
  // ============================================================================
  // ANTHROPIC MODELS
  // ============================================================================

  'anthropic/claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    description: 'Anthropic\'s latest Sonnet model with enhanced reasoning and instruction following.',
    contextLength: 200000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 3.00,
      completionPerMillion: 15.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 9,
      strengths: [
        'Exceptional instruction following for structured legal analysis',
        'Strong adversarial reasoning - excels at identifying counterarguments',
        'Reliable JSON mode output with consistent schema adherence',
        'Nuanced understanding of legal precedent and authority hierarchy',
        'Excellent at preserving dissent without false consensus',
        'Low hallucination rate for legal citations',
        '200K context handles large document sets effectively',
      ],
      weaknesses: [
        'Can be overly cautious, may hedge more than necessary',
        'Sometimes verbose in explanations',
        'Higher cost than budget alternatives',
      ],
      recommendedRole: 'lead-analyst',
      chairmanSuitable: true,
      summary: 'Best overall choice for lead analyst or chairman. Excels at structured legal reasoning, adversarial thinking, and synthesis. High instruction compliance makes it ideal for JSON-structured deliberations.',
    },
  },

  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Previous generation Sonnet with strong reasoning capabilities.',
    contextLength: 200000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 3.00,
      completionPerMillion: 15.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 8,
      strengths: [
        'Proven track record for legal analysis',
        'Strong structured output compliance',
        'Good adversarial reasoning',
        'Handles long documents well',
      ],
      weaknesses: [
        'Slightly older model, may lack latest improvements',
        'Same pricing as Claude Sonnet 4 with less capability',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: true,
      summary: 'Reliable workhorse for legal council. Consider upgrading to Claude Sonnet 4 for new deployments.',
    },
  },

  'anthropic/claude-3-opus': {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Anthropic\'s most powerful model with exceptional reasoning.',
    contextLength: 200000,
    maxOutputTokens: 4096,
    pricing: {
      promptPerMillion: 15.00,
      completionPerMillion: 75.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 9,
      strengths: [
        'Deepest reasoning capability in the Claude family',
        'Excellent for complex multi-factor legal analysis',
        'Superior at synthesizing conflicting viewpoints',
        'Best-in-class for chairman synthesis tasks',
        'Exceptional at preserving nuance in dissent',
      ],
      weaknesses: [
        'Significantly more expensive (5x Sonnet)',
        'Slower response times',
        'May be overkill for straightforward analyses',
      ],
      recommendedRole: 'chairman',
      chairmanSuitable: true,
      summary: 'Premium choice for chairman role. Best reasoning depth justifies cost for final synthesis. Consider for high-stakes matters.',
    },
  },

  'anthropic/claude-3-haiku': {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    description: 'Fast, cost-effective Claude model for simpler tasks.',
    contextLength: 200000,
    maxOutputTokens: 4096,
    pricing: {
      promptPerMillion: 0.25,
      completionPerMillion: 1.25,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'budget',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 5,
      strengths: [
        'Very fast responses',
        'Cost-effective for high-volume use',
        'Good for simple extraction tasks',
      ],
      weaknesses: [
        'Insufficient reasoning depth for legal analysis',
        'Higher hallucination rate than larger models',
        'May miss subtle legal issues',
        'Not suitable for adversarial examination',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended for council deliberation. Insufficient reasoning depth for legal analysis tasks.',
    },
  },

  // ============================================================================
  // OPENAI MODELS
  // ============================================================================

  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI\'s flagship multimodal model.',
    contextLength: 128000,
    maxOutputTokens: 16384,
    pricing: {
      promptPerMillion: 2.50,
      completionPerMillion: 10.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: false, // Explicitly excluded per handoff
    councilAnalysis: {
      councilScore: 4, // Downgraded due to known issues
      strengths: [
        'Fast inference speed',
        'Good multimodal capabilities',
        'Wide tool ecosystem',
      ],
      weaknesses: [
        'EXPLICITLY EXCLUDED from Legal Council - do not use',
        'Higher hallucination rate than Claude for legal citations',
        'Inconsistent JSON mode behavior',
        'Tends toward confident but incorrect legal assertions',
        'Less reliable adversarial reasoning',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'NOT RECOMMENDED for Legal Council. Explicitly excluded due to reliability issues with legal analysis. Use GPT-5.2 instead.',
    },
  },

  'openai/gpt-4-turbo': {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    description: 'Previous generation GPT-4 with turbo optimizations.',
    contextLength: 128000,
    maxOutputTokens: 4096,
    pricing: {
      promptPerMillion: 10.00,
      completionPerMillion: 30.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 5,
      strengths: [
        'Improved over base GPT-4',
        'Good general reasoning',
      ],
      weaknesses: [
        'Superseded by newer models',
        'Same hallucination issues as GPT-4o',
        'Higher cost than alternatives',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended. Consider GPT-5.2 for OpenAI models in legal council.',
    },
  },

  'openai/o1': {
    id: 'openai/o1',
    name: 'OpenAI o1',
    provider: 'openai',
    description: 'OpenAI\'s reasoning-focused model with extended thinking.',
    contextLength: 200000,
    maxOutputTokens: 100000,
    pricing: {
      promptPerMillion: 15.00,
      completionPerMillion: 60.00,
    },
    capabilities: {
      functionCalling: false, // o1 has limited function calling
      jsonMode: true,
      vision: true,
      streaming: false, // o1 doesn't stream
      systemPrompt: false, // o1 has limited system prompt support
    },
    tier: 'frontier',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 8,
      strengths: [
        'Extended reasoning chains for complex legal problems',
        'Excellent at multi-step logical analysis',
        'Strong at identifying subtle issues',
        'Good at adversarial thinking',
      ],
      weaknesses: [
        'No streaming - poor UX for real-time display',
        'Limited system prompt support',
        'No function calling - cannot use council tools',
        'Very slow response times (minutes)',
        'Expensive',
      ],
      recommendedRole: 'judge',
      chairmanSuitable: false, // No streaming, limited system prompt
      summary: 'Excellent reasoning but operational limitations. Best as judge role for deep analysis where streaming not needed.',
    },
  },

  'openai/o1-mini': {
    id: 'openai/o1-mini',
    name: 'OpenAI o1-mini',
    provider: 'openai',
    description: 'Smaller, faster version of o1 with reasoning capabilities.',
    contextLength: 128000,
    maxOutputTokens: 65536,
    pricing: {
      promptPerMillion: 3.00,
      completionPerMillion: 12.00,
    },
    capabilities: {
      functionCalling: false,
      jsonMode: true,
      vision: false,
      streaming: false,
      systemPrompt: false,
    },
    tier: 'standard',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 6,
      strengths: [
        'Reasoning focus at lower cost than o1',
        'Good for specific analytical tasks',
      ],
      weaknesses: [
        'Same operational limitations as o1',
        'Less capable than full o1',
        'No streaming or function calling',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Consider for specialized reasoning tasks only. Operational limitations reduce council utility.',
    },
  },

  // Hypothetical GPT-5.2 (from handoff document)
  'openai/gpt-5.2': {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    description: 'OpenAI\'s latest flagship model with improved reasoning and reliability.',
    contextLength: 256000,
    maxOutputTokens: 32768,
    pricing: {
      promptPerMillion: 5.00,
      completionPerMillion: 15.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 8,
      strengths: [
        'Significantly improved over GPT-4o',
        'Better citation accuracy',
        'Strong adversarial reasoning',
        'Reliable tool iteration',
        'Good for red team role - finds weaknesses',
      ],
      weaknesses: [
        'Tool iteration requires proper handling (see handoff)',
        'May still be more confident than warranted',
        'Less nuanced than Claude for synthesis',
      ],
      recommendedRole: 'red-team',
      chairmanSuitable: true,
      summary: 'Recommended OpenAI model for council. Assign to red team role for aggressive weakness identification.',
    },
  },

  // ============================================================================
  // GOOGLE MODELS
  // ============================================================================

  'google/gemini-2.0-flash-exp': {
    id: 'google/gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    provider: 'google',
    description: 'Google\'s latest experimental Gemini model.',
    contextLength: 1000000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 0.00, // Often free during experimental
      completionPerMillion: 0.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: false, // Experimental
    councilAnalysis: {
      councilScore: 6,
      strengths: [
        'Massive 1M context window',
        'Free during experimental period',
        'Good for document-heavy analysis',
      ],
      weaknesses: [
        'Experimental - may have unpredictable behavior',
        'Not production-ready',
        'JSON mode can be inconsistent',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended for production legal council. Consider Gemini Pro for stable deployment.',
    },
  },

  'google/gemini-1.5-pro': {
    id: 'google/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Google\'s production Gemini model with excellent context handling.',
    contextLength: 2000000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 1.25,
      completionPerMillion: 5.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 8,
      strengths: [
        'Exceptional 2M context window - best for document analysis',
        'Good at synthesizing across multiple documents',
        'Cost-effective for document-heavy deliberations',
        'Strong factual grounding',
        'Natural judge/arbiter role',
      ],
      weaknesses: [
        'JSON mode sometimes requires fallback handling',
        'Less consistent than Claude for structured output',
        'May need COUNCIL_JSON_FALLBACK_MODELS config',
      ],
      recommendedRole: 'judge',
      chairmanSuitable: true,
      summary: 'Excellent for judge role. Massive context enables full document ingestion. Good synthesis capabilities for chairman backup.',
    },
  },

  // Hypothetical Gemini 3 Pro (from handoff)
  'google/gemini-3-pro': {
    id: 'google/gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'google',
    description: 'Google\'s latest production Gemini model.',
    contextLength: 2000000,
    maxOutputTokens: 16384,
    pricing: {
      promptPerMillion: 2.50,
      completionPerMillion: 10.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 8,
      strengths: [
        'Industry-leading context window',
        'Improved JSON mode reliability',
        'Excellent document grounding',
        'Strong at cross-referencing authorities',
        'Natural arbiter/judge capabilities',
      ],
      weaknesses: [
        'May defer to consensus rather than push back',
        'Less aggressive in adversarial mode',
      ],
      recommendedRole: 'judge',
      chairmanSuitable: true,
      summary: 'Recommended for judge role. Excellent at weighing evidence and synthesizing multiple viewpoints objectively.',
    },
  },

  'google/gemini-1.5-flash': {
    id: 'google/gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    description: 'Fast, cost-effective Gemini model.',
    contextLength: 1000000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 0.075,
      completionPerMillion: 0.30,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'budget',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 5,
      strengths: [
        'Very low cost',
        'Large context window',
        'Fast responses',
      ],
      weaknesses: [
        'Reduced reasoning depth',
        'Higher error rate on complex legal questions',
        'Not suitable for adversarial analysis',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended for legal council. Insufficient reasoning depth for deliberation tasks.',
    },
  },

  // ============================================================================
  // XAI MODELS
  // ============================================================================

  'x-ai/grok-2': {
    id: 'x-ai/grok-2',
    name: 'Grok 2',
    provider: 'x-ai',
    description: 'xAI\'s Grok 2 model with strong reasoning.',
    contextLength: 131072,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 2.00,
      completionPerMillion: 10.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 7,
      strengths: [
        'Strong contrarian thinking',
        'Less prone to consensus-seeking',
        'Good at identifying unconventional arguments',
        'Willing to take unpopular positions',
      ],
      weaknesses: [
        'Can be overly aggressive/contrarian',
        'May push back unnecessarily',
        'Less refined than Claude for synthesis',
        'Newer model with less track record',
      ],
      recommendedRole: 'contrarian',
      chairmanSuitable: false,
      summary: 'Excellent contrarian. Assign to Seat D for devil\'s advocate role. Will challenge consensus and find weaknesses others miss.',
    },
  },

  // Hypothetical Grok 4.1 (from handoff)
  'x-ai/grok-4.1': {
    id: 'x-ai/grok-4.1',
    name: 'Grok 4.1',
    provider: 'x-ai',
    description: 'xAI\'s latest Grok model with enhanced reasoning.',
    contextLength: 200000,
    maxOutputTokens: 16384,
    pricing: {
      promptPerMillion: 3.00,
      completionPerMillion: 12.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'frontier',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 8,
      strengths: [
        'Best-in-class contrarian analysis',
        'Excellent at stress testing arguments',
        'Unafraid to identify fatal flaws',
        'Strong adversarial examination',
        'Good at opposing counsel simulation',
      ],
      weaknesses: [
        'May be too aggressive for some analyses',
        'Less suited for neutral synthesis',
      ],
      recommendedRole: 'contrarian',
      chairmanSuitable: false,
      summary: 'Top choice for contrarian/Seat D. Will ruthlessly stress-test your position and identify weaknesses.',
    },
  },

  // ============================================================================
  // MISTRAL MODELS
  // ============================================================================

  'mistralai/mistral-large': {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'mistralai',
    description: 'Mistral\'s flagship model with strong reasoning.',
    contextLength: 128000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 2.00,
      completionPerMillion: 6.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: true,
    councilAnalysis: {
      councilScore: 7,
      strengths: [
        'Cost-effective alternative to frontier models',
        'Good structured output',
        'Solid reasoning capabilities',
        'Efficient token usage',
      ],
      weaknesses: [
        'Less depth than Claude or GPT-5 on complex issues',
        'May miss subtle legal distinctions',
        'Less established for legal tasks',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: true,
      summary: 'Good budget-conscious option. Can serve any role but excels as cost-effective generalist.',
    },
  },

  'mistralai/codestral-latest': {
    id: 'mistralai/codestral-latest',
    name: 'Codestral',
    provider: 'mistralai',
    description: 'Mistral\'s code-focused model.',
    contextLength: 32000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 0.30,
      completionPerMillion: 0.90,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'standard',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 3,
      strengths: [
        'Good for code-related legal issues',
        'Low cost',
      ],
      weaknesses: [
        'Optimized for code, not legal reasoning',
        'Limited context window',
        'Not designed for deliberation tasks',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended. Code-focused model unsuitable for legal council.',
    },
  },

  // ============================================================================
  // COHERE MODELS
  // ============================================================================

  'cohere/command-r-plus': {
    id: 'cohere/command-r-plus',
    name: 'Command R+',
    provider: 'cohere',
    description: 'Cohere\'s flagship retrieval-augmented model.',
    contextLength: 128000,
    maxOutputTokens: 4096,
    pricing: {
      promptPerMillion: 2.50,
      completionPerMillion: 10.00,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 6,
      strengths: [
        'Strong RAG/retrieval capabilities',
        'Good citation handling',
        'Cost-effective',
      ],
      weaknesses: [
        'Less capable reasoning than Claude/GPT',
        'Limited adversarial thinking',
        'Not ideal for complex deliberation',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Consider for RAG-heavy tasks only. Not recommended as primary council member.',
    },
  },

  // ============================================================================
  // META MODELS
  // ============================================================================

  'meta-llama/llama-3.1-405b-instruct': {
    id: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'meta-llama',
    description: 'Meta\'s largest open model.',
    contextLength: 131072,
    maxOutputTokens: 4096,
    pricing: {
      promptPerMillion: 2.70,
      completionPerMillion: 2.70,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'flagship',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 6,
      strengths: [
        'Large parameter count',
        'Open source (can self-host)',
        'Good general reasoning',
      ],
      weaknesses: [
        'Less refined than Claude/GPT for legal tasks',
        'JSON mode less reliable',
        'Higher hallucination rate',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended for legal council. Consider if self-hosting is required.',
    },
  },

  'meta-llama/llama-3.1-70b-instruct': {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'meta-llama',
    description: 'Mid-size Llama model.',
    contextLength: 131072,
    maxOutputTokens: 4096,
    pricing: {
      promptPerMillion: 0.52,
      completionPerMillion: 0.75,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'standard',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 5,
      strengths: [
        'Good cost/performance ratio',
        'Open source',
      ],
      weaknesses: [
        'Insufficient for legal deliberation',
        'Higher error rates',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Not recommended for legal council.',
    },
  },

  // ============================================================================
  // DEEPSEEK MODELS
  // ============================================================================

  'deepseek/deepseek-r1': {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    description: 'DeepSeek\'s reasoning-focused model.',
    contextLength: 64000,
    maxOutputTokens: 8192,
    pricing: {
      promptPerMillion: 0.55,
      completionPerMillion: 2.19,
    },
    capabilities: {
      functionCalling: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      systemPrompt: true,
    },
    tier: 'standard',
    legalCouncilRecommended: false,
    councilAnalysis: {
      councilScore: 6,
      strengths: [
        'Very cost-effective',
        'Good reasoning for price',
        'Improving rapidly',
      ],
      weaknesses: [
        'Limited context window',
        'Less tested for legal applications',
        'May have data residency concerns',
      ],
      recommendedRole: 'generalist',
      chairmanSuitable: false,
      summary: 'Promising budget option but not yet recommended for legal council.',
    },
  },
};

/**
 * Get recommended council configuration
 */
export function getRecommendedCouncilConfig(): {
  seatA: string;
  seatB: string;
  seatC: string;
  seatD: string;
  chairman: string;
  rationale: string;
} {
  return {
    seatA: 'anthropic/claude-sonnet-4',
    seatB: 'openai/gpt-5.2',
    seatC: 'google/gemini-3-pro',
    seatD: 'x-ai/grok-4.1',
    chairman: 'anthropic/claude-sonnet-4',
    rationale: `
Recommended configuration balances capabilities:
- Seat A (Lead Analyst): Claude Sonnet 4 - Best overall reasoning and instruction compliance
- Seat B (Red Team): GPT-5.2 - Aggressive weakness identification
- Seat C (Judge): Gemini 3 Pro - Objective weighing with massive context
- Seat D (Contrarian): Grok 4.1 - Devil's advocate, stress testing
- Chairman: Claude Sonnet 4 - Excellent synthesis and dissent preservation

Alternative configurations:
- Budget: Replace with Mistral Large, Gemini Flash (reduced capability)
- Maximum: Use Claude 3 Opus as chairman for deepest synthesis
- Speed: Use Claude Haiku for Seat D if latency critical (not recommended)
`.trim(),
  };
}
