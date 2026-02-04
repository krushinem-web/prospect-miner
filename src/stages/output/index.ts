/**
 * OUTPUT Stage
 * Goal: Deliver leads in campaign-ready format
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseStage } from '../base-stage';
import { Lead } from '../../state/types';
import { leadService } from '../../state/lead-service';
import { logger } from '../../lib/logger';
import { env } from '../../lib/env';
import { timestampString, formatDate } from '../../lib/utils';

export class OutputStage extends BaseStage {
  private limit?: number;
  private format?: 'csv' | 'json' | 'both';
  private minScore?: number;

  constructor(limit?: number, format?: 'csv' | 'json' | 'both', minScore?: number) {
    super('output');
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
    this.format = format || this.config.output.format;
    this.minScore = minScore || this.config.scoring.thresholds.minScore;
  }

  protected async execute(): Promise<void> {
    // Get leads ready for output (status: scored)
    const allLeads = leadService.getLeadsForStage('output', this.limit);

    // Filter by minimum score
    const leads = allLeads.filter((lead) => (lead.score || 0) >= this.minScore!);

    if (leads.length === 0) {
      logger.info('No leads to output');
      return;
    }

    logger.info(`Outputting ${leads.length} leads`);

    // Generate output
    const timestamp = timestampString();
    const outputDir = this.config.output.directory || env.DATA_DIR;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filenameBase = this.config.output.filenamePattern
      .replace('{date}', formatDate(Date.now()))
      .replace('{count}', String(leads.length));

    const outputFiles: string[] = [];

    // CSV output
    if (this.format === 'csv' || this.format === 'both') {
      const csvPath = path.join(outputDir, `${filenameBase}.csv`);
      this.writeCsv(leads, csvPath);
      outputFiles.push(csvPath);
    }

    // JSON output
    if (this.format === 'json' || this.format === 'both') {
      const jsonPath = path.join(outputDir, `${filenameBase}.json`);
      this.writeJson(leads, jsonPath);
      outputFiles.push(jsonPath);
    }

    // Update lead state
    for (const lead of leads) {
      this.processed++;

      try {
        leadService.markOutput(lead.leadId);

        // Set cooldown to prevent immediate re-output
        const cooldownDays = this.config.cooldowns.defaultDays;
        const cooldownUntil = Date.now() + cooldownDays * 24 * 60 * 60 * 1000;
        leadService.setCooldown(lead.leadId, cooldownUntil);

        this.passed++;
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    logger.info('Output complete', {
      files: outputFiles,
      leadsExported: this.passed,
    });
  }

  private writeCsv(leads: Lead[], filePath: string): void {
    const fields = this.config.output.fields;
    const includeAngles = this.config.output.includeAngles;
    const includeReasons = this.config.output.includeReasons;

    // Build header
    const headers = [...fields];
    if (includeAngles && !headers.includes('activeAngles')) {
      headers.push('activeAngles');
    }
    if (includeReasons && !headers.includes('scoreReasons')) {
      headers.push('scoreReasons');
    }

    // Build rows
    const rows: string[] = [headers.join(',')];

    for (const lead of leads) {
      const values = headers.map((field) => {
        const value = this.getFieldValue(lead, field);
        return this.escapeCsvValue(value);
      });
      rows.push(values.join(','));
    }

    fs.writeFileSync(filePath, rows.join('\n'), 'utf-8');
    logger.info(`Wrote CSV: ${filePath}`, { rows: leads.length });
  }

  private writeJson(leads: Lead[], filePath: string): void {
    const fields = this.config.output.fields;
    const includeAngles = this.config.output.includeAngles;
    const includeReasons = this.config.output.includeReasons;

    const output = leads.map((lead) => {
      const obj: Record<string, any> = {};

      for (const field of fields) {
        obj[field] = this.getFieldValue(lead, field);
      }

      if (includeAngles && !fields.includes('activeAngles')) {
        obj.activeAngles = lead.activeAngles;
      }

      if (includeReasons && !fields.includes('scoreReasons')) {
        obj.scoreReasons = lead.scoreReasons;
      }

      return obj;
    });

    const metadata = {
      exportedAt: new Date().toISOString(),
      runId: this.getRunId(),
      count: leads.length,
      minScore: this.minScore,
    };

    const fullOutput = {
      metadata,
      leads: output,
    };

    fs.writeFileSync(filePath, JSON.stringify(fullOutput, null, 2), 'utf-8');
    logger.info(`Wrote JSON: ${filePath}`, { leads: leads.length });
  }

  private getFieldValue(lead: Lead, field: string): any {
    // Handle special cases
    if (field === 'activeAngles') {
      return lead.activeAngles.join(';');
    }
    if (field === 'scoreReasons') {
      return (lead.scoreReasons || []).join(';');
    }

    // Handle nested fields with dot notation
    const parts = field.split('.');
    let value: any = lead;

    for (const part of parts) {
      if (value === null || value === undefined) return '';
      value = value[part];
    }

    // Format arrays
    if (Array.isArray(value)) {
      return value.join(';');
    }

    return value ?? '';
  }

  private escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // Escape if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }
}

export { OutputStage as default };
