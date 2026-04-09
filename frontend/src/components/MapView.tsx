import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';

interface MarkerProps {
  latitude: number;
  longitude: number;
  title?: string;
  type?: 'pickup' | 'dropoff' | 'driver' | 'user';
}

interface MapViewProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  markers?: MarkerProps[];
  showRoute?: boolean;
  onMapPress?: (coords: { latitude: number; longitude: number }) => void;
  onMarkerDrag?: (markerId: string, coords: { latitude: number; longitude: number }) => void;
  style?: any;
}

export function MapView({
  initialRegion,
  markers = [],
  showRoute = false,
  onMapPress,
  onMarkerDrag,
  style
}: MapViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);

  const defaultRegion = {
    latitude: 40.7128,
    longitude: -74.0060,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05
  };

  const region = initialRegion || defaultRegion;

  const getMarkerIcon = (type: string) => {
    switch (type) {
      case 'pickup':
        return '🟢';
      case 'dropoff':
        return '🔴';
      case 'driver':
        return '🚗';
      case 'user':
        return '📍';
      default:
        return '📍';
    }
  };

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { width: 100%; height: 100vh; }
        .custom-marker {
          font-size: 24px;
          text-align: center;
          line-height: 30px;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        const map = L.map('map').setView([${region.latitude}, ${region.longitude}], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const markers = ${JSON.stringify(markers)};
        const markerObjects = [];

        markers.forEach((m, index) => {
          const icon = L.divIcon({
            className: 'custom-marker',
            html: '${markers.map(m => getMarkerIcon(m.type || 'user')).join('')}'.split('')[index] || '📍',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
          });

          const marker = L.marker([m.latitude, m.longitude], { icon, draggable: ${!!onMarkerDrag} })
            .addTo(map);
          
          if (m.title) {
            marker.bindPopup(m.title);
          }

          if (${!!onMarkerDrag}) {
            marker.on('dragend', function(e) {
              const pos = e.target.getLatLng();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'markerDrag',
                markerId: index.toString(),
                latitude: pos.lat,
                longitude: pos.lng
              }));
            });
          }

          markerObjects.push(marker);
        });

        ${showRoute && markers.length >= 2 ? `
          const routeCoords = markers.map(m => [m.latitude, m.longitude]);
          L.polyline(routeCoords, { color: '#007AFF', weight: 4, opacity: 0.8 }).addTo(map);
          map.fitBounds(routeCoords);
        ` : ''}

        map.on('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapPress',
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }));
        });

        // Update markers function
        window.updateMarkers = function(newMarkers) {
          markerObjects.forEach(m => map.removeLayer(m));
          markerObjects.length = 0;
          
          newMarkers.forEach((m, index) => {
            const iconHtml = m.type === 'pickup' ? '🟢' : 
                            m.type === 'dropoff' ? '🔴' : 
                            m.type === 'driver' ? '🚗' : '📍';
            const icon = L.divIcon({
              className: 'custom-marker',
              html: iconHtml,
              iconSize: [30, 30],
              iconAnchor: [15, 30]
            });
            const marker = L.marker([m.latitude, m.longitude], { icon }).addTo(map);
            if (m.title) marker.bindPopup(m.title);
            markerObjects.push(marker);
          });
        };

        window.panTo = function(lat, lng) {
          map.panTo([lat, lng]);
        };
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapPress' && onMapPress) {
        onMapPress({ latitude: data.latitude, longitude: data.longitude });
      } else if (data.type === 'markerDrag' && onMarkerDrag) {
        onMarkerDrag(data.markerId, { latitude: data.latitude, longitude: data.longitude });
      }
    } catch (error) {
      console.error('Error parsing map message:', error);
    }
  };

  useEffect(() => {
    if (webViewRef.current && markers.length > 0) {
      webViewRef.current.injectJavaScript(`
        if (window.updateMarkers) {
          window.updateMarkers(${JSON.stringify(markers)});
        }
        true;
      `);
    }
  }, [markers]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.map}
        onMessage={handleMessage}
        onLoadEnd={() => setIsLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
      />
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
});
