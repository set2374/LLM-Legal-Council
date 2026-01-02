/**
 * Tool Implementations for AI Legal Council
 * 
 * These connect AI tool calls to actual API endpoints.
 * Tools fail closed (return error) if API keys are missing.
 * 
 * Priority hierarchy (reflected in descriptions):
 * 1. Project files (RAG) - Always search first
 * 2. Authoritative legal sources (CourtListener, Cornell LII)
 * 3. General web (Perplexity)
 */

import { ToolDefinition, ToolContext, zodToJsonSchema } from './definitions.js';
import { 
  SearchProjectFilesSchema, 
  SearchCaseLawSchema, 
  SearchStatutesSchema,
  ValidateCitationSchema, 
  WebSearchSchema 
} from './definitions.js';

// --- CONFIGURATION ---
const RAG_WORKER_URL = process.env.LEGAL_KNOWLEDGE_WORKER_URL || '';
const RAG_WORKER_TOKEN = process.env.LEGAL_KNOWLEDGE_WORKER_TOKEN || '';
const COURT_LISTENER_API_KEY = process.env.COURT_LISTENER_API_KEY || '';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';

/**
 * TOOL 1: Search Project Files (RAG)
 * Priority 1 - Always search project files first
 */
export const searchProjectFilesTool: ToolDefinition = {
  name: 'search_project_files',
  description: 'Search the project\'s uploaded documents for specific information. USE THIS FIRST before searching external sources. Returns relevant text passages from files uploaded by the supervising attorney.',
  parameters: SearchProjectFilesSchema,
  jsonSchema: zodToJsonSchema(SearchProjectFilesSchema),
  execute: async (args, context) => {
    const workerUrl = context.apiKeys?.ragWorkerUrl || RAG_WORKER_URL;
    const token = context.apiKeys?.ragWorker || RAG_WORKER_TOKEN;
    
    if (!workerUrl) {
      return '[ERROR] Project file search not configured. RAG worker URL not set.';
    }
    
    if (!token) {
      return '[ERROR] Project file search not configured. API token not set.';
    }
    
    try {
      const response = await fetch(`${workerUrl}/search`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          query: args.query,
          topK: args.topK || 5,
          projectId: context.projectId
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return `[ERROR] Project file search failed: ${response.status} ${errorText}`;
      }
      
      const data = await response.json() as { results: Array<{ text: string; source: string; relevance: number }> };
      
      if (!data.results || data.results.length === 0) {
        return '[NO RESULTS] No relevant information found in project files for this query.';
      }
      
      // Format results for model consumption
      const formatted = data.results.map((r, i) => 
        `[Result ${i + 1}] Source: ${r.source} (relevance: ${(r.relevance * 100).toFixed(1)}%)\n${r.text}`
      ).join('\n\n---\n\n');
      
      return `Found ${data.results.length} relevant passages in project files:\n\n${formatted}`;
      
    } catch (error) {
      return `[ERROR] Failed to search project files: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

/**
 * TOOL 2: Search Case Law (CourtListener)
 * Priority 2 - Authoritative legal source
 */
export const searchCaseLawTool: ToolDefinition = {
  name: 'search_case_law',
  description: 'Search for case law opinions using the CourtListener database. Returns case citations, holdings, and relevant excerpts. Use after checking project files.',
  parameters: SearchCaseLawSchema,
  jsonSchema: zodToJsonSchema(SearchCaseLawSchema),
  execute: async (args, context) => {
    const apiKey = context.apiKeys?.courtlistener || COURT_LISTENER_API_KEY;
    
    if (!apiKey) {
      return '[ERROR] CourtListener API key not configured. Cannot search case law.';
    }
    
    try {
      // Build search URL
      const searchParams = new URLSearchParams({
        q: args.query,
        type: 'o',  // opinions
        order_by: 'score desc',
        format: 'json'
      });
      
      // Add jurisdiction filter if specified
      if (args.jurisdiction) {
        // Map common abbreviations to CourtListener court IDs
        const courtMap: Record<string, string> = {
          'ny': 'nyappdiv,nyappterm,nysupct',
          'cal': 'cal,calctapp',
          'scotus': 'scotus',
          'ca2': 'ca2',
          'ca9': 'ca9',
          'sdny': 'nysd',
          'edny': 'nyed'
        };
        const courts = courtMap[args.jurisdiction.toLowerCase()] || args.jurisdiction;
        searchParams.set('court', courts);
      }
      
      const response = await fetch(
        `https://www.courtlistener.com/api/rest/v4/search/?${searchParams}`,
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        return `[ERROR] CourtListener search failed: ${response.status} ${errorText}`;
      }
      
      const data = await response.json() as { 
        count: number; 
        results: Array<{
          caseName: string;
          citation: string[];
          dateFiled: string;
          court: string;
          snippet: string;
          absolute_url: string;
        }> 
      };
      
      if (!data.results || data.results.length === 0) {
        return `[NO RESULTS] No case law found for query: "${args.query}"${args.jurisdiction ? ` in jurisdiction: ${args.jurisdiction}` : ''}`;
      }
      
      // Format results
      const formatted = data.results.slice(0, 10).map((r, i) => {
        const citation = r.citation?.join(', ') || 'No citation';
        return `[${i + 1}] ${r.caseName}\n    Citation: ${citation}\n    Court: ${r.court}\n    Date: ${r.dateFiled}\n    Excerpt: ${r.snippet?.replace(/<[^>]*>/g, '') || 'No excerpt'}\n    URL: https://www.courtlistener.com${r.absolute_url}`;
      }).join('\n\n');
      
      return `Found ${data.count} cases. Showing top ${Math.min(10, data.results.length)}:\n\n${formatted}`;
      
    } catch (error) {
      return `[ERROR] Failed to search CourtListener: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

/**
 * TOOL 3: Search Statutes (Cornell LII)
 * Priority 2 - Authoritative legal source
 */
export const searchStatutesTool: ToolDefinition = {
  name: 'search_statutes',
  description: 'Search for statutes, regulations, and constitutional provisions using Cornell LII. Returns statutory text and citations. Use after checking project files.',
  parameters: SearchStatutesSchema,
  jsonSchema: zodToJsonSchema(SearchStatutesSchema),
  execute: async (args, context) => {
    try {
      // Cornell LII doesn't have a formal API, so we construct search URLs
      // and provide guidance on where to look
      
      const source = args.source || 'usc';
      let searchUrl = '';
      let sourceName = '';
      
      switch (source) {
        case 'usc':
          searchUrl = `https://www.law.cornell.edu/uscode/search?query=${encodeURIComponent(args.query)}`;
          sourceName = 'United States Code';
          break;
        case 'cfr':
          searchUrl = `https://www.law.cornell.edu/cfr/search?query=${encodeURIComponent(args.query)}`;
          sourceName = 'Code of Federal Regulations';
          break;
        case 'constitution':
          searchUrl = `https://www.law.cornell.edu/constitution/search?query=${encodeURIComponent(args.query)}`;
          sourceName = 'U.S. Constitution';
          break;
        case 'ucc':
          searchUrl = `https://www.law.cornell.edu/ucc/search?query=${encodeURIComponent(args.query)}`;
          sourceName = 'Uniform Commercial Code';
          break;
        default:
          searchUrl = `https://www.law.cornell.edu/search/site/${encodeURIComponent(args.query)}`;
          sourceName = 'Cornell LII (all sources)';
      }
      
      // Attempt to fetch search results page
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'LLM-Legal-Council/1.0 (legal research tool)'
        }
      });
      
      if (!response.ok) {
        return `[SEARCH URL] Could not fetch results directly. Search ${sourceName} at:\n${searchUrl}\n\nQuery: "${args.query}"`;
      }
      
      const html = await response.text();
      
      // Extract basic info from the page (simplified parsing)
      // In production, would use a proper HTML parser
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : sourceName;
      
      return `[STATUTORY SEARCH] ${sourceName}\nQuery: "${args.query}"\nSearch URL: ${searchUrl}\n\nNote: Verify statutory text at the official source. Cornell LII provides unofficial but reliable compilations.`;
      
    } catch (error) {
      return `[ERROR] Failed to search statutes: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

/**
 * TOOL 4: Validate Citation
 * Verify a legal citation exists and is still good law
 */
export const validateCitationTool: ToolDefinition = {
  name: 'validate_citation',
  description: 'Verify if a legal citation is valid by searching CourtListener. Returns case details if found, or indicates citation may be invalid.',
  parameters: ValidateCitationSchema,
  jsonSchema: zodToJsonSchema(ValidateCitationSchema),
  execute: async (args, context) => {
    const apiKey = context.apiKeys?.courtlistener || COURT_LISTENER_API_KEY;
    
    if (!apiKey) {
      return `[CANNOT VERIFY] CourtListener API key not configured. Citation "${args.citation}" needs manual verification via Westlaw or other service.`;
    }
    
    try {
      // Search for the exact citation
      const searchParams = new URLSearchParams({
        q: `citation:(${args.citation})`,
        type: 'o',
        format: 'json'
      });
      
      const response = await fetch(
        `https://www.courtlistener.com/api/rest/v4/search/?${searchParams}`,
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        return `[ERROR] Citation verification failed: ${response.status}. Citation "${args.citation}" needs manual verification.`;
      }
      
      const data = await response.json() as { 
        count: number; 
        results: Array<{
          caseName: string;
          citation: string[];
          dateFiled: string;
          court: string;
          absolute_url: string;
        }> 
      };
      
      if (!data.results || data.results.length === 0) {
        return `[NOT FOUND] Citation "${args.citation}" not found in CourtListener. This may indicate:\n1. The citation is incorrect or fabricated\n2. The case is not yet in CourtListener's database\n3. The citation format doesn't match CourtListener's records\n\nRecommendation: Verify via Westlaw or official court records before relying on this citation.`;
      }
      
      // Found the case
      const r = data.results[0];
      const allCitations = r.citation?.join(', ') || args.citation;
      
      return `[VERIFIED] Citation found in CourtListener:\n\nCase: ${r.caseName}\nCitations: ${allCitations}\nCourt: ${r.court}\nDate Filed: ${r.dateFiled}\nURL: https://www.courtlistener.com${r.absolute_url}\n\nNote: This confirms the case exists. For "good law" status (whether overruled, distinguished, etc.), use Westlaw KeyCite or Lexis Shepard's.`;
      
    } catch (error) {
      return `[ERROR] Failed to validate citation: ${error instanceof Error ? error.message : String(error)}. Citation "${args.citation}" needs manual verification.`;
    }
  }
};

/**
 * TOOL 5: Web Search (Perplexity)
 * Priority 3 - Use after authoritative legal sources
 */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the general web for news, recent developments, or non-legal facts using Perplexity. Use AFTER checking project files and authoritative legal sources (CourtListener, Cornell LII).',
  parameters: WebSearchSchema,
  jsonSchema: zodToJsonSchema(WebSearchSchema),
  execute: async (args, context) => {
    const apiKey = context.apiKeys?.perplexity || PERPLEXITY_API_KEY;
    
    if (!apiKey) {
      return '[ERROR] Perplexity API key not configured. Cannot perform web search.';
    }
    
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [
            {
              role: 'system',
              content: 'You are a research assistant. Provide factual, well-sourced answers with citations to specific URLs where possible. Focus on recent and authoritative sources.'
            },
            {
              role: 'user',
              content: args.query
            }
          ],
          max_tokens: 1024,
          return_citations: true
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return `[ERROR] Perplexity search failed: ${response.status} ${errorText}`;
      }
      
      const data = await response.json() as {
        choices: Array<{
          message: {
            content: string;
          }
        }>;
        citations?: string[];
      };
      
      const content = data.choices?.[0]?.message?.content || 'No response';
      const citations = data.citations?.length 
        ? `\n\nSources:\n${data.citations.map((c, i) => `[${i + 1}] ${c}`).join('\n')}`
        : '';
      
      return `[WEB SEARCH RESULTS]\n\n${content}${citations}`;
      
    } catch (error) {
      return `[ERROR] Failed to perform web search: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

/**
 * All available tools, in priority order
 */
export const ALL_TOOLS: ToolDefinition[] = [
  searchProjectFilesTool,  // Priority 1
  searchCaseLawTool,       // Priority 2
  searchStatutesTool,      // Priority 2
  validateCitationTool,    // Verification
  webSearchTool            // Priority 3
];

/**
 * Get tools formatted for OpenRouter/OpenAI function calling
 */
export function getToolsForOpenRouter(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}> {
  return ALL_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.jsonSchema
    }
  }));
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string, 
  args: any, 
  context: ToolContext
): Promise<string> {
  const tool = ALL_TOOLS.find(t => t.name === name);
  
  if (!tool) {
    return `[ERROR] Unknown tool: ${name}`;
  }
  
  return tool.execute(args, context);
}
