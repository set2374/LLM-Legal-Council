/**
 * NotebookLM Podcast API Types
 *
 * Types for Google Cloud Discovery Engine Podcast API integration.
 * @see https://cloud.google.com/agentspace/notebooklm-enterprise/docs/podcast-api
 */

// ============================================================================
// API Request Types
// ============================================================================

/**
 * Podcast generation configuration
 */
export interface PodcastConfig {
  /** Focus prompt - suggests what the podcast should emphasize */
  focus?: string;

  /** Podcast length: SHORT (4-5 min) or STANDARD (~10 min) */
  length: 'SHORT' | 'STANDARD';

  /** Language code (BCP47 format, e.g., 'en-US', 'es', 'fr') */
  languageCode?: string;
}

/**
 * Context element for podcast generation
 * Content can be text, or references to other media
 */
export interface PodcastContext {
  /** Plain text content */
  text?: string;

  /** Inline data (base64 encoded with mime type) */
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

/**
 * Request body for podcast generation
 */
export interface GeneratePodcastRequest {
  /** Podcast configuration */
  podcastConfig: PodcastConfig;

  /** Source content - array of context elements (max 100k tokens total) */
  contexts: PodcastContext[];

  /** Podcast title (for metadata) */
  title?: string;

  /** Podcast description (for metadata) */
  description?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Long-running operation response from podcast generation
 */
export interface PodcastOperation {
  /** Operation name (used for polling and download) */
  name: string;

  /** Operation metadata */
  metadata?: {
    '@type': string;
    state?: PodcastOperationState;
    createTime?: string;
    updateTime?: string;
    progressPercentage?: number;
  };

  /** Whether the operation is complete */
  done: boolean;

  /** Error information if operation failed */
  error?: {
    code: number;
    message: string;
    details?: unknown[];
  };

  /** Response when operation completes successfully */
  response?: {
    '@type': string;
    podcast?: PodcastResource;
  };
}

/**
 * Podcast operation states
 */
export type PodcastOperationState =
  | 'STATE_UNSPECIFIED'
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Generated podcast resource
 */
export interface PodcastResource {
  /** Resource name */
  name: string;

  /** Podcast title */
  title?: string;

  /** Podcast description */
  description?: string;

  /** Audio duration in seconds */
  durationSeconds?: number;

  /** Creation timestamp */
  createTime?: string;
}

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * NotebookLM client configuration
 */
export interface NotebookLMConfig {
  /** Google Cloud project ID */
  projectId: string;

  /**
   * Authentication method:
   * - 'gcloud': Use gcloud CLI auth (development)
   * - 'service-account': Use service account JSON key
   * - 'token': Use provided access token directly
   */
  authMethod: 'gcloud' | 'service-account' | 'token';

  /** Service account key file path (for 'service-account' auth) */
  serviceAccountKeyPath?: string;

  /** Access token (for 'token' auth) */
  accessToken?: string;

  /** API region: 'us', 'eu', or 'global' */
  region?: 'us' | 'eu' | 'global';

  /** Default podcast length */
  defaultLength?: 'SHORT' | 'STANDARD';

  /** Default language code */
  defaultLanguage?: string;
}

// ============================================================================
// Deliberation Conversion Types
// ============================================================================

/**
 * Options for converting a deliberation to podcast content
 */
export interface DeliberationToPodcastOptions {
  /** Podcast title (defaults to "Legal Council Deliberation") */
  title?: string;

  /** Custom description (auto-generated if not provided) */
  description?: string;

  /** Focus areas to emphasize in the podcast */
  focus?: string;

  /** Podcast length */
  length?: 'SHORT' | 'STANDARD';

  /** Language code */
  languageCode?: string;

  /** Include audit trail in podcast content */
  includeAudit?: boolean;

  /** Include dissenting views */
  includeDissent?: boolean;

  /** Include action items */
  includeActionItems?: boolean;

  /** Include risk assessment details */
  includeRiskDetails?: boolean;
}

/**
 * Result of podcast generation
 */
export interface PodcastGenerationResult {
  /** Whether generation was successful */
  success: boolean;

  /** Operation name (for tracking) */
  operationName?: string;

  /** Local file path where audio was saved (if downloaded) */
  audioFilePath?: string;

  /** Audio data as buffer (if requested) */
  audioBuffer?: Buffer;

  /** Duration in seconds */
  durationSeconds?: number;

  /** Error message if failed */
  error?: string;

  /** Generation metadata */
  metadata?: {
    title: string;
    description: string;
    generatedAt: string;
    sourceSessionId: string;
    tokensUsed?: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * NotebookLM API error
 */
export class NotebookLMError extends Error {
  constructor(
    message: string,
    public code?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'NotebookLMError';
  }
}

/**
 * Authentication error
 */
export class NotebookLMAuthError extends NotebookLMError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'NotebookLMAuthError';
  }
}

/**
 * Content too large error
 */
export class NotebookLMContentTooLargeError extends NotebookLMError {
  constructor(
    public estimatedTokens: number,
    public maxTokens: number = 100000
  ) {
    super(`Content exceeds maximum token limit. Estimated: ${estimatedTokens}, Max: ${maxTokens}`);
    this.name = 'NotebookLMContentTooLargeError';
    this.code = 400;
  }
}
