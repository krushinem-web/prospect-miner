/**
 * Collect command
 */

import { CollectStage } from '../../stages/collect';
import { logger } from '../../lib/logger';

export interface CollectOptions {
  runId?: string;
  limit?: number;
}

export async function runCollect(options: CollectOptions): Promise<void> {
  logger.info('Starting COLLECT stage', { options });

  const stage = new CollectStage(options.runId, options.limit);
  const result = await stage.runStage();

  if (!result.success) {
    throw new Error(`Collect failed: ${result.errors.join(', ')}`);
  }

  logger.info('COLLECT complete', {
    processed: result.processed,
    passed: result.passed,
    failed: result.failed,
  });
}
