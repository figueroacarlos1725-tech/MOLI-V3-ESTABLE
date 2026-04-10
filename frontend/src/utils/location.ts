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
  // Try Mapbox geocoding first (works on all platforms)
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}&language=es&limit=1`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        // Use shorter text if available, otherwise clean up the full place_name
        const feature = data.features[0];
        if (feature.text && feature.context) {
          const city = feature.context?.find((c: any) => c.id?.startsWith('place'))?.text;
          return city ? `${feature.text}, ${city}` : feature.text;
        }
        // Shorten the full address: take first 2 parts
        const parts = (feature.place_name || '').split(',').map((s: string) => s.trim());
        if (parts.length > 2) {
          return `${parts[0]}, ${parts[1]}`;
        }
        return feature.place_name || 'Ubicación desconocida';
      }
    } catch (e) {
      console.log('Mapbox geocoding failed, trying Expo fallback');
    }
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
