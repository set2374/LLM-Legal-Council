/**
 * Tool Definitions for AI Legal Council
 */

import { z } from 'zod';

/**
 * Convert Zod schema to JSON Schema for OpenRouter/OpenAI tool definitions
 * This is a simplified converter that handles common cases
 */
export function zodToJsonSchema(schema: z.ZodObject<any>): object {
  const shape = schema.shape;
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = zodTypeToJsonSchema(zodType);
    
    // Check if field is required (not optional)
    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false
  };
}

function zodTypeToJsonSchema(zodType: z.ZodTypeAny): object {
  // Handle optional wrapper
  if (zodType instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(zodType.unwrap());
  }

  // Handle string
  if (zodType instanceof z.ZodString) {
    const schema: any = { type: 'string' };
    if (zodType.description) schema.description = zodType.description;
    return schema;
  }

  // Handle number
  if (zodType instanceof z.ZodNumber) {
    const schema: any = { type: 'number' };
    if (zodType.description) schema.description = zodType.description;
    return schema;
  }

  // Handle boolean
  if (zodType instanceof z.ZodBoolean) {
    const schema: any = { type: 'boolean' };
    if (zodType.description) schema.description = zodType.description;
    return schema;
  }

  // Handle array
  if (zodType instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodTypeToJsonSchema(zodType.element)
    };
  }

  // Handle enum
  if (zodType instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: zodType.options
    };
  }

  // Default fallback
  return { type: 'string' };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  jsonSchema: object;  // Pre-computed JSON Schema for OpenRouter
  execute: (args: any, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  modelId: string;
  sessionId: string;
  projectId?: string;
  jurisdiction?: string;
  apiKeys?: {
    courtlistener?: string;
    perplexity?: string;
    ragWorker?: string;
    ragWorkerUrl?: string;
  };
}

/**
 * 1. SEARCH PROJECT FILES (RAG / Cloudflare Worker)
 * Priority 1 - Always search project files first
 */
export const SearchProjectFilesSchema = z.object({
  query: z.string().describe('The specific question to answer from the project files'),
  topK: z.number().optional().describe('Number of results to return (default: 5)')
});

/**
 * 2. SEARCH CASE LAW (CourtListener)
 * Priority 2 - Primary case law research
 */
export const SearchCaseLawSchema = z.object({
  query: z.string().describe('The legal issue or search terms'),
  jurisdiction: z.string().optional().describe('Filter by jurisdiction (e.g., "ny", "cal", "scotus")')
});

/**
 * 3. SEARCH STATUTES (Cornell LII)
 * Priority 2 - Statutory research
 */
export const SearchStatutesSchema = z.object({
  query: z.string().describe('Search terms for statutes or regulations'),
  source: z.enum(['usc', 'cfr', 'constitution', 'ucc']).optional().describe('Specific source to search')
});

/**
 * 4. VALIDATE CITATION (CourtListener lookup)
 */
export const ValidateCitationSchema = z.object({
  citation: z.string().describe('The standard legal citation (e.g., "301 A.D.2d 45", "123 S.Ct. 456")')
});

/**
 * 5. WEB SEARCH (Perplexity - General Internet)
 * Priority 3 - Use after authoritative legal sources
 */
export const WebSearchSchema = z.object({
  query: z.string().describe('Search query for general web info, news, or non-legal facts')
});

// Legacy alias for backward compatibility
export const ReadProjectFileSchema = SearchProjectFilesSchema;
