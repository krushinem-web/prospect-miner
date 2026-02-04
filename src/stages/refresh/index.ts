/**
 * REFRESH Stage (Regeneration)
 * Goal: Re-evaluate prior leads and decide when they should re-enter the pipeline
 */

import { BaseStage } from '../base-stage';
import { Lead, LeadStatus } from '../../state/types';
import { leadService } from '../../state/lead-service';
import { logger } from '../../lib/logger';
import { getDatabase, DatabaseWrapper } from '../../state/database';

export class RefreshStage extends BaseStage {
  private limit?: number;

  constructor(limit?: number) {
    super('refresh');
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
  }

  protected async execute(): Promise<void> {
    if (!this.config.refresh.enabled) {
      logger.info('Refresh stage is disabled in config');
      return;
    }

    logger.info('Refreshing leads');

    const refreshedLeads: string[] = [];

    // 1. Check for expired cooldowns
    if (this.config.refresh.cooldownExpiryCheckEnabled) {
      const expiredLeads = await this.processExpiredCooldowns();
      refreshedLeads.push(...expiredLeads);
    }

    // 2. Check for signal changes on existing leads
    if (this.config.refresh.signalChangeCheckEnabled) {
      const signalChangedLeads = await this.processSignalChanges();
      refreshedLeads.push(...signalChangedLeads);
    }

    logger.info('Refresh complete', {
      processed: this.processed,
      refreshed: this.passed,
      failed: this.failed,
    });
  }

  private async processExpiredCooldowns(): Promise<string[]> {
    const expiredLeads = leadService.getExpiredCooldowns(this.limit);

    if (expiredLeads.length === 0) {
      logger.info('No expired cooldowns found');
      return [];
    }

    logger.info(`Found ${expiredLeads.length} leads with expired cooldowns`);

    const refreshed: string[] = [];

    for (const lead of expiredLeads) {
      this.processed++;

      try {
        // Reset cooldown
        leadService.upsert({
          leadId: lead.leadId,
          cooldownUntil: undefined,
        });

        // Determine new status based on lead state
        let newStatus: LeadStatus = 'collected';

        // If lead has enrichment data, skip to scoring
        if (lead.enrichmentData && Object.keys(lead.enrichmentData).length > 0) {
          newStatus = 'enriched';
        }

        // If lead was already scored, re-score with potentially new angles
        if (lead.score !== undefined) {
          newStatus = 'enriched'; // Will be re-scored
        }

        // Optionally reset exhausted angles
        if (this.config.refresh.resetExhaustedAngles) {
          leadService.updateAngles(lead.leadId, [], []);
        }

        leadService.updateStatus(lead.leadId, newStatus);
        refreshed.push(lead.leadId);
        this.passed++;

        logger.debug(`Refreshed lead from cooldown: ${lead.leadId}`, { newStatus });
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    return refreshed;
  }

  private async processSignalChanges(): Promise<string[]> {
    // Get leads that are in output or cooldown status and might have changed
    const db = new DatabaseWrapper(getDatabase());
    const cutoffTime = Date.now() - this.config.refresh.checkIntervalHours * 60 * 60 * 1000;

    const stmt = db.prepare(`
      SELECT * FROM leads
      WHERE status IN ('output', 'cooldown')
      AND updated_at < ?
      LIMIT ?
    `);

    const rows = stmt.all(cutoffTime, this.limit || 100);
    const leads = rows.map((row: any) => this.rowToLead(row));

    if (leads.length === 0) {
      logger.info('No leads to check for signal changes');
      return [];
    }

    logger.info(`Checking ${leads.length} leads for signal changes`);

    const refreshed: string[] = [];

    for (const lead of leads) {
      this.processed++;

      try {
        const hasSignalChange = await this.checkSignalChanges(lead);

        if (hasSignalChange) {
          // Reset for re-processing
          leadService.upsert({
            leadId: lead.leadId,
            cooldownUntil: undefined,
          });
          leadService.updateStatus(lead.leadId, 'filtered');

          refreshed.push(lead.leadId);
          this.passed++;

          logger.debug(`Refreshed lead due to signal change: ${lead.leadId}`);
        } else {
          // Update timestamp to prevent re-checking too soon
          leadService.upsert({ leadId: lead.leadId });
        }
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    return refreshed;
  }

  private async checkSignalChanges(lead: Lead): Promise<boolean> {
    const signals = this.config.refresh.signals;

    // Website change detection
    if (signals.websiteChange && lead.website) {
      // In a full implementation, this would re-check the website
      // and compare with stored enrichment data
      // For now, we just mark as potentially changed if website exists
      // and enrichment data is old
    }

    // Review/rating changes would require re-scraping the source
    // This is a placeholder for actual implementation

    // For now, return false to indicate no changes detected
    // In production, this would do actual comparisons
    return false;
  }

  private rowToLead(row: any): Lead {
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
      lastContactResult: row.last_contact_result,
      excludedReason: row.excluded_reason,
      cooldownUntil: row.cooldown_until,
      activeAngles: JSON.parse(row.active_angles || '[]'),
      exhaustedAngles: JSON.parse(row.exhausted_angles || '[]'),
      sourceMetadata: JSON.parse(row.source_metadata || '{}'),
      enrichmentData: row.enrichment_data ? JSON.parse(row.enrichment_data) : undefined,
      enrichmentFailures: JSON.parse(row.enrichment_failures || '[]'),
      score: row.score,
      scoreReasons: row.score_reasons ? JSON.parse(row.score_reasons) : undefined,
      status: row.status,
      lastOutputAt: row.last_output_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { RefreshStage as default };
