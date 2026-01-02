/**
 * Legal Council Orchestrator
 * 
 * Implements the three-stage deliberation process:
 * 1. Independent analysis from each council member
 * 2. Anonymized peer review and ranking
 * 3. Chairman synthesis (preserving dissent)
 * 
 * This is a DELIBERATION tool, not a drafting agent.
 * 
 * v0.3 Changes:
 * - JSON mode for structured output (no regex parsing)
 * - Quorum checks (minimum members required)
 * - Timeout and retry support
 * 
 * v0.4 Changes:
 * - Project system for custom instructions and files
 * - Token usage tracking with per-model cost breakdown
 * - Progress callbacks for streaming UI
 */

import { OpenRouterClient, ModelResponse, ChatMessage } from './openrouter.js';
import { 
  CouncilConfig, 
  councilPrompts,
  isAppropriateForCouncil 
} from '../config.js';
import { ALL_TOOLS } from '../tools/implementations.js';
import {
  Stage1AnalysisSchema,
  Stage2ReviewSchema,
  Stage3SynthesisSchema,
  stage1JsonSchema,
  stage2JsonSchema,
  stage3JsonSchema,
  Stage1Analysis,
  Stage2Review,
  Stage3Synthesis
} from '../schemas.js';
import {
  CouncilQuery,
  CouncilDeliberation,
  Stage1Result,
  Stage2Result,
  Stage3Result,
  IndividualAnalysis,
  PeerReview,
  AggregateRanking,
  IdentifiedIssue,
  CalibratedRisk,
  DissentingView,
  ActionItem,
  StageError,
  CouncilMember,
  CouncilAudit,
  ChairmanSelectionAudit,
  Stage1Audit,
  Stage1ModelMetrics,
  Stage2Audit,
  Stage3Audit,
  AuditAnomaly,
  AnomalyType,
  ProcessIntegrity
} from '../types.js';
import { 
  LoadedProject, 
  formatProjectContext, 
  formatChairmanContext 
} from '../project.js';
import { 
  UsageTracker, 
  UsageSummary, 
  TokenUsage 
} from '../usage.js';
import {
  LoadedSkills,
  loadSkills,
  getStageSystemPrompt
} from '../skills.js';
import {
  AuditCollector,
  selectChairman,
  ChairmanSelectionResult
} from './audit.js';

const DEFAULT_MINIMUM_QUORUM = 2;  // Fallback if config doesn't specify

/**
 * Execute promises with concurrency limit using semaphore pattern
 * Prevents rate limiting when running multiple model calls
 */
async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let currentIndex = 0;
  
  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        // Task failed - result stays null, error handled by caller
        results[index] = null;
      }
    }
  }
  
  // Start up to `limit` concurrent workers
  const workers = Array(Math.min(limit, tasks.length))
    .fill(null)
    .map(() => runNext());
  
  await Promise.all(workers);
  return results;
}

/** Progress callback for streaming UI updates */
export type ProgressCallback = (event: ProgressEvent) => void;

export interface ProgressEvent {
  stage: 0 | 1 | 2 | 3;  // 0 = initialization
  type: 'start' | 'model-start' | 'model-complete' | 'model-error' | 'complete';
  label?: string;  // Anonymized label (A, B, C)
  modelId?: string;  // Only for internal logging, not displayed
  message?: string;
  usage?: TokenUsage;
}

export class LegalCouncilOrchestrator {
  private openRouter: OpenRouterClient;
  private config: CouncilConfig;
  private project?: LoadedProject;
  private usageTracker?: UsageTracker;
  private onProgress?: ProgressCallback;
  private skills: LoadedSkills;
  private auditCollector?: AuditCollector;

  constructor(
    openRouter: OpenRouterClient, 
    config: CouncilConfig,  // Required - no defaults
    options?: {
      project?: LoadedProject;
      onProgress?: ProgressCallback;
      skillsDir?: string;
      debug?: boolean;
    }
  ) {
    this.openRouter = openRouter;
    this.config = config;
    this.project = options?.project;
    this.onProgress = options?.onProgress;
    
    // Load legal reasoning skills
    this.skills = loadSkills({
      skillsDir: options?.skillsDir
    });
    
    // Only log if debug enabled or progress callback exists (CLI mode)
    if (options?.debug || options?.onProgress) {
      this.emitProgress({
        stage: 0,
        type: 'start',
        message: `Loaded ${this.skills.skills.length} skills (${this.skills.totalTokens} tokens)`
      });
    }
  }

  /**
   * Set or update the project
   */
  setProject(project: LoadedProject | undefined): void {
    this.project = project;
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  /**
   * Emit progress event
   */
  private emitProgress(event: ProgressEvent): void {
    if (this.onProgress) {
      this.onProgress(event);
    }
  }

  /**
   * Check if a model requires JSON fallback mode
   */
  private needsJsonFallback(modelId: string): boolean {
    return this.config.jsonFallbackModels?.includes(modelId) ?? false;
  }

  /**
   * Extract JSON from text response (for models that don't support JSON schema mode)
   */
  private extractJsonFromText<T>(text: string): T | null {
    // Try to find JSON in the response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as T;
      } catch {
        // Fall through to raw parse
      }
    }
    
    // Try to find JSON object directly
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        // Fall through
      }
    }
    
    // Try parsing entire response as JSON
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  /**
   * Query a model with automatic JSON fallback for models that don't support schema mode
   */
  private async queryModelWithFallback<T>(
    modelId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    jsonSchema: object,
    options?: { timeoutMs?: number }
  ): Promise<ModelResponse> {
    if (this.needsJsonFallback(modelId)) {
      // Use text mode with JSON extraction
      const response = await this.openRouter.queryModel(
        modelId,
        messages,
        { timeoutMs: options?.timeoutMs }
      );
      
      // Extract JSON from response
      const extracted = this.extractJsonFromText<T>(response.content as string);
      if (extracted) {
        return {
          ...response,
          content: extracted
        };
      }
      
      // If extraction failed, return raw content and let Zod validation handle it
      return response;
    }
    
    // Use native JSON schema mode
    return this.openRouter.queryModelJson<T>(
      modelId,
      messages,
      jsonSchema,
      options
    );
  }

  /**
   * Run the Agent Loop with Meta-Scaffolding (Plan -> Execute -> Verify)
   */
  private async runAgentLoop<T>(
    modelId: string,
    initialMessages: ChatMessage[],
    jsonSchema: object,
    context: { sessionId: string; label: string },
    maxTurns = 5
  ): Promise<ModelResponse> {
    const messages = [...initialMessages];
    
    // Define tools for OpenRouter
    const tools = ALL_TOOLS.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    // Inject Meta-Scaffolding System Prompt
    const metaScaffold = `
*** META-SCAFFOLDING PROTOCOL ACTIVE ***

You are operating under a strict "Plan-Execute-Verify" architecture.
Do NOT attempt to answer the user's question immediately.

PHASE 1: TRIAGE & PLAN
- Identify what information is missing (facts, law, procedural status).
- List specific tools you will use to fill these gaps.
- Do NOT guess. If you need a statute, search for it.

PHASE 2: EXECUTION
- Execute your plan using the provided tools.
- Read the tool outputs carefully.
- If a tool fails, try an alternative query.

PHASE 3: VERIFICATION & SYNTHESIS
- Have you gathered sufficient evidence?
- Does the evidence support your conclusion?
- Only AFTER verification, produce the final JSON analysis.
`;
    
    // Prepend scaffolding to system prompt
    if (messages[0].role === 'system') {
      messages[0].content += metaScaffold;
    } else {
      messages.unshift({ role: 'system', content: metaScaffold });
    }

    for (let turn = 0; turn < maxTurns; turn++) {
      // 1. Query Model
      const response = await this.openRouter.queryModel(modelId, messages, {
        tools,
        toolChoice: 'auto',
        timeoutMs: 120000
      });

      // Track usage
      this.usageTracker?.recordUsage(modelId, 1, response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined);

      // 2. Check for Tool Calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Append assistant's request to history
        messages.push({
          role: 'assistant',
          content: (response.content as string) || '' // Assistant message with tool calls often has null content, but API needs string
          // Note: In a real implementation, we'd need to pass the tool_calls object back in the message
          // but OpenRouter/OpenAI API is strict about message structure. 
          // For now, we'll assume the client handles this or we simulate it.
        });
        
        // Execute tools
        for (const call of response.tool_calls) {
          const tool = ALL_TOOLS.find(t => t.name === call.function.name);
          if (tool) {
            this.emitProgress({
              stage: 1,
              type: 'model-start', // reusing event type
              label: context.label,
              message: `Analyst ${context.label} using tool: ${tool.name}`
            });

            try {
              const args = JSON.parse(call.function.arguments);
              const result = await tool.execute(args, {
                modelId,
                sessionId: context.sessionId,
                projectId: this.project?.id
              });

              // Append tool result
              messages.push({
                role: 'user', // "tool" role is standard, but "user" is safer for broad compatibility if "tool" not supported
                content: `[TOOL RESULT for ${call.function.name}]: ${result}`
              });
            } catch (e) {
               messages.push({
                role: 'user',
                content: `[TOOL ERROR]: ${e instanceof Error ? e.message : String(e)}`
              });
            }
          }
        }
        // Loop continues to next turn
      } else {
        // 3. No tools called? This is the final answer.
        // If we need JSON, we might need one last forced validation pass or just parse it.
        
        // If the model returned text but we need JSON, we try to parse it.
        // If it's the final turn, we accept whatever we got.
        return response;
      }
    }

    // If we ran out of turns, return the last response
    throw new Error('Agent loop exceeded max turns');
  }

  /**
   * Run full council deliberation
   */
  async deliberate(query: CouncilQuery): Promise<CouncilDeliberation> {
    const startTime = Date.now();
    const sessionId = crypto.randomUUID();
    
    // Initialize usage tracking
    this.usageTracker = new UsageTracker(sessionId);
    
    // Initialize audit collector
    this.auditCollector = new AuditCollector(sessionId);

    // Check if query is appropriate for council
    const appropriateCheck = isAppropriateForCouncil(query.query);
    if (!appropriateCheck.appropriate) {
      throw new Error(appropriateCheck.reason);
    }

    // Apply project defaults if set
    if (this.project) {
      if (!query.jurisdiction && this.project.defaultJurisdiction) {
        query.jurisdiction = this.project.defaultJurisdiction;
      }
      if (!query.queryType && this.project.defaultQueryType) {
        query.queryType = this.project.defaultQueryType as CouncilQuery['queryType'];
      }
    }

    // Assign anonymized labels to council members
    const councilMembers = this.assignLabels(this.config.councilModels);

    // Stage 1: Independent Analysis
    this.emitProgress({ stage: 1, type: 'start', message: 'Starting independent analysis...' });
    const stage1 = await this.runStage1(query, councilMembers);
    this.emitProgress({ stage: 1, type: 'complete', message: `${stage1.analyses.length} analyses complete` });
    
    // Quorum check after Stage 1
    const minQuorum = this.config.minimumSeats || DEFAULT_MINIMUM_QUORUM;
    if (stage1.analyses.length < minQuorum) {
      throw new CouncilQuorumError(
        `Council failed to reach quorum. Only ${stage1.analyses.length} of ${councilMembers.length} members responded. Minimum required: ${minQuorum}`,
        stage1.analyses.length,
        minQuorum,
        stage1.errors
      );
    }

    // Stage 2: Anonymized Peer Review
    this.emitProgress({ stage: 2, type: 'start', message: 'Starting anonymized peer review...' });
    const stage2 = await this.runStage2(stage1, councilMembers);
    this.emitProgress({ stage: 2, type: 'complete', message: `${stage2.peerReviews.length} reviews complete` });
    
    // Quorum check after Stage 2
    if (stage2.peerReviews.length < minQuorum) {
      throw new CouncilQuorumError(
        `Peer review failed to reach quorum. Only ${stage2.peerReviews.length} reviews completed. Minimum required: ${minQuorum}`,
        stage2.peerReviews.length,
        minQuorum,
        stage2.errors
      );
    }

    // Select chairman algorithmically (with optional user override)
    const chairmanSelection = selectChairman(
      stage1,
      stage2,
      this.config.chairmanOverrideModel  // undefined = algorithmic selection
    );
    
    // Record chairman selection in audit
    this.auditCollector.recordChairmanSelection({
      method: chairmanSelection.method,
      selectedModel: chairmanSelection.model,
      rationale: chairmanSelection.rationale,
      alternativesConsidered: chairmanSelection.alternativesConsidered
    });

    // Stage 3: Chairman Synthesis (using selected chairman)
    this.emitProgress({ stage: 3, type: 'start', message: `Chairman (${chairmanSelection.method}) synthesizing deliberation...` });
    const stage3 = await this.runStage3WithChairman(query, stage1, stage2, chairmanSelection.model);
    this.emitProgress({ stage: 3, type: 'complete', message: 'Synthesis complete' });

    // Get usage summary
    const usageSummary = this.usageTracker.getSummary();
    
    // Build audit trail
    const audit = this.auditCollector.buildAudit(
      stage1,
      stage2,
      stage3,
      this.config.councilModels
    );

    // Construct final deliberation output
    const deliberation = this.constructDeliberation(
      query,
      sessionId,
      stage1,
      stage2,
      stage3,
      councilMembers,
      Date.now() - startTime,
      usageSummary,
      audit
    );

    return deliberation;
  }

  /**
   * Get current usage (for real-time display)
   */
  getCurrentUsage(): UsageSummary | null {
    return this.usageTracker?.getSummary() ?? null;
  }

  /**
   * Assign anonymized labels (A, B, C, etc.) to council members
   * The mapping is kept internal and not exposed during peer review
   */
  private assignLabels(modelIds: string[]): CouncilMember[] {
    return modelIds.map((modelId, index) => ({
      modelId,
      sessionLabel: String.fromCharCode(65 + index), // A, B, C, D...
      role: 'member' as const
    }));
  }

  /**
   * Get query-type-specific task directive for Stage 1
   */
  private getQueryTypeDirective(queryType?: string): string {
    switch (queryType) {
      case 'issue-spotting':
        return `\nTASK FOCUS: Issue Spotting
Prioritize identifying threshold blockers (jurisdiction, standing, timeliness, preclusion).
Flag procedural defects before substantive analysis.
For each issue: state what's missing and what would cure it.`;
      
      case 'risk-assessment':
        return `\nTASK FOCUS: Risk Assessment
Calibrate likelihood and impact for each identified risk.
Distinguish catastrophic-but-unlikely from probable-but-manageable.
Provide probability ranges where possible, not just high/medium/low.`;
      
      case 'weakness-identification':
        return `\nTASK FOCUS: Weakness Identification
Identify specific vulnerabilities in the position or argument.
For each weakness: describe exactly where it appears and how it could be exploited.
Prioritize by severity and ease of exploitation.`;
      
      case 'strategy-evaluation':
        return `\nTASK FOCUS: Strategy Evaluation
Assess the proposed strategy against alternatives.
Identify assumptions underlying the strategy.
Consider resource requirements, timing, and opponent responses.`;
      
      case 'stress-test':
        return `\nTASK FOCUS: Stress Testing
Assume opposing counsel is highly competent and well-resourced.
Identify the single strongest attack on this position.
For each weakness: assess exploitability (how easily can opponent weaponize this?).`;
      
      case 'devils-advocate':
        return `\nTASK FOCUS: Devil's Advocate
Argue against the position as forcefully as possible.
Identify assumptions that, if false, would collapse the argument.
Find the facts that, if different, would flip the outcome.`;
      
      case 'settlement-evaluation':
        return `\nTASK FOCUS: Settlement Evaluation
Assess litigation risk vs. settlement value.
Identify key uncertainties that affect valuation.
Consider transaction costs, timing, and non-monetary factors.`;
      
      case 'brainstorm':
        return `\nTASK FOCUS: Brainstorming
Generate multiple approaches, even unconventional ones.
Do not self-censor early; quantity over quality initially.
Tag each idea with risk level and required resources.`;
      
      default:
        return '';  // general-deliberation gets no special directive
    }
  }

  /**
   * Build the Stage 3 (Chairman) prompt with exact schema alignment
   */
  private buildStage3Prompt(
    query: CouncilQuery,
    analysesForSynthesis: Array<{ label: string; confidence: string; analysis: unknown }>,
    rankingSummary: Array<{ rank: number; label: string; averageRank: number; consistency: number }>
  ): string {
    return `Synthesize the council deliberation on this issue.

ORIGINAL ISSUE: ${query.query}
${query.jurisdiction ? `\nJURISDICTION: ${query.jurisdiction}` : ''}

STAGE 1 ANALYSES:
${JSON.stringify(analysesForSynthesis, null, 2)}

STAGE 2 PEER RANKINGS:
${JSON.stringify(rankingSummary, null, 2)}

Total council members: ${this.config.councilModels.length}

Respond with JSON matching this EXACT structure:

{
  "consensus": {
    "reached": boolean,
    "position": "string - summary of consensus view or 'No consensus reached'",
    "confidence": number (0.0-1.0),
    "agreementCount": number,
    "totalMembers": number
  },
  "issues": [
    {
      "issue": "string - specific legal issue identified",
      "severity": "critical" | "significant" | "minor",
      "flaggedByCount": number,
      "unanimous": boolean,
      "explanation": "string (optional)"
    }
  ],
  "risk": {
    "overallLevel": "low" | "medium" | "high",
    "factors": [
      {
        "risk": "string - specific risk factor",
        "likelihood": "unlikely" | "possible" | "likely",
        "impact": "low" | "medium" | "high",
        "councilAgreement": "unanimous" | "majority" | "split"
      }
    ],
    "catastrophizingDetected": boolean,
    "understatingDetected": boolean,
    "calibrationNotes": "string"
  },
  "dissent": [
    {
      "position": "string - the dissenting view",
      "reasoning": "string - why this analyst disagreed",
      "supportedByCount": number,
      "noteworthy": boolean
    }
  ],
  "weaknesses": [
    {
      "weakness": "string - specific weakness identified",
      "location": "string (optional) - where in the argument",
      "exploitability": "easily attacked" | "vulnerable" | "minor concern",
      "suggestedFix": "string (optional)"
    }
  ],
  "openQuestions": ["string - questions requiring further research or facts"],
  "actionItems": [
    {
      "item": "string - specific action needed",
      "priority": "high" | "medium" | "low",
      "rationale": "string - why this matters",
      "blocking": boolean
    }
  ],
  "sourceAttribution": [
    {
      "label": "A" | "B" | "C" | etc.,
      "reliedOnFor": ["string - what conclusions this analysis contributed to"]
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Do NOT manufacture false consensus. If analysts disagreed, preserve each position in "dissent".
- For sourceAttribution: identify which analyst labels contributed to each major conclusion.
- Use EXACT enum values shown above (e.g., "easily attacked" not "high").
- Every array can be empty [] if no items apply.`;
  }

  /**
   * Build the Stage 3 (Chairman) system prompt with base system instruction
   */
  private buildStage3SystemPrompt(): string {
    // Get base system instruction (no skills for Stage 3)
    const baseSystemPrompt = getStageSystemPrompt(this.skills, 3);
    
    let systemPrompt = `${baseSystemPrompt}

---

## STAGE 3: CHAIRMAN SYNTHESIS INSTRUCTIONS

You are the Chairman of a Legal Deliberation Council.
Your role is to SYNTHESIZE, not override. Preserve genuine disagreement.
A split council is more useful than false consensus.

Apply the same verification discipline: do not validate or endorse fabricated citations from analysts.
If analysts cited authorities, note whether citations are consistent or conflicting across analyses.

You must respond with valid JSON.`;

    if (this.project) {
      systemPrompt += `\n\n${formatChairmanContext(this.project)}`;
    }
    
    return systemPrompt;
  }

  /**
   * Stage 1: Independent Analysis
   * Each council member analyzes the issue without seeing others' work
   * Uses JSON mode for structured output
   */
  private async runStage1(
    query: CouncilQuery, 
    members: CouncilMember[]
  ): Promise<Stage1Result> {
    const analyses: IndividualAnalysis[] = [];
    const errors: StageError[] = [];

    const contextString = query.context 
      ? `\nContext: ${JSON.stringify(query.context, null, 2)}`
      : '';

    // Get query-type-specific directive
    const taskDirective = this.getQueryTypeDirective(query.queryType);

    // Build work product section if provided (token-budget: first 4000 chars)
    const workProductSection = query.workProduct
      ? `\nWORK PRODUCT TO REVIEW:\n---\n${query.workProduct.slice(0, 4000)}${query.workProduct.length > 4000 ? '\n[... truncated for token budget ...]' : ''}\n---`
      : '';

    // Build system prompt with skills + project context
    const projectContext = this.project ? formatProjectContext(this.project) : undefined;
    const systemPrompt = getStageSystemPrompt(this.skills, 1, projectContext) + 
      `\n\nYou must respond with valid JSON matching the required schema.`;
    
    const userPrompt = `Analyze the following legal issue. Respond ONLY with a JSON object.
${taskDirective}
ISSUE: ${query.query}
${query.jurisdiction ? `\nJURISDICTION: ${query.jurisdiction}` : ''}${query.practiceArea ? `\nPRACTICE AREA: ${query.practiceArea}` : ''}
${contextString}${workProductSection}

Provide your analysis as JSON with these fields:
- assessment: Your core assessment of the legal question (string)
- strengths: Key strengths of the position (array of strings)
- weaknesses: Key weaknesses or vulnerabilities (array of strings)  
- risks: Array of risk objects, each with: risk (string), likelihood (low/medium/high), impact (low/medium/high)
- confidence: Your confidence level (low/medium/high)
- confidenceRationale: Brief justification for confidence (string)
- thresholdIssues: Array of threshold issues checked (jurisdiction, standing, timeliness, etc.)
- adversarialArgument: The strongest argument opposing counsel could make (string)

Apply the attached legal reasoning skills. Be direct. Disagreement with other analysts is expected and valuable.`;

    // Build task factories for concurrent execution with rate limiting
    const analysisTasks = members.map((member) => async (): Promise<IndividualAnalysis | null> => {
      // Record start in audit
      this.auditCollector?.recordStage1Start(member.modelId, member.sessionLabel!);
      
      this.emitProgress({ 
        stage: 1, 
        type: 'model-start', 
        label: member.sessionLabel,
        message: `Analyst ${member.sessionLabel} analyzing...`
      });

      try {
        // Use Agent Loop instead of simple query
        // We ask for JSON schema for the FINAL response, but intermediate steps are free-form
        
        // Note: For the final response, we want to force the schema.
        // Strategy: Run agent loop freely. When it decides to answer, we grab that text.
        // If it's not JSON, we might need a cleanup step.
        // For simplicity in this v1, we'll ask the model to output JSON in its final turn.
        
        const response = await this.runAgentLoop(
          member.modelId,
           [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          stage1JsonSchema,
          { sessionId, label: member.sessionLabel! }
        );

        // Parse the final response content
        const finalContent = response.content as string;
        let finalJson: Stage1Analysis | null = null;
        
        // Try native parsing if it was returned as object (unlikely from agent loop)
        if (typeof response.content === 'object') {
             finalJson = response.content as Stage1Analysis;
        } else {
             finalJson = this.extractJsonFromText<Stage1Analysis>(finalContent);
        }

        // If we still don't have JSON, fail (or retry in v2)
        if (!finalJson) {
             throw new Error("Agent failed to produce valid JSON after investigation");
        }

        // Validate with Zod
        const validated = Stage1AnalysisSchema.safeParse(finalJson);
        
        let analysis: IndividualAnalysis;
        
        if (!validated.success) {
          const rawContent = finalJson as Record<string, unknown>;
          analysis = {
            label: member.sessionLabel!,
            content: JSON.stringify(finalJson, null, 2),
            confidence: (rawContent.confidence as 'low' | 'medium' | 'high') || 'medium',
            keyPoints: this.extractKeyPointsFromAnalysis(rawContent),
            _modelId: member.modelId,
            _structured: finalJson
          } as IndividualAnalysis;
        } else {
          const validatedData = validated.data;
          analysis = {
            label: member.sessionLabel!,
            content: JSON.stringify(validatedData, null, 2),
            confidence: validatedData.confidence,
            keyPoints: [...validatedData.strengths.slice(0, 3), ...validatedData.weaknesses.slice(0, 3)],
            _modelId: member.modelId,
            _structured: validatedData
          } as IndividualAnalysis;
        }
        
        // Record completion in audit
        this.auditCollector?.recordStage1Complete(member.modelId, analysis, response.usage?.total_tokens);
        
        return analysis;

      } catch (error) {
        // Record failure in audit
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.auditCollector?.recordStage1Failure(member.modelId, errorMsg);
        
        this.emitProgress({ 
          stage: 1, 
          type: 'model-error', 
          label: member.sessionLabel,
          message: `Analyst ${member.sessionLabel} failed: ${errorMsg}`
        });

        errors.push({
          stage: 1,
          modelId: member.modelId,
          message: errorMsg,
          recoverable: true
        });
        return null;
      }
    });

    // Execute with concurrency limit to prevent rate limiting
    const results = await withConcurrencyLimit(analysisTasks, this.config.concurrencyLimit);
    
    for (const result of results) {
      if (result) {
        analyses.push(result);
      }
    }

    return {
      analyses,
      complete: analyses.length === members.length,
      errors
    };
  }

  /**
   * Extract key points from a raw analysis object
   */
  private extractKeyPointsFromAnalysis(analysis: Record<string, unknown>): string[] {
    const points: string[] = [];
    
    if (Array.isArray(analysis.strengths)) {
      points.push(...analysis.strengths.slice(0, 3).map(String));
    }
    if (Array.isArray(analysis.weaknesses)) {
      points.push(...analysis.weaknesses.slice(0, 3).map(String));
    }
    
    return points;
  }

  /**
   * Stage 2: Anonymized Peer Review
   * 
   * CRITICAL: This stage must NOT expose model identities.
   * Uses JSON mode for structured output.
   */
  private async runStage2(
    stage1: Stage1Result,
    members: CouncilMember[]
  ): Promise<Stage2Result> {
    const peerReviews: PeerReview[] = [];
    const errors: StageError[] = [];

    // Build ANONYMIZED analyses for review - only labels and content
    const analysesForReview = stage1.analyses.map(a => ({
      label: a.label,
      analysis: a._structured || a.content
    }));

    // Build system prompt with base system instruction (no skills for Stage 2)
    const baseSystemPrompt = getStageSystemPrompt(this.skills, 2);
    const systemPrompt = `${baseSystemPrompt}

---

## STAGE 2: PEER REVIEW INSTRUCTIONS

You are reviewing anonymized legal analyses. Judge only on merit. Do NOT try to guess authorship.
Apply the same verification discipline to your review: do not validate fabricated citations.
You must respond with valid JSON.`;
    
    const userPrompt = `Review these anonymized legal analyses. Do NOT try to guess which model produced each.

ANALYSES:
${JSON.stringify(analysesForReview, null, 2)}

Respond with JSON containing:
- evaluations: Object with analysis labels (A, B, etc.) as keys, each containing:
  - legalAccuracy (1-5)
  - issueIdentification (1-5)  
  - riskCalibration (1-5) - neither catastrophizing nor dismissive
  - practicalUtility (1-5)
  - comment (optional string)
- ranking: Array of analysis labels ordered best to worst (e.g., ["B", "A", "C"])
- rankingRationale: Brief explanation for your ranking`;

    // Build task factories for concurrent execution with rate limiting
    const reviewTasks = members.map((member) => async (): Promise<PeerReview | null> => {
      this.emitProgress({ 
        stage: 2, 
        type: 'model-start', 
        label: member.sessionLabel,
        message: `Reviewer ${member.sessionLabel} evaluating...`
      });

      try {
        const response = await this.queryModelWithFallback<Stage2Review>(
          member.modelId,
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          stage2JsonSchema,
          { timeoutMs: 120000 }
        );

        // Track usage (always record, even if usage data missing)
        this.usageTracker?.recordUsage(member.modelId, 2, response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined);

        this.emitProgress({ 
          stage: 2, 
          type: 'model-complete', 
          label: member.sessionLabel,
          message: `Reviewer ${member.sessionLabel} complete`
        });

        // Validate with Zod
        const validated = Stage2ReviewSchema.safeParse(response.content);
        
        if (!validated.success) {
          const raw = response.content as Record<string, unknown>;
          return {
            reviewerLabel: member.sessionLabel!,
            evaluations: (raw.evaluations as Record<string, unknown>) || {},
            ranking: Array.isArray(raw.ranking) ? raw.ranking.map(String) : stage1.analyses.map(a => a.label),
            rankingRationale: typeof raw.rankingRationale === 'string' ? raw.rankingRationale : 'Rationale not provided',
            _reviewerModelId: member.modelId
          } as PeerReview;
        }

        return {
          reviewerLabel: member.sessionLabel!,
          evaluations: validated.data.evaluations,
          ranking: validated.data.ranking,
          rankingRationale: validated.data.rankingRationale,
          _reviewerModelId: member.modelId
        } as PeerReview;

      } catch (error) {
        this.emitProgress({ 
          stage: 2, 
          type: 'model-error', 
          label: member.sessionLabel,
          message: `Reviewer ${member.sessionLabel} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });

        errors.push({
          stage: 2,
          modelId: member.modelId,
          message: error instanceof Error ? error.message : 'Unknown error',
          recoverable: true
        });
        return null;
      }
    });

    // Execute with concurrency limit to prevent rate limiting
    const results = await withConcurrencyLimit(reviewTasks, this.config.concurrencyLimit);
    
    for (const result of results) {
      if (result) {
        peerReviews.push(result);
      }
    }

    // Calculate aggregate rankings
    const aggregateRankings = this.calculateAggregateRankings(peerReviews, stage1.analyses);

    return {
      peerReviews,
      aggregateRankings,
      complete: peerReviews.length === members.length,
      errors
    };
  }

  /**
   * Stage 3: Chairman Synthesis
   * 
   * Uses JSON mode for structured output.
   * The chairman SYNTHESIZES but does NOT override. Dissent must be preserved.
   */
  private async runStage3(
    query: CouncilQuery,
    stage1: Stage1Result,
    stage2: Stage2Result
  ): Promise<Stage3Result> {
    const errors: StageError[] = [];

    // Build structured input for chairman
    const analysesForSynthesis = stage1.analyses.map(a => ({
      label: a.label,
      confidence: a.confidence,
      analysis: a._structured || a.content
    }));

    const rankingSummary = stage2.aggregateRankings
      .sort((a, b) => a.averageRank - b.averageRank)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        averageRank: r.averageRank,
        consistency: r.rankingConsistency
      }));

    // Build system prompt with base system instruction + chairman instructions
    const systemPrompt = this.buildStage3SystemPrompt();

    const userPrompt = this.buildStage3Prompt(query, analysesForSynthesis, rankingSummary);

    this.emitProgress({ 
      stage: 3, 
      type: 'model-start', 
      message: `Chairman synthesizing...`
    });

    try {
      const response = await this.queryModelWithFallback<Stage3Synthesis>(
        this.config.fallbackChairmanModel,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stage3JsonSchema,
        { timeoutMs: 180000 }  // Chairman gets more time
      );

      // Track usage (always record, even if usage data missing)
      this.usageTracker?.recordUsage(this.config.fallbackChairmanModel, 3, response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined);

      this.emitProgress({ 
        stage: 3, 
        type: 'model-complete', 
        message: `Chairman synthesis complete`
      });

      // Validate with Zod
      const validated = Stage3SynthesisSchema.safeParse(response.content);
      
      if (!validated.success) {
        return {
          synthesis: this.extractPartialSynthesis(response.content as Record<string, unknown>),
          chairmanModel: this.config.fallbackChairmanModel,
          complete: true,
          errors: [{
            stage: 3,
            message: 'Chairman response did not fully validate, using partial extraction',
            recoverable: true
          }]
        };
      }

      return {
        synthesis: validated.data,
        chairmanModel: this.config.fallbackChairmanModel,
        complete: true,
        errors
      };

    } catch (error) {
      this.emitProgress({ 
        stage: 3, 
        type: 'model-error', 
        message: `Chairman failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      errors.push({
        stage: 3,
        modelId: this.config.fallbackChairmanModel,
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false
      });

      return {
        synthesis: this.getEmptySynthesis(),
        chairmanModel: this.config.fallbackChairmanModel,
        complete: false,
        errors
      };
    }
  }

  /**
   * Stage 3: Chairman Synthesis with explicit chairman model
   * 
   * Uses algorithmically selected chairman instead of config default.
   */
  private async runStage3WithChairman(
    query: CouncilQuery,
    stage1: Stage1Result,
    stage2: Stage2Result,
    chairmanModel: string
  ): Promise<Stage3Result> {
    const errors: StageError[] = [];

    // Build structured input for chairman
    const analysesForSynthesis = stage1.analyses.map(a => ({
      label: a.label,
      confidence: a.confidence,
      analysis: a._structured || a.content
    }));

    const rankingSummary = stage2.aggregateRankings
      .sort((a, b) => a.averageRank - b.averageRank)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        averageRank: r.averageRank,
        consistency: r.rankingConsistency
      }));

    // Build system prompt with base system instruction + chairman instructions
    const systemPrompt = this.buildStage3SystemPrompt();

    const userPrompt = this.buildStage3Prompt(query, analysesForSynthesis, rankingSummary);

    this.emitProgress({ 
      stage: 3, 
      type: 'model-start', 
      message: `Chairman synthesizing...`
    });

    try {
      const response = await this.queryModelWithFallback<Stage3Synthesis>(
        chairmanModel,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stage3JsonSchema,
        { timeoutMs: 180000 }  // Chairman gets more time
      );

      // Track usage (always record, even if usage data missing)
      this.usageTracker?.recordUsage(chairmanModel, 3, response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined);

      this.emitProgress({ 
        stage: 3, 
        type: 'model-complete', 
        message: `Chairman synthesis complete`
      });

      // Validate with Zod
      const validated = Stage3SynthesisSchema.safeParse(response.content);
      
      if (!validated.success) {
        return {
          synthesis: this.extractPartialSynthesis(response.content as Record<string, unknown>),
          chairmanModel,
          complete: true,
          errors: [{
            stage: 3,
            message: 'Chairman response did not fully validate, using partial extraction',
            recoverable: true
          }]
        };
      }

      return {
        synthesis: validated.data,
        chairmanModel,
        complete: true,
        errors
      };

    } catch (error) {
      this.emitProgress({ 
        stage: 3, 
        type: 'model-error', 
        message: `Chairman failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      errors.push({
        stage: 3,
        modelId: chairmanModel,
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false
      });

      return {
        synthesis: this.getEmptySynthesis(),
        chairmanModel,
        complete: false,
        errors
      };
    }
  }

  /**
   * Extract partial synthesis from raw response when validation fails
   */
  private extractPartialSynthesis(raw: Record<string, unknown>): Stage3Synthesis {
    const empty = this.getEmptySynthesis();
    
    try {
      return {
        consensus: {
          reached: Boolean((raw.consensus as Record<string, unknown>)?.reached),
          position: String((raw.consensus as Record<string, unknown>)?.position || ''),
          confidence: Number((raw.consensus as Record<string, unknown>)?.confidence) || 0,
          agreementCount: Number((raw.consensus as Record<string, unknown>)?.agreementCount) || 0,
          totalMembers: this.config.councilModels.length
        },
        issues: Array.isArray(raw.issues) ? raw.issues as IdentifiedIssue[] : [],
        risk: {
          overallLevel: (raw.risk as Record<string, unknown>)?.overallLevel as 'low' | 'medium' | 'high' || 'medium',
          factors: Array.isArray((raw.risk as Record<string, unknown>)?.factors) 
            ? (raw.risk as Record<string, unknown>).factors as CalibratedRisk['factors']
            : [],
          catastrophizingDetected: Boolean((raw.risk as Record<string, unknown>)?.catastrophizingDetected),
          understatingDetected: Boolean((raw.risk as Record<string, unknown>)?.understatingDetected),
          calibrationNotes: String((raw.risk as Record<string, unknown>)?.calibrationNotes || '')
        },
        dissent: Array.isArray(raw.dissent) ? raw.dissent as DissentingView[] : [],
        weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses : [],
        openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions.map(String) : [],
        actionItems: Array.isArray(raw.actionItems) ? raw.actionItems as ActionItem[] : []
      };
    } catch {
      return empty;
    }
  }

  /**
   * Calculate aggregate rankings from peer reviews
   */
  private calculateAggregateRankings(
    reviews: PeerReview[], 
    analyses: IndividualAnalysis[]
  ): AggregateRanking[] {
    const rankings: AggregateRanking[] = [];

    for (const analysis of analyses) {
      const positions: number[] = [];
      
      for (const review of reviews) {
        const pos = review.ranking.indexOf(analysis.label);
        if (pos !== -1) {
          positions.push(pos + 1);  // 1-indexed rank
        }
      }

      if (positions.length > 0) {
        const avgRank = positions.reduce((a, b) => a + b, 0) / positions.length;
        const variance = positions.reduce((sum, p) => sum + Math.pow(p - avgRank, 2), 0) / positions.length;
        const maxVariance = Math.pow(analyses.length - 1, 2);
        const consistency = maxVariance > 0 ? 1 - (variance / maxVariance) : 1;

        rankings.push({
          label: analysis.label,
          averageRank: avgRank,
          rankingConsistency: Math.max(0, consistency)
        });
      }
    }

    return rankings.sort((a, b) => a.averageRank - b.averageRank);
  }

  /**
   * Construct the final deliberation output
   */
  private constructDeliberation(
    query: CouncilQuery,
    sessionId: string,
    stage1: Stage1Result,
    stage2: Stage2Result,
    stage3: Stage3Result,
    members: CouncilMember[],
    durationMs: number,
    usageSummary?: UsageSummary,
    audit?: CouncilAudit
  ): CouncilDeliberation {
    const synthesis = stage3.synthesis;

    return {
      query: query.query,
      queryType: query.queryType,
      sessionId,
      timestamp: new Date().toISOString(),

      consensus: synthesis.consensus,
      issuesIdentified: synthesis.issues,
      riskAssessment: synthesis.risk,
      dissent: synthesis.dissent,
      weaknessesFound: synthesis.weaknesses,
      openQuestions: synthesis.openQuestions,
      actionItems: synthesis.actionItems,

      _stageResults: {
        stage1,
        stage2,
        stage3
      },

      metadata: {
        durationMs,
        participatingModels: members.filter(m => 
          stage1.analyses.some(a => a._modelId === m.modelId)
        ).map(m => m.modelId),
        chairmanModel: stage3.chairmanModel,  // Use actual chairman from stage3
        estimatedTokens: usageSummary?.totalTokens ?? this.estimateTokens(stage1, stage2, stage3),
        estimatedCostUsd: usageSummary?.totalCost ?? this.estimateCost(stage1, stage2, stage3),
        debateRounds: 1
      },

      // Include full usage breakdown if available
      _usage: usageSummary,
      
      // Include audit trail
      _audit: audit
    };
  }

  /**
   * Get empty synthesis for error cases
   */
  private getEmptySynthesis(): Stage3Synthesis {
    return {
      consensus: {
        reached: false,
        position: 'Synthesis failed - see errors',
        confidence: 0,
        agreementCount: 0,
        totalMembers: this.config.councilModels.length
      },
      issues: [],
      risk: {
        overallLevel: 'medium',
        factors: [],
        catastrophizingDetected: false,
        understatingDetected: false,
        calibrationNotes: 'Unable to complete risk assessment'
      },
      dissent: [],
      weaknesses: [],
      openQuestions: [],
      actionItems: []
    };
  }

  /**
   * Estimate token usage
   */
  private estimateTokens(
    stage1: Stage1Result, 
    stage2: Stage2Result, 
    stage3: Stage3Result
  ): number {
    let chars = 0;
    
    for (const a of stage1.analyses) {
      chars += a.content.length;
    }
    for (const r of stage2.peerReviews) {
      chars += JSON.stringify(r.evaluations).length;
    }
    if (stage3.synthesis) {
      chars += JSON.stringify(stage3.synthesis).length;
    }

    return Math.ceil(chars / 4);
  }

  /**
   * Estimate cost
   */
  private estimateCost(
    stage1: Stage1Result, 
    stage2: Stage2Result, 
    stage3: Stage3Result
  ): number {
    const tokens = this.estimateTokens(stage1, stage2, stage3);
    return (tokens / 1000) * 0.015;
  }
}

/**
 * Custom error for quorum failures
 */
export class CouncilQuorumError extends Error {
  actualCount: number;
  requiredCount: number;
  underlyingErrors: StageError[];

  constructor(
    message: string, 
    actualCount: number, 
    requiredCount: number, 
    underlyingErrors: StageError[]
  ) {
    super(message);
    this.name = 'CouncilQuorumError';
    this.actualCount = actualCount;
    this.requiredCount = requiredCount;
    this.underlyingErrors = underlyingErrors;
  }
}
