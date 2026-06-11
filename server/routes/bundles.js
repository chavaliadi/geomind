/**
 * server/routes/bundles.js — Phase 1A: Smart Bundle Resolver
 *
 * GET /api/smart-bundle?lat=&lng=&radius=
 *
 * Logic:
 *   1. Load all pending tasks for the authenticated user
 *   2. For each unique category, query live Overpass API for nearby POIs
 *   3. Score each store by how many task categories it can serve
 *   4. Call OSRM /trip to compute the optimal visit order
 *   5. Return ranked stores + optimized route + urgency signals
 */

const express  = require('express');
const router   = express.Router();

// ── Overpass API config ───────────────────────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// OSM tag sets per category (mirrors the web overpassService.js)
const OSM_TAGS = {
  grocery:  ['shop=supermarket','shop=convenience','shop=grocery','shop=food','amenity=marketplace','shop=department_store'],
  pharmacy: ['amenity=pharmacy','shop=chemist','shop=medical_supply','healthcare=pharmacy'],
  clothing: ['shop=clothes','shop=boutique','shop=fashion','shop=shoes','shop=department_store'],
  general:  ['shop=mall','shop=department_store','shop=general','amenity=shopping_centre'],
};

// ── Haversine distance (metres) ───────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Build Overpass QL ─────────────────────────────────────────────────────────
function buildOverpassQuery(lat, lng, radiusM, category) {
  const tags = OSM_TAGS[category] || OSM_TAGS.general;
  const clauses = tags
    .map(tag => {
      const [k, v] = tag.split('=');
      return `nw["${k}"="${v}"](around:${radiusM},${lat},${lng});`;
    })
    .join('\n');
  return `[out:json][timeout:20];\n(\n${clauses}\n);\nout center;`;
}

// ── Fetch from Overpass (with endpoint failover) ──────────────────────────────
async function fetchOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12000);
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal:  ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) continue;
      return await res.json();
    } catch { /* try next endpoint */ }
  }
  return null;
}

// ── Parse Overpass response into store list ───────────────────────────────────
function parseOverpassStores(data, category, userLat, userLng) {
  if (!data?.elements) return [];
  const seen   = new Set();
  const stores = [];

  for (const el of data.elements) {
    const elLat = el.lat  ?? el.center?.lat;
    const elLng = el.lon  ?? el.center?.lon;
    if (!elLat || !elLng) continue;

    const name    = el.tags?.name || el.tags?.['name:en'] || 'Unnamed Store';
    const bucket  = `${name}|${Math.round(elLat * 100)}|${Math.round(elLng * 100)}`;
    if (seen.has(bucket)) continue;
    seen.add(bucket);

    stores.push({
      id:           String(el.id),
      name,
      lat:          elLat,
      lng:          elLng,
      category,
      distance_m:   haversine(userLat, userLng, elLat, elLng),
      osm_type:     el.tags?.shop || el.tags?.amenity || el.tags?.healthcare || category,
      opening_hours: el.tags?.opening_hours || null,
    });
  }

  return stores.sort((a, b) => a.distance_m - b.distance_m);
}

// ── OSRM TSP /trip endpoint ───────────────────────────────────────────────────
async function optimizeRoute(userLat, userLng, stops) {
  if (!stops.length) return null;
  try {
    // Prepend user position as the starting point
    const coords = [[userLng, userLat], ...stops.map(s => [s.lng, s.lat])];
    const coordStr = coords.map(c => c.join(',')).join(';');
    const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}`
              + `?source=first&roundtrip=false&geometries=geojson&overview=full`;

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10000);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.trips?.length) return null;

    const trip = data.trips[0];
    const leafletCoords = trip.geometry.coordinates.map(c => [c[1], c[0]]);

    // Map OSRM waypoint order back to stop names
    const orderedStops = (data.waypoints || [])
      .filter(wp => wp.waypoint_index > 0)          // skip user start point
      .sort((a, b) => a.trip_index - b.trip_index)
      .map(wp => stops[wp.waypoint_index - 1])      // -1 to offset the prepended user position
      .filter(Boolean);

    return {
      ordered_stops:    orderedStops,
      geometry:         leafletCoords,
      total_distance_m: Math.round(trip.distance),
      total_duration_s: Math.round(trip.duration),
      total_time_min:   Math.round(trip.duration / 60),
    };
  } catch {
    // OSRM failed: return stops in distance order as a graceful fallback
    return {
      ordered_stops:    stops,
      geometry:         null,
      total_distance_m: stops.reduce((s, st) => s + st.distance_m, 0),
      total_duration_s: null,
      total_time_min:   null,
    };
  }
}

// ── GET /api/smart-bundle ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { lat, lng, radius = 2000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);
  const radiusM = Math.min(parseInt(radius, 10) || 2000, 5000); // cap at 5km

  const pool = req.app.locals.pool;

  try {
    // 1. Load pending tasks (already sorted by urgency_score DESC in server)
    const { rows: tasks } = await pool.query(
      `SELECT id, raw_text, category, priority, urgency_score, urgency_reason
       FROM smart_tasks
       WHERE status = 'pending' AND user_id = $1
       ORDER BY COALESCE(urgency_score, 0.5) DESC,
                CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                created_at DESC`,
      [req.auth.userId]
    );

    if (!tasks.length) {
      return res.json({ bundles: [], route: null, message: 'No pending tasks' });
    }

    // 2. Group tasks by category
    const byCategory = {};
    for (const t of tasks) {
      const cat = t.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(t);
    }

    // 3. Fetch nearby stores per category from live Overpass API (parallel)
    const categoryEntries = Object.entries(byCategory);
    const storeResults = await Promise.all(
      categoryEntries.map(async ([cat]) => {
        const query = buildOverpassQuery(userLat, userLng, radiusM, cat);
        const data  = await fetchOverpass(query);
        const stores = data ? parseOverpassStores(data, cat, userLat, userLng) : [];
        return { category: cat, stores: stores.slice(0, 5) }; // top 5 per category
      })
    );

    // 4. Build bundle: best store per category + tasks it serves
    const bundles = storeResults.map(({ category, stores }) => {
      const catTasks   = byCategory[category] || [];
      const bestStore  = stores[0] || null;
      const avgUrgency = catTasks.length
        ? catTasks.reduce((s, t) => s + (t.urgency_score ?? 0.5), 0) / catTasks.length
        : 0.5;

      return {
        category,
        best_store:      bestStore,
        all_stores:      stores,
        tasks:           catTasks.map(t => ({
          id:             t.id,
          text:           t.raw_text,
          priority:       t.priority,
          urgency_score:  parseFloat(t.urgency_score ?? 0.5).toFixed(2),
          urgency_reason: t.urgency_reason || null,
        })),
        task_count:      catTasks.length,
        avg_urgency:     parseFloat(avgUrgency.toFixed(2)),
        store_found:     !!bestStore,
      };
    });

    // Sort bundles: store-found first, then by avg urgency desc
    bundles.sort((a, b) => {
      if (a.store_found !== b.store_found) return b.store_found - a.store_found;
      return b.avg_urgency - a.avg_urgency;
    });

    // 5. Compute optimised route across best stops that have a store
    const stopsWithStore = bundles
      .filter(b => b.best_store)
      .map(b => ({
        name:       b.best_store.name,
        lat:        b.best_store.lat,
        lng:        b.best_store.lng,
        category:   b.category,
        distance_m: b.best_store.distance_m,
      }));

    const route = stopsWithStore.length >= 2
      ? await optimizeRoute(userLat, userLng, stopsWithStore)
      : stopsWithStore.length === 1
        ? { ordered_stops: stopsWithStore, geometry: null,
            total_distance_m: stopsWithStore[0].distance_m,
            total_time_min: Math.round(stopsWithStore[0].distance_m / 80) } // ~5km/h walk
        : null;

    // 6. Urgency summary for UI banner
    const highUrgencyTasks = tasks.filter(t => (t.urgency_score ?? 0.5) >= 0.75);

    return res.json({
      bundles,
      route,
      summary: {
        total_tasks:        tasks.length,
        categories_covered: bundles.filter(b => b.store_found).length,
        total_categories:   bundles.length,
        high_urgency_count: highUrgencyTasks.length,
        estimated_time_min: route?.total_time_min ?? null,
      },
    });

  } catch (err) {
    console.error('❌ Smart bundle error:', err);
    return res.status(500).json({ error: 'Smart bundle failed', detail: err.message });
  }
});

module.exports = router;
