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

---

## v0.8 Development Roadmap

This section documents planned improvements for the GUI version (v0.7-v0.8).

### Planned Architecture Changes

**Target Stack:**
- **Backend:** Node.js + Hono server (NOT Cloudflare Workers - deliberation exceeds 30-second limit)
- **Frontend:** React
- **Model Routing:** OpenRouter API
- **Storage:** Cloudflare D1 (SQLite) + R2 (file storage)
- **RAG:** Gemini File Search for document Q&A

**Model Configuration:**
| Seat | Model | Role |
|------|-------|------|
| A | Claude Sonnet 4.5 | Lead Analyst |
| B | GPT-5.2 | Red Team |
| C | Gemini 3 Pro | Judge |
| D (optional) | Grok 4.1 | Contrarian |

**Note:** GPT-4o is explicitly excluded.

### Priority 1: Bug Fixes

#### 1.1 RAG Worker Embedding Batching
**Problem:** Worker calls `env.AI.run()` for each text chunk individually, exceeding Cloudflare's subrequest limits.

**Fix:** Batch operations:
- Embeddings: `EMBEDDING_BATCH_SIZE = 100`
- Vectorize: `VECTORIZE_BATCH_SIZE = 100`
- D1: `D1_BATCH_SIZE = 100`

### Priority 2: GUI Improvements

#### Layout Redesign
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ☰  LLM Legal Council                                                  📎  │
├─────────────────────────────────────────────────────────────────────────────┤
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌──────────┐ │
│   │   GROK 4.1      │ │   GEMINI 3      │ │   GPT 5.2       │ │  CLAUDE  │ │
│   │   (brand color) │ │   (brand color) │ │   (brand color) │ │  (amber) │ │
│   │   [streaming]   │ │   [streaming]   │ │   [streaming]   │ │[streaming│ │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘ └──────────┘ │
│   [Critiques ▼]  [Synthesis ▼]                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ 📎  Ask the council...                                          ➤  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key changes:**
- Remove dedicated upload panel → paperclip icon + drag-and-drop
- ☰ (left) → History sidebar slides in
- 📎 (right) → Documents sidebar slides in

#### Brand Colors
| Model | Brand Color | Gradient |
|-------|-------------|----------|
| Claude | `#D97706` (amber) | `linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)` |
| GPT | `#10A37F` (green) | `linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)` |
| Gemini | `#4285F4` (blue) | `linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)` |

### Priority 3: Post-Deliberation Chat

Enable back-and-forth conversation with all four models after deliberation.

**Architecture (Broadcast):**
1. User sends message
2. All 4 models receive in parallel with full context
3. All 4 respond (streamed)
4. User sees 4 responses, can follow up

**Context per model:** `system prompt + original query + documents + its Stage 1 response + relevant critiques + synthesis + chat history + new question`

### Priority 4: Conversation Persistence

**New D1 Tables:**
```sql
CREATE TABLE deliberations (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  documents TEXT,
  synthesis TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deliberation_responses (
  id TEXT PRIMARY KEY,
  deliberation_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_chairman BOOLEAN DEFAULT FALSE
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  deliberation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL
);
```

### Priority 5: Project System Enhancement

**Per-Seat Customization:**
- `system_prompt_prefix/suffix`
- `persona` - Role description
- `temperature` - Model-specific setting

**New D1 Tables:**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT DEFAULT 'NY',
  system_prompt TEXT,
  default_mode TEXT DEFAULT 'parallel'
);

CREATE TABLE seats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  model TEXT NOT NULL,
  role TEXT NOT NULL,
  persona TEXT,
  temperature REAL DEFAULT 0.7
);
```

### Planned Tool Stack (6 tools)

| Tool | Function |
|------|----------|
| `web_search` | Perplexity API |
| `courtlistener_search` | Case law research |
| `cornell_lii_search` | Statutes/CFR |
| `gemini_file_search` | Document Q&A with grounding |
| `extract_file_content` | PDF/DOCX text extraction |
| `project_knowledge_search` | Local skills/reference files |

### Development Phases

1. **Phase 1: Stabilization** - Fix batching, test tool iteration
2. **Phase 2: Chat Feature** - WebSocket/SSE chat, parallel model calls
3. **Phase 3: Persistence** - D1 tables, history sidebar
4. **Phase 4: GUI Polish** - New layout, brand colors, streaming
5. **Phase 5: Projects** - Project CRUD, per-seat customization

### Known Constraints

1. **Cloudflare Workers 30-second limit** - Use Node.js server for full deliberation
2. **Token budget** - Long conversations may need summarization
3. **OpenRouter latency** - ~50-100ms overhead per call

---

## Model Selector

The system includes a comprehensive model selector that fetches the latest models from OpenRouter on app startup.

### CLI Commands

```bash
# List all models (compact view, recommended only)
npm run models:list

# Show recommended council configuration
npm run models:recommend

# Interactive configuration wizard
npm run models:configure

# Validate current .env configuration
npm run models:validate

# Full model selector CLI
npx tsx src/model-selector-cli.ts list --verbose
npx tsx src/model-selector-cli.ts info anthropic/claude-sonnet-4
```

### Model Analysis

Each model includes council-specific analysis:
- **Council Score (1-10)** - Overall suitability for legal deliberation
- **Strengths/Weaknesses** - For legal reasoning tasks
- **Recommended Role** - lead-analyst, red-team, judge, contrarian, chairman
- **Chairman Suitability** - Whether suitable for synthesis role

### Recommended Configuration

| Seat | Model | Role | Score |
|------|-------|------|-------|
| A | Claude Sonnet 4 | Lead Analyst | 9/10 |
| B | GPT-5.2 | Red Team | 8/10 |
| C | Gemini 3 Pro | Judge | 8/10 |
| D | Grok 4.1 | Contrarian | 8/10 |
| Chairman | Claude Sonnet 4 | Synthesis | 9/10 |

---

## Web & iOS App Roadmap (v1.0+)

### Target Platforms

| Platform | Technology | Status |
|----------|------------|--------|
| Web App | React + Hono (SSE) | Planned |
| iOS App | React Native or Swift UI | Planned |
| Desktop | Electron wrapper (current) | Active |

### Web App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  React SPA (Vite) - Hosted on Cloudflare Pages                 │
├─────────────────────────────────────────────────────────────────┤
│                         BACKEND                                 │
│  Node.js + Hono - Hosted on VPS/Railway/Fly.io                 │
│  (NOT Cloudflare Workers - deliberation > 30s)                 │
├─────────────────────────────────────────────────────────────────┤
│                         STORAGE                                 │
│  Cloudflare D1 (SQLite) + R2 (files)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- SSE streaming for real-time model responses
- WebSocket for post-deliberation chat
- Authentication via Clerk or Auth.js
- PWA support for mobile web

### iOS App Requirements

**Display Modes:**
- Portrait mode: Stacked model cards (scrollable)
- Landscape mode: Side-by-side model cards (Hollywood Squares)
- Auto-rotation enabled

**Responsive Layouts:**

```
PORTRAIT (iPhone)                    LANDSCAPE (iPad/iPhone)
┌─────────────────┐                  ┌─────────┬─────────┐
│     CLAUDE      │                  │ CLAUDE  │  GPT    │
│   [streaming]   │                  │         │         │
├─────────────────┤                  ├─────────┼─────────┤
│      GPT        │                  │ GEMINI  │  GROK   │
│   [streaming]   │                  │         │         │
├─────────────────┤                  └─────────┴─────────┘
│     GEMINI      │                  ┌─────────────────────┐
│   [streaming]   │                  │  Ask the council... │
├─────────────────┤                  └─────────────────────┘
│      GROK       │
│   [streaming]   │
├─────────────────┤
│ Ask the council │
└─────────────────┘
```

**Technical Approach Options:**

1. **React Native + Expo** (Recommended)
   - Shared codebase with web
   - Expo SDK for native features
   - OTA updates without App Store review

2. **Swift UI (Native)**
   - Best iOS performance
   - Separate codebase
   - Full iOS feature access

3. **Capacitor (Web wrapper)**
   - Reuse React web code
   - PWA-first approach
   - Limited native features

### Development Phases (Updated)

1. **Phase 1: Web Foundation** (Current)
   - Complete model selector ✓
   - Fix RAG worker batching
   - Stabilize deliberation flow

2. **Phase 2: Web App MVP**
   - Hono server with SSE
   - React frontend with streaming
   - Basic authentication

3. **Phase 3: Web Features**
   - Post-deliberation chat
   - History persistence (D1)
   - Project management

4. **Phase 4: iOS App**
   - React Native setup
   - Responsive layouts (portrait/landscape)
   - Native file handling

5. **Phase 5: Polish**
   - Brand colors and theming
   - Animations and transitions
   - Performance optimization

---

## Important Notes for AI Assistants

1. **Never draft documents** - This system is for critique/deliberation only
2. **Preserve dissent** - Do not manufacture false consensus
3. **Verify before citing** - Use `[VERIFY]`, `[CITATION NEEDED]` placeholders
4. **Skills are methodology** - They teach HOW to analyze, not WHAT the law is
5. **Board Seat architecture** - No hardcoded model defaults; all configuration via env vars
6. **Minimum quorum is 2** - At least 2 council models must respond for valid deliberation
7. **GPT-4o excluded** - Do not use GPT-4o in model configurations
