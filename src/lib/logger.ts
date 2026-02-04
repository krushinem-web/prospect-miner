/**
 * Structured logging for Prospect Miner
 * Outputs JSON logs suitable for parsing and analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import { env } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  stage?: string;
  runId?: string;
  message: string;
  data?: Record<string, unknown>;
}

class Logger {
  private logFile: string;
  private stage?: string;
  private runId?: string;
  private minLevel: LogLevel;

  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.logFile = path.join(env.LOG_DIR, `prospect-miner-${today}.log`);
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  setContext(stage?: string, runId?: string): void {
    this.stage = stage;
    this.runId = runId;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      stage: this.stage,
      runId: this.runId,
      message,
      data,
    };
  }

  private write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';

    // Write to file
    fs.appendFileSync(this.logFile, line);

    // Also output to console with color coding
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[90m',  // gray
      info: '\x1b[36m',   // cyan
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m',  // red
    };
    const reset = '\x1b[0m';
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const context = entry.stage ? ` [${entry.stage}]` : '';

    console.log(`${colors[entry.level]}${prefix}${context}${reset} ${entry.message}`);
    if (entry.data && Object.keys(entry.data).length > 0) {
      console.log(`  ${JSON.stringify(entry.data)}`);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.write(this.formatEntry('debug', message, data));
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.write(this.formatEntry('info', message, data));
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.write(this.formatEntry('warn', message, data));
    }
  }

  error(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.write(this.formatEntry('error', message, data));
    }
  }

  // Log failure intelligence
  logFailure(
    leadId: string,
    failureType: string,
    source: string,
    details?: Record<string, unknown>
  ): void {
    this.warn(`Enrichment failure: ${failureType}`, {
      leadId,
      failureType,
      source,
      ...details,
    });
  }
}

export const logger = new Logger();
