/**
 * overpassService.js — Phase 8B+
 * Fetches real nearby places using the Overpass API (free OpenStreetMap data, no API key).
 * Called only on explicit user action (Run Scan / Scan Nearby) — not on render.
 */

/* ── Category → OSM tags ──────────────────────────── */
const OSM_TAGS = {
    grocery: [
        'shop=supermarket',
        'shop=convenience',
        'shop=greengrocer',
        'shop=grocery',
        'shop=food',
        'shop=retail',
        'amenity=marketplace',
        'shop=general',
        'shop=kiosk',
        'shop=bakery',
        'shop=confectionery',
        'shop=department_store'
    ],
    // High-performance catch-all for unidentified retail
    retail: [
        'building=retail',
        'shop=retail'
    ],
    pharmacy: [
        'amenity=pharmacy',
        'shop=chemist',
        'shop=medical_supply',
        'healthcare=pharmacy',
    ],
    clothing: [
        'shop=clothes',
        'shop=boutique',
        'shop=fashion',
        'shop=shoes',
        'shop=department_store',
    ],
    general: [
        'shop=mall',
        'shop=department_store',
        'shop=general',
        'amenity=shopping_centre',
    ],
};

/* ── Haversine distance (metres) ──────────────────── */
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in metres
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Build Overpass QL query ──────────────────────── */
function buildQuery(lat, lng, radiusMeters, category) {
    const tags = OSM_TAGS[category] || OSM_TAGS.general;
    const nodeQueries = tags
        .map(tag => {
            const [k, v] = tag.split('=');
            return `nw["${k}"="${v}"](around:${radiusMeters},${lat},${lng});`;
        })
        .join('\n');
    return `[out:json][timeout:25];\n(\n${nodeQueries}\n);\nout center;`;
}

/* ── Main fetch function ──────────────────────────── */
/**
 * @param {number} lat
 * @param {number} lng
 * @param {string} category  — 'grocery' | 'pharmacy' | 'clothing' | 'general'
 * @param {number} radiusMeters — default 2000
 * @returns {Promise<Array<{id, name, lat, lng, type, distance, rating}>>}
 */
export async function fetchNearbyPlaces(lat, lng, category, radiusMeters = 2000) {
    const query = buildQuery(lat, lng, radiusMeters, category);
    const url = 'https://lz4.overpass-api.de/api/interpreter';

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);

    const data = await res.json();

    // Deduplicate by name + approximate coord bucket
    const seen = new Set();
    const places = [];

    for (const el of data.elements || []) {
        // Nodes have lat/lon directly; ways/relations have center.lat/center.lon
        const elLat = el.lat || el.center?.lat;
        const elLon = el.lon || el.center?.lon;

        if (!elLat || !elLon) continue;

        const name = el.tags?.name || el.tags?.['name:en'] || null;
        const displayName = name || 'Unnamed Store';
        const bucketKey = `${displayName}|${Math.round(elLat * 100)}|${Math.round(elLon * 100)}`;
        if (seen.has(bucketKey)) continue;
        seen.add(bucketKey);

        const dist = haversine(lat, lng, elLat, elLon);

        places.push({
            id:       el.id,
            name:     displayName,
            lat:      elLat,
            lng:      elLon,
            type:     el.tags?.shop || el.tags?.amenity || el.tags?.healthcare || category,
            distance: Math.round(dist),
            phone:    el.tags?.phone || null,
            opening:  el.tags?.opening_hours || null,
        });
    }

    // Sort by distance ascending
    return places.sort((a, b) => a.distance - b.distance);
}

/* ── Smart Trip Grouping ──────────────────────────── */
/**
 * Given a list of pending tasks and user location, fetch one best store per category
 * and return a trip plan: an ordered list of stops with consolidated tasks.
 *
 * Result shape: [ { stop, store, category, distance, tasks:[] } ]
 */
export async function buildTripPlan(tasks, lat, lng, defaultRadius = 2000, fetchDbPlaces = null) {
    // Group tasks by category
    const byCategory = {};
    for (const task of tasks) {
        const cat = task.category || 'general';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(task);
    }

    const stops = [];
    let stopNum = 1;

    for (const [category, categoryTasks] of Object.entries(byCategory)) {
        // Use the smallest radius among tasks in this category (most restrictive)
        const radius = Math.min(
            ...categoryTasks.map(t => t.radius_meters || defaultRadius),
            defaultRadius
        );

        let places = [];
        try {
            places = await fetchNearbyPlaces(lat, lng, category, radius);
        } catch (err) {
            console.warn(`Overpass failed for ${category}:`, err.message);
        }

        if (fetchDbPlaces) {
            try {
                const dbPlaces = await fetchDbPlaces(category, radius);
                if (dbPlaces && dbPlaces.length > 0) {
                    const mappedDb = dbPlaces.map(db => ({
                        id: 'db-' + Math.random().toString(36).substr(2, 9),
                        name: db.name + ' ✨',
                        lat: db.lat,
                        lng: db.lng,
                        type: 'Added Custom Place',
                        distance: db.distance,
                    }));
                    places = [...mappedDb, ...places].sort((a, b) => a.distance - b.distance);
                }
            } catch (err) {
                console.warn(`DB places failed for ${category}:`, err.message);
            }
        }

        const bestStore = places[0] || null; // nearest store

        stops.push({
            stop:     stopNum++,
            category,
            store:    bestStore,
            allPlaces: places.slice(0, 5), // top 5 nearby for display
            tasks:    categoryTasks,
            distance: bestStore?.distance ?? null,
        });
    }

    // Order stops by distance (nearest first), unknowns last
    stops.sort((a, b) => {
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
    });

    // Re-number after sort
    stops.forEach((s, i) => { s.stop = i + 1; });

    return stops;
}
