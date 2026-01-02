# LLM Legal Council Charter
## Version 2.0 | January 2, 2025

---

## PART I: PURPOSE AND AUTHORITY

### A. Mission

The LLM Legal Council produces reliable legal analysis through multi-model deliberation and cross-validation.  The Council provides **critique and deliberation**, not document drafting.  All output is advisory; a licensed attorney bears ultimate legal and ethical responsibility.

### B. Core Premise

**No single model's output is accepted without external validation.**

This principle derives from empirical observation: AI models operating with internal validation consistently produce failure modes (fabricated citations, catastrophizing, performative compliance) that disappear under external cross-model validation.  The failure is architectural, not capability-based.  The same models that fail alone succeed under adversarial peer review.

### C. Governing Constraints

1. **Attorney Supervision**: All Council output is advisory.  The supervising attorney makes final decisions.
2. **No Fabrication**: No invented citations, holdings, quotations, or facts.  Use `[VERIFY]`, `[CITATION NEEDED]`, or `[RECORD CITE NEEDED]` placeholders when unverified.
3. **Proportionate Assessment**: Risk calibrated to professional standards, not worst-case compression.
4. **Verification Before Assertion**: Legal principles verified against statutory text; facts verified against documentary record.
5. **Preserved Dissent**: A split council is more useful than manufactured consensus.

---

## PART II: ARCHITECTURE

### A. Model-Agnostic Design

The Council defines **seats**, not models.  Which models occupy those seats is determined at deployment via environment configuration.  This enables:

- "Patent Council" vs. "Speed Council" via configuration change only
- No code changes when models are updated or replaced
- Provider flexibility (OpenRouter, direct APIs, local models)

### B. Anonymization Principle

During deliberation, models do not know which model produced which analysis.  Responses are labeled "Response A," "Response B," etc.  This prevents:

- Self-preference bias (models rating their own work higher)
- Reputation effects (deferring to "better" models)
- Gaming (tailoring responses to known reviewers)

### C. Three-Stage Deliberation

```
STAGE 1: INDEPENDENT ANALYSIS
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Model A │  │ Model B │  │ Model C │  │ Model D │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │
     └────────────┴────────────┴────────────┘
                       │
                  Anonymized
                       ▼
STAGE 2: BLIND PEER REVIEW

Each model evaluates all responses without knowing authorship.
Scores: Legal accuracy, issue identification, risk calibration, practical utility.
Output: Aggregate rankings based on peer assessment.

                       │
                       ▼
STAGE 3: CHAIRMAN SYNTHESIS

Highest-ranked analyst becomes chairman (algorithmic selection).
Chairman synthesizes consensus and preserves genuine dissent.
Output: Unified deliberation with minority views intact.
```

### D. Algorithmic Chairman Selection

The chairman is selected based on Stage 2 peer rankings:

1. **Default**: Highest peer-ranked analyst becomes chairman
2. **Override**: User may specify chairman via configuration
3. **Fallback**: First responding model if ranking data unavailable

This ensures the model that demonstrated strongest analysis on THIS query synthesizes the deliberation—merit-based and query-specific.

---

## PART III: SKILLS AND METHODOLOGY

### A. Scaffolding, Not Knowledge

Skills provide **methodology**—how to think about legal problems—not substantive rules that become stale.  Skills include:

| Skill | Purpose |
|-------|---------|
| `legal-reasoning-foundation` | Analytical frameworks (IRAC, syllogistic reasoning, burden analysis) |
| `legal-research` | Research methodology, source evaluation, authority hierarchy |
| `verification-before-assertion` | Verification discipline, confidence calibration |
| `adversarial-examiner` | Threshold checking, opposing counsel simulation |
| `citation-integrity` | Anti-hallucination discipline, citation verification |

### B. Verification Requirements

Models must not cite authority they cannot verify.  When uncertain:

- `[VERIFY]` — Assertion needs confirmation
- `[CITATION NEEDED]` — No authority located for proposition
- `[RECORD CITE NEEDED]` — Factual assertion needs record support

### C. Confidence Calibration

All analyses end with explicit confidence assessment:

> **Confidence**: Facts [High/Medium/Low], Law [High/Medium/Low], Procedure [High/Medium/Low]

High confidence requires verified authority and record support.  Uncertainty is information—state it clearly.

---

## PART IV: AUDIT AND ACCOUNTABILITY

### A. Process Audit Trail

Every deliberation produces a comprehensive audit:

- **Chairman Selection Audit**: Method, rationale, alternatives considered
- **Stage 1 Audit**: Per-model metrics (latency, tokens, confidence, threshold issues)
- **Stage 2 Audit**: Ranking consensus, agreement matrix, outlier detection
- **Stage 3 Audit**: Dissent preservation, source reliance, risk calibration
- **Cross-Stage Anomaly Detection**: Confidence mismatches, citation consensus, threshold gaps

### B. Anomaly Types

| Type | Description |
|------|-------------|
| `confidence-mismatch` | Model stated high confidence but ranked last by peers |
| `citation-consensus` | Multiple models cited same authority (shared hallucination risk) |
| `threshold-gap` | Model missed threshold issue others caught |
| `synthesis-divergence` | Chairman ignored peer rankings |
| `dissent-suppression` | Noteworthy minority view not preserved |

### C. Process Integrity Score

Each deliberation receives an integrity assessment:

- **High**: No critical anomalies, strong ranking consensus
- **Medium**: Warnings present, bare quorum, or weak consensus
- **Low**: Critical anomalies detected—review before relying on output

---

## PART V: APPROPRIATE USE

### A. Council Is For

- Issue spotting on draft motions or briefs
- Risk assessment for litigation strategy
- Identifying weaknesses in legal arguments
- Stress testing case theories
- Devil's advocate analysis
- Evaluating settlement positions
- Comparing strategic alternatives

### B. Council Is Not For

- Drafting documents (use an attorney agent)
- Writing persuasive briefs
- Creating final work product
- Client correspondence
- Court filings

The Council **critiques**; it does not **create**.

---

## PART VI: GOVERNANCE

### A. Charter Amendments

This charter may be amended by the supervising attorney.  Amendments should preserve:

1. Multi-model validation requirement
2. Attorney supervision principle
3. Anonymization during peer review
4. Dissent preservation mandate

### B. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-31 | Initial draft |
| 2.0 | 2025-01-02 | Aligned with v0.5.0 implementation: algorithmic chairman selection, audit trail, 5 skills, model-agnostic architecture |
