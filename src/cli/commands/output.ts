/**
 * Output command
 */

import { OutputStage } from '../../stages/output';
import { logger } from '../../lib/logger';

export interface OutputOptions {
  format?: 'csv' | 'json' | 'both';
  limit?: number;
  minScore?: number;
}

export async function runOutput(options: OutputOptions): Promise<void> {
  logger.info('Starting OUTPUT stage', { options });

  const stage = new OutputStage(options.limit, options.format, options.minScore);
  const result = await stage.runStage();

  if (!result.success) {
    throw new Error(`Output failed: ${result.errors.join(', ')}`);
  }

  logger.info('OUTPUT complete', {
    processed: result.processed,
    exported: result.passed,
    failed: result.failed,
  });
}
