/**
 * SQLite database connection and initialization
 * Uses sql.js for cross-platform compatibility (pure JS, no native compilation)
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

let db: SqlJsDatabase | null = null;
let SQL: any = null;

const SCHEMA = `
-- Leads table (persistent state)
CREATE TABLE IF NOT EXISTS leads (
  lead_id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_contact_attempt INTEGER,
  last_contact_result TEXT,
  excluded_reason TEXT,
  cooldown_until INTEGER,
  active_angles TEXT DEFAULT '[]',
  exhausted_angles TEXT DEFAULT '[]',
  source_metadata TEXT DEFAULT '{}',
  enrichment_data TEXT,
  enrichment_failures TEXT DEFAULT '[]',
  score INTEGER,
  score_reasons TEXT,
  status TEXT DEFAULT 'new',
  last_output_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_canonical_name ON leads(canonical_name);
CREATE INDEX IF NOT EXISTS idx_leads_cooldown ON leads(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_leads_last_seen ON leads(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);

-- Pipeline runs table
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL,
  leads_processed INTEGER DEFAULT 0,
  leads_passed INTEGER DEFAULT 0,
  leads_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_stage ON runs(stage);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);

-- Raw discoveries (staging before collect)
CREATE TABLE IF NOT EXISTS raw_discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_data TEXT NOT NULL,
  discovered_at INTEGER NOT NULL,
  processed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_raw_discoveries_run ON raw_discoveries(run_id);
CREATE INDEX IF NOT EXISTS idx_raw_discoveries_processed ON raw_discoveries(processed);
`;

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (db) return db;

  logger.info(`Initializing database at ${env.DB_PATH}`);

  // Initialize SQL.js
  SQL = await initSqlJs();

  // Load existing database if it exists
  const dbDir = path.dirname(env.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(env.DB_PATH)) {
    const buffer = fs.readFileSync(env.DB_PATH);
    db = new SQL.Database(buffer);
    logger.info('Loaded existing database');
  } else {
    db = new SQL.Database();
    logger.info('Created new database');
  }

  // Initialize schema
  db!.run(SCHEMA);

  // Save immediately to ensure file exists
  saveDatabase();

  logger.info('Database initialized successfully');
  return db!;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(env.DB_PATH, buffer);
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// Helper class to provide better-sqlite3 compatible API
export class DatabaseWrapper {
  private db: SqlJsDatabase;

  constructor(database: SqlJsDatabase) {
    this.db = database;
  }

  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(this.db, sql);
  }

  exec(sql: string): void {
    this.db.run(sql);
    saveDatabase();
  }

  transaction<T>(fn: (items: T[]) => number): (items: T[]) => number {
    return (items: T[]) => {
      this.db.run('BEGIN TRANSACTION');
      try {
        const result = fn(items);
        this.db.run('COMMIT');
        saveDatabase();
        return result;
      } catch (error) {
        this.db.run('ROLLBACK');
        throw error;
      }
    };
  }
}

export class StatementWrapper {
  private db: SqlJsDatabase;
  private sql: string;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  // Convert undefined to null for sql.js compatibility
  private sanitizeParams(params: any[]): any[] {
    return params.map(p => p === undefined ? null : p);
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    this.db.run(this.sql, this.sanitizeParams(params));
    saveDatabase();

    // Get last insert rowid
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0]?.values[0]?.[0] as number || 0;

    // Get changes count
    const changesResult = this.db.exec('SELECT changes() as changes');
    const changes = changesResult[0]?.values[0]?.[0] as number || 0;

    return { changes, lastInsertRowid: lastId };
  }

  get(...params: any[]): any {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(this.sanitizeParams(params));

    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      stmt.free();

      const row: any = {};
      columns.forEach((col: string, i: number) => {
        row[col] = values[i];
      });
      return row;
    }

    stmt.free();
    return undefined;
  }

  all(...params: any[]): any[] {
    const results: any[] = [];
    const stmt = this.db.prepare(this.sql);
    stmt.bind(this.sanitizeParams(params));

    while (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row: any = {};
      columns.forEach((col: string, i: number) => {
        row[col] = values[i];
      });
      results.push(row);
    }

    stmt.free();
    return results;
  }
}

// Graceful shutdown
process.on('exit', () => closeDatabase());
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
