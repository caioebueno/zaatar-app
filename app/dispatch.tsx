import POSScreen from "@/app/(app)/pos";
import { TabletTopBar } from "@/components/TabletTopBar";
import UpdateOrderModal from "@/components/dispatch/UpdateOrderModal";
import type { TOrderEditorInitialOrder } from "@/components/dispatch/order-modal/OrderEditorModal";
import { API_BASE_URL } from "@/constants/api";
import { useAuth } from "@/contexts/auth";
import type { TPreparationStepCategory } from "@/types/station";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
//@ts-expect-error
import DispatchRouteMap from "../components/dispatch/DispatchRouteMap";

type TOrderSourcePlatform = "FOODY" | "DOORDASH" | "UBER_EATS" | "SQUARE";

type TDispatchOrder = {
  id: string;
  createdAt: string;
  scheduleFor?: string | null;
  number?: string;
  sourcePlatform?: TOrderSourcePlatform | null;
  tip?: number | null;
  tipAmount?: number | null;
  estimatedDeliveryDurationMinutes: number | number;
  delivered: boolean;
  deliveredAt?: string | null;
  paidAt?: string | null;
  dispatchOrderIndex?: number;
  type: "DELIVERY" | "TAKEAWAY";
  paymentMethod: "CARD" | "CASH" | "ZELLE";
  dispatchId?: string | null;
  costumerId?: string;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
  } | null;
  progressiveDiscountSnapshot?: {
    fullPrice?: number | null;
    discountedPrice?: number | null;
    discountAmount?: number | null;
    selectedPrize?: {
      prizeId?: string;
      prizeName?: string;
      quantity?: number;
      selectedProductIds?: string[];
      selectedProductCounts?: {
        productId: string;
        quantity: number;
      }[];
      availableProducts?: {
        id: string;
        name: string;
      }[];
    } | null;
  } | null;
  redeemedRewards?: {
    id: string;
    quantity?: number | null;
    title?: string | null;
    product?: {
      id: string;
      name: string;
    } | null;
  }[];
  deliveryAddress?: {
    id: string;
    createdAt: string;
    description?: string;
    street: string;
    number: string;
    complement?: string;
    numberComplement?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: string;
    lng?: string;
    deliveryFee?: number;
    expectedHandoffDuration?: number; // seconds, default 300
  } | null;
  orderProducts: {
    id: string;
    productId: string;
    comments?: string;
    comment?: string;
    description?: string;
    product?: {
      id: string;
      name: string;
      price?: number | null;
      categoryId?: string | null;
    };

    amount: number;
    fullAmount: number;
    quantity: number;
    selectedModifierGroupItemIds?: string[];
    selectedModifierGroupItems?: {
      id: string;
      description?: string;
      name?: string;
    }[];
  }[];
  preparationStepCategory?: TPreparationStepCategory[];
};

type TDispatchDriver = {
  id: string;
  createdAt?: string;
  name: string;
  active?: boolean;
  priorityLevel: number;
};

type TDriver = {
  id: string;
  createdAt: string;
  name: string;
  active: boolean;
  priorityLevel: number;
};

type TDispatch = {
  id: string;
  createdAt: string;
  queueIndex?: number | null;
  dispatched: boolean;
  dispatchAt?: string | null;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  estimatedDeliveryDurationMinutes?: number | null;
  estimatedRoundTripDurationMinutes?: number | null;
  driverId?: string | null;
  driver?: TDispatchDriver | null;
  orders: TDispatchOrder[];
};

type TDispatchTab = "ACTIVE" | "COMPLETED";

const FALLBACK_CUSTOMER = "Guest";
const ROUTE_POINT_ADDRESS_FALLBACK = "Endereço indisponível";
const ROUTE_ORIGIN: TRoutePoint = {
  lat: 28.34871749755003,
  lng: -81.65145586075074,
  label: "Origem",
  address: "Zaatar",
  complement: null,
  mapQuery: "28.34871749755003,-81.65145586075074",
};
const MAP_MODAL_SLIDE_DISTANCE = Dimensions.get("window").width;
const DISPATCH_POLL_INTERVAL_MS = 10000;

type TRoutePoint = {
  lat: number;
  lng: number;
  label: string;
  address: string;
  complement: string | null;
  mapQuery: string;
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

function getSortedDrivers(drivers: TDriver[]) {
  return [...drivers].sort((first, second) => {
    if (first.priorityLevel !== second.priorityLevel) {
      return first.priorityLevel - second.priorityLevel;
    }

    return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
  });
}

function parseCoordinate(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRoutePointAddress(order: TDispatchOrder) {
  const deliveryAddress = order.deliveryAddress;
  if (!deliveryAddress) return ROUTE_POINT_ADDRESS_FALLBACK;

  if (typeof deliveryAddress.description === "string" && deliveryAddress.description.trim()) {
    return deliveryAddress.description.trim();
  }

  const streetLine = [deliveryAddress.street, deliveryAddress.number]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(" ");

  const parts = [
    streetLine,
    deliveryAddress.complement,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);

  return parts.length > 0 ? parts.join(", ") : ROUTE_POINT_ADDRESS_FALLBACK;
}

function getDispatchRoutePoints(dispatch: TDispatch): TRoutePoint[] {
  const deliveryPoints: TRoutePoint[] = dispatch.orders
    .map((order) => {
      const lat = parseCoordinate(order.deliveryAddress?.lat);
      const lng = parseCoordinate(order.deliveryAddress?.lng);
      if (lat === null || lng === null) return null;
      const customerName =
        order.customer?.name?.trim() && order.customer.name.trim().length > 0
          ? order.customer.name.trim()
          : FALLBACK_CUSTOMER;
      const orderIdentifier = order.number ?? order.id.slice(0, 6);
      const address = formatRoutePointAddress(order);
      const mapQuery =
        address !== ROUTE_POINT_ADDRESS_FALLBACK
          ? address
          : `${lat.toFixed(6)},${lng.toFixed(6)}`;

      return {
        lat,
        lng,
        label: `${customerName} #${orderIdentifier}`,
        address,
        complement: formatDeliveryInstruction(order),
        mapQuery,
      };
    })
    .filter((point): point is TRoutePoint => point !== null);

  return deliveryPoints;
}

function formatDeliveryInstruction(order: TDispatchOrder) {
  const parts = [order.deliveryAddress?.complement, order.deliveryAddress?.numberComplement]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).join(" ");
}

function toDirectRouteCoordinates(points: TRoutePoint[]): TRouteCoordinate[] {
  return points.map((point) => ({
    latitude: point.lat,
    longitude: point.lng,
  }));
}

type TRouteResult = {
  coordinates: TRouteCoordinate[];
  legDurationsSeconds: number[];
};

async function fetchDrivingRouteCoordinates(
  points: TRoutePoint[],
): Promise<TRouteResult | null> {
  if (points.length < 2) return null;

  const encodedPoints = points
    .map((point) => `${point.lng},${point.lat}`)
    .join(";");

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    routes?: {
      geometry?: { coordinates?: [number, number][] };
      legs?: { duration?: number }[];
    }[];
  };

  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!coordinates || coordinates.length === 0) return null;

  const legDurationsSeconds = (route?.legs ?? []).map((leg) => leg.duration ?? 0);

  return {
    coordinates: coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    legDurationsSeconds,
  };
}

function getRouteRegion(points: TRoutePoint[]): TRouteRegion {
  if (points.length === 0) {
    return {
      latitude: ROUTE_ORIGIN.lat,
      longitude: ROUTE_ORIGIN.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }

  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.02);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

export async function fetchDispatches(token: string) {
  const response = await fetch(`${API_BASE_URL}/dispatches`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Falha ao buscar entregas");
  }

  return response.json() as Promise<TDispatch[]>;
}

export async function fetchDrivers(token: string) {
  const response = await fetch(`${API_BASE_URL}/drivers`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Falha ao buscar motoristas");
  }

  return response.json() as Promise<TDriver[]>;
}

type TUpdateDriverPayload = {
  active?: boolean;
  priorityLevel?: number;
};

export async function updateDriver(
  token: string,
  driverId: string,
  payload: TUpdateDriverPayload,
) {
  if (payload.active === undefined && payload.priorityLevel === undefined) {
    throw new Error("Payload inválido para atualizar motorista");
  }

  const response = await fetch(`${API_BASE_URL}/drivers/${driverId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = (await response.json().catch(() => null)) as
    | TDriver
    | { error?: string; field?: string }
    | null;

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? responseBody.error
        : "Falha ao atualizar motorista";
    throw new Error(message || "Falha ao atualizar motorista");
  }

  if (!responseBody) {
    throw new Error("Resposta inválida ao atualizar motorista");
  }

  return responseBody as TDriver;
}

type TUpdateDispatchStatusPayload = {
  dispatched?: boolean;
  dispatchAt?: string | null;
  dispatchedAt?: string | null;
  driverId?: string | null;
  queueIndex?: number;
};

type TUpdateOrderPayload = {
  paidAt?: string | null;
  paymentMethod?: "CARD" | "CASH" | "ZELLE";
  deliveredAt?: string | null;
};

type TMoveDispatchOrderPayload = {
  createNewDispatch?: boolean;
  targetDispatchId?: string;
  targetIndex?: number;
};

type TMoveDispatchOrderResponse = {
  orderId: string;
  sourceDispatchId: string;
  targetDispatchId: string;
  targetIndex: number;
  createdDispatch: boolean;
};

export async function updateDispatchStatus(
  token: string,
  dispatchId: string,
  payload: TUpdateDispatchStatusPayload,
) {
  const response = await fetch(`${API_BASE_URL}/dispatches/${dispatchId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar despacho");
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }

  return null;
}

export async function moveDispatchOrder(
  orderId: string,
  payload: TMoveDispatchOrderPayload,
  token: string,
): Promise<TMoveDispatchOrderResponse> {
  const normalizedPayload: TMoveDispatchOrderPayload = {};

  if (payload.createNewDispatch === true) {
    normalizedPayload.createNewDispatch = true;
  }

  if (typeof payload.targetIndex === "number" && Number.isFinite(payload.targetIndex)) {
    const nextTargetIndex = Math.floor(payload.targetIndex);
    if (nextTargetIndex > 0) {
      normalizedPayload.targetIndex = nextTargetIndex;
    }
  }

  if (typeof payload.targetDispatchId === "string") {
    const nextTargetDispatchId = payload.targetDispatchId.trim();
    if (nextTargetDispatchId.length > 0) {
      normalizedPayload.targetDispatchId = nextTargetDispatchId;
    }
  }

  const response = await fetch(`${API_BASE_URL}/dispatches/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(normalizedPayload),
  });

  const responseBody = (await response.json().catch(() => null)) as
    | TMoveDispatchOrderResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? responseBody.error
        : "Falha ao mover pedido entre despachos";
    throw new Error(message || "Falha ao mover pedido entre despachos");
  }

  if (!responseBody) {
    throw new Error("Resposta inválida ao mover pedido");
  }

  return responseBody as TMoveDispatchOrderResponse;
}

export async function updateOrder(orderId: string, payload: TUpdateOrderPayload, token: string) {
  const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = (await response.json().catch(() => null)) as
    | TDispatchOrder
    | { error?: string; field?: string }
    | null;

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? responseBody.error
        : "Falha ao atualizar pedido";
    throw new Error(message || "Falha ao atualizar pedido");
  }

  return responseBody;
}

async function finalizeDispatch(dispatchId: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/dispatches/${dispatchId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ completedAt: new Date().toISOString() }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || "Falha ao finalizar despacho");
  }
}

type TWatchDispatchesOptions = {
  token: string;
  intervalMs?: number;
  onDispatches?: (dispatches: TDispatch[]) => void;
  onError?: (error: unknown) => void;
};

export function watchDispatches({
  token,
  intervalMs = DISPATCH_POLL_INTERVAL_MS,
  onDispatches,
  onError,
}: TWatchDispatchesOptions) {
  let isFetching = false;
  let stopped = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function check() {
    if (isFetching || stopped) return;

    try {
      isFetching = true;
      const nextDispatches = await fetchDispatches(token);
      if (stopped) return;

      onDispatches?.(nextDispatches);
    } catch (error) {
      if (stopped) return;
      onError?.(error);
    } finally {
      isFetching = false;
    }
  }

  void check();
  intervalId = setInterval(() => {
    void check();
  }, intervalMs);

  return {
    stop() {
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    refresh() {
      return check();
    },
  };
}

type DispatchOrderCardProps = {
  order: TDispatchOrder;
  dispatchDispatched: boolean;
  actionLabel: string;
  actionDisabled?: boolean;
  showActionButton?: boolean;
  isDimmed?: boolean;
  onOrderPress: () => void;
  onActionPress: () => void;
  onMarkDelivered?: () => void;
  isMarkingDelivered?: boolean;
};

type TOrderDerivedStatus = "ACCEPTED" | "PREPARING" | "DELIVERING" | "DELIVERED";

function hasCompletedPreparationTrack(order: TDispatchOrder) {
  return (order.preparationStepCategory ?? []).some((category) =>
    (category.steps ?? []).some((step) => step.completed)
  );
}

function getDerivedOrderStatus(
  order: TDispatchOrder,
  dispatchDispatched: boolean,
): TOrderDerivedStatus {
  if (order.delivered) return "DELIVERED";
  if (dispatchDispatched) return "DELIVERING";
  if (hasCompletedPreparationTrack(order)) return "PREPARING";
  return "ACCEPTED";
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

function getReferenceDeliveryAt(order: TDispatchOrder) {
  const createdAtMs = new Date(order.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return null;

  const scheduledAtMs = order.scheduleFor ? new Date(order.scheduleFor).getTime() : NaN;
  if (!Number.isNaN(scheduledAtMs) && scheduledAtMs > createdAtMs) {
    return scheduledAtMs;
  }

  return createdAtMs + ONE_HOUR_MS;
}

function getEstimatedDeliveryDurationMs(order: TDispatchOrder) {
  if (
    typeof order.estimatedDeliveryDurationMinutes !== "number" ||
    !Number.isFinite(order.estimatedDeliveryDurationMinutes) ||
    order.estimatedDeliveryDurationMinutes < 0
  ) {
    return 0;
  }

  return order.estimatedDeliveryDurationMinutes * ONE_MINUTE_MS;
}

function useDispatchTimer(dispatchAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const dispatchMs = dispatchAt ? new Date(dispatchAt).getTime() : null;
  const elapsedMs = dispatchMs ? Math.max(0, now - dispatchMs) : 0;
  const remainingMs = dispatchMs ? 0 : 0; // overridden by caller
  return { now, dispatchMs, elapsedMs };
}

function mmss(ms: number) {
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function AddressPulseDot() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1000),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0, 0] });
  return (
    <View style={{ width: 6, height: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Animated.View style={{
        position: "absolute", width: 6, height: 6, borderRadius: 999,
        backgroundColor: "rgba(250,245,238,0.3)", transform: [{ scale }], opacity,
      }} />
      <View style={styles.orderAddressDot} />
    </View>
  );
}

function PulsingDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(600),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0, 0] });

  return (
    <View style={{ width: 6, height: 6, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{
        position: "absolute", width: 6, height: 6, borderRadius: 3,
        backgroundColor: color, transform: [{ scale }], opacity,
      }} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function formatDepartureDeltaValue(deltaMs: number) {
  const absoluteMs = Math.abs(deltaMs);
  const totalMinutes = Math.ceil(absoluteMs / ONE_MINUTE_MS);

  if (totalMinutes > 60) {
    const totalHours = Math.ceil(absoluteMs / ONE_HOUR_MS);
    return `${totalHours} h`;
  }

  return `${totalMinutes} min`;
}

function formatDepartureDeltaMMSS(deltaMs: number) {
  const absoluteMs = Math.abs(deltaMs);
  const totalSeconds = Math.floor(absoluteMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function OrderDepartureTime({ order }: { order: TDispatchOrder }) {
  const [deltaToLeaveMs, setDeltaToLeaveMs] = useState(0);

  useEffect(() => {
    const update = () => {
      const referenceDeliveryAt = getReferenceDeliveryAt(order);
      if (!referenceDeliveryAt) { setDeltaToLeaveMs(0); return; }
      setDeltaToLeaveMs(referenceDeliveryAt - getEstimatedDeliveryDurationMs(order) - Date.now());
    };
    update();
    const timerId = setInterval(update, 1000);
    return () => clearInterval(timerId);
  }, [order]);

  const isLate = deltaToLeaveMs < 0;
  const dotColor = isLate ? "#ff3d14" : "#f2b338";
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(800),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0, 0] });
  return (
    <View style={styles.orderTimerPill}>
      <View style={{ width: 6, height: 6, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{
          position: "absolute", width: 6, height: 6, borderRadius: 999,
          backgroundColor: dotColor, transform: [{ scale }], opacity,
        }} />
        <View style={[styles.orderTimerDot, { backgroundColor: dotColor }]} />
      </View>
      <Text style={[styles.orderTimerText, isLate && styles.orderTimerTextLate]}>
        {formatDepartureDeltaMMSS(deltaToLeaveMs)}
      </Text>
    </View>
  );
}

function OrderDepartureBadge({ order }: { order: TDispatchOrder }) {
  const [deltaToLeaveMs, setDeltaToLeaveMs] = useState(0);

  useEffect(() => {
    const update = () => {
      const referenceDeliveryAt = getReferenceDeliveryAt(order);
      if (!referenceDeliveryAt) {
        setDeltaToLeaveMs(0);
        return;
      }

      const leaveByAt = referenceDeliveryAt - getEstimatedDeliveryDurationMs(order);
      setDeltaToLeaveMs(leaveByAt - Date.now());
    };

    update();
    const timerId = setInterval(update, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [order]);

  const isLate = deltaToLeaveMs < 0;
  const valueLabel = formatDepartureDeltaValue(deltaToLeaveMs);
  const label = isLate ? `${valueLabel} atrasado` : `${valueLabel} para sair`;

  return (
    <View style={[styles.departureBadge, isLate && styles.departureBadgeLate]}>
      <Text style={[styles.departureBadgeText, isLate && styles.departureBadgeTextLate]}>
        {label}
      </Text>
    </View>
  );
}

function formatMinutes(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
    return "-";
  }
  return `${Math.round(minutes)} min`;
}

type TUrgencyTone = "neutral" | "warn" | "late" | "live" | "done";

function useOrderUrgency(order: TDispatchOrder, dispatchDispatched: boolean): { tone: TUrgencyTone; label: string } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (order.delivered) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [order.delivered]);
  if (order.delivered) return { tone: "done", label: "Entregue" };
  const referenceDeliveryAt = getReferenceDeliveryAt(order);
  if (!referenceDeliveryAt) return { tone: "neutral", label: "Sem previsão" };
  if (dispatchDispatched) {
    const deltaMs = referenceDeliveryAt - now;
    const tone: TUrgencyTone = deltaMs < 0 ? "late" : "live";
    const absMin = Math.max(1, Math.ceil(Math.abs(deltaMs) / ONE_MINUTE_MS));
    return { tone, label: deltaMs < 0 ? `Atrasado ${absMin} min` : `${absMin} min para entregar` };
  }
  const leaveByAt = referenceDeliveryAt - getEstimatedDeliveryDurationMs(order);
  const deltaMs = leaveByAt - now;
  const tone: TUrgencyTone = deltaMs < 0 ? "late" : deltaMs < 10 * ONE_MINUTE_MS ? "warn" : "neutral";
  const absMin = Math.max(1, Math.ceil(Math.abs(deltaMs) / ONE_MINUTE_MS));
  return { tone, label: deltaMs < 0 ? `Atrasado ${absMin} min` : `${absMin} min para sair` };
}

const URGENCY_TONE_STYLE: Record<TUrgencyTone, { bg: string; fg: string; icon: string }> = {
  neutral: { bg: "rgba(108,98,89,0.18)", fg: "#A89B90", icon: "clock" },
  warn:    { bg: "rgba(255,61,20,0.14)",  fg: "#FF7A5C", icon: "clock" },
  late:    { bg: "rgba(255,61,20,0.15)",  fg: "#FF3D14", icon: "alert-circle" },
  live:    { bg: "rgba(0,168,102,0.18)",  fg: "#34D98A", icon: "navigation" },
  done:    { bg: "rgba(0,168,102,0.15)",  fg: "#34D98A", icon: "check-circle" },
};

function OrderUrgencyChip({ tone, label }: { tone: TUrgencyTone; label: string }) {
  const s = URGENCY_TONE_STYLE[tone];
  return (
    <View style={[styles.urgencyChip, { backgroundColor: s.bg }]}>
      <Feather name={s.icon as any} size={12} color={s.fg} />
      <Text style={[styles.urgencyChipText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}


const ORDER_SOURCE_CFG: Partial<Record<TOrderSourcePlatform, { label: string; fg: string; bg: string }>> = {
  DOORDASH:  { label: "DoorDash",  fg: "#FF6A4D", bg: "rgba(235,23,0,0.14)" },
  UBER_EATS: { label: "Uber Eats", fg: "#4FD87A", bg: "rgba(6,193,103,0.14)" },
  SQUARE:    { label: "Square",    fg: "#5AA9FF", bg: "rgba(0,106,255,0.14)" },
};

// External marketplace orders (imported via Square) show a source badge.
// Internal Foody orders (and missing/unknown sources) render no badge.
function OrderSourceBadge({ source }: { source?: TOrderSourcePlatform | null }) {
  if (!source) return null;
  const cfg = ORDER_SOURCE_CFG[source];
  if (!cfg) return null;
  return (
    <View style={[styles.sourceBadge, { backgroundColor: cfg.bg }]}>
      <Feather name="external-link" size={10} color={cfg.fg} />
      <Text style={[styles.sourceBadgeText, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

const DISPATCH_STATUS_CFG = {
  pending: { bg: "rgba(108,98,89,0.15)", bar: "#6C6259", fg: "#A89B90", icon: "clock" as const },
  enroute: { bg: "rgba(255,61,20,0.14)", bar: "#FF3D14", fg: "#FF7A5C", icon: "navigation" as const },
  done:    { bg: "rgba(0,168,102,0.15)", bar: "#00A866", fg: "#34D98A", icon: "check-circle" as const },
};

function DispatchStatusStrip({ state, returnLabel }: {
  state: "pending" | "enroute" | "done";
  returnLabel?: string | null;
}) {
  const s = DISPATCH_STATUS_CFG[state];
  const stateLabel = { pending: "Não despachada", enroute: "Em rota", done: "Concluída" }[state];
  return (
    <View style={[styles.statusStrip, { backgroundColor: s.bg, borderLeftColor: s.bar }]}>
      <Feather name={s.icon} size={17} color={s.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusStripTitle, { color: s.fg }]}>{stateLabel}</Text>
      </View>
      {returnLabel != null && (
        <Text style={[styles.statusStripReturn, { color: s.fg }]}>{returnLabel}</Text>
      )}
    </View>
  );
}

function getDispatchQueueIndex(dispatch: TDispatch) {
  const queueIndexRaw = dispatch.queueIndex;
  const queueIndex =
    typeof queueIndexRaw === "number"
      ? queueIndexRaw
      : typeof queueIndexRaw === "string"
        ? Number(queueIndexRaw.trim().replace(/[^\d.-]/g, ""))
        : NaN;

  if (!Number.isFinite(queueIndex)) {
    return null;
  }

  return Math.floor(queueIndex);
}

function compareDispatchQueueOrder(first: TDispatch, second: TDispatch) {
  const firstQueueIndex = getDispatchQueueIndex(first) ?? Number.MAX_SAFE_INTEGER;
  const secondQueueIndex = getDispatchQueueIndex(second) ?? Number.MAX_SAFE_INTEGER;

  if (firstQueueIndex !== secondQueueIndex) {
    return firstQueueIndex - secondQueueIndex;
  }

  return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
}

function getSortedDispatchOrders(orders: TDispatchOrder[]) {
  return [...orders].sort((first, second) => {
    const firstIndex = first.dispatchOrderIndex ?? Number.MAX_SAFE_INTEGER;
    const secondIndex = second.dispatchOrderIndex ?? Number.MAX_SAFE_INTEGER;

    if (firstIndex !== secondIndex) {
      return firstIndex - secondIndex;
    }

    return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
  });
}

function getSortedDispatches(dispatches: TDispatch[]) {
  return [...dispatches].sort(compareDispatchQueueOrder);
}

function toOrderEditorInitialOrder(order: TDispatchOrder): TOrderEditorInitialOrder {
  return {
    id: order.id,
    sourcePlatform: order.sourcePlatform,
    type: order.type,
    paymentMethod: order.paymentMethod,
    tip: typeof order.tip === "number" && Number.isFinite(order.tip) ? order.tip : null,
    tipAmount:
      typeof order.tipAmount === "number" && Number.isFinite(order.tipAmount)
        ? order.tipAmount
        : null,
    progressiveDiscountAmount:
      typeof order.progressiveDiscountSnapshot?.discountAmount === "number" &&
      Number.isFinite(order.progressiveDiscountSnapshot.discountAmount)
        ? order.progressiveDiscountSnapshot.discountAmount
        : null,
    selectedPrize: order.progressiveDiscountSnapshot?.selectedPrize
      ? {
          prizeId: order.progressiveDiscountSnapshot.selectedPrize.prizeId,
          prizeName: order.progressiveDiscountSnapshot.selectedPrize.prizeName,
          quantity: order.progressiveDiscountSnapshot.selectedPrize.quantity,
          selectedProductIds:
            order.progressiveDiscountSnapshot.selectedPrize.selectedProductIds,
          selectedProductCounts:
            order.progressiveDiscountSnapshot.selectedPrize.selectedProductCounts,
          availableProducts:
            order.progressiveDiscountSnapshot.selectedPrize.availableProducts,
        }
      : null,
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
        }
      : null,
    deliveryAddress: order.deliveryAddress
      ? {
          id: order.deliveryAddress.id,
          description: order.deliveryAddress.description,
          street: order.deliveryAddress.street,
          number: order.deliveryAddress.number,
          city: order.deliveryAddress.city,
          state: order.deliveryAddress.state,
          zipCode: order.deliveryAddress.zipCode,
          complement: order.deliveryAddress.complement,
          deliveryFee: order.deliveryAddress.deliveryFee,
          lat: order.deliveryAddress.lat,
          lng: order.deliveryAddress.lng,
        }
      : null,
    orderProducts: order.orderProducts.map((orderProduct) => ({
      id: orderProduct.id,
      productId: orderProduct.productId,
      quantity: orderProduct.quantity,
      amount: orderProduct.amount,
      comment: orderProduct.comments ?? orderProduct.comment ?? orderProduct.description,
      product: orderProduct.product
        ? {
            id: orderProduct.product.id,
            name: orderProduct.product.name,
            price:
              typeof orderProduct.product.price === "number" &&
              Number.isFinite(orderProduct.product.price)
                ? orderProduct.product.price
                : null,
          }
        : undefined,
      selectedModifierGroupItems: orderProduct.selectedModifierGroupItems,
    })),
  };
}

function DispatchOrderCard({
  order,
  dispatchDispatched,
  actionLabel,
  actionDisabled,
  showActionButton = true,
  isDimmed,
  onOrderPress,
  onActionPress,
  onMarkDelivered,
  isMarkingDelivered,
}: DispatchOrderCardProps) {
  type TDispatchOrderItemLine = {
    key: string;
    label: string;
    isPrize?: boolean;
    isReward?: boolean;
  };
  const customerName = (order.customer?.name ?? FALLBACK_CUSTOMER).split(" ")[0];
  const customerPhone = order.customer?.phone?.trim() || null;
  const deliveryInstruction = formatDeliveryInstruction(order);
  const orderStatus = getDerivedOrderStatus(order, dispatchDispatched);
  const isTakeaway = order.type === "TAKEAWAY";
  const [isExpanded] = useState(false);
  const handleOpenCustomerWhatsApp = async () => {
    if (!customerPhone) {
      Alert.alert("Telefone indisponível", "Este cliente não possui telefone para contato.");
      return;
    }

    const digitsOnly = customerPhone.replace(/\D/g, "");
    if (!digitsOnly) {
      Alert.alert("Telefone inválido", "Não foi possível abrir o WhatsApp para este número.");
      return;
    }

    const phoneWithCountryCode = digitsOnly.length === 10 ? `1${digitsOnly}` : digitsOnly;
    const whatsappUrl = `https://wa.me/${phoneWithCountryCode}`;

    try {
      await Linking.openURL(whatsappUrl);
    } catch {
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    }
  };

  const regularOrderItems: TDispatchOrderItemLine[] =
    order.orderProducts.length > 0
      ? order.orderProducts.map((orderProduct, index) => {
        const productName = orderProduct.product?.name ?? "Item sem nome";
        return {
          key: `regular-${order.id}-${orderProduct.id || index}`,
          label: `${orderProduct.quantity}x  ${productName}`,
        };
      })
      : [
        {
          key: `regular-fallback-${order.id}`,
          label: "1x  Item do pedido",
        },
      ];

  const rewardOrderItems: TDispatchOrderItemLine[] = (order.redeemedRewards ?? []).map(
    (reward, index) => ({
      key: `reward-${order.id}-${reward.id || index}`,
      label: `${
        typeof reward.quantity === "number" && Number.isFinite(reward.quantity) && reward.quantity > 0
          ? Math.round(reward.quantity)
          : 1
      }x  ${reward.product?.name ?? reward.title ?? "Reward item"}`,
      isReward: true,
    }),
  );

  const selectedPrize = order.progressiveDiscountSnapshot?.selectedPrize;
  const availablePrizeProducts = selectedPrize?.availableProducts ?? [];
  const prizeProductNameById = new Map(
    availablePrizeProducts.map((product) => [product.id, product.name]),
  );

  let prizeOrderItems: TDispatchOrderItemLine[] = [];

  if ((selectedPrize?.selectedProductCounts?.length ?? 0) > 0) {
    prizeOrderItems = selectedPrize.selectedProductCounts.map((selectedProduct, index) => {
      const productName =
        prizeProductNameById.get(selectedProduct.productId) ?? "Prize item";

      return {
        key: `prize-count-${order.id}-${selectedProduct.productId}-${index}`,
        label: `${selectedProduct.quantity}x  ${productName}`,
        isPrize: true,
      };
    });
  } else if ((selectedPrize?.selectedProductIds?.length ?? 0) > 0) {
    const countedProducts = new Map<string, number>();

    for (const productId of selectedPrize.selectedProductIds) {
      countedProducts.set(productId, (countedProducts.get(productId) ?? 0) + 1);
    }

    prizeOrderItems = Array.from(countedProducts.entries()).map(([productId, quantity]) => {
      const productName = prizeProductNameById.get(productId) ?? "Prize item";

      return {
        key: `prize-id-${order.id}-${productId}`,
        label: `${quantity}x  ${productName}`,
        isPrize: true,
      };
    });
  } else if (selectedPrize?.prizeName) {
    prizeOrderItems = [
      {
        key: `prize-name-${order.id}`,
        label: `1x  ${selectedPrize.prizeName}`,
        isPrize: true,
      },
    ];
  }

  const orderItems = [...regularOrderItems, ...rewardOrderItems, ...prizeOrderItems];
  const hasOrderItems = orderItems.length > 0;

  const { tone: urgencyTone, label: urgencyLabel } = useOrderUrgency(order, dispatchDispatched);
  const urgencyRailColor = { neutral: "#6C6259", warn: "#FF7A5C", late: "#FF3D14", live: "#FF7A5C", done: "#00A866" }[urgencyTone];

  return (
    <View style={[styles.orderCard2, isDimmed && styles.orderCardDimmed]}>
      <View style={[styles.orderCard2Rail, { backgroundColor: urgencyRailColor }]} />
      <View style={{ flex: 1 }}>
        <Pressable style={styles.orderCard2Body} onPress={onOrderPress}>
          {/* ID + name + urgency chip */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
              <Text style={styles.orderCard2Id}>#{order.number ?? "—"}</Text>
              <Text style={styles.orderCard2Name} numberOfLines={1}>{customerName}</Text>
              <OrderSourceBadge source={order.sourcePlatform} />
            </View>
            <OrderUrgencyChip tone={urgencyTone} label={urgencyLabel} />
          </View>

          {/* Address + complement */}
          {!isTakeaway && order.deliveryAddress && (
            <View style={{ gap: 3, marginTop: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="map-pin" size={12} color="#9C8E83" />
                <Text style={styles.orderCard2Address}>
                  {[order.deliveryAddress.street, order.deliveryAddress.city].filter(Boolean).join(", ")}
                </Text>
              </View>
              {(order.deliveryAddress.complement || order.deliveryAddress.numberComplement) && (
                <View style={{ paddingLeft: 18, flexDirection: "row", gap: 5, alignItems: "baseline" }}>
                  <Text style={styles.orderCard2ComplLabel}>Compl:</Text>
                  <Text style={styles.orderCard2Compl}>
                    {[order.deliveryAddress.complement, order.deliveryAddress.numberComplement].filter(Boolean).join(" ")}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Note (fallback for deliveryInstruction not already in complement) */}
          {deliveryInstruction && !order.deliveryAddress?.complement && !order.deliveryAddress?.numberComplement && (
            <View style={styles.noteContainer}>
              <View style={styles.noteInner}>
                <Feather name="file-text" size={12} color="#f2b338" />
                <Text style={styles.noteText}>{deliveryInstruction}</Text>
              </View>
            </View>
          )}

          {/* Items */}
          {hasOrderItems && (
            <View style={{ flexDirection: "column", gap: 1, marginTop: 4 }}>
              {orderItems.map((item) => (
                <Text key={item.key} style={styles.orderCard2Item}>
                  {item.label.replace(/^(\d+)x {2}/, (_, n: string) => `${n}× `)}
                </Text>
              ))}
            </View>
          )}
        </Pressable>

        {/* Footer actions */}
        {!isTakeaway && (showActionButton || (dispatchDispatched && !order.delivered)) && (
          <View style={styles.orderCard2Footer}>
            {dispatchDispatched && !order.delivered && onMarkDelivered && (
              <Pressable
                style={[styles.orderCard2BtnSuccess, isMarkingDelivered && styles.orderMoveButtonDisabled]}
                disabled={isMarkingDelivered}
                onPress={onMarkDelivered}
              >
                <Feather name="check" size={14} color="#34D98A" />
                <Text style={styles.orderCard2BtnSuccessText}>
                  {isMarkingDelivered ? "Marcando..." : "Marcar como entregue"}
                </Text>
              </Pressable>
            )}
            {showActionButton && (
              <Pressable
                style={[styles.orderCard2BtnGhost, actionLabel === "Cancelar" && styles.orderMoveButtonCancel, actionDisabled && styles.orderMoveButtonDisabled]}
                disabled={actionDisabled}
                onPress={onActionPress}
              >
                <Feather
                  name={actionLabel === "Cancelar" ? "x" : "repeat"}
                  size={13}
                  color={actionLabel === "Cancelar" ? "#ff3d14" : "#C8BCB0"}
                />
                <Text style={[styles.orderCard2BtnGhostText, actionLabel === "Cancelar" && styles.orderMoveButtonTextCancel]}>
                  {actionLabel}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

type DispatchColumnProps = {
  dispatch: TDispatch;
  targetQueueIndex: number | null;
  drivers: TDriver[];
  driversOnDelivery: Set<string>;
  isDispatching: boolean;
  isAssigningDriver: boolean;
  isQueueUpdating: boolean;
  isQueueMoveMode: boolean;
  isQueueSelected: boolean;
  movingOrderId: string | null;
  isMoveBusy: boolean;
  movingSourceDispatchId: string | null;
  movingSourceOrderIndex: number | null;
  onDispatch: (dispatchId: string) => void;
  onAssignDriver: (dispatchId: string, driverId: string | null) => void;
  onStartMoveDispatchQueue: (dispatchId: string) => void;
  onCancelMoveDispatchQueue: () => void;
  onMoveDispatchQueueToPosition: (targetQueueIndex: number) => void;
  onStartMove: (orderId: string, sourceDispatchId: string, sourceOrderIndex: number) => void;
  onCancelMove: () => void;
  onMoveToIndex: (targetDispatchId: string, targetIndex: number) => void;
  onDispatchTakeawayOrder: (orderId: string) => void;
  isTakeawayOrderDispatchingById: (orderId: string) => boolean;
  onOpenOrder: (order: TDispatchOrder) => void;
  onOpenMap: (dispatch: TDispatch) => void;
  isFirstInQueue: boolean;
  isLastInQueue: boolean;
  onMoveQueueLeft: () => void;
  onMoveQueueRight: () => void;
  onMarkOrderDelivered: (orderId: string) => void;
  markingOrderDeliveredById: Record<string, boolean>;
  onFinalize: (dispatchId: string) => void;
  isFinalizing: boolean;
};

type TDispatchTypeBadge = {
  key: "delivery" | "takeaway";
  label: "Entrega" | "Retirada";
};

function hasTimestampValue(value?: string | null) {
  return typeof value === "string" ? value.trim().length > 0 : false;
}

function isDispatchCompleted(dispatch: TDispatch) {
  return hasTimestampValue(dispatch.completedAt);
}

function canFinalizeDispatch(dispatch: TDispatch): boolean {
  if (!dispatch.dispatched || isDispatchCompleted(dispatch)) return false;
  const isTakeaway = dispatch.orders.every((o) => o.type === "TAKEAWAY");
  if (isTakeaway) return true;
  return dispatch.orders.every((o) => o.delivered);
}

function getDispatchTypeBadges(dispatch: TDispatch): TDispatchTypeBadge[] {
  const hasDeliveryOrder = dispatch.orders.some((order) => order.type === "DELIVERY");
  const hasTakeawayOrder = dispatch.orders.some((order) => order.type === "TAKEAWAY");
  const badges: TDispatchTypeBadge[] = [];

  if (hasDeliveryOrder) {
    badges.push({ key: "delivery", label: "Entrega" });
  }

  if (hasTakeawayOrder) {
    badges.push({ key: "takeaway", label: "Retirada" });
  }

  return badges;
}

type TDriverStatus = "rastreando" | "entrega" | "semsinal";

function DriverSelectorModal({
  drivers,
  driversOnDelivery,
  currentDriverId,
  onSelect,
  onClose,
}: {
  drivers: TDriver[];
  driversOnDelivery: Set<string>;
  currentDriverId: string | null | undefined;
  onSelect: (driverId: string | null) => void;
  onClose: () => void;
}) {
  const getStatus = (d: TDriver): TDriverStatus =>
    driversOnDelivery.has(d.id) ? "entrega" : d.active ? "rastreando" : "semsinal";

  const rank: Record<TDriverStatus, number> = { rastreando: 0, entrega: 1, semsinal: 2 };
  const sorted = [...drivers].sort((a, b) => rank[getStatus(a)] - rank[getStatus(b)]);

  const statusCfg: Record<TDriverStatus, { label: string; dot: string; fg: string; bg: string }> = {
    rastreando: { label: "Rastreando", dot: "#34D98A", fg: "#34D98A", bg: "rgba(0,168,102,0.12)" },
    entrega:    { label: "Em entrega", dot: "#FF7A5C", fg: "#FF7A5C", bg: "rgba(255,61,20,0.12)" },
    semsinal:   { label: "Sem sinal",  dot: "#6C6259", fg: "#9C8E83", bg: "rgba(239,231,218,0.06)" },
  };

  const hasCurrent = !!currentDriverId;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.driverSelectorBackdrop} onPress={onClose}>
        <Pressable style={styles.driverSelectorPanel} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.driverSelectorHeader}>
            <View style={styles.driverSelectorIconWrap}>
              <Feather name={hasCurrent ? "repeat" : "user-plus"} size={19} color="#FF3D14" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.driverSelectorTitle}>
                {hasCurrent ? "Trocar motorista" : "Atribuir motorista"}
              </Text>
              <Text style={styles.driverSelectorSub} numberOfLines={1}>
                {hasCurrent
                  ? `Atual: ${drivers.find((d) => d.id === currentDriverId)?.name ?? ""}`
                  : "Escolha um motorista"}
              </Text>
            </View>
            <Pressable style={styles.driverSelectorCloseBtn} onPress={onClose}>
              <Feather name="x" size={17} color="rgba(250,245,238,0.7)" />
            </Pressable>
          </View>

          {/* List */}
          <ScrollView
            style={styles.driverSelectorList}
            contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {sorted.map((driver) => {
              const status = getStatus(driver);
              const cfg = statusCfg[status];
              const isCurrent = driver.id === currentDriverId;
              const initials = driver.name.split(" ").filter(Boolean).map((w: string) => w[0].toUpperCase()).slice(0, 2).join("");

              return (
                <Pressable
                  key={driver.id}
                  onPress={() => { onSelect(driver.id); onClose(); }}
                  style={[
                    styles.driverSelectorRow,
                    isCurrent && styles.driverSelectorRowCurrent,
                  ]}
                >
                  <View style={[styles.driverSelectorAvatar, status === "semsinal" && styles.driverSelectorAvatarDisabled]}>
                    <Text style={styles.driverSelectorAvatarText}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text style={[styles.driverSelectorName, status === "semsinal" && { color: "#9C8E83" }]} numberOfLines={1}>
                        {driver.name}
                      </Text>
                      {isCurrent && (
                        <View style={styles.driverSelectorCurrentBadge}>
                          <Text style={styles.driverSelectorCurrentBadgeText}>Atual</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.driverSelectorPriority}>P{driver.priorityLevel}</Text>
                  </View>
                  <View style={[styles.driverSelectorStatusBadge, { backgroundColor: cfg.bg }]}>
                    <View style={[styles.driverSelectorStatusDot, { backgroundColor: cfg.dot }]} />
                    <Text style={[styles.driverSelectorStatusText, { color: cfg.fg }]}>{cfg.label}</Text>
                  </View>
                  <View style={styles.driverSelectorRowIcon}>
                    {isCurrent
                      ? <Feather name="check" size={18} color="#FF3D14" />
                      : <Feather name="chevron-right" size={17} color="rgba(250,245,238,0.3)" />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DispatchColumn({
  dispatch,
  targetQueueIndex,
  drivers,
  driversOnDelivery,
  isDispatching,
  isAssigningDriver,
  isQueueUpdating,
  isQueueMoveMode,
  isQueueSelected,
  movingOrderId,
  isMoveBusy,
  movingSourceDispatchId,
  movingSourceOrderIndex,
  onDispatch,
  onAssignDriver,
  onStartMoveDispatchQueue,
  onCancelMoveDispatchQueue,
  onMoveDispatchQueueToPosition,
  onStartMove,
  onCancelMove,
  onMoveToIndex,
  onDispatchTakeawayOrder,
  isTakeawayOrderDispatchingById,
  onOpenOrder,
  onOpenMap,
  isFirstInQueue,
  isLastInQueue,
  onMoveQueueLeft,
  onMoveQueueRight,
  onMarkOrderDelivered,
  markingOrderDeliveredById,
  onFinalize,
  isFinalizing,
}: DispatchColumnProps) {
  const driverName = dispatch.driver?.name?.trim();
  const hasDriver = !!driverName;
  const driverInitials = driverName ? driverName.split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join("") : null;
  const sortedOrders = getSortedDispatchOrders(dispatch.orders);
  const dispatchTypeBadges = getDispatchTypeBadges(dispatch);
  const isDispatchButtonDisabled = dispatch.dispatched || isDispatching;
  const isMoveMode = !!movingOrderId;
  const isTakeaway = dispatch.orders[0]?.type === 'TAKEAWAY'
  const { elapsedMs } = useDispatchTimer(
    dispatch.dispatched ? (dispatch.dispatchedAt ?? dispatch.dispatchAt) : null
  );
  const totalHandoffMinutes = sortedOrders.reduce(
    (sum, o) => sum + (o.deliveryAddress?.expectedHandoffDuration ?? 300) / 60, 0
  );
  const roundTripMs = ((dispatch.estimatedRoundTripDurationMinutes ?? 0) + totalHandoffMinutes) * 60 * 1000;
  const remainingMs = Math.max(0, roundTripMs - elapsedMs);
  const [isDriverPickerOpen, setIsDriverPickerOpen] = useState(false);
  const sortedDrivers = useMemo(() => getSortedDrivers(drivers), [drivers]);
  const selectableDrivers = useMemo(() => sortedDrivers, [sortedDrivers]);

  useEffect(() => {
    if (!isTakeaway) return;
    setIsDriverPickerOpen(false);
  }, [isTakeaway]);

  const isCompleted = isDispatchCompleted(dispatch);
  const dispatchState: "pending" | "enroute" | "done" =
    isCompleted ? "done" : dispatch.dispatched ? "enroute" : "pending";
  const renderInsertSlot = (targetIndex: number) => {
    if (isTakeaway) return <></>;

    const isSamePosition =
      movingSourceDispatchId === dispatch.id &&
      movingSourceOrderIndex === targetIndex;
    const isImmediateAfterSamePosition =
      movingSourceDispatchId === dispatch.id &&
      movingSourceOrderIndex !== null &&
      movingSourceOrderIndex + 1 === targetIndex;

    if (isSamePosition || isImmediateAfterSamePosition) {
      return (
        <></>
      );
    }

    return (
      <Pressable
        key={`slot-${dispatch.id}-${targetIndex}`}
        style={[styles.dispatchInsertSlot, isMoveBusy && styles.dispatchInsertSlotDisabled]}
        onPress={() => onMoveToIndex(dispatch.id, targetIndex)}
        disabled={isMoveBusy}
      >
        {isMoveBusy
          ? <ActivityIndicator size="small" color="#ff3d14" />
          : <Feather name="plus" size={19} color="#ff3d14" />
        }
      </Pressable>
    );
  };

  return (
   <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
     <View  style={styles.dispatchColumn}>
      <View style={styles.dispatchSummaryCard}>
        {/* Card header */}
        <View style={styles.dispatchCardHeader2}>
          <View style={[styles.dispatchTypeIconWrap, isTakeaway ? styles.dispatchTypeIconWrapTakeaway : styles.dispatchTypeIconWrapDelivery]}>
            <Feather name={isTakeaway ? "shopping-bag" : "truck"} size={19} color={isTakeaway ? "#f2b338" : "#ff3d14"} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dispatchCardHeader2Title}>{isTakeaway ? "Retirada" : "Entrega"}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable
              style={[styles.dispatchNavButton, (isQueueUpdating || isFirstInQueue) && styles.dispatchNavButtonDisabled]}
              disabled={isQueueUpdating || isFirstInQueue}
              onPress={onMoveQueueLeft}
            >
              <Feather name="chevron-left" size={14} color="rgba(250,245,238,0.6)" />
            </Pressable>
            <Pressable
              style={[styles.dispatchNavButton, (isQueueUpdating || isLastInQueue) && styles.dispatchNavButtonDisabled]}
              disabled={isQueueUpdating || isLastInQueue}
              onPress={onMoveQueueRight}
            >
              <Feather name="chevron-right" size={14} color="rgba(250,245,238,0.6)" />
            </Pressable>
          </View>
        </View>

        {/* Dispatch level — delivery */}
        {!isTakeaway && (
          <View style={styles.dispatchLevel}>
            <DispatchStatusStrip
              state={dispatchState}
              returnLabel={dispatchState === "enroute" ? `${mmss(remainingMs)} p/ voltar` : null}
            />

            {/* Driver row */}
            <Pressable
              style={[styles.driverRow2, isAssigningDriver && { opacity: 0.6 }]}
              disabled={isAssigningDriver}
              onPress={() => setIsDriverPickerOpen((p) => !p)}
            >
              <View style={[styles.driverRow2Avatar, hasDriver && styles.driverRow2AvatarFilled]}>
                {driverInitials ? (
                  <Text style={styles.driverRow2AvatarText}>{driverInitials}</Text>
                ) : (
                  <Feather name="user" size={16} color="rgba(239,231,218,0.3)" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverRow2Name, !hasDriver && styles.driverRow2NameEmpty]}>
                  {hasDriver ? driverName : "Sem motorista"}
                </Text>
              </View>
              <View style={[styles.driverRow2ActionBtn, hasDriver ? styles.driverRow2ActionBtnSecondary : styles.driverRow2ActionBtnPrimary]}>
                <Feather name={hasDriver ? "repeat" : "user-plus"} size={13} color={hasDriver ? "#C8BCB0" : "#FF3D14"} />
                <Text style={[styles.driverRow2ActionText, hasDriver && styles.driverRow2ActionTextSecondary]}>
                  {hasDriver ? "Trocar" : "Atribuir"}
                </Text>
              </View>
            </Pressable>

            {/* Driver selector modal */}
            {isDriverPickerOpen && (
              <DriverSelectorModal
                drivers={sortedDrivers}
                driversOnDelivery={driversOnDelivery}
                currentDriverId={dispatch.driverId}
                onSelect={(driverId) => { onAssignDriver(dispatch.id, driverId); }}
                onClose={() => setIsDriverPickerOpen(false)}
              />
            )}

            {/* ETA boxes */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={styles.etaBox}>
                <Text style={styles.etaBoxLabel}>{dispatchState === "enroute" ? "EM ROTA A" : "ENTREGA"}</Text>
                <Text style={[styles.etaBoxValue, dispatchState === "enroute" && { color: "#FF7A5C" }]}>
                  {dispatchState === "enroute"
                    ? (sortedOrders.find((o) => !o.delivered)?.number
                        ? `#${sortedOrders.find((o) => !o.delivered)!.number}`
                        : "Em rota")
                    : dispatchState === "done" ? "—"
                    : formatMinutes((dispatch.estimatedDeliveryDurationMinutes ?? 0) + totalHandoffMinutes)}
                </Text>
              </View>
              <View style={styles.etaBox}>
                <Text style={styles.etaBoxLabel}>
                  {dispatchState === "enroute" ? "VOLTA EM" : dispatchState === "done" ? "EM ROTA POR" : "IDA E VOLTA"}
                </Text>
                <Text style={[styles.etaBoxValue, dispatchState === "done" && { color: "#34D98A" }]}>
                  {dispatchState === "enroute" ? mmss(remainingMs) : formatMinutes((dispatch.estimatedRoundTripDurationMinutes ?? 0) + totalHandoffMinutes)}
                </Text>
              </View>
            </View>

            {/* Actions */}
            {dispatchState === "pending" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[styles.dispatchBtn2Primary, (!hasDriver || isDispatching || dispatch.dispatched) && styles.dispatchBtn2PrimaryDisabled]}
                  onPress={() => onDispatch(dispatch.id)}
                  disabled={!hasDriver || isDispatching || dispatch.dispatched}
                >
                  <Feather name="send" size={15} color={(!hasDriver || isDispatching) ? "rgba(250,245,238,0.45)" : "#ffffff"} />
                  <Text style={[styles.dispatchBtn2PrimaryText, (!hasDriver || isDispatching) && styles.dispatchBtn2PrimaryTextDisabled]}>
                    {isDispatching ? "Despachando..." : "Despachar"}
                  </Text>
                </Pressable>
                <Pressable style={styles.dispatchBtn2Secondary} onPress={() => onOpenMap(dispatch)}>
                  <Feather name="compass" size={16} color="#FF3D14" />
                  <Text style={styles.dispatchBtn2SecondaryText}>Ver rota</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.dispatchBtn2Route, { flex: 1 }]} onPress={() => onOpenMap(dispatch)}>
                  <Feather name="compass" size={16} color="#FF3D14" />
                  <Text style={styles.dispatchBtn2RouteText}>Ver rota</Text>
                </Pressable>
                {canFinalizeDispatch(dispatch) && (
                  <Pressable
                    style={[styles.dispatchBtn2Primary, isFinalizing && styles.dispatchBtn2PrimaryDisabled]}
                    onPress={() => onFinalize(dispatch.id)}
                    disabled={isFinalizing}
                  >
                    <Feather name="check-circle" size={15} color={isFinalizing ? "rgba(250,245,238,0.45)" : "#ffffff"} />
                    <Text style={[styles.dispatchBtn2PrimaryText, isFinalizing && styles.dispatchBtn2PrimaryTextDisabled]}>
                      {isFinalizing ? "Finalizando..." : "Finalizar"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {/* Takeaway dispatch level */}
        {isTakeaway && (
          <View style={[styles.dispatchLevel, { paddingTop: 10 }]}>
            {dispatch.dispatched ? (
              <View style={{ gap: 8 }}>
                <View style={[styles.statusStrip, { backgroundColor: "rgba(0,168,102,0.15)", borderLeftColor: "#00A866" }]}>
                  <Feather name="check-circle" size={17} color="#34D98A" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.statusStripTitle, { color: "#34D98A" }]}>Despachada</Text>
                  </View>
                </View>
                {canFinalizeDispatch(dispatch) && (
                  <Pressable
                    style={[styles.dispatchBtn2Primary, isFinalizing && styles.dispatchBtn2PrimaryDisabled]}
                    onPress={() => onFinalize(dispatch.id)}
                    disabled={isFinalizing}
                  >
                    <Feather name="check-circle" size={15} color={isFinalizing ? "rgba(250,245,238,0.45)" : "#ffffff"} />
                    <Text style={[styles.dispatchBtn2PrimaryText, isFinalizing && styles.dispatchBtn2PrimaryTextDisabled]}>
                      {isFinalizing ? "Finalizando..." : "Finalizar"}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Pressable
                style={[styles.dispatchBtn2Primary, isDispatchButtonDisabled && styles.dispatchBtn2PrimaryDisabled]}
                onPress={() => onDispatch(dispatch.id)}
                disabled={isDispatchButtonDisabled}
              >
                <Text style={styles.dispatchBtn2PrimaryText}>
                  {isDispatching ? "Despachando..." : "Despachar"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

      </View>

      <View style={styles.ordersColumn}>
        {isMoveMode && renderInsertSlot(1)}

        {sortedOrders.map((order, index) => {
          const currentIndex = index + 1;
          const isSelectedOrder = movingOrderId === order.id;
          const isTakeawayOrderDispatching = isTakeawayOrderDispatchingById(order.id);
          const canMoveOrder = order.type !== "TAKEAWAY" && !order.delivered;
          const canStartMove = !isMoveMode && canMoveOrder && !isMoveBusy;
          const isTakeawayOrder = order.type === "TAKEAWAY";

          const actionLabel = isTakeawayOrder
            ? isTakeawayOrderDispatching
              ? "Despachando..."
              : "Despachar"
            : isSelectedOrder
              ? "Cancelar"
              : "Alterar ordem";

          const actionDisabled = isTakeawayOrder
            ? order.delivered || isTakeawayOrderDispatching
            : isSelectedOrder
              ? isMoveBusy
              : !canStartMove;
          const showActionButton = isTakeawayOrder
            ? !order.delivered
            : canMoveOrder && (isSelectedOrder || !isMoveMode);

          return (
            <View key={order.id} style={styles.orderCardWithSlot}>
              <DispatchOrderCard
                order={order}
                dispatchDispatched={dispatch.dispatched}
                actionLabel={actionLabel}
                actionDisabled={actionDisabled}
                showActionButton={showActionButton}
                isDimmed={isMoveMode && !isSelectedOrder}
                onOrderPress={() => onOpenOrder(order)}
                onActionPress={() => {
                  if (isTakeawayOrder) {
                    onDispatchTakeawayOrder(order.id);
                    return;
                  }

                  if (isSelectedOrder) {
                    onCancelMove();
                    return;
                  }

                  if (canStartMove) {
                    onStartMove(order.id, dispatch.id, currentIndex);
                  }
                }}
                onMarkDelivered={() => onMarkOrderDelivered(order.id)}
                isMarkingDelivered={!!markingOrderDeliveredById[order.id]}
              />
              {isMoveMode && renderInsertSlot(currentIndex + 1)}
            </View>
          );
        })}
      </View>
    </View>
   </ScrollView>
  );
}

export default function Dispatch() {
  const insets = useSafeAreaInsets();
  const { token, owner, signOut } = useAuth();
  const [dispatches, setDispatches] = useState<TDispatch[]>([]);
  const [isPOSOpen, setIsPOSOpen] = useState(false);
  const [posEditOrder, setPosEditOrder] = useState<TDispatchOrder | null>(null);
  const [isUpdateOrderModalOpen, setIsUpdateOrderModalOpen] = useState(false);
  const [orderToUpdate, setOrderToUpdate] = useState<TOrderEditorInitialOrder | null>(null);
  const [drivers, setDrivers] = useState<TDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [driversModalOpen, setDriversModalOpen] = useState(false);
  const [updatingDriverIds, setUpdatingDriverIds] = useState<Record<string, boolean>>({});
  const [assigningDriverDispatchIds, setAssigningDriverDispatchIds] = useState<
    Record<string, boolean>
  >({});
  const [updatingDispatchQueueIds, setUpdatingDispatchQueueIds] = useState<
    Record<string, boolean>
  >({});
  const [movingDispatchQueueId, setMovingDispatchQueueId] = useState<string | null>(null);
  const [dispatchTab, setDispatchTab] = useState<TDispatchTab>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatchingIds, setDispatchingIds] = useState<Record<string, boolean>>({});
  const [markingDeliveredIds, setMarkingDeliveredIds] = useState<Record<string, boolean>>({});
  const [finalizingIds, setFinalizingIds] = useState<Record<string, boolean>>({});
  const [dispatchingTakeawayOrderIds, setDispatchingTakeawayOrderIds] = useState<
    Record<string, boolean>
  >({});
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);
  const [movingSourceDispatchId, setMovingSourceDispatchId] = useState<string | null>(null);
  const [movingSourceOrderIndex, setMovingSourceOrderIndex] = useState<number | null>(null);
  const [isMoveBusy, setIsMoveBusy] = useState(false);
  const [selectedDispatchForMap, setSelectedDispatchForMap] = useState<TDispatch | null>(
    null
  );
  const [routeCoordinates, setRouteCoordinates] = useState<TRouteCoordinate[]>([]);
  const [segmentDurationsSeconds, setSegmentDurationsSeconds] = useState<number[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const drawerTranslateX = useRef(new Animated.Value(MAP_MODAL_SLIDE_DISTANCE)).current;

  useEffect(() => {
    if (!error) return;

    const timeoutId = setTimeout(() => {
      setError(null);
    }, 3500);

    return () => clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => {
    if (!token) return;
    const watcher = watchDispatches({
      token,
      intervalMs: DISPATCH_POLL_INTERVAL_MS,
      onDispatches: (nextDispatches) => {
        setError(null);
        setDispatches(nextDispatches);
        setSelectedDispatchForMap((previous) =>
          previous ? nextDispatches.find((dispatch) => dispatch.id === previous.id) ?? null : previous
        );
        setLoading(false);
      },
      onError: (fetchError) => {
        const message =
          fetchError instanceof Error ? fetchError.message : "Falha ao buscar entregas";
        setError(message);
        setLoading(false);
      },
    });

    return () => {
      watcher.stop();
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadDrivers = async () => {
      try {
        const nextDrivers = await fetchDrivers(token);
        if (cancelled) return;
        setDrivers(nextDrivers);
        setDriversError(null);
      } catch (driverError) {
        if (cancelled) return;
        const message =
          driverError instanceof Error ? driverError.message : "Falha ao buscar motoristas";
        setDriversError(message);
      } finally {
        if (!cancelled) {
          setDriversLoading(false);
        }
      }
    };

    void loadDrivers();
    const intervalId = setInterval(() => {
      void loadDrivers();
    }, DISPATCH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [token]);

  const sortedDispatches = useMemo(() => getSortedDispatches(dispatches), [dispatches]);

  const columns = useMemo(() => {
    return sortedDispatches
      .filter((dispatch) =>
        dispatchTab === "COMPLETED"
          ? isDispatchCompleted(dispatch)
          : !isDispatchCompleted(dispatch)
      )
      .sort(compareDispatchQueueOrder);
  }, [dispatchTab, sortedDispatches]);
  const sortedDrivers = useMemo(
    () => getSortedDrivers(drivers),
    [drivers]
  );
  const trackedDriversCount = useMemo(
    () => drivers.filter((driver) => driver.active).length,
    [drivers]
  );
  const driversOnDelivery = useMemo(
    () => new Set(
      dispatches
        .filter((d) => d.dispatched && !isDispatchCompleted(d) && d.driverId)
        .map((d) => d.driverId!)
    ),
    [dispatches]
  );
  const totalActiveOrders = useMemo(
    () => columns.reduce((sum, d) => sum + d.orders.length, 0),
    [columns],
  );
  const routePoints = useMemo(() => {
    if (!selectedDispatchForMap) return [];
    return getDispatchRoutePoints(selectedDispatchForMap);
  }, [selectedDispatchForMap]);
  const mapRoutePoints = useMemo(
    () => (routePoints.length > 0 ? [ROUTE_ORIGIN, ...routePoints] : []),
    [routePoints]
  );
  const routeRegion = useMemo(() => getRouteRegion(mapRoutePoints), [mapRoutePoints]);
  const routeLineCoordinates = useMemo(
    () =>
      routeCoordinates.length > 1
        ? routeCoordinates
        : toDirectRouteCoordinates(mapRoutePoints),
    [routeCoordinates, mapRoutePoints]
  );

  useEffect(() => {
    let isCancelled = false;

    const loadDrivingRoute = async () => {
      if (mapRoutePoints.length < 2) {
        setRouteCoordinates([]);
        setSegmentDurationsSeconds([]);
        return;
      }

      setRouteLoading(true);

      try {
        const result = await fetchDrivingRouteCoordinates(mapRoutePoints);
        if (isCancelled) return;

        setRouteCoordinates(result?.coordinates ?? toDirectRouteCoordinates(mapRoutePoints));
        setSegmentDurationsSeconds(result?.legDurationsSeconds ?? []);
      } catch {
        if (isCancelled) return;
        setRouteCoordinates(toDirectRouteCoordinates(mapRoutePoints));
        setSegmentDurationsSeconds([]);
      } finally {
        if (!isCancelled) {
          setRouteLoading(false);
        }
      }
    };

    void loadDrivingRoute();

    return () => {
      isCancelled = true;
    };
  }, [mapRoutePoints]);

  const openMapDrawer = (dispatch: TDispatch) => {
    setSelectedDispatchForMap(dispatch);
    drawerTranslateX.stopAnimation();
    Animated.timing(drawerTranslateX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeMapDrawer = () => {
    drawerTranslateX.stopAnimation();
    Animated.timing(drawerTranslateX, {
      toValue: MAP_MODAL_SLIDE_DISTANCE,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSelectedDispatchForMap(null);
        setRouteCoordinates([]);
      }
    });
  };

  const handleOpenRoutePointInGoogleMaps = async (point: TRoutePoint) => {
    const googleMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.mapQuery)}`;

    try {
      await Linking.openURL(googleMapsSearchUrl);
    } catch {
      Alert.alert("Erro", "Não foi possível abrir o Google Maps para este endereço.");
    }
  };

  const handleOpenFullRouteInGoogleMaps = async () => {
    if (routePoints.length === 0) return;
    const enc = encodeURIComponent;
    const origin = enc(ROUTE_ORIGIN.mapQuery);
    const dest = enc(routePoints[routePoints.length - 1].mapQuery);
    const waypoints = routePoints.slice(0, -1).map((p) => enc(p.mapQuery)).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Erro", "Não foi possível abrir o Google Maps.");
    }
  };

  const refreshDispatches = async () => {
    if (!token) return;
    try {
      const latestDispatches = await fetchDispatches(token);
      setError(null);
      setDispatches(latestDispatches);
      setSelectedDispatchForMap((previous) =>
        previous ? latestDispatches.find((dispatch) => dispatch.id === previous.id) ?? null : previous
      );
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Falha ao buscar entregas";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const refreshDrivers = async () => {
    if (!token) return;
    try {
      const latestDrivers = await fetchDrivers(token);
      setDrivers(latestDrivers);
      setDriversError(null);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Falha ao buscar motoristas";
      setDriversError(message);
    } finally {
      setDriversLoading(false);
    }
  };

  const runMoveOrder = async (payload: TMoveDispatchOrderPayload) => {
    if (!movingOrderId || isMoveBusy) return;

    try {
      setIsMoveBusy(true);
      setError(null);

      await moveDispatchOrder(movingOrderId, payload, token!);
      setMovingOrderId(null);
      setMovingSourceDispatchId(null);
      setMovingSourceOrderIndex(null);
      await refreshDispatches();
    } catch (moveError) {
      const message =
        moveError instanceof Error
          ? moveError.message
          : "Falha ao mover pedido entre despachos";
      setError(message);
    } finally {
      setIsMoveBusy(false);
    }
  };

  const handleStartMove = (
    orderId: string,
    sourceDispatchId: string,
    sourceOrderIndex: number,
  ) => {
    if (isMoveBusy) return;
    setMovingDispatchQueueId(null);
    setMovingOrderId(orderId);
    setMovingSourceDispatchId(sourceDispatchId);
    setMovingSourceOrderIndex(sourceOrderIndex);
  };

  const handleCancelMove = () => {
    if (isMoveBusy) return;
    setMovingOrderId(null);
    setMovingSourceDispatchId(null);
    setMovingSourceOrderIndex(null);
  };

  const handleMoveToIndex = (targetDispatchId: string, targetIndex: number) => {
    if (!movingOrderId || isMoveBusy) return;
    if (!Number.isFinite(targetIndex) || targetIndex < 1) return;

    const normalizedTargetDispatchId = targetDispatchId.trim();
    if (!normalizedTargetDispatchId) return;

    const liveSourceDispatchId =
      movingSourceDispatchId ??
      dispatches.find((dispatch) => dispatch.orders.some((order) => order.id === movingOrderId))
        ?.id ??
      null;

    const targetDispatch = dispatches.find((dispatch) => dispatch.id === normalizedTargetDispatchId);
    if (!targetDispatch) {
      setError("Despacho de destino não está mais disponível. Tente novamente.");
      void refreshDispatches();
      return;
    }

    if (
      liveSourceDispatchId !== normalizedTargetDispatchId &&
      targetDispatch.dispatched
    ) {
      setError("Não é possível mover para um despacho que já foi despachado.");
      return;
    }

    const payload: TMoveDispatchOrderPayload = {
      targetIndex,
    };

    if (liveSourceDispatchId && normalizedTargetDispatchId !== liveSourceDispatchId) {
      payload.targetDispatchId = normalizedTargetDispatchId;
    }

    void runMoveOrder(payload);
  };

  const handleCreateNewDispatchWithOrder = () => {
    if (!movingOrderId || isMoveBusy) return;
    void runMoveOrder({ createNewDispatch: true });
  };

  const handleStartMoveDispatchQueue = (dispatchId: string) => {
    if (updatingDispatchQueueIds[dispatchId]) return;
    handleCancelMove();
    setMovingDispatchQueueId(dispatchId);
  };

  const handleCancelMoveDispatchQueue = () => {
    setMovingDispatchQueueId(null);
  };

  const handleMoveQueueAdjacent = async (dispatchId: string, delta: number) => {
    if (updatingDispatchQueueIds[dispatchId]) return;
    const currentDispatch = dispatches.find((d) => d.id === dispatchId);
    if (!currentDispatch) return;
    const currentQueueIndex = getDispatchQueueIndex(currentDispatch);
    if (currentQueueIndex == null || !Number.isFinite(currentQueueIndex)) return;
    const targetQueueIndex = currentQueueIndex + delta;
    if (targetQueueIndex < 1) return;
    setUpdatingDispatchQueueIds((previous) => ({ ...previous, [dispatchId]: true }));
    setError(null);
    try {
      await updateDispatchStatus(token!, dispatchId, { queueIndex: targetQueueIndex });
      await refreshDispatches();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Falha ao reordenar fila");
    } finally {
      setUpdatingDispatchQueueIds((previous) => {
        const next = { ...previous };
        delete next[dispatchId];
        return next;
      });
    }
  };

  const handleMoveDispatchQueueToPosition = async (targetQueueIndex: number) => {
    const dispatchId = movingDispatchQueueId;
    if (!dispatchId) return;
    if (updatingDispatchQueueIds[dispatchId]) return;
    if (!Number.isFinite(targetQueueIndex) || targetQueueIndex < 1) return;

    const currentDispatch = dispatches.find((dispatch) => dispatch.id === dispatchId);
    if (!currentDispatch) return;
    const currentQueueIndex =
      getDispatchQueueIndex(currentDispatch);

    if (currentQueueIndex === targetQueueIndex) {
      setMovingDispatchQueueId(null);
      return;
    }

    setUpdatingDispatchQueueIds((previous) => ({
      ...previous,
      [dispatchId]: true,
    }));
    setError(null);

    try {
      await updateDispatchStatus(token!, dispatchId, { queueIndex: targetQueueIndex });
      setMovingDispatchQueueId(null);
      await refreshDispatches();
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Falha ao reordenar fila de despacho";
      setError(message);
    } finally {
      setUpdatingDispatchQueueIds((previous) => {
        const next = { ...previous };
        delete next[dispatchId];
        return next;
      });
    }
  };

  const handleOpenUpdateOrder = (order: TDispatchOrder) => {
    setDriversModalOpen(false);
    setPosEditOrder(order);
    setIsPOSOpen(true);
  };

  const handleDispatch = async (dispatchId: string) => {
    const currentDispatch = dispatches.find((item) => item.id === dispatchId);
    if (!currentDispatch || currentDispatch.dispatched || dispatchingIds[dispatchId]) {
      return;
    }

    const dispatchedAt = new Date().toISOString();

    setDispatchingIds((previous) => ({
      ...previous,
      [dispatchId]: true,
    }));
    setError(null);

    try {
      await updateDispatchStatus(token!, dispatchId, {
        dispatched: true,
        dispatchedAt,
      });
      await refreshDispatches();
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Falha ao atualizar despacho";
      setError(message);
    } finally {
      setDispatchingIds((previous) => {
        const next = { ...previous };
        delete next[dispatchId];
        return next;
      });
    }
  };

  const handleAssignDriverToDispatch = async (
    dispatchId: string,
    nextDriverId: string | null,
  ) => {
    const currentDispatch = dispatches.find((dispatch) => dispatch.id === dispatchId);
    if (!currentDispatch || assigningDriverDispatchIds[dispatchId]) {
      return;
    }

    const normalizedNextDriverId = nextDriverId ?? null;
    const normalizedCurrentDriverId = currentDispatch.driverId ?? null;
    if (normalizedCurrentDriverId === normalizedNextDriverId) {
      return;
    }

    const nextDriver =
      normalizedNextDriverId === null
        ? null
        : drivers.find((driver) => driver.id === normalizedNextDriverId) ?? null;

    setAssigningDriverDispatchIds((previous) => ({
      ...previous,
      [dispatchId]: true,
    }));
    setError(null);

    setDispatches((previous) =>
      previous.map((dispatch) =>
        dispatch.id === dispatchId
          ? {
            ...dispatch,
            driverId: normalizedNextDriverId,
            driver: nextDriver
              ? {
                id: nextDriver.id,
                createdAt: nextDriver.createdAt,
                name: nextDriver.name,
                active: nextDriver.active,
                priorityLevel: nextDriver.priorityLevel,
              }
              : null,
          }
          : dispatch
      )
    );

    setSelectedDispatchForMap((previous) =>
      previous && previous.id === dispatchId
        ? {
          ...previous,
          driverId: normalizedNextDriverId,
          driver: nextDriver
            ? {
              id: nextDriver.id,
              createdAt: nextDriver.createdAt,
              name: nextDriver.name,
              active: nextDriver.active,
              priorityLevel: nextDriver.priorityLevel,
            }
            : null,
        }
        : previous
    );

    try {
      await updateDispatchStatus(token!, dispatchId, { driverId: normalizedNextDriverId });
      await refreshDispatches();
    } catch (assignError) {
      const message =
        assignError instanceof Error ? assignError.message : "Falha ao atualizar motorista";
      setError(message);

      setDispatches((previous) =>
        previous.map((dispatch) =>
          dispatch.id === dispatchId ? currentDispatch : dispatch
        )
      );

      setSelectedDispatchForMap((previous) =>
        previous && previous.id === dispatchId ? currentDispatch : previous
      );
    } finally {
      setAssigningDriverDispatchIds((previous) => {
        const next = { ...previous };
        delete next[dispatchId];
        return next;
      });
    }
  };

  const handleDispatchTakeawayOrder = async (orderId: string) => {
    const currentOrder = dispatches
      .flatMap((dispatch) => dispatch.orders)
      .find((order) => order.id === orderId);

    if (!currentOrder || currentOrder.delivered || dispatchingTakeawayOrderIds[orderId]) {
      return;
    }

    const deliveredAt = new Date().toISOString();
    const previousDelivered = currentOrder.delivered;
    const previousDeliveredAt = currentOrder.deliveredAt ?? null;

    setDispatchingTakeawayOrderIds((previous) => ({
      ...previous,
      [orderId]: true,
    }));
    setError(null);

    setDispatches((previous) =>
      previous.map((dispatch) => ({
        ...dispatch,
        orders: dispatch.orders.map((order) =>
          order.id === orderId
            ? {
              ...order,
              delivered: true,
              deliveredAt,
            }
            : order
        ),
      }))
    );
    setSelectedDispatchForMap((previous) =>
      previous
        ? {
          ...previous,
          orders: previous.orders.map((order) =>
            order.id === orderId
              ? {
                ...order,
                delivered: true,
                deliveredAt,
              }
              : order
          ),
        }
        : previous
    );

    try {
      await updateOrder(orderId, { deliveredAt }, token!);
      await refreshDispatches();
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Falha ao despachar retirada";
      setError(message);

      setDispatches((previous) =>
        previous.map((dispatch) => ({
          ...dispatch,
          orders: dispatch.orders.map((order) =>
            order.id === orderId
              ? {
                ...order,
                delivered: previousDelivered,
                deliveredAt: previousDeliveredAt,
              }
              : order
          ),
        }))
      );
      setSelectedDispatchForMap((previous) =>
        previous
          ? {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                  ...order,
                  delivered: previousDelivered,
                  deliveredAt: previousDeliveredAt,
                }
                : order
            ),
          }
          : previous
      );
    } finally {
      setDispatchingTakeawayOrderIds((previous) => {
        const next = { ...previous };
        delete next[orderId];
        return next;
      });
    }
  };

  const handleMarkOrderDelivered = async (orderId: string) => {
    if (markingDeliveredIds[orderId]) return;
    if (!token) return;

    const deliveredAt = new Date().toISOString();
    setMarkingDeliveredIds((prev) => ({ ...prev, [orderId]: true }));
    setError(null);

    try {
      await updateOrder(orderId, { deliveredAt }, token);
      await refreshDispatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao marcar entregue");
    } finally {
      setMarkingDeliveredIds((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
    }
  };

  const handleFinalize = async (dispatchId: string) => {
    if (finalizingIds[dispatchId]) return;
    if (!token) return;
    setFinalizingIds((prev) => ({ ...prev, [dispatchId]: true }));
    setError(null);
    try {
      await finalizeDispatch(dispatchId, token);
      await refreshDispatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao finalizar despacho");
    } finally {
      setFinalizingIds((prev) => { const next = { ...prev }; delete next[dispatchId]; return next; });
    }
  };

  const handleMoveDriverPriority = async (driverId: string, direction: "UP" | "DOWN") => {
    if (updatingDriverIds[driverId]) return;

    const currentIndex = sortedDrivers.findIndex((driver) => driver.id === driverId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "UP" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedDrivers.length) return;

    const targetPriorityLevel = sortedDrivers[targetIndex]?.priorityLevel;
    if (typeof targetPriorityLevel !== "number" || targetPriorityLevel < 0) return;

    setUpdatingDriverIds((previous) => ({
      ...previous,
      [driverId]: true,
    }));
    setDriversError(null);

    try {
      await updateDriver(token!, driverId, { priorityLevel: targetPriorityLevel });
      await refreshDrivers();
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Falha ao atualizar prioridade do motorista";
      setDriversError(message);
    } finally {
      setUpdatingDriverIds((previous) => {
        const next = { ...previous };
        delete next[driverId];
        return next;
      });
    }
  };

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>


        <TabletTopBar
          mode="inner"
          pageTitle="Despacho"
          backLabel="Início"
          onBack={() => router.replace("/(app)")}
          userInitial={(owner?.name ?? "G").charAt(0).toUpperCase()}
          onAvatarPress={() => void signOut()}
        />

        {/* ── Topbar ── */}
        <View style={styles.topBar}>
          {/* Left: segmented view switcher */}
          <View style={styles.topBarSegmented}>
            <Pressable
              style={[styles.segmentBtn, dispatchTab === "ACTIVE" && styles.segmentBtnActive]}
              onPress={() => { setDispatchTab("ACTIVE"); handleCancelMove(); setMovingDispatchQueueId(null); }}
            >
              {dispatchTab === "ACTIVE" && <Feather name="check" size={12} color="#FF3D14" />}
              <Text style={[styles.segmentBtnText, dispatchTab === "ACTIVE" && styles.segmentBtnTextActive]}>Ativos</Text>
              {dispatchTab === "ACTIVE" && (
                <Text style={styles.segmentCount}>{totalActiveOrders}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, dispatchTab === "COMPLETED" && styles.segmentBtnActive]}
              onPress={() => { setDispatchTab("COMPLETED"); handleCancelMove(); setMovingDispatchQueueId(null); }}
            >
              {dispatchTab === "COMPLETED" && <Feather name="check" size={12} color="#FF3D14" />}
              <Text style={[styles.segmentBtnText, dispatchTab === "COMPLETED" && styles.segmentBtnTextActive]}>Concluídos</Text>
            </Pressable>
          </View>

          <View style={{ flex: 1 }} />

          {/* Right: driver filter + novo pedido */}
          <View style={styles.topBarRight}>
            <Pressable
              style={styles.driversBtn}
              onPress={() => setDriversModalOpen(true)}
            >
              <Feather
                name="users"
                size={16}
                color="rgba(250,245,238,0.5)"
              />
              <Text style={styles.driversBtnLabel}>
                Motoristas:
              </Text>
              <View style={styles.driversBtnCountRow}>
                <View style={[styles.driversBtnDot, { backgroundColor: trackedDriversCount === 0 ? "#6C6259" : "#00A866" }]} />
                <Text style={styles.driversBtnCountText}>
                  {trackedDriversCount} {trackedDriversCount === 1 ? "rastreado" : "rastreados"}
                </Text>
              </View>
              <Feather name="chevron-down" size={14} color="rgba(250,245,238,0.35)" />
            </Pressable>

            <Pressable
              style={styles.novoPedidoBtn}
              onPress={() => { setDriversModalOpen(false); setMovingDispatchQueueId(null); setIsPOSOpen(true); }}
            >
              <Feather name="plus" size={17} color="#fff" />
              <Text style={styles.novoPedidoBtnText}>Novo pedido</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingState}>
              <Text style={styles.loadingText}>Carregando entregas...</Text>
            </View>
          ) : columns.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIconTile}>
                <Feather
                  name={dispatchTab === "ACTIVE" ? "package" : "check-circle"}
                  size={34}
                  color="#FF3D14"
                />
              </View>
              <Text style={styles.emptyStateTitle}>
                {dispatchTab === "ACTIVE" ? "Nenhum despacho ativo" : "Nenhum despacho concluído"}
              </Text>
              <Text style={styles.emptyStateSub}>
                {dispatchTab === "ACTIVE"
                  ? "Tudo limpo por aqui. Novos pedidos aparecem automaticamente quando chegam."
                  : "Os despachos finalizados do dia aparecem aqui assim que forem entregues ou retirados."}
              </Text>
              {dispatchTab === "ACTIVE" && (
                <Pressable
                  style={styles.emptyStateCTA}
                  onPress={() => { setMovingDispatchQueueId(null); setIsPOSOpen(true); }}
                >
                  <Feather name="plus" size={17} color="#fff" />
                  <Text style={styles.emptyStateCTAText}>Novo pedido</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.columnsScrollView} contentContainerStyle={styles.columnsRow}>
              {columns.map((dispatch, index) => {
                const targetQueueIndex = getDispatchQueueIndex(dispatch);
                return (
                  <DispatchColumn
                    key={dispatch.id}
                    dispatch={dispatch}
                    targetQueueIndex={targetQueueIndex}
                    drivers={sortedDrivers}
                    driversOnDelivery={driversOnDelivery}
                    isDispatching={!!dispatchingIds[dispatch.id]}
                    isAssigningDriver={!!assigningDriverDispatchIds[dispatch.id]}
                    isQueueUpdating={!!updatingDispatchQueueIds[dispatch.id]}
                    isQueueMoveMode={movingDispatchQueueId !== null}
                    isQueueSelected={movingDispatchQueueId === dispatch.id}
                    movingOrderId={movingOrderId}
                    movingSourceDispatchId={movingSourceDispatchId}
                    movingSourceOrderIndex={movingSourceOrderIndex}
                    isMoveBusy={isMoveBusy}
                    onDispatch={handleDispatch}
                    onAssignDriver={handleAssignDriverToDispatch}
                    onStartMoveDispatchQueue={handleStartMoveDispatchQueue}
                    onCancelMoveDispatchQueue={handleCancelMoveDispatchQueue}
                    onMoveDispatchQueueToPosition={handleMoveDispatchQueueToPosition}
                    onStartMove={handleStartMove}
                    onCancelMove={handleCancelMove}
                    onMoveToIndex={handleMoveToIndex}
                    onDispatchTakeawayOrder={handleDispatchTakeawayOrder}
                    isTakeawayOrderDispatchingById={(orderId) =>
                      !!dispatchingTakeawayOrderIds[orderId]
                    }
                    onOpenOrder={handleOpenUpdateOrder}
                    onOpenMap={openMapDrawer}
                    isFirstInQueue={index === 0}
                    isLastInQueue={index === columns.length - 1}
                    onMoveQueueLeft={() => handleMoveQueueAdjacent(dispatch.id, -1)}
                    onMoveQueueRight={() => handleMoveQueueAdjacent(dispatch.id, 1)}
                    onMarkOrderDelivered={handleMarkOrderDelivered}
                    markingOrderDeliveredById={markingDeliveredIds}
                    onFinalize={handleFinalize}
                    isFinalizing={!!finalizingIds[dispatch.id]}
                  />
                );
              })}
              {movingOrderId && (
                <View style={[styles.dispatchColumn, { paddingTop: 24, backgroundColor: "transparent", borderColor: "transparent" }]}>
                  <Pressable
                    style={[
                      styles.dispatchDropCard,
                      movingOrderId
                        ? styles.dispatchDropCardActive
                        : styles.dispatchDropCardInactive,
                    ]}
                    onPress={handleCreateNewDispatchWithOrder}
                    disabled={!movingOrderId || isMoveBusy}
                  >
                    {isMoveBusy
                      ? <ActivityIndicator size="small" color="rgba(250,245,238,0.5)" />
                      : <Feather name="plus" size={28} color="rgba(250,245,238,0.4)" />
                    }
                  </Pressable>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {/* ── Route map modal (fullscreen) ── */}
        <Modal
          visible={!!selectedDispatchForMap}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closeMapDrawer}
        >
          <View style={[styles.routeModal, { paddingTop: insets.top }]}>
            {/* top bar */}
            <View style={styles.routeModalTopBar}>
              <View style={styles.routeModalIconWrap}>
                <Feather name="map" size={20} color="#FF3D14" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.routeModalTitle}>Rota da entrega</Text>
                <Text style={styles.routeModalSub} numberOfLines={1}>
                  {selectedDispatchForMap?.driver?.name ?? "Motorista"} · {routePoints.length} {routePoints.length === 1 ? "parada" : "paradas"}
                </Text>
              </View>
              <View style={styles.routeModalTimePill}>
                <Feather name="clock" size={14} color="#FF3D14" />
                <Text style={styles.routeModalTimePillText}>
                  {formatMinutes(selectedDispatchForMap?.estimatedDeliveryDurationMinutes ?? 0)}
                </Text>
                {routeLoading && <Text style={styles.routeModalTimePillSub}> · calculando</Text>}
              </View>
              <Pressable style={styles.routeModalCloseBtn} onPress={closeMapDrawer}>
                <Feather name="x" size={18} color="rgba(250,245,238,0.7)" />
              </Pressable>
            </View>

            {/* body */}
            <View style={styles.routeModalBody}>
              {/* map */}
              <View style={styles.routeModalMapArea}>
                {mapRoutePoints.length >= 2 ? (
                  <DispatchRouteMap
                    style={{ flex: 1 }}
                    region={routeRegion}
                    points={mapRoutePoints}
                    coordinates={routeLineCoordinates}
                  />
                ) : (
                  <View style={styles.routeModalMapFallback}>
                    <Feather name="map" size={32} color="rgba(250,245,238,0.2)" />
                    <Text style={styles.routeModalMapFallbackText}>
                      Sem coordenadas suficientes para montar o mapa desta entrega.
                    </Text>
                  </View>
                )}
              </View>

              {/* stops panel */}
              <View style={[styles.routeModalPanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {/* open full route CTA */}
                <View style={styles.routeModalPanelHeader}>
                  <Pressable
                    style={styles.routeModalFullRouteBtn}
                    onPress={() => { void handleOpenFullRouteInGoogleMaps(); }}
                  >
                    <Feather name="navigation" size={16} color="#fff" />
                    <Text style={styles.routeModalFullRouteBtnText}>Abrir rota completa</Text>
                    <Feather name="external-link" size={14} color="rgba(255,255,255,0.75)" />
                  </Pressable>
                </View>

                {/* stops list */}
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.routeModalStopsList}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Origin */}
                  <View style={styles.routeStopRow}>
                    <View style={styles.routeStopOriginIcon}>
                      <Feather name="home" size={18} color="#fff" />
                    </View>
                    <View style={styles.routeStopInfo}>
                      <Text style={styles.routeStopEyebrow}>COLETA</Text>
                      <Text style={styles.routeStopTitle}>{ROUTE_ORIGIN.label}</Text>
                      <Text style={styles.routeStopAddress}>{ROUTE_ORIGIN.address}</Text>
                    </View>
                  </View>

                  {routePoints.map((point, index) => (
                    <View key={`${point.lat}-${point.lng}-${index}`}>
                      {/* connector */}
                      <View style={styles.routeConnector}>
                        <View style={styles.routeConnectorLine} />
                      </View>
                      {/* stop */}
                      <View style={styles.routeStopRow}>
                        <View style={styles.routeStopNumBubble}>
                          <Text style={styles.routeStopNumText}>{index + 1}</Text>
                        </View>
                        <View style={styles.routeStopInfo}>
                          <View style={styles.routeStopTitleRow}>
                            <Text style={[styles.routeStopTitle, { flex: 1 }]} numberOfLines={1}>{point.label}</Text>
                            {segmentDurationsSeconds[index] != null && segmentDurationsSeconds[index] > 0 && (
                              <View style={styles.routeConnectorTimePill}>
                                <Text style={styles.routeConnectorTimeText}>
                                  {Math.round(segmentDurationsSeconds[index] / 60)} min
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.routeStopAddressRow}>
                            <Feather name="map-pin" size={12} color="rgba(250,245,238,0.45)" />
                            <Text style={styles.routeStopAddress} numberOfLines={2}>{point.address}</Text>
                          </View>
                          {point.complement ? (
                            <View style={styles.routeStopComplRow}>
                              <Text style={styles.routeStopComplLabel}>Compl:</Text>
                              <Text style={styles.routeStopCompl}>{point.complement}</Text>
                            </View>
                          ) : null}
                          <Pressable
                            style={styles.routeStopMapsBtn}
                            onPress={() => { void handleOpenRoutePointInGoogleMaps(point); }}
                          >
                            <Feather name="map-pin" size={12} color="rgba(250,245,238,0.5)" />
                            <Text style={styles.routeStopMapsBtnText}>Abrir endereço</Text>
                            <Feather name="external-link" size={11} color="rgba(250,245,238,0.3)" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* Return connector + stop */}
                  <View style={styles.routeConnector}>
                    <View style={[styles.routeConnectorLine, styles.routeConnectorLineDashed]} />
                  </View>
                  <View style={styles.routeStopRow}>
                    <View style={[styles.routeStopOriginIcon, styles.routeStopReturnIcon]}>
                      <Feather name="flag" size={16} color="rgba(250,245,238,0.5)" />
                    </View>
                    <View style={styles.routeStopInfo}>
                      <Text style={[styles.routeStopEyebrow, { color: "rgba(250,245,238,0.3)" }]}>RETORNO</Text>
                      <Text style={[styles.routeStopTitle, { color: "rgba(250,245,238,0.5)" }]}>{ROUTE_ORIGIN.label}</Text>
                      <Text style={[styles.routeStopAddress, { color: "rgba(250,245,238,0.3)" }]}>{ROUTE_ORIGIN.address}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Drivers management modal ── */}
        <Modal
          visible={driversModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDriversModalOpen(false)}
        >
          <Pressable style={styles.driversModalBackdrop} onPress={() => setDriversModalOpen(false)}>
            <Pressable style={styles.driversModalPanel} onPress={(e) => e.stopPropagation()}>
              {/* header */}
              <View style={styles.driversModalHeader}>
                <View style={styles.driversModalIconWrap}>
                  <Feather name="users" size={19} color="#FF3D14" />
                </View>
                <Text style={styles.driversModalTitle}>Motoristas</Text>
                <Pressable style={styles.driversModalCloseBtn} onPress={() => setDriversModalOpen(false)}>
                  <Feather name="x" size={17} color="rgba(250,245,238,0.7)" />
                </Pressable>
              </View>

              {/* driver list */}
              <ScrollView
                style={styles.driversModalList}
                contentContainerStyle={{ paddingVertical: 6 }}
                showsVerticalScrollIndicator={false}
              >
                {driversLoading ? (
                  <Text style={styles.driversModalFeedback}>Carregando...</Text>
                ) : driversError ? (
                  <Text style={styles.driversModalFeedbackError}>{driversError}</Text>
                ) : sortedDrivers.length === 0 ? (
                  <Text style={styles.driversModalFeedback}>Nenhum motorista cadastrado.</Text>
                ) : (
                  sortedDrivers.map((driver, index) => {
                    const isOnDelivery = driversOnDelivery.has(driver.id);
                    const driverStatus = isOnDelivery ? "entrega" : driver.active ? "rastreando" : "semsinal";
                    const initials = driver.name.split(" ").filter(Boolean).map((w: string) => w[0].toUpperCase()).slice(0, 2).join("");
                    const active = driver.active;
                    const statusCfg = driverStatus === "entrega"
                      ? { label: "Em entrega", dot: "#FF7A5C", fg: "#FF7A5C", bg: "rgba(255,61,20,0.12)" }
                      : driverStatus === "rastreando"
                        ? { label: "Rastreando", dot: "#34D98A", fg: "#34D98A", bg: "rgba(0,168,102,0.12)" }
                        : { label: "Sem sinal", dot: "#6C6259", fg: "#9C8E83", bg: "rgba(239,231,218,0.06)" };
                    return (
                      <View key={driver.id} style={[styles.driversModalRow, index > 0 && styles.driversModalRowBorder]}>
                        {/* avatar */}
                        <View style={[styles.driversModalAvatar, !active && styles.driversModalAvatarInactive]}>
                          <Text style={[styles.driversModalAvatarText, !active && { color: "rgba(250,245,238,0.3)" }]}>{initials}</Text>
                        </View>
                        {/* name + priority */}
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={[styles.driversModalName, !active && { color: "#9C8E83" }]} numberOfLines={1}>{driver.name}</Text>
                          <Text style={styles.driversModalPriority}>P{driver.priorityLevel}</Text>
                        </View>
                        {/* status badge */}
                        <View style={[styles.driversModalBadge, { backgroundColor: statusCfg.bg }]}>
                          <View style={[styles.driversModalBadgeDot, { backgroundColor: statusCfg.dot }]} />
                          <Text style={[styles.driversModalBadgeText, { color: statusCfg.fg }]}>{statusCfg.label}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={isPOSOpen}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => { setIsPOSOpen(false); setPosEditOrder(null); }}
        >
          <POSScreen
            key={posEditOrder?.id ?? "new"}
            onClose={() => { setIsPOSOpen(false); setPosEditOrder(null); }}
            onOrderCreated={() => { setIsPOSOpen(false); setPosEditOrder(null); void refreshDispatches(); }}
            onOrderUpdated={() => refreshDispatches()}
            editOrder={posEditOrder ?? undefined}
          />
        </Modal>

        <UpdateOrderModal
          visible={isUpdateOrderModalOpen}
          apiBaseUrl={API_BASE_URL}
          authToken={token ?? ""}
          order={orderToUpdate}
          onSuccess={refreshDispatches}
          onClose={() => {
            setIsUpdateOrderModalOpen(false);
            setOrderToUpdate(null);
          }}
        />

        {error ? (
          <View style={[styles.errorToast, { bottom: Math.max(insets.bottom, 16), right: 16 }]}>
            <Feather name="alert-circle" size={16} color="#ff8267" />
            <Text style={styles.errorToastText}>{error}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0e0b09", fontFamily: "Geist_400Regular" },
  safeArea: { flex: 1 },
  topBar: {
    flexShrink: 0,
    backgroundColor: "#181310",
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.10)",
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 14,
  },
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  // ── New topbar ──
  topBarSegmented: {
    flexDirection: "row", gap: 2, height: 40, padding: 3,
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(239,231,218,0.08)",
    backgroundColor: "rgba(239,231,218,0.05)",
  },
  segmentBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: "100%" as any, paddingHorizontal: 14,
    borderRadius: 7,
  },
  segmentBtnActive: { backgroundColor: "#352D27" },
  segmentBtnText: { fontFamily: "Geist_500Medium", fontSize: 14, fontWeight: "500", color: "#9C8E83" },
  segmentBtnTextActive: { fontFamily: "Geist_600SemiBold", fontWeight: "600", color: "#FAF5EE" },
  segmentCount: {
    fontFamily: "GeistMono_600SemiBold", fontSize: 11.5, fontWeight: "600", color: "#FAF5EE",
    backgroundColor: "rgba(239,231,218,0.10)", borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 1,
  },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  driversBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, height: 40,
    paddingHorizontal: 13, borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(239,231,218,0.10)", backgroundColor: "rgba(239,231,218,0.04)",
  },
  driversBtnLabel: { fontFamily: "Geist_400Regular", fontSize: 13.5, color: "#9C8E83" },
  driversBtnCountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  driversBtnDot: { width: 7, height: 7, borderRadius: 3.5 },
  driversBtnCountText: { fontFamily: "Geist_500Medium", fontSize: 13.5, fontWeight: "500", color: "#FAF5EE" },
  novoPedidoBtn: {
    flexDirection: "row", alignItems: "center", gap: 7, height: 40,
    paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#FF3D14",
  },
  novoPedidoBtnText: { fontFamily: "Geist_700Bold", fontSize: 14.5, fontWeight: "700", color: "#fff" },
  // ── Drivers modal ──
  driversModalBackdrop: {
    flex: 1, backgroundColor: "rgba(10,8,6,0.66)",
    alignItems: "center", justifyContent: "flex-start", paddingTop: 72, paddingHorizontal: 20,
  },
  driversModalPanel: {
    width: "100%", maxWidth: 520, maxHeight: "80%" as any,
    backgroundColor: "#211C18", borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(239,231,218,0.09)", overflow: "hidden",
  },
  driversModalHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 18, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "rgba(239,231,218,0.06)",
  },
  driversModalIconWrap: {
    width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,61,20,0.14)",
  },
  driversModalTitle: { flex: 1, fontFamily: "Geist_700Bold", fontSize: 18, fontWeight: "700", color: "#FAF5EE" },
  driversModalCloseBtn: {
    width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(239,231,218,0.04)", borderWidth: 1, borderColor: "rgba(239,231,218,0.09)",
  },
  driversModalList: { flexGrow: 0 },
  driversModalFeedback: { fontFamily: "Geist_400Regular", fontSize: 13.5, color: "#9C8E83", textAlign: "center", paddingVertical: 34, paddingHorizontal: 20 },
  driversModalFeedbackError: { fontFamily: "Geist_500Medium", fontSize: 13, color: "#FF7A5C", textAlign: "center", paddingVertical: 34, paddingHorizontal: 20 },
  driversModalRow: {
    flexDirection: "row", alignItems: "center", gap: 13,
    paddingHorizontal: 20, paddingVertical: 13,
  },
  driversModalRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(239,231,218,0.055)" },
  driversModalAvatar: {
    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
    backgroundColor: "#C72A0A",
    alignItems: "center", justifyContent: "center",
  },
  driversModalAvatarInactive: { backgroundColor: "rgba(239,231,218,0.07)" },
  driversModalAvatarText: { fontFamily: "Geist_700Bold", fontSize: 14, fontWeight: "700", color: "#fff" },
  driversModalName: { fontFamily: "Geist_600SemiBold", fontSize: 14.5, fontWeight: "600", color: "#FAF5EE" },
  driversModalPriority: { fontFamily: "GeistMono_400Regular", fontSize: 11.5, color: "#6C6259" },
  driversModalBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999,
  },
  driversModalBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  driversModalBadgeText: { fontFamily: "Geist_600SemiBold", fontSize: 12, fontWeight: "600" },
  driversModalToggleWrap: { flexDirection: "column", alignItems: "center", gap: 3, width: 50 },
  driversModalToggle: {
    width: 42, height: 24, borderRadius: 12, padding: 3, flexShrink: 0,
    backgroundColor: "rgba(239,231,218,0.16)",
    flexDirection: "row", alignItems: "center", justifyContent: "flex-start",
  },
  driversModalToggleOn: { backgroundColor: "#FF3D14", justifyContent: "flex-end" },
  driversModalToggleLocked: { opacity: 0.55 },
  driversModalToggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  driversModalToggleThumbOn: {},
  driversModalToggleLockLabel: { fontFamily: "Geist_400Regular", fontSize: 9.5, color: "#6C6259" },
  healthPillsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  healthPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
    backgroundColor: "rgba(250,245,238,0.05)",
  },
  healthPillGood: { backgroundColor: "rgba(52,211,154,0.10)", borderColor: "transparent" },
  healthPillWarn: { backgroundColor: "rgba(242,179,56,0.10)", borderColor: "transparent" },
  healthPillLate: { backgroundColor: "rgba(255,61,20,0.10)", borderColor: "transparent" },
  healthPillValue: { fontFamily: "GeistMono_700Bold", fontSize: 16, lineHeight: 16, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.5 },
  healthPillValueGood: { color: "#34d39a" },
  healthPillValueWarn: { color: "#f2b338" },
  healthPillValueLate: { color: "#ff3d14" },
  healthPillLabel: { fontFamily: "Geist_500Medium", fontSize: 11, lineHeight: 11, color: "rgba(250,245,238,0.65)", fontWeight: "500" },
  dispatchTabs: {
    flexDirection: "row", backgroundColor: "#241d18",
    borderRadius: 10, padding: 3, gap: 3,
    borderWidth: 1, borderColor: "rgba(250,245,238,0.08)",
  },
  dispatchTab: {
    paddingHorizontal: 14, height: 32, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  dispatchTabActive: { backgroundColor: "#faf5ee" },
  dispatchTabText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "rgba(250,245,238,0.65)" },
  dispatchTabTextActive: { color: "#0e0b09" },
  createOrderButton: {
    height: 38, borderRadius: 10, backgroundColor: "#ff3d14",
    paddingHorizontal: 13, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 7,
  },
  createOrderButtonText: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#ffffff" },
  driversMenuContainer: { position: "relative" },
  driversButton: {
    height: 38, borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "transparent",
    paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7,
  },
  driversButtonText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "#faf5ee" },
  driversDropdown: {
    position: "absolute", right: 0, top: 46, width: 310,
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
    backgroundColor: "#241d18", padding: 14, gap: 10,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }, elevation: 20, zIndex: 50,
  },
  driversDropdownTitle: { fontFamily: "Geist_700Bold", fontSize: 15, lineHeight: 15, fontWeight: "700", color: "#faf5ee" },
  driversDropdownList: { gap: 8 },
  driversDropdownFeedback: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "rgba(250,245,238,0.65)" },
  driversDropdownError: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "#ff3d14" },
  driverRow: {
    borderRadius: 11, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
    backgroundColor: "rgba(250,245,238,0.03)", padding: 10,
    flexDirection: "column", gap: 8,
  },
  driverRowInactive: { opacity: 0.55 },
  driverRowTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  driverPriorityChip: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: "rgba(250,245,238,0.07)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  driverPriorityChipFirst: { backgroundColor: "#ff3d14" },
  driverPriorityChipText: { fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "rgba(250,245,238,0.65)" },
  driverPriorityChipTextFirst: { color: "#ffffff" },
  driverAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(250,245,238,0.10)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  driverAvatarText: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#faf5ee" },
  driverRowNameWrap: { flex: 1, gap: 4 },
  driverRowName: { fontFamily: "Geist_700Bold", fontSize: 14, lineHeight: 14, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.2 },
  driverStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  driverStatusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
  },
  driverLiveDot: { width: 4, height: 4, borderRadius: 2 },
  driverStatusText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", letterSpacing: 0.5 },
  driverPriorityControls: { flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 },
  driverPriorityButton: {
    width: 26, height: 18, borderRadius: 5, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "transparent",
    alignItems: "center", justifyContent: "center",
  },
  driverPriorityButtonDisabled: { opacity: 0.3 },
  driverRowBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  driverRowBottomInfo: { flex: 1, fontFamily: "Geist_400Regular", fontSize: 12, lineHeight: 12, color: "rgba(250,245,238,0.62)" },
  driverToggleButton: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "transparent",
    alignItems: "center", justifyContent: "center",
  },
  driverToggleButtonActivate: { backgroundColor: "#ff3d14", borderColor: "transparent" },
  driverToggleButtonActive: { borderColor: "rgba(52,211,154,0.4)", backgroundColor: "rgba(52,211,154,0.12)" },
  driverToggleButtonInactive: { borderColor: "rgba(250,245,238,0.12)", backgroundColor: "rgba(250,245,238,0.04)" },
  driverToggleButtonDisabled: { opacity: 0.5 },
  driverToggleButtonText: { fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "rgba(250,245,238,0.65)", letterSpacing: 0.3 },
  driverToggleButtonTextActivate: { color: "#ffffff" },
  driverToggleButtonTextActive: { color: "#34d39a" },
  driverToggleButtonTextInactive: { color: "rgba(250,245,238,0.65)" },
  topBarContent: { paddingHorizontal: 18 },
  pageTitle: { fontFamily: "Geist_700Bold", fontSize: 18, lineHeight: 18, fontWeight: "700", color: "#faf5ee" },
  body: { flex: 1 },
  columnsScrollView: { paddingVertical: 0 },
  columnsRow: { gap: 12, paddingHorizontal: 16, alignItems: "stretch" },
  dispatchColumn: {
    width: 380, gap: 0, paddingVertical: 0,
    borderRadius: 14, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.10)", backgroundColor: "#181310", overflow: "hidden",
  },
  dispatchSummaryCard: {
    backgroundColor: "#181310",
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.10)",
  },
  dispatchSummaryInner: { paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  queueIndexRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  queueIndexLabel: { fontFamily: "GeistMono_600SemiBold", fontSize: 10, lineHeight: 10, fontWeight: "600", color: "rgba(250,245,238,0.60)", letterSpacing: 0.5 },
  queueNumLabel: { fontFamily: "GeistMono_600SemiBold", fontSize: 11, lineHeight: 11, fontWeight: "600", color: "rgba(250,245,238,0.60)", letterSpacing: 0.3 },
  queueActionButton: {
    minHeight: 26, borderRadius: 7, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "rgba(250,245,238,0.05)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 9,
  },
  queueActionButtonCancel: { backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.35)" },
  queueActionButtonDisabled: { opacity: 0.4 },
  queueActionButtonText: { fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "rgba(250,245,238,0.6)" },
  dispatchHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  dispatchHeaderBlock: { gap: 9 },
  dispatchDriverPickerBlock: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  dispatchDriverPickerButton: {
    flex: 1, minHeight: 34, borderRadius: 9, borderWidth: 1.5,
    borderStyle: "dashed", borderColor: "rgba(250,245,238,0.20)",
    backgroundColor: "transparent", paddingHorizontal: 10, paddingVertical: 5,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  dispatchDriverPickerButtonDisabled: { opacity: 0.6 },
  driverCountBadge: { backgroundColor: "#ff3d14", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7 },
  dispatchDriverDropdown: {
    borderRadius: 9, borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
    backgroundColor: "#241d18", overflow: "hidden",
  },
  dispatchDriverDropdownItem: {
    minHeight: 38, paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.07)",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
  },
  dispatchDriverDropdownItemSelected: { backgroundColor: "rgba(255,61,20,0.10)" },
  dispatchDriverDropdownItemMain: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  dispatchDriverDropdownItemText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "#faf5ee" },
  dispatchDriverDropdownItemBadge: {
    fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", color: "rgba(250,245,238,0.60)",
    borderRadius: 5, borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
    paddingHorizontal: 5, paddingVertical: 2, backgroundColor: "rgba(250,245,238,0.04)", overflow: "hidden",
  },
  dispatchDriverDropdownItemPriority: { fontFamily: "GeistMono_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "rgba(250,245,238,0.60)" },
  dispatchTypeBadgesRow: {
    flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: "#241d18", borderBottomWidth: 1, paddingHorizontal: 12,
    paddingVertical: 10, borderColor: "rgba(250,245,238,0.10)",
  },
  dispatchTypeIcon: {
    width: 28, height: 28, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
  },
  dispatchTypeIconDelivery: { backgroundColor: "rgba(255,61,20,0.14)" },
  dispatchTypeIconTakeaway: { backgroundColor: "rgba(242,179,56,0.14)" },
  dispatchTypeBadge: { alignSelf: "flex-start", borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  dispatchTypeBadgeDelivery: { borderColor: "rgba(255,61,20,0.35)", backgroundColor: "rgba(255,61,20,0.10)" },
  dispatchTypeBadgeTakeaway: { borderColor: "rgba(242,179,56,0.35)", backgroundColor: "rgba(242,179,56,0.10)" },
  dispatchTypeBadgeText: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.2, flex: 1 },
  dispatchTypeBadgeTextDelivery: { color: "#ff8267" },
  dispatchTypeBadgeTextTakeaway: { color: "#f2b338" },
  driverName: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "rgba(250,245,238,0.62)", flexShrink: 1 },
  driverNameEmpty: { color: "rgba(250,245,238,0.68)", fontStyle: "italic" },
  driverMeta: { fontFamily: "GeistMono_700Bold", fontSize: 12, lineHeight: 12, fontWeight: "700", color: "#fff" },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, alignItems: "center", justifyContent: "center" },
  statusBadgeText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700" },
  statusBadgeWaiting: { backgroundColor: "rgba(250,245,238,0.05)", borderColor: "rgba(250,245,238,0.12)" },
  statusBadgeOnDelivery: { backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.35)" },
  statusBadgeDelivered: { backgroundColor: "rgba(52,211,154,0.10)", borderColor: "rgba(52,211,154,0.35)" },
  statusBadgeTextWaiting: { color: "rgba(250,245,238,0.65)" },
  statusBadgeTextOnDelivery: { color: "#ff8267" },
  statusBadgeTextDelivered: { color: "#34d39a" },
  dispatchTypeHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12,
    backgroundColor: "#241d18",
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.08)",
  },
  dispatchTypeIconWrap: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  dispatchTypeIconWrapDelivery: { backgroundColor: "rgba(255,61,20,0.14)" },
  dispatchTypeIconWrapTakeaway: { backgroundColor: "rgba(242,179,56,0.14)" },
  dispatchTypeLabel: { fontFamily: "Geist_700Bold", fontSize: 14, lineHeight: 14, fontWeight: "700", letterSpacing: -0.2, color: "#faf5ee" },
  dispatchTypeLabelDelivery: {},
  dispatchTypeLabelTakeaway: {},
  dispatchTypeFilaLabel: { fontFamily: "Geist_600SemiBold", fontSize: 11, lineHeight: 11, fontWeight: "600", color: "rgba(250,245,238,0.68)", letterSpacing: 0.2 },
  dispatchNavButton: {
    width: 28, height: 28, borderRadius: 7, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.10)", backgroundColor: "rgba(250,245,238,0.04)",
    alignItems: "center", justifyContent: "center",
  },
  dispatchNavButtonDisabled: { opacity: 0.3 },
  dispatchCardHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  dispatchCardHeaderDispatched: { backgroundColor: "rgba(52,211,154,0.10)" },
  dispatchCardAvatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(250,245,238,0.12)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  dispatchCardAvatarTakeaway: { backgroundColor: "rgba(242,179,56,0.14)" },
  dispatchCardAvatarText: { fontFamily: "Geist_700Bold", fontSize: 14, lineHeight: 14, fontWeight: "700", color: "#faf5ee" },
  dispatchCardDriverName: { fontFamily: "Geist_700Bold", fontSize: 15, lineHeight: 15, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.2 },
  dispatchCardDriverNameEmpty: { color: "rgba(250,245,238,0.68)", fontStyle: "italic" },
  dispatchCardStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  dispatchCardDot: { width: 5, height: 5, borderRadius: 3 },
  dispatchCardStatusText: { fontFamily: "GeistMono_600SemiBold", fontSize: 11, lineHeight: 11, fontWeight: "600", letterSpacing: 1.2 },
  dispatchQueueBadge: {
    minWidth: 30, height: 30, borderRadius: 9, backgroundColor: "#ff3d14",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  dispatchQueueBadgeText: { fontFamily: "GeistMono_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#ffffff" },
  dispatchDurationRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 14, paddingBottom: 12,
  },
  dispatchDurationBox: {
    flex: 1, borderRadius: 9, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.10)", backgroundColor: "rgba(250,245,238,0.04)",
    paddingHorizontal: 11, paddingVertical: 9, gap: 5,
  },
  dispatchDurationBoxRight: {},
  dispatchDurationLabel: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", color: "rgba(250,245,238,0.4)", letterSpacing: 0.5 },
  dispatchDurationValue: { fontFamily: "GeistMono_700Bold", fontSize: 15, lineHeight: 15, fontWeight: "700", color: "#faf5ee" },
  dispatchActionsRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  dispatchPrimaryButton: {
    flex: 1, height: 46, borderRadius: 11, backgroundColor: "#ff3d14",
    alignItems: "center", justifyContent: "center",
  },
  dispatchPrimaryButtonDisabled: { opacity: 0.4 },
  dispatchPrimaryButtonText: { fontFamily: "Geist_700Bold", fontSize: 15, lineHeight: 15, fontWeight: "700", color: "#ffffff" },
  dispatchMapButton: {
    flex: 1, height: 42, borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "rgba(250,245,238,0.05)",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 12, gap: 6,
  },
  dispatchMapButtonText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "rgba(250,245,238,0.7)" },
  dispatchMarkDeliveredButton: {
    flex: 1, height: 42, borderRadius: 10, backgroundColor: "#34d39a",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6,
  },
  dispatchMarkDeliveredButtonText: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#0e0b09" },
  dispatchMapIconButton: {
    width: 42, height: 42, borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "rgba(250,245,238,0.05)",
    alignItems: "center", justifyContent: "center",
  },
  dispatchReorderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: "rgba(250,245,238,0.07)",
  },
  dispatchReorderQueueLabel: { fontFamily: "GeistMono_600SemiBold", fontSize: 10, lineHeight: 10, fontWeight: "600", color: "rgba(250,245,238,0.68)", letterSpacing: 0.5 },
  summaryButtonsRow: { flexDirection: "row", gap: 8 },
  primaryButton: {
    flex: 1, paddingVertical: 10, borderRadius: 9, backgroundColor: "#ff3d14",
    alignItems: "center", justifyContent: "center",
  },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#ffffff" },
  secondaryButton: {
    flex: 1, paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "transparent",
    alignItems: "center", justifyContent: "center",
  },
  secondaryButtonText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "#faf5ee" },
  ordersColumn: { gap: 8, padding: 10 },
  orderCardWithSlot: { gap: 8 },
  dispatchInsertSlot: {
    width: "100%", height: 36, alignItems: "center", justifyContent: "center",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,61,20,0.35)",
    backgroundColor: "rgba(255,61,20,0.08)",
  },
  dispatchInsertSlotDisabled: { opacity: 0.5 },
  insertSlotPlaceholder: { width: "100%", height: 0 },
  orderCard: {
    borderRadius: 11, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
    backgroundColor: "rgba(250,245,238,0.04)", overflow: "hidden",
  },
  orderCardDimmed: { opacity: 0.38 },
  orderCardTop: { paddingHorizontal: 12, paddingVertical: 10, gap: 7 },
  orderBadgesRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  orderTypeBadge: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  orderTypeBadgeTakeaway: { borderColor: "rgba(242,179,56,0.35)", backgroundColor: "rgba(242,179,56,0.10)" },
  orderTypeBadgeText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  orderTypeBadgeTextTakeaway: { color: "#f2b338" },
  orderHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  deliveredBadge: { backgroundColor: "rgba(52,211,154,0.12)", borderColor: "rgba(52,211,154,0.35)", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  deliveredBadgeText: { color: "#34d39a", fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700" },
  departureBadge: { borderRadius: 6, borderWidth: 1, borderColor: "rgba(250,245,238,0.12)", backgroundColor: "rgba(250,245,238,0.05)", paddingHorizontal: 7, paddingVertical: 3 },
  departureBadgeLate: { borderColor: "rgba(255,61,20,0.4)", backgroundColor: "rgba(255,61,20,0.12)" },
  departureBadgeText: { color: "rgba(250,245,238,0.7)", fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  departureBadgeTextLate: { color: "#ff8267" },
  orderSmallText: { fontFamily: "Geist_500Medium", fontSize: 11, lineHeight: 11, fontWeight: "500", color: "rgba(250,245,238,0.60)" },
  orderCustomerName: { fontFamily: "Geist_700Bold", fontSize: 14, lineHeight: 14, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.2 },
  orderHeaderCustomerBlock: { flex: 1, gap: 4 },
  orderCustomerPhone: { fontFamily: "Geist_500Medium", fontSize: 11, lineHeight: 11, fontWeight: "500", color: "rgba(250,245,238,0.65)" },
  orderCustomerContactRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  orderWhatsAppButton: {
    flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 5,
    borderWidth: 1, borderColor: "rgba(52,211,154,0.35)",
    backgroundColor: "rgba(52,211,154,0.10)", paddingHorizontal: 7, paddingVertical: 3,
  },
  orderWhatsAppButtonText: { fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "#34d39a" },
  orderAddressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  orderAddressText: { flex: 1, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 12, color: "rgba(250,245,238,0.6)", fontWeight: "500" },
  orderEtaBadge: {
    borderRadius: 6, borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
    backgroundColor: "rgba(250,245,238,0.05)", paddingHorizontal: 7, paddingVertical: 3,
  },
  orderEtaText: { fontFamily: "GeistMono_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "rgba(250,245,238,0.7)" },
  dispatchDurationInfoContainer: { borderRadius: 8, flexDirection: "column", gap: 0 },
  dispatchDurationInfoRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 3, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7,
    backgroundColor: "rgba(250,245,238,0.04)", borderColor: "rgba(250,245,238,0.10)",
  },
  dispatchDurationInfoLabel: { fontFamily: "Geist_500Medium", fontSize: 11, lineHeight: 11, color: "rgba(250,245,238,0.60)", fontWeight: "500" },
  dispatchDurationInfoValue: { fontFamily: "GeistMono_700Bold", fontSize: 12, lineHeight: 12, color: "#faf5ee", fontWeight: "700" },
  noteContainer: { marginTop: 4, borderRadius: 7, borderWidth: 1, borderColor: "rgba(242,179,56,0.30)", backgroundColor: "rgba(242,179,56,0.08)" },
  noteInner: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 5 },
  noteText: { fontFamily: "Geist_400Regular", fontSize: 12, lineHeight: 12, color: "#f2b338", flexShrink: 1 },
  orderActionButton: {
    height: 38, borderRadius: 9, backgroundColor: "rgba(250,245,238,0.06)",
    borderWidth: 1, borderColor: "rgba(250,245,238,0.12)", alignItems: "center", justifyContent: "center",
  },
  showMoreSection: { paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: "rgba(250,245,238,0.07)" },
  showMoreSectionWithDivider: { borderTopWidth: 1, borderTopColor: "rgba(250,245,238,0.10)" },
  showMoreButton: {
    paddingVertical: 9, borderRadius: 9, backgroundColor: "rgba(250,245,238,0.05)",
    borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", alignItems: "center", justifyContent: "center",
  },
  showMoreButtonText: { fontFamily: "Geist_600SemiBold", fontSize: 12, lineHeight: 12, fontWeight: "600", color: "rgba(250,245,238,0.68)" },
  orderFooterButtonsRow: { flexDirection: "row", gap: 8 },
  orderFooterButton: { flex: 1 },
  orderActionButtonDisabled: { opacity: 0.45 },
  orderActionButtonText: { fontFamily: "Geist_600SemiBold", fontSize: 12, lineHeight: 12, fontWeight: "600", color: "rgba(250,245,238,0.7)" },
  orderItemsContainer: { paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  orderItemBlock: { width: "100%" },
  orderItemRow: {
    borderRadius: 9, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
    paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", gap: 10,
  },
  orderItemRowWithTasks: { borderBottomLeftRadius: 4, borderBottomRightRadius: 0 },
  orderItemContent: { flex: 1, flexDirection: "row", alignItems: "center" },
  orderItemText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "#faf5ee", flex: 1 },
  orderTaskRow: {
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: "rgba(250,245,238,0.10)", paddingHorizontal: 12, paddingVertical: 8, justifyContent: "center",
  },
  orderTaskRowStep: { marginLeft: 12 },
  orderTaskRowModifier: { marginLeft: 24 },
  orderTaskRowWithChildren: { borderBottomLeftRadius: 4, borderBottomRightRadius: 0 },
  orderTaskRowLast: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  orderTaskRowText: { fontFamily: "Geist_600SemiBold", fontSize: 13, lineHeight: 13, fontWeight: "600", color: "#faf5ee", flex: 1 },
  orderTaskRowInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderTaskCompletedBadge: { borderRadius: 5, borderWidth: 1, borderColor: "rgba(52,211,154,0.35)", backgroundColor: "rgba(52,211,154,0.10)", paddingHorizontal: 5, paddingVertical: 2 },
  orderTaskCompletedBadgeText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", color: "#34d39a" },
  prizeBadge: { borderRadius: 5, borderWidth: 1, borderColor: "rgba(250,245,238,0.20)", backgroundColor: "rgba(250,245,238,0.07)", paddingHorizontal: 5, paddingVertical: 2 },
  prizeBadgeText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", color: "rgba(250,245,238,0.7)" },
  rewardBadge: { borderRadius: 5, borderWidth: 1, borderColor: "rgba(52,211,154,0.30)", backgroundColor: "rgba(52,211,154,0.08)", paddingHorizontal: 5, paddingVertical: 2 },
  rewardBadgeText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", color: "#34d39a" },
  orderItemStatus: { fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "#f2b338" },
  orderItemDeliveredStatus: { color: "#34d39a" },
  feedbackText: { fontFamily: "Geist_600SemiBold", fontSize: 14, lineHeight: 14, fontWeight: "600", color: "rgba(250,245,238,0.60)", padding: 24 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: "GeistMono_400Regular", fontSize: 13, color: "rgba(250,245,238,0.40)", letterSpacing: 0.4 },
  errorToast: {
    position: "absolute",
    maxWidth: 360,
    minWidth: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,61,20,0.28)",
    backgroundColor: "#24110d",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
    zIndex: 80,
  },
  errorToastText: {
    flex: 1,
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#ffd8cf",
  },
  mapDrawerLayer: { ...StyleSheet.absoluteFillObject, zIndex: 40, flexDirection: "row", justifyContent: "flex-end" },
  mapDrawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  mapDrawer: {
    width: "100%", height: "100%", backgroundColor: "#181310", flexDirection: "column",
    borderLeftWidth: 1, borderLeftColor: "rgba(250,245,238,0.10)", padding: 16, gap: 12,
  },
  mapDrawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mapDrawerTitle: { fontFamily: "Geist_700Bold", fontSize: 18, lineHeight: 18, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.3 },
  mapDrawerSubtitle: { fontFamily: "Geist_400Regular", fontSize: 12, lineHeight: 12, color: "rgba(250,245,238,0.65)", marginTop: 4 },
  mapDrawerCloseButton: {
    height: 34, width: 34, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(250,245,238,0.07)", borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
  },
  routeMapInteractive: { flex: 2, minWidth: 0, minHeight: 420, borderRadius: 10, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", backgroundColor: "#0e0b09" },
  routeMapFallbackCard: { flex: 1, minHeight: 200 },
  routeContentRow: { flexDirection: "column", flex: 1, gap: 10 },
  routeMapFullHeight: { flex: 1, minHeight: 200, borderRadius: 10, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", backgroundColor: "#16120F", overflow: "hidden" },
  routePointsStrip: { borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", borderRadius: 10, backgroundColor: "#0e0b09", padding: 8, gap: 6 },
  routePointsHScroll: { flexShrink: 0 },
  routePointsHBlock: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  routePointCard: {
    width: 160, flexDirection: "column", gap: 6, borderRadius: 9,
    borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", padding: 8,
    backgroundColor: "rgba(250,245,238,0.03)",
  },
  routePointsPanel: { width: 340, maxHeight: 420, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", borderRadius: 10, backgroundColor: "#0e0b09", padding: 8, gap: 8 },
  routePointsScroll: { flex: 1 },
  mapFallbackCard: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", backgroundColor: "rgba(250,245,238,0.03)", padding: 12 },
  mapFallbackText: { fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 13, color: "rgba(250,245,238,0.60)", fontWeight: "500" },
  routePointsBlock: { gap: 6 },
  routeLoadingText: { fontFamily: "Geist_600SemiBold", fontSize: 11, lineHeight: 11, color: "rgba(250,245,238,0.60)", fontWeight: "600", marginBottom: 2 },
  routePointRow: {
    flexDirection: "row", gap: 10, alignItems: "flex-start", borderRadius: 9,
    borderWidth: 1, borderColor: "rgba(250,245,238,0.10)", paddingVertical: 8,
    paddingHorizontal: 10, backgroundColor: "rgba(250,245,238,0.03)",
  },
  routePointIndex: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#ff3d14", alignItems: "center", justifyContent: "center" },
  routePointIndexText: { fontFamily: "GeistMono_700Bold", fontSize: 10, lineHeight: 10, color: "#ffffff", fontWeight: "700" },
  routePointTextBlock: { flex: 1, gap: 3 },
  routePointLabel: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 13, fontWeight: "700", color: "#faf5ee" },
  routePointAddress: { fontFamily: "Geist_400Regular", fontSize: 11, lineHeight: 11, color: "rgba(250,245,238,0.65)" },
  routePointMapsButton: {
    minHeight: 28, borderRadius: 7, borderWidth: 1, borderColor: "rgba(250,245,238,0.15)",
    backgroundColor: "rgba(250,245,238,0.05)", paddingHorizontal: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
  },
  routePointMapsButtonText: { fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "rgba(250,245,238,0.7)" },
  dispatchDropCard: { width: "100%", height: 60, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  dispatchDropCardActive: { borderColor: "rgba(255,61,20,0.4)", backgroundColor: "rgba(255,61,20,0.07)", opacity: 1 },
  dispatchDropCardInactive: { borderColor: "rgba(250,245,238,0.12)", backgroundColor: "transparent", opacity: 0.6 },

  // Order card — redesigned
  orderTicketRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  orderTicketBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
    backgroundColor: "rgba(250,245,238,0.09)", borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
  },
  orderTicketText: { fontFamily: "GeistMono_700Bold", fontSize: 11, lineHeight: 11, fontWeight: "700", color: "#faf5ee", letterSpacing: 0.2 },
  orderCustomerNameStandalone: { fontFamily: "Geist_700Bold", fontSize: 16, lineHeight: 16, fontWeight: "700", color: "#faf5ee", letterSpacing: -0.3, marginBottom: 6 },
  orderAddressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(250,245,238,0.3)", flexShrink: 0 },
  orderItemsInlineText: { fontSize: 12, lineHeight: 17, color: "rgba(250,245,238,0.62)", fontWeight: "500", marginTop: 5, fontFamily: "GeistMono_400Regular", letterSpacing: 0.22 },
  orderCardFooter: {
    flexDirection: "column", gap: 6,
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4,
  },
  orderMoveButton: {
    flex: 1, height: 36, borderRadius: 8, borderWidth: 1,
    borderColor: "rgba(250,245,238,0.12)", backgroundColor: "rgba(250,245,238,0.05)",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  orderMoveButtonText: { fontFamily: "Geist_600SemiBold", fontSize: 12, lineHeight: 12, fontWeight: "600", color: "rgba(250,245,238,0.6)" },
  orderMoveButtonCancel: { borderColor: "rgba(255,61,20,0.25)", backgroundColor: "rgba(255,61,20,0.08)" },
  orderMoveButtonTextCancel: { color: "#ff3d14" },
  orderMoveButtonDisabled: { opacity: 0.35 },
  orderDepartureTime: { fontFamily: "GeistMono_700Bold", fontSize: 14, lineHeight: 14, fontWeight: "700", color: "#f2b338", letterSpacing: -0.3 },
  orderDepartureTimeLate: { color: "#ff3d14" },
  orderTimerPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,61,20,0.10)",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  orderTimerDot: { width: 6, height: 6, borderRadius: 999 },
  orderTimerText: { fontFamily: "GeistMono_700Bold", fontSize: 12, lineHeight: 12, fontWeight: "700", color: "#f2b338", letterSpacing: 0.4 },
  orderTimerTextLate: { color: "#ff3d14" },

  // ── Direction B: Urgency chip ─────────────────────────────────────────────
  urgencyChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 9999, paddingVertical: 4, paddingHorizontal: 9,
  },
  urgencyChipText: { fontFamily: "Geist_600SemiBold", fontSize: 12, lineHeight: 14, fontWeight: "600" },
  sourceBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7,
  },
  sourceBadgeText: { fontFamily: "Geist_700Bold", fontSize: 10, lineHeight: 10, fontWeight: "700", letterSpacing: 0.2 },

  // ── Direction B: Status strip ─────────────────────────────────────────────
  statusStrip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, borderRadius: 10, borderLeftWidth: 3,
  },
  statusStripTitle: { fontFamily: "Geist_700Bold", fontSize: 13, lineHeight: 16, fontWeight: "700" },
  statusStripNote: { fontFamily: "Geist_400Regular", fontSize: 11, color: "#C8BCB0", marginTop: 2 },
  statusStripReturn: { fontFamily: "GeistMono_500Medium", fontSize: 12 },

  // ── Direction B: Card header ──────────────────────────────────────────────
  dispatchCardHeader2: {
    flexDirection: "row", alignItems: "center", gap: 11,
    padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(239,231,218,0.055)",
  },
  dispatchCardHeader2Title: {
    fontFamily: "Geist_700Bold", fontSize: 18, lineHeight: 20, fontWeight: "700",
    color: "#FAF5EE", letterSpacing: -0.3,
  },
  dispatchCardHeader2Sub: {
    fontFamily: "Geist_400Regular", fontSize: 12, color: "#9C8E83", marginTop: 3,
  },

  // ── Direction B: Dispatch level container ────────────────────────────────
  dispatchLevel: {
    padding: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(239,231,218,0.055)",
  },

  // ── Direction B: Driver row ───────────────────────────────────────────────
  driverRow2: {
    flexDirection: "row", alignItems: "center", gap: 11,
    padding: 10, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1, borderColor: "rgba(239,231,218,0.055)",
  },
  driverRow2Avatar: {
    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
    backgroundColor: "rgba(239,231,218,0.07)",
    borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(239,231,218,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  driverRow2AvatarFilled: {
    backgroundColor: "#C72A0A", borderWidth: 0, borderStyle: "solid",
  },
  driverRow2AvatarText: {
    fontFamily: "Geist_700Bold", fontSize: 14, fontWeight: "700", color: "#fff",
  },
  driverRow2Name: {
    fontFamily: "Geist_600SemiBold", fontSize: 15, fontWeight: "600", color: "#FAF5EE", lineHeight: 18,
  },
  driverRow2NameEmpty: { color: "#9C8E83" },
  driverRow2Sub: { fontFamily: "Geist_400Regular", fontSize: 12, color: "#9C8E83", marginTop: 2 },
  driverRow2ActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1,
  },
  driverRow2ActionBtnPrimary: {
    backgroundColor: "rgba(255,61,20,0.14)", borderColor: "rgba(255,61,20,0.3)",
  },
  driverRow2ActionBtnSecondary: {
    backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(239,231,218,0.09)",
  },
  driverRow2ActionText: {
    fontFamily: "Geist_600SemiBold", fontSize: 12.5, fontWeight: "600", color: "#FF3D14",
  },
  driverRow2ActionTextSecondary: { color: "#C8BCB0" },

  // ── Direction B: ETA boxes ────────────────────────────────────────────────
  etaBox: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1, borderColor: "rgba(239,231,218,0.055)",
    borderRadius: 10, padding: 11,
  },
  etaBoxLabel: {
    fontFamily: "Geist_600SemiBold", fontSize: 10, fontWeight: "600",
    letterSpacing: 0.8, color: "#6C6259", marginBottom: 8,
  },
  etaBoxTrack: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  etaBoxOriginDot: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "#352D27", borderWidth: 2, borderColor: "#6C6259",
  },
  etaBoxLine: { flex: 1, height: 0, borderBottomWidth: 2, borderStyle: "dashed" },
  etaBoxValue: {
    fontFamily: "Geist_600SemiBold", fontSize: 18, fontWeight: "600",
    color: "#FAF5EE", lineHeight: 20,
  },

  // ── Direction B: Action buttons ───────────────────────────────────────────
  dispatchBtn2Primary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 10,
    backgroundColor: "#FF3D14",
  },
  dispatchBtn2PrimaryDisabled: { backgroundColor: "rgba(255,61,20,0.22)" },
  dispatchBtn2PrimaryText: {
    fontFamily: "Geist_700Bold", fontSize: 16, fontWeight: "700", color: "#ffffff",
  },
  dispatchBtn2PrimaryTextDisabled: { color: "rgba(250,245,238,0.45)" },
  dispatchBtn2Secondary: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingVertical: 0, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(239,231,218,0.09)",
  },
  dispatchBtn2SecondaryText: {
    fontFamily: "Geist_600SemiBold", fontSize: 13.5, fontWeight: "600", color: "#FAF5EE",
  },
  dispatchBtn2Route: {
    width: "100%" as any, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(239,231,218,0.09)",
  },
  dispatchBtn2RouteText: {
    fontFamily: "Geist_600SemiBold", fontSize: 14, fontWeight: "600", color: "#FAF5EE",
  },

  // ── Direction B: Order card ───────────────────────────────────────────────
  orderCard2: {
    flexDirection: "row", overflow: "hidden",
    backgroundColor: "#2A231E",
    borderWidth: 1, borderColor: "rgba(239,231,218,0.09)", borderRadius: 10,
  },
  orderCard2Rail: { width: 4, flexShrink: 0 },
  orderCard2Body: { padding: 12, gap: 8 },
  orderCard2Id: {
    fontFamily: "GeistMono_500Medium", fontSize: 11.5, fontWeight: "500", color: "#6C6259",
  },
  orderCard2Name: {
    fontFamily: "Geist_700Bold", fontSize: 18, fontWeight: "700", color: "#FAF5EE", letterSpacing: -0.3,
  },
  orderCard2Address: {
    flex: 1, fontFamily: "Geist_400Regular", fontSize: 13, color: "#FAF5EE", lineHeight: 18,
  },
  orderCard2ComplLabel: {
    fontFamily: "Geist_600SemiBold", fontSize: 12, fontWeight: "600", color: "#FF3D14",
  },
  orderCard2Compl: {
    fontFamily: "Geist_400Regular", fontSize: 12, color: "#C8BCB0", flex: 1,
  },
  orderCard2Item: {
    fontFamily: "GeistMono_400Regular", fontSize: 12, color: "#C8BCB0",
  },
  orderCard2ItemMore: {
    fontFamily: "Geist_400Regular", fontSize: 11.5, color: "#6C6259",
  },
  orderCard2Footer: {
    gap: 7, paddingHorizontal: 12, paddingBottom: 12,
  },
  orderCard2BtnSuccess: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    paddingVertical: 8, borderRadius: 8,
    backgroundColor: "rgba(0,168,102,0.14)", borderWidth: 1, borderColor: "rgba(0,168,102,0.28)",
  },
  orderCard2BtnSuccessText: {
    fontFamily: "Geist_600SemiBold", fontSize: 12.5, fontWeight: "600", color: "#34D98A",
  },
  orderCard2BtnGhost: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(239,231,218,0.09)",
  },
  orderCard2BtnGhostText: {
    fontFamily: "Geist_600SemiBold", fontSize: 12.5, fontWeight: "600", color: "#C8BCB0",
  },
  // ── Empty state ──
  emptyState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 24, paddingVertical: 72,
  },
  emptyStateIconTile: {
    width: 76, height: 76, borderRadius: 20, marginBottom: 22,
    backgroundColor: "rgba(255,61,20,0.10)", borderWidth: 1, borderColor: "rgba(255,61,20,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  emptyStateTitle: {
    fontFamily: "Geist_700Bold", fontSize: 21, fontWeight: "700", color: "#FAF5EE",
    letterSpacing: -0.2, textAlign: "center",
  },
  emptyStateSub: {
    fontFamily: "Geist_400Regular", fontSize: 14.5, color: "#9C8E83",
    lineHeight: 22, marginTop: 8, textAlign: "center", maxWidth: 380,
  },
  emptyStateCTA: {
    flexDirection: "row", alignItems: "center", gap: 7,
    height: 42, paddingHorizontal: 18, marginTop: 24,
    borderRadius: 10, backgroundColor: "#FF3D14",
  },
  emptyStateCTAText: {
    fontFamily: "Geist_700Bold", fontSize: 14.5, fontWeight: "700", color: "#fff",
  },

  // ── Driver selector modal ────────────────────────────────────────────────
  driverSelectorBackdrop: {
    flex: 1, backgroundColor: "rgba(10,8,6,0.72)", alignItems: "center",
    justifyContent: "flex-start", paddingTop: 80, paddingHorizontal: 20,
  },
  driverSelectorPanel: {
    width: "100%", maxWidth: 460, maxHeight: "80%",
    backgroundColor: "#211C18", borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.5, shadowRadius: 48,
    elevation: 20,
  },
  driverSelectorHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.08)",
  },
  driverSelectorIconWrap: {
    width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,61,20,0.14)", flexShrink: 0,
  },
  driverSelectorTitle: {
    fontFamily: "Geist_700Bold", fontSize: 17, fontWeight: "700", color: "#FAF5EE", lineHeight: 18,
  },
  driverSelectorSub: {
    fontFamily: "Geist_400Regular", fontSize: 12.5, color: "#9C8E83", marginTop: 3,
  },
  driverSelectorCloseBtn: {
    width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(239,231,218,0.05)", borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
    flexShrink: 0,
  },
  driverSelectorList: {
    flexGrow: 0,
  },
  driverSelectorRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 10, paddingVertical: 11, borderRadius: 11,
    borderWidth: 1, borderColor: "transparent",
  },
  driverSelectorRowCurrent: {
    backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.28)",
  },
  driverSelectorRowDisabled: {
    opacity: 0.5,
  },
  driverSelectorAvatar: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "#C72A0A",
  },
  driverSelectorAvatarDisabled: {
    backgroundColor: "rgba(239,231,218,0.08)",
  },
  driverSelectorAvatarText: {
    fontFamily: "Geist_700Bold", fontSize: 14, fontWeight: "700", color: "#fff",
  },
  driverSelectorName: {
    fontFamily: "Geist_600SemiBold", fontSize: 14.5, fontWeight: "600", color: "#FAF5EE", flex: 1,
  },
  driverSelectorCurrentBadge: {
    backgroundColor: "rgba(255,61,20,0.14)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0,
  },
  driverSelectorCurrentBadgeText: {
    fontFamily: "Geist_700Bold", fontSize: 10.5, fontWeight: "700",
    color: "#FF7A5C", textTransform: "uppercase", letterSpacing: 0.4,
  },
  driverSelectorPriority: {
    fontFamily: "GeistMono_500Medium", fontSize: 11.5, color: "#9C8E83", marginTop: 2,
  },
  driverSelectorStatusBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0,
  },
  driverSelectorStatusDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  driverSelectorStatusText: {
    fontFamily: "Geist_600SemiBold", fontSize: 12, fontWeight: "600",
  },
  driverSelectorRowIcon: {
    width: 22, alignItems: "center", flexShrink: 0,
  },

  // ── Route modal ──────────────────────────────────────────────────────────
  routeModal: {
    flex: 1, backgroundColor: "#16120F", flexDirection: "column",
  },
  routeModalTopBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.08)",
  },
  routeModalIconWrap: {
    width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,61,20,0.12)", borderWidth: 1, borderColor: "rgba(255,61,20,0.22)",
    flexShrink: 0,
  },
  routeModalTitle: {
    fontFamily: "Geist_700Bold", fontSize: 16, fontWeight: "700", color: "#FAF5EE", letterSpacing: -0.2,
  },
  routeModalSub: {
    fontFamily: "Geist_400Regular", fontSize: 12, color: "rgba(250,245,238,0.55)", marginTop: 2,
  },
  routeModalTimePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: "rgba(255,61,20,0.10)", borderWidth: 1, borderColor: "rgba(255,61,20,0.20)",
    flexShrink: 0,
  },
  routeModalTimePillText: {
    fontFamily: "GeistMono_700Bold", fontSize: 13, fontWeight: "700", color: "#FF3D14",
  },
  routeModalTimePillSub: {
    fontFamily: "Geist_400Regular", fontSize: 11, color: "rgba(255,61,20,0.65)",
  },
  routeModalCloseBtn: {
    width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(250,245,238,0.07)", borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
    flexShrink: 0,
  },
  routeModalBody: {
    flex: 1, flexDirection: "row",
  },
  routeModalMapArea: {
    flex: 1, backgroundColor: "#0e0b09",
  },
  routeModalMapFallback: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12,
  },
  routeModalMapFallbackText: {
    fontFamily: "Geist_500Medium", fontSize: 13, fontWeight: "500", color: "rgba(250,245,238,0.4)",
  },
  routeModalPanel: {
    width: 320, flexDirection: "column",
    borderLeftWidth: 1, borderLeftColor: "rgba(250,245,238,0.08)",
    backgroundColor: "#1A1410",
  },
  routeModalPanelHeader: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(250,245,238,0.08)",
  },
  routeModalFullRouteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    height: 40, borderRadius: 10, backgroundColor: "#FF3D14",
  },
  routeModalFullRouteBtnText: {
    fontFamily: "Geist_700Bold", fontSize: 13.5, fontWeight: "700", color: "#fff",
  },
  routeModalStopsList: {
    paddingHorizontal: 14, paddingVertical: 12, gap: 0,
  },

  // ── Route stop rows ───────────────────────────────────────────────────────
  routeStopRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
  },
  routeStopOriginIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: "#FF3D14", flexShrink: 0, marginTop: 2,
  },
  routeStopReturnIcon: {
    backgroundColor: "rgba(250,245,238,0.07)", borderWidth: 1, borderColor: "rgba(250,245,238,0.15)",
  },
  routeStopNumBubble: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,61,20,0.15)", borderWidth: 1.5, borderColor: "#FF3D14",
    flexShrink: 0, marginTop: 2,
  },
  routeStopNumText: {
    fontFamily: "GeistMono_700Bold", fontSize: 13, fontWeight: "700", color: "#FF3D14",
  },
  routeStopInfo: {
    flex: 1, minWidth: 0, paddingBottom: 4,
  },
  routeStopEyebrow: {
    fontFamily: "Geist_600SemiBold", fontSize: 10, fontWeight: "600",
    letterSpacing: 0.9, color: "rgba(250,245,238,0.45)", marginBottom: 3,
  },
  routeStopTitleRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  routeStopTitle: {
    fontFamily: "Geist_700Bold", fontSize: 14, fontWeight: "700", color: "#FAF5EE", letterSpacing: -0.1,
  },
  routeStopAddressRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 3,
  },
  routeStopAddress: {
    fontFamily: "Geist_400Regular", fontSize: 12, color: "rgba(250,245,238,0.55)", lineHeight: 17, flex: 1,
  },
  routeStopComplRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 3,
  },
  routeStopComplLabel: {
    fontFamily: "Geist_600SemiBold", fontSize: 11, fontWeight: "600", color: "#FF3D14", flexShrink: 0,
  },
  routeStopCompl: {
    fontFamily: "Geist_400Regular", fontSize: 11, color: "rgba(250,245,238,0.65)", flex: 1, lineHeight: 16,
  },
  routeStopMapsBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    marginTop: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7,
    backgroundColor: "rgba(250,245,238,0.05)", borderWidth: 1, borderColor: "rgba(250,245,238,0.12)",
  },
  routeStopMapsBtnText: {
    fontFamily: "Geist_600SemiBold", fontSize: 11, fontWeight: "600", color: "rgba(250,245,238,0.6)",
  },

  // ── Route connectors ──────────────────────────────────────────────────────
  routeConnector: {
    flexDirection: "row", alignItems: "center", paddingLeft: 17, gap: 8, marginVertical: 6,
  },
  routeConnectorLine: {
    width: 2, height: 28, backgroundColor: "rgba(250,245,238,0.15)", borderRadius: 1, flexShrink: 0,
  },
  routeConnectorLineDashed: {
    backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(250,245,238,0.12)", width: 0,
  },
  routeConnectorChip: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(250,245,238,0.06)", borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
  },
  routeConnectorTimePill: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
    backgroundColor: "rgba(250,245,238,0.06)", borderWidth: 1, borderColor: "rgba(250,245,238,0.10)",
  },
  routeConnectorTimeText: {
    fontFamily: "GeistMono_500Medium", fontSize: 11, color: "rgba(250,245,238,0.5)",
  },
});
