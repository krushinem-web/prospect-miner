/**
 * Filter command
 */

import { FilterStage } from '../../stages/filter';
import { logger } from '../../lib/logger';

export interface FilterOptions {
  limit?: number;
}

export async function runFilter(options: FilterOptions): Promise<void> {
  logger.info('Starting FILTER stage', { options });

  const stage = new FilterStage(options.limit);
  const result = await stage.runStage({
    filters: ['rules', 'categories', 'keywords'],
  });

  if (!result.success) {
    throw new Error(`Filter failed: ${result.errors.join(', ')}`);
  }

  logger.info('FILTER complete', {
    processed: result.processed,
    passed: result.passed,
    excluded: result.failed,
  });
}
