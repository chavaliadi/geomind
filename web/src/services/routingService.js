/**
 * routingService.js
 * 
 * Fetches driving/walking routes between a set of waypoints using the free Open Source Routing Machine (OSRM) API.
 */

// We request geometries=geojson to easily parse the line coordinates without needing a polyline decoder
const OSRM_API = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Fetch a driving route connecting a series of coordinates.
 * @param {Array<{lat, lng}>} waypoints - Array of coordinates [UserPos, Stop1, Stop2...]
 * @returns {Promise<{
 *   coordinates: Array<[number, number]>, 
 *   distanceTotal: number, 
 *   durationTotal: number
 * }>}
 */
export async function fetchTripRoute(waypoints) {
    if (!waypoints || waypoints.length < 2) return null;

    // OSRM expects coordinates as lon,lat;lon,lat...
    const coordsString = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `${OSRM_API}/${coordsString}?geometries=geojson&overview=full`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM API request failed');
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            console.warn('OSRM returned no routes:', data);
            return null;
        }

        const route = data.routes[0];
        
        // OSRM GeoJSON returns coordinates as [lon, lat], but Leaflet <Polyline> expects [lat, lon]
        const leafletCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

        return {
            coordinates: leafletCoords,
            distanceTotal: route.distance, // in meters
            durationTotal: route.duration  // in seconds
        };
    } catch (err) {
        console.error('Routing error:', err.message);
        return null; // degrade gracefully
    }
}
