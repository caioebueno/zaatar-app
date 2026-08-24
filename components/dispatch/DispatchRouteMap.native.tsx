import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

type TRoutePoint = {
  lat: number;
  lng: number;
  label: string;
};

type TRouteCoordinate = {
  latitude: number;
  longitude: number;
};

type TRouteRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type DispatchRouteMapProps = {
  style?: StyleProp<ViewStyle>;
  region: TRouteRegion;
  points: TRoutePoint[];
  coordinates: TRouteCoordinate[];
};

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

export default function DispatchRouteMap({
  style,
  region,
  points,
  coordinates,
}: DispatchRouteMapProps) {
  const html = useMemo(() => {
    const safePoints = JSON.stringify(points).replace(/</g, "\\u003c");
    const safeCoordinates = JSON.stringify(coordinates).replace(/</g, "\\u003c");
    const safeRegion = JSON.stringify(region).replace(/</g, "\\u003c");
    const safeToken = MAPBOX_TOKEN.replace(/['"\\]/g, "");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
      .stop-marker {
        width: 26px; height: 26px; border-radius: 50%;
        background: #FF3D14; color: #FAF5EE;
        font-family: -apple-system, sans-serif; font-size: 12px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid rgba(250,245,238,0.9); box-shadow: 0 2px 6px rgba(0,0,0,0.7);
        cursor: pointer;
      }
      .stop-marker.origin {
        width: 14px; height: 14px;
        background: #FAF5EE; border-color: rgba(250,245,238,0.5);
        box-shadow: 0 0 0 3px rgba(250,245,238,0.2), 0 2px 6px rgba(0,0,0,0.7);
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js"></script>
    <script>
      mapboxgl.accessToken = '${safeToken}';
      var points = ${safePoints};
      var coordinates = ${safeCoordinates};
      var region = ${safeRegion};

      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [region.longitude, region.latitude],
        zoom: 12,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

      map.on('load', function() {
        var lineCoords = (Array.isArray(coordinates) && coordinates.length > 1)
          ? coordinates.map(function(c) { return [c.longitude, c.latitude]; })
          : (Array.isArray(points) ? points : []).map(function(p) { return [p.lng, p.lat]; });

        if (lineCoords.length > 1) {
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: lineCoords },
            },
          });
          map.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#16120F', 'line-width': 7, 'line-opacity': 0.6 },
          });
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FF3D14', 'line-width': 4, 'line-opacity': 0.95 },
          });
        }

        (Array.isArray(points) ? points : []).forEach(function(point, index) {
          var el = document.createElement('div');
          el.className = 'stop-marker' + (index === 0 ? ' origin' : '');
          el.textContent = index === 0 ? '' : String(index);
          var popup = new mapboxgl.Popup({ offset: 16, closeButton: false })
            .setHTML('<div style="font-family:-apple-system,sans-serif;font-size:13px;color:#16120F;padding:2px 4px">' + (point.label || 'Ponto') + '</div>');
          new mapboxgl.Marker({ element: el })
            .setLngLat([point.lng, point.lat])
            .setPopup(popup)
            .addTo(map);
        });

        var allLngs = [];
        var allLats = [];
        (Array.isArray(points) ? points : []).forEach(function(p) { allLngs.push(p.lng); allLats.push(p.lat); });
        lineCoords.forEach(function(c) { allLngs.push(c[0]); allLats.push(c[1]); });

        if (allLngs.length > 1) {
          map.fitBounds(
            [[Math.min.apply(null, allLngs), Math.min.apply(null, allLats)], [Math.max.apply(null, allLngs), Math.max.apply(null, allLats)]],
            { padding: 52, maxZoom: 15, duration: 0 }
          );
        } else if (allLngs.length === 1) {
          map.setCenter([allLngs[0], allLats[0]]);
          map.setZoom(14);
        }
      });
    </script>
  </body>
</html>`;
  }, [coordinates, points, region]);

  return (
    <WebView
      style={style}
      source={{ html, baseUrl: "https://localhost/" }}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      startInLoadingState
    />
  );
}
