# Changelog

## [0.5.4] - 2025-01-02

### Fixed (P1 - High ROI Reliability)
- **Removed dead config knobs** - Eliminated unused `deliberation.minConsensusThreshold`, `maxDebateRounds`, `enableAnonymization`, `preserveDissent` that created false confidence
- **Concurrency limiter now wired** - Stage 1 and Stage 2 use `withConcurrencyLimit()` with proper semaphore pattern instead of unbounded `Promise.all`
- **JSON mode fallback implemented** - Models that don't support JSON schema mode can be listed in `COUNCIL_JSON_FALLBACK_MODELS` env var; these use text mode with robust JSON extraction

### Added
- **`jsonFallbackModels` config option** - Comma-separated list of models that should use text mode with JSON extraction instead of native JSON schema mode
- **`queryModelWithFallback()` method** - Automatically routes to JSON schema mode or text+extraction based on model capabilities
- **`extractJsonFromText()` helper** - Robust JSON extraction from text responses (handles ```json blocks, raw JSON objects, and plain JSON)
- **`needsJsonFallback()` check** - Per-model capability detection based on config

### Changed
- **CouncilConfig simplified** - Removed `deliberation` section entirely; config now contains only functional options
- **ModelResponse.content type** - Now `string | unknown` to support both text and parsed JSON responses
- **Stage 1, 2, 3 all use fallback-aware queries** - All model calls route through `queryModelWithFallback()` for consistent behavior

### Configuration
New environment variables:
- `COUNCIL_CONCURRENCY_LIMIT` - Max parallel API calls (default: 3)
- `COUNCIL_JSON_FALLBACK_MODELS` - Comma-separated models requiring text mode fallback

## [0.5.3] - 2025-01-02

### Fixed (P0 - Release Blockers)
- **Added LICENSE file** - MIT license with legal disclaimer now included in distribution
- **Stage 2 and Stage 3 now use system instruction** - Previously only Stage 1 got the verification discipline scaffolding; now all stages receive base system instruction via `getStageSystemPrompt()`
- **CouncilQueryType taxonomy aligned** - Added `settlement-evaluation` to type union; added directives for all types (`weakness-identification`, `strategy-evaluation`, `brainstorm`)
- **`workProduct` field now wired into prompts** - Stage 1 includes work product content (token-budgeted to 4000 chars) when provided
- **`practiceArea` field now wired into prompts** - Stage 1 includes practice area context when provided

### Fixed (P1 - High ROI)
- **Removed constructor stdout logging** - Orchestrator no longer `console.log`s on instantiation; use `debug: true` option or progress callback instead
- **Added sourceAttribution to Stage 3 schema** - Chairman now outputs which analyses contributed to which conclusions, enabling meaningful audit trail
- **Added concurrencyLimit config option** - `COUNCIL_CONCURRENCY_LIMIT` env var (default: 3) for future rate-limit mitigation

### Added
- **`buildStage3SystemPrompt()` method** - Centralized Stage 3 system prompt construction with base instruction + chairman instructions
- **Concurrency limiter helper** - `withConcurrencyLimit()` utility for future use in Stage 1/2

### Changed
- **ProgressEvent.stage now supports 0** - Stage 0 events for initialization messages (skill loading, etc.)

## [0.5.2] - 2025-01-02

### Fixed
- **Critical: `isAppropriateForCouncil()` blocking intended use cases**
  - "Review draft motion" and similar critique requests were incorrectly blocked
  - Now detects critique intent (review, analyze, issue-spot, stress-test, etc.) and allows
  - Only blocks explicit drafting intent ("draft a motion", "write the complaint")
  - Much more precise regex-based detection with helpful error messages
- **CLI version mismatch** - CLI now reports correct version (was hardcoded 0.4.0)
- **Stage 3 prompt/schema misalignment** - Prompt now includes exact JSON structure with:
  - All enum values explicitly listed
  - Nested object shapes fully specified
  - Clear instructions on which values are required vs optional
- **`rankingRationale` dropped from Stage 2** - Now preserved in `PeerReview` type and output

### Added
- **`queryType` routing to Stage 1 prompts** - Each query type now gets task-specific directives:
  - `issue-spotting`: Focus on threshold blockers first
  - `risk-assessment`: Calibrate likelihood/impact with probability ranges
  - `stress-test`: Assume competent opponent, assess exploitability
  - `devils-advocate`: Argue against position, find outcome-flipping facts
  - `settlement-evaluation`: Balance litigation risk vs. settlement value
- **`buildStage3Prompt()` method** - Shared prompt builder eliminates duplication

### Changed
- **Default temperature lowered from 0.7 to 0.3** - More appropriate for structured legal analysis
- **Config `minimumSeats` now wired to quorum checks** - Was hardcoded to 2
- Code cleanup: removed duplicated Stage 3 prompt strings

## [0.5.1] - 2025-01-02

### Fixed
- **Critical: ESM Module Resolution** - Fixed Node ESM compatibility
  - Changed `tsconfig.json` to use `moduleResolution: "NodeNext"`
  - Added `.js` extensions to all relative imports
  - Compiled `dist/` output now works in Node ESM environment
- **Critical: `__dirname` in ESM** - Fixed runtime crash in `skills.ts`
  - Replaced `__dirname` with `import.meta.url` pattern for ESM compatibility
- **Critical: Algorithmic Chairman Selection** - Actually enabled the v0.5.0 feature
  - Split `chairmanModel` into `chairmanOverrideModel` (optional) and `fallbackChairmanModel`
  - Chairman is now selected algorithmically by default (highest peer-ranked analyst)
  - User can still override with `CHAIRMAN_MODEL` environment variable
- **CLI/Orchestrator Conflict** - Removed "Continue anyway?" prompt
  - CLI now fails hard on inappropriate queries (matches orchestrator behavior)
  - Eliminates confusing UX where user says "y" but deliberation still fails
- **Usage Tracking** - Always record usage, even when OpenRouter omits data
  - Changed conditional `if (response.usage)` to always call `recordUsage()`
  - `UsageTracker.recordUsage()` already handles undefined with estimates

### Changed
- `CouncilConfig` interface: replaced `chairmanModel` with `chairmanOverrideModel?` and `fallbackChairmanModel`
- `loadCouncilConfig()` now sets `chairmanOverrideModel` only when `CHAIRMAN_MODEL` env var exists
- `validateConfig()` no longer warns about missing `CHAIRMAN_MODEL` (algorithmic is default)
- CLI displays "algorithmic selection" instead of a model name when no override set

## [0.5.0] - 2025-01-02

### Added
- **Algorithmic Chairman Selection**: Chairman is now selected based on Stage 2 peer rankings
  - Highest-ranked analysis author becomes chairman
  - User can still override via `config.chairmanModel`
  - Selection rationale included in audit trail
- **Comprehensive Audit Trail**: Full process audit for transparency and debugging
  - Stage 1 audit: per-model metrics, latency, retries, threshold issues identified
  - Stage 2 audit: ranking consensus, agreement matrix, outlier detection, citation tracking
  - Stage 3 audit: dissent preservation, source reliance, risk calibration
  - Cross-stage anomaly detection: confidence mismatch, citation consensus, threshold gaps
  - Process integrity scoring: high/medium/low with flags and recommendations
- **Citation Integrity Skill**: New skill for anti-hallucination discipline
  - Verification requirements before citing authority
  - Shoehorning test to prevent stretched citations
  - Placeholder discipline for unverified authority
- **Audit Types**: Full TypeScript definitions for audit structures
  - `CouncilAudit`, `Stage1Audit`, `Stage2Audit`, `Stage3Audit`
  - `AuditAnomaly`, `AnomalyType`, `ProcessIntegrity`
  - `ChairmanSelectionAudit`

### Changed
- `deliberate()` now uses algorithmic chairman selection after Stage 2
- `constructDeliberation()` includes audit trail in output
- Stage 1 collects detailed metrics for audit
- Stage 3 uses dynamically selected chairman model

### Files Added
- `src/council/audit.ts` - Audit collector and chairman selection logic
- `skills/citation-integrity.md` - Citation verification skill

### Files Modified
- `src/council/orchestrator.ts` - Integrated audit collection and chairman selection
- `src/types.ts` - Added audit trail type definitions
- `src/skills.ts` - Added citation-integrity to core skills
- `system-instruction.md` - Referenced new skill

## [0.4.0] - 2025-01-01

### Added
- **Skills Integration**: Legal reasoning skills loaded and injected into context
  - `legal-reasoning-foundation.md` - Analytical frameworks
  - `legal-research.md` - Research methodology  
  - `verification-before-assertion.md` - Verification discipline
  - `adversarial-examiner.md` - Adversarial self-testing
- Skill loader module (`src/skills.ts`)
- System instruction for council members

### Changed
- Stage 1 now includes skills in system prompt
- Stage 1 schema includes `thresholdIssues` and `adversarialArgument` fields

## [0.4.0] - 2024-12-30

### Added
- **Model-Agnostic Architecture**: No hardcoded model defaults
  - Code defines "seats" - environment defines which models fill them
  - `loadCouncilConfig()` reads from COUNCIL_MODEL_1 through COUNCIL_MODEL_10
  - System requires explicit configuration - fails fast if unconfigured
  - Enables "Patent Council" vs "Speed Council" via .env changes only

- **Project System**: Customizable context without code changes
  - Custom instructions appended to system prompts
  - Project files for reference during deliberation  
  - Per-project jurisdiction and query type defaults
  - `--project <path>` CLI flag to load project
  - `--create-project <n>` CLI command to generate templates
  - Example projects for NY Commercial Litigation and NY Trust & Estates

- **Token Usage Tracking**: Real-time cost visibility
  - Per-model cost breakdown
  - Known vs. estimated pricing (marked with ~)
  - Per-stage token usage (Stage 1/2/3)
  - Formatted usage summary in CLI output
  - `UsageTracker` class for programmatic access

- **Progress Events**: Real-time deliberation status
  - `onProgress` callback for streaming UI updates
  - Per-analyst status during Stage 1 and Stage 2
  - `--no-progress` flag to disable

- **Configuration Validation**: `validateConfig()` with errors and warnings

### Changed
- **BREAKING**: Removed `defaultConfig` - use `loadCouncilConfig()` instead
- Orchestrator constructor accepts `options` object with `project` and `onProgress`
- CLI validates configuration at startup with helpful error messages
- `CouncilDeliberation` now includes `_usage` field with full breakdown
- Usage tracking distinguishes known pricing from estimates

### Removed
- **Hardcoded model defaults** - configuration is now mandatory
- `modelCapabilities` reference object - models are now opaque identifiers

## [0.3.0] - 2024-12-30

### Added
- **JSON Mode**: All LLM outputs now use structured JSON schemas via Zod validation
- **Quorum Checks**: Deliberation fails explicitly if fewer than 2 council members respond
- **Timeout & Retry**: Network layer has 2-minute timeouts and exponential backoff for rate limits (429) and server errors (5xx)
- **CouncilQuorumError**: Custom error class with detailed failure information
- **Zod Schemas**: Type-safe schemas for Stage1, Stage2, and Stage3 outputs in `src/schemas.ts`
- `.env` support via `dotenv` package
- `.env.example` template file

### Changed
- **Dependencies**: Added `dotenv`, `chalk`, `commander`, `zod` as runtime dependencies
- **CLI**: Rewrote using `commander` for proper argument parsing
- **Terminal Output**: Switched from manual ANSI codes to `chalk` for terminal compatibility
- **OpenRouterClient**: Added `queryModelJson<T>()` method for structured output
- **OpenRouterClient**: Added `AbortController` timeout and retry logic with exponential backoff

### Fixed
- **Brittle Regex Parsing**: Eliminated all regex-based LLM output parsing in favor of JSON mode
- **Type Trust**: Removed unnecessary `typeof response === 'string'` checks

### Removed
- All regex-based parsing functions (`parseSynthesis`, `extractConfidence`, `parseReviewResponse`, etc.)

## [0.2.0] - 2024-12-30

### Added
- Purpose clarification: Council is for deliberation/critique, not document drafting
- `councilUseCases` object defining appropriate vs. inappropriate uses
- `isAppropriateForCouncil()` validation function
- Query type routing (`issue-spotting`, `risk-assessment`, `stress-test`, etc.)
- CLI with interactive mode and file input support
- Structured output types for attorney agent integration
- `CouncilDeliberation` interface with consensus, issues, risks, dissent, action items

### Fixed
- **Anonymization Leak**: Stage 2 peer review no longer exposes model IDs
  - Before: `{ id: analysis.memberId, label: '...', content: '...' }`
  - After: `{ label: '...', content: '...' }` (no identifying information)

### Changed
- Removed Cloudflare Workers complexity from core orchestrator
- Simplified to CLI-first architecture
- Chairman synthesis prompt now explicitly preserves dissent

## [0.1.0] - 2024-12-30

### Added
- Initial implementation based on Andrej Karpathy's llm-council pattern
- Three-stage deliberation: Independent Analysis -> Peer Review -> Chairman Synthesis
- OpenRouter integration for multi-model access
- Cloudflare Workers backend (D1 database schema)
- Basic streaming support (Server-Sent Events)
