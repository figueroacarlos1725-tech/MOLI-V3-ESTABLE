import * as Location from 'expo-location';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  address?: string;
}

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
}

export async function getCurrentLocation(): Promise<LocationCoords | null> {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      // Return Catamarca as default
      return {
        latitude: -28.4696,
        longitude: -65.7852,
      };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    // Fallback to Catamarca
    return {
      latitude: -28.4696,
      longitude: -65.7852,
    };
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  // Use Nominatim (OSM) for reverse geocoding - free, no API key
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es&zoom=18`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MoliApp/1.0' }
    });
    const data = await response.json();
    if (data.address) {
      const a = data.address;
      const street = a.road || a.pedestrian || a.footway || '';
      const number = a.house_number || '';
      const city = a.city || a.town || a.village || a.municipality || '';
      const parts = [street, number, city].filter(Boolean);
      return parts.join(', ') || data.display_name?.split(',').slice(0, 2).join(',') || 'Ubicación desconocida';
    }
    if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(',').trim();
    }
    return 'Ubicación desconocida';
  } catch (e) {
    console.log('Nominatim geocoding failed, trying Expo fallback');
  }

  // Fallback to Expo geocoding
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const address = results[0];
      const parts = [
        address.streetNumber,
        address.street,
        address.city,
        address.region
      ].filter(Boolean);
      return parts.join(', ') || 'Ubicación desconocida';
    }
    return 'Ubicación desconocida';
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return 'Ubicación desconocida';
  }
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

// Estimate driving distance and time (haversine × 1.4 correction factor)
export function estimateDriving(
  pickup: { latitude: number; longitude: number },
  dropoff: { latitude: number; longitude: number }
): { distance_km: number; duration_min: number } {
  const straightLine = calculateDistance(
    pickup.latitude, pickup.longitude,
    dropoff.latitude, dropoff.longitude
  );
  const drivingDistance = straightLine * 1.4; // Road correction factor
  const avgSpeedKmh = drivingDistance > 15 ? 50 : 30; // Highway vs city
  const durationMin = Math.ceil((drivingDistance / avgSpeedKmh) * 60);
  return { distance_km: Math.round(drivingDistance * 10) / 10, duration_min: durationMin };
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(
  query: string,
  proximity?: { latitude: number; longitude: number }
): Promise<PlaceResult[]> {
  if (!query.trim() || query.length < 2) return [];

  try {
    // First search within Catamarca region using Nominatim (OSM)
    const catamarcaViewbox = '&viewbox=-68.5,-25.5,-64.5,-30.0&bounded=1';
    const urlLocal = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ar&limit=5&accept-language=es${catamarcaViewbox}`;

    const respLocal = await fetch(urlLocal, {
      headers: { 'User-Agent': 'MoliApp/1.0' }
    });
    const dataLocal = await respLocal.json();
    const localResults: PlaceResult[] = (dataLocal || []).map((f: any) => ({
      id: String(f.place_id),
      name: f.display_name.split(',')[0],
      address: f.display_name,
      latitude: parseFloat(f.lat),
      longitude: parseFloat(f.lon),
    }));

    // If less than 3 local results, search broader Argentina
    let broadResults: PlaceResult[] = [];
    if (localResults.length < 3) {
      const urlBroad = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ar&limit=4&accept-language=es`;
      const respBroad = await fetch(urlBroad, {
        headers: { 'User-Agent': 'MoliApp/1.0' }
      });
      const dataBroad = await respBroad.json();
      const existingIds = new Set(localResults.map(r => r.id));
      broadResults = (dataBroad || [])
        .filter((f: any) => !existingIds.has(String(f.place_id)))
        .map((f: any) => ({
          id: String(f.place_id),
          name: f.display_name.split(',')[0],
          address: f.display_name,
          latitude: parseFloat(f.lat),
          longitude: parseFloat(f.lon),
        }));
    }

    return [...localResults, ...broadResults].slice(0, 6);
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}
