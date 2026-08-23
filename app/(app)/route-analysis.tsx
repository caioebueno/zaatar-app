import { DateRangePicker, relRange, type DateRange } from "@/components/DateRangePicker";
import { TabletTopBar } from "@/components/TabletTopBar";
import { useAuth } from "@/contexts/auth";
import {
  fetchDispatches,
  type DispatchEntity,
  type RoutePoint,
} from "@/services/dispatchApi";
import Mapbox, { Camera, CircleLayer, FillLayer, LineLayer, MapView, MarkerView, ShapeSource } from "@rnmapbox/maps";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
if (Platform.OS !== "web") Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

// ── Design tokens ──────────────────────────────────────────────────────────────
const D = {
  bg:       "#0a0807",
  ink:      "#0c0a08",
  surf:     "#181310",
  surf2:    "#1e1812",
  surf3:    "#2a211b",
  line:     "rgba(250,245,238,0.08)",
  lineS:    "rgba(250,245,238,0.14)",
  text:     "#faf5ee",
  dim:      "rgba(250,245,238,0.58)",
  faint:    "rgba(250,245,238,0.28)",
  vfaint:   "rgba(250,245,238,0.12)",
  zippy:    "#ff3d14",
  green:    "#34d39a",
  amber:    "#f2b338",
  mono:     "GeistMono_400Regular",
  monoBold: "GeistMono_700Bold",
};

// ── Types ──────────────────────────────────────────────────────────────────────
type Phase    = "waiting" | "en_route" | "diverted" | "stopped" | "at_delivery";
type LngLat   = [number, number]; // GeoJSON: [longitude, latitude]
type SvgPoint = { x: number; y: number }; // internal SVG-space only
type SvgGpsPoint = { x: number; y: number; phase: Phase }; // genTrack output
type GpsCoord    = { coord: LngLat; phase: Phase };

type Diversion =
  | { detected: false }
  | { detected: true; maxDeviationM: number; location: string; at: string };

type LongStop =
  | { detected: false }
  | { detected: true; durationMin: number; location: string; at: string };

type Dispatch = {
  id: string;
  date: string;
  driver: { name: string; initials: string; color: string };
  customer: string;
  address: string;
  dispatchedAt: string;
  leftPizzeriaAt: string;
  dispatchedAtIso?: string | null;
  leftPizzeriaAtIso?: string | null;
  arrivedAt: string;
  completedAt: string;
  departureDelay: number;
  elapsedSinceDispatch: number;
  routeDuration: number;
  routeExpected: number;
  dwellDuration: number;
  dwellExpected: number;
  diversion: Diversion;
  longStop: LongStop;
  deliveryCoord: LngLat;
  suggestedPath: LngLat[];
  gpsTrack: GpsCoord[];
  orderItems?: { customer: string; address: string; estimatedDeliveryDurationMinutes: number | null }[];
  estimatedRoundTripDurationMinutes?: number | null;
};

// ── Geo helpers ───────────────────────────────────────────────────────────────
function makeCirclePolygon(center: LngLat, radiusMeters: number, steps = 64): LngLat[] {
  const [lng, lat] = center;
  const latRad     = (lat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);
  const coords: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    coords.push([
      lng + (radiusMeters / mPerDegLng) * Math.sin(angle),
      lat + (radiusMeters / mPerDegLat) * Math.cos(angle),
    ]);
  }
  return coords;
}

// ── Seeded RNG ─────────────────────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ── GPS track generator (SVG-space, converted to lat/lng via gpsToGeoCoords) ──
type Segment = { waypoints: SvgPoint[]; count: number; noise?: number; phase: Phase };

function genTrack(segments: Segment[], seed: number): SvgGpsPoint[] {
  const rng = seededRng(seed);
  const pts: SvgGpsPoint[] = [];
  for (const seg of segments) {
    const wps = seg.waypoints;
    const n   = seg.count;
    for (let i = 0; i < n; i++) {
      const t      = n === 1 ? 0 : i / (n - 1);
      const totalT = t * (wps.length - 1);
      const idx    = Math.min(Math.floor(totalT), wps.length - 2);
      const lt     = totalT - idx;
      const x      = wps[idx].x + (wps[idx + 1].x - wps[idx].x) * lt;
      const y      = wps[idx].y + (wps[idx + 1].y - wps[idx].y) * lt;
      const nx     = seg.noise ?? 0;
      pts.push({
        x: Math.round(x + (rng() - 0.5) * nx * 2),
        y: Math.round(y + (rng() - 0.5) * nx * 2),
        phase: seg.phase,
      });
    }
  }
  return pts;
}

// ── Coordinate helpers ─────────────────────────────────────────────────────────
// São Paulo bounding box maps to the SVG 1040×900 space used for demo tracks.
// x: 0→-46.75 lng, 1040→-46.55 lng  |  y: 0→-23.45 lat, 900→-23.65 lat
const PIZZERIA_COORD: LngLat = [-81.65141320301387, 28.348631938056286];

function svgToLngLat(x: number, y: number): LngLat {
  // Maps the 1040×900 demo SVG canvas onto a ~2km box around the pizzeria
  const lngSpan = 0.020, latSpan = 0.018;
  const [baseLng, baseLat] = PIZZERIA_COORD;
  const pivotX = 180, pivotY = 560; // pizzeria position in SVG space
  return [
    baseLng + ((x - pivotX) / 1040) * lngSpan,
    baseLat - ((y - pivotY) / 900) * latSpan,
  ];
}

function gpsToGeoCoords(pts: SvgGpsPoint[]): GpsCoord[] {
  return pts.map(p => ({ coord: svgToLngLat(p.x, p.y), phase: p.phase }));
}

const TRAIL_INTERVAL_MS = 15_000; // one point per 15 s

// ── Map real API route points → GpsCoord[] with inferred phase ─────────────────
function routePointsToGpsCoords(
  points: RoutePoint[],
  startedAt: string | null | undefined,
  deliveredAt: string | null | undefined,
): GpsCoord[] {
  const sorted    = [...points].sort((a, b) => a.sequence - b.sequence);
  const startMs   = startedAt   ? new Date(startedAt).getTime()   : null;
  const deliverMs = deliveredAt ? new Date(deliveredAt).getTime() : null;

  // Downsample: keep at most one point per TRAIL_INTERVAL_MS window
  const sampled: RoutePoint[] = [];
  let lastKeptMs = -Infinity;
  for (const p of sorted) {
    const tMs = new Date(p.recordedAt).getTime();
    if (tMs - lastKeptMs >= TRAIL_INTERVAL_MS) {
      sampled.push(p);
      lastKeptMs = tMs;
    }
  }
  // Always include the last point so the trail reaches the final position
  if (sorted.length > 0 && sampled[sampled.length - 1] !== sorted[sorted.length - 1]) {
    sampled.push(sorted[sorted.length - 1]);
  }

  return sampled.map(p => {
    const tMs = new Date(p.recordedAt).getTime();
    let phase: Phase;
    if (startMs && tMs < startMs) {
      phase = "waiting";
    } else if (deliverMs && tMs >= deliverMs) {
      phase = "at_delivery";
    } else if (p.speedMps !== null && p.speedMps < 0.5) {
      phase = "stopped";
    } else {
      phase = "en_route";
    }
    return { coord: [p.lng, p.lat] as LngLat, phase };
  });
}

// ── Derive a stable color from a string (driver id) ───────────────────────────
function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palette = ["#c96442","#44804a","#2a6fbd","#8b4e8b","#7a6230","#3a7a72","#7a3a60"];
  return palette[h % palette.length];
}

// ── Format ISO datetime as HH:MM ───────────────────────────────────────────────
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}


// ── Format ISO date as DD/MM/YYYY ──────────────────────────────────────────────
function fmtDateKey(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}


// ── Map a DispatchEntity to the local Dispatch type ───────────────────────────
function mapApiDispatch(entity: DispatchEntity): Dispatch {
  const routePoints = entity.routePoints;
  const order       = entity.orders[0];
  const addr        = order?.deliveryAddress;
  const customer    = order?.customer?.name ?? "Cliente";
  const address     = addr ? `${addr.street}, ${addr.number}` : "—";

  const dispatchedAt   = fmtTime(entity.createdAt);
  const leftPizzeriaAt = fmtTime(entity.dispatchAt ?? entity.startedDeliveryAt);
  const arrivedAt      = fmtTime(order?.deliveredAt);
  const completedAt    = arrivedAt;

  const created   = new Date(entity.createdAt).getTime();
  const startedRaw = entity.dispatchAt ?? entity.startedDeliveryAt;
  const started   = startedRaw ? new Date(startedRaw).getTime() : null;
  const delivered = order?.deliveredAt ? new Date(order.deliveredAt).getTime() : null;

  const dispatchMs       = entity.dispatchAt ? new Date(entity.dispatchAt).getTime() : null;
  const leftRestaurantMs = entity.leftRestaurantAt ? new Date(entity.leftRestaurantAt).getTime() : null;
  const departureDelay   = started ? Math.max(0, Math.round((started - created) / 60000)) : 0;
  const elapsedSinceDispatch = dispatchMs
    ? Math.max(0, Math.round(((leftRestaurantMs ?? Date.now()) - dispatchMs) / 60000))
    : 0;
  const routeDuration  = (started && delivered) ? Math.max(1, Math.round((delivered - started) / 60000)) : 0;
  const routeExpected  = entity.estimatedDeliveryDurationMinutes ?? routeDuration;

  const driverName = entity.driver?.name ?? "Driver";
  const initials   = driverName.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
  const color      = hashColor(entity.driver?.id ?? entity.id);

  const lng = parseFloat(addr?.lng ?? "");
  const lat = parseFloat(addr?.lat ?? "");

  return {
    id: entity.id,
    date: fmtDateKey(entity.createdAt),
    driver: { name: driverName, initials, color },
    customer,
    address,
    dispatchedAt,
    leftPizzeriaAt,
    dispatchedAtIso: entity.createdAt,
    leftPizzeriaAtIso: entity.dispatchAt ?? entity.startedDeliveryAt ?? null,
    arrivedAt,
    completedAt,
    departureDelay,
    elapsedSinceDispatch,
    routeDuration,
    routeExpected,
    dwellDuration: 0,
    dwellExpected: 5,
    diversion: { detected: false },
    longStop:  { detected: false },
    deliveryCoord: [isFinite(lng) ? lng : PIZZERIA_COORD[0], isFinite(lat) ? lat : PIZZERIA_COORD[1]],
    suggestedPath: [],
    gpsTrack: routePoints && routePoints.length > 0
      ? routePointsToGpsCoords(routePoints, entity.dispatchAt ?? entity.startedDeliveryAt, order?.deliveredAt)
      : [],
    orderItems: entity.orders.map(o => ({
      customer: o.customer?.name ?? "—",
      address: o.deliveryAddress ? `${o.deliveryAddress.street}, ${o.deliveryAddress.number}` : "—",
      estimatedDeliveryDurationMinutes: o.estimatedDeliveryDurationMinutes,
    })),
    estimatedRoundTripDurationMinutes: entity.estimatedRoundTripDurationMinutes ?? null,
  };
}

// ── Build dispatch map from API response ──────────────────────────────────────
function buildDispatchMap(entities: DispatchEntity[]): Record<string, Dispatch[]> {
  const map: Record<string, Dispatch[]> = {};
  for (const e of entities) {
    const d = mapApiDispatch(e);
    if (!map[d.date]) map[d.date] = [];
    map[d.date].push(d);
  }
  return map;
}


// ── Placeholder so we never reach undefined state ─────────────────────────────
const EMPTY_DISPATCH_MAP: Record<string, Dispatch[]> = {};

// ── Static demo data (offline / API error fallback) ───────────────────────────
const DISPATCHES_14: Dispatch[] = [
  {
    id: "D-4831", date: "14/05/2026",
    driver: { name: "Paulo Silva", initials: "PS", color: "#c96442" },
    customer: "Beatriz Moraes", address: "R. Vergueiro, 1340",
    dispatchedAt: "21:00", leftPizzeriaAt: "21:08", arrivedAt: "21:31", completedAt: "21:43",
    departureDelay: 8, elapsedSinceDispatch: 23, routeDuration: 23, routeExpected: 18, dwellDuration: 12, dwellExpected: 5,
    diversion: { detected: true, maxDeviationM: 340, location: "Av. Paulista", at: "21:18" },
    longStop:  { detected: true, durationMin: 4, location: "R. Augusta", at: "21:22" },
    deliveryCoord: svgToLngLat(700, 175),
    suggestedPath: [[180,560],[260,470],[380,360],[520,255],[700,175]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:185,y:557}], count:10, noise:8, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:260,y:470},{x:378,y:362}], count:16, noise:6, phase:"en_route" },
      { waypoints:[{x:378,y:362},{x:460,y:362},{x:502,y:296},{x:502,y:232}], count:14, noise:7, phase:"diverted" },
      { waypoints:[{x:502,y:232},{x:505,y:235}], count:10, noise:6, phase:"stopped" },
      { waypoints:[{x:502,y:232},{x:600,y:202},{x:700,y:175}], count:14, noise:6, phase:"en_route" },
      { waypoints:[{x:700,y:175},{x:703,y:178}], count:10, noise:8, phase:"at_delivery" },
    ], 101)),
  },
  {
    id: "D-4829", date: "14/05/2026",
    driver: { name: "Jorge Oliveira", initials: "JO", color: "#44804a" },
    customer: "Ana Souza", address: "R. Ipiranga, 88",
    dispatchedAt: "20:55", leftPizzeriaAt: "20:57", arrivedAt: "21:13", completedAt: "21:18",
    departureDelay: 2, elapsedSinceDispatch: 16, routeDuration: 16, routeExpected: 16, dwellDuration: 5, dwellExpected: 5,
    diversion: { detected: false }, longStop: { detected: false },
    deliveryCoord: svgToLngLat(530, 680),
    suggestedPath: [[180,560],[280,600],[400,640],[530,680]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:183,y:561}], count:4, noise:5, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:280,y:600},{x:400,y:640},{x:530,y:680}], count:30, noise:5, phase:"en_route" },
      { waypoints:[{x:530,y:680},{x:533,y:682}], count:8, noise:7, phase:"at_delivery" },
    ], 202)),
  },
  {
    id: "D-4827", date: "14/05/2026",
    driver: { name: "Carla Santos", initials: "CS", color: "#2a6fbd" },
    customer: "Marina Costa", address: "Alameda Santos, 45",
    dispatchedAt: "20:48", leftPizzeriaAt: "20:53", arrivedAt: "21:14", completedAt: "21:19",
    departureDelay: 5, elapsedSinceDispatch: 21, routeDuration: 21, routeExpected: 16, dwellDuration: 5, dwellExpected: 5,
    diversion: { detected: false },
    longStop: { detected: true, durationMin: 3, location: "R. Oscar Freire", at: "21:04" },
    deliveryCoord: svgToLngLat(848, 316),
    suggestedPath: [[180,560],[380,480],[580,400],[848,316]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:184,y:558}], count:6, noise:6, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:380,y:480},{x:524,y:430}], count:18, noise:5, phase:"en_route" },
      { waypoints:[{x:524,y:430},{x:527,y:432}], count:9, noise:6, phase:"stopped" },
      { waypoints:[{x:524,y:430},{x:686,y:372},{x:848,y:316}], count:16, noise:5, phase:"en_route" },
      { waypoints:[{x:848,y:316},{x:851,y:319}], count:8, noise:7, phase:"at_delivery" },
    ], 303)),
  },
  {
    id: "D-4825", date: "14/05/2026",
    driver: { name: "Maria Fernandes", initials: "MF", color: "#8b4e8b" },
    customer: "Lucas Ferreira", address: "R. Bela Cintra, 450",
    dispatchedAt: "21:00", leftPizzeriaAt: "21:02", arrivedAt: "21:16", completedAt: "21:21",
    departureDelay: 2, elapsedSinceDispatch: 14, routeDuration: 14, routeExpected: 14, dwellDuration: 5, dwellExpected: 5,
    diversion: { detected: false }, longStop: { detected: false },
    deliveryCoord: svgToLngLat(375, 762),
    suggestedPath: [[180,560],[236,638],[308,700],[375,762]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:182,y:561}], count:3, noise:5, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:236,y:638},{x:308,y:700},{x:375,y:762}], count:24, noise:5, phase:"en_route" },
      { waypoints:[{x:375,y:762},{x:377,y:764}], count:8, noise:7, phase:"at_delivery" },
    ], 404)),
  },
];

const DISPATCHES_13: Dispatch[] = [
  {
    id: "D-4810", date: "13/05/2026",
    driver: { name: "Paulo Silva", initials: "PS", color: "#c96442" },
    customer: "Tatiana Ramos", address: "R. Vergueiro, 980",
    dispatchedAt: "21:10", leftPizzeriaAt: "21:13", arrivedAt: "21:28", completedAt: "21:34",
    departureDelay: 3, elapsedSinceDispatch: 15, routeDuration: 15, routeExpected: 14, dwellDuration: 6, dwellExpected: 5,
    diversion: { detected: false }, longStop: { detected: false },
    deliveryCoord: svgToLngLat(605, 256),
    suggestedPath: [[180,560],[320,440],[480,338],[605,256]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:183,y:559}], count:4, noise:5, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:320,y:440},{x:480,y:338},{x:605,y:256}], count:26, noise:5, phase:"en_route" },
      { waypoints:[{x:605,y:256},{x:608,y:258}], count:8, noise:7, phase:"at_delivery" },
    ], 505)),
  },
  {
    id: "D-4808", date: "13/05/2026",
    driver: { name: "Carla Santos", initials: "CS", color: "#2a6fbd" },
    customer: "Felipe Gomes", address: "R. Augusta, 1200",
    dispatchedAt: "20:40", leftPizzeriaAt: "20:41", arrivedAt: "20:57", completedAt: "21:01",
    departureDelay: 1, elapsedSinceDispatch: 16, routeDuration: 16, routeExpected: 15, dwellDuration: 4, dwellExpected: 5,
    diversion: { detected: false }, longStop: { detected: false },
    deliveryCoord: svgToLngLat(706, 524),
    suggestedPath: [[180,560],[360,545],[530,534],[706,524]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:182,y:560}], count:2, noise:5, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:360,y:545},{x:530,y:534},{x:706,y:524}], count:28, noise:5, phase:"en_route" },
      { waypoints:[{x:706,y:524},{x:708,y:526}], count:7, noise:7, phase:"at_delivery" },
    ], 606)),
  },
];

const DISPATCHES_12: Dispatch[] = [
  {
    id: "D-4790", date: "12/05/2026",
    driver: { name: "Jorge Oliveira", initials: "JO", color: "#44804a" },
    customer: "Helena Vieira", address: "Av. Brigadeiro, 400",
    dispatchedAt: "20:58", leftPizzeriaAt: "21:05", arrivedAt: "21:26", completedAt: "21:36",
    departureDelay: 7, elapsedSinceDispatch: 21, routeDuration: 21, routeExpected: 18, dwellDuration: 10, dwellExpected: 5,
    diversion: { detected: true, maxDeviationM: 220, location: "R. Consolação", at: "21:15" },
    longStop: { detected: false },
    deliveryCoord: svgToLngLat(766, 444),
    suggestedPath: [[180,560],[360,512],[544,474],[766,444]].map(([x,y]) => svgToLngLat(x,y)),
    gpsTrack: gpsToGeoCoords(genTrack([
      { waypoints:[{x:180,y:560},{x:185,y:558}], count:8, noise:7, phase:"waiting" },
      { waypoints:[{x:180,y:560},{x:360,y:512},{x:480,y:492}], count:14, noise:5, phase:"en_route" },
      { waypoints:[{x:480,y:492},{x:524,y:564},{x:604,y:522},{x:644,y:472}], count:14, noise:7, phase:"diverted" },
      { waypoints:[{x:644,y:472},{x:766,y:444}], count:10, noise:5, phase:"en_route" },
      { waypoints:[{x:766,y:444},{x:769,y:447}], count:10, noise:8, phase:"at_delivery" },
    ], 707)),
  },
];

// Demo fallback (offline / API error)
const DEMO_DISPATCH_MAP: Record<string, Dispatch[]> = {
  "14/05/2026": DISPATCHES_14,
  "13/05/2026": DISPATCHES_13,
  "12/05/2026": DISPATCHES_12,
};

const DEMO_AVAILABLE_DATES = [
  { label: "Hoje · 14/05",  value: "14/05/2026" },
  { label: "Ontem · 13/05", value: "13/05/2026" },
  { label: "12/05/2026",    value: "12/05/2026" },
];

function delayColor(min: number) {
  return min > 7 ? D.zippy : min > 3 ? D.amber : D.green;
}

function phaseColor(phase: Phase, driverColor: string): string {
  const map: Record<Phase, string> = {
    waiting:     "rgba(250,245,238,0.22)",
    en_route:    driverColor,
    diverted:    "#f2b338",
    stopped:     "#ff3d14",
    at_delivery: "#34d39a",
  };
  return map[phase];
}

// ── Group GPS coords by phase ──────────────────────────────────────────────────
type GpsPhaseSegment = { phase: Phase; pts: GpsCoord[] };
function groupByGpsPhase(pts: GpsCoord[]): GpsPhaseSegment[] {
  const segs: GpsPhaseSegment[] = [];
  let cur: GpsPhaseSegment | null = null;
  for (const pt of pts) {
    if (!cur || cur.phase !== pt.phase) {
      cur = { phase: pt.phase, pts: [] };
      segs.push(cur);
    }
    cur.pts.push(pt);
  }
  return segs;
}

// ── Mapbox marker views ────────────────────────────────────────────────────────
function PizzeriaMarkerView() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#ff3d14",
        alignItems: "center", justifyContent: "center",
        shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 }}>
        <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 13, color: "#fff" }}>P</Text>
      </View>
      <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 7, color: "rgba(255,61,20,0.70)",
        letterSpacing: 1.2, marginTop: 3 }}>PIZZERIA</Text>
    </View>
  );
}

function DeliveryMarkerView({ dispatch }: { dispatch: Dispatch }) {
  const { driver, customer } = dispatch;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: driver.color,
        alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }],
        shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 }}>
        <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 12, color: "#fff",
          transform: [{ rotate: "-45deg" }] }}>{customer[0]}</Text>
      </View>
      <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 7,
        color: `${driver.color}AA`, letterSpacing: 0.8, marginTop: 5 }}>DELIVERY</Text>
    </View>
  );
}

function DimDeliveryDotView({ dispatch }: { dispatch: Dispatch }) {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11,
      backgroundColor: "rgba(250,245,238,0.04)", borderWidth: 1,
      borderColor: "rgba(250,245,238,0.14)", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 8,
        color: "rgba(250,245,238,0.22)" }}>{dispatch.customer[0]}</Text>
    </View>
  );
}

function StopLabelView({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: "rgba(10,8,7,0.92)", borderWidth: 1,
      borderColor: "rgba(255,61,20,0.40)", borderRadius: 6,
      paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 9,
        color: "#ff3d14", letterSpacing: 0.6 }}>{text}</Text>
    </View>
  );
}

function DetourLabelView() {
  return (
    <View style={{ backgroundColor: "rgba(10,8,7,0.92)", borderWidth: 1,
      borderColor: "rgba(242,179,56,0.40)", borderRadius: 6,
      paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 9,
        color: "#f2b338", letterSpacing: 0.6 }}>DETOUR</Text>
    </View>
  );
}

// ── Web map (mapbox-gl JS) ─────────────────────────────────────────────────────
function WebRouteMap({ dispatch, allDispatches }: {
  dispatch: Dispatch | null;
  allDispatches: Dispatch[];
}) {
  const containerRef = useRef<any>(null);
  const mapRef       = useRef<any>(null);
  const readyRef     = useRef(false);
  // keep latest dispatch/allDispatches accessible inside the "load" callback
  const dispatchRef       = useRef(dispatch);
  const allDispatchesRef  = useRef(allDispatches);
  dispatchRef.current      = dispatch;
  allDispatchesRef.current = allDispatches;

  // Inject mapbox-gl CSS once
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("mapbox-gl-css")) return;
    const link = document.createElement("link");
    link.id   = "mapbox-gl-css";
    link.rel  = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
    document.head.appendChild(link);
  }, []);

  // Initialize map once — use ref so we get the actual DOM node
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mapboxgl = require("mapbox-gl");
    mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/dark-v11",
      center: PIZZERIA_COORD,
      zoom: 13,
      attributionControl: false,
      logoPosition: "bottom-right",
    });

    map.on("load", () => {
      readyRef.current = true;
      updateMap(map, dispatchRef.current, allDispatchesRef.current);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Update layers whenever dispatch/allDispatches changes
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    updateMap(mapRef.current, dispatch, allDispatches);
  }, [dispatch, allDispatches]);

  return (
    <View
      ref={containerRef}
      style={[StyleSheet.absoluteFill, { backgroundColor: D.bg }]}
    />
  );
}

function updateMap(map: any, dispatch: Dispatch | null, allDispatches: Dispatch[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mapboxgl = require("mapbox-gl");

  // Remove all existing custom markers stored on the map instance
  (map._raMarkers ?? []).forEach((m: any) => m.remove());
  map._raMarkers = [];

  const addMarker = (coord: LngLat, el: HTMLElement) => {
    const m = new mapboxgl.Marker({ element: el }).setLngLat(coord).addTo(map);
    map._raMarkers.push(m);
  };

  // Pizzeria marker
  const pizEl = document.createElement("div");
  pizEl.style.cssText = "width:28px;height:28px;border-radius:7px;background:#ff3d14;display:flex;align-items:center;justify-content:center;font-family:monospace;font-weight:700;font-size:12px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5);";
  pizEl.textContent = "P";
  addMarker(PIZZERIA_COORD, pizEl);

  const pts: LngLat[] = [PIZZERIA_COORD];

  if (dispatch) {
    // Delivery marker
    const delEl = document.createElement("div");
    delEl.style.cssText = `width:26px;height:26px;border-radius:5px;background:${dispatch.driver.color};display:flex;align-items:center;justify-content:center;font-family:monospace;font-weight:700;font-size:11px;color:#fff;transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,.5);`;
    delEl.innerHTML = `<span style="transform:rotate(-45deg)">${dispatch.customer[0]}</span>`;
    addMarker(dispatch.deliveryCoord, delEl);
    pts.push(dispatch.deliveryCoord);

    // GPS trail
    const trailCoords = dispatch.gpsTrack.map(p => p.coord);
    if (trailCoords.length > 1) {
      ["ra-trail-bg", "ra-trail"].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
      map.addSource("ra-trail-bg", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trailCoords } } });
      map.addLayer({ id: "ra-trail-bg", type: "line", source: "ra-trail-bg", paint: { "line-color": "rgba(250,245,238,0.08)", "line-width": 5 } });
      map.addSource("ra-trail", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trailCoords } } });
      map.addLayer({ id: "ra-trail", type: "line", source: "ra-trail", paint: { "line-color": dispatch.driver.color, "line-width": 2.5, "line-opacity": 0.8 } });
      trailCoords.forEach(c => pts.push(c));
    } else {
      ["ra-trail-bg", "ra-trail"].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
    }
  } else {
    // Overview: dim dots for all deliveries
    allDispatches.forEach(d => {
      const dotEl = document.createElement("div");
      dotEl.style.cssText = "width:20px;height:20px;border-radius:10px;background:rgba(250,245,238,0.04);border:1px solid rgba(250,245,238,0.14);display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:7px;font-weight:700;color:rgba(250,245,238,0.22);";
      dotEl.textContent = d.customer[0];
      addMarker(d.deliveryCoord, dotEl);
      pts.push(d.deliveryCoord);
    });
    ["ra-trail-bg", "ra-trail"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  // Fit bounds
  const lngs = pts.map(c => c[0]).filter(isFinite);
  const lats  = pts.map(c => c[1]).filter(isFinite);
  if (lngs.length > 1) {
    const PAD = 0.006;
    map.fitBounds(
      [[Math.min(...lngs) - PAD, Math.min(...lats) - PAD], [Math.max(...lngs) + PAD, Math.max(...lats) + PAD]],
      { padding: 80, animate: true, duration: 400 },
    );
  }
}

// ── Native Mapbox map (iOS / Android) ─────────────────────────────────────────
function NativeRouteMap({ dispatch, allDispatches }: {
  dispatch: Dispatch | null;
  allDispatches: Dispatch[];
}) {
  const phases    = dispatch ? groupByGpsPhase(dispatch.gpsTrack) : [];
  const hasTrack  = (dispatch?.gpsTrack.length ?? 0) > 0;
  const mapId     = dispatch?.id.replace(/\W/g, "") ?? "overview";

  // Fetch road-accurate route via OSRM when suggestedPath is absent
  const [computedPath, setComputedPath] = useState<LngLat[]>([]);
  useEffect(() => {
    if (!dispatch) { setComputedPath([]); return; }
    if (dispatch.suggestedPath.length > 1) { setComputedPath([]); return; }
    const [fromLng, fromLat] = PIZZERIA_COORD;
    const [toLng,   toLat  ] = dispatch.deliveryCoord;
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    fetch(url)
      .then(r => r.json())
      .then((data: { routes?: { geometry?: { coordinates?: LngLat[] } }[] }) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 1) {
          setComputedPath(coords);
        } else {
          setComputedPath([PIZZERIA_COORD, dispatch.deliveryCoord]);
        }
      })
      .catch(() => {
        setComputedPath([PIZZERIA_COORD, dispatch.deliveryCoord]);
      });
  }, [dispatch?.id]);

  const effectivePath = dispatch && dispatch.suggestedPath.length > 1
    ? dispatch.suggestedPath
    : computedPath;

  // Centroid of stopped GPS points (for long stop label)
  const longStop = dispatch?.longStop.detected ? dispatch.longStop : null;
  const stopPts  = dispatch?.gpsTrack.filter(p => p.phase === "stopped") ?? [];
  const stopCoord: LngLat | null = longStop && stopPts.length > 0
    ? [
        stopPts.reduce((s, p) => s + p.coord[0], 0) / stopPts.length,
        stopPts.reduce((s, p) => s + p.coord[1], 0) / stopPts.length,
      ]
    : null;

  // Centroid of diverted GPS points (for detour label)
  const diversion = dispatch?.diversion.detected ? dispatch.diversion : null;
  const divPts    = dispatch?.gpsTrack.filter(p => p.phase === "diverted") ?? [];
  const divCoord: LngLat | null = diversion && divPts.length > 0
    ? [
        divPts.reduce((s, p) => s + p.coord[0], 0) / divPts.length,
        divPts.reduce((s, p) => s + p.coord[1], 0) / divPts.length,
      ]
    : null;

  // Camera bounds
  const pts: LngLat[] = [PIZZERIA_COORD];
  if (dispatch) {
    pts.push(dispatch.deliveryCoord);
    dispatch.gpsTrack.forEach(p => pts.push(p.coord));
    effectivePath.forEach(c => pts.push(c));
  } else {
    allDispatches.forEach(d => pts.push(d.deliveryCoord));
  }
  const lngs = pts.map(c => c[0]).filter(isFinite);
  const lats  = pts.map(c => c[1]).filter(isFinite);
  const PAD   = 0.006;
  const boundsNE: LngLat = lngs.length > 0
    ? [Math.max(...lngs) + PAD, Math.max(...lats) + PAD]
    : [-46.60, -23.52];
  const boundsSW: LngLat = lngs.length > 0
    ? [Math.min(...lngs) - PAD, Math.min(...lats) - PAD]
    : [-46.78, -23.63];

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL="mapbox://styles/mapbox/dark-v11"
      logoEnabled={false}
      attributionEnabled={false}
      compassEnabled={false}
      scaleBarEnabled={false}
    >
      <Camera
        bounds={{ ne: boundsNE, sw: boundsSW,
          paddingTop: 80, paddingBottom: 80, paddingLeft: 60, paddingRight: 60 }}
        animationMode="flyTo"
        animationDuration={400}
      />

      {/* Suggested / computed route */}
      {dispatch && effectivePath.length > 1 && (
        <ShapeSource id={`${mapId}-sugg`} shape={{
          type: "Feature", properties: {},
          geometry: { type: "LineString", coordinates: effectivePath },
        }}>
          <LineLayer id={`${mapId}-sugg-bg`} style={{
            lineColor: "rgba(250,245,238,0.08)", lineWidth: 5, lineCap: "round",
          }} />
          <LineLayer id={`${mapId}-sugg-dash`} style={{
            lineColor: "rgba(250,245,238,0.25)", lineWidth: 1.5,
            lineDasharray: [8, 5], lineCap: "round",
          }} />
        </ShapeSource>
      )}

      {/* GPS trail — line per phase */}
      {hasTrack && phases.map((seg, si) => {
        if (seg.pts.length < 2) return null;
        const col = phaseColor(seg.phase, dispatch!.driver.color);
        return (
          <ShapeSource key={`${mapId}-line-${si}`} id={`${mapId}-line-${si}`} shape={{
            type: "Feature", properties: {},
            geometry: { type: "LineString", coordinates: seg.pts.map(p => p.coord) },
          }}>
            <LineLayer id={`${mapId}-ll-${si}`} style={{
              lineColor: col, lineWidth: 2.5,
              lineCap: "round", lineJoin: "round",
              lineOpacity: seg.phase === "waiting" ? 0.35 : 0.80,
            }} />
          </ShapeSource>
        );
      })}

      {/* GPS trail — dots per phase */}
      {hasTrack && phases.map((seg, si) => (
        <ShapeSource key={`${mapId}-dots-${si}`} id={`${mapId}-dots-${si}`} shape={{
          type: "FeatureCollection",
          features: seg.pts.map(p => ({
            type: "Feature" as const, properties: {},
            geometry: { type: "Point" as const, coordinates: p.coord },
          })),
        }}>
          <CircleLayer id={`${mapId}-cc-${si}`} style={{
            circleRadius: 3,
            circleColor: phaseColor(seg.phase, dispatch!.driver.color),
            circleOpacity: seg.phase === "waiting" ? 0.45 : 0.88,
          }} />
        </ShapeSource>
      ))}

      {/* Dim dots for unselected deliveries */}
      {!dispatch && allDispatches.map(d => (
        <MarkerView key={d.id} coordinate={d.deliveryCoord} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <DimDeliveryDotView dispatch={d} />
        </MarkerView>
      ))}

      {/* Selected delivery marker */}
      {dispatch && (
        <MarkerView coordinate={dispatch.deliveryCoord} anchor={{ x: 0.5, y: 1 }} allowOverlap>
          <DeliveryMarkerView dispatch={dispatch} />
        </MarkerView>
      )}

      {/* Long stop label */}
      {longStop && stopCoord && (
        <MarkerView coordinate={stopCoord} anchor={{ x: 0.5, y: 1.3 }} allowOverlap>
          <StopLabelView text={`STOP · ${'durationMin' in longStop ? longStop.durationMin : 0}m`} />
        </MarkerView>
      )}

      {/* Diversion label */}
      {diversion && divCoord && (
        <MarkerView coordinate={divCoord} anchor={{ x: 0.5, y: 1.3 }} allowOverlap>
          <DetourLabelView />
        </MarkerView>
      )}

      {/* 120m radius — pizzeria */}
      <ShapeSource id={`${mapId}-piz-radius`} shape={{
        type: "Feature", properties: {},
        geometry: { type: "Polygon", coordinates: [makeCirclePolygon(PIZZERIA_COORD, 120)] },
      }}>
        <FillLayer id={`${mapId}-piz-radius-fill`} style={{
          fillColor: "rgba(255,61,20,0.07)",
          fillOutlineColor: "rgba(255,61,20,0.45)",
        }} />
      </ShapeSource>

      {/* 120m radius — delivery */}
      {dispatch && (
        <ShapeSource id={`${mapId}-del-radius`} shape={{
          type: "Feature", properties: {},
          geometry: { type: "Polygon", coordinates: [makeCirclePolygon(dispatch.deliveryCoord, 120)] },
        }}>
          <FillLayer id={`${mapId}-del-radius-fill`} style={{
            fillColor: "rgba(52,211,154,0.07)",
            fillOutlineColor: "rgba(52,211,154,0.45)",
          }} />
        </ShapeSource>
      )}

      {/* Pizzeria marker */}
      <MarkerView coordinate={PIZZERIA_COORD} anchor={{ x: 0.5, y: 1 }} allowOverlap>
        <PizzeriaMarkerView />
      </MarkerView>
    </MapView>
  );
}

function RouteMap({ dispatch, allDispatches }: {
  dispatch: Dispatch | null;
  allDispatches: Dispatch[];
}) {
  if (Platform.OS === "web") {
    return <WebRouteMap dispatch={dispatch} allDispatches={allDispatches} />;
  }
  return <NativeRouteMap dispatch={dispatch} allDispatches={allDispatches} />;
}

// ── Dispatch row ───────────────────────────────────────────────────────────────
function DispatchRow({ dispatch, selected, onPress }: {
  dispatch: Dispatch;
  selected: boolean;
  onPress: () => void;
}) {
  const { driver, id, orderItems, departureDelay, routeDuration, routeExpected, diversion, longStop } = dispatch;
  const stops = orderItems ?? [{ customer: dispatch.customer, address: dispatch.address, estimatedDeliveryDurationMinutes: null }];
  const hasIssue = diversion.detected || longStop.detected || departureDelay > 5 || routeDuration > routeExpected + 4;
  const selCol   = hasIssue ? (diversion.detected || longStop.detected ? D.zippy : D.amber) : D.green;
  const issueLabel = diversion.detected ? "DETOUR" : longStop.detected ? "STOP" : departureDelay > 5 ? `+${departureDelay}m` : null;

  return (
    <Pressable onPress={onPress} style={[s.dispatchRow, selected && { backgroundColor: `${selCol}09` }]}>
      <View style={[s.dispatchBorder, { backgroundColor: selected ? selCol : "transparent" }]} />
      <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12, paddingRight: 16 }}>

        {/* Driver header row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: stops.length > 0 ? 9 : 0 }}>
          <View style={[s.driverAvatar, { backgroundColor: driver.color, borderRadius: 9, width: 30, height: 30 }]}>
            <Text style={s.driverAvatarText}>{driver.initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.customerName} numberOfLines={1}>{driver.name}</Text>
            <Text style={{ fontFamily: D.mono, fontSize: 8, color: "#faf5ee40", letterSpacing: 1.2, marginTop: 1 }}>
              {id} · {stops.length} STOP{stops.length !== 1 ? "S" : ""}
            </Text>
          </View>
          {hasIssue && issueLabel && (
            <View style={[s.tag, { backgroundColor: `${selCol}14`, borderColor: `${selCol}30` }]}>
              <Text style={[s.tagText, { color: selCol }]}>{issueLabel}</Text>
            </View>
          )}
        </View>

        {/* Stops list */}
        {stops.length > 0 && (
          <View style={{
            marginLeft: 39,
            backgroundColor: "rgba(250,245,238,0.025)",
            borderWidth: 1, borderColor: D.line,
            borderRadius: 8, overflow: "hidden",
          }}>
            {stops.map((stop, i) => (
              <View key={i} style={[
                { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7, paddingHorizontal: 10 },
                i > 0 && { borderTopWidth: 1, borderTopColor: D.line },
              ]}>
                <View style={{
                  width: 16, height: 16, borderRadius: 5,
                  backgroundColor: D.surf3, borderWidth: 1, borderColor: D.line,
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Text style={{ fontFamily: D.monoBold, fontSize: 7.5, color: D.vfaint }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 11.5, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.2 }} numberOfLines={1}>
                    {stop.customer}
                  </Text>
                  <Text style={{ fontSize: 10, color: D.dim, marginTop: 1 }} numberOfLines={1}>
                    {stop.address}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Left dispatch list ─────────────────────────────────────────────────────────
function DispatchList({ dispatches, selectedId, onSelect, dateRange, onDateRangeChange }: {
  dispatches: Dispatch[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
}) {
  return (
    <View style={s.leftPanel}>
      <View style={s.leftHeader}>
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      </View>
      <ScrollView style={{ flex: 1 }}>
        {dispatches.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <Text style={[s.kicker, { letterSpacing: 2 }]}>NO DELIVERIES</Text>
          </View>
        ) : (
          dispatches.map(d => (
            <DispatchRow key={d.id} dispatch={d} selected={selectedId === d.id}
              onPress={() => onSelect(selectedId === d.id ? null : d.id)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── Journey timeline bar ───────────────────────────────────────────────────────
function JourneyTimeline({ dispatch }: { dispatch: Dispatch }) {
  const { dispatchedAt, leftPizzeriaAt, arrivedAt, completedAt,
          departureDelay, routeDuration, routeExpected, dwellDuration, dwellExpected } = dispatch;

  const waitCol  = delayColor(departureDelay);
  const routeCol = routeDuration > routeExpected + 2 ? D.amber : D.green;
  const dwellCol = dwellDuration > dwellExpected + 3 ? D.amber : D.green;

  const Seg = ({ flex, color, sub, label }: { flex: number; color: string; sub: string; label: string }) => (
    <View style={{ flex, minWidth: 0, overflow: "hidden" }}>
      <View style={[s.tlSeg, { backgroundColor: `${color}20`, borderColor: `${color}45` }]}>
        <Text style={[s.tlSegText, { color }]} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={s.tlSegLabel} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <View style={s.tlContainer}>
      <View style={{ flexDirection: "row", gap: 2

      }}>
        <Seg flex={departureDelay} color={waitCol}  sub={`${departureDelay}m`} label="WAIT"  />
        <Seg flex={routeDuration}  color={routeCol} sub={`${routeDuration}m`}  label="ROUTE" />
        <Seg flex={dwellDuration}  color={dwellCol} sub={`${dwellDuration}m`}  label="DWELL" />
      </View>
      {/* <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {[
          { t: dispatchedAt,   col: D.faint   },
          { t: leftPizzeriaAt, col: waitCol   },
          { t: arrivedAt,      col: routeCol  },
          { t: completedAt,    col: dwellCol  },
        ].map(({ t, col }, i) => (
          <Text key={i} style={[s.tlTick, { color: col }]}>{t}</Text>
        ))}
      </View> */}
      {/* <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
        {["DISPATCH", "LEFT", "ARRIVED", "DONE"].map(l => (
          <Text key={l} style={s.tlTickLabel}>{l}</Text>
        ))}
      </View> */}
    </View>
  );
}


// ── Track card system (from design: ra-track-card.jsx) ────────────────────────

function trackColor(overshoot: number): string {
  if (overshoot > 7) return D.zippy;
  if (overshoot > 2) return D.amber;
  return D.green;
}
function trackLabel(overshoot: number): string {
  if (overshoot > 0) return `+${overshoot}m`;
  if (overshoot < -1) return `${overshoot}m`;
  return "No prazo";
}

function IconPickup({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9l1.5-4.5h15L21 9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 9v11h16V9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 14h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M9 9c0 1.7 1.3 3 3 3s3-1.3 3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M15 9c0 1.7 1.3 3 3 3s3-1.3 3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}
function IconDelivery({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="9" r="2.5" stroke={color} strokeWidth="1.8" />
    </Svg>
  );
}
function IconRoute({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 17h7a3 3 0 003-3v-4a3 3 0 013-3h3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 4l3 3-3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="5" cy="17" r="1.5" fill={color} />
    </Svg>
  );
}

function TrackDelta({ overshoot }: { overshoot: number }) {
  const col = trackColor(overshoot);
  return (
    <View style={{ backgroundColor: `${col}18`, borderWidth: 1, borderColor: `${col}40`, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ fontFamily: D.monoBold, fontSize: 12, color: col, letterSpacing: -0.2 }}>{trackLabel(overshoot)}</Text>
    </View>
  );
}

function TrackBarRow({ label, value, pct, col, bold }: { label: string; value: string; pct: number; col: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ width: 62, fontSize: 11.5, color: D.dim, fontFamily: bold ? D.monoBold : "Geist_500Medium" }}>{label}</Text>
      <View style={{ flex: 1, height: 6, backgroundColor: "rgba(250,245,238,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <View style={{ width: `${pct}%` as any, height: "100%" as any, backgroundColor: col, borderRadius: 3 }} />
      </View>
      <Text style={{ fontFamily: D.monoBold, fontSize: 13, color: col, width: 38, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

function TrackBar({ expected, actual }: { expected: number; actual: number }) {
  const max  = Math.max(actual, expected, 6);
  const over = actual > expected;
  const col  = over ? (actual - expected > 5 ? D.zippy : D.amber) : D.green;
  return (
    <View style={{ gap: 8 }}>
      <TrackBarRow label="Previsto" value={`${expected}m`} pct={(expected / max) * 100} col="rgba(250,245,238,0.32)" />
      <TrackBarRow label="Real"     value={`${actual}m`}   pct={(actual   / max) * 100} col={col} bold />
    </View>
  );
}

function TrackCard({ type, title, subtitle, pickupTimes, index, expected, actual }: {
  type: "radius-pickup" | "radius-delivery" | "route";
  title: string;
  subtitle?: string;
  pickupTimes?: { dispatched?: string };
  index?: number;
  expected: number;
  actual: number;
}) {
  const overshoot = actual - expected;
  const col = trackColor(overshoot);
  const typeLabel =
    type === "radius-pickup"   ? "Saída do restaurante" :
    type === "radius-delivery" ? "Tempo na entrega"     : "Percurso";
  const Icon = type === "radius-pickup" ? IconPickup : type === "radius-delivery" ? IconDelivery : IconRoute;

  return (
    <View style={[s.trackCard]}>
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 14 }}>
        {/* Icon */}
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${col}1a`, borderWidth: 1, borderColor: `${col}40`, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={18} color={col} />
          {index != null && (
            <View style={{ position: "absolute", bottom: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: D.surf, borderWidth: 1, borderColor: D.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
              <Text style={{ fontFamily: D.monoBold, fontSize: 9, color: D.dim }}>{index}</Text>
            </View>
          )}
        </View>
        {/* Text */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: D.monoBold, fontSize: 9.5, color: D.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{typeLabel}</Text>
          <Text style={{ fontSize: 15, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.4, lineHeight: 18 }} numberOfLines={1}>{title}</Text>
          {pickupTimes ? (
            <Text style={{ fontFamily: D.mono, fontSize: 11.5, color: D.dim, marginTop: 3 }}>
              {pickupTimes.dispatched ? <>{"Despacho "}<Text style={{ fontFamily: "GeistMono_500Medium", color: D.text }}>{pickupTimes.dispatched}</Text></> : null}
            </Text>
          ) : subtitle ? (
            <Text style={{ fontSize: 12.5, color: D.dim, fontFamily: "Geist_500Medium", marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <TrackDelta overshoot={overshoot} />
      </View>
      {/* Bar */}
      <TrackBar expected={expected} actual={actual} />
    </View>
  );
}

// ── Track list builder ─────────────────────────────────────────────────────────
type TrackItem = {
  key: string;
  type: "radius-pickup" | "radius-delivery" | "route";
  title: string;
  subtitle?: string;
  pickupTimes?: { dispatched?: string };
  index?: number;
  expected: number;
  actual: number;
};

function buildTrackList(dispatch: Dispatch): TrackItem[] {
  const items: TrackItem[] = [];

  // 1. Departure from restaurant
  items.push({
    key: "pickup",
    type: "radius-pickup",
    title: "Zappy Pizzeria",
    pickupTimes: {},
    expected: 3,
    actual: dispatch.elapsedSinceDispatch,
  });

  const orders = dispatch.orderItems ?? [{ customer: dispatch.customer, address: dispatch.address, estimatedDeliveryDurationMinutes: null }];
  const orderCount = orders.length;

  orders.forEach((order, i) => {
    // Route to delivery
    items.push({
      key: `route-${i}`,
      type: "route",
      title: `Até ${order.customer}`,
      subtitle: order.address,
      expected: Math.round(dispatch.routeExpected / orderCount),
      actual: Math.round(dispatch.routeDuration / orderCount),
    });
    // Time at delivery
    items.push({
      key: `delivery-${i}`,
      type: "radius-delivery",
      index: i + 1,
      title: order.customer,
      subtitle: order.address,
      expected: order.estimatedDeliveryDurationMinutes ?? dispatch.dwellExpected,
      actual: Math.round(dispatch.dwellDuration / orderCount),
    });
  });

  // Return to restaurant
  const returnExpected = dispatch.estimatedRoundTripDurationMinutes
    ? Math.max(1, dispatch.estimatedRoundTripDurationMinutes - dispatch.routeExpected - dispatch.dwellExpected)
    : dispatch.routeExpected;
  items.push({
    key: "return",
    type: "route",
    title: "Retorno à pizzaria",
    expected: returnExpected,
    actual: returnExpected, // no real data for return yet
  });

  return items;
}

// ── Analytics tab ──────────────────────────────────────────────────────────────
function AnalyticsTab({ dispatch, allDispatches }: { dispatch: Dispatch; allDispatches: Dispatch[] }) {
  const driverDispatches = allDispatches.filter(d => d.driver.name === dispatch.driver.name);
  const total    = driverDispatches.length;
  const avgDelay = total > 0 ? Math.round(driverDispatches.reduce((s, d) => s + d.departureDelay, 0) / total) : 0;
  const avgRoute = total > 0 ? Math.round(driverDispatches.reduce((s, d) => s + d.routeDuration,  0) / total) : 0;
  const issues   = driverDispatches.filter(d => d.diversion.detected || d.longStop.detected || d.departureDelay > 5).length;
  const onTime   = total - issues;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 14 }}>
      <Text style={{ fontFamily: D.monoBold, fontSize: 10, letterSpacing: 1.6, color: D.dim, marginBottom: 10, paddingLeft: 2 }}>
        RESUMO DO MOTORISTA
      </Text>

      {/* Summary counters */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
        {[
          { label: "ENTREGAS", val: String(total),   col: D.text  },
          { label: "OK",       val: String(onTime),  col: D.green },
          { label: "ISSUES",   val: String(issues),  col: issues > 0 ? D.amber : D.green },
        ].map(({ label, val, col }) => (
          <View key={label} style={{ flex: 1, backgroundColor: D.surf2, borderWidth: 1, borderColor: D.line, borderRadius: 8, padding: 8, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontFamily: "Geist_700Bold", color: col, letterSpacing: -0.5, lineHeight: 19, marginBottom: 2 }}>{val}</Text>
            <Text style={{ fontFamily: D.mono, fontSize: 7, color: D.vfaint, letterSpacing: 1 }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Average metrics */}
      <View style={[s.trackCard, { marginBottom: 10 }]}>
        <Text style={{ fontFamily: D.monoBold, fontSize: 9, letterSpacing: 1.2, color: D.dim, marginBottom: 10 }}>MÉDIAS DO PERÍODO</Text>
        <View style={{ gap: 8 }}>
          <TrackBarRow
            label="Saída"
            value={`${avgDelay}m`}
            pct={Math.min((avgDelay / 12) * 100, 100)}
            col={avgDelay > 7 ? D.zippy : avgDelay > 3 ? D.amber : D.green}
          />
          <TrackBarRow
            label="Rota"
            value={`${avgRoute}m`}
            pct={Math.min((avgRoute / 30) * 100, 100)}
            col={avgRoute > 22 ? D.amber : D.green}
          />
        </View>
      </View>

      {/* All deliveries by this driver */}
      <Text style={{ fontFamily: D.monoBold, fontSize: 10, letterSpacing: 1.6, color: D.dim, marginBottom: 8, paddingLeft: 2 }}>
        TODAS AS ENTREGAS
      </Text>
      {driverDispatches.map(d => {
        const delayCol  = d.departureDelay > 7 ? D.zippy : d.departureDelay > 3 ? D.amber : D.green;
        const isCurrent = d.id === dispatch.id;
        return (
          <View key={d.id} style={{
            backgroundColor: isCurrent ? `${D.zippy}0a` : D.surf2,
            borderWidth: 1, borderColor: isCurrent ? `${D.zippy}28` : D.line,
            borderRadius: 8, padding: 10, marginBottom: 6,
            flexDirection: "row", alignItems: "center", gap: 10,
          }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 12, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.2 }} numberOfLines={1}>
                {d.customer}
              </Text>
              <Text style={{ fontFamily: D.mono, fontSize: 8.5, color: D.faint, marginTop: 2 }}>
                {d.leftPizzeriaAt} · {d.routeDuration}m rota
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <View style={{ backgroundColor: `${delayCol}18`, borderWidth: 1, borderColor: `${delayCol}35`, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontFamily: D.monoBold, fontSize: 8, color: delayCol }}>
                  {d.departureDelay > 0 ? `+${d.departureDelay}m` : "OK"}
                </Text>
              </View>
              {d.diversion.detected && (
                <View style={{ backgroundColor: "rgba(242,179,56,0.12)", borderWidth: 1, borderColor: "rgba(242,179,56,0.28)", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: D.monoBold, fontSize: 7, color: D.amber }}>DETOUR</Text>
                </View>
              )}
              {d.longStop.detected && (
                <View style={{ backgroundColor: "rgba(255,61,20,0.12)", borderWidth: 1, borderColor: "rgba(255,61,20,0.28)", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: D.monoBold, fontSize: 7, color: D.zippy }}>STOP</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Right analysis panel ───────────────────────────────────────────────────────
function DeliveryPanel({ dispatch, allDispatches }: { dispatch: Dispatch | null; allDispatches: Dispatch[] }) {
  const [tab, setTab] = useState<"routes" | "analytics">("routes");

  if (!dispatch) {
    return (
      <View style={[s.rightPanel, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 2, color: D.vfaint, marginBottom: 8 }}>ANÁLISE DE ROTA</Text>
        <Text style={{ fontSize: 13, color: D.faint, textAlign: "center", lineHeight: 20 }}>
          Selecione uma entrega{"\n"}para ver o detalhamento.
        </Text>
      </View>
    );
  }

  const issueCount = [
    dispatch.departureDelay > 3,
    dispatch.routeDuration > dispatch.routeExpected + 2,
    dispatch.dwellDuration > dispatch.dwellExpected + 2,
  ].filter(Boolean).length;
  const overallCol = issueCount === 0 ? D.green : issueCount <= 1 ? D.amber : D.zippy;
  const tracks     = buildTrackList(dispatch);

  return (
    <View style={s.rightPanel}>
      {/* Header */}
      <View style={{ padding: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: D.line, flexShrink: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: dispatch.driver.color, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Text style={{ fontSize: 12, fontFamily: "Geist_700Bold", color: "#fff" }}>{dispatch.driver.initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.3, marginBottom: 1 }}>{dispatch.driver.name}</Text>
            <Text style={{ fontFamily: D.mono, fontSize: 9.5, color: D.dim }}>{dispatch.id}</Text>
          </View>
          <View style={{ backgroundColor: `${overallCol}18`, borderWidth: 1, borderColor: `${overallCol}40`, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ fontFamily: D.monoBold, fontSize: 9, color: overallCol }}>
              {issueCount === 0 ? "OK" : `${issueCount} ISSUE${issueCount > 1 ? "S" : ""}`}
            </Text>
          </View>
        </View>
        {/* KPI row */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[
            { label: "PARADAS", val: String(dispatch.orderItems?.length ?? 1), col: D.dim },
            { label: "SAÍDA",   val: `${dispatch.departureDelay}m`, col: dispatch.departureDelay > 7 ? D.zippy : dispatch.departureDelay > 3 ? D.amber : D.green },
            { label: "ROTA",    val: `${dispatch.routeDuration}m`,  col: dispatch.routeDuration > dispatch.routeExpected + 2 ? D.amber : D.green },
            { label: "DWELL",   val: `${dispatch.dwellDuration}m`,  col: dispatch.dwellDuration > dispatch.dwellExpected + 2 ? D.amber : D.green },
          ].map(({ label, val, col }) => (
            <View key={label} style={{ flex: 1, backgroundColor: D.surf2, borderWidth: 1, borderColor: D.line, borderRadius: 8, padding: 6, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontFamily: "Geist_700Bold", color: col, letterSpacing: -0.4, lineHeight: 16, marginBottom: 2 }}>{val}</Text>
              <Text style={{ fontFamily: D.mono, fontSize: 7.5, color: D.vfaint, letterSpacing: 1 }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: D.line, flexShrink: 0 }}>
        {(["routes", "analytics"] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={{
            flex: 1, paddingVertical: 10, alignItems: "center",
            borderBottomWidth: 2, borderBottomColor: tab === t ? D.zippy : "transparent",
          }}>
            <Text style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1.2, color: tab === t ? D.text : D.faint }}>
              {t === "routes" ? "ROTAS" : "ANÁLISE"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {tab === "routes" ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 14 }}>
          <Text style={{ fontFamily: D.monoBold, fontSize: 10, letterSpacing: 1.6, color: D.dim, marginBottom: 10, paddingLeft: 2 }}>
            TRECHOS — {dispatch.date}
          </Text>
          {tracks.map(tr => (
            <TrackCard
              key={tr.key}
              type={tr.type}
              title={tr.title}
              subtitle={tr.subtitle}
              pickupTimes={tr.pickupTimes}
              index={tr.index}
              expected={tr.expected}
              actual={tr.actual}
            />
          ))}
        </ScrollView>
      ) : (
        <AnalyticsTab dispatch={dispatch} allDispatches={allDispatches} />
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function RouteAnalysisScreen() {
  const { signOut, owner, token } = useAuth();

  const [dispatchMap, setDispatchMap] = useState<Record<string, Dispatch[]>>(EMPTY_DISPATCH_MAP);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selectedId,  setSelected]  = useState<string | null>(null);
  const [dateRange,   setDateRange] = useState<DateRange>(() => relRange(7, "Últimos 7 dias"));
  const rawEntitiesRef = useRef<DispatchEntity[]>([]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);

    fetchDispatches(token, {
      startAt: dateRange.startDate,
      endAt:   dateRange.endDate,
    })
      .then(entities => {
        rawEntitiesRef.current = entities;
        setDispatchMap(entities.length === 0 ? {} : buildDispatchMap(entities));
      })
      .catch(() => setError("Falha ao carregar dados"))
      .finally(() => setLoading(false));
  }, [token, dateRange]);

  useEffect(() => {
    console.log("[RouteAnalysis] selectedId changed:", selectedId, "| rawEntities:", rawEntitiesRef.current.length);
    if (!selectedId) return;
    const entity = rawEntitiesRef.current.find((e: DispatchEntity) => e.id === selectedId);
    console.log("[RouteAnalysis] entity found:", !!entity, entity?.id ?? "not found");
    const dispatchMs = entity?.dispatchAt ? new Date(entity.dispatchAt).getTime() : null;
    const leftRestaurantMs = entity?.leftRestaurantAt ? new Date(entity.leftRestaurantAt).getTime() : null;
    const elapsedSinceDispatch = dispatchMs
      ? Math.max(0, Math.round(((leftRestaurantMs ?? Date.now()) - dispatchMs) / 60000))
      : null;
    console.log("[RouteAnalysis] Saída do restaurante cálculo:", {
      dispatchAt: entity?.dispatchAt ?? "— (missing)",
      leftRestaurantAt: entity?.leftRestaurantAt ?? "— (missing, usando now)",
      dispatchMs,
      leftRestaurantMs: leftRestaurantMs ?? Date.now(),
      elapsedSinceDispatch: elapsedSinceDispatch != null ? `${elapsedSinceDispatch} min` : "n/a (sem dispatchAt)",
      isLive: !leftRestaurantMs,
    });
  }, [selectedId]);

  const dispatches = Object.values(dispatchMap)
    .flat()
    .sort((a, b) => {
      const key = (d: Dispatch) => {
        const [dd, mm, yyyy] = d.date.split("/");
        return `${yyyy}${mm}${dd}${d.dispatchedAt.replace(":", "")}`;
      };
      return key(b).localeCompare(key(a));
    });

  const dispatch = dispatches.find(d => d.id === selectedId) ?? null;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top","bottom"]}>
        <TabletTopBar mode="inner" pageTitle="Route Analysis" pageSubtitle="PER-DELIVERY GPS REVIEW"
          onBack={() => router.back()} backLabel="Início"
          userInitial={(owner?.name ?? "G").charAt(0).toUpperCase()}
          onAvatarPress={() => void signOut()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={D.zippy} />
          <Text style={[s.kicker, { marginTop: 12, letterSpacing: 2 }]}>CARREGANDO…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top", "bottom"]}>
      <TabletTopBar
        mode="inner"
        pageTitle="Route Analysis"
        pageSubtitle="PER-DELIVERY GPS REVIEW"
        onBack={() => router.back()}
        backLabel="Início"
        userInitial={(owner?.name ?? "G").charAt(0).toUpperCase()}
        onAvatarPress={() => void signOut()}
      />

      {error && (
        <Text style={[s.kicker, { color: D.amber, letterSpacing: 1.2, marginHorizontal: 16, marginVertical: 6 }]}>
          {error.toUpperCase()}
        </Text>
      )}

      <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
        <DispatchList
          dispatches={dispatches}
          selectedId={selectedId}
          onSelect={setSelected}
          dateRange={dateRange}
          onDateRangeChange={r => { setDateRange(r); setSelected(null); }}
        />

        {/* Map + right panel column */}
        <View style={{ flex: 1, flexDirection: "column", overflow: "hidden" }}>

          {/* Journey timeline — spans map + right panel */}
          {dispatch && <JourneyTimeline dispatch={dispatch} />}

          <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
            {/* Center: Mapbox map */}
            <View style={{ flex: 1, position: "relative" }}>
              <RouteMap dispatch={dispatch} allDispatches={dispatches} />
              {dispatch && !dispatch.gpsTrack.length && (
                <View style={{ position: "absolute", bottom: 72, left: 0, right: 0, alignItems: "center" }}
                  pointerEvents="none">
                  <View style={{ backgroundColor: "rgba(10,8,7,0.90)", borderWidth: 1,
                    borderColor: "rgba(250,245,238,0.14)", borderRadius: 10,
                    paddingHorizontal: 20, paddingVertical: 11, alignItems: "center" }}>
                    <Text style={[s.kicker, { letterSpacing: 2, marginBottom: 0 }]}>GPS REPLAY UNAVAILABLE</Text>
                    <Text style={[s.kicker, { color: D.vfaint, letterSpacing: 1, marginTop: 4, marginBottom: 0 }]}>
                      Full route tracking requires driver app data
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <DeliveryPanel dispatch={dispatch} allDispatches={dispatches} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Left panel
  leftPanel: {
    width: 280, flexShrink: 0,
    backgroundColor: D.surf, borderRightWidth: 1, borderRightColor: D.line,
  },
  leftHeader: {
    padding: 13, paddingBottom: 11,
    borderBottomWidth: 1, borderBottomColor: D.line,
  },
  kicker: {
    fontFamily: "GeistMono_400Regular", fontSize: 15,
    letterSpacing: 2.2, color: D.dim, marginBottom: 4,
  },
  bigNum:    { fontSize: 20, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.6, lineHeight: 22 },
  bigNumSub: { fontSize: 12, color: D.dim, fontFamily: "Geist_500Medium" },
  datePill: {
    flex: 1, paddingVertical: 5, alignItems: "center",
    borderWidth: 1, borderRadius: 6,
  },
  datePillText: { fontFamily: "GeistMono_400Regular", fontSize: 7.5, color: D.dim, letterSpacing: 0.4 },

  // Dispatch row
  dispatchRow: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: D.line,
  },
  dispatchBorder: { width: 2 },
  dispatchBody:   { flex: 1, paddingVertical: 11, paddingHorizontal: 10 },
  dispatchHead:   { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 7 },
  driverAvatar: {
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    alignItems: "center", justifyContent: "center",
  },
  driverAvatarText: { fontSize: 10, fontFamily: "Geist_700Bold", color: "#fff" },
  customerName:     { fontSize: 12, fontFamily: "Geist_700Bold", color: D.text, letterSpacing: -0.2 },
  customerAddr:     { fontSize: 10, color: D.dim },
  dispatchTimeText: { fontFamily: "GeistMono_400Regular", fontSize: 9.5, color: D.faint, flexShrink: 0 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingLeft: 37, flexWrap: "wrap" },
  tag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontFamily: "GeistMono_700Bold", fontSize: 8 },

  // Right panel
  rightPanel: {
    width: 340, flexShrink: 0,
    backgroundColor: D.surf, borderLeftWidth: 1, borderLeftColor: D.line,
  },
  trackCard: {
    backgroundColor: D.surf2, borderWidth: 1, borderColor: D.line,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  rightHeader: {
    padding: 13, paddingBottom: 11,
    borderBottomWidth: 1, borderBottomColor: D.line,
  },
  // Timeline
  tlContainer: {
    paddingVertical: 12, paddingHorizontal: 16,
    // borderTopWidth: 1, borderTopColor: D.line,
    borderBottomWidth: 1, borderBottomColor: D.line,
    flexShrink: 0, backgroundColor: D.surf,
  },
  tlSeg:      { height: 20, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tlSegText:  { fontFamily: "GeistMono_700Bold", fontSize: 8 },
  tlSegLabel: { fontFamily: "GeistMono_400Regular", fontSize: 7, color: D.faint, letterSpacing: 0.8, marginTop: 3, textAlign: "center" },
  tlTick:     { fontFamily: "GeistMono_600SemiBold", fontSize: 8.5 },
  tlTickLabel:{ fontFamily: "GeistMono_400Regular", fontSize: 6.5, color: D.faint, letterSpacing: 1 },

  // Metric cards
  metricCard: {
    paddingVertical: 11, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: D.line,
  },
  bigTime:    { fontFamily: "GeistMono_700Bold", fontSize: 22, letterSpacing: -0.6, lineHeight: 24 },
  bigTimeSub: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.dim },
  cardBody:   { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.text },
  cardBodySm: { fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.dim },
  dwellLabel: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.faint, letterSpacing: 1, marginBottom: 2 },
  dwellTime:  { fontFamily: "GeistMono_700Bold", fontSize: 12.5
    , color: D.text },

  // Comparison bar
  barLabel: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.faint, width: 54, letterSpacing: 0.6, flexShrink: 0 },
  barTrack:  { flex: 1, height: 6, backgroundColor: "rgba(250,245,238,0.06)", borderRadius: 2, overflow: "hidden" },
  barFill:   { height: "100%" as any, borderRadius: 2 },
  barValue:  { fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.dim, width: 28, textAlign: "right", flexShrink: 0 },
  barOver:   { fontFamily: "GeistMono_700Bold", fontSize: 11, textAlign: "right", marginTop: 1 },

  // Badge
  badge:     { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: "GeistMono_700Bold", fontSize: 11, letterSpacing: 0.8 },
});
