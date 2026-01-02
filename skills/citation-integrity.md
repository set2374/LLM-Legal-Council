# Citation Integrity

## Purpose

Prevent citation errors that undermine legal analysis.  This skill addresses a specific failure mode: models citing authority that is nonexistent, mischaracterized, or no longer good law.

This is NOT about formatting.  This is about truth.

## The Core Problem

Models under pressure to support conclusions will stretch citations:
- Cite cases that don't exist
- Characterize holdings more broadly than warranted
- Cite overruled or distinguished authority as if still controlling
- Attribute propositions to cases that don't support them
- Fabricate pincites and quotations

These errors are difficult to catch downstream because they look plausible.  A confident-sounding citation to "Smith v. Jones, 123 N.Y.2d 456 (2020)" may be entirely fabricated, but a reviewer evaluating reasoning quality won't independently verify it.

**Citation errors must be prevented at the source.**

## Verification Requirements

### Before Citing Any Authority

**Can you verify this authority exists?**
- Have you located it in a verifiable source (CourtListener, Cornell LII, official reporter)?
- If relying on training data alone: DO NOT CITE.  Use `[CITATION NEEDED]` instead.

**Is your characterization accurate?**
- Does the case actually hold what you're claiming?
- Are you citing the holding or dicta?
- What was the procedural posture?  Does it affect the holding's scope?
- Are you reading the case or relying on a headnote/summary?

**Is the authority still good law?**
- Has it been overruled, abrogated, or limited?
- Has the statute been amended?
- Is there subsequent authority that narrows or distinguishes it?

**Is it binding or persuasive?**
- From controlling jurisdiction = binding
- From other jurisdiction = persuasive only
- Trial court decision = generally not binding even in same jurisdiction
- State clearly which you have

### The Shoehorning Test

Before including a citation, ask:

1. **Does this case actually support my proposition?**  Or am I stretching it because I need support?

2. **Would I be comfortable if someone read the full case?**  Or would they find my characterization misleading?

3. **Is this the best authority?**  Or am I citing it because it's what I have, not because it's on point?

If you're stretching, stop.  Either find better authority or acknowledge the gap.

## Placeholder Discipline

When you cannot verify, use explicit markers:

```
[VERIFY: Smith v. Jones] — Citation exists but needs confirmation of holding/currency
[CITATION NEEDED: proposition] — No verified authority supports this proposition
[UNVERIFIED - training data] — Relying on general knowledge, not confirmed source
```

**Placeholders are professional practice, not failure.**  A flagged uncertainty is infinitely more valuable than a confident error.

## Common Citation Errors

### Hallucinated Cases
- Case name sounds plausible but doesn't exist
- Citation format looks correct but reporter/page is fabricated
- **Prevention:** Verify existence before citing

### Overstatement of Holdings
- Case addresses related issue but not the exact proposition
- Holding is narrower than characterized
- Dicta treated as holding
- **Prevention:** Read the actual case; identify the specific holding

### Stale Authority
- Case has been overruled or limited
- Statute has been amended
- Rule has been superseded
- **Prevention:** Check subsequent treatment; verify currency

### Wrong Jurisdiction
- Citing persuasive authority as if binding
- Citing federal rule for state court matter
- Citing sister-state law without acknowledging it's not controlling
- **Prevention:** Identify jurisdiction; state binding vs. persuasive

### Fabricated Quotations
- Quote doesn't appear in cited source
- Quote is paraphrased but presented as verbatim
- Pincite is wrong or fabricated
- **Prevention:** Only quote what you've verified; no guessing at page numbers

## The Integrity Standard

**Would you sign a brief containing this citation?**

If the citation were challenged:
- Could you produce the source?
- Would the source support your characterization?
- Would you be professionally embarrassed?

If any answer is no, do not include the citation.  Use a placeholder instead.

## Integration with Analysis

Citation integrity is not separate from legal reasoning—it IS legal reasoning.

An argument built on unverified authority is not an argument.  It's speculation dressed as analysis.

When you identify an authority gap:
- State the gap explicitly
- Provide your reasoning anyway (with appropriate confidence level)
- Flag what authority would resolve the gap
- Do not paper over the gap with a fabricated citation

**Intellectual honesty about limitations produces better analysis than false confidence.**
