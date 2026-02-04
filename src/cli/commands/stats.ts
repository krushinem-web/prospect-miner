/**
 * Stats command - show pipeline statistics
 */

import { leadService, runService } from '../../state';
import { logger } from '../../lib/logger';

export async function showStats(): Promise<void> {
  logger.info('Gathering statistics...');

  // Lead statistics
  const leadStats = leadService.getStats();
  console.log('\n=== Lead Statistics ===');
  console.log(`Total leads: ${leadStats.total}`);
  for (const [status, count] of Object.entries(leadStats)) {
    if (status !== 'total') {
      console.log(`  ${status}: ${count}`);
    }
  }

  // Run statistics
  const runStats = runService.getStats();
  console.log('\n=== Run Statistics by Stage ===');
  for (const [stage, stats] of Object.entries(runStats)) {
    console.log(`${stage}:`);
    console.log(`  Total runs: ${stats.total}`);
    console.log(`  Completed: ${stats.completed}`);
    console.log(`  Failed: ${stats.failed}`);
  }

  // Recent runs
  const recentRuns = runService.getRecent(5);
  console.log('\n=== Recent Runs ===');
  for (const run of recentRuns) {
    const status = run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : '...';
    const date = new Date(run.startedAt).toISOString();
    console.log(
      `[${status}] ${run.stage} @ ${date} - ${run.leadsProcessed} processed, ${run.leadsPassed} passed`
    );
  }

  console.log('');
}
