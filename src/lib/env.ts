/**
 * Environment variable handling for Prospect Miner
 * All paths come from env vars, with sensible defaults for development
 */

import * as path from 'path';
import * as fs from 'fs';

export interface EnvConfig {
  DATA_DIR: string;
  CONFIG_DIR: string;
  LOG_DIR: string;
  DB_PATH: string;
  NODE_ENV: string;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getEnvConfig(): EnvConfig {
  const defaultBase = process.env.HOME || process.env.USERPROFILE || '/var/lib/prospect-miner';
  const defaultDataDir = path.join(defaultBase, '.prospect-miner', 'data');
  const defaultConfigDir = path.join(defaultBase, '.prospect-miner', 'config');
  const defaultLogDir = path.join(defaultBase, '.prospect-miner', 'logs');
  const defaultDbPath = path.join(defaultBase, '.prospect-miner', 'state.db');

  const config: EnvConfig = {
    DATA_DIR: process.env.DATA_DIR || defaultDataDir,
    CONFIG_DIR: process.env.CONFIG_DIR || defaultConfigDir,
    LOG_DIR: process.env.LOG_DIR || defaultLogDir,
    DB_PATH: process.env.DB_PATH || defaultDbPath,
    NODE_ENV: process.env.NODE_ENV || 'development',
  };

  // Ensure directories exist
  ensureDir(config.DATA_DIR);
  ensureDir(config.CONFIG_DIR);
  ensureDir(config.LOG_DIR);
  ensureDir(path.dirname(config.DB_PATH));

  return config;
}

export const env = getEnvConfig();
