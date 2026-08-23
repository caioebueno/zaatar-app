import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

export type TabletTopBarMode = "home" | "inner";

export type TabletTopBarBusiness = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

export type TabletTopBarBranch = {
  id: string;
  name: string;
};

export type TabletTopBarProps = {
  mode?: TabletTopBarMode;
  // inner mode
  pageTitle?: string;
  pageSubtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  // home mode
  businesses?: TabletTopBarBusiness[];
  selectedBusinessId?: string | null;
  branches?: TabletTopBarBranch[];
  selectedBranchId?: string | null;
  onBusinessPillPress?: () => void;
  // shared
  userInitial?: string;
  onAvatarPress?: () => void;
};

const D = {
  surf:  "#181310",
  surf2: "#1e1812",
  line:  "rgba(250,245,238,0.09)",
  lineH: "rgba(250,245,238,0.20)",
  text:  "#faf5ee",
  dim:   "rgba(250,245,238,0.72)",
  faint: "rgba(250,245,238,0.52)",
  mute:  "rgba(250,245,238,0.30)",
  zippy: "#ff3d14",
  green: "#34d39a",
};

function pad(n: number) { return String(n).padStart(2, "0"); }

// ── Separator ──────────────────────────────────────────────────────────────────
function Sep() {
  return <View style={s.sep} />;
}

// ── Status dot ─────────────────────────────────────────────────────────────────
function StatusDot() {
  const anim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1,   duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(anim, { toValue: 0.6, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={s.statusRow}>
      <Animated.View style={[s.dot, { opacity: anim }]} />
      <Text style={s.onlineText}>ONLINE</Text>
    </View>
  );
}

// ── Live clock ─────────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow]       = useState(new Date());
  const [colonOn, setColon] = useState(true);
  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); setColon((v) => !v); }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
      <Text style={s.clock}>{pad(now.getHours())}</Text>
      <Text style={[s.clock, { opacity: colonOn ? 1 : 0.32 }]}>:</Text>
      <Text style={s.clock}>{pad(now.getMinutes())}</Text>
    </View>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ initial, onPress }: { initial: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.avatar, pressed && s.avatarPressed]}>
      <Text style={s.avatarText}>{initial}</Text>
    </Pressable>
  );
}

// ── Right cluster ──────────────────────────────────────────────────────────────
function RightCluster({ userInitial, onAvatarPress }: { userInitial: string; onAvatarPress?: () => void }) {
  return (
    <View style={s.rightCluster}>
      <StatusDot />
      <Sep />
      <LiveClock />
      <Sep />
      <Avatar initial={userInitial} onPress={onAvatarPress} />
    </View>
  );
}

// ── Business selector ──────────────────────────────────────────────────────────
function BusinessSelector({
  businesses,
  selectedBusinessId,
  branches = [],
  selectedBranchId,
  onPress,
}: {
  businesses: TabletTopBarBusiness[];
  selectedBusinessId: string | null;
  branches?: TabletTopBarBranch[];
  selectedBranchId?: string | null;
  onPress?: () => void;
}) {
  const selectedBiz    = businesses.find((b) => b.id === selectedBusinessId) ?? businesses[0];
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.bizPill, pressed && s.bizPillOpen]}
    >
      {selectedBiz?.logoUrl ? (
        <Image
          source={{ uri: selectedBiz.logoUrl }}
          style={s.bizLogo}
          resizeMode="cover"
        />
      ) : (
        <View style={s.bizLogoFallback}>
          <Text style={s.bizLogoInitial}>
            {(selectedBiz?.name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={s.bizTextStack}>
        <Text style={s.bizName}>{selectedBiz?.name ?? "—"}</Text>
        {selectedBranch && (
          <Text style={s.bizLocation}>{selectedBranch.name}</Text>
        )}
      </View>
    </Pressable>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TabletTopBar({
  mode               = "home",
  pageTitle          = "",
  pageSubtitle       = "",
  onBack,
  backLabel          = "Início",
  businesses          = [],
  selectedBusinessId  = null,
  branches            = [],
  selectedBranchId    = null,
  onBusinessPillPress,
  userInitial         = "G",
  onAvatarPress,
}: TabletTopBarProps) {
  return (
    <View style={s.bar}>
      {mode === "home" ? (
        <>
          <BusinessSelector
            businesses={businesses}
            selectedBusinessId={selectedBusinessId}
            branches={branches}
            selectedBranchId={selectedBranchId}
            onPress={onBusinessPillPress}
          />

          <View style={{ flex: 1 }} />
          <RightCluster userInitial={userInitial} onAvatarPress={onAvatarPress} />
        </>
      ) : (
        <>
          {/* Back pill */}
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [s.backPill, pressed && s.backPillPressed]}
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Path
                d="M19 12H5M11 6l-6 6 6 6"
                stroke={D.dim}
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={s.backLabel}>{backLabel}</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* Centered title — absolutely positioned */}
          <View style={s.titleArea}>
            {!!pageTitle    && <Text style={s.pageTitle}>{pageTitle}</Text>}
            {!!pageSubtitle && <Text style={s.pageSubtitle}>{pageSubtitle}</Text>}
          </View>

          <RightCluster userInitial={userInitial} onAvatarPress={onAvatarPress} />
        </>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  bar: {
    backgroundColor: D.surf,
    borderBottomWidth: 1,
    borderBottomColor: D.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 20,
  },

  sep: { width: 1, height: 28, backgroundColor: D.line },

  // ── Business selector pill ────────────────────────────
  bizPill: {
    flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: "rgba(250,245,238,0.025)",
    borderWidth: 1, borderColor: D.line,
    borderRadius: 11,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 13,
  },
  bizPillOpen: {
    backgroundColor: "rgba(250,245,238,0.06)",
    borderColor: D.lineH,
  },
  bizLogo: {
    width: 26, height: 26, borderRadius: 7,
  },
  bizLogoFallback: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: "rgba(255,61,20,0.14)",
    borderWidth: 1, borderColor: "rgba(255,61,20,0.28)",
    alignItems: "center", justifyContent: "center",
  },
  bizLogoInitial: {
    fontFamily: "Geist_700Bold", fontSize: 11, color: D.zippy, letterSpacing: -0.2,
  },
  bizTextStack: { gap: 3 },
  bizName:     { fontFamily: "Geist_700Bold", fontSize: 12.5, color: D.text, letterSpacing: -0.2, lineHeight: 14 },
  bizLocation: { fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.faint, letterSpacing: 1.2, lineHeight: 11 },

  // ── Dropdown ──────────────────────────────────────────
  dropdown: {
    position: "absolute",
    flexDirection: "row",
    backgroundColor: D.surf2,
    borderWidth: 1, borderColor: D.lineH,
    borderRadius: 16,
    padding: 8,
    minWidth: 344,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.75,
    shadowRadius: 32,
    elevation: 20,
  },
  ddCol:       { width: 160, paddingVertical: 4 },
  ddColHeader: {
    fontFamily: "GeistMono_400Regular", fontSize: 8, color: D.mute,
    letterSpacing: 3.5, textTransform: "uppercase",
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4,
  },
  ddItem:        { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  ddItemPressed: { backgroundColor: "rgba(250,245,238,0.055)" },
  ddItemText:    { fontSize: 13, color: D.dim, letterSpacing: -0.15 },
  ddItemTextActive: { color: D.text, fontFamily: "Geist_700Bold" },
  ddDot:         { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  ddDotInactive: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "rgba(250,245,238,0.22)" },
  ddDotActiveBiz:{ backgroundColor: D.zippy, borderWidth: 0 },
  ddDotActiveLoc:{ backgroundColor: D.green, borderWidth: 0 },
  ddDivider:     { width: 1, backgroundColor: D.line, marginHorizontal: 4, marginVertical: 8 },

  // ── Inner mode ────────────────────────────────────────
  backPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: D.line, borderRadius: 999,
    paddingVertical: 10, paddingLeft: 14, paddingRight: 18,
  },
  backPillPressed: {
    borderColor: D.lineH,
    backgroundColor: "rgba(250,245,238,0.04)",
  },
  backLabel: { fontSize: 13.5, fontFamily: "Geist_700Bold", color: D.dim, letterSpacing: -0.2 },
  titleArea: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center", gap: 3, pointerEvents: "none" },
  pageTitle:    { fontSize: 16, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.4, textAlign: "center" },
  pageSubtitle: { fontFamily: "GeistMono_400Regular", fontSize: 9.5, color: D.faint, letterSpacing: 2, textTransform: "uppercase" },

  // ── Right cluster ─────────────────────────────────────
  rightCluster: { flexDirection: "row", alignItems: "center", gap: 18 },
  statusRow:    { flexDirection: "row", alignItems: "center", gap: 7 },
  dot:          { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#34d39a" },
  onlineText:   { fontFamily: "GeistMono_400Regular", fontSize: 9.5, color: "#34d39a", letterSpacing: 2.7 },
  clock:        { fontFamily: "GeistMono_700Bold", fontSize: 21, color: D.text, letterSpacing: -0.4, lineHeight: 24 },
  avatar: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,61,20,0.12)",
    borderWidth: 1.5, borderColor: "rgba(255,61,20,0.28)",
    alignItems: "center", justifyContent: "center",
  },
  avatarPressed: { backgroundColor: "rgba(255,61,20,0.22)" },
  avatarText:    { fontFamily: "Geist_700Bold", fontSize: 13, color: D.zippy, letterSpacing: -0.3 },
});
