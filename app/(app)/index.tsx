import { router } from "expo-router";
import { fetchStations, type Station } from "@/services/stationApi";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/auth";
import { TabletTopBar } from "@/components/TabletTopBar";

// ── Design tokens ──────────────────────────────────────────────────────────────
const D = {
  bg:     "#0a0807",
  surf:   "#181310",
  surf2:  "#1e1812",
  line:   "rgba(250,245,238,0.08)",
  text:   "#faf5ee",
  dim:    "rgba(250,245,238,0.72)",
  faint:  "rgba(250,245,238,0.52)",
  vfaint: "rgba(250,245,238,0.30)",
  zippy:  "#ff3d14",
  green:  "#34d39a",
  amber:  "#f2b338",
  blue:   "#60a5fa",
};

// ── Static data ────────────────────────────────────────────────────────────────
const STATION_COLORS = [D.amber, D.zippy, D.green, D.blue, "#c96442", "#8b4e8b"];
// ── Hooks ──────────────────────────────────────────────────────────────────────
function useLiveBlink(duration = 1800) {
  const anim = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,    duration: duration / 2, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 0.55, duration: duration / 2, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return anim;
}


// ── Card 1: Stations ───────────────────────────────────────────────────────────
function StationTile({ station, color, onPress, tileSize }: { station: Station; color: string; onPress: () => void; tileSize?: { width: number; height: number } }) {
  const blink = useLiveBlink(1400);
  const code  = station.name.slice(0, 3).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      style={[st.tile, { backgroundColor: `${color}08`, borderColor: `${color}22` }, tileSize]}
    >
      <View style={st.tileTop}>
        <Text style={[st.tileId, { color }]}>{code}</Text>
        <Animated.View style={[st.statusDot, { backgroundColor: color, opacity: blink }]} />
      </View>
      <Text style={[st.tileName, { color: D.text }]}>{station.name}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={[st.tileCount, { color }]}>{station.preparationSteps.length}</Text>
        <Text style={st.tileCountLabel}>ETAPAS</Text>
      </View>
    </Pressable>
  );
}

const TILE_GAP = 9;

function StationsCard({ stations }: { stations: Station[] }) {
  if (stations.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.vfaint, letterSpacing: 1 }}>
          SEM ESTAÇÕES
        </Text>
      </View>
    );
  }

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const rows: Station[][] = [];
  for (let i = 0; i < stations.length; i += 2) rows.push(stations.slice(i, i + 2));
  const rowCount = rows.length;
  const tileW = dims.w > 0 ? (dims.w - TILE_GAP) / 2 : 0;
  const tileH = dims.h > 0 ? (dims.h - TILE_GAP * (rowCount - 1)) / rowCount : 0;
  const tileSize = tileW > 0 && tileH > 0 ? { width: tileW, height: tileH } : undefined;

  return (
    <View
      style={{ flex: 1, gap: TILE_GAP }}
      onLayout={e => setDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: TILE_GAP }}>
          {row.map((station, si) => (
            <StationTile
              key={station.id}
              station={station}
              color={STATION_COLORS[(ri * 2 + si) % STATION_COLORS.length]}
              onPress={() => router.push({ pathname: "/station", params: { stationId: station.id } })}
              tileSize={tileSize}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Card 2: Dispatch nav cards ─────────────────────────────────────────────────
function DispatchNavCard({ accent, title, onPress }: { accent: string; title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [dnc.btn, { borderColor: `${accent}28`, opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={[dnc.label, { color: accent }]}>{title}</Text>
    </Pressable>
  );
}



// ── Root ───────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { signOut, token, owner, businesses, selectedBusinessId, branches, selectedBranchId } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchStations(token).then(setStations).catch(console.error);
  }, [token]);

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <TabletTopBar
        mode="home"
        businesses={businesses}
        selectedBusinessId={selectedBusinessId}
        branches={branches}
        selectedBranchId={selectedBranchId}
        onBusinessPillPress={() => router.push("/(app)/org-select")}
        userInitial={(owner?.name ?? "G").charAt(0).toUpperCase()}
        onAvatarPress={() => void signOut()}
      />
      <View style={s.grid}>
        <View style={{ flex: 1 }}>
          <StationsCard stations={stations} />
        </View>
        <View style={{ flex: 1, flexDirection: "column", gap: 12 }}>
          <DispatchNavCard accent={D.zippy} title="Despacho" onPress={() => router.push("/dispatch")} />
          <DispatchNavCard accent={D.green} title="Mapa ao Vivo" onPress={() => router.push("/(app)/map")} />
        </View>
        <View style={{ flex: 1, flexDirection: "column", gap: 12 }}>
          <DispatchNavCard accent={D.green} title="Métricas" onPress={() => router.push("/(app)/metrics")} />
          <DispatchNavCard accent={D.blue} title="Análise de Rotas" onPress={() => router.push("/(app)/route-analysis")} />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  grid:      { flex: 1, flexDirection: "row", gap: 12, padding: 16 },
});



const st = StyleSheet.create({
  tile:           { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  tileTop:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  tileId:         { fontFamily: "GeistMono_700Bold",    fontSize: 9,  letterSpacing: 1.5 },
  statusDot:      { width: 6, height: 6, borderRadius: 3 },
  tileName:       { fontFamily: "Geist_700Bold",        fontSize: 14, letterSpacing: -0.3, marginBottom: 2 },
  tileCount:      { fontFamily: "GeistMono_700Bold",    fontSize: 34, letterSpacing: -1.5, lineHeight: 34 },
  tileCountLabel: { fontFamily: "GeistMono_400Regular", fontSize: 9,  color: D.vfaint, letterSpacing: 0.6, paddingBottom: 4 },
  queueLabel:     { fontFamily: "GeistMono_400Regular", fontSize: 8.5, opacity: 0.50, letterSpacing: 0.8, marginTop: 4 },
});



const dnc = StyleSheet.create({
  btn:   { flex: 1, backgroundColor: D.surf, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Geist_700Bold", fontSize: 20, letterSpacing: -0.5 },
});

