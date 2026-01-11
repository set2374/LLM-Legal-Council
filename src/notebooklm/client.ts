/**
 * NotebookLM Podcast API Client
 *
 * Client for Google Cloud Discovery Engine Podcast API.
 * Generates AI podcast-style audio overviews from text content.
 *
 * @see https://cloud.google.com/agentspace/notebooklm-enterprise/docs/podcast-api
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  NotebookLMConfig,
  GeneratePodcastRequest,
  PodcastOperation,
  PodcastGenerationResult,
  NotebookLMError,
  NotebookLMAuthError,
  PodcastOperationState,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const API_BASE_URLS: Record<string, string> = {
  us: 'https://us-discoveryengine.googleapis.com',
  eu: 'https://eu-discoveryengine.googleapis.com',
  global: 'https://discoveryengine.googleapis.com',
};

const API_VERSION = 'v1';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes

// ============================================================================
// NotebookLM Client
// ============================================================================

/**
 * Client for Google Cloud NotebookLM Podcast API
 */
export class NotebookLMClient {
  private config: NotebookLMConfig;
  private cachedToken?: string;
  private tokenExpiry?: Date;

  constructor(config: NotebookLMConfig) {
    this.config = {
      region: 'global',
      defaultLength: 'STANDARD',
      defaultLanguage: 'en-US',
      ...config,
    };
  }

  /**
   * Get the API base URL for the configured region
   */
  private getBaseUrl(): string {
    return API_BASE_URLS[this.config.region || 'global'];
  }

  /**
   * Get an access token for API authentication
   */
  private async getAccessToken(): Promise<string> {
    // If we have a cached token that's still valid, use it
    if (this.cachedToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.cachedToken;
    }

    switch (this.config.authMethod) {
      case 'token':
        if (!this.config.accessToken) {
          throw new NotebookLMAuthError('Access token not provided');
        }
        return this.config.accessToken;

      case 'gcloud':
        return this.getGcloudToken();

      case 'service-account':
        return this.getServiceAccountToken();

      default:
        throw new NotebookLMAuthError(`Unknown auth method: ${this.config.authMethod}`);
    }
  }

  /**
   * Get token using gcloud CLI
   */
  private getGcloudToken(): string {
    try {
      const token = execSync('gcloud auth print-access-token', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      // Cache for 50 minutes (tokens typically last 60 minutes)
      this.cachedToken = token;
      this.tokenExpiry = new Date(Date.now() + 50 * 60 * 1000);

      return token;
    } catch (error) {
      throw new NotebookLMAuthError(
        'Failed to get gcloud access token. Ensure gcloud CLI is installed and authenticated. ' +
          'Run: gcloud auth login && gcloud auth application-default login'
      );
    }
  }

  /**
   * Get token using service account
   */
  private async getServiceAccountToken(): Promise<string> {
    if (!this.config.serviceAccountKeyPath) {
      throw new NotebookLMAuthError('Service account key path not provided');
    }

    // Read service account key
    const keyContent = fs.readFileSync(this.config.serviceAccountKeyPath, 'utf-8');
    const key = JSON.parse(keyContent);

    // Create JWT for token exchange
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    // Note: In production, use a proper JWT library
    // This is a simplified implementation
    const jwt = await this.signJwt(header, payload, key.private_key);

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) {
      throw new NotebookLMAuthError('Failed to exchange service account JWT for access token');
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return data.access_token;
  }

  /**
   * Sign a JWT (simplified - use a proper library in production)
   */
  private async signJwt(
    header: object,
    payload: object,
    privateKey: string
  ): Promise<string> {
    const crypto = await import('crypto');

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(privateKey, 'base64url');

    return `${signatureInput}.${signature}`;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/${API_VERSION}/${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorData: { error?: { message?: string; code?: number } } = {};
      try {
        errorData = JSON.parse(errorBody);
      } catch {
        // Ignore parse errors
      }

      if (response.status === 401 || response.status === 403) {
        throw new NotebookLMAuthError(
          errorData.error?.message || 'Authentication failed'
        );
      }

      throw new NotebookLMError(
        errorData.error?.message || `API request failed: ${response.status}`,
        response.status,
        errorData
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Generate a podcast from content
   *
   * @param request - Podcast generation request
   * @returns Long-running operation for tracking
   */
  async generatePodcast(request: GeneratePodcastRequest): Promise<PodcastOperation> {
    const endpoint = `projects/${this.config.projectId}/locations/${this.config.region || 'global'}/podcasts`;

    // Apply defaults - request values override defaults
    const fullRequest: GeneratePodcastRequest = {
      ...request,
      podcastConfig: {
        length: request.podcastConfig?.length || this.config.defaultLength || 'STANDARD',
        languageCode: request.podcastConfig?.languageCode || this.config.defaultLanguage || 'en-US',
        focus: request.podcastConfig?.focus,
      },
    };

    return this.request<PodcastOperation>('POST', endpoint, fullRequest);
  }

  /**
   * Get the status of a podcast generation operation
   */
  async getOperation(operationName: string): Promise<PodcastOperation> {
    return this.request<PodcastOperation>('GET', operationName);
  }

  /**
   * Poll operation until complete
   */
  async waitForOperation(
    operationName: string,
    options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (state: PodcastOperationState, progress?: number) => void;
    } = {}
  ): Promise<PodcastOperation> {
    const pollInterval = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const timeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const operation = await this.getOperation(operationName);

      if (options.onProgress && operation.metadata) {
        options.onProgress(
          operation.metadata.state || 'STATE_UNSPECIFIED',
          operation.metadata.progressPercentage
        );
      }

      if (operation.done) {
        if (operation.error) {
          throw new NotebookLMError(
            operation.error.message || 'Podcast generation failed',
            operation.error.code,
            operation.error.details
          );
        }
        return operation;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new NotebookLMError('Podcast generation timed out', 408);
  }

  /**
   * Download a generated podcast as MP3
   */
  async downloadPodcast(operationName: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/${API_VERSION}/${operationName}:download?alt=media`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new NotebookLMError(
        `Failed to download podcast: ${response.status}`,
        response.status
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generate and download a podcast (convenience method)
   */
  async generateAndDownload(
    request: GeneratePodcastRequest,
    options: {
      outputPath?: string;
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (state: PodcastOperationState, progress?: number) => void;
    } = {}
  ): Promise<PodcastGenerationResult> {
    try {
      // Start generation
      const operation = await this.generatePodcast(request);

      if (!operation.name) {
        throw new NotebookLMError('No operation name returned');
      }

      // Wait for completion
      const completedOp = await this.waitForOperation(operation.name, {
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
        onProgress: options.onProgress,
      });

      // Download the audio
      const audioBuffer = await this.downloadPodcast(operation.name);

      // Save to file if path provided
      let audioFilePath: string | undefined;
      if (options.outputPath) {
        const outputDir = path.dirname(options.outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(options.outputPath, audioBuffer);
        audioFilePath = options.outputPath;
      }

      return {
        success: true,
        operationName: operation.name,
        audioFilePath,
        audioBuffer,
        durationSeconds: completedOp.response?.podcast?.durationSeconds,
        metadata: {
          title: request.title || 'Untitled Podcast',
          description: request.description || '',
          generatedAt: new Date().toISOString(),
          sourceSessionId: '',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NotebookLM client from environment variables
 */
export function createNotebookLMClient(overrides?: Partial<NotebookLMConfig>): NotebookLMClient {
  const projectId = overrides?.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new NotebookLMError(
      'Google Cloud project ID is required. Set GOOGLE_CLOUD_PROJECT_ID environment variable.'
    );
  }

  // Determine auth method
  let authMethod: NotebookLMConfig['authMethod'] = 'gcloud';
  let accessToken: string | undefined;
  let serviceAccountKeyPath: string | undefined;

  if (process.env.NOTEBOOKLM_ACCESS_TOKEN) {
    authMethod = 'token';
    accessToken = process.env.NOTEBOOKLM_ACCESS_TOKEN;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    authMethod = 'service-account';
    serviceAccountKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  const config: NotebookLMConfig = {
    projectId,
    authMethod,
    accessToken,
    serviceAccountKeyPath,
    region: (process.env.NOTEBOOKLM_REGION as 'us' | 'eu' | 'global') || 'global',
    defaultLength: (process.env.NOTEBOOKLM_DEFAULT_LENGTH as 'SHORT' | 'STANDARD') || 'STANDARD',
    defaultLanguage: process.env.NOTEBOOKLM_DEFAULT_LANGUAGE || 'en-US',
    ...overrides,
  };

  return new NotebookLMClient(config);
}

/**
 * Validate NotebookLM configuration
 */
export function validateNotebookLMConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
    errors.push('GOOGLE_CLOUD_PROJECT_ID is required for NotebookLM integration');
  }

  const hasAuth =
    process.env.NOTEBOOKLM_ACCESS_TOKEN ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!hasAuth) {
    warnings.push(
      'No explicit auth configured. Will attempt to use gcloud CLI authentication. ' +
        'For production, set GOOGLE_APPLICATION_CREDENTIALS or NOTEBOOKLM_ACCESS_TOKEN.'
    );
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(keyPath)) {
      errors.push(`Service account key file not found: ${keyPath}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
