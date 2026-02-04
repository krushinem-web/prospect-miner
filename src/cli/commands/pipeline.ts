/**
 * Pipeline command - run full pipeline
 */

import { logger } from '../../lib/logger';
import { runDiscover } from './discover';
import { runCollect } from './collect';
import { runFilter } from './filter';
import { runEnrich } from './enrich';
import { runScore } from './score';
import { runOutput } from './output';

export interface PipelineOptions {
  skipDiscover?: boolean;
  skipEnrich?: boolean;
  limit?: number;
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  logger.info('Starting full pipeline run', { options });

  const stageOptions = { limit: options.limit };

  // Stage 1: Discover
  if (!options.skipDiscover) {
    logger.info('=== Stage 1: DISCOVER ===');
    await runDiscover(stageOptions);
  } else {
    logger.info('Skipping DISCOVER stage');
  }

  // Stage 2: Collect
  logger.info('=== Stage 2: COLLECT ===');
  await runCollect(stageOptions);

  // Stage 3: Filter
  logger.info('=== Stage 3: FILTER ===');
  await runFilter(stageOptions);

  // Stage 4: Enrich
  if (!options.skipEnrich) {
    logger.info('=== Stage 4: ENRICH ===');
    await runEnrich({ ...stageOptions, browser: true });
  } else {
    logger.info('Skipping ENRICH stage');
  }

  // Stage 5: Score
  logger.info('=== Stage 5: SCORE ===');
  await runScore(stageOptions);

  // Stage 6: Output
  logger.info('=== Stage 6: OUTPUT ===');
  await runOutput(stageOptions);

  logger.info('Pipeline completed successfully');
}
