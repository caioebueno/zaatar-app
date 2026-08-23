import Mapbox, { Camera, LineLayer, MapView, MarkerView, ShapeSource } from "@rnmapbox/maps";
import { useAuth } from "@/contexts/auth";
import {
  fetchAllDispatches,
  type DispatchEntity,
  type DispatchOrder,
} from "@/services/dispatchApi";
import { TabletTopBar } from "@/components/TabletTopBar";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

// ── Types ──────────────────────────────────────────────────────────────────────
type RouteStatus = "late" | "at-risk" | "on-track";
type DelivStatus = "done" | "in-transit" | "pending";
type LatLng      = { latitude: number; longitude: number };

type Delivery = {
  id: string; seq: number; orderNumber?: string; customer: string; address: string;
  eta: string; deltaMin: number; status: DelivStatus;
  coordinate: LatLng;
};

type Route = {
  id: string; status: RouteStatus; driver: string; initials: string;
  color: string; vehicle?: string;
  driverCoordinate: LatLng;
  deliveries: Delivery[];
  geometry?: LatLng[];
  lastLocationAt?: string;
};

// ── Design tokens ──────────────────────────────────────────────────────────────
const D = {
  bg:     "#0a0807",
  surf:   "#181310",
  surf2:  "#1e1812",
  line:   "rgba(250,245,238,0.08)",
  lineS:  "rgba(250,245,238,0.14)",
  text:   "#faf5ee",
  dim:    "rgba(250,245,238,0.58)",
  faint:  "rgba(250,245,238,0.28)",
  vfaint: "rgba(250,245,238,0.12)",
  zippy:  "#ff3d14",
  green:  "#34d39a",
  amber:  "#f2b338",
};

const ST_COL: Record<RouteStatus, string> = { late: D.zippy,  "at-risk": D.amber,  "on-track": D.green };
const ST_BG:  Record<RouteStatus, string> = { late: "rgba(255,61,20,0.12)",   "at-risk": "rgba(242,179,56,0.12)",   "on-track": "rgba(52,211,154,0.10)" };
const ST_BR:  Record<RouteStatus, string> = { late: "rgba(255,61,20,0.25)",   "at-risk": "rgba(242,179,56,0.25)",   "on-track": "rgba(52,211,154,0.20)" };
const ST_LBL: Record<RouteStatus, string> = { late: "ATRASADO", "at-risk": "EM RISCO", "on-track": "NO PRAZO" };

const ROUTE_COLORS = ["#c96442", "#44804a", "#2a6fbd", "#8b4e8b", "#b8622a", "#4a7a8b", "#8b7a2a"];

const RESTAURANT_COORD: LatLng = {
  latitude:  28.348670286695988,
  longitude: -81.65142367443619,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }

function fmtLocationAge(recordedAt: string): string {
  const diffMs  = Date.now() - new Date(recordedAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "agora";
  if (diffMin < 60) return `${diffMin}m atrás`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m atrás` : `${h}h atrás`;
}

function deltaBadgeProps(deltaMin: number) {
  if (deltaMin > 5)  return { color: D.zippy, bg: "rgba(255,61,20,0.13)",   br: "rgba(255,61,20,0.28)",   label: `+${deltaMin}m ATRASADO` };
  if (deltaMin > 0)  return { color: D.amber, bg: "rgba(242,179,56,0.13)",  br: "rgba(242,179,56,0.28)",  label: `+${deltaMin}m RISCO` };
  if (deltaMin < 0)  return { color: D.green, bg: "rgba(52,211,154,0.10)",  br: "rgba(52,211,154,0.22)",  label: `${Math.abs(deltaMin)}m ADIANTADO` };
  return               { color: D.green, bg: "rgba(52,211,154,0.10)",  br: "rgba(52,211,154,0.22)",  label: "NO PRAZO" };
}


function toPosition(c: LatLng): [number, number] {
  return [c.longitude, c.latitude];
}

async function fetchOsrmGeometry(waypoints: LatLng[]): Promise<LatLng[]> {
  const coords = waypoints.map((w) => `${w.longitude},${w.latitude}`).join(";");
  const res    = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`
  );
  const data = await res.json() as { code: string; routes: { geometry: { coordinates: [number, number][] } }[] };
  if (data.code !== "Ok" || !data.routes[0]) return waypoints;
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

async function enrichWithGeometry(routes: Route[]): Promise<Route[]> {
  return Promise.all(
    routes.map(async (route) => {
      const waypoints = [RESTAURANT_COORD, ...route.deliveries.map((d) => d.coordinate)];
      if (waypoints.length < 2) return route;
      try {
        const geometry = await fetchOsrmGeometry(waypoints);
        return { ...route, geometry };
      } catch {
        return route;
      }
    })
  );
}

// ── Dispatch → Route mapping ───────────────────────────────────────────────────
function calcRouteStatus(deliveries: Delivery[]): RouteStatus {
  const active = deliveries.filter((d) => d.status !== "done");
  if (active.some((d) => d.deltaMin > 5))  return "late";
  if (active.some((d) => d.deltaMin > 0))  return "at-risk";
  return "on-track";
}

function calcDeliveryEta(dispatch: DispatchEntity, orders: DispatchOrder[], index: number): string {
  const startedAt  = dispatch.startedDeliveryAt ? new Date(dispatch.startedDeliveryAt) : new Date();
  const cumulMin   = orders.slice(0, index + 1).reduce((s, o) => s + (o.estimatedDeliveryDurationMinutes ?? 15), 0);
  const eta        = new Date(startedAt.getTime() + cumulMin * 60_000);
  return `${pad(eta.getHours())}:${pad(eta.getMinutes())}`;
}

function calcDeltaMin(dispatch: DispatchEntity, orders: DispatchOrder[], index: number): number {
  if (!dispatch.startedDeliveryAt) return 0;
  const startedAt = new Date(dispatch.startedDeliveryAt).getTime();
  const cumulMin  = orders.slice(0, index + 1).reduce((s, o) => s + (o.estimatedDeliveryDurationMinutes ?? 15), 0);
  return Math.round((Date.now() - (startedAt + cumulMin * 60_000)) / 60_000);
}

function mapDispatchesToRoutes(dispatches: DispatchEntity[]): Route[] {
  return dispatches.map((dispatch, idx) => {
    const color        = ROUTE_COLORS[idx % ROUTE_COLORS.length];
    const sortedOrders = [...dispatch.orders].sort((a, b) => a.dispatchOrderIndex - b.dispatchOrderIndex);

    let foundInTransit = false;
    const deliveries: Delivery[] = sortedOrders
      .filter((o) => o.deliveryAddress?.lat && o.deliveryAddress?.lng)
      .map((order, i) => {
        let delivStatus: DelivStatus;
        if (order.delivered) {
          delivStatus = "done";
        } else if (!foundInTransit) {
          delivStatus = "in-transit";
          foundInTransit = true;
        } else {
          delivStatus = "pending";
        }

        return {
          id:          order.id,
          seq:         i + 1,
          orderNumber: order.number,
          customer:   order.customer?.name ?? "—",
          address:    `${order.deliveryAddress!.street} ${order.deliveryAddress!.number}`,
          eta:        calcDeliveryEta(dispatch, sortedOrders, i),
          deltaMin:   calcDeltaMin(dispatch, sortedOrders, i),
          status:     delivStatus,
          coordinate: {
            latitude:  parseFloat(order.deliveryAddress!.lat),
            longitude: parseFloat(order.deliveryAddress!.lng),
          },
        };
      });

    const status: RouteStatus = calcRouteStatus(deliveries);

    const rp = dispatch.latestRoutePoint;
    const driverCoord: LatLng = rp
      ? { latitude: rp.lat, longitude: rp.lng }
      : RESTAURANT_COORD;

    const driverName = dispatch.driver?.name ?? "—";
    const initials   = driverName.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();

    return {
      id:               dispatch.id,
      status,
      driver:           driverName,
      initials,
      color,
      driverCoordinate: driverCoord,
      deliveries,
      lastLocationAt:   dispatch.latestRoutePoint?.recordedAt,
    };
  });
}

// ── Delta badge ────────────────────────────────────────────────────────────────
function DeltaBadge({ deltaMin, small = true }: { deltaMin: number; small?: boolean }) {
  const { color, bg, br, label } = deltaBadgeProps(deltaMin);
  return (
    <View style={[db.badge, { backgroundColor: bg, borderColor: br, paddingHorizontal: small ? 6 : 8, paddingVertical: small ? 2 : 3 }]}>
      <Text style={[db.text, { color, fontSize: small ? 9.5 : 10.5 }]}>{label}</Text>
    </View>
  );
}

// ── Progress dots ──────────────────────────────────────────────────────────────
function ProgressDots({ deliveries, status }: { deliveries: Delivery[]; status: RouteStatus }) {
  const color = ST_COL[status];
  const done  = deliveries.filter((d) => d.status === "done").length;
  return (
    <View style={pd.row}>
      {deliveries.map((d, i) => (
        <View key={d.id} style={pd.segment}>
          {i > 0 && <View style={[pd.connector, { backgroundColor: i <= done ? "rgba(52,211,154,0.3)" : D.line }]} />}
          {d.status === "done"       && <View style={pd.done} />}
          {d.status === "in-transit" && <View style={[pd.active, { backgroundColor: color }]} />}
          {d.status === "pending"    && <View style={pd.pending} />}
        </View>
      ))}
      <Text style={pd.count}>{done}/{deliveries.length}</Text>
    </View>
  );
}

// ── Delivery card ──────────────────────────────────────────────────────────────
function DeliveryCard({ delivery, selected, onPress }: {
  delivery: Delivery; selected: boolean; onPress: () => void;
}) {
  const isDone   = delivery.status === "done";
  const isActive = delivery.status === "in-transit";
  const { color } = deltaBadgeProps(delivery.deltaMin);
  const statusCol = isDone ? D.green : isActive ? color : D.faint;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        dc.card,
        isActive && { borderLeftColor: statusCol },
        selected && { backgroundColor: `${statusCol}14`, borderColor: `${statusCol}35` },
        pressed  && { opacity: 0.7 },
      ]}
    >
      <View style={[
        dc.seq,
        isDone   && { backgroundColor: "rgba(52,211,154,0.12)", borderColor: "rgba(52,211,154,0.28)" },
        isActive && { backgroundColor: `${statusCol}18`, borderColor: `${statusCol}55` },
      ]}>
        {isDone
          ? <Text style={dc.seqCheck}>✓</Text>
          : <Text style={[dc.seqNum, { color: statusCol }]}>{delivery.seq}</Text>
        }
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[dc.customer, isDone && { opacity: 0.5 }]} numberOfLines={1}>
          {delivery.customer}
        </Text>
        <Text style={[dc.address, isDone && { opacity: 0.4 }]} numberOfLines={1}>
          {delivery.address}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
        <Text style={[dc.eta, isDone && { opacity: 0.45 }]}>{delivery.eta}</Text>
        {!isDone && <DeltaBadge deltaMin={delivery.deltaMin} small />}
      </View>
    </Pressable>
  );
}

// ── Route card ─────────────────────────────────────────────────────────────────
function RouteCard({ route, selected, selectedDeliveryId, onPress, onSelectDelivery }: {
  route: Route; selected: boolean; selectedDeliveryId: string | null;
  onPress: () => void; onSelectDelivery: (d: Delivery) => void;
}) {
  const color = ST_COL[route.status];

  return (
    <Pressable
      onPress={onPress}
      style={[rc.card, { borderLeftColor: selected ? color : "transparent", backgroundColor: selected ? ST_BG[route.status] : "transparent" }]}
    >
      <View style={rc.row1}>
        <View style={[rc.avatar, { backgroundColor: route.color }]}>
          <Text style={rc.avatarText}>{route.initials}</Text>
        </View>
        <View style={{ flex: 1, overflow: "hidden" }}>
          <Text style={rc.name} numberOfLines={1}>{route.driver}</Text>
          {route.lastLocationAt
            ? <Text style={rc.sub}>{fmtLocationAge(route.lastLocationAt)}</Text>
            : <Text style={rc.sub}>sem localização</Text>
          }
        </View>
        <View style={[rc.badge, { backgroundColor: ST_BG[route.status], borderColor: ST_BR[route.status] }]}>
          <Text style={[rc.badgeText, { color }]}>{ST_LBL[route.status]}</Text>
        </View>
      </View>

      <ProgressDots deliveries={route.deliveries} status={route.status} />

      {route.deliveries.length > 0 && (
        <View style={{ gap: 5, marginTop: 4 }}>
          {route.deliveries.map((d) => (
            <DeliveryCard
              key={d.id}
              delivery={d}
              selected={selectedDeliveryId === d.id}
              onPress={() => onSelectDelivery(d)}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

// ── Left panel ─────────────────────────────────────────────────────────────────
function LeftPanel({ routes, selectedRouteId, selectedDeliveryId, onSelectRoute, onSelectDelivery }: {
  routes: Route[];
  selectedRouteId: string | null;
  selectedDeliveryId: string | null;
  onSelectRoute: (id: string) => void;
  onSelectDelivery: (delivery: Delivery, routeId: string) => void;
}) {
  return (
    <View style={lp.panel}>
      {routes.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 10, color: D.vfaint, letterSpacing: 1.2, textAlign: "center" }}>
            NENHUMA ENTREGA{"\n"}EM ANDAMENTO
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {routes.map((r) => (
            <RouteCard
              key={r.id}
              route={r}
              selected={selectedRouteId === r.id}
              selectedDeliveryId={selectedDeliveryId}
              onPress={() => onSelectRoute(r.id)}
              onSelectDelivery={(d) => onSelectDelivery(d, r.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Marker views ───────────────────────────────────────────────────────────────
function DelivPinView({ delivery, selected, isNewlyActive }: {
  delivery: Delivery; selected: boolean; isNewlyActive: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isNewlyActive) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 180, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 180, useNativeDriver: true }),
      ]),
      { iterations: 5 },
    );
    anim.start();
    return () => { anim.stop(); pulse.setValue(1); };
  }, [isNewlyActive]);

  if (delivery.status === "done") {
    return (
      <View style={mk.donePin}>
        <Text style={mk.doneTick}>✓</Text>
      </View>
    );
  }
  const color = deltaBadgeProps(delivery.deltaMin).color;
  return (
    <Animated.View style={{ alignItems: "center", transform: [{ scale: pulse }] }}>
      {selected && <View style={[mk.selRing, { borderColor: color }]} />}
      <View style={[mk.pinRect, { backgroundColor: color }]}>
        <Text style={mk.pinSeq}>{delivery.seq}</Text>
      </View>
      <View style={[mk.pinTail, { borderTopColor: color }]} />
    </Animated.View>
  );
}

function DriverPinView({ route, selected }: { route: Route; selected: boolean }) {
  const color = ST_COL[route.status];
  return (
    <View style={[mk.driverCircle, {
      backgroundColor: route.color,
      borderColor: selected ? "#fff" : color,
      borderWidth: selected ? 3 : 2.5,
      width:  selected ? 38 : 32,
      height: selected ? 38 : 32,
      borderRadius: selected ? 19 : 16,
    }]}>
      <Text style={[mk.driverText, { fontSize: selected ? 11 : 10 }]}>{route.initials}</Text>
    </View>
  );
}

// ── Store pin ──────────────────────────────────────────────────────────────────
function StorePinView() {
  return (
    <View style={mk.storeRing}>
      <View style={mk.storeCore} />
    </View>
  );
}

// ── Delivery callout ───────────────────────────────────────────────────────────
function DeliveryCallout({ delivery, route, screenPos, mapWidth, onClose }: {
  delivery: Delivery; route: Route;
  screenPos: { x: number; y: number };
  mapWidth: number;
  onClose: () => void;
}) {
  const color = ST_COL[route.status];
  const left  = Math.max(4, Math.min(screenPos.x - 120, mapWidth - 244));
  const top   = Math.max(4, screenPos.y - 110);

  return (
    <View style={[co.box, { left, top }]} pointerEvents="box-none">
      <View style={[co.header, { backgroundColor: ST_BG[route.status], borderBottomColor: ST_BR[route.status] }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[co.headerDot, { backgroundColor: color }]} />
          <Text style={[co.headerTag, { color }]}>PARADA {delivery.seq} · #{route.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <Pressable onPress={onClose}>
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6L6 18" stroke={D.faint} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          </Svg>
        </Pressable>
      </View>
      <View style={co.body}>
        <Text style={co.customer}>{delivery.customer}</Text>
        <Text style={co.address}>{delivery.address}</Text>
        <View style={co.etaRow}>
          <View>
            <Text style={co.etaLbl}>ETA</Text>
            <Text style={co.etaVal}>{delivery.eta}</Text>
          </View>
          <DeltaBadge deltaMin={delivery.deltaMin} small={false} />
        </View>
        <View style={co.divider} />
        <View style={co.driverRow}>
          <View style={[co.driverAvatar, { backgroundColor: `${route.color}30`, borderColor: `${route.color}50` }]}>
            <Text style={[co.driverInitials, { color: route.color }]}>{route.initials}</Text>
          </View>
          <Text style={co.driverName}>{route.driver}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function MapScreen() {
  const { token, owner } = useAuth();
  const router    = useRouter();
  const mapRef    = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);
  const userInitial = (owner?.name ?? "?").charAt(0).toUpperCase();

  const [routes,             setRoutes]             = useState<Route[]>([]);
  const [isLoading,          setIsLoading]          = useState(true);
  const [fetchError,         setFetchError]         = useState<string | null>(null);
  const [selectedRouteId,    setSelectedRouteId]    = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [calloutPos,         setCalloutPos]         = useState<{ x: number; y: number } | null>(null);
  const [mapWidth,           setMapWidth]           = useState(0);
  const [newlyActiveIds,     setNewlyActiveIds]     = useState<Set<string>>(new Set());
  const prevDelivStatusRef = useRef<Map<string, DelivStatus>>(new Map());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const all        = await fetchAllDispatches(token!);
        const dispatches = all.filter(
          (d) =>
            d.orders.some((o) => o.type === "DELIVERY") &&
            d.dispatchAt != null &&
            d.arrivedAtRestaurantAt == null &&
            d.completedAt == null,
        );
        const mapped     = mapDispatchesToRoutes(dispatches);
        if (!cancelled) {
          setRoutes(mapped);
          setFetchError(null);
          setIsLoading(false);
        }
        const withGeo = await enrichWithGeometry(mapped);
        if (!cancelled) setRoutes(withGeo);
      } catch {
        if (!cancelled) {
          setFetchError("Falha ao carregar rotas");
          setIsLoading(false);
        }
      }
    }

    void load();
    const intervalId = setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [token]);

  useEffect(() => {
    const prev = prevDelivStatusRef.current;
    const toActivate = new Set<string>();
    for (const route of routes) {
      for (const d of route.deliveries) {
        const prevStatus = prev.get(d.id);
        if (prevStatus !== undefined && prevStatus !== "in-transit" && d.status === "in-transit") {
          toActivate.add(d.id);
        }
        prev.set(d.id, d.status);
      }
    }
    if (toActivate.size === 0) return;
    setNewlyActiveIds(toActivate);
    const t = setTimeout(() => setNewlyActiveIds(new Set()), 1800);
    return () => clearTimeout(t);
  }, [routes]);

  const selectedRoute    = selectedRouteId    ? routes.find((r) => r.id === selectedRouteId) ?? null    : null;
  const selectedDelivery = selectedDeliveryId ? routes.flatMap((r) => r.deliveries).find((d) => d.id === selectedDeliveryId) ?? null : null;

  const handleSelectRoute = useCallback((id: string) => {
    setSelectedDeliveryId(null);
    setCalloutPos(null);
    setSelectedRouteId((prev) => prev === id ? null : id);
  }, []);

  const handleDeliveryPress = useCallback(async (delivery: Delivery, routeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedDeliveryId(delivery.id);
    if (mapRef.current) {
      try {
        const pt = await mapRef.current.getPointInView(toPosition(delivery.coordinate));
        setCalloutPos({ x: pt[0], y: pt[1] });
      } catch {
        // map not ready
      }
    }
  }, []);

  const handleClear = useCallback(() => {
    setSelectedRouteId(null);
    setSelectedDeliveryId(null);
    setCalloutPos(null);
  }, []);

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <TabletTopBar
        mode="inner"
        pageTitle="Mapa de Entregas"
        pageSubtitle={selectedRoute?.driver}
        backLabel="Início"
        onBack={() => router.back()}
        userInitial={userInitial}
      />

      <View style={s.body}>
        <LeftPanel
          routes={routes}
          selectedRouteId={selectedRouteId}
          selectedDeliveryId={selectedDeliveryId}
          onSelectRoute={handleSelectRoute}
          onSelectDelivery={(delivery, routeId) => void handleDeliveryPress(delivery, routeId)}
        />

        <View
          style={{ flex: 1, position: "relative" }}
          onLayout={(e) => setMapWidth(e.nativeEvent.layout.width)}
        >
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            styleURL="mapbox://styles/mapbox/dark-v11"
            onPress={() => handleClear()}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
            scaleBarEnabled={false}
          >
            <Camera
              ref={cameraRef}
              zoomLevel={12}
              centerCoordinate={toPosition(RESTAURANT_COORD)}
              animationMode="none"
              animationDuration={0}
            />

            {/* Route polylines — active (in-transit) routes rendered last so they sit on top */}
            {[...routes].sort((a, b) => {
              const aOn = a.deliveries.some(d => d.status === "in-transit") ? 1 : 0;
              const bOn = b.deliveries.some(d => d.status === "in-transit") ? 1 : 0;
              return aOn - bOn;
            }).map((route) => {
              if (!route.geometry || route.geometry.length < 2) return null;
              const isSelected        = selectedRouteId === route.id;
              const isDimmed          = !!selectedRouteId && !isSelected;
              const isCurrentlyActive = route.deliveries.some(d => d.status === "in-transit");
              const color             = ST_COL[route.status];

              const lineColor = isDimmed
                ? `${color}${isCurrentlyActive ? "30" : "18"}`
                : isCurrentlyActive ? color : `${color}30`;
              const lineWidth = isSelected ? 4 : isCurrentlyActive ? 3.5 : 1.5;

              return (
                <ShapeSource
                  key={`${route.id}-src`}
                  id={`${route.id}-src`}
                  shape={{
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: route.geometry.map(toPosition),
                    },
                  }}
                >
                  <LineLayer
                    id={`${route.id}-line`}
                    style={{
                      lineColor,
                      lineWidth,
                      lineDasharray: isCurrentlyActive ? [6, 3] : [4, 4],
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </ShapeSource>
              );
            })}

            {/* Delivery markers */}
            {routes.map((route) =>
              route.deliveries.map((delivery) => {
                const isSelected = selectedDeliveryId === delivery.id;
                const isDimmed   = !!selectedRouteId && selectedRouteId !== route.id;
                return (
                  <MarkerView
                    key={delivery.id}
                    id={delivery.id}
                    coordinate={toPosition(delivery.coordinate)}
                    anchor={{ x: 0.5, y: 1 }}
                    allowOverlap
                  >
                    <Pressable
                      onPress={() => void handleDeliveryPress(delivery, route.id)}
                      style={{ opacity: isDimmed ? 0.25 : 1 }}
                    >
                      <DelivPinView delivery={delivery} selected={isSelected} isNewlyActive={newlyActiveIds.has(delivery.id)} />
                    </Pressable>
                  </MarkerView>
                );
              })
            )}

            {/* Driver markers */}
            {routes.map((route) => {
              const isSelected = selectedRouteId === route.id;
              const isDimmed   = !!selectedRouteId && !isSelected;
              return (
                <MarkerView
                  key={`driver-${route.id}`}
                  id={`driver-${route.id}`}
                  coordinate={toPosition(route.driverCoordinate)}
                  anchor={{ x: 0.5, y: 0.5 }}
                  allowOverlap
                >
                  <Pressable
                    onPress={() => handleSelectRoute(route.id)}
                    style={{ opacity: isDimmed ? 0.25 : 1 }}
                  >
                    <DriverPinView route={route} selected={isSelected} />
                  </Pressable>
                </MarkerView>
              );
            })}

            {/* Store marker */}
            <MarkerView
              id="store"
              coordinate={[-81.65145586094154, 28.348670286695988]}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlap
            >
              <StorePinView />
            </MarkerView>
          </MapView>

          {/* Loading overlay */}
          {isLoading && (
            <View style={s.overlay}>
              <ActivityIndicator size="large" color={D.zippy} />
              <Text style={s.overlayText}>Carregando rotas…</Text>
            </View>
          )}

          {/* Error overlay */}
          {!isLoading && fetchError && (
            <View style={s.overlay}>
              <Text style={s.overlayError}>{fetchError}</Text>
            </View>
          )}

          {/* Delivery callout */}
          {selectedDelivery && selectedRoute && calloutPos && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <DeliveryCallout
                delivery={selectedDelivery}
                route={selectedRoute}
                screenPos={calloutPos}
                mapWidth={mapWidth}
                onClose={handleClear}
              />
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: D.bg },
  body:         { flex: 1, flexDirection: "row", overflow: "hidden" },
  overlay:      { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10 },
  overlayText:  { fontFamily: "Geist_400Regular", fontSize: 13, color: D.faint },
  overlayError: { fontFamily: "Geist_400Regular", fontSize: 13, color: D.zippy },
});


const lp = StyleSheet.create({
  panel: { width: 300, borderRightWidth: 1, borderRightColor: D.line, backgroundColor: D.surf, flexDirection: "column" },
});

const rc = StyleSheet.create({
  card:       { paddingRight: 14, paddingLeft: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: D.line, borderLeftWidth: 3 },
  row1:       { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 8 },
  avatar:     { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Geist_700Bold",        fontSize: 11, color: "#fff", letterSpacing: -0.3 },
  name:       { fontFamily: "Geist_700Bold",        fontSize: 12.5, color: D.text, letterSpacing: -0.2 },
  sub:        { fontFamily: "GeistMono_400Regular", fontSize: 9.5,  color: D.faint, letterSpacing: 0.4 },
  badge:      { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText:  { fontFamily: "GeistMono_700Bold",    fontSize: 9,   letterSpacing: 1.1 },
  delivCard:  { backgroundColor: D.surf2, borderWidth: 1, borderColor: D.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7 },
  delivTop:   { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 1 },
  delivName:  { fontFamily: "Geist_700Bold",        fontSize: 12,   color: D.text,  letterSpacing: -0.2 },
  delivAddr:  { fontFamily: "Geist_400Regular",     fontSize: 10.5, color: D.faint },
  delivBottom:{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  delivEta:   { fontFamily: "GeistMono_600SemiBold",fontSize: 10,   color: D.dim },
  delivDot:   { fontFamily: "Geist_400Regular",     fontSize: 10,   color: D.vfaint },
  delivStop:  { fontFamily: "GeistMono_400Regular", fontSize: 9.5,  color: D.faint },
  nextRow:    { flexDirection: "row", alignItems: "center", gap: 7, opacity: 0.55 },
  nextDot:    { width: 3, height: 3, borderRadius: 1, backgroundColor: D.faint },
  nextName:   { fontFamily: "Geist_400Regular",     fontSize: 11,  color: D.faint, flex: 1 },
  nextEta:    { fontFamily: "GeistMono_400Regular", fontSize: 10,  color: D.vfaint },
});

const pd = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  segment:   { flexDirection: "row", alignItems: "center" },
  connector: { flex: 1, height: 1, minWidth: 8, marginHorizontal: 3 },
  done:      { width: 8,  height: 8,  borderRadius: 4, backgroundColor: D.green },
  active:    { width: 18, height: 8,  borderRadius: 4 },
  pending:   { width: 8,  height: 8,  borderRadius: 4, backgroundColor: D.vfaint },
  count:     { fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.faint, marginLeft: 5 },
});

const dc = StyleSheet.create({
  card:     {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingVertical: 8, paddingRight: 10, paddingLeft: 8,
    borderRadius: 8, borderWidth: 1, borderColor: D.line,
    borderLeftWidth: 3, borderLeftColor: "transparent",
    backgroundColor: D.surf2,
  },
  seq:      { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: D.line, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  seqCheck: { fontSize: 11, color: D.green, fontWeight: "700" },
  seqNum:   { fontFamily: "GeistMono_700Bold", fontSize: 10, lineHeight: 10 },
  customer: { fontFamily: "Geist_700Bold",        fontSize: 11.5, color: D.text, letterSpacing: -0.2 },
  address:  { fontFamily: "Geist_400Regular",     fontSize: 10,   color: D.faint },
  eta:      { fontFamily: "GeistMono_600SemiBold", fontSize: 10,  color: D.dim },
});

const db = StyleSheet.create({
  badge: { borderRadius: 5, borderWidth: 1 },
  text:  { fontFamily: "GeistMono_700Bold", letterSpacing: 0.6 },
});

const mk = StyleSheet.create({
  donePin:      { width: 34, height: 34, borderRadius: 9, backgroundColor: "rgba(52,211,154,0.85)", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  doneTick:     { color: "#fff", fontSize: 17, fontWeight: "700" },
  selRing:      { position: "absolute", top: -5, left: -5, right: -5, bottom: -14, borderRadius: 12, borderWidth: 2.5, opacity: 0.55 },
  pinRect:      { width: 38, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  pinSeq:       { fontFamily: "GeistMono_700Bold", fontSize: 11, color: "#fff", textAlign: "center" },
  pinTail:      { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
  driverCircle: { alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  driverText:   { fontFamily: "Geist_700Bold", color: "#fff" },
  storeOuter:   { width: 40, height: 40, borderRadius: 20, backgroundColor: D.zippy, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  storeRing:    { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  storeCore:    { width: 14, height: 14, borderRadius: 7, backgroundColor: D.zippy },
});


const co = StyleSheet.create({
  box:           { position: "absolute", width: 240, zIndex: 30, backgroundColor: D.surf, borderWidth: 1.5, borderColor: D.lineS, borderRadius: 12, overflow: "hidden" },
  header:        { paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1 },
  headerDot:     { width: 6, height: 6, borderRadius: 2 },
  headerTag:     { fontFamily: "GeistMono_700Bold", fontSize: 9, letterSpacing: 1.5 },
  body:          { padding: 12 },
  customer:      { fontFamily: "Geist_700Bold",        fontSize: 13, color: D.text,   marginBottom: 3 },
  address:       { fontFamily: "Geist_400Regular",     fontSize: 11, color: D.faint,  marginBottom: 8 },
  etaRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  etaLbl:        { fontFamily: "GeistMono_400Regular", fontSize: 8.5, color: D.vfaint, letterSpacing: 1.1 },
  etaVal:        { fontFamily: "GeistMono_700Bold",    fontSize: 13,  color: D.text },
  divider:       { borderTopWidth: 1, borderTopColor: D.line, paddingTop: 9, marginTop: 9 },
  driverRow:     { flexDirection: "row", alignItems: "center", gap: 7 },
  driverAvatar:  { width: 20, height: 20, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  driverInitials:{ fontFamily: "Geist_700Bold", fontSize: 8 },
  driverName:    { fontFamily: "Geist_400Regular", fontSize: 11, color: D.dim, flex: 1 },
});
