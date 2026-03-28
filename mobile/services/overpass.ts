export interface NearbyPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  distance: number;
  opening?: string;
}

const CATEGORY_TAGS: Record<string, string> = {
  grocery:  'shop~"supermarket|convenience|grocery|department_store"',
  pharmacy: 'amenity~"pharmacy|hospital|clinic"',
  clothing: 'shop~"clothes|fashion|boutique|department_store"',
  general:  'shop~"supermarket|convenience|department_store"',
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export async function fetchNearbyPlaces(
  lat: number, lng: number, category: string, radius: number = 2000
): Promise<NearbyPlace[]> {
  const tag = CATEGORY_TAGS[category] || CATEGORY_TAGS.general;
  const query = `[out:json][timeout:20];(node[${tag}](around:${radius},${lat},${lng});way[${tag}](around:${radius},${lat},${lng}););out center 10;`;

  let lastError: Error | null = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
      const data = await res.json();
      const places: NearbyPlace[] = data.elements
        .map((el: any) => {
          const elLat = el.lat ?? el.center?.lat;
          const elLng = el.lon ?? el.center?.lon;
          if (!elLat || !elLng) return null;
          const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.shop || el.tags?.amenity || 'Unnamed Store';
          return {
            id: String(el.id),
            name,
            lat: elLat,
            lng: elLng,
            type: el.tags?.shop || el.tags?.amenity || category,
            distance: haversine(lat, lng, elLat, elLng),
            opening: el.tags?.['opening_hours'],
          };
        })
        .filter(Boolean)
        .sort((a: NearbyPlace, b: NearbyPlace) => a.distance - b.distance)
        .slice(0, 5);
      return places;
    } catch (err: any) {
      if (err.name !== 'AbortError') lastError = err;
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}
