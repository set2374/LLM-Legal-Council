/**
 * NotebookLM Integration Module
 *
 * Generate AI podcast-style audio overviews of legal council deliberations
 * using Google Cloud's NotebookLM Enterprise Podcast API.
 *
 * @example
 * ```typescript
 * import { createNotebookLMClient, deliberationToPodcastRequest } from 'llm-legal-council';
 *
 * // After running a deliberation...
 * const client = createNotebookLMClient();
 * const request = deliberationToPodcastRequest(deliberation, {
 *   title: 'Case Strategy Review',
 *   length: 'STANDARD',
 * });
 *
 * const result = await client.generateAndDownload(request, {
 *   outputPath: './podcast.mp3',
 *   onProgress: (state, progress) => console.log(`${state}: ${progress}%`),
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client
export {
  NotebookLMClient,
  createNotebookLMClient,
  validateNotebookLMConfig,
} from './client.js';

// Converter
export {
  deliberationToPodcastRequest,
  formatDeliberationContent,
  estimateTokenCount,
  willFitInTokenLimit,
} from './converter.js';

// Types
export type {
  PodcastConfig,
  PodcastContext,
  GeneratePodcastRequest,
  PodcastOperation,
  PodcastOperationState,
  PodcastResource,
  NotebookLMConfig,
  DeliberationToPodcastOptions,
  PodcastGenerationResult,
} from './types.js';

export {
  NotebookLMError,
  NotebookLMAuthError,
  NotebookLMContentTooLargeError,
} from './types.js';
