export interface RouteResult {
  distanceTotal: number; // metres
  durationTotal: number; // seconds
  coordinates: { latitude: number; longitude: number }[];
}

function decodePoly(encoded: string): { latitude: number; longitude: number }[] {
  let index = 0, lat = 0, lng = 0;
  const coords: { latitude: number; longitude: number }[] = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes?.length) return null;
    const route = data.routes[0];
    return {
      distanceTotal: Math.round(route.distance),
      durationTotal: Math.round(route.duration),
      coordinates: decodePoly(route.geometry),
    };
  } catch { return null; }
}

export function formatDist(metres: number): string {
  return metres < 1000 ? `${metres}m` : `${(metres / 1000).toFixed(1)}km`;
}

export function formatTime(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}m`;
}
