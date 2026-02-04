/**
 * Configuration loader
 * Loads and validates configuration from JSON/YAML files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { ProspectMinerConfig } from './types';

// Default configuration
const DEFAULT_CONFIG: ProspectMinerConfig = {
  version: '1.0.0',
  sources: [],
  filters: {
    rules: [],
    excludeCategories: [],
    excludeKeywords: [],
  },
  cooldowns: {
    defaultDays: 30,
    byContactResult: {
      bounced_hard: 365,
      bounced_soft: 14,
      no_reply: 30,
      sent: 7,
      opened: 14,
      replied: 90,
    },
    byFailureType: {
      captcha_block: 7,
      no_contact_page: 30,
      site_timeout: 3,
      bounce_hard: 365,
      bounce_soft: 14,
      rate_limited: 1,
      dns_error: 30,
      ssl_error: 30,
      page_not_found: 60,
      parse_error: 7,
      unknown: 7,
    },
  },
  scoring: {
    weights: {
      hasEmail: 30,
      hasPhone: 20,
      hasWebsite: 10,
      reviewCount: 15,
      rating: 15,
      recentActivity: 10,
    },
    thresholds: {
      minScore: 20,
      lowReviewCount: 10,
      poorRatingThreshold: 3.5,
      outdatedWebsiteDays: 365,
    },
    angleWeights: {
      no_website: 25,
      outdated_website: 20,
      low_reviews: 15,
      poor_ratings: 15,
      no_online_booking: 20,
      founder_led: 25,
    },
  },
  linkedIn: {
    enabled: false,
    rateLimit: 30,
    maxEnrichPerRun: 50,
    signals: {
      checkCompanyExists: true,
      checkEmployeeCount: true,
      checkFounderProfile: false,
      checkActivityLevel: false,
    },
  },
  enrichment: {
    timeout: 30000,
    retries: 2,
    retryDelay: 5000,
    headless: true,
    contactPagePatterns: [
      '/contact',
      '/contact-us',
      '/about',
      '/about-us',
      '/get-in-touch',
      '/reach-us',
    ],
    emailPatterns: [
      '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    ],
    phonePatterns: [
      '\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}',
      '\\+1[-.\\s]?\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}',
    ],
    failureCooldowns: {
      captcha_block: 7,
      no_contact_page: 30,
      site_timeout: 3,
      bounce_hard: 365,
      bounce_soft: 14,
      rate_limited: 1,
      dns_error: 30,
      ssl_error: 30,
      page_not_found: 60,
      parse_error: 7,
      unknown: 7,
    },
  },
  output: {
    format: 'csv',
    directory: env.DATA_DIR,
    filenamePattern: 'leads_{date}_{count}',
    fields: [
      'leadId',
      'businessName',
      'email',
      'phone',
      'website',
      'city',
      'state',
      'score',
      'activeAngles',
      'scoreReasons',
    ],
    includeAngles: true,
    includeReasons: true,
  },
  refresh: {
    enabled: true,
    checkIntervalHours: 24,
    cooldownExpiryCheckEnabled: true,
    signalChangeCheckEnabled: true,
    resetExhaustedAngles: false,
    signals: {
      websiteChange: true,
      reviewChange: true,
      ratingChange: true,
    },
  },
  pipeline: {
    batchSize: 100,
    maxLeadsPerRun: 500,
    parallelism: 5,
  },
};

let loadedConfig: ProspectMinerConfig | null = null;

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null
      ) {
        result[key] = deepMerge(target[key] as Record<string, any>, source[key] as Record<string, any>) as any;
      } else {
        result[key] = source[key] as any;
      }
    }
  }

  return result;
}

export function loadConfig(configPath?: string): ProspectMinerConfig {
  if (loadedConfig && !configPath) {
    return loadedConfig;
  }

  const configFile = configPath || path.join(env.CONFIG_DIR, 'config.yaml');
  const jsonConfigFile = configPath || path.join(env.CONFIG_DIR, 'config.json');

  let userConfig: Partial<ProspectMinerConfig> = {};

  // Try YAML first, then JSON
  if (fs.existsSync(configFile)) {
    logger.info(`Loading config from ${configFile}`);
    const content = fs.readFileSync(configFile, 'utf-8');
    userConfig = YAML.parse(content);
  } else if (fs.existsSync(jsonConfigFile)) {
    logger.info(`Loading config from ${jsonConfigFile}`);
    const content = fs.readFileSync(jsonConfigFile, 'utf-8');
    userConfig = JSON.parse(content);
  } else {
    logger.warn(`No config file found, using defaults. Expected at: ${configFile}`);
    // Write default config for reference
    writeDefaultConfig(configFile);
  }

  loadedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
  return loadedConfig;
}

export function writeDefaultConfig(configPath: string): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = YAML.stringify(DEFAULT_CONFIG, { indent: 2 });
  fs.writeFileSync(configPath, content);
  logger.info(`Wrote default config to ${configPath}`);
}

export function reloadConfig(): ProspectMinerConfig {
  loadedConfig = null;
  return loadConfig();
}

export function getConfig(): ProspectMinerConfig {
  return loadConfig();
}
