/**
 * Score command
 */

import { ScoreStage } from '../../stages/score';
import { logger } from '../../lib/logger';

export interface ScoreOptions {
  limit?: number;
}

export async function runScore(options: ScoreOptions): Promise<void> {
  logger.info('Starting SCORE stage', { options });

  const stage = new ScoreStage(options.limit);
  const result = await stage.runStage();

  if (!result.success) {
    throw new Error(`Score failed: ${result.errors.join(', ')}`);
  }

  logger.info('SCORE complete', {
    processed: result.processed,
    passed: result.passed,
    failed: result.failed,
  });
}
