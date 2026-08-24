import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { OTPError, VerifyOTPResponse, sendOwnerOTP, verifyOwnerOTP } from "@/services/authApi";

type Page = "choice" | "phone" | "otp" | "success" | "qr" | "linked";

const D = {
  bg: "#0a0807",
  surf: "#181310",
  surf2: "#1e1812",
  surf3: "#2a211b",
  line: "rgba(250,245,238,0.09)",
  lineH: "rgba(250,245,238,0.18)",
  text: "#faf5ee",
  dim: "rgba(250,245,238,0.58)",
  faint: "rgba(250,245,238,0.30)",
  mute: "rgba(250,245,238,0.14)",
  zippy: "#ff3d14",
  green: "#34d39a",
};

const EASE_OUT = Easing.out(Easing.cubic);

function useFadeUp(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, delay, easing: EASE_OUT, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 160, delay, easing: EASE_OUT, useNativeDriver: true }),
    ]).start();
  }, []);
  return { opacity, transform: [{ translateY }] };
}

function ZippyMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width="100" height="100" rx="22" fill={D.zippy} />
      <Rect x="41" y="51" width="18" height="18" rx="4" fill="#fff" />
      <Path d="M28 60 A22 22 0 0 1 72 60" stroke="#fff" strokeWidth="8" strokeLinecap="round" fill="none" opacity="0.55" />
      <Path d="M18 60 A32 32 0 0 1 82 60" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.25" />
    </Svg>
  );
}

function Header({ onBack }: { onBack?: () => void }) {
  return (
    <View style={hdrS.row}>
      <View style={hdrS.left}>
        <ZippyMark size={28} />
        <Text style={hdrS.brand}>Zappy</Text>
      </View>
      <Pressable
        onPress={onBack}
        disabled={!onBack}
        style={({ pressed }) => [hdrS.backBtn, { opacity: onBack ? (pressed ? 0.7 : 1) : 0 }]}
      >
        <Text style={hdrS.backArrow}>←</Text>
        <Text style={hdrS.backLabel}>Voltar</Text>
      </Pressable>
    </View>
  );
}
const hdrS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 56, paddingVertical: 20 },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  brand: { fontSize: 16, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.3 },
  div: { width: 1, height: 14, backgroundColor: D.line, marginLeft: 4 },
  platform: { fontFamily: "GeistMono_400Regular", fontSize: 10, letterSpacing: 2.5, color: D.faint, textTransform: "uppercase" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: D.line, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  backArrow: { fontSize: 14, color: D.dim, fontFamily: "Geist_400Regular" },
  backLabel: { fontSize: 13, fontFamily: "Geist_600SemiBold", color: D.dim },
  deviceId: { fontFamily: "GeistMono_400Regular", fontSize: 10, letterSpacing: 2.5, color: D.mute, textTransform: "uppercase" },
});

function Footer() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={ftrS.row}>
      <Text style={ftrS.version}>Zappy OS · v1.0.0</Text>
      <View style={ftrS.status}>
        <Animated.View style={[ftrS.dot, { opacity: pulse }]} />
        <Text style={ftrS.statusText}>Online</Text>
      </View>
    </View>
  );
}
const ftrS = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 56, paddingVertical: 20 },
  version: { fontFamily: "GeistMono_400Regular", fontSize: 10, letterSpacing: 2.5, color: "rgba(250,245,238,0.55)", textTransform: "uppercase" },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: D.green },
  statusText: { fontFamily: "GeistMono_400Regular", fontSize: 10, letterSpacing: 2.5, color: "rgba(250,245,238,0.55)", textTransform: "uppercase" },
});

function CTAButton({ label, onPress, disabled, loading, tone = "warm" }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: "warm" | "cool";
}) {
  const active = !disabled && !loading;
  const accent = tone === "cool" ? D.green : D.zippy;
  return (
    <Pressable
      onPress={onPress}
      disabled={!active}
      style={({ pressed }) => [ctaS.btn, { backgroundColor: active ? accent : D.surf3 }, pressed && active && { opacity: 0.88 }]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[ctaS.label, { color: active ? "#fff" : D.faint }]}>{label}</Text>
      )}
    </Pressable>
  );
}
const ctaS = StyleSheet.create({
  btn: { width: "100%", height: 58, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontFamily: "Geist_700Bold", letterSpacing: -0.2 },
});

function MonoTag({ label, color }: { label: string; color: string }) {
  const anim = useFadeUp(0);
  return (
    <Animated.View style={[tagS.wrap, { borderColor: `${color}38`, backgroundColor: `${color}14` }, anim]}>
      <View style={[tagS.dot, { backgroundColor: color }]} />
      <Text style={[tagS.text, { color }]}>{label}</Text>
    </Animated.View>
  );
}
const tagS = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start", marginBottom: 18 },
  dot: { width: 5, height: 5, borderRadius: 2 },
  text: { fontFamily: "GeistMono_700Bold", fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase" },
});

/* ── PAGE 1: CHOICE ─────────────────────────────────────── */
function ChoicePage({ onPickManager, onPickStation }: { onPickManager: () => void; onPickStation: () => void }) {
  const eyebrow = useFadeUp(0);
  const h1 = useFadeUp(40);
  const cards = useFadeUp(80);

  return (
    <View style={styles.pageCenter}>
      <Animated.Text style={[choiceS.eyebrow, eyebrow]}>Como você vai entrar?</Animated.Text>
      <Animated.Text style={[choiceS.h1, h1]}>Escolha o tipo de acesso.</Animated.Text>
      <Animated.View style={[choiceS.grid, cards]}>
        <ChoiceCard
          tone="warm"
          eyebrow="01 · Acesso total"
          title="Gestor"
          desc="SMS no seu celular. Dispatch, motoristas e relatórios."
          accent={D.zippy}
          onPress={onPickManager}
        />
        <View style={{ opacity: 0.35 }} pointerEvents="none">
          <ChoiceCard
            tone="cool"
            eyebrow="02 · Apenas esta tela"
            title="Estação"
            desc="QR Code do crachá. Acesso restrito a uma cozinha."
            accent={D.green}
            onPress={onPickStation}
          />
        </View>
      </Animated.View>
    </View>
  );
}

function PhoneIcon({ color }: { color: string }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="2" width="12" height="20" rx="3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M11 18h2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function QRIcon({ color }: { color: string }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" rx="1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="14" y="3" width="7" height="7" rx="1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="3" y="14" width="7" height="7" rx="1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 14h3v3h-3zM20 17v4M17 20h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChoiceCard({ tone, eyebrow, title, desc, accent, onPress }: {
  tone: "warm" | "cool"; eyebrow: string; title: string; desc: string; accent: string; onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[choiceS.card, { borderColor: pressed ? `${accent}50` : D.line, backgroundColor: pressed ? D.surf2 : D.surf }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", }}>
        <View style={[choiceS.cardIcon, { backgroundColor: `${accent}14`, borderColor: `${accent}33` }]}>
          {tone === "warm" ? <PhoneIcon color={accent} /> : <QRIcon color={accent} />}
        </View>
        {/* <Text style={choiceS.cardEyebrow}>{eyebrow}</Text> */}
      </View>
      <View style={{ gap: 10, marginTop: 10 }}>
        <Text style={choiceS.cardTitle}>{title}</Text>
        <Text style={choiceS.cardDesc}>{desc}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Text style={[choiceS.cardCta, { color: pressed ? accent : D.dim }]}>Continuar →</Text>
        </View>
      </View>
    </Pressable>
  );
}

const choiceS = StyleSheet.create({
  eyebrow: { fontFamily: "GeistMono_400Regular", fontSize: 10, letterSpacing: 3.5, color: D.faint, textTransform: "uppercase", marginBottom: 14, textAlign: "center" },
  h1: { fontSize: 40, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -1.5, lineHeight: 44, textAlign: "center", marginBottom: 32, maxWidth: 600 },
  grid: { flexDirection: "row", gap: 16, width: "100%", maxWidth: 700, },
  card: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 24 },
  cardIcon: { width: 44, height: 44, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cardEyebrow: { fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 2.5, color: D.faint, textTransform: "uppercase" },
  cardTitle: { fontSize: 26, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.8, lineHeight: 34 },
  cardDesc: { fontSize: 13, fontFamily: "Geist_400Regular", color: "rgba(250,245,238,0.75)", lineHeight: 19, letterSpacing: 0.35 },
  cardCta: { fontFamily: "GeistMono_700Bold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
});

/* ── COUNTRY DATA ───────────────────────────────────────── */
type Country = { code: string; flag: string; name: string; dialCode: string; mask: string };

const COUNTRIES: Country[] = [
  { code: "US", flag: "🇺🇸", name: "United States", dialCode: "+1",   mask: "(###) ###-####" },
  { code: "BR", flag: "🇧🇷", name: "Brazil",        dialCode: "+55",  mask: "(##) #####-####" },
  { code: "CA", flag: "🇨🇦", name: "Canada",        dialCode: "+1",   mask: "(###) ###-####" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom",dialCode: "+44",  mask: "#### ######" },
  { code: "FR", flag: "🇫🇷", name: "France",        dialCode: "+33",  mask: "## ## ## ## ##" },
  { code: "DE", flag: "🇩🇪", name: "Germany",       dialCode: "+49",  mask: "### #######" },
  { code: "ES", flag: "🇪🇸", name: "Spain",         dialCode: "+34",  mask: "### ### ###" },
  { code: "IT", flag: "🇮🇹", name: "Italy",         dialCode: "+39",  mask: "### ### ####" },
  { code: "MX", flag: "🇲🇽", name: "Mexico",        dialCode: "+52",  mask: "### ### ####" },
  { code: "AR", flag: "🇦🇷", name: "Argentina",     dialCode: "+54",  mask: "### ###-####" },
  { code: "PT", flag: "🇵🇹", name: "Portugal",      dialCode: "+351", mask: "### ### ###" },
  { code: "JP", flag: "🇯🇵", name: "Japan",         dialCode: "+81",  mask: "##-####-####" },
  { code: "AU", flag: "🇦🇺", name: "Australia",     dialCode: "+61",  mask: "#### ### ###" },
];

function applyMask(digits: string, mask: string): string {
  let out = "";
  let di = 0;
  for (let i = 0; i < mask.length && di < digits.length; i++) {
    out += mask[i] === "#" ? digits[di++] : mask[i];
  }
  return out;
}

function maskDigitCount(mask: string) {
  return mask.split("").filter((c) => c === "#").length;
}

function CountryPicker({ visible, onSelect, onClose }: {
  visible: boolean; onSelect: (c: Country) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.dialCode.includes(query)
      )
    : COUNTRIES;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerS.overlay} onPress={onClose}>
        <Pressable style={pickerS.sheet} onPress={() => {}}>
          <View style={pickerS.handle} />
          <Text style={pickerS.title}>Selecionar país</Text>
          <View style={pickerS.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar…"
              placeholderTextColor={D.faint}
              style={pickerS.search}
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            style={{ maxHeight: 340 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect(item); onClose(); }}
                style={({ pressed }) => [pickerS.row, pressed && { backgroundColor: D.surf2 }]}
              >
                <Text style={pickerS.rowFlag}>{item.flag}</Text>
                <Text style={pickerS.rowName}>{item.name}</Text>
                <Text style={pickerS.rowDial}>{item.dialCode}</Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pickerS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { backgroundColor: D.surf, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: D.line, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  title: { fontFamily: "Geist_700Bold", fontSize: 16, color: D.text, paddingHorizontal: 24, paddingVertical: 12 },
  searchWrap: { marginHorizontal: 16, marginBottom: 8, backgroundColor: D.surf2, borderRadius: 10, borderWidth: 1, borderColor: D.line },
  search: { height: 44, paddingHorizontal: 14, fontFamily: "Geist_400Regular", fontSize: 14, color: D.text },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, gap: 14 },
  rowFlag: { fontSize: 22, width: 30 },
  rowName: { flex: 1, fontFamily: "Geist_400Regular", fontSize: 14, color: D.text },
  rowDial: { fontFamily: "GeistMono_500Medium", fontSize: 13, color: D.faint },
});

/* ── PAGE 2: PHONE ──────────────────────────────────────── */
function PhonePage({ onBack, onNext }: {
  onBack: () => void;
  onNext: (rawPhone: string, displayPhone: string) => void;
}) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [digits, setDigits] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const h1 = useFadeUp(30);
  const sub = useFadeUp(60);
  const inp = useFadeUp(90);
  const btn = useFadeUp(120);

  const maxDigits = maskDigitCount(country.mask);
  const formatted = applyMask(digits, country.mask);
  const ok = digits.length >= Math.min(7, maxDigits);

  const handleChangeText = useCallback((text: string) => {
    const raw = text.replace(/\D/g, "").slice(0, maxDigits);
    setDigits(raw);
    setError("");
  }, [maxDigits]);

  const handleSelectCountry = useCallback((c: Country) => {
    setCountry(c);
    setDigits("");
    setError("");
  }, []);

  const submit = useCallback(async () => {
    if (!ok || loading) return;
    const rawPhone = country.dialCode.replace("+", "") + digits;
    console.log("[login] sendOwnerOTP →", { rawPhone, dialCode: country.dialCode, digits });
    setLoading(true);
    setError("");
    try {
      await sendOwnerOTP(rawPhone);
      onNext(rawPhone, formatted);
    } catch (e) {
      if (e instanceof OTPError) {
        if (e.detail.type === "NOT_FOUND") setError("Número não cadastrado.");
        else if (e.detail.type === "NETWORK") setError("Sem conexão.");
        else setError("Erro ao enviar código.");
      }
    } finally {
      setLoading(false);
    }
  }, [ok, loading, country, digits, formatted, onNext]);

  return (
    <View style={styles.pageCenter}>
      <View style={{ width: "100%", maxWidth: 400 }}>
        <MonoTag label="Gestor · Acesso total" color={D.zippy} />
        <Animated.Text style={[phoneS.h1, h1]}>Seu número.</Animated.Text>
        <Animated.Text style={[phoneS.sub, sub]}>Enviaremos um código por SMS.</Animated.Text>
        <Animated.View style={[phoneS.inputWrap, { borderColor: focused ? D.zippy : D.line }, inp]}>
          <Pressable onPress={() => setPickerOpen(true)} style={phoneS.prefix}>
            <Text style={{ fontSize: 20 }}>{country.flag}</Text>
            <Text style={phoneS.prefixCode}>{country.dialCode}</Text>
            <Text style={phoneS.prefixChevron}>▾</Text>
          </Pressable>
          <TextInput
            value={formatted}
            onChangeText={handleChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={submit}
            keyboardType="phone-pad"
            placeholder={applyMask("5".repeat(maxDigits), country.mask)}
            placeholderTextColor="rgba(250,245,238,0.18)"
            returnKeyType="send"
            style={phoneS.input}
          />
        </Animated.View>
        {!!error && <Text style={phoneS.errorMsg}>{error}</Text>}
        <Animated.View style={btn}>
          <CTAButton label="Enviar código" onPress={submit} disabled={!ok} loading={loading} />
        </Animated.View>
      </View>
      <CountryPicker
        visible={pickerOpen}
        onSelect={handleSelectCountry}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const phoneS = StyleSheet.create({
  h1: { fontSize: 34, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -1.5, lineHeight: 38, marginBottom: 10 },
  sub: { fontSize: 14, fontFamily: "Geist_400Regular", color: D.dim, lineHeight: 22, marginBottom: 24 },
  inputWrap: { flexDirection: "row", alignItems: "stretch", backgroundColor: D.surf, borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 18, borderColor: D.line },
  prefix: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderRightWidth: 1, borderRightColor: D.line },
  prefixCode: { fontFamily: "GeistMono_600SemiBold", fontSize: 14, color: D.dim },
  prefixChevron: { fontSize: 10, color: D.faint, marginLeft: 2 },
  input: { flex: 1, height: 58, paddingHorizontal: 16, fontFamily: "GeistMono_500Medium", fontSize: 16, color: D.text, letterSpacing: 1 },
  errorMsg: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.zippy, letterSpacing: 0.8, marginBottom: 12 },
});

/* ── PAGE 3: OTP ─────────────────────────────────────────── */
function OTPPage({ rawPhone, displayPhone, onBack, onVerified }: {
  rawPhone: string;
  displayPhone: string;
  onBack: () => void;
  onVerified: (res: VerifyOTPResponse) => void;
}) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [focIdx, setFocIdx] = useState(-1);
  const shakeX = useRef(new Animated.Value(0)).current;
  const refs = useRef<(TextInput | null)[]>([]);
  const h1 = useFadeUp(30);
  const sub = useFadeUp(60);
  const boxes = useFadeUp(90);
  const btn = useFadeUp(120);

  useEffect(() => {
    const t = setTimeout(() => refs.current[0]?.focus(), 120);
    const timer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => { clearTimeout(t); clearInterval(timer); };
  }, []);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [shakeX]);

  const verify = useCallback(async (d: string[] = digits) => {
    const code = d.join("");
    if (code.length < 6) return;
    console.log("[login] verifyOwnerOTP →", { rawPhone, code });
    setLoading(true);
    setErrMsg("");
    try {
      const res = await verifyOwnerOTP(rawPhone, code);
      onVerified(res);
    } catch (e) {
      setDigits(Array(6).fill(""));
      shake();
      if (e instanceof OTPError) {
        if (e.detail.type === "OTP_NOT_FOUND_OR_EXPIRED") setErrMsg("Código expirado.");
        else if (e.detail.type === "OTP_INVALID")
          setErrMsg(e.detail.remainingAttempts > 0 ? `Inválido. ${e.detail.remainingAttempts} tentativas.` : "Código inválido.");
        else if (e.detail.type === "NOT_FOUND") setErrMsg("Número não encontrado.");
        else if (e.detail.type === "NETWORK") setErrMsg("Sem conexão.");
        else setErrMsg("Erro ao verificar.");
      }
      setTimeout(() => refs.current[0]?.focus(), 60);
    } finally {
      setLoading(false);
    }
  }, [digits, rawPhone, shake, onVerified]);

  const resend = useCallback(async () => {
    setCountdown(30);
    await sendOwnerOTP(rawPhone).catch(() => {});
  }, [rawPhone]);

  const change = useCallback((i: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setErrMsg("");
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (i === 5 && d && next.every((x) => x !== "")) verify(next);
  }, [digits, verify]);

  const keydown = useCallback((i: number, e: any) => {
    if (e.nativeEvent.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }, [digits]);

  const all = digits.every((d) => d !== "");
  const hasErr = !!errMsg;

  const boxStyle = (i: number) => ({
    ...otpS.box,
    borderColor: hasErr ? "rgba(255,61,20,0.45)" : focIdx === i ? D.zippy : digits[i] ? "rgba(250,245,238,0.15)" : D.line,
    backgroundColor: hasErr ? "rgba(255,61,20,0.06)" : digits[i] ? D.surf2 : D.surf,
    color: hasErr ? D.zippy : D.text,
  });

  return (
    <View style={styles.pageCenter}>
      <View style={{ width: "100%", maxWidth: 460 }}>
          <MonoTag label="Etapa 02 · Verificação" color={D.zippy} />
          <Animated.Text style={[otpS.h1, h1]}>Digite o código.</Animated.Text>
          <Animated.Text style={[otpS.sub, sub]}>
            Enviado para{" "}
            <Text style={otpS.phoneHighlight}>{displayPhone}</Text>
          </Animated.Text>

          <Animated.View style={[{ transform: [{ translateX: shakeX }] }, boxes]}>
            <View style={otpS.row}>
              {[0, 1, 2].map((i) => (
                <TextInput
                  key={i}
                  ref={(el) => { refs.current[i] = el; }}
                  value={digits[i]}
                  onChangeText={(v) => change(i, v)}
                  onKeyPress={(e) => keydown(i, e)}
                  onFocus={() => setFocIdx(i)}
                  onBlur={() => setFocIdx(-1)}
                  maxLength={1}
                  keyboardType="number-pad"
                  style={boxStyle(i)}
                  selectTextOnFocus
                />
              ))}
              <View style={otpS.sep} />
              {[3, 4, 5].map((i) => (
                <TextInput
                  key={i}
                  ref={(el) => { refs.current[i] = el; }}
                  value={digits[i]}
                  onChangeText={(v) => change(i, v)}
                  onKeyPress={(e) => keydown(i, e)}
                  onFocus={() => setFocIdx(i)}
                  onBlur={() => setFocIdx(-1)}
                  maxLength={1}
                  keyboardType="number-pad"
                  style={boxStyle(i)}
                  selectTextOnFocus
                />
              ))}
            </View>
          </Animated.View>

          <View style={otpS.statusRow}>
            <Text style={[otpS.errMsg, { opacity: hasErr ? 1 : 0 }]}>{errMsg || " "}</Text>
            <Text style={otpS.resend}>
              {countdown > 0 ? (
                `Reenviar em ${countdown}s`
              ) : (
                <Text onPress={resend} style={otpS.resendActive}>Reenviar código →</Text>
              )}
            </Text>
          </View>

          <Animated.View style={btn}>
            <CTAButton label="Verificar e entrar" onPress={() => verify()} disabled={!all} loading={loading} />
          </Animated.View>
      </View>
    </View>
  );
}

const otpS = StyleSheet.create({
  h1: { fontSize: 38, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -1.5, lineHeight: 42, marginBottom: 10 },
  sub: { fontSize: 14, fontFamily: "Geist_400Regular", color: D.dim, lineHeight: 22, marginBottom: 24 },
  phoneHighlight: { fontFamily: "GeistMono_600SemiBold", fontSize: 13, color: D.text, letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  box: { flex: 1, minWidth: 0, height: 68, borderRadius: 14, borderWidth: 1.5, textAlign: "center", fontFamily: "GeistMono_700Bold", fontSize: 26, caretColor: "transparent" } as any,
  sep: { width: 16, height: 1.5, borderRadius: 1, backgroundColor: D.faint, flexShrink: 0 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 20 },
  errMsg: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.zippy, letterSpacing: 0.8 },
  resend: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.faint, letterSpacing: 0.8 },
  resendActive: { fontFamily: "GeistMono_700Bold", fontSize: 11, color: D.zippy, letterSpacing: 0.8 },
});

/* ── PAGE 4: MANAGER SUCCESS ─────────────────────────────── */
function ManagerSuccessPage({ name }: { name: string }) {
  const scale1 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.55)).current;
  const scale2 = useRef(new Animated.Value(1)).current;
  const opacity2 = useRef(new Animated.Value(0.55)).current;
  const checkScale = useRef(new Animated.Value(0.58)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const h1 = useFadeUp(80);
  const sub = useFadeUp(140);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const ring = (s: Animated.Value, o: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(s, { toValue: 2.5, duration: 2300, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0, duration: 2300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(s, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ])).start();
    ring(scale1, opacity1, 0);
    ring(scale2, opacity2, 780);

    const t = setTimeout(() => router.replace("/dispatch"), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.pageCenter}>
      <View style={successS.iconWrap}>
        <Animated.View style={[successS.ring, { transform: [{ scale: scale1 }], opacity: opacity1, borderColor: "rgba(255,61,20,0.26)" }]} />
        <Animated.View style={[successS.ring, { transform: [{ scale: scale2 }], opacity: opacity2, borderColor: "rgba(255,61,20,0.26)" }]} />
        <Animated.View style={[successS.circle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={{ fontSize: 36, lineHeight: 40 }}>✓</Text>
        </Animated.View>
      </View>
      <Animated.Text style={[successS.h1, h1]}>Bem-vindo, {name}.</Animated.Text>
      <Animated.View style={[successS.loadingRow, sub]}>
        <ActivityIndicator color={D.zippy} size="small" />
        <Text style={successS.loadingText}>Abrindo dispatch…</Text>
      </Animated.View>
    </View>
  );
}

const successS = StyleSheet.create({
  iconWrap: { width: 84, height: 84, alignItems: "center", justifyContent: "center", marginBottom: 28 },
  ring: { position: "absolute", width: 84, height: 84, borderRadius: 42, borderWidth: 1 },
  circle: { width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(255,61,20,0.08)", borderWidth: 1.5, borderColor: "rgba(255,61,20,0.32)", alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 38, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -1.5, lineHeight: 42, textAlign: "center", marginBottom: 14 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: D.surf, borderWidth: 1, borderColor: D.line, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  loadingText: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.faint, letterSpacing: 2, textTransform: "uppercase" },
});

/* ── PAGE 5: QR SCAN ─────────────────────────────────────── */
type QRMode = "idle" | "scanning" | "linked";

function QRPage({ onBack, onLinked }: { onBack: () => void; onLinked: () => void }) {
  const [mode, setMode] = useState<QRMode>("idle");
  const progress = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;
  const h1 = useFadeUp(30);
  const sub = useFadeUp(60);
  const frame = useFadeUp(80);
  const btn = useFadeUp(100);

  const stationName = "Recheador";
  const stationCode = "RCH-01";

  useEffect(() => {
    if (mode !== "scanning") {
      progress.setValue(0);
      return;
    }
    Animated.timing(progress, { toValue: 100, duration: 2000, useNativeDriver: false }).start(({ finished }) => {
      if (finished) setTimeout(() => setMode("linked"), 280);
    });
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, [mode]);

  useEffect(() => {
    if (mode === "linked") {
      const t = setTimeout(() => onLinked(), 1600);
      return () => clearTimeout(t);
    }
  }, [mode]);

  const headline = mode === "linked" ? "Estação vinculada." : mode === "scanning" ? "Lendo o crachá…" : "Escaneie o crachá.";
  const subText = mode === "linked"
    ? `Acesso restrito a ${stationName}.`
    : mode === "scanning"
      ? "Mantenha o QR dentro do quadro."
      : "Aponte o crachá ao leitor abaixo.";

  return (
    <View style={styles.pageCenter}>
      <MonoTag label="Estação · Apenas esta tela" color={D.green} />
      <Animated.Text style={[qrS.h1, h1]}>{headline}</Animated.Text>
      <Animated.Text style={[qrS.sub, sub]}>{subText}</Animated.Text>

      <Animated.View style={[qrS.frame, {
        borderColor: mode !== "idle" ? D.green : "rgba(250,245,238,0.10)",
        shadowColor: mode !== "idle" ? D.green : "transparent",
        shadowOpacity: mode !== "idle" ? 0.3 : 0,
        shadowRadius: 24,
        elevation: 0,
      }, frame]}>
        <QRGrid />
        {mode === "scanning" && (
          <Animated.View style={[qrS.scanLine, {
            transform: [{ translateY: scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 280] }) }],
          }]} />
        )}
        {mode === "linked" && (
          <View style={qrS.successOverlay}>
            <View style={qrS.successCircle}>
              <Text style={{ fontSize: 44, color: D.green, lineHeight: 48 }}>✓</Text>
            </View>
          </View>
        )}
      </Animated.View>

      <Animated.View style={[{ width: 320, marginTop: 24 }, btn]}>
        {mode === "idle" && (
          <Pressable onPress={() => setMode("scanning")} style={({ pressed }) => [qrS.simulateBtn, pressed && { borderColor: D.lineH }]}>
            <Text style={qrS.simulateBtnText}>Simular leitura</Text>
          </Pressable>
        )}
        {mode === "scanning" && (
          <View style={{ gap: 10 }}>
            <View style={qrS.progressTrack}>
              <Animated.View style={[qrS.progressFill, { width: progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={qrS.progressLabel}>Decodificando</Text>
              <Animated.Text style={[qrS.progressLabel, { color: D.green }]}>
                {progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] })}
              </Animated.Text>
            </View>
          </View>
        )}
        {mode === "linked" && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 48 }}>
            <ActivityIndicator color={D.green} size="small" />
            <Text style={[qrS.progressLabel, { color: D.green }]}>Abrindo {stationCode}…</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function QRGrid() {
  const cells: [number, number][] = [];
  const N = 7;
  const seed = (i: number) => { let x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (seed(y * N + x + 1) > 0.48) cells.push([x, y]);
    }
  }
  const cellSize = 36;
  return (
    <View style={{ width: N * cellSize, height: N * cellSize, position: "relative" }}>
      {cells.map(([x, y], i) => (
        <View key={i} style={{ position: "absolute", left: x * cellSize + 2, top: y * cellSize + 2, width: cellSize - 4, height: cellSize - 4, backgroundColor: "#0a0807", borderRadius: 3 }} />
      ))}
      {[[0, 0], [N - 2, 0], [0, N - 2]].map(([fx, fy], i) => (
        <View key={`f${i}`} style={{ position: "absolute", left: fx * cellSize, top: fy * cellSize, width: cellSize * 2, height: cellSize * 2, borderRadius: 4, backgroundColor: "#0a0807" }}>
          <View style={{ margin: 4, flex: 1, borderRadius: 2, backgroundColor: "#fff" }}>
            <View style={{ margin: 4, flex: 1, borderRadius: 1, backgroundColor: "#0a0807" }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const qrS = StyleSheet.create({
  h1: { fontSize: 44, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -1.8, lineHeight: 48, textAlign: "center", marginBottom: 12 },
  sub: { fontSize: 15, fontFamily: "Geist_400Regular", color: D.dim, lineHeight: 23, textAlign: "center", marginBottom: 36, maxWidth: 420 },
  frame: { width: 320, height: 320, padding: 20, backgroundColor: "#fff", borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  scanLine: { position: "absolute", left: 12, right: 12, height: 3, borderRadius: 2, backgroundColor: "#34d39a", shadowColor: "#34d39a", shadowOpacity: 0.9, shadowRadius: 10 },
  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, backgroundColor: "rgba(52,211,154,0.22)", alignItems: "center", justifyContent: "center" },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20 },
  simulateBtn: { width: "100%", height: 48, borderRadius: 12, borderWidth: 1, borderColor: D.line, alignItems: "center", justifyContent: "center" },
  simulateBtnText: { fontFamily: "GeistMono_600SemiBold", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: D.dim },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "rgba(52,211,154,0.12)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: D.green, borderRadius: 999 },
  progressLabel: { fontFamily: "GeistMono_400Regular", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: D.faint },
});

/* ── PAGE 6: STATION LINKED ──────────────────────────────── */
function StationLinkedPage({ stationName, stationCode, stationId }: { stationName: string; stationCode: string; stationId: string }) {
  const scale1 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.55)).current;
  const scale2 = useRef(new Animated.Value(1)).current;
  const opacity2 = useRef(new Animated.Value(0.55)).current;
  const checkScale = useRef(new Animated.Value(0.58)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const h1 = useFadeUp(80);
  const sub = useFadeUp(130);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const ring = (s: Animated.Value, o: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(s, { toValue: 2.5, duration: 2300, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0, duration: 2300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(s, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ])).start();
    ring(scale1, opacity1, 0);
    ring(scale2, opacity2, 780);

    const t = setTimeout(() => router.replace({ pathname: "/station", params: { stationId, stationName } }), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.pageCenter}>
      <View style={successS.iconWrap}>
        <Animated.View style={[successS.ring, { transform: [{ scale: scale1 }], opacity: opacity1, borderColor: "rgba(52,211,154,0.26)" }]} />
        <Animated.View style={[successS.ring, { transform: [{ scale: scale2 }], opacity: opacity2, borderColor: "rgba(52,211,154,0.26)" }]} />
        <Animated.View style={[successS.circle, { transform: [{ scale: checkScale }], opacity: checkOpacity, backgroundColor: "rgba(52,211,154,0.08)", borderColor: "rgba(52,211,154,0.32)" }]}>
          <Text style={{ fontSize: 48, lineHeight: 52, color: D.green }}>✓</Text>
        </Animated.View>
      </View>
      <Animated.Text style={[successS.h1, h1]}>{stationName}</Animated.Text>
      <Animated.Text style={[linkedS.sub, sub]}>
        Estação{" "}
        <Text style={linkedS.code}>{stationCode}</Text>
        {" "}vinculada. Abrindo painel…
      </Animated.Text>
    </View>
  );
}

const linkedS = StyleSheet.create({
  sub: { fontSize: 16, fontFamily: "Geist_400Regular", color: D.dim, textAlign: "center", maxWidth: 440, lineHeight: 25 },
  code: { fontFamily: "GeistMono_600SemiBold", color: D.text, fontSize: 15 },
});

/* ── ROOT ────────────────────────────────────────────────── */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [page, setPage] = useState<Page>("choice");
  const [rawPhone, setRawPhone] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [managerName, setManagerName] = useState("");

  const STATION = { id: "2a18e3a7-2491-422a-af43-efff08031e9b", name: "Recheador", code: "RCH-01" };

  const onBack = ["phone", "otp", "qr"].includes(page) ? () => {
    if (page === "phone") setPage("choice");
    else if (page === "otp") setPage("phone");
    else if (page === "qr") setPage("choice");
  } : undefined;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <Header onBack={onBack} />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {page === "choice" && (
            <ChoicePage
              onPickManager={() => setPage("phone")}
              onPickStation={() => setPage("qr")}
            />
          )}
          {page === "phone" && (
            <PhonePage
              onBack={() => setPage("choice")}
              onNext={(raw, display) => { setRawPhone(raw); setDisplayPhone(display); setPage("otp"); }}
            />
          )}
          {page === "otp" && (
            <OTPPage
              rawPhone={rawPhone}
              displayPhone={displayPhone}
              onBack={() => setPage("phone")}
              onVerified={async (res) => {
                setManagerName(res.owner.name);
                setPage("success");
                await signIn(res.accessToken, res.owner);
                router.replace("/(app)");
              }}
            />
          )}
          {page === "success" && <ManagerSuccessPage name={managerName} />}
          {page === "qr" && (
            <QRPage
              onBack={() => setPage("choice")}
              onLinked={() => setPage("linked")}
            />
          )}
          {page === "linked" && (
            <StationLinkedPage
              stationName={STATION.name}
              stationCode={STATION.code}
              stationId={STATION.id}
            />
          )}
        </ScrollView>
        <Footer />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 56, paddingVertical: 24 },
  pageCenter: { alignItems: "center" },
});
