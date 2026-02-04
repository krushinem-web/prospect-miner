/**
 * Lead state service - CRUD operations for lead management
 * Handles all persistent state operations for leads
 */

import * as crypto from 'crypto';
import { getDatabase, DatabaseWrapper, initDatabase } from './database';
import {
  Lead,
  LeadStatus,
  AngleType,
  ContactResult,
  ExclusionReason,
  SourceMetadata,
  EnrichmentData,
  EnrichmentFailure,
  RawBusinessData,
} from './types';
import { logger } from '../lib/logger';

// Generate stable, deterministic lead ID from canonical business data
export function generateLeadId(
  canonicalName: string,
  city?: string,
  state?: string,
  country?: string
): string {
  const components = [
    canonicalName.toLowerCase().trim(),
    (city || '').toLowerCase().trim(),
    (state || '').toLowerCase().trim(),
    (country || 'us').toLowerCase().trim(),
  ].join('|');

  return crypto.createHash('sha256').update(components).digest('hex').substring(0, 16);
}

// Canonicalize business name for deduplication
export function canonicalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .replace(/\b(llc|inc|corp|ltd|co|company|the)\b/gi, '') // Remove common suffixes
    .trim();
}

// Convert DB row to Lead object
function rowToLead(row: any): Lead {
  return {
    leadId: row.lead_id,
    businessName: row.business_name,
    canonicalName: row.canonical_name,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    phone: row.phone,
    email: row.email,
    website: row.website,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastContactAttempt: row.last_contact_attempt,
    lastContactResult: row.last_contact_result as ContactResult,
    excludedReason: row.excluded_reason as ExclusionReason,
    cooldownUntil: row.cooldown_until,
    activeAngles: JSON.parse(row.active_angles || '[]'),
    exhaustedAngles: JSON.parse(row.exhausted_angles || '[]'),
    sourceMetadata: JSON.parse(row.source_metadata || '{}'),
    enrichmentData: row.enrichment_data ? JSON.parse(row.enrichment_data) : undefined,
    enrichmentFailures: JSON.parse(row.enrichment_failures || '[]'),
    score: row.score,
    scoreReasons: row.score_reasons ? JSON.parse(row.score_reasons) : undefined,
    status: row.status as LeadStatus,
    lastOutputAt: row.last_output_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LeadService {
  private getDb(): DatabaseWrapper {
    return new DatabaseWrapper(getDatabase());
  }

  // Upsert a lead - insert or update based on lead_id
  upsert(lead: Partial<Lead> & { leadId: string }): Lead {
    const now = Date.now();
    const existing = this.getById(lead.leadId);

    if (existing) {
      // Update existing lead
      const updated: Lead = {
        ...existing,
        ...lead,
        lastSeenAt: now,
        updatedAt: now,
      };

      const db = this.getDb();
      const stmt = db.prepare(`
        UPDATE leads SET
          business_name = ?,
          canonical_name = ?,
          address = ?,
          city = ?,
          state = ?,
          postal_code = ?,
          country = ?,
          phone = ?,
          email = ?,
          website = ?,
          last_seen_at = ?,
          last_contact_attempt = ?,
          last_contact_result = ?,
          excluded_reason = ?,
          cooldown_until = ?,
          active_angles = ?,
          exhausted_angles = ?,
          source_metadata = ?,
          enrichment_data = ?,
          enrichment_failures = ?,
          score = ?,
          score_reasons = ?,
          status = ?,
          last_output_at = ?,
          updated_at = ?
        WHERE lead_id = ?
      `);

      stmt.run(
        updated.businessName,
        updated.canonicalName,
        updated.address,
        updated.city,
        updated.state,
        updated.postalCode,
        updated.country,
        updated.phone,
        updated.email,
        updated.website,
        updated.lastSeenAt,
        updated.lastContactAttempt,
        updated.lastContactResult,
        updated.excludedReason,
        updated.cooldownUntil,
        JSON.stringify(updated.activeAngles),
        JSON.stringify(updated.exhaustedAngles),
        JSON.stringify(updated.sourceMetadata),
        updated.enrichmentData ? JSON.stringify(updated.enrichmentData) : null,
        JSON.stringify(updated.enrichmentFailures),
        updated.score,
        updated.scoreReasons ? JSON.stringify(updated.scoreReasons) : null,
        updated.status,
        updated.lastOutputAt,
        updated.updatedAt,
        updated.leadId
      );

      logger.debug(`Updated lead: ${updated.leadId}`, { businessName: updated.businessName });
      return updated;
    } else {
      // Insert new lead
      const newLead: Lead = {
        leadId: lead.leadId,
        businessName: lead.businessName || '',
        canonicalName: lead.canonicalName || '',
        address: lead.address,
        city: lead.city,
        state: lead.state,
        postalCode: lead.postalCode,
        country: lead.country,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        firstSeenAt: now,
        lastSeenAt: now,
        lastContactAttempt: lead.lastContactAttempt,
        lastContactResult: lead.lastContactResult,
        excludedReason: lead.excludedReason,
        cooldownUntil: lead.cooldownUntil,
        activeAngles: lead.activeAngles || [],
        exhaustedAngles: lead.exhaustedAngles || [],
        sourceMetadata: lead.sourceMetadata || { directories: [], geos: [], tags: [] },
        enrichmentData: lead.enrichmentData,
        enrichmentFailures: lead.enrichmentFailures || [],
        score: lead.score,
        scoreReasons: lead.scoreReasons,
        status: lead.status || 'new',
        lastOutputAt: lead.lastOutputAt,
        createdAt: now,
        updatedAt: now,
      };

      const db = this.getDb();
      const stmt = db.prepare(`
        INSERT INTO leads (
          lead_id, business_name, canonical_name, address, city, state,
          postal_code, country, phone, email, website, first_seen_at,
          last_seen_at, last_contact_attempt, last_contact_result,
          excluded_reason, cooldown_until, active_angles, exhausted_angles,
          source_metadata, enrichment_data, enrichment_failures, score,
          score_reasons, status, last_output_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        newLead.leadId,
        newLead.businessName,
        newLead.canonicalName,
        newLead.address,
        newLead.city,
        newLead.state,
        newLead.postalCode,
        newLead.country,
        newLead.phone,
        newLead.email,
        newLead.website,
        newLead.firstSeenAt,
        newLead.lastSeenAt,
        newLead.lastContactAttempt,
        newLead.lastContactResult,
        newLead.excludedReason,
        newLead.cooldownUntil,
        JSON.stringify(newLead.activeAngles),
        JSON.stringify(newLead.exhaustedAngles),
        JSON.stringify(newLead.sourceMetadata),
        newLead.enrichmentData ? JSON.stringify(newLead.enrichmentData) : null,
        JSON.stringify(newLead.enrichmentFailures),
        newLead.score,
        newLead.scoreReasons ? JSON.stringify(newLead.scoreReasons) : null,
        newLead.status,
        newLead.lastOutputAt,
        newLead.createdAt,
        newLead.updatedAt
      );

      logger.debug(`Created lead: ${newLead.leadId}`, { businessName: newLead.businessName });
      return newLead;
    }
  }

  // Get lead by ID
  getById(leadId: string): Lead | null {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM leads WHERE lead_id = ?');
    const row = stmt.get(leadId);
    return row ? rowToLead(row) : null;
  }

  // Get lead by canonical name (for deduplication)
  getByCanonicalName(canonicalName: string, city?: string, state?: string): Lead | null {
    const leadId = generateLeadId(canonicalName, city, state);
    return this.getById(leadId);
  }

  // Get leads by status
  getByStatus(status: LeadStatus, limit?: number): Lead[] {
    const db = this.getDb();
    const sql = limit
      ? 'SELECT * FROM leads WHERE status = ? LIMIT ?'
      : 'SELECT * FROM leads WHERE status = ?';
    const stmt = db.prepare(sql);
    const rows = limit ? stmt.all(status, limit) : stmt.all(status);
    return rows.map(rowToLead);
  }

  // Get leads that have passed cooldown
  getExpiredCooldowns(limit?: number): Lead[] {
    const now = Date.now();
    const db = this.getDb();
    const sql = limit
      ? 'SELECT * FROM leads WHERE cooldown_until IS NOT NULL AND cooldown_until < ? LIMIT ?'
      : 'SELECT * FROM leads WHERE cooldown_until IS NOT NULL AND cooldown_until < ?';
    const stmt = db.prepare(sql);
    const rows = limit ? stmt.all(now, limit) : stmt.all(now);
    return rows.map(rowToLead);
  }

  // Get leads ready for a specific pipeline stage
  getLeadsForStage(stage: string, limit?: number): Lead[] {
    const statusMap: Record<string, LeadStatus[]> = {
      collect: ['new'],
      filter: ['collected'],
      enrich: ['filtered'],
      score: ['enriched'],
      output: ['scored'],
    };

    const statuses = statusMap[stage];
    if (!statuses) return [];

    const db = this.getDb();
    const placeholders = statuses.map(() => '?').join(', ');
    const now = Date.now();

    const sql = limit
      ? `SELECT * FROM leads WHERE status IN (${placeholders}) AND (excluded_reason IS NULL) AND (cooldown_until IS NULL OR cooldown_until < ?) LIMIT ?`
      : `SELECT * FROM leads WHERE status IN (${placeholders}) AND (excluded_reason IS NULL) AND (cooldown_until IS NULL OR cooldown_until < ?)`;

    const stmt = db.prepare(sql);
    const params = limit ? [...statuses, now, limit] : [...statuses, now];
    const rows = stmt.all(...params);
    return rows.map(rowToLead);
  }

  // Update lead status
  updateStatus(leadId: string, status: LeadStatus): void {
    const db = this.getDb();
    const stmt = db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE lead_id = ?');
    stmt.run(status, Date.now(), leadId);
  }

  // Set exclusion reason
  exclude(leadId: string, reason: ExclusionReason): void {
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET excluded_reason = ?, status = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(reason, 'excluded', Date.now(), leadId);
    logger.info(`Excluded lead ${leadId}`, { reason });
  }

  // Set cooldown
  setCooldown(leadId: string, until: number): void {
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET cooldown_until = ?, status = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(until, 'cooldown', Date.now(), leadId);
  }

  // Update contact result
  updateContactResult(leadId: string, result: ContactResult): void {
    const now = Date.now();
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET last_contact_attempt = ?, last_contact_result = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(now, result, now, leadId);
  }

  // Update angles
  updateAngles(leadId: string, activeAngles: AngleType[], exhaustedAngles: AngleType[]): void {
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET active_angles = ?, exhausted_angles = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(JSON.stringify(activeAngles), JSON.stringify(exhaustedAngles), Date.now(), leadId);
  }

  // Exhaust an angle (move from active to exhausted)
  exhaustAngle(leadId: string, angle: AngleType): void {
    const lead = this.getById(leadId);
    if (!lead) return;

    const activeAngles = lead.activeAngles.filter((a) => a !== angle);
    const exhaustedAngles = [...new Set([...lead.exhaustedAngles, angle])];
    this.updateAngles(leadId, activeAngles, exhaustedAngles);
  }

  // Update enrichment data
  updateEnrichment(leadId: string, data: EnrichmentData): void {
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET enrichment_data = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(JSON.stringify(data), Date.now(), leadId);
  }

  // Add enrichment failure
  addEnrichmentFailure(leadId: string, failure: EnrichmentFailure): void {
    const lead = this.getById(leadId);
    if (!lead) return;

    const failures = [...lead.enrichmentFailures, failure];
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET enrichment_failures = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(JSON.stringify(failures), Date.now(), leadId);
    logger.logFailure(leadId, failure.type, failure.source, { message: failure.message });
  }

  // Update score
  updateScore(leadId: string, score: number, reasons: string[]): void {
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET score = ?, score_reasons = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run(score, JSON.stringify(reasons), Date.now(), leadId);
  }

  // Mark as output
  markOutput(leadId: string): void {
    const now = Date.now();
    const db = this.getDb();
    const stmt = db.prepare(
      'UPDATE leads SET status = ?, last_output_at = ?, updated_at = ? WHERE lead_id = ?'
    );
    stmt.run('output', now, now, leadId);
  }

  // Get statistics
  getStats(): Record<string, number> {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT status, COUNT(*) as count FROM leads GROUP BY status
    `);
    const rows = stmt.all() as Array<{ status: string; count: number }>;
    const stats: Record<string, number> = { total: 0 };
    for (const row of rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }
    return stats;
  }

  // Count leads
  count(status?: LeadStatus): number {
    const db = this.getDb();
    if (status) {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM leads WHERE status = ?');
      const row = stmt.get(status) as { count: number };
      return row?.count || 0;
    }
    const stmt = db.prepare('SELECT COUNT(*) as count FROM leads');
    const row = stmt.get() as { count: number };
    return row?.count || 0;
  }

  // Bulk update status
  bulkUpdateStatus(leadIds: string[], status: LeadStatus): number {
    if (leadIds.length === 0) return 0;
    const db = this.getDb();
    let changes = 0;
    for (const leadId of leadIds) {
      const stmt = db.prepare(
        'UPDATE leads SET status = ?, updated_at = ? WHERE lead_id = ?'
      );
      const result = stmt.run(status, Date.now(), leadId);
      changes += result.changes;
    }
    return changes;
  }

  // Create lead from raw discovery data
  createFromRaw(raw: RawBusinessData, source: string, runId: string): Lead {
    const canonicalName = canonicalizeName(raw.name);
    const leadId = generateLeadId(canonicalName, raw.city, raw.state, raw.country);

    return this.upsert({
      leadId,
      businessName: raw.name,
      canonicalName,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      postalCode: raw.postalCode,
      country: raw.country || 'US',
      phone: raw.phone,
      email: raw.email,
      website: raw.website,
      sourceMetadata: {
        directories: [source],
        geos: raw.city ? [`${raw.city}, ${raw.state || ''}`] : [],
        tags: raw.categories || [],
        originalSource: source,
        discoveryRunId: runId,
      },
      status: 'new',
    });
  }
}

export const leadService = new LeadService();
