/**
 * OpenRouter API Client
 * 
 * Provides unified access to multiple LLM providers through OpenRouter.
 * Includes timeout handling, exponential backoff retries, and JSON mode support.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelResponse {
  content: string | unknown;  // String for text mode, parsed object for JSON mode
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface RequestOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  responseFormat?: object;  // JSON schema for structured output
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: object;
    };
  }>;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

const DEFAULT_TIMEOUT_MS = 120000;  // 2 minutes - LLMs can be slow
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 1000;

export class OpenRouterClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  /**
   * Query a model through OpenRouter with timeout and retry support
   */
  async queryModel(
    model: string, 
    messages: ChatMessage[],
    options: RequestOptions = {}
  ): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const {
      temperature = 0.3,  // Lower temp for structured legal analysis
      maxTokens = 4096,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxRetries = DEFAULT_MAX_RETRIES,
      responseFormat,
      tools,
      toolChoice
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(
          model,
          messages,
          temperature,
          maxTokens,
          timeoutMs,
          responseFormat,
          tools,
          toolChoice
        );
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Determine if we should retry
        const shouldRetry = this.isRetryableError(lastError, attempt, maxRetries);
        
        if (!shouldRetry) {
          throw lastError;
        }

        // Exponential backoff
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        await this.sleep(backoffMs);
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Execute a single API request with timeout
   */
  private async executeRequest(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    timeoutMs: number,
    responseFormat?: object,
    tools?: RequestOptions['tools'],
    toolChoice?: RequestOptions['toolChoice']
  ): Promise<ModelResponse> {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestBody: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      };

      // Add response_format for JSON mode if provided
      if (responseFormat) {
        requestBody.response_format = responseFormat;
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        if (toolChoice) {
          requestBody.tool_choice = toolChoice;
        }
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://legal-council.example.com',
          'X-Title': 'LLM Legal Council'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      // Handle specific error codes
      if (!response.ok) {
        const errorText = await response.text();
        const error = new OpenRouterError(
          `OpenRouter API error (${response.status}): ${errorText}`,
          response.status
        );
        throw error;
      }

      const data = await response.json() as {
        choices?: Array<{ 
          message: { 
            content: string | null;
            tool_calls?: ModelResponse['tool_calls']; 
          } 
        }>;
        model?: string;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from model');
      }

      return {
        content: data.choices[0].message.content || '', // Can be null if tool_calls present
        model: data.model || model,
        usage: data.usage,
        tool_calls: data.choices[0].message.tool_calls
      };

    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) {
      return false;
    }

    // Timeout errors are retryable
    if (error.name === 'AbortError') {
      return true;
    }

    // Rate limit (429) and server errors (5xx) are retryable
    if (error instanceof OpenRouterError) {
      const status = error.statusCode;
      return status === 429 || (status >= 500 && status < 600);
    }

    // Network errors are retryable
    if (error.message.includes('network') || error.message.includes('ECONNRESET')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Query multiple models in parallel
   */
  async queryMultiple(
    models: string[],
    messages: ChatMessage[],
    options: RequestOptions = {}
  ): Promise<Map<string, ModelResponse | Error>> {
    const results = new Map<string, ModelResponse | Error>();

    const promises = models.map(async (model) => {
      try {
        const response = await this.queryModel(model, messages, options);
        results.set(model, response);
      } catch (error) {
        results.set(model, error instanceof Error ? error : new Error(String(error)));
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Query with JSON mode - enforces structured output
   */
  async queryModelJson<T>(
    model: string,
    messages: ChatMessage[],
    jsonSchema: object,
    options: RequestOptions = {}
  ): Promise<{ content: T; model: string; usage?: ModelResponse['usage'] }> {
    const response = await this.queryModel(model, messages, {
      ...options,
      responseFormat: jsonSchema
    });

    // Parse the JSON response
    try {
      const parsed = JSON.parse(response.content as string) as T;
      return {
        content: parsed,
        model: response.model,
        usage: response.usage
      };
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
  }

  /**
   * Check if API is configured and accessible
   */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) {
      return { ok: false, message: 'API key not configured' };
    }

    try {
      await this.queryModel('openai/gpt-3.5-turbo', [
        { role: 'user', content: 'Reply with OK' }
      ], { maxTokens: 10, timeoutMs: 30000, maxRetries: 1 });
      
      return { ok: true, message: 'OpenRouter connection successful' };
    } catch (error) {
      return { 
        ok: false, 
        message: `OpenRouter connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}

/**
 * Custom error class with status code
 */
export class OpenRouterError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'OpenRouterError';
    this.statusCode = statusCode;
  }
}

/**
 * Factory function for creating OpenRouter client
 */
export function createOpenRouterClient(apiKey: string): OpenRouterClient {
  return new OpenRouterClient(apiKey);
}
