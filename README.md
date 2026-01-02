# LLM Legal Council

Multi-model deliberation system for legal analysis, critique, and risk assessment.

Based on [Andrej Karpathy's llm-council pattern](https://github.com/karpathy/llm-council), adapted for legal practice.

## What It Does

The council provides **deliberation and critique**, not document drafting:

✅ **Appropriate Uses**
- Issue spotting on draft motions
- Risk assessment for litigation strategy
- Identifying weaknesses in legal arguments
- Stress testing case theories
- Devil's advocate analysis
- Evaluating settlement positions

❌ **Not For**
- Drafting documents
- Writing briefs
- Client correspondence
- Court filings

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         STAGE 1                                  │
│                   Independent Analysis                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Model A │  │ Model B │  │ Model C │  │ Model D │            │
│  │(Claude) │  │ (GPT-4) │  │(Gemini) │  │(Llama)  │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                   │
│       └────────────┴────────────┴────────────┘                   │
│                         │                                        │
│                    Anonymized                                    │
│                         ▼                                        │
├─────────────────────────────────────────────────────────────────┤
│                         STAGE 2                                  │
│                   Peer Review (Blind)                            │
│                                                                  │
│   Each model ranks all responses without knowing authorship      │
│   Response A, Response B, Response C, Response D                 │
│                                                                  │
│                    Aggregate Rankings                            │
│                         ▼                                        │
├─────────────────────────────────────────────────────────────────┤
│                         STAGE 3                                  │
│                   Chairman Synthesis                             │
│                                                                  │
│   Highest-ranked analyst becomes chairman (algorithmic)          │
│   Synthesizes consensus, preserves dissent                       │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                            │
│              │  Council Decision   │                            │
│              │  + Audit Trail      │                            │
│              └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/llm-legal-council.git
cd llm-legal-council

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API key and model selections
```

## Configuration

Create a `.env` file:

```bash
# Required: OpenRouter API key
OPENROUTER_API_KEY=your_key_here

# Required: At least 2 council models
COUNCIL_MODEL_1=anthropic/claude-3.5-sonnet
COUNCIL_MODEL_2=openai/gpt-4o
COUNCIL_MODEL_3=google/gemini-1.5-pro

# Optional: Override algorithmic chairman selection
# CHAIRMAN_MODEL=anthropic/claude-3.5-sonnet

# Optional: Default jurisdiction
DEFAULT_JURISDICTION=NY
```

**Note:** The chairman is now selected algorithmically based on Stage 2 peer rankings. The highest-ranked analyst becomes chairman. You can override this with `CHAIRMAN_MODEL`.

## Usage

### CLI

```bash
# Simple query
npm run cli "Evaluate the strength of our breach of fiduciary duty claim against the trustee"

# With project context
npm run cli --project ./examples/ny-trust-estates.json "What are the weaknesses in our accounting objections?"

# Interactive mode
npm run cli:interactive

# Create a new project template
npm run cli -- --create-project my-matter
```

### Programmatic

```typescript
import { 
  LegalCouncilOrchestrator, 
  loadCouncilConfig, 
  createOpenRouterClient 
} from 'llm-legal-council';

const config = loadCouncilConfig();
const client = createOpenRouterClient(process.env.OPENROUTER_API_KEY!);
const orchestrator = new LegalCouncilOrchestrator(client, config);

const result = await orchestrator.deliberate({
  query: "Identify weaknesses in our motion for summary judgment",
  queryType: "weakness-identification",
  jurisdiction: "NY"
});

console.log('Consensus:', result.consensus);
console.log('Issues:', result.issuesIdentified);
console.log('Weaknesses:', result.weaknessesFound);
console.log('Action Items:', result.actionItems);

// Access audit trail
console.log('Chairman selection:', result._audit?.chairmanSelection);
console.log('Process integrity:', result._audit?.processIntegrity);
```

## Project Files

Projects customize the council for specific matters:

```json
{
  "id": "ny-commercial-litigation",
  "name": "NY Commercial Litigation",
  "instructions": "Apply New York law. Reference CPLR for procedural issues...",
  "chairmanInstructions": "Lead with jurisdictional compliance issues...",
  "defaultJurisdiction": "NY",
  "defaultQueryType": "issue-spotting"
}
```

See `examples/` for templates.

## Output Structure

```typescript
interface CouncilDeliberation {
  // Core results
  consensus: ConsensusResult;        // Did council agree? What position?
  issuesIdentified: IdentifiedIssue[]; // Issues flagged, with severity
  riskAssessment: CalibratedRisk;    // Risk level, factors, calibration
  dissent: DissentingView[];         // Preserved minority positions
  weaknessesFound: IdentifiedWeakness[]; // Exploitable weaknesses
  openQuestions: string[];           // What remains unresolved
  actionItems: ActionItem[];         // Prioritized next steps
  
  // Audit trail (v0.5+)
  _audit?: CouncilAudit;             // Full process audit
  _usage?: UsageSummary;             // Token/cost breakdown
}
```

## Audit Trail (v0.5)

Every deliberation includes a comprehensive audit:

- **Chairman Selection**: How/why chairman was selected
- **Stage 1 Audit**: Per-model metrics, latency, retries
- **Stage 2 Audit**: Ranking consensus, agreement matrix, outliers
- **Stage 3 Audit**: Dissent preservation, source reliance
- **Anomaly Detection**: Confidence mismatches, citation consensus, threshold gaps
- **Process Integrity**: High/medium/low score with flags

```typescript
// Check for critical anomalies
const anomalies = [
  ...result._audit?.stage1.anomalies ?? [],
  ...result._audit?.stage2.anomalies ?? [],
  ...result._audit?.stage3.anomalies ?? [],
  ...result._audit?.crossStageAnomalies ?? []
].filter(a => a.severity === 'critical');

if (anomalies.length > 0) {
  console.warn('Critical anomalies detected:', anomalies);
}
```

## Skills

The council uses five foundational skills:

| Skill | Purpose |
|-------|---------|
| `legal-reasoning-foundation` | Analytical frameworks (IRAC, syllogistic reasoning) |
| `legal-research` | Research methodology, source evaluation |
| `verification-before-assertion` | Verification discipline, confidence calibration |
| `adversarial-examiner` | Threshold checking, opposing counsel simulation |
| `citation-integrity` | Anti-hallucination discipline, citation verification |

Skills provide **methodology**, not knowledge. They teach models HOW to think about legal problems without containing jurisdiction-specific rules that become stale.

## Token Budget

| Component | Tokens (est.) |
|-----------|---------------|
| System instruction | ~1,100 |
| legal-reasoning-foundation | ~1,200 |
| legal-research | ~1,500 |
| verification-before-assertion | ~1,100 |
| adversarial-examiner | ~1,600 |
| citation-integrity | ~1,200 |
| **Total per model** | **~7,700** |
| **Council-wide (×4)** | **~30,800** |

## File Structure

```
llm-legal-council/
├── src/
│   ├── index.ts              # Library entry point
│   ├── cli.ts                # Command-line interface
│   ├── config.ts             # Configuration loading
│   ├── types.ts              # TypeScript type definitions
│   ├── schemas.ts            # Zod validation schemas
│   ├── project.ts            # Project file handling
│   ├── skills.ts             # Skill loader
│   ├── usage.ts              # Token/cost tracking
│   └── council/
│       ├── orchestrator.ts   # Main deliberation logic
│       ├── openrouter.ts     # OpenRouter API client
│       └── audit.ts          # Audit trail & chairman selection
├── skills/
│   ├── legal-reasoning-foundation.md
│   ├── legal-research.md
│   ├── verification-before-assertion.md
│   ├── adversarial-examiner.md
│   └── citation-integrity.md
├── examples/
│   ├── ny-commercial-litigation.json
│   └── ny-trust-estates.json
├── system-instruction.md     # Core instruction for all council members
├── .env.example              # Environment configuration template
└── package.json
```

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Data Handling & Confidentiality

**⚠️ IMPORTANT: This tool sends data to external LLM providers via OpenRouter.**

### What Gets Sent
- Your query text
- Any context you provide
- Project instructions and documents
- Skill/system prompts

### Confidentiality Considerations

1. **Privileged Information**: Before using this tool with matter-specific facts, verify your jurisdiction's ethics rules regarding AI tools and cloud services. Some jurisdictions require specific confidentiality agreements or client consent.

2. **OpenRouter Pass-Through**: OpenRouter routes requests to underlying providers (Anthropic, OpenAI, Google, etc.). Review each provider's:
   - Data retention policies
   - Training data usage policies
   - SOC 2/security certifications

3. **Recommended Practices**:
   - Use fact patterns, not client names
   - Redact identifying information before submission
   - Consider maintaining a "sanitization checklist" for your practice
   - Review your firm's AI usage policy

4. **Not for Client-Facing Use**: This is an attorney work product tool. Do not expose deliberation outputs directly to clients without attorney review.

### No Warranty

This tool provides analysis assistance only. All outputs require independent attorney verification. See LICENSE.

## License

MIT

## Version

0.5.4 - See [CHANGELOG.md](CHANGELOG.md) for release notes.
