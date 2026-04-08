import BackToSitemapButton from "@/components/BackToSitemapButton";
import type { TPreparationStepCategory } from "@/types/station";
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
//@ts-expect-error
import DispatchRouteMap from "../components/dispatch/DispatchRouteMap";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "web" ? "http://localhost:3000/api" : "http://192.168.1.151:3000/api");

type TDispatchOrder = {
  id: string;
  createdAt: string;
  number?: string;
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
  } | null;
  deliveryAddress?: {
    id: string;
    createdAt: string;
    description?: string;
    street: string;
    number: string;
    complement?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: string;
    lng?: string;
    deliveryFee?: number;
  } | null;
  orderProducts: {
    id: string;
    productId: string;
    product?: {
      id: string;
      name: string;
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

type TDispatch = {
  id: string;
  createdAt: string;
  dispatched: boolean;
  dispatchAt?: string | null;
  estimatedDeliveryDurationMinutes?: number | null;
  estimatedRoundTripDurationMinutes?: number | null;
  driverId?: string | null;
  driver?: TDispatchDriver | null;
  orders: TDispatchOrder[];
};

const FALLBACK_ADDRESS = "Av. Paulista, 1000";
const FALLBACK_CUSTOMER = "Maria Santos";
const ROUTE_ORIGIN = {
  lat: 28.34871749755003,
  lng: -81.65145586075074,
  label: "Origem",
};
const MAP_DRAWER_WIDTH = 420;
const DISPATCH_POLL_INTERVAL_MS = 10000;

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

function parseCoordinate(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDispatchRoutePoints(dispatch: TDispatch): TRoutePoint[] {
  const deliveryPoints: TRoutePoint[] = dispatch.orders
    .map((order) => {
      const lat = parseCoordinate(order.deliveryAddress?.lat);
      const lng = parseCoordinate(order.deliveryAddress?.lng);
      if (lat === null || lng === null) return null;

      return {
        lat,
        lng,
        label: `Pedido #${order.number ?? order.id.slice(0, 6)}`,
      };
    })
    .filter((point): point is TRoutePoint => point !== null);

  return [ROUTE_ORIGIN, ...deliveryPoints];
}

function toDirectRouteCoordinates(points: TRoutePoint[]): TRouteCoordinate[] {
  return points.map((point) => ({
    latitude: point.lat,
    longitude: point.lng,
  }));
}

async function fetchDrivingRouteCoordinates(
  points: TRoutePoint[],
): Promise<TRouteCoordinate[] | null> {
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
      geometry?: {
        coordinates?: [number, number][];
      };
    }[];
  };

  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (!coordinates || coordinates.length === 0) return null;

  return coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));
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

export async function fetchDispatches() {
  const response = await fetch(`${API_BASE_URL}/dispatches`);

  if (!response.ok) {
    throw new Error("Falha ao buscar entregas");
  }

  return response.json() as Promise<TDispatch[]>;
}

type TUpdateDispatchStatusPayload = {
  dispatched: boolean;
  dispatchAt?: string | null;
  dispatchedAt?: string | null;
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
  dispatchId: string,
  payload: TUpdateDispatchStatusPayload,
) {
  const response = await fetch(`${API_BASE_URL}/dispatches/${dispatchId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
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
): Promise<TMoveDispatchOrderResponse> {
  const response = await fetch(`${API_BASE_URL}/dispatches/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

type TWatchDispatchesOptions = {
  intervalMs?: number;
  onDispatches?: (dispatches: TDispatch[]) => void;
  onError?: (error: unknown) => void;
};

export function watchDispatches({
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
      const nextDispatches = await fetchDispatches();
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
  onActionPress: () => void;
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

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}

function OrderElapsedBadge({ date }: { date: string }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = new Date(date).getTime();

    const update = () => {
      setElapsedMs(Math.max(0, Date.now() - start));
    };

    update();
    const timerId = setInterval(update, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [date]);

  return (
    <View style={styles.deliveredBadge}>
      <Text style={styles.deliveredBadgeText}>{formatElapsed(elapsedMs)}</Text>
    </View>
  );
}

function formatMinutes(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
    return "-";
  }
  return `${Math.round(minutes)} min`;
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

function DispatchOrderCard({
  order,
  dispatchDispatched,
  actionLabel,
  actionDisabled,
  showActionButton = true,
  isDimmed,
  onActionPress,
}: DispatchOrderCardProps) {
  const customerName = order.customer?.name ?? FALLBACK_CUSTOMER;
  const orderStatus = getDerivedOrderStatus(order, dispatchDispatched);
  const addressLine = order.deliveryAddress
    ? `${order.deliveryAddress.street}, ${order.deliveryAddress.number}${order.deliveryAddress.complement ? ` - ${order.deliveryAddress.complement}` : ""
    }`
    : FALLBACK_ADDRESS;

  const orderItems =
    order.orderProducts.length > 0
      ? order.orderProducts.map((orderProduct) => {
        const productName = orderProduct.product?.name ?? "Item sem nome";
        return `${orderProduct.quantity}x  ${productName}`;
      })
      : ["1x  Item do pedido"];

  return (
    <View style={[styles.orderCard, isDimmed && styles.orderCardDimmed]}>
      <View style={styles.orderCardTop}>
        <View style={styles.orderHeaderRow}>
          <Text style={styles.orderSmallText}>Pedido #{order.number ?? "1235"}</Text>
          {orderStatus === "DELIVERED" ? (
            <View style={styles.deliveredBadge}>
              <Text style={styles.deliveredBadgeText}>Delivered</Text>
            </View>
          ) : (
            <OrderElapsedBadge date={order.createdAt} />
          )}
        </View>
        <Text style={styles.orderCustomerName}>{customerName}</Text>
        <Text style={styles.orderAddress}>{addressLine}</Text>
        {order.deliveryAddress?.complement && (
          <View style={styles.noteContainer}>
            <View style={styles.noteInner}>
              <Feather name="file-text" size={16} color="#e67e22" />
              <Text style={styles.noteText}>{order.deliveryAddress?.complement}</Text>
            </View>
          </View>
        )}
        {showActionButton && (
          <Pressable
            style={[styles.orderActionButton, actionDisabled && styles.orderActionButtonDisabled]}
            disabled={actionDisabled}
            onPress={onActionPress}
          >
            <Text style={styles.orderActionButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.orderItemsContainer}>
        {orderItems.map((item) => (
          <View key={`${order.id}-${item}`} style={styles.orderItemRow}>
            <Text style={styles.orderItemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type DispatchColumnProps = {
  dispatch: TDispatch;
  isDispatching: boolean;
  movingOrderId: string | null;
  isMoveBusy: boolean;
  movingSourceDispatchId: string | null;
  movingSourceOrderIndex: number | null;
  onDispatch: (dispatchId: string) => void;
  onStartMove: (orderId: string, sourceDispatchId: string, sourceOrderIndex: number) => void;
  onCancelMove: () => void;
  onMoveToIndex: (targetDispatchId: string, targetIndex: number) => void;
  onOpenMap: (dispatch: TDispatch) => void;
};

type TDispatchStatus = "Waiting" | "On delivery" | "Delivered";

function getDispatchStatus(dispatch: TDispatch): TDispatchStatus {
  if (!dispatch.dispatched) return "Waiting";
  if (dispatch.orders.every((order) => order.delivered)) return "Delivered";
  return "On delivery";
}

function DispatchColumn({
  dispatch,
  isDispatching,
  movingOrderId,
  isMoveBusy,
  movingSourceDispatchId,
  movingSourceOrderIndex,
  onDispatch,
  onStartMove,
  onCancelMove,
  onMoveToIndex,
  onOpenMap,
}: DispatchColumnProps) {
  const driverName = dispatch.driver?.name ?? "Marco Rossi";
  const sortedOrders = getSortedDispatchOrders(dispatch.orders);
  const orderCount = sortedOrders.length;
  const dispatchStatus = getDispatchStatus(dispatch);
  const isWaiting = dispatchStatus === "Waiting";
  const isOnDelivery = dispatchStatus === "On delivery";
  const isDispatchButtonDisabled = dispatch.dispatched || isDispatching;
  const isMoveMode = !!movingOrderId;

  const renderInsertSlot = (targetIndex: number) => {
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
        <Feather name="plus" size={22} color="#666666" />
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.dispatchColumn} contentContainerStyle={styles.dispatchColumn}>
      <View style={styles.dispatchSummaryCard}>
        <View style={styles.dispatchSummaryInner}>
          <View style={styles.dispatchHeaderRow}>
            <View>
              <Text style={styles.driverName}>{driverName}</Text>
              <Text style={styles.driverMeta}>{orderCount} pedidos</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                isWaiting
                  ? styles.statusBadgeWaiting
                  : isOnDelivery
                    ? styles.statusBadgeOnDelivery
                    : styles.statusBadgeDelivered,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isWaiting
                    ? styles.statusBadgeTextWaiting
                    : isOnDelivery
                      ? styles.statusBadgeTextOnDelivery
                      : styles.statusBadgeTextDelivered,
                ]}
              >
                {dispatchStatus}
              </Text>
            </View>
          </View>

          <View style={styles.dispatchDurationInfoContainer}>
            <View style={[styles.dispatchDurationInfoRow, {
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderRightWidth: 0,
            }]}>
              <Text style={styles.dispatchDurationInfoLabel}>Entrega</Text>
              <Text style={styles.dispatchDurationInfoValue}>
                {formatMinutes(dispatch.estimatedDeliveryDurationMinutes)}
              </Text>
            </View>
            <View style={[styles.dispatchDurationInfoRow, {
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
            }]}>
              <Text style={styles.dispatchDurationInfoLabel}>Ida e volta</Text>
              <Text style={styles.dispatchDurationInfoValue}>
                {formatMinutes(dispatch.estimatedRoundTripDurationMinutes)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryButtonsRow}>
            <Pressable
              disabled={isDispatchButtonDisabled}
              style={[
                styles.primaryButton,
                isDispatchButtonDisabled && styles.primaryButtonDisabled,
              ]}
              onPress={() => onDispatch(dispatch.id)}
            >
              <Text style={styles.primaryButtonText}>
                {isDispatching ? "Despachando..." : "Despachar"}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => onOpenMap(dispatch)}>
              <Text style={styles.secondaryButtonText}>Ver mapa</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.ordersColumn}>
        {isMoveMode && renderInsertSlot(1)}

        {sortedOrders.map((order, index) => {
          const currentIndex = index + 1;
          const isSelectedOrder = movingOrderId === order.id;
          const canStartMove = !isMoveMode && !order.delivered && !isMoveBusy;

          const actionLabel = isSelectedOrder
            ? "Cancelar"
            : "Alterar despacho";

          const actionDisabled = isSelectedOrder ? isMoveBusy : !canStartMove;
          const showActionButton = isSelectedOrder || !isMoveMode;

          return (
            <View key={order.id} style={styles.orderCardWithSlot}>
              <DispatchOrderCard
                order={order}
                dispatchDispatched={dispatch.dispatched}
                actionLabel={actionLabel}
                actionDisabled={actionDisabled}
                showActionButton={showActionButton}
                isDimmed={isMoveMode && !isSelectedOrder}
                onActionPress={() => {
                  if (isSelectedOrder) {
                    onCancelMove();
                    return;
                  }

                  if (canStartMove) {
                    onStartMove(order.id, dispatch.id, currentIndex);
                  }
                }}
              />
              {isMoveMode && renderInsertSlot(currentIndex + 1)}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function Dispatch() {
  const [dispatches, setDispatches] = useState<TDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatchingIds, setDispatchingIds] = useState<Record<string, boolean>>({});
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);
  const [movingSourceDispatchId, setMovingSourceDispatchId] = useState<string | null>(null);
  const [movingSourceOrderIndex, setMovingSourceOrderIndex] = useState<number | null>(null);
  const [isMoveBusy, setIsMoveBusy] = useState(false);
  const [selectedDispatchForMap, setSelectedDispatchForMap] = useState<TDispatch | null>(
    null
  );
  const [routeCoordinates, setRouteCoordinates] = useState<TRouteCoordinate[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const drawerTranslateX = useRef(new Animated.Value(MAP_DRAWER_WIDTH)).current;

  useEffect(() => {
    const watcher = watchDispatches({
      intervalMs: DISPATCH_POLL_INTERVAL_MS,
      onDispatches: (nextDispatches) => {
        setError(null);
        setDispatches(nextDispatches);
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
  }, []);

  const columns = useMemo(() => {
    if (dispatches.length > 0) return dispatches;
    if (loading || error) return [];

    return [];
  }, [dispatches, loading, error]);

  const routePoints = useMemo(() => {
    if (!selectedDispatchForMap) return [];
    return getDispatchRoutePoints(selectedDispatchForMap);
  }, [selectedDispatchForMap]);
  const routeRegion = useMemo(() => getRouteRegion(routePoints), [routePoints]);
  const routeLineCoordinates = useMemo(
    () =>
      routeCoordinates.length > 1
        ? routeCoordinates
        : toDirectRouteCoordinates(routePoints),
    [routeCoordinates, routePoints]
  );

  useEffect(() => {
    let isCancelled = false;

    const loadDrivingRoute = async () => {
      if (routePoints.length < 2) {
        setRouteCoordinates([]);
        return;
      }

      setRouteLoading(true);

      try {
        const drivingCoordinates = await fetchDrivingRouteCoordinates(routePoints);
        if (isCancelled) return;

        setRouteCoordinates(drivingCoordinates ?? toDirectRouteCoordinates(routePoints));
      } catch {
        if (isCancelled) return;
        setRouteCoordinates(toDirectRouteCoordinates(routePoints));
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
  }, [routePoints]);

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
      toValue: MAP_DRAWER_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSelectedDispatchForMap(null);
        setRouteCoordinates([]);
      }
    });
  };

  const refreshDispatches = async () => {
    try {
      const latestDispatches = await fetchDispatches();
      setError(null);
      setDispatches(latestDispatches);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Falha ao buscar entregas";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const runMoveOrder = async (payload: TMoveDispatchOrderPayload) => {
    if (!movingOrderId || isMoveBusy) return;

    try {
      setIsMoveBusy(true);
      setError(null);

      await moveDispatchOrder(movingOrderId, payload);
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

    const payload: TMoveDispatchOrderPayload = {
      targetIndex,
    };

    if (movingSourceDispatchId && targetDispatchId !== movingSourceDispatchId) {
      payload.targetDispatchId = targetDispatchId;
    }

    void runMoveOrder(payload);
  };

  const handleCreateNewDispatchWithOrder = () => {
    if (!movingOrderId || isMoveBusy) return;
    void runMoveOrder({ createNewDispatch: true });
  };

  const handleDispatch = async (dispatchId: string) => {
    const currentDispatch = dispatches.find((item) => item.id === dispatchId);
    if (!currentDispatch || currentDispatch.dispatched || dispatchingIds[dispatchId]) {
      return;
    }

    const dispatchAt = new Date().toISOString();

    setDispatchingIds((previous) => ({
      ...previous,
      [dispatchId]: true,
    }));
    setError(null);
    setDispatches((previous) =>
      previous.map((item) =>
        item.id === dispatchId
          ? {
            ...item,
            dispatched: true,
            dispatchAt,
          }
          : item
      )
    );
    setSelectedDispatchForMap((previous) =>
      previous && previous.id === dispatchId
        ? {
          ...previous,
          dispatched: true,
          dispatchAt,
        }
        : previous
    );

    try {
      await updateDispatchStatus(dispatchId, {
        dispatched: true,
        dispatchAt,
      });
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Falha ao atualizar despacho";
      setError(message);

      setDispatches((previous) =>
        previous.map((item) =>
          item.id === dispatchId
            ? {
              ...item,
              dispatched: currentDispatch.dispatched,
              dispatchAt: currentDispatch.dispatchAt ?? null,
            }
            : item
        )
      );
      setSelectedDispatchForMap((previous) =>
        previous && previous.id === dispatchId
          ? {
            ...previous,
            dispatched: currentDispatch.dispatched,
            dispatchAt: currentDispatch.dispatchAt ?? null,
          }
          : previous
      );
    } finally {
      setDispatchingIds((previous) => {
        const next = { ...previous };
        delete next[dispatchId];
        return next;
      });
    }
  };

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>


        <View style={styles.topBar}>
          <BackToSitemapButton />
          {/* <View style={styles.topBarContent}> */}
          <Text style={styles.pageTitle}>Entregas</Text>
          {/* </View> */}
        </View>

        <View style={styles.body}>
          {loading ? (
            <Text style={styles.feedbackText}>Carregando entregas...</Text>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.columnsRow}>
              {columns.map((dispatch) => (
                <DispatchColumn
                  key={dispatch.id}
                  dispatch={dispatch}
                  isDispatching={!!dispatchingIds[dispatch.id]}
                  movingOrderId={movingOrderId}
                  movingSourceDispatchId={movingSourceDispatchId}
                  movingSourceOrderIndex={movingSourceOrderIndex}
                  isMoveBusy={isMoveBusy}
                  onDispatch={handleDispatch}
                  onStartMove={handleStartMove}
                  onCancelMove={handleCancelMove}
                  onMoveToIndex={handleMoveToIndex}
                  onOpenMap={openMapDrawer}
                />
              ))}
              {movingOrderId && (
                <View style={[styles.dispatchColumn, { paddingTop: 24 }]}>
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
                    <Feather name="plus" size={28} color="#666666" />
                  </Pressable>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {selectedDispatchForMap && (
          <View style={styles.mapDrawerLayer}>
            <Pressable style={styles.mapDrawerBackdrop} onPress={closeMapDrawer} />
            <Animated.View
              style={[styles.mapDrawer, { transform: [{ translateX: drawerTranslateX }] }]}
            >
              <View style={styles.mapDrawerHeader}>
                <View>
                  <Text style={styles.mapDrawerTitle}>Rota de Entrega</Text>
                  <Text style={styles.mapDrawerSubtitle}>
                    Origem fixa + pontos de entrega
                  </Text>
                </View>
                <Pressable style={styles.mapDrawerCloseButton} onPress={closeMapDrawer}>
                  <Feather name="x" size={18} color="#2d2d2d" />
                </Pressable>
              </View>

              {routePoints.length >= 2 ? (
                <DispatchRouteMap
                  style={styles.routeMapInteractive}
                  region={routeRegion}
                  points={routePoints}
                  coordinates={routeLineCoordinates}
                />
              ) : (
                <View style={styles.mapFallbackCard}>
                  <Text style={styles.mapFallbackText}>
                    Sem coordenadas suficientes para montar o mapa desta entrega.
                  </Text>
                </View>
              )}

              <View style={styles.routePointsBlock}>
                {routeLoading && (
                  <Text style={styles.routeLoadingText}>Calculando rota de carro...</Text>
                )}
                {routePoints.map((point, index) => (
                  <View key={`${point.lat}-${point.lng}-${index}`} style={styles.routePointRow}>
                    <View style={styles.routePointIndex}>
                      <Text style={styles.routePointIndexText}>{index}</Text>
                    </View>
                    <View style={styles.routePointTextBlock}>
                      <Text style={styles.routePointLabel}>{point.label}</Text>
                      <Text style={styles.routePointCoords}>
                        {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#dedede",
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  topBarContent: {
    paddingHorizontal: 32,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  body: {
    flex: 1,
    // paddingHorizontal: 24,
  },
  columnsRow: {
    gap: 24,
    paddingHorizontal: 24
  },
  dispatchColumn: {
    width: 380,
    gap: 16,
    paddingVertical: 12
  },
  dispatchSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
  },
  dispatchSummaryInner: {
    padding: 16,
    gap: 12,
  },
  dispatchHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  driverName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  driverMeta: {
    fontSize: 14,
    color: "#666666",
    marginTop: 1,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadgeWaiting: {
    backgroundColor: "#f5f6f7",
    borderColor: "#d6d9dd",
  },
  statusBadgeOnDelivery: {
    backgroundColor: "#fff5e8",
    borderColor: "#ffd6a3",
  },
  statusBadgeDelivered: {
    backgroundColor: "#eaf8ef",
    borderColor: "#bde7ca",
  },
  statusBadgeTextWaiting: {
    color: "#555e68",
  },
  statusBadgeTextOnDelivery: {
    color: "#c76b00",
  },
  statusBadgeTextDelivered: {
    color: "#1d7a43",
  },
  summaryButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#1685fa",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  ordersColumn: {
    gap: 16,
  },
  orderCardWithSlot: {
    gap: 16,
  },
  dispatchInsertSlot: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchInsertSlotDisabled: {
    opacity: 0.6,
  },
  insertSlotPlaceholder: {
    width: "100%",
    height: 0,
  },
  orderCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  orderCardDimmed: {
    opacity: 0.5,
  },
  orderCardTop: {
    padding: 16,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#dedede",
  },
  orderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  deliveredBadge: {
    backgroundColor: "#eaf8ef",
    borderColor: "#bde7ca",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deliveredBadgeText: {
    color: "#1d7a43",
    fontSize: 12,
    fontWeight: "700",
  },
  orderSmallText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666666",
  },
  orderCustomerName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  orderAddress: {
    fontSize: 14,
    color: "#666666",
  },
  dispatchDurationInfoContainer: {
    borderRadius: 8,
    flexDirection: 'row',
    // borderWidth: 1,
    // borderColor: "#e6ebf2",
    // backgroundColor: "#f5f8fc",
    // paddingHorizontal: 10,
    // paddingVertical: 8,
    gap: 0,
  },
  dispatchDurationInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f5f6f7",
    borderColor: "#d6d9dd",
  },
  dispatchDurationInfoLabel: {
    fontSize: 13,
    color: "#5a6672",
    // fontWeight: "600",
  },
  dispatchDurationInfoValue: {
    fontSize: 13,
    color: "#2d2d2d",
    fontWeight: "700",
  },
  noteContainer: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffe0b2",
    backgroundColor: "#fff4e6",
  },
  noteInner: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  noteText: {
    fontSize: 14,
    color: "#e67e22",
    flexShrink: 1,
  },
  orderActionButton: {
    marginTop: 8,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  orderActionButtonDisabled: {
    opacity: 0.6,
  },
  orderActionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  orderItemsContainer: {
    padding: 16,
    gap: 8,
  },
  orderItemRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dedede",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  orderItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d2d2d",
    flex: 1,
  },
  orderItemStatus: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B35A2A",
  },
  orderItemDeliveredStatus: {
    color: "#2D7B44",
  },
  feedbackText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666666",
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#b3261e",
    paddingHorizontal: 4,
  },
  mapDrawerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  mapDrawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000055",
  },
  mapDrawer: {
    width: MAP_DRAWER_WIDTH,
    height: "100%",
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "#dedede",
    padding: 16,
    gap: 12,
  },
  mapDrawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapDrawerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  mapDrawerSubtitle: {
    fontSize: 13,
    color: "#666666",
    marginTop: 2,
  },
  mapDrawerCloseButton: {
    height: 32,
    width: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0f0",
  },
  routeMapInteractive: {
    width: "100%",
    aspectRatio: 1.45,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#f2f2f2",
  },
  mapFallbackCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#f7f7f7",
    padding: 12,
  },
  mapFallbackText: {
    fontSize: 13,
    color: "#666666",
    fontWeight: "600",
  },
  routePointsBlock: {
    gap: 8,
  },
  routeLoadingText: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "600",
    marginBottom: 2,
  },
  routePointRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e3e3e3",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  routePointIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1685fa",
    alignItems: "center",
    justifyContent: "center",
  },
  routePointIndexText: {
    fontSize: 11,
    color: "#ffffff",
    fontWeight: "700",
  },
  routePointTextBlock: {
    flex: 1,
    gap: 1,
  },
  routePointLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  routePointCoords: {
    fontSize: 12,
    color: "#666666",
  },
  dispatchDropCard: {
    width: "100%",
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchDropCardActive: {
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    opacity: 1,
  },
  dispatchDropCardInactive: {
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    opacity: 0.7,
  },
});
