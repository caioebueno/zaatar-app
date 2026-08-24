import { useAuth } from "@/contexts/auth";
import { fetchBusinesses, type Business } from "@/services/orgApi";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// ── Design tokens ──────────────────────────────────────────────────────────────
const D = {
  bg:    "#0a0807",
  surf:  "#181310",
  surf2: "#1e1812",
  line:  "rgba(250,245,238,0.09)",
  lineH: "rgba(250,245,238,0.18)",
  text:  "#faf5ee",
  dim:   "rgba(250,245,238,0.58)",
  faint: "rgba(250,245,238,0.30)",
  mute:  "rgba(250,245,238,0.14)",
  zippy: "#ff3d14",
  green: "#34d39a",
};

const BIZ_HUES = [
  "#E8834A", "#D4924A", "#7A9EC4", "#E86060",
  "#C4A85E", "#7AC4A0", "#A87AC4", "#7AC4C4", "#C4A07A",
];

// ── ZippyMark ──────────────────────────────────────────────────────────────────
function ZippyMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width="100" height="100" rx="22" fill={D.zippy} />
      <Rect x="41" y="51" width="18" height="18" rx="4" fill="white" />
      <Path d="M28 60 A22 22 0 0 1 72 60" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
      <Path d="M18 60 A32 32 0 0 1 82 60" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" opacity="0.25" />
    </Svg>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
function ScreenHeader() {
  return (
    <View style={h.bar}>
      <View style={h.left}>
        <ZippyMark size={28} />
        <Text style={h.wordmark}>Zappy</Text>
        <View style={h.sep} />
        <Text style={h.kicker}>TABLET</Text>
      </View>
      <Text style={h.deviceId}>Gestor</Text>
    </View>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────
function ScreenFooter() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulse, { toValue: 1,    duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ])).start();
  }, []);
  return (
    <View style={ft.bar}>
      <Text style={ft.version}>Zappy OS · v1.0.0</Text>
      <View style={ft.right}>
        <Animated.View style={[ft.dot, { opacity: pulse }]} />
        <Text style={ft.online}>Online</Text>
      </View>
    </View>
  );
}

// ── Business Card ──────────────────────────────────────────────────────────────
function BusinessCard({ biz, hue, onPress }: { biz: Business; hue: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        bc.card,
        {
          backgroundColor: pressed ? D.surf2 : D.surf,
          borderColor:     pressed ? "rgba(255,61,20,0.28)" : D.line,
        },
      ]}
    >
      {/* Top color strip */}
      <View style={[bc.strip, { backgroundColor: hue + "88" }]} />

      {/* Avatar */}
      <View style={[bc.avatar, { backgroundColor: hue + "18", borderColor: hue + "44" }]}>
        <Text style={[bc.avatarText, { color: hue }]}>{biz.name.charAt(0)}</Text>
      </View>

      {/* Name */}
      <Text style={bc.name}>{biz.name}</Text>

      {/* Footer */}
      <View style={bc.footer}>
        <Text style={bc.footerLabel}>ACESSAR</Text>
        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12h14M13 6l6 6-6 6" stroke={D.faint} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </Pressable>
  );
}

// ── Entering Overlay ───────────────────────────────────────────────────────────
function EnteringOverlay({ biz, hue }: { biz: Business; hue: string }) {
  const router = useRouter();
  const { selectBusiness } = useAuth();

  const ring1Scale   = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.55)).current;
  const ring2Scale   = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.55)).current;
  const spinAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeRing = (scale: Animated.Value, opacity: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 2.5, duration: 2300, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 2300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ]));

    makeRing(ring1Scale, ring1Opacity, 0).start();
    makeRing(ring2Scale, ring2Opacity, 800).start();
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 720, useNativeDriver: true, easing: Easing.linear })
    ).start();

    const nav = setTimeout(async () => {
      await selectBusiness(biz.id);
      router.replace("/(app)");
    }, 1800);
    return () => clearTimeout(nav);
  }, []);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={en.overlay}>
      {[{ scale: ring1Scale, opacity: ring1Opacity }, { scale: ring2Scale, opacity: ring2Opacity }].map((r, i) => (
        <Animated.View key={i} style={[en.ring, { transform: [{ scale: r.scale }], opacity: r.opacity }]} />
      ))}

      <View style={[en.circle, { backgroundColor: hue + "18", borderColor: hue + "44" }]}>
        <Text style={[en.circleText, { color: hue }]}>{biz.name.charAt(0)}</Text>
      </View>

      <Text style={en.bizName}>{biz.name}</Text>

      <View style={en.spinnerPill}>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
            <Path d="M12 2a10 10 0 0110 10" stroke={D.zippy} strokeWidth="2.5" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <Text style={en.spinnerText}>ABRINDO SISTEMA…</Text>
      </View>
    </View>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function OrgSelectScreen() {
  const { token } = useAuth();
  const [businesses,   setBusinesses]   = useState<Business[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedBiz,  setSelectedBiz]  = useState<Business | null>(null);
  const [showEntering, setShowEntering] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchBusinesses(token)
      .then(({ items }) => setBusinesses(items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleSelect = (biz: Business) => {
    setSelectedBiz(biz);
    setTimeout(() => setShowEntering(true), 200);
  };

  const selectedHue = selectedBiz
    ? BIZ_HUES[businesses.indexOf(selectedBiz) % BIZ_HUES.length]
    : BIZ_HUES[0];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: D.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.mute, letterSpacing: 2 }}>
          CARREGANDO…
        </Text>
      </View>
    );
  }

  const rows: Business[][] = [];
  for (let i = 0; i < businesses.length; i += 3) rows.push(businesses.slice(i, i + 3));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top", "bottom"]}>
      {/* Warm glow */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={s.glow} />
      </View>

      <View style={{ flex: 1 }}>
        <ScreenHeader />

        <View style={pg.content}>
          <Text style={pg.title}>Qual estabelecimento?</Text>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 18 }}>
              {rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", gap: 18 }}>
                  {row.map((biz, si) => (
                    <View key={biz.id} style={{ flex: 1 }}>
                      <BusinessCard
                        biz={biz}
                        hue={BIZ_HUES[(ri * 3 + si) % BIZ_HUES.length]}
                        onPress={() => handleSelect(biz)}
                      />
                    </View>
                  ))}
                  {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                    <View key={`pad-${i}`} style={{ flex: 1 }} />
                  ))}
                </View>
              ))}

              {businesses.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 60 }}>
                  <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.mute, letterSpacing: 2 }}>
                    NENHUM ESTABELECIMENTO
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        <ScreenFooter />
      </View>

      {showEntering && selectedBiz && (
        <EnteringOverlay biz={selectedBiz} hue={selectedHue} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  glow: {
    position: "absolute",
    top: -160, left: "25%", right: "25%",
    height: 400, borderRadius: 200,
    backgroundColor: "rgba(255,61,20,0.07)",
  },
});

const h = StyleSheet.create({
  bar:             { height: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 40 },
  left:            { flexDirection: "row", alignItems: "center", gap: 12 },
  wordmark:        { fontFamily: "Geist_700Bold", fontSize: 16, color: D.text, letterSpacing: -0.3 },
  sep:             { width: 1, height: 14, backgroundColor: D.line, marginLeft: 4 },
  kicker:          { fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.faint, letterSpacing: 3.5 },
  deviceId:        { fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.mute, letterSpacing: 3.5 },
});

const ft = StyleSheet.create({
  bar:     { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 40 },
  version: { fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.mute, letterSpacing: 3 },
  right:   { flexDirection: "row", alignItems: "center", gap: 8 },
  dot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: D.green },
  online:  { fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.mute, letterSpacing: 3 },
});

const pg = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 40, paddingBottom: 8 },
  title:   { fontFamily: "Geist_700Bold", fontSize: 46, color: D.text, letterSpacing: -1.8, lineHeight: 50, marginBottom: 24 },
});

const bc = StyleSheet.create({
  card:       { borderRadius: 20, borderWidth: 1.5, padding: 24, overflow: "hidden", minHeight: 200 },
  strip:      { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: 20 },
  avatar:     { width: 56, height: 56, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  avatarText: { fontFamily: "Geist_700Bold", fontSize: 26, letterSpacing: -0.5 },
  name:       { fontFamily: "Geist_700Bold", fontSize: 22, color: D.text, letterSpacing: -0.6, lineHeight: 26, flex: 1, marginBottom: 20 },
  footer:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTopWidth: 1, borderTopColor: D.line },
  footerLabel:{ fontFamily: "GeistMono_400Regular", fontSize: 9.5, color: D.faint, letterSpacing: 2 },
});

const en = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: D.bg, alignItems: "center", justifyContent: "center", zIndex: 10 },
  ring:        { position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: "rgba(255,61,20,0.22)" },
  circle:      { width: 110, height: 110, borderRadius: 55, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 28 },
  circleText:  { fontFamily: "Geist_700Bold", fontSize: 44, letterSpacing: -1 },
  bizName:     { fontFamily: "Geist_700Bold", fontSize: 48, color: D.text, letterSpacing: -1.5, textAlign: "center", lineHeight: 52, marginBottom: 28, maxWidth: 680 },
  spinnerPill: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: D.surf, borderWidth: 1, borderColor: D.line, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  spinnerText: { fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.faint, letterSpacing: 3.5 },
});
