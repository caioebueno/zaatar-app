import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

// ── Design tokens (shared palette) ────────────────────────────────────────────
const D = {
  bg:    "#0a0807",
  surf:  "#181310",
  surf2: "#1e1812",
  surf3: "#2a211b",
  line:  "rgba(250,245,238,0.08)",
  lineS: "rgba(250,245,238,0.14)",
  text:  "#faf5ee",
  dim:   "rgba(250,245,238,0.58)",
  faint: "rgba(250,245,238,0.28)",
  vfaint:"rgba(250,245,238,0.12)",
  zippy: "#ff3d14",
};

// ── Types ──────────────────────────────────────────────────────────────────────
export type DateRange = {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  label: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const MS_DAY = 86_400_000;
function fmtD(d: Date) { return d.toISOString().slice(0, 10); }
export function addDays(dateStr: string, n: number) { return fmtD(new Date(new Date(dateStr).getTime() + n * MS_DAY)); }
export function todayStr() { return fmtD(new Date()); }

export function makeDateRange(start: string, end: string, label: string): DateRange {
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / MS_DAY) + 1;
  return { startDate: start, endDate: end, prevStartDate: addDays(start, -days), prevEndDate: addDays(start, -1), label };
}

export function relRange(days: number, label: string): DateRange {
  const end = todayStr();
  return makeDateRange(addDays(end, -(days - 1)), end, label);
}

const PRESETS: { label: string; make: () => DateRange }[] = [
  { label: "Últimos 7 dias",  make: () => relRange(7,  "Últimos 7 dias")  },
  { label: "Últimos 14 dias", make: () => relRange(14, "Últimos 14 dias") },
  { label: "Últimos 30 dias", make: () => relRange(30, "Últimos 30 dias") },
  { label: "Últimos 90 dias", make: () => relRange(90, "Últimos 90 dias") },
  { label: "Este mês", make: () => {
    const now = new Date();
    return makeDateRange(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`, todayStr(), "Este mês");
  }},
  { label: "Mês passado", make: () => {
    const last = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
    const start = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,"0")}-01`;
    return makeDateRange(start, fmtD(last), "Mês passado");
  }},
];

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAY_HEADS   = ["D","S","T","Q","Q","S","S"];

// ── Calendar month grid ────────────────────────────────────────────────────────
function CalendarMonth({ year, month, selStart, selEnd, onDayPress }: {
  year: number; month: number;
  selStart: string | null; selEnd: string | null;
  onDayPress: (d: string) => void;
}) {
  const today  = todayStr();
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
            const ds       = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

// ── Date range picker ──────────────────────────────────────────────────────────
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open,     setOpen]     = useState(false);
  const [tmpStart, setTmpStart] = useState<string | null>(null);
  const [tmpEnd,   setTmpEnd]   = useState<string | null>(null);
  const [calYear,  setCalYear]  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  function handleOpen() {
    setTmpStart(value.startDate);
    setTmpEnd(value.endDate);
    const d = new Date(value.endDate);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
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
    const now = new Date();
    if (calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth())) return;
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
  const selInfo  = tmpStart && !tmpEnd
    ? `De: ${tmpStart.slice(5).replace("-", "/")}`
    : tmpStart && tmpEnd
      ? `${tmpStart.slice(5).replace("-", "/")} → ${tmpEnd.slice(5).replace("-", "/")}`
      : "Selecione o início";

  return (
    <>
      <Pressable onPress={handleOpen} style={{
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
        backgroundColor: D.surf3,
      }}>
        <Text style={{ fontSize: 11.5, fontFamily: "Geist_600SemiBold", color: D.text, letterSpacing: -0.1 }}>
          {value.label}
        </Text>
        <Text style={{ color: D.faint, fontSize: 11 }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center" }}
          onPress={() => setOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ width: 640, backgroundColor: D.surf, borderRadius: 16, borderWidth: 1, borderColor: D.lineS, overflow: "hidden" }}>

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: D.line }}>
              <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 10, letterSpacing: 1.6, color: D.faint }}>
                SELECIONAR PERÍODO
              </Text>
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
                        active  && { backgroundColor: "rgba(255,61,20,0.12)" },
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

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: D.line }}>
                  <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.faint }}>{selInfo}</Text>
                  <Pressable onPress={handleApply} disabled={!canApply}
                    style={{ backgroundColor: canApply ? D.zippy : D.surf2, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 10.5, letterSpacing: 0.8, color: canApply ? "#fff" : D.vfaint }}>
                      APLICAR
                    </Text>
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
