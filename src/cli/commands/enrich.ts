/**
 * Enrich command
 */

import { EnrichStage } from '../../stages/enrich';
import { logger } from '../../lib/logger';

export interface EnrichOptions {
  limit?: number;
  browser?: boolean;
}

export async function runEnrich(options: EnrichOptions): Promise<void> {
  logger.info('Starting ENRICH stage', { options });

  const stage = new EnrichStage(options.limit, options.browser !== false);
  const result = await stage.runStage();

  if (!result.success) {
    throw new Error(`Enrich failed: ${result.errors.join(', ')}`);
  }

  logger.info('ENRICH complete', {
    processed: result.processed,
    passed: result.passed,
    failed: result.failed,
  });
}
