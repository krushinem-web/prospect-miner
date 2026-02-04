/**
 * Discover command
 */

import { DiscoverStage } from '../../stages/discover';
// Import source handlers to register them
import '../../stages/discover/sources';
import { logger } from '../../lib/logger';

export interface DiscoverOptions {
  source?: string;
  limit?: number;
}

export async function runDiscover(options: DiscoverOptions): Promise<void> {
  logger.info('Starting DISCOVER stage', { options });

  const stage = new DiscoverStage(options.source, options.limit);
  const result = await stage.runStage({
    sources: options.source ? [options.source] : undefined,
  });

  if (!result.success) {
    throw new Error(`Discover failed: ${result.errors.join(', ')}`);
  }

  logger.info('DISCOVER complete', {
    processed: result.processed,
    passed: result.passed,
    failed: result.failed,
  });
}
