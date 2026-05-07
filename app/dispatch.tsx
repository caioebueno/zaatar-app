import BackToSitemapButton from "@/components/BackToSitemapButton";
import CreateOrderModal from "@/components/dispatch/CreateOrderModal";
import UpdateOrderModal from "@/components/dispatch/UpdateOrderModal";
import type { TOrderEditorInitialOrder } from "@/components/dispatch/order-modal/OrderEditorModal";
import { API_BASE_URL } from "@/constants/api";
import type { TPreparationStepCategory } from "@/types/station";
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
//@ts-expect-error
import DispatchRouteMap from "../components/dispatch/DispatchRouteMap";

type TDispatchOrder = {
  id: string;
  createdAt: string;
  scheduleFor?: string | null;
  number?: string;
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
  estimatedDeliveryDurationMinutes?: number | null;
  estimatedRoundTripDurationMinutes?: number | null;
  driverId?: string | null;
  driver?: TDispatchDriver | null;
  orders: TDispatchOrder[];
};

type TDispatchTab = "ACTIVE" | "COMPLETED";

const FALLBACK_CUSTOMER = "Maria Santos";
const ROUTE_POINT_ADDRESS_FALLBACK = "Endereço indisponível";
const ROUTE_ORIGIN = {
  lat: 28.34871749755003,
  lng: -81.65145586075074,
  label: "Origem",
  address: "Zaatar",
  mapQuery: "28.34871749755003,-81.65145586075074",
};
const MAP_MODAL_SLIDE_DISTANCE = Dimensions.get("window").width;
const DISPATCH_POLL_INTERVAL_MS = 10000;

type TRoutePoint = {
  lat: number;
  lng: number;
  label: string;
  address: string;
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

export async function fetchDrivers() {
  const response = await fetch(`${API_BASE_URL}/drivers`);

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

export async function updateOrder(orderId: string, payload: TUpdateOrderPayload) {
  const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
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
  onOrderPress: () => void;
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

function formatDepartureDeltaValue(deltaMs: number) {
  const absoluteMs = Math.abs(deltaMs);
  const totalMinutes = Math.ceil(absoluteMs / ONE_MINUTE_MS);

  if (totalMinutes > 60) {
    const totalHours = Math.ceil(absoluteMs / ONE_HOUR_MS);
    return `${totalHours} h`;
  }

  return `${totalMinutes} min`;
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
}: DispatchOrderCardProps) {
  type TDispatchOrderItemLine = {
    key: string;
    label: string;
    isPrize?: boolean;
    isReward?: boolean;
  };
  const customerName = order.customer?.name ?? FALLBACK_CUSTOMER;
  const customerPhone = order.customer?.phone?.trim() || null;
  const deliveryInstruction = formatDeliveryInstruction(order);
  const orderStatus = getDerivedOrderStatus(order, dispatchDispatched);
  const isTakeaway = order.type === "TAKEAWAY";
  const [isExpanded, setIsExpanded] = useState(false);
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
  const hasExpandableContent = hasOrderItems || showActionButton;

  return (
    <View style={[styles.orderCard, isDimmed && styles.orderCardDimmed]}>
      <Pressable style={styles.orderCardTop} onPress={onOrderPress}>
        {/* {isTakeaway && (
          <View style={styles.orderBadgesRow}>
            <View style={[styles.orderTypeBadge, styles.orderTypeBadgeTakeaway]}>
              <Text style={[styles.orderTypeBadgeText, styles.orderTypeBadgeTextTakeaway]}>
                Retirada
              </Text>
            </View>
          </View>
        )} */}
        <View style={styles.orderHeaderRow}>
          <View style={styles.orderHeaderCustomerBlock}>
            <Text style={styles.orderCustomerName}>{customerName} #{order.number ?? "1235"}</Text>
            {customerPhone ? (
              <View style={styles.orderCustomerContactRow}>
                <Text style={styles.orderCustomerPhone}>Tel: {customerPhone}</Text>
                <Pressable
                  style={styles.orderWhatsAppButton}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    void handleOpenCustomerWhatsApp();
                  }}
                >
                  <Feather name="message-circle" size={14} color="#1d7a43" />
                  <Text style={styles.orderWhatsAppButtonText}>WhatsApp</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {/* <Text style={styles.orderSmallText}>Pedido </Text> */}
          {orderStatus === "DELIVERED" ? (
            <View style={styles.deliveredBadge}>
              <Text style={styles.deliveredBadgeText}>Delivered</Text>
            </View>
          ) : (
            <OrderDepartureBadge order={order} />
          )}
        </View>
        {!isTakeaway && (
          <View>
            <View
              style={{
                flexDirection: 'row'
              }}
            >
              <View style={[{
                paddingVertical:8,
                paddingHorizontal: 12,
                borderColor: '#DEDEDE',
                borderRadius: 12,
                flex: 1,
                borderWidth: 1
              }, order.estimatedDeliveryDurationMinutes ? {
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              } : {}]}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '500'
                  }}
                >{order.deliveryAddress?.street}, {order.deliveryAddress?.city}</Text>
              </View>
              {order.estimatedDeliveryDurationMinutes && (
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderColor: '#DEDEDE',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderLeftWidth: 0
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '500'
                    }}
                  >
                    {order.estimatedDeliveryDurationMinutes} min
                  </Text>
                </View>
              )}
            </View>
            {!isTakeaway && deliveryInstruction && (
              <View style={styles.noteContainer}>
                <View style={styles.noteInner}>
                  <Feather name="file-text" size={16} color="#e67e22" />
                  <Text style={styles.noteText}>{deliveryInstruction}</Text>
                </View>
              </View>
            )}
          </View>
        )}

      </Pressable>

      {isExpanded && (
        <View style={styles.orderItemsContainer}>
          {orderItems.map((item) => (
            <View key={item.key} style={styles.orderItemBlock}>
              <View style={styles.orderItemRow}>
                <View style={styles.orderItemContent}>
                  <Text style={styles.orderItemText}>{item.label}</Text>
                </View>
                {item.isPrize && (
                  <View style={styles.prizeBadge}>
                    <Text style={styles.prizeBadgeText}>Prize</Text>
                  </View>
                )}
                {item.isReward && (
                  <View style={styles.rewardBadge}>
                    <Text style={styles.rewardBadgeText}>Reward</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {hasExpandableContent && (
        <View
          style={[
            styles.showMoreSection,
            isExpanded && styles.showMoreSectionWithDivider,
          ]}
        >
          {isExpanded ? (
            <View style={styles.orderFooterButtonsRow}>
              <Pressable
                style={[styles.showMoreButton, styles.orderFooterButton]}
                onPress={() => setIsExpanded(false)}
              >
                <Text style={styles.showMoreButtonText}>Hide</Text>
              </Pressable>

              {showActionButton && (
                <Pressable
                  style={[
                    styles.orderActionButton,
                    styles.orderFooterButton,
                    actionDisabled && styles.orderActionButtonDisabled,
                  ]}
                  disabled={actionDisabled}
                  onPress={onActionPress}
                >
                  <Text style={styles.orderActionButtonText}>{actionLabel}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable style={styles.showMoreButton} onPress={() => setIsExpanded(true)}>
              <Text style={styles.showMoreButtonText}>Show more</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

type DispatchColumnProps = {
  dispatch: TDispatch;
  targetQueueIndex: number | null;
  drivers: TDriver[];
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
};

type TDispatchTypeBadge = {
  key: "delivery" | "takeaway";
  label: "Entrega" | "Retirada";
};

function isDispatchCompleted(dispatch: TDispatch) {
  return dispatch.orders.length > 0 && dispatch.orders.every((order) => order.delivered);
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

function DispatchColumn({
  dispatch,
  targetQueueIndex,
  drivers,
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
}: DispatchColumnProps) {
  const driverName = dispatch.driver?.name?.trim();
  const hasDriver = !!driverName;
  const sortedOrders = getSortedDispatchOrders(dispatch.orders);
  const orderCount = sortedOrders.length;
  const dispatchTypeBadges = getDispatchTypeBadges(dispatch);
  const isDispatchButtonDisabled = dispatch.dispatched || isDispatching;
  const isMoveMode = !!movingOrderId;
  const isTakeaway = dispatch.orders[0]?.type === 'TAKEAWAY'
  const [isDriverPickerOpen, setIsDriverPickerOpen] = useState(false);
  const sortedDrivers = useMemo(() => getSortedDrivers(drivers), [drivers]);
  const selectableDrivers = useMemo(() => {
    const activeDrivers = sortedDrivers.filter((driver) => driver.active);
    const currentAssignedDriver = sortedDrivers.find(
      (driver) => driver.id === dispatch.driverId
    );

    if (!currentAssignedDriver) return activeDrivers;
    if (currentAssignedDriver.active) return activeDrivers;

    return [currentAssignedDriver, ...activeDrivers];
  }, [dispatch.driverId, sortedDrivers]);

  useEffect(() => {
    if (!isTakeaway) return;
    setIsDriverPickerOpen(false);
  }, [isTakeaway]);

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
        <View style={styles.dispatchTypeBadgesRow}>
          {dispatchTypeBadges.map((badge) => (
            // <View
            //   key={`${dispatch.id}-${badge.key}`}
            //   style={[
            //     styles.dispatchTypeBadge,
            //     badge.key === "delivery"
            //       ? styles.dispatchTypeBadgeDelivery
            //       : styles.dispatchTypeBadgeTakeaway,
            //   ]}
            // >
            <Text
              key={`${dispatch.id}-${badge.key}`}
              style={[
                styles.dispatchTypeBadgeText,
              ]}
            >
              {badge.label}
            </Text>
            // </View>
          ))}
        </View>
        <View style={styles.dispatchSummaryInner}>
          <View style={styles.queueIndexRow}>
            <Text style={styles.queueIndexLabel}>
              Fila #{getDispatchQueueIndex(dispatch) ?? "-"}
            </Text>
            {isQueueMoveMode ? (
              isQueueSelected ? (
                <Pressable
                  style={[styles.queueActionButton, styles.queueActionButtonCancel]}
                  disabled={isQueueUpdating}
                  onPress={onCancelMoveDispatchQueue}
                >
                  <Text style={styles.queueActionButtonText}>Cancelar</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    styles.queueActionButton,
                    (isQueueUpdating || targetQueueIndex === null) &&
                      styles.queueActionButtonDisabled,
                  ]}
                  disabled={isQueueUpdating || targetQueueIndex === null}
                  onPress={() => {
                    if (targetQueueIndex === null) return;
                    onMoveDispatchQueueToPosition(targetQueueIndex);
                  }}
                >
                  <Text style={styles.queueActionButtonText}>Mover aqui</Text>
                </Pressable>
              )
            ) : (
              <Pressable
                style={[styles.queueActionButton, isQueueUpdating && styles.queueActionButtonDisabled]}
                disabled={isQueueUpdating}
                onPress={() => onStartMoveDispatchQueue(dispatch.id)}
              >
                <Text style={styles.queueActionButtonText}>Alterar ordem</Text>
              </Pressable>
            )}
          </View>

          {!isTakeaway && (
            <View style={styles.dispatchHeaderBlock}>
              <View style={styles.dispatchHeaderRow}>
                <View style={styles.dispatchDriverPickerBlock}>
                  <Pressable
                    style={[
                      styles.dispatchDriverPickerButton,
                      isAssigningDriver && styles.dispatchDriverPickerButtonDisabled,
                    ]}
                    disabled={isAssigningDriver}
                    onPress={() => setIsDriverPickerOpen((previous) => !previous)}
                  >
                    <Text style={styles.driverName}>
                      {hasDriver ? driverName : "Sem motorista"}
                    </Text>
                    <Feather
                      name={isDriverPickerOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#666666"
                    />
                  </Pressable>
                  <View style={styles.driverCountBadge}>
                    <Text style={styles.driverMeta}>{orderCount}</Text>
                  </View>
                </View>

                <View style={styles.dispatchDurationInfoContainer}>
                  <View style={[styles.dispatchDurationInfoRow, {
                    borderBottomRightRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderBottomWidth: 0,
                    // borderBottomRightRadius: 0,
                    // borderRightWidth: 0,
                  }]}>
                    <Text style={styles.dispatchDurationInfoLabel}>Entrega</Text>
                    <Text style={styles.dispatchDurationInfoValue}>
                      {formatMinutes(dispatch.estimatedDeliveryDurationMinutes)}
                    </Text>
                  </View>
                  <View style={[styles.dispatchDurationInfoRow, {
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                  }]}>
                    <Text style={styles.dispatchDurationInfoLabel}>Ida e volta</Text>
                    <Text style={styles.dispatchDurationInfoValue}>
                      {formatMinutes(dispatch.estimatedRoundTripDurationMinutes)}
                    </Text>
                  </View>
                </View>
              </View>

              {isDriverPickerOpen && (
                <View style={styles.dispatchDriverDropdown}>
                  <Pressable
                    style={[
                      styles.dispatchDriverDropdownItem,
                      dispatch.driverId == null && styles.dispatchDriverDropdownItemSelected,
                    ]}
                    disabled={isAssigningDriver}
                    onPress={() => {
                      onAssignDriver(dispatch.id, null);
                      setIsDriverPickerOpen(false);
                    }}
                  >
                    <Text style={styles.dispatchDriverDropdownItemText}>Sem motorista</Text>
                  </Pressable>

                  {selectableDrivers.map((driver) => (
                    <Pressable
                      key={`${dispatch.id}-${driver.id}`}
                      style={[
                        styles.dispatchDriverDropdownItem,
                        dispatch.driverId === driver.id &&
                          styles.dispatchDriverDropdownItemSelected,
                      ]}
                      disabled={isAssigningDriver}
                      onPress={() => {
                        onAssignDriver(dispatch.id, driver.id);
                        setIsDriverPickerOpen(false);
                      }}
                    >
                      <View style={styles.dispatchDriverDropdownItemMain}>
                        <Text style={styles.dispatchDriverDropdownItemText}>{driver.name}</Text>
                        {!driver.active && (
                          <Text style={styles.dispatchDriverDropdownItemBadge}>Inativo</Text>
                        )}
                      </View>
                      <Text style={styles.dispatchDriverDropdownItemPriority}>
                        P{driver.priorityLevel}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )
          }

          {!isTakeaway && (
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
          )}
        </View>
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
              : "Alterar despacho";

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
  const insets = useSafeAreaInsets();
  const [dispatches, setDispatches] = useState<TDispatch[]>([]);
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const [isUpdateOrderModalOpen, setIsUpdateOrderModalOpen] = useState(false);
  const [orderToUpdate, setOrderToUpdate] = useState<TOrderEditorInitialOrder | null>(null);
  const [drivers, setDrivers] = useState<TDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [driversMenuOpen, setDriversMenuOpen] = useState(false);
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
  const [routeLoading, setRouteLoading] = useState(false);
  const drawerTranslateX = useRef(new Animated.Value(MAP_MODAL_SLIDE_DISTANCE)).current;

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

  useEffect(() => {
    let cancelled = false;

    const loadDrivers = async () => {
      try {
        const nextDrivers = await fetchDrivers();
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
  }, []);

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
  const activeDriversCount = useMemo(
    () => drivers.filter((driver) => driver.active).length,
    [drivers]
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
        return;
      }

      setRouteLoading(true);

      try {
        const drivingCoordinates = await fetchDrivingRouteCoordinates(mapRoutePoints);
        if (isCancelled) return;

        setRouteCoordinates(drivingCoordinates ?? toDirectRouteCoordinates(mapRoutePoints));
      } catch {
        if (isCancelled) return;
        setRouteCoordinates(toDirectRouteCoordinates(mapRoutePoints));
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

  const refreshDrivers = async () => {
    try {
      const latestDrivers = await fetchDrivers();
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
      await updateDispatchStatus(dispatchId, { queueIndex: targetQueueIndex });
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
    setDriversMenuOpen(false);
    setOrderToUpdate(toOrderEditorInitialOrder(order));
    setIsUpdateOrderModalOpen(true);
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
      await updateDispatchStatus(dispatchId, { driverId: normalizedNextDriverId });
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
      await updateOrder(orderId, { deliveredAt });
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

  const handleToggleDriverActive = async (driverId: string, nextActive: boolean) => {
    const currentDriver = drivers.find((driver) => driver.id === driverId);
    if (!currentDriver || updatingDriverIds[driverId]) {
      return;
    }

    setUpdatingDriverIds((previous) => ({
      ...previous,
      [driverId]: true,
    }));
    setDrivers((previous) =>
      previous.map((driver) =>
        driver.id === driverId
          ? {
            ...driver,
            active: nextActive,
          }
          : driver
      )
    );
    setDriversError(null);

    try {
      await updateDriver(driverId, { active: nextActive });
      await refreshDrivers();
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Falha ao atualizar motorista";
      setDriversError(message);
      setDrivers((previous) =>
        previous.map((driver) =>
          driver.id === driverId
            ? {
              ...driver,
              active: currentDriver.active,
            }
            : driver
        )
      );
    } finally {
      setUpdatingDriverIds((previous) => {
        const next = { ...previous };
        delete next[driverId];
        return next;
      });
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
      await updateDriver(driverId, { priorityLevel: targetPriorityLevel });
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


        <View style={styles.topBar}>
          <BackToSitemapButton />
          <View style={styles.topBarActions}>
            <View style={styles.dispatchTabs}>
              <Pressable
                style={[
                  styles.dispatchTab,
                  dispatchTab === "ACTIVE" && styles.dispatchTabActive,
                ]}
                onPress={() => {
                  setDispatchTab("ACTIVE");
                  handleCancelMove();
                  setMovingDispatchQueueId(null);
                  setDriversMenuOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dispatchTabText,
                    dispatchTab === "ACTIVE" && styles.dispatchTabTextActive,
                  ]}
                >
                  Ativos
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dispatchTab,
                  dispatchTab === "COMPLETED" && styles.dispatchTabActive,
                ]}
                onPress={() => {
                  setDispatchTab("COMPLETED");
                  handleCancelMove();
                  setMovingDispatchQueueId(null);
                  setDriversMenuOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dispatchTabText,
                    dispatchTab === "COMPLETED" && styles.dispatchTabTextActive,
                  ]}
                >
                  Concluidos
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.createOrderButton}
              onPress={() => {
                setDriversMenuOpen(false);
                setMovingDispatchQueueId(null);
                setIsCreateOrderModalOpen(true);
              }}
            >
              <Feather name="plus-circle" size={16} color="#ffffff" />
              <Text style={styles.createOrderButtonText}>Novo pedido</Text>
            </Pressable>

            <View style={styles.driversMenuContainer}>
              <Pressable
                style={styles.driversButton}
                onPress={() => setDriversMenuOpen((previous) => !previous)}
              >
                <Feather name="users" size={16} color="#2d2d2d" />
                <Text style={styles.driversButtonText}>{activeDriversCount} ativos</Text>
                <Feather
                  name={driversMenuOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#666666"
                />
              </Pressable>

              {driversMenuOpen && (
                <View style={styles.driversDropdown}>
                  <Text style={styles.driversDropdownTitle}>Motoristas</Text>
                  {driversLoading ? (
                    <Text style={styles.driversDropdownFeedback}>Carregando...</Text>
                  ) : driversError ? (
                    <Text style={styles.driversDropdownError}>{driversError}</Text>
                  ) : sortedDrivers.length === 0 ? (
                    <Text style={styles.driversDropdownFeedback}>Nenhum motorista</Text>
                  ) : (
                    <View style={styles.driversDropdownList}>
                      {sortedDrivers.map((driver, index) => {
                        const isUpdating = !!updatingDriverIds[driver.id];
                        const isFirst = index === 0;
                        const isLast = index === sortedDrivers.length - 1;
                        return (
                          <View key={driver.id} style={styles.driverRow}>
                            <View style={styles.driverRowNameWrap}>
                              <Text style={styles.driverRowName}>{driver.name}</Text>
                              <Text style={styles.driverRowMeta}>
                                Prioridade {driver.priorityLevel}
                              </Text>
                            </View>
                            <View style={styles.driverRowActions}>
                              <View style={styles.driverPriorityControls}>
                                <Pressable
                                  style={[
                                    styles.driverPriorityButton,
                                    (isUpdating || isFirst) && styles.driverPriorityButtonDisabled,
                                  ]}
                                  disabled={isUpdating || isFirst}
                                  onPress={() => handleMoveDriverPriority(driver.id, "UP")}
                                >
                                  <Feather name="chevron-up" size={14} color="#555e68" />
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.driverPriorityButton,
                                    (isUpdating || isLast) && styles.driverPriorityButtonDisabled,
                                  ]}
                                  disabled={isUpdating || isLast}
                                  onPress={() => handleMoveDriverPriority(driver.id, "DOWN")}
                                >
                                  <Feather name="chevron-down" size={14} color="#555e68" />
                                </Pressable>
                              </View>

                              <Pressable
                                style={[
                                  styles.driverToggleButton,
                                  driver.active
                                    ? styles.driverToggleButtonActive
                                    : styles.driverToggleButtonInactive,
                                  isUpdating && styles.driverToggleButtonDisabled,
                                ]}
                                disabled={isUpdating}
                                onPress={() =>
                                  handleToggleDriverActive(driver.id, !driver.active)
                                }
                              >
                                <Text
                                  style={[
                                    styles.driverToggleButtonText,
                                    driver.active
                                      ? styles.driverToggleButtonTextActive
                                      : styles.driverToggleButtonTextInactive,
                                  ]}
                                >
                                  {isUpdating
                                    ? "..."
                                    : driver.active
                                      ? "Ativo"
                                      : "Inativo"}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {loading ? (
            <Text style={styles.feedbackText}>Carregando entregas...</Text>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : columns.length === 0 ? (
            <Text style={styles.feedbackText}>
              {dispatchTab === "COMPLETED"
                ? "Nenhum despacho concluido."
                : "Nenhum despacho ativo."}
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.columnsRow}>
              {columns.map((dispatch) => {
                const targetQueueIndex = getDispatchQueueIndex(dispatch);
                return (
                  <DispatchColumn
                    key={dispatch.id}
                    dispatch={dispatch}
                    targetQueueIndex={targetQueueIndex}
                    drivers={sortedDrivers}
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
                  />
                );
              })}
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
              style={[
                styles.mapDrawer,
                {
                  paddingTop: Math.max(insets.top, 0) + 12,
                  paddingBottom: Math.max(insets.bottom, 0) + 12,
                },
                { transform: [{ translateX: drawerTranslateX }] },
              ]}
            >
              <View style={styles.mapDrawerHeader}>
                <View>
                  <Text style={styles.mapDrawerTitle}>Rota de Entrega</Text>
                  <Text style={styles.mapDrawerSubtitle}>
                    Origem + pontos de entrega
                  </Text>
                </View>
                <Pressable style={styles.mapDrawerCloseButton} onPress={closeMapDrawer}>
                  <Feather name="x" size={18} color="#2d2d2d" />
                </Pressable>
              </View>

              <View style={styles.routeContentRow}>
                {mapRoutePoints.length >= 2 ? (
                  <DispatchRouteMap
                    style={styles.routeMapInteractive}
                    region={routeRegion}
                    points={mapRoutePoints}
                    coordinates={routeLineCoordinates}
                  />
                ) : (
                  <View style={[styles.mapFallbackCard, styles.routeMapFallbackCard]}>
                    <Text style={styles.mapFallbackText}>
                      Sem coordenadas suficientes para montar o mapa desta entrega.
                    </Text>
                  </View>
                )}

                <View style={styles.routePointsPanel}>
                  {routeLoading && (
                    <Text style={styles.routeLoadingText}>Calculando rota de carro...</Text>
                  )}
                  <ScrollView
                    style={styles.routePointsScroll}
                    contentContainerStyle={styles.routePointsBlock}
                    showsVerticalScrollIndicator={false}
                  >
                    {routePoints.map((point, index) => (
                      <View key={`${point.lat}-${point.lng}-${index}`} style={styles.routePointRow}>
                        <View style={styles.routePointIndex}>
                          <Text style={styles.routePointIndexText}>{index + 1}</Text>
                        </View>
                        <View style={styles.routePointTextBlock}>
                          <Text style={styles.routePointLabel}>{point.label}</Text>
                          <Text style={styles.routePointAddress}>{point.address}</Text>
                        </View>
                        <Pressable
                          style={styles.routePointMapsButton}
                          onPress={() => {
                            void handleOpenRoutePointInGoogleMaps(point);
                          }}
                        >
                          <Feather name="map" size={14} color="#1e5da9" />
                          <Text style={styles.routePointMapsButtonText}>Google Maps</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Animated.View>
          </View>
        )}

        <CreateOrderModal
          visible={isCreateOrderModalOpen}
          apiBaseUrl={API_BASE_URL}
          onClose={() => setIsCreateOrderModalOpen(false)}
        />

        <UpdateOrderModal
          visible={isUpdateOrderModalOpen}
          apiBaseUrl={API_BASE_URL}
          order={orderToUpdate}
          onSuccess={refreshDispatches}
          onClose={() => {
            setIsUpdateOrderModalOpen(false);
            setOrderToUpdate(null);
          }}
        />
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
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: 'space-between',
    gap: 16,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 20,
  },
  dispatchTabs: {
    // flex: 1,
    flexDirection: "row",
    backgroundColor: "#f5f6f7",
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  dispatchTab: {
    // flex: 1,
    paddingInline: 20,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchTabActive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6d9dd",
  },
  dispatchTabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666666",
  },
  dispatchTabTextActive: {
    color: "#2d2d2d",
  },
  createOrderButton: {
    height: 42,
    borderRadius: 10,
    backgroundColor: "#3f67da",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createOrderButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  driversMenuContainer: {
    position: "relative",
  },
  driversButton: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  driversButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  driversDropdown: {
    position: "absolute",
    right: 0,
    top: 48,
    width: 290,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    zIndex: 50,
  },
  driversDropdownTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  driversDropdownList: {
    gap: 8,
  },
  driversDropdownFeedback: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
  },
  driversDropdownError: {
    fontSize: 14,
    fontWeight: "600",
    color: "#b3261e",
  },
  driverRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eceff3",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  driverRowNameWrap: {
    flex: 1,
  },
  driverRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  driverPriorityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  driverPriorityButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  driverPriorityButtonDisabled: {
    opacity: 0.4,
  },
  driverRowName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  driverRowMeta: {
    fontSize: 12,
    color: "#6d7680",
    marginTop: 2,
  },
  driverToggleButton: {
    minWidth: 72,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  driverToggleButtonActive: {
    borderColor: "#bde7ca",
    backgroundColor: "#eaf8ef",
  },
  driverToggleButtonInactive: {
    borderColor: "#d6d9dd",
    backgroundColor: "#f5f6f7",
  },
  driverToggleButtonDisabled: {
    opacity: 0.6,
  },
  driverToggleButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  driverToggleButtonTextActive: {
    color: "#1d7a43",
  },
  driverToggleButtonTextInactive: {
    color: "#555e68",
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
    gap: 28,
    paddingHorizontal: 28
  },
  dispatchColumn: {
    width: 380,
    gap: 20,
    paddingVertical: 14
  },
  dispatchSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    borderColor: "#dedede",
    backgroundColor: "#ffffff",

  },
  dispatchSummaryInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,

  },
  queueIndexRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  queueIndexLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4f5b67",
  },
  queueActionButton: {
    minHeight: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#f7f8fa",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  queueActionButtonCancel: {
    backgroundColor: "#fff4f4",
    borderColor: "#e3b5b5",
  },
  queueActionButtonDisabled: {
    opacity: 0.4,
  },
  queueActionButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4f5b67",
  },
  dispatchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dispatchHeaderBlock: {
    gap: 10,
  },
  dispatchDriverPickerBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  dispatchDriverPickerButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#f7f8fa",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 200,
  },
  dispatchDriverPickerButtonDisabled: {
    opacity: 0.7,
  },
  driverCountBadge: {
    backgroundColor: "#1685fa",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  dispatchDriverDropdown: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  dispatchDriverDropdownItem: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eceff3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dispatchDriverDropdownItemSelected: {
    backgroundColor: "#eef5ff",
  },
  dispatchDriverDropdownItemMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  dispatchDriverDropdownItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  dispatchDriverDropdownItemBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555e68",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#f5f6f7",
    overflow: "hidden",
  },
  dispatchDriverDropdownItemPriority: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a6672",
  },
  dispatchTypeBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    // marginBottom: 6,
    flexWrap: "wrap",
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderColor: "#dedede",
  },
  dispatchTypeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dispatchTypeBadgeDelivery: {
    borderColor: "#b7d6fb",
    backgroundColor: "#eaf3ff",
  },
  dispatchTypeBadgeTakeaway: {
    borderColor: "#ffd6a3",
    backgroundColor: "#fff5e8",
  },
  dispatchTypeBadgeText: {
    fontSize: 17,
    fontWeight: "500",
    color: '#666'
  },
  dispatchTypeBadgeTextDelivery: {
    color: "#1e5da9",
  },
  dispatchTypeBadgeTextTakeaway: {
    color: "#555e68",
  },
  driverName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d2d2d",
    flexShrink: 1,
  },
  driverMeta: {
    fontSize: 16,
    fontWeight: '600',
    color: "#fff",

  },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    // minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeText: {
    fontSize: 15,
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
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    // height: 54,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#1685fa",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryButton: {
    flex: 1,
    // height: 54,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  ordersColumn: {
    gap: 18,
  },
  orderCardWithSlot: {
    gap: 18,
  },
  dispatchInsertSlot: {
    width: "100%",
    height: 64,
    borderRadius: 14,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  orderCardDimmed: {
    opacity: 0.5,
  },
  orderCardTop: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#dedede",
  },
  orderBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  orderTypeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  orderTypeBadgeTakeaway: {
    borderColor: "#ffd6a3",
    backgroundColor: "#fff5e8",
  },
  orderTypeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  orderTypeBadgeTextTakeaway: {
    color: "#c76b00",
  },
  orderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  deliveredBadge: {
    backgroundColor: "#eaf8ef",
    borderColor: "#bde7ca",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  deliveredBadgeText: {
    color: "#1d7a43",
    fontSize: 14,
    fontWeight: "700",
  },
  departureBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#f4f5f7",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  departureBadgeLate: {
    borderColor: "#f0c7c7",
    backgroundColor: "#fff1f1",
  },
  departureBadgeText: {
    color: "#4d5660",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  departureBadgeTextLate: {
    color: "#b3261e",
  },
  orderSmallText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666666",
  },
  orderCustomerName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  orderHeaderCustomerBlock: {
    flexShrink: 1,
    gap: 2,
  },
  orderCustomerPhone: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
  },
  orderCustomerContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  orderWhatsAppButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bde7ca",
    backgroundColor: "#eaf8ef",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  orderWhatsAppButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d7a43",
  },
  dispatchDurationInfoContainer: {
    borderRadius: 8,
    flexDirection: 'column',
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
    gap: 3,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f5f6f7",
    borderColor: "#d6d9dd",
  },
  dispatchDurationInfoLabel: {
    fontSize: 15,
    color: "#5a6672",
    fontWeight: '500'
    // fontWeight: "600",
  },
  dispatchDurationInfoValue: {
    fontSize: 15,
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
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  noteText: {
    fontSize: 15,
    color: "#e67e22",
    flexShrink: 1,
  },
  orderActionButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  showMoreSection: {
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  showMoreSectionWithDivider: {
    borderTopWidth: 1,
    borderTopColor: "#dedede",
  },
  showMoreButton: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  showMoreButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  orderFooterButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  orderFooterButton: {
    flex: 1,
  },
  orderActionButtonDisabled: {
    opacity: 0.6,
  },
  orderActionButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  orderItemsContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  orderItemBlock: {
    width: "100%",
  },
  orderItemRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dedede",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  orderItemRowWithTasks: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 0,
  },
  orderItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center'
  },
  orderItemText: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
    color: "#2d2d2d",
    flex: 1,
  },
  orderTaskRow: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#dedede",
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  orderTaskRowStep: {
    marginLeft: 16,
  },
  orderTaskRowModifier: {
    marginLeft: 32,
  },
  orderTaskRowWithChildren: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 0,
  },
  orderTaskRowLast: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  orderTaskRowText: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
    color: "#2d2d2d",
    flex: 1,
  },
  orderTaskRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderTaskCompletedBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bde7ca",
    backgroundColor: "#eaf8ef",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  orderTaskCompletedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d7a43",
  },
  prizeBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b7d6fb",
    backgroundColor: "#eaf3ff",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  prizeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e5da9",
  },
  rewardBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c8eed3",
    backgroundColor: "#eefaf2",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  rewardBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d7a43",
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
    width: "100%",
    height: "100%",
    backgroundColor: "#ffffff",
    borderLeftWidth: 0,
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
    flex: 2,
    minWidth: 0,
    minHeight: 420,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#f2f2f2",
  },
  routeMapFallbackCard: {
    flex: 2,
    minHeight: 420,
  },
  routeContentRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  routePointsPanel: {
    width: 360,
    maxHeight: 420,
    borderWidth: 1,
    borderColor: "#dedede",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 8,
    gap: 8,
  },
  routePointsScroll: {
    flex: 1,
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
    alignItems: "flex-start",
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
  routePointAddress: {
    fontSize: 12,
    color: "#666666",
  },
  routePointMapsButton: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b7d6fb",
    backgroundColor: "#eaf3ff",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  routePointMapsButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e5da9",
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
