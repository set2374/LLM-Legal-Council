/**
 * Model Selector for LLM Legal Council
 *
 * Provides utilities for selecting and configuring council models.
 * Fetches latest models from OpenRouter on app startup.
 */

import {
  OpenRouterModel,
  CouncilConfiguration,
  ModelSelectorOptions,
  CouncilAnalysis,
} from './types.js';
import { getOpenRouterModels, getCuratedModels } from './openrouter-client.js';
import { CURATED_MODEL_ANALYSIS, getRecommendedCouncilConfig } from './curated-analysis.js';

/**
 * Model Selector class - main entry point for model selection
 */
export class ModelSelector {
  private models: OpenRouterModel[] = [];
  private loaded: boolean = false;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Initialize the selector by fetching models from OpenRouter
   * Call this when the app starts
   */
  async initialize(forceRefresh: boolean = false): Promise<void> {
    try {
      this.models = await getOpenRouterModels(this.apiKey, forceRefresh);

      // Overlay curated analysis on fetched models
      this.models = this.models.map(model => {
        const curated = CURATED_MODEL_ANALYSIS[model.id];
        if (curated?.councilAnalysis) {
          return {
            ...model,
            councilAnalysis: curated.councilAnalysis,
            legalCouncilRecommended: curated.legalCouncilRecommended,
          };
        }
        return model;
      });

      this.loaded = true;
    } catch (error) {
      console.warn('Failed to fetch models, using curated list:', error);
      this.models = getCuratedModels();
      this.loaded = true;
    }
  }

  /**
   * Get all available models
   */
  getAllModels(): OpenRouterModel[] {
    if (!this.loaded) {
      console.warn('ModelSelector not initialized, using curated fallback');
      return getCuratedModels();
    }
    return this.models;
  }

  /**
   * Filter models based on options
   */
  filterModels(options: ModelSelectorOptions = {}): OpenRouterModel[] {
    let filtered = this.getAllModels();

    // Filter by tier
    if (options.tiers && options.tiers.length > 0) {
      filtered = filtered.filter(m => options.tiers!.includes(m.tier));
    }

    // Filter by minimum context length
    if (options.minContextLength) {
      filtered = filtered.filter(m => m.contextLength >= options.minContextLength!);
    }

    // Filter by max price
    if (options.maxPricePerMillion) {
      filtered = filtered.filter(m => {
        const avgPrice = (m.pricing.promptPerMillion + m.pricing.completionPerMillion) / 2;
        return avgPrice <= options.maxPricePerMillion!;
      });
    }

    // Filter by council recommendation
    if (options.councilRecommendedOnly) {
      filtered = filtered.filter(m => m.legalCouncilRecommended);
    }

    // Filter by chairman suitability
    if (options.chairmanSuitableOnly) {
      filtered = filtered.filter(m => m.councilAnalysis?.chairmanSuitable);
    }

    // Filter by required capabilities
    if (options.requiredCapabilities) {
      filtered = filtered.filter(m => {
        const caps = options.requiredCapabilities!;
        if (caps.functionCalling && !m.capabilities.functionCalling) return false;
        if (caps.jsonMode && !m.capabilities.jsonMode) return false;
        if (caps.vision && !m.capabilities.vision) return false;
        if (caps.streaming && !m.capabilities.streaming) return false;
        if (caps.systemPrompt && !m.capabilities.systemPrompt) return false;
        return true;
      });
    }

    return filtered;
  }

  /**
   * Get models recommended for a specific role
   */
  getModelsForRole(role: CouncilAnalysis['recommendedRole']): OpenRouterModel[] {
    return this.getAllModels()
      .filter(m => m.councilAnalysis?.recommendedRole === role)
      .sort((a, b) => (b.councilAnalysis?.councilScore || 0) - (a.councilAnalysis?.councilScore || 0));
  }

  /**
   * Get models suitable for chairman
   */
  getChairmanModels(): OpenRouterModel[] {
    return this.getAllModels()
      .filter(m => m.councilAnalysis?.chairmanSuitable)
      .sort((a, b) => (b.councilAnalysis?.councilScore || 0) - (a.councilAnalysis?.councilScore || 0));
  }

  /**
   * Get a specific model by ID
   */
  getModel(id: string): OpenRouterModel | undefined {
    return this.getAllModels().find(m => m.id === id);
  }

  /**
   * Get recommended council configuration
   */
  getRecommendedConfig(): CouncilConfiguration & { rationale: string } {
    return getRecommendedCouncilConfig();
  }

  /**
   * Validate a council configuration
   */
  validateConfig(config: CouncilConfiguration): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if all models exist
    const seats = [
      { name: 'Seat A', id: config.seatA },
      { name: 'Seat B', id: config.seatB },
      { name: 'Seat C', id: config.seatC },
      { name: 'Chairman', id: config.chairman },
    ];

    if (config.seatD) {
      seats.push({ name: 'Seat D', id: config.seatD });
    }

    for (const seat of seats) {
      const model = this.getModel(seat.id);
      if (!model) {
        errors.push(`${seat.name}: Model "${seat.id}" not found in available models`);
        continue;
      }

      // Check council suitability
      if (!model.legalCouncilRecommended) {
        warnings.push(`${seat.name}: "${model.name}" is not recommended for legal council`);
      }

      // Check capabilities
      if (!model.capabilities.jsonMode) {
        warnings.push(`${seat.name}: "${model.name}" may not support JSON mode - add to COUNCIL_JSON_FALLBACK_MODELS`);
      }

      if (!model.capabilities.functionCalling) {
        warnings.push(`${seat.name}: "${model.name}" does not support function calling - cannot use council tools`);
      }

      // Check chairman suitability
      if (seat.name === 'Chairman' && !model.councilAnalysis?.chairmanSuitable) {
        warnings.push(`Chairman: "${model.name}" is not recommended for chairman role`);
      }

      // Check for GPT-4o (explicitly excluded)
      if (seat.id === 'openai/gpt-4o') {
        errors.push(`${seat.name}: GPT-4o is explicitly excluded from Legal Council - use GPT-5.2 instead`);
      }
    }

    // Check for duplicate models (allowed but warn)
    const modelIds = seats.map(s => s.id);
    const duplicates = modelIds.filter((id, i) => modelIds.indexOf(id) !== i);
    if (duplicates.length > 0) {
      warnings.push(`Duplicate models in council: ${[...new Set(duplicates)].join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Format model for display
   */
  formatModelDisplay(model: OpenRouterModel): string {
    const analysis = model.councilAnalysis;
    const score = analysis?.councilScore ? `[${analysis.councilScore}/10]` : '';
    const role = analysis?.recommendedRole ? `(${analysis.recommendedRole})` : '';
    const chairman = analysis?.chairmanSuitable ? ' 👑' : '';
    const recommended = model.legalCouncilRecommended ? ' ✓' : '';

    const price = `$${model.pricing.promptPerMillion.toFixed(2)}/$${model.pricing.completionPerMillion.toFixed(2)} per M`;
    const context = `${(model.contextLength / 1000).toFixed(0)}K ctx`;

    return `${model.id}${recommended}${chairman}
    ${model.name} ${score} ${role}
    ${price} | ${context}
    ${analysis?.summary || model.description}`;
  }

  /**
   * Get pricing summary for a configuration
   */
  getConfigPricingSummary(config: CouncilConfiguration): {
    estimatedCostPerDeliberation: number;
    breakdown: Record<string, { promptCost: number; completionCost: number }>;
  } {
    // Estimate tokens per deliberation
    // Stage 1: ~2000 prompt + ~1500 completion per model
    // Stage 2: ~4000 prompt + ~500 completion per model
    // Stage 3: ~6000 prompt + ~2000 completion for chairman
    const STAGE1_PROMPT = 2000;
    const STAGE1_COMPLETION = 1500;
    const STAGE2_PROMPT = 4000;
    const STAGE2_COMPLETION = 500;
    const STAGE3_PROMPT = 6000;
    const STAGE3_COMPLETION = 2000;

    const breakdown: Record<string, { promptCost: number; completionCost: number }> = {};
    let totalCost = 0;

    const councilSeats = [config.seatA, config.seatB, config.seatC];
    if (config.seatD) councilSeats.push(config.seatD);

    for (const seatId of councilSeats) {
      const model = this.getModel(seatId);
      if (!model) continue;

      const stage1PromptCost = (STAGE1_PROMPT / 1_000_000) * model.pricing.promptPerMillion;
      const stage1CompletionCost = (STAGE1_COMPLETION / 1_000_000) * model.pricing.completionPerMillion;
      const stage2PromptCost = (STAGE2_PROMPT / 1_000_000) * model.pricing.promptPerMillion;
      const stage2CompletionCost = (STAGE2_COMPLETION / 1_000_000) * model.pricing.completionPerMillion;

      const promptCost = stage1PromptCost + stage2PromptCost;
      const completionCost = stage1CompletionCost + stage2CompletionCost;

      breakdown[seatId] = { promptCost, completionCost };
      totalCost += promptCost + completionCost;
    }

    // Chairman (Stage 3)
    const chairmanModel = this.getModel(config.chairman);
    if (chairmanModel) {
      const promptCost = (STAGE3_PROMPT / 1_000_000) * chairmanModel.pricing.promptPerMillion;
      const completionCost = (STAGE3_COMPLETION / 1_000_000) * chairmanModel.pricing.completionPerMillion;
      breakdown[`${config.chairman} (chairman)`] = { promptCost, completionCost };
      totalCost += promptCost + completionCost;
    }

    return {
      estimatedCostPerDeliberation: totalCost,
      breakdown,
    };
  }
}

/**
 * Create and initialize a model selector
 */
export async function createModelSelector(apiKey?: string): Promise<ModelSelector> {
  const selector = new ModelSelector(apiKey);
  await selector.initialize();
  return selector;
}

// Export types for consumers
export type { OpenRouterModel, CouncilConfiguration, ModelSelectorOptions };
