import MapView, { Marker, Polyline } from "react-native-maps";
import type { StyleProp, ViewStyle } from "react-native";

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
  return (
    <MapView style={style} initialRegion={region}>
      {points.map((point, index) => (
        <Marker
          key={`${point.lat}-${point.lng}-${index}`}
          coordinate={{ latitude: point.lat, longitude: point.lng }}
          title={point.label}
          pinColor={index === 0 ? "#1685fa" : "#e74c3c"}
        />
      ))}
      <Polyline coordinates={coordinates} strokeColor="#1685fa" strokeWidth={4} />
    </MapView>
  );
}
