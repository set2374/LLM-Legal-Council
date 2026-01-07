/**
 * Model Selector Module - Entry Point
 *
 * Exports all model selection utilities for LLM Legal Council.
 */

export * from './types.js';
export * from './selector.js';
export * from './openrouter-client.js';
export { CURATED_MODEL_ANALYSIS, getRecommendedCouncilConfig } from './curated-analysis.js';
