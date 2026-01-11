#!/usr/bin/env node
/**
 * LLM Legal Council - CLI Interface
 * 
 * Usage:
 *   npx tsx src/cli.ts "Your legal question here"
 *   npx tsx src/cli.ts --project ./project.json "Your question"
 *   npx tsx src/cli.ts --interactive
 *   npx tsx src/cli.ts --create-project my-project
 * 
 * Environment:
 *   OPENROUTER_API_KEY - Required (can be in .env file)
 *   COUNCIL_MODEL_1..5 - Optional model overrides
 *   CHAIRMAN_MODEL - Optional chairman override
 */

import 'dotenv/config';
import chalk from 'chalk';
import { program } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

import { LegalCouncilOrchestrator, CouncilQuorumError, ProgressEvent } from './council/orchestrator.js';
import { createOpenRouterClient } from './council/openrouter.js';
import { loadCouncilConfig, validateConfig, ConfigurationError, councilUseCases, isAppropriateForCouncil, CouncilConfig } from './config.js';
import { CouncilQuery, CouncilQueryType, CouncilDeliberation } from './types.js';
import { loadProject, createProjectTemplate, saveProject, ProjectError, LoadedProject } from './project.js';
import { formatUsageSummary, UsageSummary } from './usage.js';
import {
  createNotebookLMClient,
  validateNotebookLMConfig,
  deliberationToPodcastRequest,
  NotebookLMError,
  NotebookLMAuthError,
  PodcastOperationState,
} from './notebooklm/index.js';

/**
 * Validate configuration and show helpful errors
 */
function checkConfiguration(): void {
  const validation = validateConfig();
  
  if (validation.warnings.length > 0) {
    for (const warning of validation.warnings) {
      console.log(chalk.yellow(`⚠ ${warning}`));
    }
  }
  
  if (!validation.valid) {
    console.log(chalk.red('\nConfiguration Error:'));
    for (const error of validation.errors) {
      console.log(chalk.red(`  • ${error}`));
    }
    console.log();
    console.log(chalk.dim('Create a .env file with your configuration:'));
    console.log(chalk.dim('  OPENROUTER_API_KEY=your_key_here'));
    console.log(chalk.dim('  COUNCIL_MODEL_1=provider/model-name-1'));
    console.log(chalk.dim('  COUNCIL_MODEL_2=provider/model-name-2'));
    console.log(chalk.dim('  COUNCIL_MODEL_3=provider/model-name-3'));
    console.log(chalk.dim('  CHAIRMAN_MODEL=provider/model-name'));
    process.exit(1);
  }
}

function logSection(title: string): void {
  console.log();
  console.log(chalk.cyan('═'.repeat(60)));
  console.log(chalk.bold(`  ${title}`));
  console.log(chalk.cyan('═'.repeat(60)));
}

/**
 * Display progress during deliberation
 */
function createProgressHandler(): (event: ProgressEvent) => void {
  const stageNames: Record<number, string> = { 0: 'Init', 1: 'Analysis', 2: 'Peer Review', 3: 'Synthesis' };
  
  return (event: ProgressEvent) => {
    const stageName = stageNames[event.stage] || 'Unknown';
    
    switch (event.type) {
      case 'start':
        if (event.stage === 0) {
          console.log(chalk.dim(`  ${event.message}`));
        } else {
          console.log(chalk.blue(`\n▶ Stage ${event.stage} (${stageName}): ${event.message}`));
        }
        break;
      case 'model-start':
        process.stdout.write(chalk.dim(`  ◦ ${event.message}`));
        break;
      case 'model-complete':
        process.stdout.write(chalk.green(' ✓\n'));
        break;
      case 'model-error':
        process.stdout.write(chalk.red(` ✗ ${event.message}\n`));
        break;
      case 'complete':
        console.log(chalk.green(`✓ Stage ${event.stage} complete: ${event.message}`));
        break;
    }
  };
}

function formatDeliberation(result: CouncilDeliberation): void {
  logSection('COUNCIL DELIBERATION COMPLETE');
  
  console.log();
  console.log(chalk.dim(`Session ID: ${result.sessionId}`));
  console.log(chalk.dim(`Duration: ${(result.metadata.durationMs / 1000).toFixed(1)}s`));
  console.log(chalk.dim(`Models: ${result.metadata.participatingModels.length} council members + chairman`));

  // Consensus
  logSection('CONSENSUS');
  if (result.consensus.reached) {
    console.log(chalk.green(`✓ Consensus reached (confidence: ${(result.consensus.confidence * 100).toFixed(0)}%)`));
    console.log();
    console.log(result.consensus.position);
  } else {
    console.log(chalk.yellow(`✗ No consensus reached`));
    if (result.consensus.position) {
      console.log();
      console.log(result.consensus.position);
    }
  }

  // Issues Identified
  if (result.issuesIdentified.length > 0) {
    logSection('ISSUES IDENTIFIED');
    for (const issue of result.issuesIdentified) {
      const color = issue.severity === 'critical' ? chalk.red : 
                    issue.severity === 'significant' ? chalk.yellow : chalk.dim;
      console.log(color(`[${issue.severity.toUpperCase()}] ${issue.issue}`));
    }
  }

  // Risk Assessment
  logSection('RISK ASSESSMENT');
  const riskColor = result.riskAssessment.overallLevel === 'high' ? chalk.red :
                    result.riskAssessment.overallLevel === 'medium' ? chalk.yellow : chalk.green;
  console.log(riskColor(`Overall Risk: ${result.riskAssessment.overallLevel.toUpperCase()}`));
  
  if (result.riskAssessment.catastrophizingDetected) {
    console.log(chalk.yellow(`⚠ Catastrophizing detected in some analyses - risk may be overstated`));
  }
  if (result.riskAssessment.understatingDetected) {
    console.log(chalk.yellow(`⚠ Risk understating detected in some analyses`));
  }
  
  if (result.riskAssessment.factors.length > 0) {
    console.log();
    console.log(chalk.bold('Risk Factors:'));
    for (const factor of result.riskAssessment.factors) {
      console.log(`  • ${factor.risk}`);
    }
  }

  // Dissenting Views
  if (result.dissent.length > 0) {
    logSection('DISSENTING VIEWS');
    console.log(chalk.dim('(Preserved for your consideration - not overridden by consensus)'));
    console.log();
    for (const dissent of result.dissent) {
      console.log(chalk.magenta(`• ${dissent.position}`));
      if (dissent.reasoning) {
        console.log(chalk.dim(`  Reasoning: ${dissent.reasoning}`));
      }
    }
  }

  // Weaknesses Found
  if (result.weaknessesFound.length > 0) {
    logSection('WEAKNESSES FOUND');
    for (const weakness of result.weaknessesFound) {
      console.log(chalk.yellow(`• ${weakness.weakness}`));
      if (weakness.suggestedFix) {
        console.log(chalk.dim(`  → Fix: ${weakness.suggestedFix}`));
      }
    }
  }

  // Open Questions
  if (result.openQuestions.length > 0) {
    logSection('OPEN QUESTIONS');
    for (const question of result.openQuestions) {
      console.log(`  ? ${question}`);
    }
  }

  // Action Items
  if (result.actionItems.length > 0) {
    logSection('ACTION ITEMS');
    for (const item of result.actionItems) {
      const prioritySymbol = item.priority === 'high' ? '❗' : 
                             item.priority === 'medium' ? '•' : '○';
      const blockingTag = item.blocking ? ' [BLOCKING]' : '';
      const color = item.priority === 'high' ? chalk.red : chalk.white;
      console.log(color(`${prioritySymbol} ${item.item}${blockingTag}`));
    }
  }

  // Token Usage Summary
  if (result._usage) {
    logSection('TOKEN USAGE');
    console.log(formatUsageSummary(result._usage));
  } else {
    // Fallback to basic estimates
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.dim(`Estimated tokens: ${result.metadata.estimatedTokens.toLocaleString()}`));
    console.log(chalk.dim(`Estimated cost: $${result.metadata.estimatedCostUsd.toFixed(4)}`));
  }
}

async function runDeliberation(
  query: string, 
  options: {
    queryType?: CouncilQueryType;
    project?: LoadedProject;
    showProgress?: boolean;
  } = {}
): Promise<void> {
  // Validate configuration first
  checkConfiguration();
  
  const apiKey = process.env.OPENROUTER_API_KEY!;  // Already validated

  // Check if query is appropriate
  const check = isAppropriateForCouncil(query);
  if (!check.appropriate) {
    console.log(chalk.red('✗ This query is not appropriate for council deliberation'));
    console.log(chalk.dim(check.reason || ''));
    console.log();
    console.log(chalk.dim('The council is for deliberation and critique, not document drafting.'));
    console.log(chalk.dim('Appropriate uses:'));
    for (const use of councilUseCases.appropriate.slice(0, 5)) {
      console.log(chalk.dim(`  • ${use}`));
    }
    console.log();
    console.log(chalk.dim('For drafting tasks, use an attorney agent instead.'));
    process.exit(1);
  }

  console.log(chalk.cyan('Initializing Legal Council...'));
  
  // Load configuration from environment
  let config: CouncilConfig;
  try {
    config = loadCouncilConfig();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.log(chalk.red(`\nConfiguration Error:\n${error.message}`));
      process.exit(1);
    }
    throw error;
  }
  
  // Display council composition
  console.log(chalk.dim(`Council seats: ${config.councilModels.length}`));
  for (let i = 0; i < config.councilModels.length; i++) {
    console.log(chalk.dim(`  Seat ${i + 1}: ${config.councilModels[i]}`));
  }
  if (config.chairmanOverrideModel) {
    console.log(chalk.dim(`Chairman: ${config.chairmanOverrideModel} (user override)`));
  } else {
    console.log(chalk.dim(`Chairman: algorithmic selection (highest-ranked analyst)`));
  }
  
  // Display project info if loaded
  if (options.project) {
    console.log(chalk.cyan(`Project: ${options.project.name}`));
    if (options.project.defaultJurisdiction) {
      console.log(chalk.dim(`Jurisdiction: ${options.project.defaultJurisdiction}`));
    }
    if (options.project._loadedFiles.length > 0) {
      console.log(chalk.dim(`Files: ${options.project._loadedFiles.length} loaded (${options.project._totalFileTokens} tokens)`));
    }
  }
  
  const openRouter = createOpenRouterClient(apiKey);
  const orchestrator = new LegalCouncilOrchestrator(openRouter, config, {
    project: options.project,
    onProgress: options.showProgress !== false ? createProgressHandler() : undefined
  });

  const councilQuery: CouncilQuery = {
    query,
    queryType: options.queryType || 'general-deliberation',
    jurisdiction: options.project?.defaultJurisdiction || config.legalContext.defaultJurisdiction
  };

  console.log(chalk.dim(`Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`));

  try {
    const result = await orchestrator.deliberate(councilQuery);
    formatDeliberation(result);
  } catch (error) {
    if (error instanceof CouncilQuorumError) {
      console.log(chalk.red(`\nQuorum Error: ${error.message}`));
      console.log(chalk.dim(`Received: ${error.actualCount}, Required: ${error.requiredCount}`));
      if (error.underlyingErrors.length > 0) {
        console.log(chalk.dim('Underlying errors:'));
        for (const e of error.underlyingErrors) {
          console.log(chalk.dim(`  - ${e.modelId}: ${e.message}`));
        }
      }
    } else {
      console.log(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    process.exit(1);
  }
}

async function runInteractive(project?: LoadedProject): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  logSection('LLM LEGAL COUNCIL - Interactive Mode');
  console.log(chalk.dim('Enter your legal questions for council deliberation.'));
  console.log(chalk.dim('Type "exit" to quit, "help" for usage info.'));
  
  if (project) {
    console.log(chalk.cyan(`\nProject loaded: ${project.name}`));
  }
  
  console.log();

  const prompt = (): void => {
    rl.question(chalk.cyan('Council> '), async (input) => {
      const trimmed = input.trim();
      
      if (trimmed.toLowerCase() === 'exit') {
        console.log(chalk.dim('Goodbye.'));
        rl.close();
        process.exit(0);
      }
      
      if (trimmed.toLowerCase() === 'help') {
        console.log();
        console.log(chalk.bold('The Legal Council provides multi-model deliberation for:'));
        for (const use of councilUseCases.appropriate) {
          console.log(chalk.dim(`  • ${use}`));
        }
        console.log();
        console.log(chalk.bold('NOT for:'));
        for (const use of councilUseCases.inappropriate) {
          console.log(chalk.dim(`  • ${use}`));
        }
        console.log();
        prompt();
        return;
      }
      
      if (trimmed.length < 10) {
        console.log(chalk.yellow('Please enter a substantive legal question.'));
        prompt();
        return;
      }

      await runDeliberation(trimmed, { project });
      console.log();
      prompt();
    });
  };

  prompt();
}

async function createProject(name: string, jurisdiction?: string): Promise<void> {
  const template = createProjectTemplate(name, jurisdiction);
  const filename = `${template.id}.json`;

  if (fs.existsSync(filename)) {
    console.log(chalk.red(`Error: File already exists: ${filename}`));
    process.exit(1);
  }

  saveProject(template, filename);
  console.log(chalk.green(`Created project file: ${filename}`));
  console.log(chalk.dim('Edit this file to customize your project instructions and add files.'));
}

// ============================================================================
// Podcast Generation
// ============================================================================

/**
 * Display podcast generation progress
 */
function createPodcastProgressHandler(): (state: PodcastOperationState, progress?: number) => void {
  return (state: PodcastOperationState, progress?: number) => {
    const progressStr = progress !== undefined ? ` (${progress}%)` : '';
    switch (state) {
      case 'PENDING':
        process.stdout.write(chalk.dim(`  ◦ Queued for generation${progressStr}\r`));
        break;
      case 'RUNNING':
        process.stdout.write(chalk.blue(`  ▶ Generating podcast${progressStr}\r`));
        break;
      case 'SUCCEEDED':
        console.log(chalk.green(`  ✓ Generation complete${progressStr}`));
        break;
      case 'FAILED':
        console.log(chalk.red(`  ✗ Generation failed`));
        break;
      case 'CANCELLED':
        console.log(chalk.yellow(`  ⚠ Generation cancelled`));
        break;
      default:
        process.stdout.write(chalk.dim(`  ◦ ${state}${progressStr}\r`));
    }
  };
}

/**
 * Generate a podcast from a deliberation
 */
async function generatePodcast(
  deliberation: CouncilDeliberation,
  options: {
    output?: string;
    title?: string;
    length?: 'SHORT' | 'STANDARD';
    language?: string;
    focus?: string;
  } = {}
): Promise<void> {
  // Validate NotebookLM configuration
  const validation = validateNotebookLMConfig();

  if (validation.warnings.length > 0) {
    for (const warning of validation.warnings) {
      console.log(chalk.yellow(`⚠ ${warning}`));
    }
  }

  if (!validation.valid) {
    console.log(chalk.red('\nNotebookLM Configuration Error:'));
    for (const error of validation.errors) {
      console.log(chalk.red(`  • ${error}`));
    }
    console.log();
    console.log(chalk.dim('Required environment variables:'));
    console.log(chalk.dim('  GOOGLE_CLOUD_PROJECT_ID=your_project_id'));
    console.log(chalk.dim(''));
    console.log(chalk.dim('Authentication (one of):'));
    console.log(chalk.dim('  GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json'));
    console.log(chalk.dim('  NOTEBOOKLM_ACCESS_TOKEN=your_access_token'));
    console.log(chalk.dim('  Or: gcloud auth login && gcloud auth application-default login'));
    process.exit(1);
  }

  logSection('PODCAST GENERATION');
  console.log(chalk.cyan('Initializing NotebookLM client...'));

  try {
    const client = createNotebookLMClient();

    // Convert deliberation to podcast request
    const request = deliberationToPodcastRequest(deliberation, {
      title: options.title,
      length: options.length || 'STANDARD',
      languageCode: options.language || 'en-US',
      focus: options.focus,
      includeDissent: true,
      includeActionItems: true,
      includeRiskDetails: true,
    });

    console.log(chalk.dim(`Title: ${request.title}`));
    console.log(chalk.dim(`Length: ${request.podcastConfig.length}`));
    console.log(chalk.dim(`Language: ${request.podcastConfig.languageCode}`));

    // Determine output path
    const outputPath = options.output || `podcast-${deliberation.sessionId}.mp3`;
    console.log(chalk.dim(`Output: ${outputPath}`));
    console.log();

    console.log(chalk.blue('▶ Starting podcast generation...'));
    console.log(chalk.dim('  This may take several minutes.'));
    console.log();

    const result = await client.generateAndDownload(request, {
      outputPath,
      onProgress: createPodcastProgressHandler(),
    });

    if (result.success) {
      console.log();
      logSection('PODCAST GENERATED');
      console.log(chalk.green(`✓ Audio saved to: ${result.audioFilePath}`));
      if (result.durationSeconds) {
        const minutes = Math.floor(result.durationSeconds / 60);
        const seconds = Math.round(result.durationSeconds % 60);
        console.log(chalk.dim(`  Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`));
      }
      console.log();
      console.log(chalk.dim('You can play this file with any audio player or share it with your team.'));
    } else {
      console.log(chalk.red(`\n✗ Podcast generation failed: ${result.error}`));
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof NotebookLMAuthError) {
      console.log(chalk.red(`\nAuthentication Error: ${error.message}`));
      console.log(chalk.dim('Ensure your Google Cloud credentials are properly configured.'));
    } else if (error instanceof NotebookLMError) {
      console.log(chalk.red(`\nNotebookLM Error: ${error.message}`));
    } else {
      console.log(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    process.exit(1);
  }
}

/**
 * Load a deliberation from a JSON file
 */
function loadDeliberation(filePath: string): CouncilDeliberation {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  // Basic validation
  if (!data.sessionId || !data.query || !data.consensus) {
    throw new Error('Invalid deliberation file: missing required fields');
  }

  return data as CouncilDeliberation;
}

// CLI setup with commander
program
  .name('legal-council')
  .description('Multi-model LLM deliberation system for legal analysis')
  .version('0.6.0')
  .argument('[query...]', 'Legal question to deliberate on')
  .option('-f, --file <path>', 'Read question from file')
  .option('-i, --interactive', 'Interactive mode')
  .option('-p, --project <path>', 'Load project configuration file')
  .option('-t, --type <type>', 'Query type (issue-spotting, risk-assessment, stress-test, etc.)', 'general-deliberation')
  .option('--no-progress', 'Disable progress output')
  .option('--create-project <name>', 'Create a new project template')
  .option('--jurisdiction <jx>', 'Set jurisdiction for new project (use with --create-project)')
  .option('--save-result <path>', 'Save deliberation result to JSON file')
  .action(async (queryParts: string[], options) => {
    // Handle project creation
    if (options.createProject) {
      await createProject(options.createProject, options.jurisdiction);
      return;
    }

    // Load project if specified
    let project: LoadedProject | undefined;
    if (options.project) {
      try {
        project = await loadProject(options.project);
        console.log(chalk.green(`Loaded project: ${project.name}`));
      } catch (error) {
        if (error instanceof ProjectError) {
          console.log(chalk.red(`Project error: ${error.message}`));
        } else {
          console.log(chalk.red(`Failed to load project: ${error}`));
        }
        process.exit(1);
      }
    }

    if (options.interactive) {
      await runInteractive(project);
      return;
    }

    if (options.file) {
      if (!fs.existsSync(options.file)) {
        console.log(chalk.red(`Error: File not found: ${options.file}`));
        process.exit(1);
      }
      const query = fs.readFileSync(options.file, 'utf-8').trim();
      await runDeliberation(query, {
        queryType: options.type as CouncilQueryType,
        project,
        showProgress: options.progress,
      });
      return;
    }

    if (queryParts.length === 0) {
      program.help();
      return;
    }

    const query = queryParts.join(' ');
    await runDeliberation(query, {
      queryType: options.type as CouncilQueryType,
      project,
      showProgress: options.progress,
    });
  });

// Podcast subcommand
program
  .command('podcast <deliberation-file>')
  .description('Generate an AI podcast from a saved deliberation JSON file')
  .option('-o, --output <path>', 'Output MP3 file path')
  .option('-t, --title <title>', 'Podcast title')
  .option('-l, --length <length>', 'Podcast length: SHORT (4-5 min) or STANDARD (~10 min)', 'STANDARD')
  .option('--language <code>', 'Language code (e.g., en-US, es, fr)', 'en-US')
  .option('--focus <prompt>', 'Focus prompt for podcast content')
  .action(async (deliberationFile: string, options) => {
    try {
      console.log(chalk.cyan(`Loading deliberation from: ${deliberationFile}`));
      const deliberation = loadDeliberation(deliberationFile);
      console.log(chalk.dim(`Session ID: ${deliberation.sessionId}`));
      console.log(chalk.dim(`Query: "${deliberation.query.substring(0, 60)}..."`));

      await generatePodcast(deliberation, {
        output: options.output,
        title: options.title,
        length: options.length?.toUpperCase() as 'SHORT' | 'STANDARD',
        language: options.language,
        focus: options.focus,
      });
    } catch (error) {
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

// Podcast config validation subcommand
program
  .command('podcast-config')
  .description('Validate NotebookLM/Google Cloud configuration')
  .action(() => {
    logSection('NOTEBOOKLM CONFIGURATION CHECK');

    const validation = validateNotebookLMConfig();

    console.log();
    if (validation.valid) {
      console.log(chalk.green('✓ Configuration is valid'));
    } else {
      console.log(chalk.red('✗ Configuration has errors:'));
      for (const error of validation.errors) {
        console.log(chalk.red(`  • ${error}`));
      }
    }

    if (validation.warnings.length > 0) {
      console.log();
      console.log(chalk.yellow('Warnings:'));
      for (const warning of validation.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning}`));
      }
    }

    console.log();
    console.log(chalk.bold('Current Configuration:'));
    console.log(chalk.dim(`  GOOGLE_CLOUD_PROJECT_ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID || '(not set)'}`));
    console.log(chalk.dim(`  GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)'}`));
    console.log(chalk.dim(`  NOTEBOOKLM_ACCESS_TOKEN: ${process.env.NOTEBOOKLM_ACCESS_TOKEN ? '(set)' : '(not set)'}`));
    console.log(chalk.dim(`  NOTEBOOKLM_REGION: ${process.env.NOTEBOOKLM_REGION || 'global (default)'}`));
    console.log(chalk.dim(`  NOTEBOOKLM_DEFAULT_LENGTH: ${process.env.NOTEBOOKLM_DEFAULT_LENGTH || 'STANDARD (default)'}`));
    console.log(chalk.dim(`  NOTEBOOKLM_DEFAULT_LANGUAGE: ${process.env.NOTEBOOKLM_DEFAULT_LANGUAGE || 'en-US (default)'}`));

    if (!validation.valid) {
      process.exit(1);
    }
  });

program.parse();
