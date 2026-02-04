/**
 * Google Places API discovery source
 * Fetches real business listings from Google Places API (New)
 */

import { SourceHandler, registerSourceHandler } from '../index';
import { SourceConfig } from '../../../config/types';
import { RawBusinessData } from '../../../state/types';
import { logger } from '../../../lib/logger';
import { sleep } from '../../../lib/utils';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// Field mask for the data we want from Places API
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri';

async function* discoverFromGooglePlaces(
  source: SourceConfig,
  limit?: number
): AsyncGenerator<RawBusinessData> {
  if (!GOOGLE_PLACES_API_KEY) {
    logger.error('GOOGLE_PLACES_API_KEY not set. Get one at https://console.cloud.google.com/');
    return;
  }

  const categories = source.categories || [];
  const geos = source.geos || [];

  if (categories.length === 0 || geos.length === 0) {
    logger.warn('Google Places source missing categories or geos');
    return;
  }

  let discovered = 0;

  for (const geo of geos) {
    for (const category of categories) {
      if (limit && discovered >= limit) return;

      const location = `${geo.city}, ${geo.state}`;
      logger.info(`Searching Google Places: ${category} in ${location}`);

      try {
        // Search for places using text search
        const searchUrl = `${PLACES_API_BASE}/places:searchText`;
        const searchBody = {
          textQuery: `${category} in ${location}`,
          locationBias: {
            circle: {
              center: {
                latitude: 0, // Will be resolved by text query
                longitude: 0
              },
              radius: Math.min((geo.radius || 25) * 1609.34, 50000) // Convert miles to meters, max 50000
            }
          }
        };

        const searchResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': FIELD_MASK
          },
          body: JSON.stringify(searchBody)
        });

        if (!searchResponse.ok) {
          const error = await searchResponse.text();
          logger.error(`Google Places API error: ${searchResponse.status} - ${error}`);
          continue;
        }

        const data = await searchResponse.json() as { places?: any[] };
        const places = data.places || [];

        logger.info(`Found ${places.length} places for ${category} in ${location}`);
        
        // DEBUG: Log first place details
        if (places.length > 0) {
          logger.info(`DEBUG First place: ${JSON.stringify({
            name: places[0].displayName?.text,
            phone: places[0].internationalPhoneNumber,
            address: places[0].formattedAddress
          })}`);
        }

        for (const place of places) {
          if (limit && discovered >= limit) return;

          // Parse address components
          const addressComponents = place.addressComponents || [];
          const cityComponent = addressComponents.find((c: any) => c.types?.includes('locality'));
          const stateComponent = addressComponents.find((c: any) => c.types?.includes('administrative_area_level_1'));
          const postalComponent = addressComponents.find((c: any) => c.types?.includes('postal_code'));
          const countryComponent = addressComponents.find((c: any) => c.types?.includes('country'));

          // Only include if in the target state
          if (stateComponent?.shortText !== geo.state) {
            logger.debug(`Skipping ${place.displayName?.text} - wrong state (${stateComponent?.shortText})`);
            continue;
          }

          const business: RawBusinessData = {
            name: place.displayName?.text || 'Unknown',
            address: place.formattedAddress || '',
            city: cityComponent?.longText || geo.city,
            state: stateComponent?.shortText || geo.state,
            postalCode: postalComponent?.longText || '',
            country: countryComponent?.shortText || 'US',
            phone: place.internationalPhoneNumber || undefined,
            website: place.websiteUri || undefined,
            rating: place.rating,
            reviewCount: place.userRatingCount,
            categories: [category],
            sourceUrl: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName?.text || '')}`,
            additionalData: {
              googlePlaceId: place.id
            }
          };

          yield business;
          discovered++;

          // Respect rate limiting (Google allows 100 QPS, be conservative)
          await sleep(100);
        }

        // Wait between category searches
        await sleep(500);

      } catch (error) {
        logger.error(`Error fetching from Google Places: ${error}`);
        continue;
      }
    }

    // Wait between geo searches
    await sleep(1000);
  }
}

// Google Places source handler
const googlePlacesHandler: SourceHandler = {
  discover: discoverFromGooglePlaces,
};

// Register the handler
registerSourceHandler('google_places', googlePlacesHandler);

export { googlePlacesHandler };
