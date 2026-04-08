import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

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
  points,
}: DispatchRouteMapProps) {
  return (
    <View style={[style, styles.fallbackContainer]}>
      <Text style={styles.title}>Mapa interativo indisponivel no web.</Text>
      <Text style={styles.subtitle}>
        Pontos da rota: {points.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "#f7f7f7",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2d2d2d",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#666666",
    textAlign: "center",
  },
});
