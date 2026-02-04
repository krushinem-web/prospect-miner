#!/usr/bin/env node
/**
 * Prospect Miner CLI
 * Entry point for running pipeline stages
 */

import { Command } from 'commander';
import { logger } from '../lib/logger';
import { getConfig, reloadConfig } from '../config';
import { leadService, runService } from '../state';
import { closeDatabase, initDatabase } from '../state/database';

// Import stage runners
import { runDiscover } from './commands/discover';
import { runCollect } from './commands/collect';
import { runFilter } from './commands/filter';
import { runEnrich } from './commands/enrich';
import { runScore } from './commands/score';
import { runOutput } from './commands/output';
import { runRefresh } from './commands/refresh';
import { runPipeline } from './commands/pipeline';
import { showStats } from './commands/stats';

const program = new Command();

program
  .name('prospect-miner')
  .description('Deterministic B2B prospect mining system')
  .version('1.0.0');

// Discover stage
program
  .command('discover')
  .description('Discover businesses from configured sources')
  .option('-s, --source <name>', 'Run only this source')
  .option('-l, --limit <number>', 'Maximum leads to discover', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runDiscover(options);
    } catch (error) {
      logger.error('Discover failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Collect stage
program
  .command('collect')
  .description('Normalize, canonicalize, and dedupe raw discoveries')
  .option('-r, --run-id <id>', 'Process discoveries from specific run')
  .option('-l, --limit <number>', 'Maximum records to process', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runCollect(options);
    } catch (error) {
      logger.error('Collect failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Filter stage
program
  .command('filter')
  .description('Apply rule-based filters to eliminate unlikely leads')
  .option('-l, --limit <number>', 'Maximum leads to filter', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runFilter(options);
    } catch (error) {
      logger.error('Filter failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Enrich stage
program
  .command('enrich')
  .description('Scrape websites to collect contact information')
  .option('-l, --limit <number>', 'Maximum leads to enrich', parseInt)
  .option('--no-browser', 'Skip browser-based scraping')
  .action(async (options) => {
    try {
      await initDatabase();
      await runEnrich(options);
    } catch (error) {
      logger.error('Enrich failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Score stage
program
  .command('score')
  .description('Compute scores and assign outreach angles')
  .option('-l, --limit <number>', 'Maximum leads to score', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runScore(options);
    } catch (error) {
      logger.error('Score failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Output stage
program
  .command('output')
  .description('Export campaign-ready leads')
  .option('-f, --format <format>', 'Output format (csv, json, both)')
  .option('-l, --limit <number>', 'Maximum leads to export', parseInt)
  .option('-m, --min-score <number>', 'Minimum score to include', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runOutput(options);
    } catch (error) {
      logger.error('Output failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Refresh stage
program
  .command('refresh')
  .description('Re-evaluate leads for re-entry into the pipeline')
  .option('-l, --limit <number>', 'Maximum leads to refresh', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runRefresh(options);
    } catch (error) {
      logger.error('Refresh failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Full pipeline
program
  .command('pipeline')
  .description('Run the full pipeline: discover → collect → filter → enrich → score → output')
  .option('--skip-discover', 'Skip discovery stage')
  .option('--skip-enrich', 'Skip enrichment stage')
  .option('-l, --limit <number>', 'Maximum leads per stage', parseInt)
  .action(async (options) => {
    try {
      await initDatabase();
      await runPipeline(options);
    } catch (error) {
      logger.error('Pipeline failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Stats command
program
  .command('stats')
  .description('Show pipeline statistics')
  .action(async () => {
    try {
      await initDatabase();
      await showStats();
    } catch (error) {
      logger.error('Stats failed', { error: String(error) });
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Config command
program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const config = getConfig();
    console.log(JSON.stringify(config, null, 2));
  });

// Reload config
program
  .command('reload-config')
  .description('Reload configuration from disk')
  .action(() => {
    reloadConfig();
    logger.info('Configuration reloaded');
  });

program.parse();
