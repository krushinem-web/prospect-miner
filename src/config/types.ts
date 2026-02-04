/**
 * Configuration type definitions
 * All thresholds, rules, and weights are defined here
 */

import { AngleType, ExclusionReason, FailureType } from '../state/types';

// Source configuration for discovery
export interface SourceConfig {
  name: string;
  type: 'directory' | 'maps' | 'registry' | 'api';
  enabled: boolean;
  url?: string;
  apiKey?: string;
  rateLimit?: number;  // requests per minute
  categories?: string[];
  geos?: GeoConfig[];
  selectors?: Record<string, string>;  // CSS selectors for scraping
}

// Geographic configuration
export interface GeoConfig {
  city: string;
  state: string;
  country?: string;
  radius?: number;  // miles
}

// Filter rule configuration
export interface FilterRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_null' | 'not_null' | 'regex';
  value: any;
  reason: ExclusionReason;
}

// Cooldown configuration
export interface CooldownConfig {
  defaultDays: number;
  byContactResult: Record<string, number>;  // days by result type
  byFailureType: Record<string, number>;    // days by failure type
}

// Scoring weight configuration
export interface ScoringConfig {
  weights: Record<string, number>;
  thresholds: {
    minScore: number;
    lowReviewCount: number;
    poorRatingThreshold: number;
    outdatedWebsiteDays: number;
  };
  angleWeights: Record<AngleType, number>;
}

// LinkedIn configuration (optional enrichment)
export interface LinkedInConfig {
  enabled: boolean;
  cookiePath?: string;
  rateLimit: number;      // requests per hour
  maxEnrichPerRun: number;
  signals: {
    checkCompanyExists: boolean;
    checkEmployeeCount: boolean;
    checkFounderProfile: boolean;
    checkActivityLevel: boolean;
  };
}

// Output configuration
export interface OutputConfig {
  format: 'csv' | 'json' | 'both';
  directory: string;
  filenamePattern: string;  // supports {date}, {stage}, {count}
  fields: string[];         // fields to include in output
  includeAngles: boolean;
  includeReasons: boolean;
}

// Refresh/regeneration configuration
export interface RefreshConfig {
  enabled: boolean;
  checkIntervalHours: number;
  cooldownExpiryCheckEnabled: boolean;
  signalChangeCheckEnabled: boolean;
  resetExhaustedAngles: boolean;
  signals: {
    websiteChange: boolean;
    reviewChange: boolean;
    ratingChange: boolean;
  };
}

// Enrichment configuration
export interface EnrichmentConfig {
  timeout: number;          // ms
  retries: number;
  retryDelay: number;       // ms
  headless: boolean;
  userAgent?: string;
  contactPagePatterns: string[];  // URL patterns to find contact pages
  emailPatterns: string[];        // regex patterns for emails
  phonePatterns: string[];        // regex patterns for phones
  failureCooldowns: Record<FailureType, number>;  // days
}

// Main configuration interface
export interface ProspectMinerConfig {
  version: string;
  sources: SourceConfig[];
  filters: {
    rules: FilterRule[];
    excludeCategories: string[];
    excludeKeywords: string[];
  };
  cooldowns: CooldownConfig;
  scoring: ScoringConfig;
  linkedIn: LinkedInConfig;
  enrichment: EnrichmentConfig;
  output: OutputConfig;
  refresh: RefreshConfig;
  pipeline: {
    batchSize: number;
    maxLeadsPerRun: number;
    parallelism: number;
  };
}
