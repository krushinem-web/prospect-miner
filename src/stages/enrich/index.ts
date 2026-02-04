/**
 * ENRICH Stage
 * Goal: Attach contact methods and outreach-relevant attributes
 */

import { BaseStage } from '../base-stage';
import { Lead, EnrichmentData, EnrichmentFailure, FailureType } from '../../state/types';
import { leadService } from '../../state/lead-service';
import { logger } from '../../lib/logger';
import {
  extractEmails,
  extractPhones,
  normalizeUrl,
  isLikelyContactPage,
  retry,
  sleep,
  RateLimiter,
} from '../../lib/utils';

// Website scraper interface
interface WebsiteScrapeResult {
  success: boolean;
  html?: string;
  title?: string;
  failureType?: FailureType;
  errorMessage?: string;
}

export class EnrichStage extends BaseStage {
  private limit?: number;
  private useBrowser: boolean;
  private rateLimiter: RateLimiter;

  constructor(limit?: number, useBrowser: boolean = true) {
    super('enrich');
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
    this.useBrowser = useBrowser;
    // Rate limit: 1 request per second to be respectful
    this.rateLimiter = new RateLimiter(60, 60000);
  }

  protected async execute(): Promise<void> {
    // Get leads ready for enrichment (status: filtered)
    const leads = leadService.getLeadsForStage('enrich', this.limit);

    if (leads.length === 0) {
      logger.info('No leads to enrich');
      return;
    }

    logger.info(`Enriching ${leads.length} leads`);

    for (const lead of leads) {
      this.processed++;

      try {
        await this.enrichLead(lead);
        this.passed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Enrichment failed for ${lead.leadId}`, { error: errorMessage });

        const failure: EnrichmentFailure = {
          type: 'unknown',
          source: 'website',
          timestamp: Date.now(),
          message: errorMessage,
        };
        leadService.addEnrichmentFailure(lead.leadId, failure);
        this.failed++;
      }

      if (this.processed % 10 === 0) {
        this.updateProgress();
      }
    }

    logger.info('Enrichment complete', {
      processed: this.processed,
      passed: this.passed,
      failed: this.failed,
    });
  }

  private async enrichLead(lead: Lead): Promise<void> {
    const enrichmentData: EnrichmentData = {
      emails: [],
      phones: [],
      socialLinks: {},
      hasOnlineBooking: false,
    };

    // Start with existing data if any
    if (lead.enrichmentData) {
      Object.assign(enrichmentData, lead.enrichmentData);
    }

    // Scrape website if available
    if (lead.website) {
      await this.rateLimiter.acquire();
      const websiteData = await this.scrapeWebsite(lead.website, lead.leadId);

      if (websiteData) {
        enrichmentData.emails = [...new Set([...enrichmentData.emails, ...websiteData.emails])];
        enrichmentData.phones = [...new Set([...enrichmentData.phones, ...websiteData.phones])];
        enrichmentData.hasOnlineBooking = enrichmentData.hasOnlineBooking || websiteData.hasOnlineBooking;
        enrichmentData.pageTitle = websiteData.pageTitle || enrichmentData.pageTitle;

        if (websiteData.socialLinks) {
          Object.assign(enrichmentData.socialLinks, websiteData.socialLinks);
        }
      }
    }

    // Update lead with enrichment data
    leadService.updateEnrichment(lead.leadId, enrichmentData);

    // Update email/phone on lead if found
    if (enrichmentData.emails.length > 0 && !lead.email) {
      leadService.upsert({
        leadId: lead.leadId,
        email: enrichmentData.emails[0],
      });
    }

    if (enrichmentData.phones.length > 0 && !lead.phone) {
      leadService.upsert({
        leadId: lead.leadId,
        phone: enrichmentData.phones[0],
      });
    }

    // Update status
    leadService.updateStatus(lead.leadId, 'enriched');
  }

  private async scrapeWebsite(
    url: string,
    leadId: string
  ): Promise<{
    emails: string[];
    phones: string[];
    hasOnlineBooking: boolean;
    pageTitle?: string;
    socialLinks?: Record<string, string>;
  } | null> {
    const normalizedUrl = normalizeUrl(url);

    try {
      // Simple HTTP fetch (no browser for basic enrichment)
      const result = await this.fetchPage(normalizedUrl);

      if (!result.success || !result.html) {
        if (result.failureType) {
          const failure: EnrichmentFailure = {
            type: result.failureType,
            source: normalizedUrl,
            timestamp: Date.now(),
            message: result.errorMessage,
          };
          leadService.addEnrichmentFailure(leadId, failure);
        }
        return null;
      }

      const html = result.html;
      const emails = extractEmails(html, this.config.enrichment.emailPatterns);
      const phones = extractPhones(html, this.config.enrichment.phonePatterns);

      // Check for online booking signals
      const hasOnlineBooking = this.detectOnlineBooking(html);

      // Extract social links
      const socialLinks = this.extractSocialLinks(html);

      // Try to find contact page
      const contactPageUrls = this.findContactPageLinks(html, normalizedUrl);
      for (const contactUrl of contactPageUrls.slice(0, 2)) {
        await sleep(500); // Small delay between requests
        const contactResult = await this.fetchPage(contactUrl);
        if (contactResult.success && contactResult.html) {
          const contactEmails = extractEmails(contactResult.html, this.config.enrichment.emailPatterns);
          const contactPhones = extractPhones(contactResult.html, this.config.enrichment.phonePatterns);
          emails.push(...contactEmails);
          phones.push(...contactPhones);
        }
      }

      return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)],
        hasOnlineBooking,
        pageTitle: result.title,
        socialLinks,
      };
    } catch (error) {
      logger.warn(`Website scrape failed: ${normalizedUrl}`, { error: String(error) });
      return null;
    }
  }

  private async fetchPage(url: string): Promise<WebsiteScrapeResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.enrichment.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.config.enrichment.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, failureType: 'page_not_found' };
        }
        if (response.status === 403 || response.status === 429) {
          return { success: false, failureType: 'rate_limited' };
        }
        return { success: false, failureType: 'unknown', errorMessage: `HTTP ${response.status}` };
      }

      const html = await response.text();

      // Check for captcha
      if (this.detectCaptcha(html)) {
        return { success: false, failureType: 'captcha_block' };
      }

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : undefined;

      return { success: true, html, title };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
        return { success: false, failureType: 'dns_error', errorMessage };
      }
      if (errorMessage.includes('CERT') || errorMessage.includes('SSL')) {
        return { success: false, failureType: 'ssl_error', errorMessage };
      }
      if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
        return { success: false, failureType: 'site_timeout', errorMessage };
      }

      return { success: false, failureType: 'unknown', errorMessage };
    }
  }

  private detectCaptcha(html: string): boolean {
    const captchaSignals = [
      'captcha',
      'recaptcha',
      'hcaptcha',
      'challenge-running',
      'cf-browser-verification',
      'please verify you are human',
    ];
    const lowerHtml = html.toLowerCase();
    return captchaSignals.some((signal) => lowerHtml.includes(signal));
  }

  private detectOnlineBooking(html: string): boolean {
    const bookingSignals = [
      'book now',
      'book online',
      'schedule appointment',
      'schedule now',
      'book appointment',
      'online booking',
      'calendly',
      'acuity',
      'squareup.com/appointments',
      'booksy',
      'schedulicity',
    ];
    const lowerHtml = html.toLowerCase();
    return bookingSignals.some((signal) => lowerHtml.includes(signal));
  }

  private extractSocialLinks(html: string): Record<string, string> {
    const socialLinks: Record<string, string> = {};
    const patterns: Record<string, RegExp> = {
      facebook: /href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"']+)["']/gi,
      instagram: /href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"']+)["']/gi,
      linkedin: /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"']+)["']/gi,
      twitter: /href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"']+)["']/gi,
      youtube: /href=["'](https?:\/\/(?:www\.)?youtube\.com\/[^"']+)["']/gi,
    };

    for (const [platform, pattern] of Object.entries(patterns)) {
      const match = pattern.exec(html);
      if (match) {
        socialLinks[platform] = match[1];
      }
    }

    return socialLinks;
  }

  private findContactPageLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const patterns = this.config.enrichment.contactPagePatterns;

    // Find all links in the HTML
    const linkRegex = /href=["']([^"']+)["']/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (isLikelyContactPage(href, patterns)) {
        // Resolve relative URLs
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          if (!links.includes(absoluteUrl)) {
            links.push(absoluteUrl);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }

    return links;
  }
}

export { EnrichStage as default };
