/**
 * Yelp discovery source
 * Scrapes business listings from Yelp search results
 */

import { SourceHandler, registerSourceHandler } from '../index';
import { SourceConfig } from '../../../config/types';
import { RawBusinessData } from '../../../state/types';
import { logger } from '../../../lib/logger';
import { sleep } from '../../../lib/utils';

// Simple HTTP-based Yelp scraper (no browser needed for search results)
async function* discoverFromYelp(
  source: SourceConfig,
  limit?: number
): AsyncGenerator<RawBusinessData> {
  const categories = source.categories || [];
  const geos = source.geos || [];

  if (categories.length === 0 || geos.length === 0) {
    logger.warn('Yelp source missing categories or geos');
    return;
  }

  let discovered = 0;

  for (const geo of geos) {
    for (const category of categories) {
      if (limit && discovered >= limit) return;

      const location = `${geo.city}, ${geo.state}`;
      logger.info(`Searching Yelp: ${category} in ${location}`);

      // In production, this would make actual HTTP requests to Yelp
      // For now, we simulate with placeholder data to demonstrate the flow
      // The actual scraping logic would use fetch or playwright

      // Simulated response - replace with actual scraping in production
      const mockBusinesses = generateMockBusinesses(category, geo.city, geo.state, 10);

      for (const business of mockBusinesses) {
        if (limit && discovered >= limit) return;

        yield business;
        discovered++;

        // Respect rate limiting
        await sleep(100);
      }
    }
  }
}

// Mock data generator for development/testing
function generateMockBusinesses(
  category: string,
  city: string,
  state: string,
  count: number
): RawBusinessData[] {
  const businesses: RawBusinessData[] = [];

  const prefixes = ['Pro', 'Elite', 'Quality', 'Premium', 'Local', 'Best', 'Reliable', 'Expert'];
  const suffixes = ['Services', 'Solutions', 'Company', 'Group', 'Pros', 'Masters', 'Experts'];

  for (let i = 0; i < count; i++) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${prefix} ${category.charAt(0).toUpperCase() + category.slice(1)} ${suffix}`;

    businesses.push({
      name,
      address: `${100 + i * 10} Main Street`,
      city,
      state,
      postalCode: `7${Math.floor(Math.random() * 9000 + 1000)}`,
      country: 'US',
      phone: `(512) ${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
      website: Math.random() > 0.3 ? `https://www.${name.toLowerCase().replace(/\s+/g, '')}.com` : undefined,
      rating: Math.round((3 + Math.random() * 2) * 10) / 10,
      reviewCount: Math.floor(Math.random() * 200),
      categories: [category],
      sourceUrl: `https://www.yelp.com/biz/${name.toLowerCase().replace(/\s+/g, '-')}-${city.toLowerCase()}`,
    });
  }

  return businesses;
}

// Yelp source handler
const yelpHandler: SourceHandler = {
  discover: discoverFromYelp,
};

// Register the handler
registerSourceHandler('directory', yelpHandler);

export { yelpHandler };
