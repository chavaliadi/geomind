/**
 * server/routes/route.js — Phase 1B: Route Optimizer
 *
 * POST /api/optimize-route
 * Body: { waypoints: [{lat, lng, name, category?}], userLat, userLng }
 *
 * Calls OSRM /trip (TSP solver) to find the shortest path through all stops.
 * Returns: ordered waypoints + GeoJSON geometry for Leaflet + per-leg ETAs.
 */

const express = require('express');
const router  = express.Router();

const OSRM_TRIP_BASE = 'https://router.project-osrm.org/trip/v1/driving';

/**
 * POST /api/optimize-route
 */
router.post('/', async (req, res) => {
  const { waypoints, userLat, userLng } = req.body;

  if (!Array.isArray(waypoints) || waypoints.length < 1) {
    return res.status(400).json({ error: 'waypoints array required (min 1 stop)' });
  }
  if (!userLat || !userLng) {
    return res.status(400).json({ error: 'userLat and userLng required' });
  }

  // Build coordinate string: user position first, then all stops
  const allPoints = [
    { lat: parseFloat(userLat), lng: parseFloat(userLng), name: 'Your Location', isUser: true },
    ...waypoints.map(w => ({ lat: parseFloat(w.lat), lng: parseFloat(w.lng), name: w.name, category: w.category })),
  ];

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_TRIP_BASE}/${coordStr}`
            + `?source=first&roundtrip=false&geometries=geojson&overview=full&steps=true`;

  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 12000);
    const osrmRes = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);

    if (!osrmRes.ok) {
      throw new Error(`OSRM returned ${osrmRes.status}`);
    }

    const data = await osrmRes.json();

    if (data.code !== 'Ok' || !data.trips?.length) {
      // Graceful fallback: return stops sorted by straight-line distance
      const fallback = waypoints
        .map(w => ({
          ...w,
          distance_m:   haversine(userLat, userLng, w.lat, w.lng),
          duration_s:   null,
          time_min:     null,
        }))
        .sort((a, b) => a.distance_m - b.distance_m);

      return res.json({
        ordered_stops:    fallback,
        geometry:         null,
        total_distance_m: fallback.reduce((s, w) => s + w.distance_m, 0),
        total_time_min:   null,
        legs:             [],
        osrm_used:        false,
      });
    }

    const trip = data.trips[0];

    // Map OSRM waypoint order → original stop metadata
    const orderedStops = (data.waypoints || [])
      .filter(wp => wp.waypoint_index > 0)              // skip user start (index 0)
      .sort((a, b) => a.trip_index - b.trip_index)
      .map(wp => {
        const original = waypoints[wp.waypoint_index - 1]; // -1 to offset user position
        return original
          ? { ...original, lat: parseFloat(original.lat), lng: parseFloat(original.lng) }
          : null;
      })
      .filter(Boolean);

    // Build per-leg info from OSRM legs
    const legs = (trip.legs || []).map((leg, i) => ({
      from:        i === 0 ? 'Your Location' : (orderedStops[i - 1]?.name ?? `Stop ${i}`),
      to:          orderedStops[i]?.name ?? `Stop ${i + 1}`,
      distance_m:  Math.round(leg.distance),
      duration_s:  Math.round(leg.duration),
      time_min:    Math.round(leg.duration / 60),
    }));

    // GeoJSON → Leaflet [lat, lng] pairs
    const geometry = trip.geometry?.coordinates?.map(c => [c[1], c[0]]) ?? null;

    return res.json({
      ordered_stops:    orderedStops,
      geometry,
      total_distance_m: Math.round(trip.distance),
      total_time_min:   Math.round(trip.duration / 60),
      legs,
      osrm_used:        true,
    });

  } catch (err) {
    console.error('❌ Route optimizer error:', err.message);
    return res.status(500).json({ error: 'Route optimization failed', detail: err.message });
  }
});

// Haversine fallback (metres)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

module.exports = router;
