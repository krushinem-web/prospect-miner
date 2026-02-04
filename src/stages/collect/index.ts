/**
 * COLLECT Stage
 * Goal: Normalize, canonicalize, and deduplicate records deterministically
 */

import { BaseStage } from '../base-stage';
import { rawDiscoveryService } from '../../state/raw-discovery-service';
import { leadService, generateLeadId, canonicalizeName } from '../../state/lead-service';
import { logger } from '../../lib/logger';
import { chunk } from '../../lib/utils';

export class CollectStage extends BaseStage {
  private runId?: string;
  private limit?: number;

  constructor(runId?: string, limit?: number) {
    super('collect');
    this.runId = runId;
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
  }

  protected async execute(): Promise<void> {
    // Get unprocessed raw discoveries
    const discoveries = rawDiscoveryService.getUnprocessed(this.runId, this.limit);

    if (discoveries.length === 0) {
      logger.info('No raw discoveries to collect');
      return;
    }

    logger.info(`Collecting ${discoveries.length} raw discoveries`);

    const batchSize = this.config.pipeline.batchSize;
    const batches = chunk(discoveries, batchSize);
    const seenIds = new Set<string>();

    for (const batch of batches) {
      const processedIds: number[] = [];

      for (const discovery of batch) {
        this.processed++;

        try {
          const raw = discovery.rawData;

          // Canonicalize the business name
          const canonicalName = canonicalizeName(raw.name);

          // Generate stable lead ID
          const leadId = generateLeadId(canonicalName, raw.city, raw.state, raw.country);

          // Skip if we've already processed this lead in this run
          if (seenIds.has(leadId)) {
            logger.debug(`Skipping duplicate: ${leadId}`);
            processedIds.push(discovery.id!);
            continue;
          }
          seenIds.add(leadId);

          // Upsert the lead (will update timestamps if exists)
          leadService.createFromRaw(raw, discovery.source, this.getRunId());

          // Update status to collected
          leadService.updateStatus(leadId, 'collected');

          this.passed++;
          processedIds.push(discovery.id!);
        } catch (error) {
          logger.warn(`Failed to collect discovery ${discovery.id}`, {
            error: String(error),
          });
          this.failed++;
          processedIds.push(discovery.id!);
        }
      }

      // Mark batch as processed
      rawDiscoveryService.markProcessedBulk(processedIds);
      this.updateProgress();
    }

    logger.info('Collection complete', {
      processed: this.processed,
      passed: this.passed,
      duplicates: this.processed - this.passed - this.failed,
    });
  }
}

export { CollectStage as default };
