/**
 * OpenRouter Model Fetcher
 *
 * Fetches the latest model list from OpenRouter API on app startup.
 * Falls back to curated list if API is unavailable.
 */

import { OpenRouterModel, ModelPricing, ModelCapabilities } from './types.js';
import { CURATED_MODEL_ANALYSIS } from './curated-analysis.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Raw model response from OpenRouter API
 */
interface OpenRouterApiModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;      // Cost per token as string (e.g., "0.000003")
    completion: string;  // Cost per token as string
    request?: string;    // Per-request fee if applicable
    image?: string;      // Per-image fee if applicable
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

interface OpenRouterApiResponse {
  data: OpenRouterApiModel[];
}

/**
 * Fetch all models from OpenRouter API
 */
export async function fetchOpenRouterModels(apiKey?: string): Promise<OpenRouterModel[]> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // API key optional for models endpoint but may improve rate limits
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(OPENROUTER_MODELS_URL, { headers });

    if (!response.ok) {
      throw new Error(`OpenRouter API returned ${response.status}`);
    }

    const data = await response.json() as OpenRouterApiResponse;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    return data.data.map(transformApiModel);
  } catch (error) {
    console.warn('Failed to fetch models from OpenRouter:', error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Transform OpenRouter API model to our internal format
 */
function transformApiModel(apiModel: OpenRouterApiModel): OpenRouterModel {
  const provider = apiModel.id.split('/')[0] || 'unknown';

  // Parse pricing (API returns per-token, we want per-million)
  const promptPerToken = parseFloat(apiModel.pricing.prompt) || 0;
  const completionPerToken = parseFloat(apiModel.pricing.completion) || 0;

  const pricing: ModelPricing = {
    promptPerMillion: promptPerToken * 1_000_000,
    completionPerMillion: completionPerToken * 1_000_000,
    requestFee: apiModel.pricing.request ? parseFloat(apiModel.pricing.request) : undefined,
  };

  // Infer capabilities from model characteristics
  const capabilities = inferCapabilities(apiModel);

  // Determine tier based on pricing and provider
  const tier = inferTier(apiModel.id, pricing);

  // Get curated analysis if available
  const curatedAnalysis = CURATED_MODEL_ANALYSIS[apiModel.id];

  return {
    id: apiModel.id,
    name: apiModel.name,
    provider,
    description: apiModel.description || '',
    contextLength: apiModel.context_length,
    maxOutputTokens: apiModel.top_provider?.max_completion_tokens,
    pricing,
    capabilities,
    architecture: apiModel.architecture?.modality,
    tier,
    legalCouncilRecommended: curatedAnalysis?.councilAnalysis?.councilScore >= 7 || false,
    councilAnalysis: curatedAnalysis?.councilAnalysis,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Infer model capabilities from API data
 */
function inferCapabilities(apiModel: OpenRouterApiModel): ModelCapabilities {
  const id = apiModel.id.toLowerCase();
  const modality = apiModel.architecture?.modality?.toLowerCase() || '';

  // Most modern models support these features
  const isChatModel = apiModel.architecture?.instruct_type !== undefined;
  const isVisionModel = modality.includes('vision') || modality.includes('multimodal') ||
    id.includes('vision') || id.includes('4o') || id.includes('gemini');

  // Function calling support by known models
  const supportsFunctions =
    id.includes('claude') ||
    id.includes('gpt-4') ||
    id.includes('gpt-3.5') ||
    id.includes('gemini') ||
    id.includes('mistral') && !id.includes('tiny') ||
    id.includes('command');

  // JSON mode support
  const supportsJson = supportsFunctions || id.includes('json');

  return {
    functionCalling: supportsFunctions,
    jsonMode: supportsJson,
    vision: isVisionModel,
    streaming: true, // Most models support streaming
    systemPrompt: isChatModel,
  };
}

/**
 * Infer model tier from id and pricing
 */
function inferTier(id: string, pricing: ModelPricing): OpenRouterModel['tier'] {
  const lowerid = id.toLowerCase();
  const avgPrice = (pricing.promptPerMillion + pricing.completionPerMillion) / 2;

  // Free models
  if (avgPrice === 0) return 'free';

  // Frontier models (latest, most capable)
  if (
    lowerid.includes('claude-3-opus') ||
    lowerid.includes('claude-sonnet-4') ||
    lowerid.includes('gpt-4o') && !lowerid.includes('mini') ||
    lowerid.includes('gpt-4-turbo') ||
    lowerid.includes('gpt-5') ||
    lowerid.includes('gemini-1.5-pro') ||
    lowerid.includes('gemini-2') ||
    lowerid.includes('gemini-3') ||
    lowerid.includes('opus')
  ) {
    return 'frontier';
  }

  // Flagship models (previous generation top models)
  if (
    lowerid.includes('claude-3-sonnet') ||
    lowerid.includes('claude-3.5-sonnet') ||
    lowerid.includes('gpt-4') && !lowerid.includes('mini') ||
    lowerid.includes('gemini-pro') ||
    lowerid.includes('command-r-plus') ||
    avgPrice > 10
  ) {
    return 'flagship';
  }

  // Budget models
  if (avgPrice < 1 || lowerid.includes('mini') || lowerid.includes('flash') || lowerid.includes('haiku')) {
    return 'budget';
  }

  return 'standard';
}

/**
 * Cache for fetched models
 */
let modelsCache: OpenRouterModel[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get models with caching
 */
export async function getOpenRouterModels(
  apiKey?: string,
  forceRefresh: boolean = false
): Promise<OpenRouterModel[]> {
  const now = Date.now();

  if (!forceRefresh && modelsCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return modelsCache;
  }

  try {
    modelsCache = await fetchOpenRouterModels(apiKey);
    cacheTimestamp = now;
    return modelsCache;
  } catch {
    // Return cached data if available, even if stale
    if (modelsCache) {
      console.warn('Using cached model data');
      return modelsCache;
    }

    // Fall back to curated list
    console.warn('Using curated fallback model list');
    return getCuratedModels();
  }
}

/**
 * Get curated fallback models (when API unavailable)
 */
export function getCuratedModels(): OpenRouterModel[] {
  return Object.values(CURATED_MODEL_ANALYSIS);
}

/**
 * Clear the model cache
 */
export function clearModelCache(): void {
  modelsCache = null;
  cacheTimestamp = 0;
}
