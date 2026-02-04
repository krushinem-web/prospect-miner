/**
 * DISCOVER Stage
 * Goal: Identify businesses within defined niches and geographies
 */

import { BaseStage, StageResult } from '../base-stage';
import { RawBusinessData } from '../../state/types';
import { rawDiscoveryService } from '../../state/raw-discovery-service';
import { logger } from '../../lib/logger';
import { SourceConfig } from '../../config/types';
import { chunk, sleep, RateLimiter } from '../../lib/utils';

// Source handler interface
export interface SourceHandler {
  discover(source: SourceConfig, limit?: number): AsyncGenerator<RawBusinessData>;
}

// Registry of source handlers - MUST be initialized before any imports that use it
const sourceHandlers: Map<string, SourceHandler> = new Map();

export function registerSourceHandler(type: string, handler: SourceHandler): void {
  sourceHandlers.set(type, handler);
}

// Import source handlers after registry is created
import './sources/yelp';
import './sources/google-places';

export class DiscoverStage extends BaseStage {
  private sourceName?: string;
  private limit?: number;

  constructor(sourceName?: string, limit?: number) {
    super('discover');
    this.sourceName = sourceName;
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
  }

  protected async execute(): Promise<void> {
    const sources = this.config.sources.filter((s) => {
      if (!s.enabled) return false;
      if (this.sourceName && s.name !== this.sourceName) return false;
      return true;
    });

    if (sources.length === 0) {
      logger.warn('No enabled sources to discover from');
      return;
    }

    logger.info(`Discovering from ${sources.length} source(s)`, {
      sources: sources.map((s) => s.name),
    });

    let totalDiscovered = 0;

    for (const source of sources) {
      if (this.limit && totalDiscovered >= this.limit) {
        logger.info('Reached discovery limit', { limit: this.limit });
        break;
      }

      const handler = sourceHandlers.get(source.type);
      if (!handler) {
        logger.warn(`No handler for source type: ${source.type}`, { source: source.name });
        continue;
      }

      logger.info(`Discovering from source: ${source.name}`, { type: source.type });

      const rateLimiter = new RateLimiter(source.rateLimit || 60, 60000);
      const batch: RawBusinessData[] = [];
      const batchSize = this.config.pipeline.batchSize;

      try {
        for await (const business of handler.discover(source, this.limit ? this.limit - totalDiscovered : undefined)) {
          await rateLimiter.acquire();

          batch.push(business);
          this.processed++;

          if (batch.length >= batchSize) {
            const count = rawDiscoveryService.addBulk(this.getRunId(), source.name, batch);
            totalDiscovered += count;
            this.passed += count;
            batch.length = 0;
            this.updateProgress();
          }

          if (this.limit && totalDiscovered + batch.length >= this.limit) {
            break;
          }
        }

        // Flush remaining batch
        if (batch.length > 0) {
          const count = rawDiscoveryService.addBulk(this.getRunId(), source.name, batch);
          totalDiscovered += count;
          this.passed += count;
        }

        logger.info(`Source complete: ${source.name}`, { discovered: totalDiscovered });
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    logger.info('Discovery complete', { totalDiscovered });
  }
}

// Export for CLI
export { DiscoverStage as default };
