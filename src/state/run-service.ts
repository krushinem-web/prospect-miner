/**
 * Run service - track pipeline execution runs
 */

import * as crypto from 'crypto';
import { getDatabase, DatabaseWrapper } from './database';
import { Run, RunStatus, StageName, RunMetadata } from './types';
import { logger } from '../lib/logger';

function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `run_${timestamp}_${random}`;
}

function rowToRun(row: any): Run {
  return {
    runId: row.run_id,
    stage: row.stage as StageName,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status as RunStatus,
    leadsProcessed: row.leads_processed,
    leadsPassed: row.leads_passed,
    leadsFailed: row.leads_failed,
    errorMessage: row.error_message,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

export class RunService {
  private getDb(): DatabaseWrapper {
    return new DatabaseWrapper(getDatabase());
  }

  // Start a new run
  start(stage: StageName, metadata?: RunMetadata): Run {
    const run: Run = {
      runId: generateRunId(),
      stage,
      startedAt: Date.now(),
      status: 'running',
      leadsProcessed: 0,
      leadsPassed: 0,
      leadsFailed: 0,
      metadata,
    };

    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO runs (run_id, stage, started_at, status, leads_processed, leads_passed, leads_failed, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      run.runId,
      run.stage,
      run.startedAt,
      run.status,
      run.leadsProcessed,
      run.leadsPassed,
      run.leadsFailed,
      run.metadata ? JSON.stringify(run.metadata) : null
    );

    logger.setContext(stage, run.runId);
    logger.info(`Started ${stage} run`, { runId: run.runId });

    return run;
  }

  // Complete a run successfully
  complete(runId: string, processed: number, passed: number, failed: number): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      UPDATE runs SET
        completed_at = ?,
        status = ?,
        leads_processed = ?,
        leads_passed = ?,
        leads_failed = ?
      WHERE run_id = ?
    `);

    stmt.run(Date.now(), 'completed', processed, passed, failed, runId);
    logger.info(`Completed run`, { runId, processed, passed, failed });
  }

  // Fail a run
  fail(runId: string, errorMessage: string, processed?: number): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      UPDATE runs SET
        completed_at = ?,
        status = ?,
        error_message = ?,
        leads_processed = COALESCE(?, leads_processed)
      WHERE run_id = ?
    `);

    stmt.run(Date.now(), 'failed', errorMessage, processed, runId);
    logger.error(`Run failed`, { runId, errorMessage });
  }

  // Cancel a run
  cancel(runId: string): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      UPDATE runs SET
        completed_at = ?,
        status = ?
      WHERE run_id = ?
    `);

    stmt.run(Date.now(), 'cancelled', runId);
    logger.info(`Cancelled run`, { runId });
  }

  // Update progress
  updateProgress(runId: string, processed: number, passed: number, failed: number): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      UPDATE runs SET
        leads_processed = ?,
        leads_passed = ?,
        leads_failed = ?
      WHERE run_id = ?
    `);

    stmt.run(processed, passed, failed, runId);
  }

  // Get run by ID
  getById(runId: string): Run | null {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM runs WHERE run_id = ?');
    const row = stmt.get(runId);
    return row ? rowToRun(row) : null;
  }

  // Get latest run for a stage
  getLatest(stage: StageName): Run | null {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT * FROM runs WHERE stage = ? ORDER BY started_at DESC LIMIT 1'
    );
    const row = stmt.get(stage);
    return row ? rowToRun(row) : null;
  }

  // Get all runs for a stage
  getByStage(stage: StageName, limit?: number): Run[] {
    const db = this.getDb();
    const sql = limit
      ? 'SELECT * FROM runs WHERE stage = ? ORDER BY started_at DESC LIMIT ?'
      : 'SELECT * FROM runs WHERE stage = ? ORDER BY started_at DESC';
    const stmt = db.prepare(sql);
    const rows = limit ? stmt.all(stage, limit) : stmt.all(stage);
    return rows.map(rowToRun);
  }

  // Get recent runs across all stages
  getRecent(limit: number = 10): Run[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?');
    const rows = stmt.all(limit);
    return rows.map(rowToRun);
  }

  // Get running (incomplete) runs
  getRunning(): Run[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM runs WHERE status = ?');
    const rows = stmt.all('running');
    return rows.map(rowToRun);
  }

  // Get statistics
  getStats(): Record<string, { total: number; completed: number; failed: number }> {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT stage, status, COUNT(*) as count
      FROM runs
      GROUP BY stage, status
    `);
    const rows = stmt.all() as Array<{ stage: string; status: string; count: number }>;

    const stats: Record<string, { total: number; completed: number; failed: number }> = {};

    for (const row of rows) {
      if (!stats[row.stage]) {
        stats[row.stage] = { total: 0, completed: 0, failed: 0 };
      }
      stats[row.stage].total += row.count;
      if (row.status === 'completed') {
        stats[row.stage].completed += row.count;
      } else if (row.status === 'failed') {
        stats[row.stage].failed += row.count;
      }
    }

    return stats;
  }
}

export const runService = new RunService();
