/**
 * Raw discovery service - manage staging records before collection
 */

import { getDatabase, DatabaseWrapper, saveDatabase } from './database';
import { RawDiscovery, RawBusinessData } from './types';
import { logger } from '../lib/logger';

function rowToRawDiscovery(row: any): RawDiscovery {
  return {
    id: row.id,
    runId: row.run_id,
    source: row.source,
    rawData: JSON.parse(row.raw_data),
    discoveredAt: row.discovered_at,
    processed: row.processed === 1,
  };
}

export class RawDiscoveryService {
  private getDb(): DatabaseWrapper {
    return new DatabaseWrapper(getDatabase());
  }

  // Add a raw discovery record
  add(runId: string, source: string, rawData: RawBusinessData): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO raw_discoveries (run_id, source, raw_data, discovered_at, processed)
      VALUES (?, ?, ?, ?, 0)
    `);

    const result = stmt.run(runId, source, JSON.stringify(rawData), Date.now());
    return result.lastInsertRowid as number;
  }

  // Bulk add discoveries
  addBulk(runId: string, source: string, records: RawBusinessData[]): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO raw_discoveries (run_id, source, raw_data, discovered_at, processed)
      VALUES (?, ?, ?, ?, 0)
    `);

    const now = Date.now();
    let count = 0;

    for (const item of records) {
      stmt.run(runId, source, JSON.stringify(item), now);
      count++;
    }

    logger.info(`Added ${count} raw discoveries`, { runId, source });
    return count;
  }

  // Get unprocessed discoveries
  getUnprocessed(runId?: string, limit?: number): RawDiscovery[] {
    const db = this.getDb();
    let sql = 'SELECT * FROM raw_discoveries WHERE processed = 0';
    const params: any[] = [];

    if (runId) {
      sql += ' AND run_id = ?';
      params.push(runId);
    }

    sql += ' ORDER BY discovered_at ASC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(rowToRawDiscovery);
  }

  // Mark as processed
  markProcessed(id: number): void {
    const db = this.getDb();
    const stmt = db.prepare('UPDATE raw_discoveries SET processed = 1 WHERE id = ?');
    stmt.run(id);
  }

  // Mark multiple as processed
  markProcessedBulk(ids: number[]): void {
    if (ids.length === 0) return;
    const db = this.getDb();
    for (const id of ids) {
      const stmt = db.prepare('UPDATE raw_discoveries SET processed = 1 WHERE id = ?');
      stmt.run(id);
    }
  }

  // Get by run ID
  getByRunId(runId: string): RawDiscovery[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM raw_discoveries WHERE run_id = ? ORDER BY discovered_at ASC');
    const rows = stmt.all(runId);
    return rows.map(rowToRawDiscovery);
  }

  // Count unprocessed
  countUnprocessed(runId?: string): number {
    const db = this.getDb();
    let sql = 'SELECT COUNT(*) as count FROM raw_discoveries WHERE processed = 0';
    const params: any[] = [];

    if (runId) {
      sql += ' AND run_id = ?';
      params.push(runId);
    }

    const stmt = db.prepare(sql);
    const row = stmt.get(...params) as { count: number };
    return row?.count || 0;
  }

  // Clean up old processed records
  cleanupOld(daysOld: number = 7): number {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const db = this.getDb();
    const stmt = db.prepare(
      'DELETE FROM raw_discoveries WHERE processed = 1 AND discovered_at < ?'
    );
    const result = stmt.run(cutoff);
    if (result.changes > 0) {
      logger.info(`Cleaned up ${result.changes} old raw discoveries`);
    }
    return result.changes;
  }
}

export const rawDiscoveryService = new RawDiscoveryService();
