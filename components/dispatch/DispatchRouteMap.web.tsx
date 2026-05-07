import { useMemo, type CSSProperties } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

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

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #map {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: #f9f9f9;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script
      src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""
    ></script>
    <script>
      const points = ${safePoints};
      const coordinates = ${safeCoordinates};
      const region = ${safeRegion};

      const map = L.map("map", {
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const pathCoords =
        Array.isArray(coordinates) && coordinates.length > 1
          ? coordinates.map((coord) => [coord.latitude, coord.longitude])
          : (Array.isArray(points) ? points : []).map((point) => [point.lat, point.lng]);

      if (pathCoords.length > 1) {
        L.polyline(pathCoords, { color: "#1685fa", weight: 4, opacity: 0.9 }).addTo(map);
      }

      (Array.isArray(points) ? points : []).forEach((point, index) => {
        const color = index === 0 ? "#1685fa" : "#e74c3c";
        L.circleMarker([point.lat, point.lng], {
          radius: 7,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup(point.label || "Ponto");
      });

      const bounds = [];
      (Array.isArray(points) ? points : []).forEach((point) => {
        bounds.push([point.lat, point.lng]);
      });
      pathCoords.forEach((coord) => {
        bounds.push(coord);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.setView([region.latitude, region.longitude], 12);
      }
    </script>
  </body>
</html>`;
  }, [coordinates, points, region]);

  const iframeStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    border: "0",
    display: "block",
  };

  return (
    <View style={[style, styles.mapContainer]}>
      <iframe
        title="Dispatch route map"
        srcDoc={html}
        loading="lazy"
        style={iframeStyle}
        referrerPolicy="no-referrer"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    overflow: "hidden",
    backgroundColor: "#f7f7f7",
  },
});
