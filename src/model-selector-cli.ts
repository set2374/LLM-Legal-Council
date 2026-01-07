#!/usr/bin/env node
/**
 * Model Selector CLI for LLM Legal Council
 *
 * Interactive tool for browsing, analyzing, and selecting council models.
 *
 * Usage:
 *   npx tsx src/model-selector-cli.ts list
 *   npx tsx src/model-selector-cli.ts list --recommended
 *   npx tsx src/model-selector-cli.ts list --chairman
 *   npx tsx src/model-selector-cli.ts info anthropic/claude-sonnet-4
 *   npx tsx src/model-selector-cli.ts recommend
 *   npx tsx src/model-selector-cli.ts validate
 *   npx tsx src/model-selector-cli.ts configure --interactive
 */

import 'dotenv/config';
import chalk from 'chalk';
import { program } from 'commander';
import * as readline from 'readline';

import {
  createModelSelector,
  ModelSelector,
  OpenRouterModel,
  CouncilConfiguration,
} from './models/index.js';

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function logSection(title: string): void {
  console.log();
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.bold(`  ${title}`));
  console.log(chalk.cyan('═'.repeat(70)));
}

function formatPrice(model: OpenRouterModel): string {
  const prompt = model.pricing.promptPerMillion;
  const completion = model.pricing.completionPerMillion;

  if (prompt === 0 && completion === 0) {
    return chalk.green('FREE');
  }

  return `$${prompt.toFixed(2)}/${completion.toFixed(2)} per M`;
}

function formatTier(tier: OpenRouterModel['tier']): string {
  const colors = {
    frontier: chalk.magenta,
    flagship: chalk.blue,
    standard: chalk.white,
    budget: chalk.yellow,
    free: chalk.green,
  };
  return colors[tier](tier.toUpperCase());
}

function formatScore(score: number | undefined): string {
  if (!score) return chalk.dim('N/A');
  if (score >= 8) return chalk.green(`${score}/10`);
  if (score >= 6) return chalk.yellow(`${score}/10`);
  return chalk.red(`${score}/10`);
}

function formatRole(role: string | undefined): string {
  if (!role) return '';

  const roleColors: Record<string, (s: string) => string> = {
    'lead-analyst': chalk.blue,
    'red-team': chalk.red,
    'judge': chalk.magenta,
    'contrarian': chalk.yellow,
    'chairman': chalk.cyan,
    'generalist': chalk.white,
  };

  return (roleColors[role] || chalk.white)(role);
}

function displayModel(model: OpenRouterModel, verbose: boolean = false): void {
  const analysis = model.councilAnalysis;

  // Header line
  const recommended = model.legalCouncilRecommended ? chalk.green(' ✓ RECOMMENDED') : '';
  const chairmanBadge = analysis?.chairmanSuitable ? chalk.cyan(' 👑 Chairman') : '';

  console.log();
  console.log(chalk.bold(model.id) + recommended + chairmanBadge);
  console.log(chalk.dim(`  ${model.name} by ${model.provider}`));

  // Specs line
  const tier = formatTier(model.tier);
  const price = formatPrice(model);
  const context = `${(model.contextLength / 1000).toFixed(0)}K ctx`;
  const maxOut = model.maxOutputTokens ? `${(model.maxOutputTokens / 1000).toFixed(0)}K max` : '';

  console.log(`  ${tier} | ${price} | ${context}${maxOut ? ' | ' + maxOut : ''}`);

  // Council analysis
  if (analysis) {
    const score = formatScore(analysis.councilScore);
    const role = formatRole(analysis.recommendedRole);
    console.log(`  Council Score: ${score} | Role: ${role}`);
  }

  // Capabilities
  const caps = model.capabilities;
  const capList = [];
  if (caps.functionCalling) capList.push('tools');
  if (caps.jsonMode) capList.push('json');
  if (caps.vision) capList.push('vision');
  if (caps.streaming) capList.push('stream');
  console.log(chalk.dim(`  Capabilities: ${capList.join(', ')}`));

  // Verbose output
  if (verbose && analysis) {
    console.log();
    console.log(chalk.green('  Strengths:'));
    for (const s of analysis.strengths.slice(0, 5)) {
      console.log(chalk.green(`    + ${s}`));
    }

    console.log(chalk.red('  Weaknesses:'));
    for (const w of analysis.weaknesses.slice(0, 3)) {
      console.log(chalk.red(`    - ${w}`));
    }

    console.log();
    console.log(chalk.dim(`  ${analysis.summary}`));
  }
}

function displayModelCompact(model: OpenRouterModel): void {
  const analysis = model.councilAnalysis;
  const score = analysis?.councilScore ? `[${analysis.councilScore}]` : '   ';
  const rec = model.legalCouncilRecommended ? chalk.green('✓') : ' ';
  const chr = analysis?.chairmanSuitable ? chalk.cyan('👑') : '  ';
  const role = analysis?.recommendedRole ? analysis.recommendedRole.substring(0, 8).padEnd(8) : '        ';
  const price = formatPrice(model).padEnd(20);

  console.log(
    `${rec} ${chr} ${score} ${model.id.padEnd(35)} ${formatTier(model.tier).padEnd(15)} ${price} ${chalk.dim(role)}`
  );
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

async function listModels(options: {
  recommended?: boolean;
  chairman?: boolean;
  role?: string;
  tier?: string;
  verbose?: boolean;
  compact?: boolean;
}): Promise<void> {
  console.log(chalk.dim('Fetching models from OpenRouter...'));

  const apiKey = process.env.OPENROUTER_API_KEY;
  const selector = await createModelSelector(apiKey);
  let models = selector.getAllModels();

  // Apply filters
  if (options.recommended) {
    models = models.filter(m => m.legalCouncilRecommended);
  }

  if (options.chairman) {
    models = models.filter(m => m.councilAnalysis?.chairmanSuitable);
  }

  if (options.role) {
    models = models.filter(m => m.councilAnalysis?.recommendedRole === options.role);
  }

  if (options.tier) {
    const tiers = options.tier.split(',');
    models = models.filter(m => tiers.includes(m.tier));
  }

  // Sort by council score (descending)
  models.sort((a, b) => {
    const scoreA = a.councilAnalysis?.councilScore || 0;
    const scoreB = b.councilAnalysis?.councilScore || 0;
    return scoreB - scoreA;
  });

  logSection(`Available Models (${models.length} total)`);

  if (options.compact) {
    console.log();
    console.log(chalk.dim('  ✓ 👑 [Score] Model ID                             Tier            Price                Role'));
    console.log(chalk.dim('  ─'.repeat(50)));

    for (const model of models) {
      displayModelCompact(model);
    }
  } else {
    for (const model of models) {
      displayModel(model, options.verbose);
    }
  }

  console.log();
  console.log(chalk.dim(`Showing ${models.length} models. Use --recommended to filter to council-suitable models.`));
}

async function showModelInfo(modelId: string): Promise<void> {
  console.log(chalk.dim('Fetching model information...'));

  const apiKey = process.env.OPENROUTER_API_KEY;
  const selector = await createModelSelector(apiKey);
  const model = selector.getModel(modelId);

  if (!model) {
    console.log(chalk.red(`Model not found: ${modelId}`));
    console.log(chalk.dim('Use "list" command to see available models.'));
    process.exit(1);
  }

  logSection('Model Details');
  displayModel(model, true);

  // Full pricing breakdown
  console.log();
  console.log(chalk.bold('Pricing:'));
  console.log(`  Input:  $${model.pricing.promptPerMillion.toFixed(4)} per million tokens`);
  console.log(`  Output: $${model.pricing.completionPerMillion.toFixed(4)} per million tokens`);
  if (model.pricing.requestFee) {
    console.log(`  Per Request: $${model.pricing.requestFee.toFixed(4)}`);
  }

  // Estimate cost per deliberation (if this model used for all seats)
  console.log();
  console.log(chalk.bold('Estimated Cost (if used for entire council):'));
  const config: CouncilConfiguration = {
    seatA: modelId,
    seatB: modelId,
    seatC: modelId,
    seatD: modelId,
    chairman: modelId,
  };
  const pricing = selector.getConfigPricingSummary(config);
  console.log(`  ~$${pricing.estimatedCostPerDeliberation.toFixed(4)} per deliberation`);
}

async function showRecommendation(): Promise<void> {
  console.log(chalk.dim('Loading recommended configuration...'));

  const apiKey = process.env.OPENROUTER_API_KEY;
  const selector = await createModelSelector(apiKey);
  const rec = selector.getRecommendedConfig();

  logSection('Recommended Council Configuration');

  console.log();
  console.log(chalk.bold('Seat A (Lead Analyst):'));
  const seatA = selector.getModel(rec.seatA);
  if (seatA) displayModel(seatA, false);

  console.log();
  console.log(chalk.bold('Seat B (Red Team):'));
  const seatB = selector.getModel(rec.seatB);
  if (seatB) displayModel(seatB, false);

  console.log();
  console.log(chalk.bold('Seat C (Judge):'));
  const seatC = selector.getModel(rec.seatC);
  if (seatC) displayModel(seatC, false);

  console.log();
  console.log(chalk.bold('Seat D (Contrarian):'));
  const seatD = selector.getModel(rec.seatD);
  if (seatD) displayModel(seatD, false);

  console.log();
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.bold('  Chairman (Synthesis):'));
  const chairman = selector.getModel(rec.chairman);
  if (chairman) displayModel(chairman, false);

  // Pricing summary
  console.log();
  logSection('Pricing Summary');
  const pricing = selector.getConfigPricingSummary({
    seatA: rec.seatA,
    seatB: rec.seatB,
    seatC: rec.seatC,
    seatD: rec.seatD,
    chairman: rec.chairman,
  });

  console.log();
  console.log(chalk.bold(`Estimated cost per deliberation: $${pricing.estimatedCostPerDeliberation.toFixed(4)}`));
  console.log();
  console.log('Breakdown:');
  for (const [model, costs] of Object.entries(pricing.breakdown)) {
    const total = costs.promptCost + costs.completionCost;
    console.log(`  ${model.padEnd(40)} $${total.toFixed(4)}`);
  }

  // Rationale
  logSection('Rationale');
  console.log();
  console.log(rec.rationale);

  // Environment variable output
  logSection('Environment Variables');
  console.log();
  console.log(chalk.dim('Add to your .env file:'));
  console.log();
  console.log(`COUNCIL_MODEL_1=${rec.seatA}`);
  console.log(`COUNCIL_MODEL_2=${rec.seatB}`);
  console.log(`COUNCIL_MODEL_3=${rec.seatC}`);
  console.log(`COUNCIL_MODEL_4=${rec.seatD}`);
  console.log(`CHAIRMAN_MODEL=${rec.chairman}`);
}

async function validateConfig(): Promise<void> {
  console.log(chalk.dim('Validating current configuration...'));

  const apiKey = process.env.OPENROUTER_API_KEY;
  const selector = await createModelSelector(apiKey);

  // Read current config from environment
  const config: CouncilConfiguration = {
    seatA: process.env.COUNCIL_MODEL_1 || '',
    seatB: process.env.COUNCIL_MODEL_2 || '',
    seatC: process.env.COUNCIL_MODEL_3 || '',
    seatD: process.env.COUNCIL_MODEL_4,
    chairman: process.env.CHAIRMAN_MODEL || process.env.COUNCIL_MODEL_1 || '',
  };

  logSection('Current Configuration');

  console.log();
  console.log(`Seat A: ${config.seatA || chalk.red('(not set)')}`);
  console.log(`Seat B: ${config.seatB || chalk.red('(not set)')}`);
  console.log(`Seat C: ${config.seatC || chalk.red('(not set)')}`);
  console.log(`Seat D: ${config.seatD || chalk.dim('(optional, not set)')}`);
  console.log(`Chairman: ${config.chairman || chalk.dim('(will use algorithmic selection)')}`);

  if (!config.seatA || !config.seatB) {
    console.log();
    console.log(chalk.red('ERROR: Minimum 2 council models required.'));
    console.log(chalk.dim('Set COUNCIL_MODEL_1 and COUNCIL_MODEL_2 in your .env file.'));
    process.exit(1);
  }

  const validation = selector.validateConfig(config);

  logSection('Validation Results');

  if (validation.errors.length > 0) {
    console.log();
    console.log(chalk.red('ERRORS:'));
    for (const error of validation.errors) {
      console.log(chalk.red(`  ✗ ${error}`));
    }
  }

  if (validation.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow('WARNINGS:'));
    for (const warning of validation.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warning}`));
    }
  }

  if (validation.valid && validation.warnings.length === 0) {
    console.log();
    console.log(chalk.green('✓ Configuration is valid and recommended.'));
  } else if (validation.valid) {
    console.log();
    console.log(chalk.yellow('⚠ Configuration is valid but has warnings.'));
  } else {
    console.log();
    console.log(chalk.red('✗ Configuration has errors. Please fix before running deliberations.'));
    process.exit(1);
  }

  // Show pricing
  const pricing = selector.getConfigPricingSummary(config);
  console.log();
  console.log(chalk.bold(`Estimated cost per deliberation: $${pricing.estimatedCostPerDeliberation.toFixed(4)}`));
}

async function interactiveConfigure(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const selector = await createModelSelector(apiKey);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  logSection('Interactive Council Configuration');

  console.log();
  console.log(chalk.dim('This wizard will help you configure your Legal Council.'));
  console.log(chalk.dim('You can skip any seat by pressing Enter.'));
  console.log();

  // Get recommended models for each role
  const leadModels = selector.getModelsForRole('lead-analyst').slice(0, 5);
  const redTeamModels = selector.getModelsForRole('red-team').slice(0, 5);
  const judgeModels = selector.getModelsForRole('judge').slice(0, 5);
  const contrarianModels = selector.getModelsForRole('contrarian').slice(0, 5);
  const chairmanModels = selector.getChairmanModels().slice(0, 5);

  console.log(chalk.bold('Seat A - Lead Analyst'));
  console.log(chalk.dim('Recommended models:'));
  leadModels.forEach((m, i) => console.log(`  ${i + 1}. ${m.id}`));
  const seatA = await question(chalk.cyan('Enter model ID (or number): '));

  console.log();
  console.log(chalk.bold('Seat B - Red Team'));
  console.log(chalk.dim('Recommended models:'));
  redTeamModels.forEach((m, i) => console.log(`  ${i + 1}. ${m.id}`));
  const seatB = await question(chalk.cyan('Enter model ID (or number): '));

  console.log();
  console.log(chalk.bold('Seat C - Judge'));
  console.log(chalk.dim('Recommended models:'));
  judgeModels.forEach((m, i) => console.log(`  ${i + 1}. ${m.id}`));
  const seatC = await question(chalk.cyan('Enter model ID (or number): '));

  console.log();
  console.log(chalk.bold('Seat D - Contrarian (Optional)'));
  console.log(chalk.dim('Recommended models:'));
  contrarianModels.forEach((m, i) => console.log(`  ${i + 1}. ${m.id}`));
  const seatD = await question(chalk.cyan('Enter model ID (or press Enter to skip): '));

  console.log();
  console.log(chalk.bold('Chairman - Synthesis'));
  console.log(chalk.dim('Recommended models:'));
  chairmanModels.forEach((m, i) => console.log(`  ${i + 1}. ${m.id}`));
  const chairman = await question(chalk.cyan('Enter model ID (or press Enter for algorithmic selection): '));

  rl.close();

  // Resolve numbers to model IDs
  const resolveSelection = (input: string, models: OpenRouterModel[]): string => {
    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= models.length) {
      return models[num - 1].id;
    }
    return input;
  };

  const config: CouncilConfiguration = {
    seatA: resolveSelection(seatA, leadModels) || leadModels[0]?.id || '',
    seatB: resolveSelection(seatB, redTeamModels) || redTeamModels[0]?.id || '',
    seatC: resolveSelection(seatC, judgeModels) || judgeModels[0]?.id || '',
    seatD: seatD ? resolveSelection(seatD, contrarianModels) : undefined,
    chairman: chairman ? resolveSelection(chairman, chairmanModels) : config.seatA || '',
  };

  logSection('Your Configuration');
  console.log();
  console.log(`COUNCIL_MODEL_1=${config.seatA}`);
  console.log(`COUNCIL_MODEL_2=${config.seatB}`);
  console.log(`COUNCIL_MODEL_3=${config.seatC}`);
  if (config.seatD) {
    console.log(`COUNCIL_MODEL_4=${config.seatD}`);
  }
  if (config.chairman && config.chairman !== config.seatA) {
    console.log(`CHAIRMAN_MODEL=${config.chairman}`);
  }

  // Validate
  const validation = selector.validateConfig(config);
  if (!validation.valid) {
    console.log();
    console.log(chalk.red('Configuration has errors:'));
    validation.errors.forEach(e => console.log(chalk.red(`  ✗ ${e}`)));
  }

  // Pricing
  const pricing = selector.getConfigPricingSummary(config);
  console.log();
  console.log(chalk.bold(`Estimated cost per deliberation: $${pricing.estimatedCostPerDeliberation.toFixed(4)}`));
}

// ============================================================================
// CLI SETUP
// ============================================================================

program
  .name('model-selector')
  .description('Model selection and configuration for LLM Legal Council')
  .version('0.1.0');

program
  .command('list')
  .description('List available models')
  .option('-r, --recommended', 'Show only council-recommended models')
  .option('-c, --chairman', 'Show only chairman-suitable models')
  .option('--role <role>', 'Filter by recommended role (lead-analyst, red-team, judge, contrarian)')
  .option('--tier <tiers>', 'Filter by tier (frontier, flagship, standard, budget, free)')
  .option('-v, --verbose', 'Show detailed analysis for each model')
  .option('--compact', 'Show compact table view')
  .action(listModels);

program
  .command('info <modelId>')
  .description('Show detailed information for a specific model')
  .action(showModelInfo);

program
  .command('recommend')
  .description('Show recommended council configuration')
  .action(showRecommendation);

program
  .command('validate')
  .description('Validate current configuration from environment')
  .action(validateConfig);

program
  .command('configure')
  .description('Interactive configuration wizard')
  .option('-i, --interactive', 'Run interactive configuration')
  .action(interactiveConfigure);

program.parse();
