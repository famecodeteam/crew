#!/usr/bin/env node
/**
 * Fame Crew Event Aggregator
 *
 * Fetches upcoming events from the Ticketmaster Discovery API for all 202
 * locations in venue-data.json and writes the results to events.json.
 *
 * USAGE:
 *   TICKETMASTER_API_KEY=your_key_here node fetch-events.js
 *
 * GET AN API KEY:
 *   https://developer.ticketmaster.com/user/register
 *   (Free tier: 5,000 API calls per day — well above the 202 needed for a daily refresh)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.TICKETMASTER_API_KEY;
if (!API_KEY) {
  console.error('ERROR: Set TICKETMASTER_API_KEY environment variable');
  console.error('Get a free key: https://developer.ticketmaster.com/user/register');
  process.exit(1);
}

const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const VENUE_DATA_PATH = path.join(__dirname, 'venue-data.json');
const OUTPUT_PATH = path.join(__dirname, 'events.json');

// How many events to fetch per location
const EVENTS_PER_LOCATION = 10;

// Location overrides: Ticketmaster needs city/state/country params,
// and our "locations" include US states, countries, and small towns.
// Maps our location keys to Ticketmaster query parameters.
const LOCATION_OVERRIDES = {
  // US States -> stateCode
  arizona: { stateCode: 'AZ', countryCode: 'US' },
  california: { stateCode: 'CA', countryCode: 'US' },
  colorado: { stateCode: 'CO', countryCode: 'US' },
  connecticut: { stateCode: 'CT', countryCode: 'US' },
  florida: { stateCode: 'FL', countryCode: 'US' },
  massachusetts: { stateCode: 'MA', countryCode: 'US' },
  michigan: { stateCode: 'MI', countryCode: 'US' },
  nevada: { stateCode: 'NV', countryCode: 'US' },
  newjersey: { stateCode: 'NJ', countryCode: 'US' },
  northcarolina: { stateCode: 'NC', countryCode: 'US' },
  oregon: { stateCode: 'OR', countryCode: 'US' },
  texas: { stateCode: 'TX', countryCode: 'US' },

  // Countries -> countryCode only
  bahrain: { countryCode: 'BH' },
  cyprus: { countryCode: 'CY' },
  france: { countryCode: 'FR' },
  kuwait: { countryCode: 'KW' },
  lebanon: { countryCode: 'LB' },
  monaco: { countryCode: 'MC' },
  oman: { countryCode: 'OM' },
  qatar: { countryCode: 'QA' },

  // Cities that need explicit country disambiguation
  albany: { city: 'Albany', stateCode: 'NY', countryCode: 'US' },
  birmingham: { city: 'Birmingham', countryCode: 'GB' },
  cambridge: { city: 'Cambridge', countryCode: 'GB' },
  hamilton: { city: 'Hamilton', countryCode: 'CA' },
  richmond: { city: 'Richmond', stateCode: 'VA', countryCode: 'US' },
  rochester: { city: 'Rochester', stateCode: 'NY', countryCode: 'US' },
  naples: { city: 'Naples', countryCode: 'IT' },
  valencia: { city: 'Valencia', countryCode: 'ES' },
  victoria: { city: 'Victoria', countryCode: 'CA' },
  vienna: { city: 'Vienna', countryCode: 'AT' },

  // Multi-word cities that need hyphen handling
  abudhabi: { city: 'Abu Dhabi', countryCode: 'AE' },
  alkhobar: { city: 'Al Khobar', countryCode: 'SA' },
  batonrouge: { city: 'Baton Rouge', stateCode: 'LA', countryCode: 'US' },
  capecoral: { city: 'Cape Coral', stateCode: 'FL', countryCode: 'US' },
  coloradosprings: { city: 'Colorado Springs', stateCode: 'CO', countryCode: 'US' },
  elpaso: { city: 'El Paso', stateCode: 'TX', countryCode: 'US' },
  fortworth: { city: 'Fort Worth', stateCode: 'TX', countryCode: 'US' },
  hongkong: { city: 'Hong Kong', countryCode: 'HK' },
  kansascity: { city: 'Kansas City', stateCode: 'MO', countryCode: 'US' },
  lasvegas: { city: 'Las Vegas', stateCode: 'NV', countryCode: 'US' },
  littlerock: { city: 'Little Rock', stateCode: 'AR', countryCode: 'US' },
  longbeach: { city: 'Long Beach', stateCode: 'CA', countryCode: 'US' },
  losangeles: { city: 'Los Angeles', stateCode: 'CA', countryCode: 'US' },
  luxembourgcity: { city: 'Luxembourg', countryCode: 'LU' },
  neworleans: { city: 'New Orleans', stateCode: 'LA', countryCode: 'US' },
  newyork: { city: 'New York', stateCode: 'NY', countryCode: 'US' },
  oklahomacity: { city: 'Oklahoma City', stateCode: 'OK', countryCode: 'US' },
  puertovallarta: { city: 'Puerto Vallarta', countryCode: 'MX' },
  quebeccity: { city: 'Quebec City', countryCode: 'CA' },
  saltlakecity: { city: 'Salt Lake City', stateCode: 'UT', countryCode: 'US' },
  sanantonio: { city: 'San Antonio', stateCode: 'TX', countryCode: 'US' },
  sandiego: { city: 'San Diego', stateCode: 'CA', countryCode: 'US' },
  sanfrancisco: { city: 'San Francisco', stateCode: 'CA', countryCode: 'US' },
  sanjose: { city: 'San Jose', stateCode: 'CA', countryCode: 'US' },
  stlouis: { city: 'St Louis', stateCode: 'MO', countryCode: 'US' },
  virginiabeach: { city: 'Virginia Beach', stateCode: 'VA', countryCode: 'US' },

  // NYC boroughs map to New York City
  bronx: { city: 'Bronx', stateCode: 'NY', countryCode: 'US' },
  brooklyn: { city: 'Brooklyn', stateCode: 'NY', countryCode: 'US' },
  manhattan: { city: 'New York', stateCode: 'NY', countryCode: 'US' },
  queens: { city: 'Queens', stateCode: 'NY', countryCode: 'US' },

  // Small/uncommon locations — use broader country search
  chengjiang: { countryCode: 'CN' },
  esbjerg: { city: 'Esbjerg', countryCode: 'DK' },
  kokoszki: { countryCode: 'PL' },
  meixedo: { countryCode: 'PT' },
  pansol: { countryCode: 'PH' },
  sulzbach: { countryCode: 'DE' },
  warren: { city: 'Warren', stateCode: 'MI', countryCode: 'US' },
  westgate: { countryCode: 'US' },
};

function getQueryParams(locationKey, displayName) {
  if (LOCATION_OVERRIDES[locationKey]) {
    return LOCATION_OVERRIDES[locationKey];
  }
  // Default: use the display name as the city
  return { city: displayName };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function buildUrl(params) {
  const queryParams = new URLSearchParams({
    apikey: API_KEY,
    size: String(EVENTS_PER_LOCATION),
    sort: 'date,asc',
    ...params,
  });
  return `${BASE_URL}?${queryParams.toString()}`;
}

async function fetchEventsForLocation(locationKey, locationData) {
  const params = getQueryParams(locationKey, locationData.displayName);

  // Fetch two classifications: Conferences & Summits + Trade Shows & Expos
  const classifications = ['Conferences & Summits', 'Trade Shows & Expos'];
  const allEvents = [];

  for (const classification of classifications) {
    const url = buildUrl({ ...params, classificationName: classification });

    try {
      const response = await fetchJson(url);
      const rawEvents = response._embedded?.events || [];

      const parsedEvents = rawEvents.map((event) => {
        const venue = event._embedded?.venues?.[0];
        const classifications = event.classifications?.[0];
        const startDate = event.dates?.start?.localDate;
        const startTime = event.dates?.start?.localTime;
        const image = event.images?.find((img) => img.ratio === '16_9' && img.width >= 640) || event.images?.[0];

        return {
          id: event.id,
          name: event.name,
          url: event.url,
          date: startDate,
          time: startTime || null,
          venueName: venue?.name || null,
          venueAddress: venue?.address?.line1 || null,
          venueCity: venue?.city?.name || null,
          venueCountry: venue?.country?.name || null,
          segment: classifications?.segment?.name || null,
          genre: classifications?.genre?.name || null,
          image: image?.url || null,
          priceRange: event.priceRanges?.[0]
            ? `${event.priceRanges[0].currency} ${event.priceRanges[0].min}-${event.priceRanges[0].max}`
            : null,
        };
      });

      allEvents.push(...parsedEvents);
    } catch (err) {
      // Silently skip classification if it fails — not all locations have all types
    }
  }

  // Return up to EVENTS_PER_LOCATION total, sorted by date
  return allEvents
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, EVENTS_PER_LOCATION);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Fame Crew Event Aggregator');
  console.log('===========================\n');

  const venueData = JSON.parse(fs.readFileSync(VENUE_DATA_PATH, 'utf8'));
  const locationKeys = Object.keys(venueData);

  console.log(`Fetching events for ${locationKeys.length} locations...\n`);

  const eventsData = {};
  let totalEvents = 0;
  let locationsWithEvents = 0;

  for (let i = 0; i < locationKeys.length; i++) {
    const key = locationKeys[i];
    const locationData = venueData[key];
    process.stdout.write(`[${i + 1}/${locationKeys.length}] ${locationData.displayName}...`);

    const events = await fetchEventsForLocation(key, locationData);
    eventsData[key] = {
      displayName: locationData.displayName,
      lastUpdated: new Date().toISOString(),
      eventCount: events.length,
      events: events,
    };

    if (events.length > 0) {
      locationsWithEvents++;
      totalEvents += events.length;
      console.log(` ✓ ${events.length} events`);
    } else {
      console.log(' (none)');
    }

    // Rate limit: ~5 requests/second max on free tier
    await sleep(200);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(eventsData, null, 2));

  console.log('\n===========================');
  console.log(`✓ Saved ${OUTPUT_PATH}`);
  console.log(`✓ Total events: ${totalEvents}`);
  console.log(`✓ Locations with events: ${locationsWithEvents}/${locationKeys.length}`);
  console.log(`✓ Coverage: ${((locationsWithEvents / locationKeys.length) * 100).toFixed(1)}%`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
