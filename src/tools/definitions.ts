/**
 * Tool Definitions for AI Legal Council
 */

import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (args: any, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  modelId: string;
  sessionId: string;
  projectId?: string;
  jurisdiction?: string;
}

/**
 * 1. SEARCH CASE LAW (CourtListener)
 */
export const SearchCaseLawSchema = z.object({
  query: z.string().describe('The legal issue or search terms'),
  jurisdiction: z.string().optional().describe('Filter by jurisdiction (e.g., "ny", "us_supreme")')
});

/**
 * 2. READ PROJECT FILE (RAG / Cloudflare)
 */
export const ReadProjectFileSchema = z.object({
  query: z.string().describe('The specific question to answer from the files'),
  filenames: z.array(z.string()).optional().describe('Specific files to limit search to')
});

/**
 * 3. VALIDATE CITATION (CourtListener / Shepardizing)
 */
export const ValidateCitationSchema = z.object({
  citation: z.string().describe('The standard legal citation (e.g., "301 A.D.2d 45")')
});

/**
 * 4. WEB SEARCH (General Internet)
 */
export const WebSearchSchema = z.object({
  query: z.string().describe('Search query for general web info')
});
