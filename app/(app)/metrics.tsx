import { router } from "expo-router";
import { useAuth } from "@/contexts/auth";
import { TabletTopBar } from "@/components/TabletTopBar";
import { fetchSalesAnalytics, type SalesAnalyticsResponse } from "@/services/analyticsApi";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Defs,
  Line as SvgLine,
  LinearGradient as SvgGrad,
  Path,
  Rect as SvgRect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { LineChart } from "react-native-gifted-charts";

// ── Design tokens ──────────────────────────────────────────────────────────────
const D = {
  bg:    "#0a0807",
  surf:  "#181310",
  surf2: "#1e1812",
  surf3: "#2a211b",
  line:  "rgba(250,245,238,0.08)",
  lineS: "rgba(250,245,238,0.14)",
  text:  "#faf5ee",
  dim:   "rgba(250,245,238,0.72)",
  faint: "rgba(250,245,238,0.52)",
  vfaint:"rgba(250,245,238,0.30)",
  zippy: "#ff3d14",
  green: "#34d39a",
  amber: "#f2b338",
  blue:  "#4a9eff",
};

// ── Seeded RNG & static data ───────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

type DayData = {
  date: Date; label: string; dayShort: string;
  activeClients: number; newClients: number; churnedClients: number;
  net: number; orders: number; revenue: number;
};

const _rng = makeRng(7391);
const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const HISTORY: DayData[] = (() => {
  const days: DayData[] = [];
  let active = 1184;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(2026, 4, 16 - i);
    const dow = d.getDay();
    const isWknd = dow === 5 || dow === 6;
    const newC  = Math.round(isWknd ? 14 + _rng() * 10 : 7 + _rng() * 9);
    const churn = Math.round(isWknd ? 3  + _rng() * 4  : 2 + _rng() * 7);
    active += newC - churn;
    const orders = Math.round(isWknd ? 210 + _rng() * 90 : 130 + _rng() * 80);
    days.push({
      date: d,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      dayShort: DAY_NAMES[dow],
      activeClients: active,
      newClients: newC,
      churnedClients: churn,
      net: newC - churn,
      orders,
      revenue: orders * (38 + _rng() * 22),
    });
  }
  return days;
})();

const TOP_CLIENTS = [
  { initials:"AL", name:"Ana Lima",        orders:18, revenue:1240, freq:1.7, delta:+3, status:"active"  },
  { initials:"MV", name:"Marcos Vieira",   orders:15, revenue: 890, freq:2.0, delta:+1, status:"active"  },
  { initials:"JC", name:"Julia Costa",     orders:13, revenue:1560, freq:2.3, delta:+2, status:"active"  },
  { initials:"RA", name:"Roberto Alves",   orders:12, revenue: 720, freq:2.5, delta: 0, status:"active"  },
  { initials:"FS", name:"Fernanda Souza",  orders:11, revenue: 980, freq:2.7, delta:-1, status:"at-risk" },
  { initials:"CM", name:"Carlos Mendes",   orders: 9, revenue: 540, freq:3.3, delta:-2, status:"at-risk" },
  { initials:"PG", name:"Patricia Gomes",  orders: 8, revenue: 670, freq:3.7, delta:+1, status:"active"  },
];

const AT_RISK = [
  { initials:"BM", name:"Beatriz Moraes",  days:16, totalOrders: 8 },
  { initials:"DR", name:"Diego Ribeiro",   days:19, totalOrders: 5 },
  { initials:"CT", name:"Camila Torres",   days:22, totalOrders:12 },
  { initials:"LF", name:"Lucas Ferreira",  days:14, totalOrders: 9 },
];

function calcPeriodStats(data: DayData[]) {
  const newTotal   = data.reduce((s, d) => s + d.newClients, 0);
  const churnTotal = data.reduce((s, d) => s + d.churnedClients, 0);
  const net        = newTotal - churnTotal;
  const start      = data[0].activeClients - data[0].net;
  const end        = data[data.length - 1].activeClients;
  const rawRet     = Math.max(0, 100 - (churnTotal / Math.max(start, 1) * 100));
  return {
    activeNow: end, activeStart: start, newTotal, churnTotal, net,
    isGrowing: net >= 0,
    retention: Math.min(99.9, rawRet).toFixed(1),
    avgOrdersPerClient: (data.reduce((s, d) => s + d.orders, 0) / end).toFixed(1),
    netPct: ((Math.abs(net) / Math.max(start, 1)) * 100).toFixed(1),
  };
}

function fmtNum(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function getPeriodDates(days: number) {
  const now = new Date();
  const MS  = 86_400_000;
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start:     fmt(new Date(now.getTime() - (days - 1) * MS)),
    end:       fmt(now),
    prevStart: fmt(new Date(now.getTime() - (days * 2 - 1) * MS)),
    prevEnd:   fmt(new Date(now.getTime() - days * MS)),
  };
}

// ── Date range ────────────────────────────────────────────────────────────────
type DateRange = {
  startDate: string; endDate: string;
  prevStartDate: string; prevEndDate: string;
  label: string;
};

const MS_DAY = 86_400_000;
const ET_TZ = "America/New_York";

// All "what date is it" logic uses ET so the calendar matches Florida's day boundary.
function fmtD(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET_TZ }).format(d);
}
// Adds n days to a YYYY-MM-DD string. Uses UTC noon internally to avoid DST
// edge cases when new Date("YYYY-MM-DD") parses as UTC midnight.
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string { return fmtD(new Date()); }
// Parse a YYYY-MM-DD string to { year, month (0-based), day } without Date tz issues.
function parseDateStr(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

function makeDateRange(start: string, end: string, label: string): DateRange {
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / MS_DAY) + 1;
  return { startDate: start, endDate: end, prevStartDate: addDays(start, -days), prevEndDate: addDays(start, -1), label };
}
function relRange(days: number, label: string): DateRange {
  const end = todayStr();
  return makeDateRange(addDays(end, -(days - 1)), end, label);
}

const PRESETS: { label: string; make: () => DateRange }[] = [
  { label: "Últimos 7 dias",  make: () => relRange(7,  "Últimos 7 dias") },
  { label: "Últimos 14 dias", make: () => relRange(14, "Últimos 14 dias") },
  { label: "Últimos 30 dias", make: () => relRange(30, "Últimos 30 dias") },
  { label: "Últimos 90 dias", make: () => relRange(90, "Últimos 90 dias") },
  { label: "Este mês", make: () => {
    const today = todayStr();
    const [y, m] = today.split("-");
    return makeDateRange(`${y}-${m}-01`, today, "Este mês");
  }},
  { label: "Mês passado", make: () => {
    const today = todayStr();
    const [y, mo] = today.split("-").map(Number);
    const prevMo = mo === 1 ? 12 : mo - 1;
    const prevY  = mo === 1 ? y - 1 : y;
    const daysInPrev = new Date(Date.UTC(y, mo - 1, 0)).getUTCDate();
    const start = `${prevY}-${String(prevMo).padStart(2,"0")}-01`;
    const end   = `${prevY}-${String(prevMo).padStart(2,"0")}-${String(daysInPrev).padStart(2,"0")}`;
    return makeDateRange(start, end, "Mês passado");
  }},
];

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAY_HEADS = ["D","S","T","Q","Q","S","S"];

function CalendarMonth({ year, month, selStart, selEnd, onDayPress }: {
  year: number; month: number;
  selStart: string | null; selEnd: string | null;
  onDayPress: (d: string) => void;
}) {
  const today = todayStr();
  const offset = new Date(year, month, 1).getDay();
  const total  = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {DAY_HEADS.map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 9.5, color: D.faint }}>{h}</Text>
          </View>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: "row", marginBottom: 2 }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (!day) return <View key={col} style={{ flex: 1 }} />;
            const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isStart  = ds === selStart;
            const isEnd    = ds === selEnd;
            const inRange  = !!(selStart && selEnd && ds > selStart && ds < selEnd);
            const isToday  = ds === today;
            const isFuture = ds > today;
            return (
              <Pressable key={col} onPress={() => !isFuture && onDayPress(ds)}
                style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
                <View style={[
                  { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
                  (isStart || isEnd) && { backgroundColor: D.zippy },
                  inRange && { backgroundColor: "rgba(255,61,20,0.15)", borderRadius: 0 },
                ]}>
                  <Text style={[
                    { fontFamily: "GeistMono_400Regular", fontSize: 11.5, color: isFuture ? D.vfaint : D.text },
                    (isStart || isEnd) && { fontFamily: "GeistMono_700Bold", color: "#fff" },
                    inRange && { color: D.zippy },
                    isToday && !isStart && !isEnd && { color: D.zippy },
                  ]}>{day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen]         = useState(false);
  const [tmpStart, setTmpStart] = useState<string | null>(null);
  const [tmpEnd,   setTmpEnd]   = useState<string | null>(null);
  const [calYear,  setCalYear]  = useState(() => parseDateStr(todayStr()).year);
  const [calMonth, setCalMonth] = useState(() => parseDateStr(todayStr()).month);

  function handleOpen() {
    setTmpStart(value.startDate);
    setTmpEnd(value.endDate);
    const { year, month } = parseDateStr(value.endDate);
    setCalYear(year);
    setCalMonth(month);
    setOpen(true);
  }

  function handleDay(ds: string) {
    if (!tmpStart || (tmpStart && tmpEnd)) { setTmpStart(ds); setTmpEnd(null); }
    else if (ds < tmpStart) { setTmpEnd(tmpStart); setTmpStart(ds); }
    else { setTmpEnd(ds); }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    const { year: etY, month: etM } = parseDateStr(todayStr());
    if (calYear > etY || (calYear === etY && calMonth >= etM)) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  function handleApply() {
    if (!tmpStart || !tmpEnd) return;
    const fmt = (s: string) => { const [, m, d] = s.split("-"); return `${d}/${m}`; };
    onChange(makeDateRange(tmpStart, tmpEnd, `${fmt(tmpStart)} – ${fmt(tmpEnd)}`));
    setOpen(false);
  }

  const canApply = !!(tmpStart && tmpEnd);
  const selInfo  = tmpStart && !tmpEnd ? `De: ${tmpStart.slice(5).replace("-","/")}` : tmpStart && tmpEnd ? `${tmpStart.slice(5).replace("-","/")} → ${tmpEnd.slice(5).replace("-","/")}` : "Selecione o início";

  return (
    <>
      <Pressable onPress={handleOpen} style={[s.periodBtn, s.periodBtnActive, { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10 }]}>
        <Text style={[s.periodBtnText, s.periodBtnTextActive]}>{value.label}</Text>
        <Text style={{ color: D.faint, fontSize: 11 }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center" }} onPress={() => setOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ width: 640, backgroundColor: D.surf, borderRadius: 16, borderWidth: 1, borderColor: D.lineS, overflow: "hidden" }}>
            {/* Modal header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: D.line }}>
              <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 10, letterSpacing: 1.6, color: D.faint }}>SELECIONAR PERÍODO</Text>
              <Pressable onPress={() => setOpen(false)} style={{ padding: 4 }}>
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path d="M6 6l12 12M18 6L6 18" stroke={D.faint} strokeWidth={2.5} strokeLinecap="round" fill="none" />
                </Svg>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row" }}>
              {/* Presets */}
              <View style={{ width: 190, borderRightWidth: 1, borderRightColor: D.line, paddingVertical: 8, paddingHorizontal: 6 }}>
                {PRESETS.map(p => {
                  const active = value.label === p.label;
                  return (
                    <Pressable key={p.label} onPress={() => { onChange(p.make()); setOpen(false); }}
                      style={({ pressed }) => [
                        { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, marginBottom: 1 },
                        active && { backgroundColor: "rgba(255,61,20,0.12)" },
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text style={{ fontFamily: "Geist_400Regular", fontSize: 12.5, color: active ? D.zippy : D.dim }}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Calendar */}
              <View style={{ flex: 1, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <Pressable onPress={prevMonth} style={{ padding: 6 }}>
                    <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 14, color: D.faint }}>‹</Text>
                  </Pressable>
                  <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 10.5, letterSpacing: 1.4, color: D.text }}>
                    {MONTH_NAMES[calMonth].toUpperCase()} {calYear}
                  </Text>
                  <Pressable onPress={nextMonth} style={{ padding: 6 }}>
                    <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 14, color: D.faint }}>›</Text>
                  </Pressable>
                </View>

                <CalendarMonth year={calYear} month={calMonth} selStart={tmpStart} selEnd={tmpEnd} onDayPress={handleDay} />

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: D.line }}>
                  <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.faint }}>{selInfo}</Text>
                  <Pressable onPress={handleApply} disabled={!canApply}
                    style={{ backgroundColor: canApply ? D.zippy : D.surf2, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 10.5, letterSpacing: 0.8, color: canApply ? "#fff" : D.vfaint }}>APLICAR</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Pulse animation hook ───────────────────────────────────────────────────────
function usePulse(lo = 0.55, hi = 1, duration = 1800) {
  const anim = useRef(new Animated.Value(lo)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: hi, duration: duration / 2, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(anim, { toValue: lo, duration: duration / 2, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return anim;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color = D.green, width = 54, height = 20 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data);
  const range = mx - mn || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - mn) / range) * (height - 3) - 1.5,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `sp${color.replace(/[^a-z0-9]/gi, '')}${width}`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <SvgGrad id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </SvgGrad>
      </Defs>
      <Path d={area} fill={`url(#${id})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Trend chart (active clients line) ─────────────────────────────────────────
const TREND_Y_W = 46;

function TrendChart({ data, width, height }: { data: DayData[]; width: number; height: number }) {
  if (width === 0 || height === 0 || data.length === 0) return null;
  const vals = data.map(d => d.activeClients);
  const mn = Math.floor(Math.min(...vals) * 0.97);
  const mx = Math.ceil(Math.max(...vals) * 1.03);
  const chartW = width - TREND_Y_W;
  const spacing = chartW / data.length;
  const step = Math.ceil(data.length / 5);
  const chartData = data.map((d, i) => ({
    value: d.activeClients,
    label: (i % step === 0 || i === data.length - 1) ? d.label : "",
    hideDataPoint: true,
  }));

  return (
    <LineChart
      areaChart
      data={chartData}
      height={height - 24}
      width={chartW}
      spacing={spacing}
      curved
      color={D.green}
      thickness={2.2}
      startFillColor={D.green}
      endFillColor={D.green}
      startOpacity={0.15}
      endOpacity={0.01}
      noOfSections={5}
      maxValue={mx}
      minValue={mn}
      rulesType="dashed"
      rulesColor={D.line}
      rulesThickness={0.8}
      yAxisColor="transparent"
      xAxisColor="transparent"
      yAxisLabelWidth={TREND_Y_W}
      formatYLabel={(v: string) => fmtNum(Math.round(Number(v)))}
      yAxisTextStyle={{ color: D.faint, fontSize: 9, fontFamily: "GeistMono_400Regular" } as any}
      xAxisLabelTextStyle={{ color: D.faint, fontSize: 9, fontFamily: "GeistMono_400Regular" } as any}
      backgroundColor="transparent"
      initialSpacing={0}
      endSpacing={0}
      disableScroll
    />
  );
}

// ── Net flow chart (daily net bars) ───────────────────────────────────────────
function NetFlowChart({ data, width, height }: { data: DayData[]; width: number; height: number }) {
  if (width === 0 || height === 0) return null;
  const PAD = { t: 8, r: 8, b: 24, l: 8 };
  const cW = width - PAD.l - PAD.r, cH = height - PAD.t - PAD.b;
  const nets = data.map(d => d.net);
  const absMax = Math.max(...nets.map(Math.abs), 1);
  const mid = PAD.t + cH / 2;
  const barW = (cW / data.length) * 0.72;
  const bx = (i: number) => PAD.l + (i + 0.5) * (cW / data.length) - barW / 2;
  const bh = (v: number) => (Math.abs(v) / absMax) * (cH / 2 - 2);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <SvgLine x1={PAD.l} y1={mid} x2={width - PAD.r} y2={mid} stroke={D.lineS} strokeWidth={1} />
      {data.map((d, i) => {
        const isPos = d.net >= 0, bH = Math.max(bh(d.net), 1), by = isPos ? mid - bH : mid;
        return (
          <SvgRect key={i} x={bx(i)} y={by} width={barW} height={bH} rx={2}
            fill={isPos ? D.green : D.zippy} opacity={isPos ? 0.78 : 0.72} />
        );
      })}
      {data.filter((_, i) => i % 4 === 0).map((d, i) => (
        <SvgText key={i} x={bx(data.indexOf(d)) + barW / 2} y={height - 5}
          textAnchor="middle" fill={D.vfaint} fontSize={8} fontFamily="GeistMono_400Regular">
          {d.label}
        </SvgText>
      ))}
    </Svg>
  );
}

const REV_Y_W = 56;

// ── Revenue line chart ─────────────────────────────────────────────────────────
function RevenueLineChart({ data, width, height, onPointFocus }: {
  data: { revenue: number; label: string }[];
  width: number; height: number;
  onPointFocus?: (v: { value: number; label: string } | null) => void;
}) {
  if (width === 0 || height === 0 || data.length === 0) return null;
  const vals = data.map(d => d.revenue);
  const mn = Math.floor(Math.min(...vals) * 0.92 / 100) * 100;
  const mx = Math.ceil(Math.max(...vals)  * 1.06 / 100) * 100;
  const chartW = width - REV_Y_W;
  const initialSpacing = 12;
  const endSpacing = 20;
  const spacing = (chartW - initialSpacing - endSpacing) / Math.max(data.length - 1, 1);
  const step = Math.ceil(data.length / 5);
  const lastFocusedVal = useRef<number | null>(null);
  const chartData = data.map((d, i) => ({
    value: d.revenue,
    label: (i % step === 0 || i === data.length - 1) ? d.label : "",
    dataLabel: d.label,
    hideDataPoint: true,
  }));

  return (
    <LineChart
      areaChart
      data={chartData}
      height={height - 24}
      width={chartW}
      spacing={spacing}
      curved
      color={D.amber}
      thickness={2.2}
      startFillColor={D.amber}
      endFillColor={D.amber}
      startOpacity={0.18}
      endOpacity={0.01}
      noOfSections={4}
      maxValue={mx}
      minValue={mn}
      rulesType="dashed"
      rulesColor={D.line}
      rulesThickness={0.8}
      yAxisColor="transparent"
      xAxisColor="transparent"
      yAxisLabelWidth={REV_Y_W}
      formatYLabel={(v: string) => { const n = Number(v); return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`; }}
      yAxisTextStyle={{ color: D.faint, fontSize: 9, fontFamily: "GeistMono_400Regular" } as any}
      xAxisLabelTextStyle={{ color: D.faint, fontSize: 9, fontFamily: "GeistMono_400Regular" } as any}
      backgroundColor="transparent"
      initialSpacing={initialSpacing}
      endSpacing={endSpacing}
      disableScroll
      pointerConfig={{
        pointerColor: D.amber,
        showPointerStrip: true,
        pointerStripColor: `${D.amber}40`,
        pointerStripWidth: 1,
        pointerStripHeight: height - 48,
        pointerLabelWidth: 0,
        pointerLabelHeight: 0,
        activatePointersOnLongPress: false,
        pointerLabelComponent: (items: any[]) => {
          const item = items[0];
          if (item && lastFocusedVal.current !== item.value) {
            lastFocusedVal.current = item.value;
            setTimeout(() => onPointFocus?.({ value: item.value, label: item.dataLabel ?? item.label ?? "" }), 0);
          }
          return null;
        },
      }}
    />
  );
}

// ── Order bars chart ──────────────────────────────────────────────────────────
function OrderBarsChart({ data, width, height }: { data: { orders: number; label: string; isWknd: boolean }[]; width: number; height: number }) {
  if (width === 0 || height === 0) return null;
  const PAD = { t: 8, r: 10, b: 24, l: 10 };
  const cW = width - PAD.l - PAD.r, cH = height - PAD.t - PAD.b;
  const maxO = Math.max(...data.map(d => d.orders));
  const barW = (cW / data.length) * 0.65;
  const bx = (i: number) => PAD.l + (i + 0.5) * (cW / data.length) - barW / 2;
  const xS = data.filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <SvgLine x1={PAD.l} y1={height - PAD.b} x2={width - PAD.r} y2={height - PAD.b} stroke={D.line} strokeWidth={1} />
      {data.map((d, i) => {
        const bH = (d.orders / maxO) * cH, by = height - PAD.b - bH;
        return (
          <SvgRect key={i} x={bx(i)} y={by} width={barW} height={Math.max(bH, 1)} rx={2}
            fill={d.isWknd ? D.blue : D.zippy} opacity={0.65} />
        );
      })}
      {xS.map((d, i) => (
        <SvgText key={i} x={bx(data.indexOf(d)) + barW / 2} y={height - 5}
          textAnchor="middle" fill={D.vfaint} fontSize={8.5} fontFamily="GeistMono_400Regular">
          {d.label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Day of week bars ──────────────────────────────────────────────────────────
function DayOfWeekBars({ data }: { data: DayData[] }) {
  const buckets = Array(7).fill(null).map(() => ({ s: 0, c: 0 }));
  data.forEach(d => { const w = d.date.getDay(); buckets[w].s += d.orders; buckets[w].c++; });
  const avgs = buckets.map((x, i) => ({ l: DAY_NAMES[i], v: x.c > 0 ? x.s / x.c : 0, w: i === 0 || i === 6 }));
  const mx = Math.max(...avgs.map(a => a.v), 1);

  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", height: 60 }}>
      {avgs.map(({ l, v, w }) => (
        <View key={l} style={{ flex: 1, alignItems: "center", gap: 5 }}>
          <View style={{
            width: "100%", borderRadius: 4,
            backgroundColor: w ? D.blue : D.zippy,
            opacity: v > 0 ? 0.65 : 0.2,
            height: Math.max((v / mx) * 44, 4),
          }} />
          <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 8.5, color: w ? D.blue : D.faint }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Delivery heatmap ──────────────────────────────────────────────────────────
function DeliveryHeatmap() {
  const hrs = Array.from({ length: 24 }, (_, i) => i);
  const rngH = makeRng(4521);
  const heat = DAY_NAMES.map((_, di) => hrs.map(hi => {
    const b = (di === 0 || di === 6) ? 0.3 : 0.1;
    const p = ((hi >= 11 && hi <= 14) || (hi >= 18 && hi <= 21)) ? 0.5 : 0;
    return Math.min(1, b + p + rngH() * 0.3);
  }));
  const cellColor = (v: number) => v > 0.7 ? D.zippy : v > 0.45 ? D.amber : v > 0.2 ? D.blue : D.surf3;

  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: "row", gap: 2, marginLeft: 30 }}>
        {hrs.filter(h => h % 2 === 0).map(h => (
          <View key={h} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 7.5, color: D.vfaint }}>
              {String(h).padStart(2, '0')}h
            </Text>
          </View>
        ))}
      </View>
      {DAY_NAMES.map((day, di) => (
        <View key={day} style={{ flexDirection: "row", gap: 2, alignItems: "center", flex: 1 }}>
          <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 8.5, color: D.faint, width: 26 }}>{day}</Text>
          {hrs.map(hi => {
            const v = heat[di][hi];
            return (
              <View key={hi} style={{
                flex: 1, borderRadius: 2, minHeight: 16,
                backgroundColor: cellColor(v),
                opacity: 0.15 + v * 0.75,
              }} />
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        {[{ c: D.surf3, l: "Baixo" }, { c: D.blue, l: "Médio" }, { c: D.amber, l: "Alto" }, { c: D.zippy, l: "Pico" }].map(({ c, l }) => (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c, opacity: 0.7 }} />
            <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 8.5, color: D.faint }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, deltaVal, deltaIsGood, sparkData, sparkColor, accentOverride, style }: {
  label: string; value: string | number; sub?: string;
  deltaVal?: string; deltaIsGood?: boolean;
  sparkData?: number[]; sparkColor?: string; accentOverride?: string;
  style?: object;
}) {
  const col = accentOverride || (deltaIsGood ? D.green : D.zippy);
  const deltaBg = deltaIsGood ? "rgba(52,211,154,0.10)" : "rgba(255,61,20,0.10)";
  const deltaBr = deltaIsGood ? "rgba(52,211,154,0.22)" : "rgba(255,61,20,0.22)";
  const arrow = deltaIsGood ? "▲" : "▼";

  return (
    <View style={[s.kpiCard, style as any]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={s.kpiLabel}>{label}</Text>
        {sparkData && <Sparkline data={sparkData} color={sparkColor || D.green} width={54} height={20} />}
      </View>
      <Text style={[s.kpiValue, { color: D.text }]}>{value}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {deltaVal !== undefined && (
          <View style={[s.deltaBadge, { backgroundColor: deltaBg, borderColor: deltaBr }]}>
            <Text style={[s.deltaText, { color: col }]}>{arrow} {deltaVal}</Text>
          </View>
        )}
        {sub && <Text style={s.kpiSub}>{sub}</Text>}
      </View>
    </View>
  );
}

// ── Gaining / Losing hero ─────────────────────────────────────────────────────
function GainingLosingHero({ stats, periodLabel }: { stats: ReturnType<typeof calcPeriodStats>; periodLabel: string }) {
  const growing = stats.isGrowing;
  const accent  = growing ? D.green  : D.zippy;
  const accentBg = growing ? "rgba(52,211,154,0.07)" : "rgba(255,61,20,0.07)";
  const accentBr = growing ? "rgba(52,211,154,0.18)" : "rgba(255,61,20,0.18)";
  const pulse = usePulse(0.55, 1, 1600);
  const badgeScale = usePulse(1, 1.03, 3500);

  return (
    <View style={[s.heroCard, { borderColor: accentBr }]}>
      {/* Ambient glow */}
      <View style={{ position: "absolute", top: -60, right: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: accent, opacity: 0.05 }} pointerEvents="none" />

      <Text style={s.heroKicker}>PULSO DE CLIENTES · {periodLabel}</Text>

      {/* Status badge */}
      <Animated.View style={[s.heroBadge, { backgroundColor: accentBg, borderColor: accentBr, transform: [{ scale: badgeScale }] }]}>
        <Animated.View style={[s.heroDot, { backgroundColor: accent, opacity: pulse }]} />
        <Text style={[s.heroBadgeText, { color: accent }]}>{growing ? "CRESCENDO" : "PERDENDO"}</Text>
      </Animated.View>

      {/* Big number */}
      <Text style={[s.heroNum, { color: accent }]}>
        {growing ? "+" : "-"}{Math.abs(stats.net)}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 22 }}>
        <Text style={s.heroSubLabel}>clientes no período</Text>
        <View style={[s.heroNetPill, { backgroundColor: accentBg, borderColor: accentBr }]}>
          <Text style={[s.heroNetPillText, { color: accent }]}>
            {growing ? "+" : "-"}{stats.netPct}%
          </Text>
        </View>
      </View>

      {/* Breakdown */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View style={s.heroBreakdownNew}>
          <Text style={s.heroBreakdownLabelNew}>NOVOS</Text>
          <Text style={[s.heroBreakdownNum, { color: D.green }]}>+{stats.newTotal}</Text>
        </View>
        <View style={s.heroBreakdownChurn}>
          <Text style={s.heroBreakdownLabelChurn}>PERDIDOS</Text>
          <Text style={[s.heroBreakdownNum, { color: D.zippy }]}>-{stats.churnTotal}</Text>
        </View>
      </View>

      {/* Retention bar */}
      <View style={[s.heroRetBar, { marginTop: "auto" as any }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={s.heroRetLabel}>Taxa de Retenção</Text>
          <Text style={s.heroRetValue}>{stats.retention}%</Text>
        </View>
        <View style={s.heroRetTrack}>
          <View style={[s.heroRetFill, { width: `${stats.retention}%` as any }]} />
        </View>
      </View>
    </View>
  );
}

// ── Trend card ────────────────────────────────────────────────────────────────
function TrendCard({ data, periodLabel }: { data: DayData[]; periodLabel: string }) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const last = data[data.length - 1], first = data[0];
  const delta = last.activeClients - first.activeClients;
  const isPos = delta >= 0;

  return (
    <View style={s.trendCard}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <View>
          <Text style={s.chartTitle}>CLIENTES ATIVOS — TENDÊNCIA</Text>
          <Text style={s.chartSubtitle}>Evolução diária · {periodLabel}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 20, height: 2, backgroundColor: D.green, borderRadius: 1 }} />
            <Text style={s.chartLegend}>Clientes ativos</Text>
          </View>
          <View style={[s.deltaChip, { backgroundColor: isPos ? "rgba(52,211,154,0.10)" : "rgba(255,61,20,0.10)", borderColor: isPos ? "rgba(52,211,154,0.22)" : "rgba(255,61,20,0.22)" }]}>
            <Text style={[s.deltaChipText, { color: isPos ? D.green : D.zippy }]}>
              {isPos ? "+" : ""}{delta} vs início
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }} onLayout={e => setDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <TrendChart data={data} width={dims.w} height={dims.h} />
      </View>
    </View>
  );
}

// ── Net flow card ─────────────────────────────────────────────────────────────
function NetFlowCard({ data }: { data: DayData[] }) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const pos = data.filter(d => d.net >= 0).length;
  const neg = data.length - pos;

  return (
    <View style={s.netFlowCard}>
      <View style={{ marginBottom: 10 }}>
        <Text style={s.chartTitle}>FLUXO LÍQUIDO DIÁRIO</Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", marginTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: D.green, opacity: 0.8 }} />
            <Text style={s.chartLegend}>{pos}d positivos</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: D.zippy, opacity: 0.75 }} />
            <Text style={s.chartLegend}>{neg}d negativos</Text>
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }} onLayout={e => setDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <NetFlowChart data={data} width={dims.w} height={dims.h} />
      </View>
    </View>
  );
}

// ── Top clients table ─────────────────────────────────────────────────────────
function TopClientsTable({ clients }: { clients: typeof TOP_CLIENTS }) {
  return (
    <View style={s.tableCard}>
      <View style={s.tableHeader}>
        <Text style={s.tableHeaderTitle}>TOP CLIENTES · 30 DIAS</Text>
        <Text style={s.tableHeaderSub}>por volume de pedidos</Text>
      </View>
      <View style={[s.tableRowGrid, { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: D.line }]}>
        {["Cliente", "Pedidos", "Receita", "Freq.", "Δ"].map((h, i) => (
          <Text key={h} style={[s.tableColHeader, i > 0 && { textAlign: "right" }]}>{h}</Text>
        ))}
      </View>
      <ScrollView style={{ flex: 1 }}>
        {clients.map((c, i) => {
          const isRisk = c.status === "at-risk";
          const dCol = c.delta > 0 ? D.green : c.delta < 0 ? D.zippy : D.faint;
          return (
            <View key={i} style={[s.tableRowGrid, s.tableRow, isRisk && { backgroundColor: "rgba(255,61,20,0.025)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <View style={[s.clientAvatar, {
                  backgroundColor: isRisk ? "rgba(255,61,20,0.14)" : "rgba(52,211,154,0.10)",
                  borderColor: isRisk ? "rgba(255,61,20,0.25)" : "rgba(52,211,154,0.18)",
                }]}>
                  <Text style={[s.clientAvatarText, { color: isRisk ? D.zippy : D.green }]}>{c.initials}</Text>
                </View>
                <View>
                  <Text style={s.clientName}>{c.name}</Text>
                  {isRisk && <Text style={s.clientRiskLabel}>EM RISCO</Text>}
                </View>
              </View>
              <Text style={[s.tableCell, { textAlign: "right", fontSize: 13, fontWeight: "600", color: D.text }]}>{c.orders}</Text>
              <Text style={[s.tableCell, { textAlign: "right", fontSize: 11.5, color: D.dim }]}>${fmtNum(c.revenue)}</Text>
              <Text style={[s.tableCell, { textAlign: "right", fontSize: 11 }]}>{c.freq}d</Text>
              <Text style={[s.tableCell, { textAlign: "right", fontSize: 11, fontWeight: "700", color: dCol }]}>
                {c.delta > 0 ? `+${c.delta}` : c.delta < 0 ? String(c.delta) : "—"}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── At-risk panel ─────────────────────────────────────────────────────────────
function AtRiskPanel({ clients, stats }: { clients: typeof AT_RISK; stats: ReturnType<typeof calcPeriodStats> }) {
  return (
    <View style={s.tableCard}>
      <View style={s.tableHeader}>
        <Text style={s.tableHeaderTitle}>CLIENTES EM RISCO</Text>
        <View style={s.riskTotalBadge}>
          <Text style={s.riskTotalText}>23 total</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={{ flexDirection: "row", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: D.line }}>
        {[
          { val:"23", label:"14+ dias", col:D.amber, bg:"rgba(242,179,56,0.08)", br:"rgba(242,179,56,0.18)" },
          { val:"8",  label:"30+ dias", col:D.zippy, bg:"rgba(255,61,20,0.08)",  br:"rgba(255,61,20,0.18)"  },
          { val:stats.avgOrdersPerClient, label:"ped/cli", col:D.text, bg:"rgba(250,245,238,0.04)", br:D.line },
        ].map(({ val, label, col, bg, br }) => (
          <View key={label} style={[s.riskSummaryCell, { backgroundColor: bg, borderColor: br }]}>
            <Text style={[s.riskSummaryNum, { color: col }]}>{val}</Text>
            <Text style={[s.riskSummaryLabel, { color: col }]}>{label.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }}>
        {clients.map((c, i) => {
          const col = c.days > 20 ? D.zippy : D.amber;
          const bg  = c.days > 20 ? "rgba(255,61,20,0.10)" : "rgba(242,179,56,0.10)";
          const br  = c.days > 20 ? "rgba(255,61,20,0.22)" : "rgba(242,179,56,0.22)";
          return (
            <View key={i} style={s.riskRow}>
              <View style={[s.riskAvatar, { backgroundColor: c.days > 20 ? "rgba(255,61,20,0.12)" : "rgba(242,179,56,0.12)", borderColor: br }]}>
                <Text style={[s.riskAvatarText, { color: col }]}>{c.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.clientName}>{c.name}</Text>
                <Text style={[s.tableCell, { fontSize: 10, color: D.faint }]}>{c.totalOrders} pedidos históricos</Text>
              </View>
              <View style={[s.riskDaysBadge, { backgroundColor: bg, borderColor: br }]}>
                <Text style={[s.riskDaysBadgeText, { color: col }]}>{c.days}d sem pedir</Text>
              </View>
            </View>
          );
        })}

        {/* Reactivation tip */}
        <View style={{ padding: 12 }}>
          <View style={s.riskTip}>
            <View style={s.riskTipIcon}>
              <Text style={{ color: D.amber, fontSize: 14 }}>🔔</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.riskTipTitle}>Sugestão de reativação</Text>
              <Text style={s.riskTipBody}>Envie cupom de $10 para os 23 clientes inativos. ROI estimado: 3-4x.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Clientes tab ──────────────────────────────────────────────────────────────
function ClientesTab({ periodData, periodLabel, stats }: {
  periodData: DayData[]; periodLabel: string; stats: ReturnType<typeof calcPeriodStats>;
}) {
  const sparkActive = periodData.slice(-10).map(d => d.activeClients);
  const sparkNew    = periodData.slice(-10).map(d => d.newClients);
  const sparkChurn  = periodData.slice(-10).map(d => d.churnedClients);
  const sparkNet    = periodData.slice(-10).map(d => d.net + 10);
  const newPct   = ((stats.newTotal / Math.max(stats.activeStart, 1)) * 100).toFixed(1);
  const churnPct = ((stats.churnTotal / Math.max(stats.activeStart, 1)) * 100).toFixed(1);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabContent}>
      {/* Row 1 — KPI strip */}
      <View style={{ flexDirection: "row", gap: 10, flexShrink: 0 }}>
        <KPICard label="Clientes Ativos" value={fmtNum(stats.activeNow)}
          deltaVal={`${((stats.activeNow - stats.activeStart) / Math.max(stats.activeStart, 1) * 100).toFixed(1)}%`}
          deltaIsGood={stats.isGrowing} sub="base atual" sparkData={sparkActive} sparkColor={D.green} style={{ flex: 1.3 }} />
        <KPICard label={`Novos`} value={`+${stats.newTotal}`}
          deltaVal={`${newPct}%`} deltaIsGood={true} sub="do total" sparkData={sparkNew} sparkColor={D.green} style={{ flex: 1 }} />
        <KPICard label="Churn" value={`-${stats.churnTotal}`}
          deltaVal={`${churnPct}%`} deltaIsGood={false} sub="taxa de saída" sparkData={sparkChurn} sparkColor={D.zippy} style={{ flex: 1 }} />
        <KPICard label="Saldo Líquido" value={`${stats.net >= 0 ? "+" : ""}${stats.net}`}
          deltaVal={`${stats.netPct}%`} deltaIsGood={stats.isGrowing} sub="crescimento"
          sparkData={sparkNet} sparkColor={stats.isGrowing ? D.green : D.zippy} style={{ flex: 1 }} />
        <KPICard label="Retenção" value={`${stats.retention}%`}
          deltaVal="1.2%" deltaIsGood={true} sub="fidelização"
          sparkData={sparkActive.map((v, i) => v - i * 0.5)} sparkColor={D.blue} accentOverride={D.blue} style={{ flex: 1 }} />
        <KPICard label="Ped. / Cliente" value={stats.avgOrdersPerClient}
          deltaVal="0.3%" deltaIsGood={true} sub="últimos 30d"
          sparkData={sparkNet} sparkColor={D.amber} accentOverride={D.amber} style={{ flex: 1 }} />
      </View>

      {/* Row 2 — Hero + Trend */}
      <View style={{ flexDirection: "row", gap: 11, height: 340, flexShrink: 0 }}>
        <View style={{ width: 264, flexShrink: 0 }}>
          <GainingLosingHero stats={stats} periodLabel={periodLabel} />
        </View>
        <TrendCard data={periodData} periodLabel={periodLabel} />
      </View>

      {/* Row 3 — Flow + Table + Risk */}
      <View style={{ flexDirection: "row", gap: 11, height: 360 }}>
        <View style={{ width: 264, flexShrink: 0 }}>
          <NetFlowCard data={periodData} />
        </View>
        <View style={{ flex: 1.4 }}>
          <TopClientsTable clients={TOP_CLIENTS} />
        </View>
        <View style={{ flex: 1 }}>
          <AtRiskPanel clients={AT_RISK} stats={stats} />
        </View>
      </View>
    </ScrollView>
  );
}

// ── Financial tab ─────────────────────────────────────────────────────────────
function FinancialTab({ salesData, prevSalesData, loading, error, periodLabel }: {
  salesData: SalesAnalyticsResponse | null;
  prevSalesData: SalesAnalyticsResponse | null;
  loading: boolean;
  error: string | null;
  periodLabel: string;
}) {
  const [revDims, setRevDims] = useState({ w: 0, h: 0 });
  const [ordDims, setOrdDims] = useState({ w: 0, h: 0 });
  const [revFocused, setRevFocused] = useState<{ value: number; label: string } | null>(null);

  if (loading || !salesData) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: D.bg }}>
        <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 11, letterSpacing: 4, color: D.faint }}>
          {error ? error.toUpperCase() : "CARREGANDO…"}
        </Text>
      </View>
    );
  }

  const totRev  = salesData.receitaTotal / 100;
  const avgTick = salesData.ticketMedio / 100;
  const totOrd  = salesData.totalPedidos;
  const dayCount = Math.max(salesData.evolucaoReceita.length, 1);
  const revDay  = totRev / dayCount;

  const prevRev  = (prevSalesData?.receitaTotal ?? 0) / 100;
  const prevOrd  = prevSalesData?.totalPedidos ?? 0;
  const prevTick = (prevSalesData?.ticketMedio ?? 0) / 100;
  const revPct   = prevRev > 0 ? ((totRev - prevRev) / prevRev * 100) : 0;
  const ordPct   = prevOrd > 0 ? ((totOrd - prevOrd) / prevOrd * 100) : 0;
  const tickPct  = prevTick > 0 ? ((avgTick - prevTick) / prevTick * 100) : 0;
  const isUp     = revPct >= 0;

  const revChartData = salesData.evolucaoReceita.map(r => {
    const [, m, d] = r.date.split('-').map(Number);
    return { revenue: r.receita / 100, label: `${d}/${m}` };
  });

  const ordChartData = salesData.volumePedidos.map(r => {
    const [y, m, d] = r.date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return { orders: r.pedidos, label: `${d}/${m}`, isWknd: dow === 5 || dow === 6 };
  });

  const sparkR = revChartData.slice(-10).map(d => d.revenue);
  const sparkO = ordChartData.slice(-10).map(d => d.orders);
  const sparkT = revChartData.slice(-10).map((r, i) => {
    const o = ordChartData[ordChartData.length - 10 + i]?.orders ?? 1;
    return o > 0 ? r.revenue / o : 0;
  });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabContent}>
      {/* KPI strip */}
      <View style={{ flexDirection: "row", gap: 10, flexShrink: 0 }}>
        <KPICard label="Receita Total"  value={fmtCurrency(totRev)}
          deltaVal={prevRev > 0 ? `${Math.abs(revPct).toFixed(1)}%` : undefined} deltaIsGood={isUp}
          sub="vs período ant." sparkData={sparkR} sparkColor={D.amber} accentOverride={D.amber} style={{ flex: 1.3 }} />
        <KPICard label="Ticket Médio"   value={`$${avgTick.toFixed(0)}`}
          deltaVal={prevTick > 0 ? `${Math.abs(tickPct).toFixed(1)}%` : undefined} deltaIsGood={tickPct >= 0}
          sub="por pedido" sparkData={sparkT} sparkColor={D.amber} accentOverride={D.amber} style={{ flex: 1 }} />
        <KPICard label="Total Pedidos"  value={fmtNum(totOrd)}
          deltaVal={prevOrd > 0 ? `${Math.abs(ordPct).toFixed(1)}%` : undefined} deltaIsGood={ordPct >= 0}
          sub={periodLabel.toLowerCase()} sparkData={sparkO} sparkColor={D.blue} accentOverride={D.blue} style={{ flex: 1 }} />
        <KPICard label="Receita / Dia"  value={fmtCurrency(revDay)}
          sub="média diária" sparkData={sparkR} sparkColor={D.green} style={{ flex: 1 }} />
      </View>

      {/* Charts side by side */}
      <View style={{ flexDirection: "row", gap: 11, height: 260 }}>
        <View style={[s.chartCard, { flex: 1 }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <View>
              <Text style={s.chartTitle}>EVOLUÇÃO DA RECEITA</Text>
              <Text style={s.chartSubtitle}>Receita diária · {periodLabel}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {revFocused && (
                <View style={[s.deltaChip, { backgroundColor: "rgba(242,179,56,0.10)", borderColor: "rgba(242,179,56,0.30)" }]}>
                  <Text style={[s.deltaChipText, { color: D.amber }]}>
                    {revFocused.value >= 1000
                      ? `$${(revFocused.value / 1000).toFixed(1)}k`
                      : `$${revFocused.value.toFixed(0)}`}
                    {revFocused.label ? `  ${revFocused.label}` : ""}
                  </Text>
                </View>
              )}
              {!revFocused && prevRev > 0 && (
                <View style={[s.deltaChip, { backgroundColor: isUp ? "rgba(52,211,154,0.10)" : "rgba(255,61,20,0.10)", borderColor: isUp ? "rgba(52,211,154,0.22)" : "rgba(255,61,20,0.22)" }]}>
                  <Text style={[s.deltaChipText, { color: isUp ? D.green : D.zippy }]}>{isUp ? "+" : ""}{revPct.toFixed(1)}% vs ant.</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ flex: 1 }} onLayout={e => setRevDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <RevenueLineChart data={revChartData} width={revDims.w} height={revDims.h} onPointFocus={setRevFocused} />
          </View>
        </View>

        <View style={[s.chartCard, { flex: 1 }]}>
          <Text style={[s.chartTitle, { marginBottom: 10 }]}>VOLUME DE PEDIDOS · {periodLabel}</Text>
          <View style={{ flex: 1 }} onLayout={e => setOrdDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <OrderBarsChart data={ordChartData} width={ordDims.w} height={ordDims.h} />
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            {[{ c: D.zippy, l: "Dias de semana" }, { c: D.blue, l: "Fins de semana" }].map(({ c, l }) => (
              <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c, opacity: 0.65 }} />
                <Text style={s.chartLegend}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

    </ScrollView>
  );
}

// ── Pedidos tab ───────────────────────────────────────────────────────────────
function PedidosTab({ periodData, periodLabel }: { periodData: DayData[]; periodLabel: string }) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const totOrd = periodData.reduce((s, d) => s + d.orders, 0);
  const avgOrd = totOrd / periodData.length;
  const maxDay = periodData.reduce((b, d) => d.orders > b.orders ? d : b, periodData[0]);
  const minDay = periodData.reduce((b, d) => d.orders < b.orders ? d : b, periodData[0]);
  const sparkO = periodData.slice(-10).map(d => d.orders);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabContent}>
      <View style={{ flexDirection: "row", gap: 10, flexShrink: 0 }}>
        <KPICard label="Total Pedidos"   value={fmtNum(totOrd)}        deltaVal="4.3%"  deltaIsGood={true}  sub={periodLabel.toLowerCase()}   sparkData={sparkO} sparkColor={D.blue}  accentOverride={D.blue}  style={{ flex: 1.3 }} />
        <KPICard label="Média / Dia"     value={Math.round(avgOrd)}    deltaVal="2.1%"  deltaIsGood={true}  sub="pedidos diários"              sparkData={sparkO} sparkColor={D.blue}  accentOverride={D.blue}  style={{ flex: 1 }} />
        <KPICard label="Melhor Dia"      value={maxDay.orders}         deltaVal="pico"  deltaIsGood={true}  sub={maxDay.label}                 sparkData={sparkO} sparkColor={D.green}                          style={{ flex: 1 }} />
        <KPICard label="Dia Mais Fraco"  value={minDay.orders}         deltaVal="baixo" deltaIsGood={false} sub={minDay.label}                 sparkData={sparkO} sparkColor={D.zippy}                          style={{ flex: 1 }} />
        <KPICard label="Taxa de Entrega" value="97.3%"                 deltaVal="0.4%"  deltaIsGood={true}  sub="pedidos entregues"
          sparkData={[96.8,97,97.1,97.2,97.2,97.3,97.3,97.3,97.3,97.3]} sparkColor={D.green} style={{ flex: 1 }} />
      </View>

      <View style={[s.chartCard, { height: 260 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <View>
            <Text style={s.chartTitle}>VOLUME DIÁRIO DE PEDIDOS</Text>
            <Text style={s.chartSubtitle}>Pedidos por dia · {periodLabel}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[{ c: D.zippy, l: "Dias de semana" }, { c: D.blue, l: "Fins de semana" }].map(({ c, l }) => (
              <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c, opacity: 0.65 }} />
                <Text style={s.chartLegend}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }} onLayout={e => setDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          <OrderBarsChart
            data={periodData.map(d => ({ orders: d.orders, label: d.label, isWknd: d.date.getDay() === 5 || d.date.getDay() === 6 }))}
            width={dims.w} height={dims.h}
          />
        </View>
      </View>

      <View style={[s.chartCard, { flexShrink: 0 }]}>
        <Text style={[s.chartTitle, { marginBottom: 12 }]}>MÉDIA POR DIA DA SEMANA</Text>
        <DayOfWeekBars data={periodData} />
      </View>
    </ScrollView>
  );
}

// ── Operações tab ─────────────────────────────────────────────────────────────
function OperacoesTab() {
  const metrics = [
    { l:"Tempo Médio Entrega",  v:"28 min", t:"≤ 30 min", ok:true,  s:"no prazo"  },
    { l:"Taxa de Conclusão",    v:"97.3%",  t:"≥ 95%",    ok:true,  s:"entregues" },
    { l:"Avaliação Média",      v:"4.7 ★",  t:"≥ 4.5",    ok:true,  s:"estrelas"  },
    { l:"Entregadores Ativos",  v:"142",    t:"≥ 130",    ok:true,  s:"hoje"      },
    { l:"Cancelamentos",        v:"2.7%",   t:"≤ 3%",     ok:true,  s:"taxa"      },
    { l:"Atraso Crítico",       v:"0.4%",   t:"≤ 1%",     ok:true,  s:"> 45 min"  },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabContent}>
      <View style={{ flexDirection: "row", gap: 10, flexShrink: 0 }}>
        {metrics.map(m => (
          <View key={m.l} style={[s.kpiCard, { flex: 1 }]}>
            <Text style={[s.kpiLabel, { marginBottom: 6 }]}>{m.l}</Text>
            <Text style={[s.kpiValue, { color: D.text, marginBottom: 8 }]}>{m.v}</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={[s.deltaBadge, {
                backgroundColor: m.ok ? "rgba(52,211,154,0.10)" : "rgba(255,61,20,0.10)",
                borderColor: m.ok ? "rgba(52,211,154,0.22)" : "rgba(255,61,20,0.22)",
              }]}>
                <Text style={[s.deltaText, { color: m.ok ? D.green : D.zippy }]}>META {m.t}</Text>
              </View>
              <Text style={s.kpiSub}>{m.s}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={[s.chartCard, { height: 280 }]}>
        <Text style={[s.chartTitle, { marginBottom: 12 }]}>MAPA DE CALOR · VOLUME DE ENTREGAS POR HORÁRIO</Text>
        <DeliveryHeatmap />
      </View>
    </ScrollView>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TABS = [
  // { id: "clientes",   label: "Radar de Clientes" },
  { id: "financeiro", label: "Financeiro"         },
  // { id: "pedidos",    label: "Pedidos"             },
  // { id: "operacoes",  label: "Operações"           },
] as const;

function AnalyticsBar({ activeTab, setActiveTab, dateRange, setDateRange }: {
  activeTab: string; setActiveTab: (t: string) => void;
  dateRange: DateRange; setDateRange: (r: DateRange) => void;
}) {
  return (
    <View style={s.analyticsBar}>
      <View style={{ flexDirection: "row", alignItems: "stretch", flex: 1 }}>
        {TABS.map(tab => {
          const on = activeTab === tab.id;
          return (
            <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[s.tabBtn, on && s.tabBtnActive]}>
              <Text style={[s.tabBtnText, on && s.tabBtnTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <DateRangePicker value={dateRange} onChange={setDateRange} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MetricsScreen() {
  const { signOut, owner, token, businesses, selectedBusinessId, selectBusiness } = useAuth();
  const [activeTab,  setActiveTab]  = useState("financeiro");
  const [dateRange,  setDateRange]  = useState<DateRange>(() => relRange(7, "Últimos 7 dias"));

  const periodDays  = Math.round((new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime()) / MS_DAY) + 1;
  const periodLabel = dateRange.label.toUpperCase();
  const periodData  = HISTORY.slice(-Math.min(periodDays, HISTORY.length));
  const stats = useMemo(() => calcPeriodStats(periodData), [periodDays]);

  const [salesData,     setSalesData]     = useState<SalesAnalyticsResponse | null>(null);
  const [prevSalesData, setPrevSalesData] = useState<SalesAnalyticsResponse | null>(null);
  const [salesLoading,  setSalesLoading]  = useState(false);
  const [salesError,    setSalesError]    = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setSalesLoading(true);
    setSalesError(null);
    setSalesData(null);
    setPrevSalesData(null);
    Promise.all([
      fetchSalesAnalytics(token, dateRange.startDate, dateRange.endDate),
      fetchSalesAnalytics(token, dateRange.prevStartDate, dateRange.prevEndDate),
    ]).then(([cur, prev]) => {
      setSalesData(cur);
      setPrevSalesData(prev);
    }).catch(e => {
      setSalesError(e instanceof Error ? e.message : "Erro ao carregar dados");
    }).finally(() => {
      setSalesLoading(false);
    });
  }, [token, dateRange.startDate, dateRange.endDate]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top", "bottom"]}>
      <TabletTopBar
        mode="inner"
        pageTitle="Radar de Clientes"
        pageSubtitle="ANÁLISE DA BASE"
        onBack={() => router.back()}
        backLabel="Início"
        userInitial={(owner?.name ?? "G").charAt(0).toUpperCase()}
        onAvatarPress={() => void signOut()}
      />
      <AnalyticsBar activeTab={activeTab} setActiveTab={setActiveTab} dateRange={dateRange} setDateRange={setDateRange} />

      {/* {activeTab === "clientes"   && <ClientesTab  periodData={periodData} periodLabel={periodLabel} stats={stats} />} */}
      {activeTab === "financeiro" && (
        <FinancialTab
          salesData={salesData}
          prevSalesData={prevSalesData}
          loading={salesLoading}
          error={salesError}
          periodLabel={periodLabel}
        />
      )}
      {/* {activeTab === "pedidos"    && <PedidosTab    periodData={periodData} periodLabel={periodLabel} />} */}
      {/* {activeTab === "operacoes"  && <OperacoesTab />} */}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Tab bar
  analyticsBar: {
    height: 44, flexShrink: 0,
    backgroundColor: D.surf, borderBottomWidth: 1, borderBottomColor: D.line,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 16,
  },
  tabBtn: {
    paddingHorizontal: 16, alignItems: "center", justifyContent: "center",
    borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1, height: 44,
  },
  tabBtnActive: { borderBottomColor: D.zippy },
  tabBtnText:       { fontSize: 12.5, fontFamily: "Geist_400Regular", color: D.faint, letterSpacing: -0.2 },
  tabBtnTextActive: { fontFamily: "Geist_600SemiBold", color: D.text },
  periodBtn:           { paddingHorizontal: 13, paddingVertical: 4, borderRadius: 6 },
  periodBtnActive:     { backgroundColor: D.surf3 },
  periodBtnText:       { fontSize: 11.5, fontFamily: "Geist_400Regular", color: D.faint, letterSpacing: -0.1 },
  periodBtnTextActive: { fontFamily: "Geist_600SemiBold", color: D.text },

  // Tab content
  tabContent: {
    backgroundColor: D.bg,
    padding: 14, gap: 11,
  },

  // KPI card
  kpiCard: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.line,
    borderRadius: 12, padding: 14, gap: 7,
  },
  kpiLabel: { fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 1.4, color: D.faint, textTransform: "uppercase" },
  kpiValue: { fontFamily: "GeistMono_700Bold", fontSize: 27, letterSpacing: -1, lineHeight: 27 },
  kpiSub:   { fontSize: 11, color: D.faint },
  deltaBadge: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  deltaText:  { fontFamily: "GeistMono_700Bold", fontSize: 9.5, letterSpacing: 0.4 },

  // Hero card
  heroCard: {
    backgroundColor: D.surf, borderWidth: 1.5,
    borderRadius: 14, padding: 20,
    flexDirection: "column", flex: 1, overflow: "hidden", position: "relative",
  },
  heroKicker:    { fontFamily: "GeistMono_400Regular", fontSize: 8.5, letterSpacing: 1.8, color: D.faint, textTransform: "uppercase", marginBottom: 16 },
  heroBadge:     { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 20 },
  heroDot:       { width: 8, height: 8, borderRadius: 4 },
  heroBadgeText: { fontFamily: "GeistMono_700Bold", fontSize: 12, letterSpacing: 1.6 },
  heroNum:       { fontFamily: "GeistMono_700Bold", fontSize: 60, letterSpacing: -3, lineHeight: 60, marginBottom: 6 },
  heroSubLabel:  { fontSize: 13, color: D.dim, fontWeight: "500" },
  heroNetPill:   { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 1 },
  heroNetPillText: { fontFamily: "GeistMono_400Regular", fontSize: 10 },
  heroBreakdownNew: {
    flex: 1, backgroundColor: "rgba(52,211,154,0.07)", borderWidth: 1,
    borderColor: "rgba(52,211,154,0.15)", borderRadius: 10, padding: 11,
  },
  heroBreakdownChurn: {
    flex: 1, backgroundColor: "rgba(255,61,20,0.07)", borderWidth: 1,
    borderColor: "rgba(255,61,20,0.15)", borderRadius: 10, padding: 11,
  },
  heroBreakdownLabelNew:   { fontFamily: "GeistMono_400Regular", fontSize: 8.5, letterSpacing: 1.2, color: "rgba(52,211,154,0.55)", textTransform: "uppercase", marginBottom: 5 },
  heroBreakdownLabelChurn: { fontFamily: "GeistMono_400Regular", fontSize: 8.5, letterSpacing: 1.2, color: "rgba(255,61,20,0.55)", textTransform: "uppercase", marginBottom: 5 },
  heroBreakdownNum: { fontFamily: "GeistMono_700Bold", fontSize: 26, letterSpacing: -1, lineHeight: 26 },
  heroRetBar:   { backgroundColor: D.surf2, borderRadius: 10, padding: 12 },
  heroRetLabel: { fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 1.2, color: D.faint, textTransform: "uppercase" },
  heroRetValue: { fontFamily: "GeistMono_700Bold", fontSize: 18, letterSpacing: -0.8, color: D.text },
  heroRetTrack: { height: 4, backgroundColor: D.surf3, borderRadius: 2, overflow: "hidden" },
  heroRetFill:  { height: "100%", borderRadius: 2, backgroundColor: D.green },

  // Chart containers
  trendCard: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.line,
    borderRadius: 14, padding: 16, flexDirection: "column", flex: 1,
  },
  netFlowCard: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.line,
    borderRadius: 14, padding: 16, flexDirection: "column", flex: 1,
  },
  chartCard: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.line,
    borderRadius: 14, padding: 16,
  },
  chartTitle:    { fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 1.4, color: D.faint, textTransform: "uppercase" },
  chartSubtitle: { fontSize: 11.5, color: D.vfaint, marginTop: 3 },
  chartLegend:   { fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.faint },
  deltaChip: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3 },
  deltaChipText: { fontFamily: "GeistMono_700Bold", fontSize: 10.5, letterSpacing: 0.2 },

  // Table
  tableCard: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.line,
    borderRadius: 14, overflow: "hidden", flex: 1,
  },
  tableHeader: {
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: D.line,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  tableHeaderTitle: { fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 1.4, color: D.faint, textTransform: "uppercase" },
  tableHeaderSub:   { fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.vfaint },
  tableRowGrid: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16,
    columnGap: 8,
  },
  tableColHeader: { flex: 1, fontFamily: "GeistMono_400Regular", fontSize: 8.5, color: D.vfaint, letterSpacing: 1 },
  tableRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: D.line },
  tableCell: { flex: 1, fontFamily: "GeistMono_400Regular", color: D.faint },
  clientAvatar: {
    width: 27, height: 27, borderRadius: 7,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  clientAvatarText: { fontFamily: "GeistMono_700Bold", fontSize: 9, fontWeight: "700" },
  clientName:       { fontSize: 12.5, fontWeight: "600", color: D.text, letterSpacing: -0.1 },
  clientRiskLabel:  { fontFamily: "GeistMono_400Regular", fontSize: 8.5, color: D.zippy, letterSpacing: 0.7 },

  // At-risk
  riskTotalBadge: {
    backgroundColor: "rgba(242,179,56,0.12)", borderWidth: 1, borderColor: "rgba(242,179,56,0.25)",
    borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2,
  },
  riskTotalText:    { fontFamily: "GeistMono_700Bold", fontSize: 9, color: D.amber },
  riskSummaryCell:  { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, alignItems: "center" },
  riskSummaryNum:   { fontFamily: "GeistMono_700Bold", fontSize: 19, lineHeight: 19, fontWeight: "700" },
  riskSummaryLabel: { fontFamily: "GeistMono_400Regular", fontSize: 8.5, opacity: 0.6, letterSpacing: 0.8, marginTop: 3, textTransform: "uppercase" },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: D.line },
  riskAvatar: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  riskAvatarText:   { fontFamily: "GeistMono_700Bold", fontSize: 9.5, fontWeight: "700" },
  riskDaysBadge:    { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  riskDaysBadgeText:{ fontFamily: "GeistMono_700Bold", fontSize: 10, fontWeight: "700" },
  riskTip: {
    backgroundColor: "rgba(242,179,56,0.06)", borderWidth: 1, borderColor: "rgba(242,179,56,0.15)",
    borderRadius: 8, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 10,
  },
  riskTipIcon:  { width: 24, height: 24, borderRadius: 6, backgroundColor: "rgba(242,179,56,0.14)", alignItems: "center", justifyContent: "center" },
  riskTipTitle: { fontSize: 11.5, fontWeight: "600", color: D.amber, marginBottom: 2 },
  riskTipBody:  { fontSize: 11, color: D.faint, lineHeight: 16 },
});
