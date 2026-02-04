/**
 * Core type definitions for Prospect Miner
 * These types map directly to the spec requirements
 */

// Angle types as defined in the spec
export type AngleType =
  | 'no_website'
  | 'outdated_website'
  | 'low_reviews'
  | 'poor_ratings'
  | 'no_online_booking'
  | 'founder_led';

// Contact result types
export type ContactResult =
  | 'sent'
  | 'opened'
  | 'bounced_hard'
  | 'bounced_soft'
  | 'no_reply'
  | 'replied';

// Exclusion reasons
export type ExclusionReason =
  | 'bad_fit'
  | 'duplicate_brand'
  | 'competitor'
  | 'manually_excluded'
  | 'invalid_contact'
  | 'out_of_geo'
  | 'wrong_industry';

// Failure types for enrichment
export type FailureType =
  | 'captcha_block'
  | 'no_contact_page'
  | 'site_timeout'
  | 'bounce_hard'
  | 'bounce_soft'
  | 'rate_limited'
  | 'dns_error'
  | 'ssl_error'
  | 'page_not_found'
  | 'parse_error'
  | 'unknown';

// Lead status in the pipeline
export type LeadStatus =
  | 'new'           // Just discovered
  | 'collected'     // Normalized and deduped
  | 'filtered'      // Passed filter stage
  | 'enriched'      // Contact info collected
  | 'scored'        // Score and angles assigned
  | 'output'        // Exported for outreach
  | 'excluded'      // Filtered out
  | 'cooldown';     // In cooldown period

// Source metadata
export interface SourceMetadata {
  directories: string[];
  geos: string[];
  tags: string[];
  originalSource?: string;
  discoveryRunId?: string;
}

// Enrichment data collected from websites
export interface EnrichmentData {
  emails: string[];
  phones: string[];
  socialLinks: Record<string, string>;
  hasOnlineBooking: boolean;
  lastWebsiteUpdate?: string;
  pageTitle?: string;
  metaDescription?: string;
  technologies?: string[];
  employeeCount?: number;
  linkedinCompanyUrl?: string;
  linkedinEmployeeCount?: number;
  founderLinkedin?: string;
}

// Enrichment failure record
export interface EnrichmentFailure {
  type: FailureType;
  source: string;
  timestamp: number;
  message?: string;
}

// Main Lead interface - matches the spec's lead state requirements
export interface Lead {
  leadId: string;                    // Stable, deterministic ID
  businessName: string;
  canonicalName: string;             // Normalized name for deduplication
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;

  // Timestamps
  firstSeenAt: number;               // Unix timestamp
  lastSeenAt: number;                // Unix timestamp

  // Contact tracking
  lastContactAttempt?: number;       // Unix timestamp
  lastContactResult?: ContactResult;

  // Exclusion and cooldown
  excludedReason?: ExclusionReason;
  cooldownUntil?: number;            // Unix timestamp

  // Angles
  activeAngles: AngleType[];
  exhaustedAngles: AngleType[];

  // Metadata
  sourceMetadata: SourceMetadata;
  enrichmentData?: EnrichmentData;
  enrichmentFailures: EnrichmentFailure[];

  // Scoring
  score?: number;
  scoreReasons?: string[];

  // Pipeline state
  status: LeadStatus;
  lastOutputAt?: number;

  // Record timestamps
  createdAt: number;
  updatedAt: number;
}

// Run status
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

// Pipeline stage names
export type StageName =
  | 'discover'
  | 'collect'
  | 'filter'
  | 'enrich'
  | 'score'
  | 'output'
  | 'refresh';

// Run metadata
export interface RunMetadata {
  config?: Record<string, unknown>;
  sources?: string[];
  filters?: string[];
  errors?: string[];
}

// Pipeline run record
export interface Run {
  runId: string;
  stage: StageName;
  startedAt: number;
  completedAt?: number;
  status: RunStatus;
  leadsProcessed: number;
  leadsPassed: number;
  leadsFailed: number;
  errorMessage?: string;
  metadata?: RunMetadata;
}

// Raw discovery record (staging before collect)
export interface RawDiscovery {
  id?: number;
  runId: string;
  source: string;
  rawData: RawBusinessData;
  discoveredAt: number;
  processed: boolean;
}

// Raw data from discovery sources
export interface RawBusinessData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  sourceUrl?: string;
  additionalData?: Record<string, unknown>;
}
