/**
 * Project System for LLM Legal Council
 * 
 * Projects allow customization of council behavior without code changes:
 * - Custom instructions appended to system prompts
 * - Project files for reference during deliberation
 * - Default jurisdiction and query type settings
 * - Model overrides
 * 
 * Usage:
 *   legal-council --project ./projects/ny-commercial.json "Analyze this motion"
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectConfig {
  /** Project identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Project description */
  description?: string;
  
  /** Custom instructions appended to all analyst prompts */
  instructions: string;
  
  /** Additional instructions specifically for the chairman */
  chairmanInstructions?: string;
  
  /** Default jurisdiction for this project */
  defaultJurisdiction?: string;
  
  /** Default query type */
  defaultQueryType?: string;
  
  /** Model overrides (optional - uses env/defaults if not set) */
  models?: {
    council?: string[];
    chairman?: string;
  };
  
  /** Project files to include in context */
  files?: ProjectFile[];
  
  /** Token budget for file content (default: 8000) */
  fileTokenBudget?: number;
  
  /** Created timestamp */
  createdAt?: string;
  
  /** Last modified timestamp */
  updatedAt?: string;
}

export interface ProjectFile {
  /** File path (relative to project file or absolute) */
  path: string;
  
  /** How to include this file */
  inclusion: 'full' | 'summary' | 'reference-only';
  
  /** Optional description of what this file contains */
  description?: string;
  
  /** Loaded content (populated at runtime) */
  _content?: string;
  
  /** Token count (populated at runtime) */
  _tokens?: number;
}

export interface LoadedProject extends ProjectConfig {
  /** Base directory for resolving relative paths */
  _basePath: string;
  
  /** Files with loaded content */
  _loadedFiles: LoadedProjectFile[];
  
  /** Total tokens used by files */
  _totalFileTokens: number;
}

export interface LoadedProjectFile extends ProjectFile {
  _content: string;
  _tokens: number;
  _truncated: boolean;
}

/**
 * Load a project from a JSON file
 */
export async function loadProject(projectPath: string): Promise<LoadedProject> {
  if (!fs.existsSync(projectPath)) {
    throw new ProjectError(`Project file not found: ${projectPath}`);
  }

  const raw = fs.readFileSync(projectPath, 'utf-8');
  let config: ProjectConfig;
  
  try {
    config = JSON.parse(raw);
  } catch (e) {
    throw new ProjectError(`Invalid JSON in project file: ${projectPath}`);
  }

  // Validate required fields
  if (!config.id) {
    throw new ProjectError('Project must have an "id" field');
  }
  if (!config.name) {
    throw new ProjectError('Project must have a "name" field');
  }
  if (!config.instructions) {
    throw new ProjectError('Project must have an "instructions" field');
  }

  const basePath = path.dirname(path.resolve(projectPath));
  const fileTokenBudget = config.fileTokenBudget ?? 8000;
  
  // Load project files
  const loadedFiles: LoadedProjectFile[] = [];
  let totalFileTokens = 0;

  if (config.files && config.files.length > 0) {
    for (const file of config.files) {
      const loaded = await loadProjectFile(file, basePath, fileTokenBudget - totalFileTokens);
      loadedFiles.push(loaded);
      totalFileTokens += loaded._tokens;
      
      if (totalFileTokens >= fileTokenBudget) {
        console.warn(`Project file token budget (${fileTokenBudget}) reached. Some files may be truncated or excluded.`);
        break;
      }
    }
  }

  return {
    ...config,
    _basePath: basePath,
    _loadedFiles: loadedFiles,
    _totalFileTokens: totalFileTokens
  };
}

/**
 * Load a single project file
 */
async function loadProjectFile(
  file: ProjectFile, 
  basePath: string,
  remainingBudget: number
): Promise<LoadedProjectFile> {
  const filePath = path.isAbsolute(file.path) 
    ? file.path 
    : path.join(basePath, file.path);

  if (!fs.existsSync(filePath)) {
    return {
      ...file,
      _content: `[File not found: ${file.path}]`,
      _tokens: 10,
      _truncated: false
    };
  }

  // Reference-only files don't load content
  if (file.inclusion === 'reference-only') {
    return {
      ...file,
      _content: '',
      _tokens: 0,
      _truncated: false
    };
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let tokens = estimateTokens(content);
  let truncated = false;

  // Truncate if over budget
  if (tokens > remainingBudget && remainingBudget > 0) {
    const targetChars = remainingBudget * 4;  // ~4 chars per token
    content = content.substring(0, targetChars) + '\n\n[... truncated due to token budget ...]';
    tokens = remainingBudget;
    truncated = true;
  }

  // For summary inclusion, we'd ideally summarize here
  // For now, just note that it should be summarized
  if (file.inclusion === 'summary') {
    // In a full implementation, this would call a cheap model to summarize
    // For now, we truncate more aggressively
    const summaryBudget = Math.min(tokens, 500);
    if (tokens > summaryBudget) {
      content = content.substring(0, summaryBudget * 4) + '\n\n[... summary truncated ...]';
      tokens = summaryBudget;
      truncated = true;
    }
  }

  return {
    ...file,
    _content: content,
    _tokens: tokens,
    _truncated: truncated
  };
}

/**
 * Format project context for injection into prompts
 */
export function formatProjectContext(project: LoadedProject): string {
  const sections: string[] = [];

  // Project instructions
  sections.push('=== PROJECT INSTRUCTIONS ===');
  sections.push(project.instructions);

  // Jurisdiction context
  if (project.defaultJurisdiction) {
    sections.push('');
    sections.push(`=== JURISDICTION ===`);
    sections.push(`This matter is governed by ${project.defaultJurisdiction} law. Apply jurisdiction-specific rules and cite controlling authority from this jurisdiction.`);
  }

  // Project files
  if (project._loadedFiles.length > 0) {
    sections.push('');
    sections.push('=== PROJECT DOCUMENTS ===');
    
    for (const file of project._loadedFiles) {
      if (file.inclusion === 'reference-only') {
        sections.push(`\n[Reference: ${file.path}${file.description ? ' - ' + file.description : ''}]`);
      } else if (file._content) {
        sections.push(`\n--- ${path.basename(file.path)}${file.description ? ' (' + file.description + ')' : ''} ---`);
        sections.push(file._content);
        if (file._truncated) {
          sections.push('[Document truncated]');
        }
      }
    }
  }

  return sections.join('\n');
}

/**
 * Format chairman-specific context
 */
export function formatChairmanContext(project: LoadedProject): string {
  if (!project.chairmanInstructions) {
    return formatProjectContext(project);
  }

  return formatProjectContext(project) + '\n\n=== CHAIRMAN-SPECIFIC INSTRUCTIONS ===\n' + project.chairmanInstructions;
}

/**
 * Estimate token count (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create a new project template
 */
export function createProjectTemplate(name: string, jurisdiction?: string): ProjectConfig {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description: `Project: ${name}`,
    instructions: `You are analyzing matters related to ${name}.

[Add your custom instructions here. These will be appended to all analyst prompts.]

Key considerations:
- [Add specific guidance]
- [Add relevant standards]
- [Add any constraints]`,
    chairmanInstructions: `When synthesizing for this project, pay particular attention to:
- [Add chairman-specific guidance]`,
    defaultJurisdiction: jurisdiction,
    files: [],
    fileTokenBudget: 8000,
    createdAt: new Date().toISOString()
  };
}

/**
 * Save a project to disk
 */
export function saveProject(project: ProjectConfig, outputPath: string): void {
  const toSave = { ...project };
  // Remove runtime fields
  delete (toSave as any)._basePath;
  delete (toSave as any)._loadedFiles;
  delete (toSave as any)._totalFileTokens;
  
  toSave.updatedAt = new Date().toISOString();
  
  fs.writeFileSync(outputPath, JSON.stringify(toSave, null, 2));
}

/**
 * Custom error for project loading issues
 */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}
