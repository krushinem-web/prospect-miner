/**
 * FILTER Stage
 * Goal: Eliminate businesses unlikely to convert using rule-based filters and lead state
 */

import { BaseStage } from '../base-stage';
import { Lead, ExclusionReason } from '../../state/types';
import { leadService } from '../../state/lead-service';
import { logger } from '../../lib/logger';
import { FilterRule } from '../../config/types';
import { chunk } from '../../lib/utils';

export class FilterStage extends BaseStage {
  private limit?: number;

  constructor(limit?: number) {
    super('filter');
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
  }

  protected async execute(): Promise<void> {
    // Get leads ready for filtering (status: collected)
    const leads = leadService.getLeadsForStage('filter', this.limit);

    if (leads.length === 0) {
      logger.info('No leads to filter');
      return;
    }

    logger.info(`Filtering ${leads.length} leads`);

    const rules = this.config.filters.rules;
    const excludeCategories = new Set(
      this.config.filters.excludeCategories.map((c) => c.toLowerCase())
    );
    const excludeKeywords = this.config.filters.excludeKeywords.map((k) => k.toLowerCase());

    for (const lead of leads) {
      this.processed++;

      try {
        const exclusionReason = this.evaluateLead(lead, rules, excludeCategories, excludeKeywords);

        if (exclusionReason) {
          leadService.exclude(lead.leadId, exclusionReason);
          this.failed++;
          logger.debug(`Excluded lead: ${lead.leadId}`, { reason: exclusionReason });
        } else {
          // Check cooldown
          if (lead.cooldownUntil && lead.cooldownUntil > Date.now()) {
            logger.debug(`Lead in cooldown: ${lead.leadId}`, {
              until: new Date(lead.cooldownUntil).toISOString(),
            });
            this.failed++;
          } else {
            leadService.updateStatus(lead.leadId, 'filtered');
            this.passed++;
          }
        }
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }

      if (this.processed % 100 === 0) {
        this.updateProgress();
      }
    }

    logger.info('Filter complete', {
      processed: this.processed,
      passed: this.passed,
      excluded: this.failed,
    });
  }

  private evaluateLead(
    lead: Lead,
    rules: FilterRule[],
    excludeCategories: Set<string>,
    excludeKeywords: string[]
  ): ExclusionReason | null {
    // Check if already excluded
    if (lead.excludedReason) {
      return lead.excludedReason;
    }

    // Check category exclusions
    const leadCategories = lead.sourceMetadata.tags || [];
    for (const category of leadCategories) {
      if (excludeCategories.has(category.toLowerCase())) {
        return 'bad_fit';
      }
    }

    // Check keyword exclusions in business name
    const lowerName = lead.businessName.toLowerCase();
    for (const keyword of excludeKeywords) {
      if (lowerName.includes(keyword)) {
        return 'bad_fit';
      }
    }

    // Evaluate custom rules
    for (const rule of rules) {
      if (this.evaluateRule(lead, rule)) {
        return rule.reason;
      }
    }

    return null;
  }

  private evaluateRule(lead: Lead, rule: FilterRule): boolean {
    const value = this.getFieldValue(lead, rule.field);

    switch (rule.operator) {
      case 'equals':
        return value === rule.value;

      case 'not_equals':
        return value !== rule.value;

      case 'contains':
        return typeof value === 'string' && value.toLowerCase().includes(String(rule.value).toLowerCase());

      case 'not_contains':
        return typeof value === 'string' && !value.toLowerCase().includes(String(rule.value).toLowerCase());

      case 'greater_than':
        return typeof value === 'number' && value > rule.value;

      case 'less_than':
        return typeof value === 'number' && value < rule.value;

      case 'is_null':
        return value === null || value === undefined;

      case 'not_null':
        return value !== null && value !== undefined;

      case 'regex':
        if (typeof value !== 'string') return false;
        try {
          const regex = new RegExp(rule.value);
          return regex.test(value);
        } catch {
          logger.warn(`Invalid regex in filter rule: ${rule.value}`);
          return false;
        }

      default:
        logger.warn(`Unknown filter operator: ${rule.operator}`);
        return false;
    }
  }

  private getFieldValue(lead: Lead, field: string): any {
    // Handle nested fields with dot notation
    const parts = field.split('.');
    let value: any = lead;

    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }

    return value;
  }
}

export { FilterStage as default };
