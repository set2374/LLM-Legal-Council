/**
 * Skill Loader for LLM Legal Council
 * 
 * Loads and assembles legal reasoning skills for injection into model context.
 * 
 * Skills are methodology (scaffolding), not knowledge:
 * - legal-reasoning-foundation: HOW to analyze legally
 * - legal-research: HOW to find and evaluate authority
 * - verification-before-assertion: Discipline against unverified claims
 * - adversarial-examiner: Adversarial self-testing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Skill {
  /** Skill identifier (filename without extension) */
  id: string;
  
  /** Full skill content */
  content: string;
  
  /** Estimated token count */
  tokens: number;
}

export interface LoadedSkills {
  /** System instruction */
  systemInstruction: string;
  
  /** Individual skills */
  skills: Skill[];
  
  /** Total tokens for all skills + instruction */
  totalTokens: number;
}

/** Default skills directory relative to this file */
const DEFAULT_SKILLS_DIR = path.join(__dirname, '..', 'skills');
const DEFAULT_SYSTEM_INSTRUCTION = path.join(__dirname, '..', 'system-instruction.md');

/** Core skills to load (in order) */
const CORE_SKILLS = [
  'legal-reasoning-foundation',
  'legal-research',
  'verification-before-assertion',
  'adversarial-examiner',
  'citation-integrity'
];

/**
 * Load all skills from the skills directory
 */
export function loadSkills(options?: {
  skillsDir?: string;
  systemInstructionPath?: string;
  skillIds?: string[];  // Override which skills to load
}): LoadedSkills {
  const skillsDir = options?.skillsDir ?? DEFAULT_SKILLS_DIR;
  const systemInstructionPath = options?.systemInstructionPath ?? DEFAULT_SYSTEM_INSTRUCTION;
  const skillIds = options?.skillIds ?? CORE_SKILLS;

  // Load system instruction
  let systemInstruction = '';
  if (fs.existsSync(systemInstructionPath)) {
    systemInstruction = fs.readFileSync(systemInstructionPath, 'utf-8');
  } else {
    console.warn(`System instruction not found at ${systemInstructionPath}, using minimal default`);
    systemInstruction = getMinimalSystemInstruction();
  }

  // Load individual skills
  const skills: Skill[] = [];
  
  for (const skillId of skillIds) {
    const skillPath = path.join(skillsDir, `${skillId}.md`);
    
    if (!fs.existsSync(skillPath)) {
      console.warn(`Skill not found: ${skillPath}`);
      continue;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const tokens = estimateTokens(content);

    skills.push({
      id: skillId,
      content,
      tokens
    });
  }

  const totalTokens = estimateTokens(systemInstruction) + 
    skills.reduce((sum, s) => sum + s.tokens, 0);

  return {
    systemInstruction,
    skills,
    totalTokens
  };
}

/**
 * Format skills for injection into model context
 * 
 * @param loadedSkills - Skills loaded by loadSkills()
 * @param stage - Which stage (affects what's included)
 * @param skillsDir - Directory containing skills (for loading chairman-synthesis)
 */
export function formatSkillsContext(
  loadedSkills: LoadedSkills,
  stage: 1 | 2 | 3,
  skillsDir?: string
): string {
  const sections: string[] = [];
  const dir = skillsDir ?? DEFAULT_SKILLS_DIR;

  // System instruction always included
  sections.push(loadedSkills.systemInstruction);

  // Stage 1: Full analysis skills - produce best possible legal analysis
  // Stage 2: Full analysis skills - evaluate whether Stage 1 followed methodology
  // Stage 3: Chairman synthesis skill only - report, don't analyze
  
  if (stage === 1 && loadedSkills.skills.length > 0) {
    sections.push('\n\n---\n\n## ATTACHED SKILLS\n');
    sections.push('Apply the following methodologies to your analysis:\n');
    
    for (const skill of loadedSkills.skills) {
      sections.push(`\n${skill.content}`);
    }
  } else if (stage === 2 && loadedSkills.skills.length > 0) {
    sections.push('\n\n---\n\n## ATTACHED SKILLS\n');
    sections.push('Use the following methodologies to evaluate whether each anonymized response properly executed the analysis protocol. Your task is rigorous critique, not independent analysis. Assess whether each analyst:\n');
    sections.push('- Verified assertions before stating them\n');
    sections.push('- Grounded conclusions in cited authority\n');
    sections.push('- Tested adversarially before concluding\n');
    sections.push('- Calibrated confidence to evidence\n');
    sections.push('- Used proper placeholders for unverified claims\n\n');
    
    for (const skill of loadedSkills.skills) {
      sections.push(`\n${skill.content}`);
    }
  } else if (stage === 3) {
    // Load chairman-synthesis skill only
    const chairmanSkillPath = path.join(dir, 'chairman-synthesis.md');
    if (fs.existsSync(chairmanSkillPath)) {
      sections.push('\n\n---\n\n## CHAIRMAN INSTRUCTIONS\n');
      sections.push(fs.readFileSync(chairmanSkillPath, 'utf-8'));
    }
  }

  return sections.join('\n');
}

/**
 * Get combined system prompt for a specific stage
 */
export function getStageSystemPrompt(
  loadedSkills: LoadedSkills,
  stage: 1 | 2 | 3,
  projectContext?: string
): string {
  const baseContext = formatSkillsContext(loadedSkills, stage);
  
  if (projectContext) {
    return `${baseContext}\n\n---\n\n## PROJECT CONTEXT\n\n${projectContext}`;
  }
  
  return baseContext;
}

/**
 * Estimate token count (~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Minimal system instruction fallback
 */
function getMinimalSystemInstruction(): string {
  return `# LLM Legal Council

You are a council member in a multi-model legal deliberation system.

## Core Principles

- Ground conclusions in authority (statutes, cases, rules)
- Distinguish binding from persuasive authority
- Map claims to elements
- Test adversarially before concluding
- Match confidence to evidence

## Verification

Do not cite authority you cannot verify. Use placeholders:
- [VERIFY] - Assertion needs confirmation
- [CITATION NEEDED] - No authority located
- [RECORD CITE NEEDED] - Factual assertion needs support

End analysis with:
> **Confidence**: Facts [H/M/L], Law [H/M/L], Procedure [H/M/L]
`;
}

/**
 * Validate that required skills exist
 */
export function validateSkillsExist(skillsDir?: string): {
  valid: boolean;
  missing: string[];
  found: string[];
} {
  const dir = skillsDir ?? DEFAULT_SKILLS_DIR;
  const missing: string[] = [];
  const found: string[] = [];

  for (const skillId of CORE_SKILLS) {
    const skillPath = path.join(dir, `${skillId}.md`);
    if (fs.existsSync(skillPath)) {
      found.push(skillId);
    } else {
      missing.push(skillId);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    found
  };
}
