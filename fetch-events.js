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

// Only return events starting from today onwards (ISO 8601, no ms)
function getStartDateTime() {
  return new Date().toISOString().split('.')[0] + 'Z';
}

function buildUrl(params) {
  const queryParams = new URLSearchParams({
    apikey: API_KEY,
    size: '50', // fetch more so the post-filter has something to work with
    sort: 'date,asc',
    startDateTime: getStartDateTime(),
    ...params,
  });
  return `${BASE_URL}?${queryParams.toString()}`;
}

// Keywords we'll search for. Ticketmaster's "Miscellaneous" segment covers
// expos & conventions, but coverage is thin — layering keyword searches on top
// catches B2B events that Ticketmaster classifies under Music/Arts/etc.
const KEYWORD_QUERIES = ['conference', 'expo', 'trade show', 'summit', 'convention'];

// Client-side filter: ALL events must match a positive keyword (b2b signal).
// This is stricter than the prior "allow all Miscellaneous" rule because
// Ticketmaster's Miscellaneous segment also includes tourist attractions
// (London Eye, Madame Tussauds, etc.) which have no business here.
const KEEP_KEYWORDS = /\b(conference|expo|summit|convention|trade show|tradeshow|forum|symposium|congress|b2b|b2c|exhibition)\b/i;

// Belt-and-braces reject list. Since KEEP_KEYWORDS is already required,
// most attractions are filtered out automatically — this catches edge
// cases where an attraction happens to contain a keep word.
const REJECT_KEYWORDS = /standard entry|standard experience|standard admission|skip the line|fast track|guided tour|observation deck|madame tussauds|london eye|london dungeon|sea life|legoland|ripley's/i;

// Genres/subGenres that signal tourist attractions rather than B2B events
const REJECT_GENRES = new Set([
  'Attraction/Experience',
  'Family',
  'Multi Event',
  'Theme Parks/Attractions',
]);

function parseEvent(event) {
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
    subGenre: classifications?.subGenre?.name || null,
    image: image?.url || null,
    priceRange: event.priceRanges?.[0]
      ? `${event.priceRanges[0].currency} ${event.priceRanges[0].min}-${event.priceRanges[0].max}`
      : null,
  };
}

function isRelevantEvent(evt) {
  const name = evt.name || '';

  // Hard rejects by name pattern (attractions, concerts, sports, theatre)
  if (REJECT_KEYWORDS.test(name)) return false;

  // Hard rejects by genre/subGenre (Ticketmaster's own attraction tagging)
  if (REJECT_GENRES.has(evt.genre || '')) return false;
  if (REJECT_GENRES.has(evt.subGenre || '')) return false;

  // Must look like a conference/expo/summit by name
  return KEEP_KEYWORDS.test(name);
}

async function fetchEventsForLocation(locationKey, locationData) {
  const params = getQueryParams(locationKey, locationData.displayName);
  const seen = new Map(); // id -> event (dedupe)

  // Query 1: Miscellaneous segment (covers expos, conventions, fairs)
  try {
    const url = buildUrl({ ...params, segmentName: 'Miscellaneous' });
    const response = await fetchJson(url);
    for (const raw of response._embedded?.events || []) {
      const evt = parseEvent(raw);
      if (!seen.has(evt.id)) seen.set(evt.id, evt);
    }
  } catch (err) {
    // Silently skip — not all locations have results
  }

  // Queries 2-N: keyword searches for conference-like terms
  for (const keyword of KEYWORD_QUERIES) {
    try {
      const url = buildUrl({ ...params, keyword });
      const response = await fetchJson(url);
      for (const raw of response._embedded?.events || []) {
        const evt = parseEvent(raw);
        if (!seen.has(evt.id)) seen.set(evt.id, evt);
      }
      // Gentle rate limiting between keyword calls
      await sleep(150);
    } catch (err) {
      // Silently skip
    }
  }

  // Filter out concerts/sports/theatre, then sort by date and cap
  return Array.from(seen.values())
    .filter(isRelevantEvent)
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

  // ============================================================
  // VALIDATION REPORT — prints sample events so you can eyeball
  // the output in the GitHub Actions log without touching Webflow
  // ============================================================
  console.log('\n===========================');
  console.log('VALIDATION SAMPLE');
  console.log('===========================');

  // Show sample events from flagship locations
  const SAMPLE_LOCATIONS = [
    'london', 'newyork', 'losangeles', 'sanfrancisco', 'chicago',
    'dubai', 'paris', 'berlin', 'sydney', 'toronto', 'singapore',
  ];
  for (const key of SAMPLE_LOCATIONS) {
    const loc = eventsData[key];
    if (!loc || !loc.events || loc.events.length === 0) {
      console.log(`\n[${key}] — no events`);
      continue;
    }
    console.log(`\n[${loc.displayName}] (${loc.eventCount} events)`);
    loc.events.slice(0, 5).forEach((evt, i) => {
      const segInfo = [evt.segment, evt.genre, evt.subGenre].filter(Boolean).join(' > ');
      console.log(`  ${i + 1}. ${evt.name}`);
      console.log(`     ${evt.date} @ ${evt.venueName || '?'}  |  ${segInfo}`);
    });
  }

  // Distribution of segments across the whole dataset — a sanity check.
  // Lots of "Arts & Theatre" or "Sports" means the filter is leaking.
  const segmentCounts = {};
  const genreCounts = {};
  const suspiciousNames = [];
  const SUSPICIOUS_PATTERN = /\b(ticket|entry|experience|tour|ride|attraction|standard|admission|vs\.?|the musical|ballet|opera|on ice)\b/i;

  for (const key of Object.keys(eventsData)) {
    for (const evt of eventsData[key].events || []) {
      segmentCounts[evt.segment || 'Unknown'] = (segmentCounts[evt.segment || 'Unknown'] || 0) + 1;
      genreCounts[evt.genre || 'Unknown'] = (genreCounts[evt.genre || 'Unknown'] || 0) + 1;
      if (SUSPICIOUS_PATTERN.test(evt.name || '')) {
        suspiciousNames.push(`${eventsData[key].displayName}: ${evt.name}`);
      }
    }
  }

  console.log('\n---------------------------');
  console.log('Segment distribution:');
  Object.entries(segmentCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([seg, n]) => console.log(`  ${seg}: ${n}`));

  console.log('\nTop 10 genres:');
  Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([g, n]) => console.log(`  ${g}: ${n}`));

  if (suspiciousNames.length > 0) {
    console.log(`\n⚠️  ${suspiciousNames.length} events matched suspicious-name patterns (review these):`);
    suspiciousNames.slice(0, 30).forEach((n) => console.log(`  - ${n}`));
    if (suspiciousNames.length > 30) {
      console.log(`  ... and ${suspiciousNames.length - 30} more`);
    }
  } else {
    console.log('\n✓ No events matched suspicious-name patterns');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
