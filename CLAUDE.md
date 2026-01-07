# CLAUDE.md - LLM Legal Council

This document provides guidance for AI assistants working with the LLM Legal Council codebase.

## Project Overview

LLM Legal Council is a multi-model deliberation system for legal analysis, critique, and risk assessment. Based on [Andrej Karpathy's llm-council pattern](https://github.com/karpathy/llm-council), adapted for legal practice.

**Key Principle**: This is a **deliberation and critique** tool, NOT a document drafting system.

### Appropriate Uses
- Issue spotting on draft motions/briefs
- Risk assessment for litigation strategy
- Identifying weaknesses in legal arguments
- Stress testing case theories
- Devil's advocate analysis
- Evaluating settlement positions

### Not For
- Drafting documents, briefs, or court filings
- Writing client correspondence
- Creating final work product

## Architecture

### Three-Stage Deliberation Process

```
┌─────────────────────────────────────────────────────────────────┐
│                         STAGE 1                                 │
│                   Independent Analysis                          │
│  Each model analyzes the query independently (anonymized)       │
├─────────────────────────────────────────────────────────────────┤
│                         STAGE 2                                 │
│                   Peer Review (Blind)                           │
│  Each model ranks all responses without knowing authorship      │
├─────────────────────────────────────────────────────────────────┤
│                         STAGE 3                                 │
│                   Chairman Synthesis                            │
│  Highest-ranked analyst synthesizes consensus + preserves       │
│  dissent (algorithmic selection or user override)               │
└─────────────────────────────────────────────────────────────────┘
```

### Source Code Structure

```
src/
├── index.ts              # Library entry point & exports
├── cli.ts                # Command-line interface
├── config.ts             # Configuration loading (Board Seat architecture)
├── types.ts              # TypeScript type definitions (comprehensive)
├── schemas.ts            # Zod validation schemas for JSON mode
├── project.ts            # Project file handling
├── skills.ts             # Skill loader for legal reasoning skills
├── usage.ts              # Token/cost tracking
└── council/
    ├── orchestrator.ts   # Main deliberation logic
    ├── openrouter.ts     # OpenRouter API client
    └── audit.ts          # Audit trail & chairman selection

skills/                   # Legal reasoning methodology (markdown)
├── legal-reasoning-foundation.md
├── legal-research.md
├── verification-before-assertion.md
├── adversarial-examiner.md
└── citation-integrity.md

tools/
├── definitions.ts        # Zod schemas for tools
└── implementations.ts    # Tool implementations (RAG, CourtListener, etc.)
```

## Development Commands

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run dev

# Type checking
npm run typecheck

# Build (TypeScript to dist/)
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Run CLI directly
npx tsx src/cli.ts "Your legal question here"
npx tsx src/cli.ts --project ./examples/ny-trust-estates.json "Your question"
npx tsx src/cli.ts --interactive
```

## Configuration

### Environment Variables (Required)

```bash
# API Key (required)
OPENROUTER_API_KEY=your_key_here

# Council Models (minimum 2 required)
COUNCIL_MODEL_1=anthropic/claude-sonnet-4
COUNCIL_MODEL_2=openai/gpt-4o
COUNCIL_MODEL_3=google/gemini-pro-1.5
```

### Optional Configuration

```bash
# Override algorithmic chairman selection
CHAIRMAN_MODEL=anthropic/claude-sonnet-4

# Default jurisdiction
DEFAULT_JURISDICTION=NY

# Concurrency limit (default: 3)
COUNCIL_CONCURRENCY_LIMIT=3

# JSON fallback for models without native JSON schema support
COUNCIL_JSON_FALLBACK_MODELS=model/name-1,model/name-2
```

### Tool API Keys (Optional)

```bash
# RAG Worker (Cloudflare)
LEGAL_KNOWLEDGE_WORKER_URL=https://legal-knowledge-worker.YOUR_SUBDOMAIN.workers.dev
LEGAL_KNOWLEDGE_WORKER_TOKEN=your_worker_api_token

# CourtListener (case law)
COURT_LISTENER_API_KEY=your_api_key

# Perplexity (web search)
PERPLEXITY_API_KEY=your_api_key
```

## Key Concepts

### Board Seat Architecture

The system defines council "seats" at the code level, but which models occupy those seats is determined entirely at runtime via environment variables. There are **NO hardcoded model defaults**.

```typescript
// config.ts - loads models from environment
const models: string[] = [];
for (let i = 1; i <= 10; i++) {
  const modelId = process.env[`COUNCIL_MODEL_${i}`];
  if (modelId) models.push(modelId.trim());
}
```

### Skills System

Skills provide **methodology**, not knowledge. They teach models HOW to think about legal problems:

| Skill | Purpose |
|-------|---------|
| `legal-reasoning-foundation` | IRAC, syllogistic reasoning, issue identification |
| `legal-research` | Research methodology, source evaluation |
| `verification-before-assertion` | Verification discipline, confidence calibration |
| `adversarial-examiner` | Threshold checking, opposing counsel simulation |
| `citation-integrity` | Anti-hallucination discipline, citation verification |

Skills are loaded via `loadSkills()` in `src/skills.ts` and injected into system prompts.

### Query Types

The system supports different query types with specialized directives:

- `issue-spotting` - Threshold blockers, procedural defects
- `risk-assessment` - Likelihood/impact calibration
- `weakness-identification` - Exploitable vulnerabilities
- `strategy-evaluation` - Strategy vs alternatives
- `stress-test` - Opposing counsel attack simulation
- `devils-advocate` - Argue against the position
- `settlement-evaluation` - Litigation risk vs settlement
- `brainstorm` - Generate multiple approaches
- `general-deliberation` - Default mode

### Chairman Selection

By default, the highest-ranked analyst from Stage 2 becomes chairman (algorithmic selection). Users can override this via `CHAIRMAN_MODEL` environment variable.

### Audit Trail

Every deliberation includes comprehensive audit data:

- Chairman selection rationale
- Per-model metrics (latency, tokens, retries)
- Ranking consensus analysis
- Anomaly detection (confidence mismatches, outliers)
- Process integrity score

## Type System

### Key Interfaces

```typescript
// Query input
interface CouncilQuery {
  query: string;
  queryType: CouncilQueryType;
  jurisdiction?: string;
  practiceArea?: string;
  context?: Record<string, unknown>;
  workProduct?: string;  // For critique tasks
}

// Output structure
interface CouncilDeliberation {
  consensus: ConsensusResult;
  issuesIdentified: IdentifiedIssue[];
  riskAssessment: CalibratedRisk;
  dissent: DissentingView[];        // Preserved, not flattened
  weaknessesFound: IdentifiedWeakness[];
  openQuestions: string[];
  actionItems: ActionItem[];
  _audit?: CouncilAudit;
  _usage?: UsageSummary;
}
```

### Zod Schemas

All LLM responses use Zod schemas for validation (`src/schemas.ts`):

- `Stage1AnalysisSchema` - Individual analysis structure
- `Stage2ReviewSchema` - Peer review evaluations
- `Stage3SynthesisSchema` - Chairman synthesis output

## Project System

Projects customize council behavior without code changes:

```json
{
  "id": "ny-commercial-litigation",
  "name": "NY Commercial Litigation",
  "instructions": "Apply New York law...",
  "chairmanInstructions": "Lead with jurisdictional compliance...",
  "defaultJurisdiction": "NY",
  "files": [
    {
      "path": "./complaint.pdf",
      "inclusion": "full"
    }
  ]
}
```

Load with: `npx tsx src/cli.ts --project ./project.json "Your question"`

## Code Conventions

### TypeScript
- Strict mode enabled
- ES2022 target with NodeNext modules
- Use `.js` extensions in imports (ESM requirement)
- Zod for runtime validation

### Error Handling
- Custom error classes: `ConfigurationError`, `ProjectError`, `CouncilQuorumError`, `OpenRouterError`
- Tools fail closed (return error messages, don't throw)
- Quorum checks after Stage 1 and Stage 2

### JSON Mode
- All model calls use JSON schema mode when supported
- Fallback to text mode with JSON extraction for models in `COUNCIL_JSON_FALLBACK_MODELS`
- `queryModelWithFallback()` handles routing automatically

## Testing

```bash
npm test          # Run all tests
npm run test:watch # Watch mode
```

Tests use Vitest. Test files follow `*.test.ts` convention.

## Cloudflare Worker (RAG)

The `legal-knowledge-worker/` directory contains a Cloudflare Worker for document retrieval:

```bash
# Deploy
cd legal-knowledge-worker
npx wrangler vectorize create legal-council-index --dimensions=768 --metric=cosine
npx wrangler secret put API_TOKEN
npx wrangler deploy
```

## Common Tasks

### Adding a New Query Type

1. Add type to `CouncilQueryType` in `src/types.ts`
2. Add directive in `getQueryTypeDirective()` in `src/council/orchestrator.ts`
3. Update `isAppropriateForCouncil()` if needed

### Adding a New Tool

1. Define Zod schema in `src/tools/definitions.ts`
2. Implement execution in `src/tools/implementations.ts`
3. Add to `ALL_TOOLS` array

### Adding a New Skill

1. Create markdown file in `skills/` directory
2. Add to `CORE_SKILLS` array in `src/skills.ts`

## Version

Current version: **0.6.0** (see CHANGELOG.md for release notes)

## Important Notes for AI Assistants

1. **Never draft documents** - This system is for critique/deliberation only
2. **Preserve dissent** - Do not manufacture false consensus
3. **Verify before citing** - Use `[VERIFY]`, `[CITATION NEEDED]` placeholders
4. **Skills are methodology** - They teach HOW to analyze, not WHAT the law is
5. **Board Seat architecture** - No hardcoded model defaults; all configuration via env vars
6. **Minimum quorum is 2** - At least 2 council models must respond for valid deliberation
