/**
 * Base stage class - all pipeline stages extend this
 * Provides common functionality for logging, run tracking, and error handling
 */

import { Run, StageName, RunMetadata } from '../state/types';
import { runService } from '../state/run-service';
import { logger } from '../lib/logger';
import { getConfig, ProspectMinerConfig } from '../config';

export interface StageResult {
  success: boolean;
  processed: number;
  passed: number;
  failed: number;
  errors: string[];
}

export abstract class BaseStage {
  protected readonly stageName: StageName;
  protected config: ProspectMinerConfig;
  protected run: Run | null = null;
  protected processed = 0;
  protected passed = 0;
  protected failed = 0;
  protected errors: string[] = [];

  constructor(stageName: StageName) {
    this.stageName = stageName;
    this.config = getConfig();
  }

  // Template method - subclasses implement the actual logic
  protected abstract execute(): Promise<void>;

  // Main entry point
  async runStage(metadata?: RunMetadata): Promise<StageResult> {
    // Start tracking run
    this.run = runService.start(this.stageName, metadata);
    logger.setContext(this.stageName, this.run.runId);

    try {
      logger.info(`Starting ${this.stageName} stage`);

      // Execute the stage logic
      await this.execute();

      // Mark run as complete
      runService.complete(this.run.runId, this.processed, this.passed, this.failed);

      logger.info(`Completed ${this.stageName} stage`, {
        processed: this.processed,
        passed: this.passed,
        failed: this.failed,
      });

      return {
        success: true,
        processed: this.processed,
        passed: this.passed,
        failed: this.failed,
        errors: this.errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(errorMessage);

      // Mark run as failed
      if (this.run) {
        runService.fail(this.run.runId, errorMessage, this.processed);
      }

      logger.error(`Stage ${this.stageName} failed`, { error: errorMessage });

      return {
        success: false,
        processed: this.processed,
        passed: this.passed,
        failed: this.failed,
        errors: this.errors,
      };
    }
  }

  // Update progress during execution
  protected updateProgress(): void {
    if (this.run) {
      runService.updateProgress(this.run.runId, this.processed, this.passed, this.failed);
    }
  }

  // Record an error without failing the whole stage
  protected recordError(error: Error | string): void {
    const message = error instanceof Error ? error.message : error;
    this.errors.push(message);
    logger.warn(`Stage error: ${message}`);
    this.failed++;
    this.updateProgress();
  }

  // Get the current run ID
  protected getRunId(): string {
    return this.run?.runId || 'unknown';
  }
}
