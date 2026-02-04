/**
 * Refresh command
 */

import { RefreshStage } from '../../stages/refresh';
import { logger } from '../../lib/logger';

export interface RefreshOptions {
  limit?: number;
}

export async function runRefresh(options: RefreshOptions): Promise<void> {
  logger.info('Starting REFRESH stage', { options });

  const stage = new RefreshStage(options.limit);
  const result = await stage.runStage();

  if (!result.success) {
    throw new Error(`Refresh failed: ${result.errors.join(', ')}`);
  }

  logger.info('REFRESH complete', {
    processed: result.processed,
    refreshed: result.passed,
    failed: result.failed,
  });
}
