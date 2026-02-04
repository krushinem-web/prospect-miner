/**
 * SCORE Stage
 * Goal: Assign numeric scores and outreach angles to leads
 */

import { BaseStage } from '../base-stage';
import { Lead, AngleType } from '../../state/types';
import { leadService } from '../../state/lead-service';
import { logger } from '../../lib/logger';

interface ScoreResult {
  score: number;
  reasons: string[];
  angles: AngleType[];
}

export class ScoreStage extends BaseStage {
  private limit?: number;

  constructor(limit?: number) {
    super('score');
    this.limit = limit || this.config.pipeline.maxLeadsPerRun;
  }

  protected async execute(): Promise<void> {
    // Get leads ready for scoring (status: enriched)
    const leads = leadService.getLeadsForStage('score', this.limit);

    if (leads.length === 0) {
      logger.info('No leads to score');
      return;
    }

    logger.info(`Scoring ${leads.length} leads`);

    for (const lead of leads) {
      this.processed++;

      try {
        const result = this.scoreLead(lead);

        // Check minimum score threshold
        if (result.score < this.config.scoring.thresholds.minScore) {
          logger.debug(`Lead below minimum score: ${lead.leadId}`, {
            score: result.score,
            minScore: this.config.scoring.thresholds.minScore,
          });
          leadService.exclude(lead.leadId, 'bad_fit');
          this.failed++;
          continue;
        }

        // Determine active angles (excluding exhausted ones)
        const activeAngles = result.angles.filter(
          (angle) => !lead.exhaustedAngles.includes(angle)
        );

        // Check if any angles remain
        if (activeAngles.length === 0) {
          logger.debug(`No active angles for lead: ${lead.leadId}`);
          // Set cooldown instead of excluding
          const cooldownDays = this.config.cooldowns.defaultDays;
          const cooldownUntil = Date.now() + cooldownDays * 24 * 60 * 60 * 1000;
          leadService.setCooldown(lead.leadId, cooldownUntil);
          this.failed++;
          continue;
        }

        // Update lead with score and angles
        leadService.updateScore(lead.leadId, result.score, result.reasons);
        leadService.updateAngles(lead.leadId, activeAngles, lead.exhaustedAngles);
        leadService.updateStatus(lead.leadId, 'scored');

        this.passed++;

        logger.debug(`Scored lead: ${lead.leadId}`, {
          score: result.score,
          angles: activeAngles,
        });
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }

      if (this.processed % 100 === 0) {
        this.updateProgress();
      }
    }

    logger.info('Scoring complete', {
      processed: this.processed,
      passed: this.passed,
      failed: this.failed,
    });
  }

  private scoreLead(lead: Lead): ScoreResult {
    let score = 0;
    const reasons: string[] = [];
    const angles: AngleType[] = [];
    const weights = this.config.scoring.weights;
    const thresholds = this.config.scoring.thresholds;
    const angleWeights = this.config.scoring.angleWeights;

    // Email score
    if (lead.email || (lead.enrichmentData?.emails && lead.enrichmentData.emails.length > 0)) {
      score += weights.hasEmail;
      reasons.push('+email_found');
    } else {
      reasons.push('-no_email');
    }

    // Phone score
    if (lead.phone || (lead.enrichmentData?.phones && lead.enrichmentData.phones.length > 0)) {
      score += weights.hasPhone;
      reasons.push('+phone_found');
    } else {
      reasons.push('-no_phone');
    }

    // Website score and angles
    if (!lead.website) {
      // No website = opportunity angle
      angles.push('no_website');
      score += angleWeights.no_website;
      reasons.push('+no_website_angle');
    } else {
      score += weights.hasWebsite;
      reasons.push('+has_website');

      // Check for outdated website signals
      if (this.isOutdatedWebsite(lead)) {
        angles.push('outdated_website');
        score += angleWeights.outdated_website;
        reasons.push('+outdated_website_angle');
      }
    }

    // Online booking check
    if (lead.enrichmentData && !lead.enrichmentData.hasOnlineBooking) {
      angles.push('no_online_booking');
      score += angleWeights.no_online_booking;
      reasons.push('+no_booking_angle');
    }

    // Review count (from source metadata)
    const reviewCount = this.getReviewCount(lead);
    if (reviewCount !== null) {
      if (reviewCount < thresholds.lowReviewCount) {
        angles.push('low_reviews');
        score += angleWeights.low_reviews;
        reasons.push('+low_reviews_angle');
      } else {
        // More reviews = higher confidence
        const reviewBonus = Math.min(reviewCount / 10, weights.reviewCount);
        score += reviewBonus;
        reasons.push(`+review_count(${reviewCount})`);
      }
    }

    // Rating check
    const rating = this.getRating(lead);
    if (rating !== null) {
      if (rating < thresholds.poorRatingThreshold) {
        angles.push('poor_ratings');
        score += angleWeights.poor_ratings;
        reasons.push(`+poor_rating_angle(${rating})`);
      } else {
        // Good rating = higher score
        const ratingBonus = (rating / 5) * weights.rating;
        score += ratingBonus;
        reasons.push(`+good_rating(${rating})`);
      }
    }

    // Founder-led check (from LinkedIn or website signals)
    if (this.isFounderLed(lead)) {
      angles.push('founder_led');
      score += angleWeights.founder_led;
      reasons.push('+founder_led_angle');
    }

    // Normalize score to 0-100
    score = Math.min(100, Math.max(0, Math.round(score)));

    return { score, reasons, angles };
  }

  private isOutdatedWebsite(lead: Lead): boolean {
    // Check if website appears outdated based on various signals
    if (!lead.enrichmentData) return false;

    // Check last update if available
    if (lead.enrichmentData.lastWebsiteUpdate) {
      const updateDate = new Date(lead.enrichmentData.lastWebsiteUpdate);
      const daysSinceUpdate = (Date.now() - updateDate.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceUpdate > this.config.scoring.thresholds.outdatedWebsiteDays) {
        return true;
      }
    }

    // Check for outdated technologies in future
    // This would require more sophisticated analysis

    return false;
  }

  private getReviewCount(lead: Lead): number | null {
    // Check source metadata for review count
    const additionalData = lead.sourceMetadata as any;
    if (additionalData?.reviewCount !== undefined) {
      return additionalData.reviewCount;
    }
    return null;
  }

  private getRating(lead: Lead): number | null {
    // Check source metadata for rating
    const additionalData = lead.sourceMetadata as any;
    if (additionalData?.rating !== undefined) {
      return additionalData.rating;
    }
    return null;
  }

  private isFounderLed(lead: Lead): boolean {
    // Check enrichment data for founder signals
    if (!lead.enrichmentData) return false;

    // Check LinkedIn signals
    if (lead.enrichmentData.founderLinkedin) {
      return true;
    }

    // Check employee count (small companies more likely founder-led)
    if (lead.enrichmentData.employeeCount && lead.enrichmentData.employeeCount <= 10) {
      return true;
    }

    return false;
  }
}

export { ScoreStage as default };
