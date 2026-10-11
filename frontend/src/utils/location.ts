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

/** Actual permission-backed GPS only. Never report the display/map fallback to tracking. */
export async function getRealCurrentLocation(): Promise<LocationCoords | null> {
  try {
    if (!(await requestLocationPermission())) return null;
    const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = result.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return null;
    return { latitude, longitude };
  } catch { return null; }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  // Use backend multi-provider reverse geocode
  try {
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const url = `${backendUrl}/api/places/reverse?lat=${latitude}&lng=${longitude}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.address && data.address !== 'Ubicación desconocida') {
      return data.address;
    }
  } catch (e) {
    console.log('Backend reverse geocode failed, trying fallback');
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
    const lat = proximity?.latitude || -28.4696;
    const lng = proximity?.longitude || -65.7852;
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const url = `${backendUrl}/api/places/search?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}`;
    
    const response = await fetch(url);
    const data = await response.json();
    return (data.results || []).map((r: any) => ({
      id: r.id || String(Math.random()),
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}
