import Feather from "@expo/vector-icons/Feather";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DEFAULT_DRIVER_ID = "a9fa0c74-ae00-4c4c-b506-d82a0ed0c748";
const DEFAULT_DRIVER_NAME = "Paula";
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "web" ? "http://localhost:3000/api" : "http://192.168.1.151:3000/api");
const NEXT_DISPATCH_POLL_INTERVAL_MS = 10000;

type TNextDispatchOrderProduct = {
  id: string;
  amount: number;
  fullAmount: number;
  quantity: number;
  product?: {
    id: string;
    name: string;
  } | null;
};

type TNextDispatchOrder = {
  id: string;
  createdAt: string;
  number?: string;
  delivered: boolean;
  paidAt?: string | null;
  deliveredAt?: string | null;
  paymentMethod: "CARD" | "CASH" | "ZELLE";
  deliveryAddress?: {
    id: string;
    description?: string;
    street?: string;
    number?: string;
    complement?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: string;
    lng?: string;
  } | null;
  customer?: {
    id: string;
    name: string;
  } | null;
  orderProducts: TNextDispatchOrderProduct[];
};

type TNextDispatch = {
  id: string;
  dispatched: boolean;
  driver?: {
    id: string;
    name: string;
  } | null;
  orders: TNextDispatchOrder[];
};

type TOrderUpdatePayload = {
  paidAt?: string | null;
  paymentMethod?: "CARD" | "CASH" | "ZELLE";
  deliveredAt?: string | null;
};

async function fetchNextDispatch(driverId: string) {
  const response = await fetch(`${API_BASE_URL}/dispatches/next?driverId=${driverId}`);

  if (!response.ok) {
    throw new Error("Falha ao buscar próxima entrega");
  }

  return (await response.json()) as TNextDispatch | null;
}

async function updateOrder(orderId: string, payload: TOrderUpdatePayload) {
  const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    if (
      responseBody &&
      typeof responseBody === "object" &&
      "error" in responseBody &&
      typeof (responseBody as { error?: unknown }).error === "string"
    ) {
      throw new Error((responseBody as { error: string }).error);
    }

    throw new Error("Falha ao atualizar pedido");
  }

  return responseBody as TNextDispatchOrder;
}

function formatAddress(order: TNextDispatchOrder | null) {
  if (!order?.deliveryAddress) return "Endereço indisponível";
  const street = order.deliveryAddress.street ?? "";
  const base = [street, order.deliveryAddress.city].filter(Boolean).join(", ");
  return `${base || "Endereço indisponível"}`;
}

type TNavigationDestination = {
  query: string;
  lat?: number;
  lng?: number;
};

function getNavigationDestination(order: TNextDispatchOrder | null) {
  if (!order?.deliveryAddress) return null;

  const lat = Number(order.deliveryAddress.lat);
  const lng = Number(order.deliveryAddress.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      query: `${lat},${lng}`,
      lat,
      lng,
    } satisfies TNavigationDestination;
  }

  const parts = [
    order.deliveryAddress.street,
    order.deliveryAddress.number,
    order.deliveryAddress.complement,
    order.deliveryAddress.city,
    order.deliveryAddress.state,
    order.deliveryAddress.zipCode,
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return {
    query: parts.join(", "),
  } satisfies TNavigationDestination;
}

function getPaymentMethodLabel(paymentMethod: TNextDispatchOrder["paymentMethod"] | undefined) {
  if (paymentMethod === "CARD") return "Cartão";
  if (paymentMethod === "CASH") return "Dinheiro";
  if (paymentMethod === "ZELLE") return "Zelle";
  return "-";
}

function formatCurrencyFromCents(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

export default function NextDeliveryScreen() {
  const { driverId, driverName } = useLocalSearchParams<{
    driverId?: string;
    driverName?: string;
  }>();
  const selectedDriverId =
    typeof driverId === "string" && driverId.trim().length > 0
      ? driverId
      : DEFAULT_DRIVER_ID;
  const selectedDriverName =
    typeof driverName === "string" && driverName.trim().length > 0
      ? driverName
      : DEFAULT_DRIVER_NAME;

  const [nextDispatch, setNextDispatch] = useState<TNextDispatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);

  useEffect(() => {
    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let isFetching = false;

    const load = async () => {
      if (isFetching || stopped) return;

      try {
        isFetching = true;
        const data = await fetchNextDispatch(selectedDriverId);
        if (stopped) return;
        setError(null);
        setNextDispatch(data);
      } catch (fetchError) {
        if (stopped) return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Falha ao buscar próxima entrega";
        setError(message);
      } finally {
        isFetching = false;
        if (!stopped) {
          setLoading(false);
        }
      }
    };

    void load();
    intervalId = setInterval(() => {
      void load();
    }, NEXT_DISPATCH_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [selectedDriverId]);

  const pendingOrders = useMemo(
    () => (nextDispatch?.orders ?? []).filter((order) => !order.delivered),
    [nextDispatch]
  );

  const nextOrder = pendingOrders[0] ?? null;
  const isNextOrderPaid = !!nextOrder?.paidAt;
  const upcomingOrders = pendingOrders.slice(1);
  const resolvedDriverName = nextDispatch?.driver?.name ?? selectedDriverName;
  const nextCustomerName = nextOrder?.customer?.name ?? "Sem cliente";
  const nextAddress = formatAddress(nextOrder);
  const nextInstruction = nextOrder?.deliveryAddress?.complement;
  const orderItems = nextOrder?.orderProducts ?? [];
  const orderTotal = orderItems.reduce(
    (sum, product) => sum + (product.fullAmount ?? product.amount ?? 0),
    0
  );

  const handleStartNavigation = async () => {
    const destination = getNavigationDestination(nextOrder);
    if (!destination) {
      Alert.alert(
        "Endereço indisponível",
        "Não foi possível abrir a navegação para este pedido."
      );
      return;
    }

    const encodedDestination = encodeURIComponent(destination.query);
    const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving`;
    const wazeUrl =
      Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
        ? `waze://?ll=${destination.lat},${destination.lng}&navigate=yes`
        : `waze://?q=${encodedDestination}&navigate=yes`;

    const appOptions =
      Platform.OS === "ios"
        ? [
          { label: "Apple Maps", url: `maps://?daddr=${encodedDestination}&dirflg=d` },
          {
            label: "Google Maps",
            url: `comgooglemaps://?daddr=${encodedDestination}&directionsmode=driving`,
          },
          { label: "Waze", url: wazeUrl },
          { label: "Google Maps (Web)", url: webFallback },
        ]
        : Platform.OS === "android"
          ? [
            { label: "Google Maps", url: `google.navigation:q=${encodedDestination}&mode=d` },
            { label: "Waze", url: wazeUrl },
            { label: "Google Maps (Web)", url: webFallback },
          ]
          : [{ label: "Google Maps (Web)", url: webFallback }];

    const openSelectedUrl = async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        try {
          await Linking.openURL(webFallback);
        } catch {
          Alert.alert("Erro", "Não foi possível abrir o app de navegação.");
        }
      }
    };

    if (Platform.OS === "web") {
      await openSelectedUrl(webFallback);
      return;
    }

    Alert.alert(
      "Abrir rota em",
      "Qual app você quer usar?",
      [
        ...appOptions.map((option) => ({
          text: option.label,
          onPress: () => {
            void openSelectedUrl(option.url);
          },
        })),
        { text: "Cancelar", style: "cancel" as const },
      ]
    );
  };

  const replaceOrderInState = (updatedOrder: TNextDispatchOrder) => {
    setNextDispatch((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        orders: previous.orders.map((order) =>
          order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order
        ),
      };
    });
  };

  const refetchNextDispatch = async () => {
    try {
      const refreshedDispatch = await fetchNextDispatch(selectedDriverId);
      setError(null);
      setNextDispatch(refreshedDispatch);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Falha ao buscar próxima entrega";
      setError(message);
    }
  };

  const handleConfirmPayment = (order: TNextDispatchOrder) => {
    Alert.alert("Confirma Pagamento", "Selecione o método de pagamento:", [
      {
        text: "Cartão",
        onPress: () => {
          void (async () => {
            setIsUpdatingOrder(true);
            try {
              const updatedOrder = await updateOrder(order.id, {
                paymentMethod: "CARD",
                paidAt: new Date().toISOString(),
              });
              replaceOrderInState(updatedOrder);
              await refetchNextDispatch();
            } catch (updateError) {
              const message =
                updateError instanceof Error
                  ? updateError.message
                  : "Falha ao confirmar pagamento";
              Alert.alert("Erro", message);
            } finally {
              setIsUpdatingOrder(false);
            }
          })();
        },
      },
      {
        text: "Dinheiro",
        onPress: () => {
          void (async () => {
            setIsUpdatingOrder(true);
            try {
              const updatedOrder = await updateOrder(order.id, {
                paymentMethod: "CASH",
                paidAt: new Date().toISOString(),
              });
              replaceOrderInState(updatedOrder);
              await refetchNextDispatch();
            } catch (updateError) {
              const message =
                updateError instanceof Error
                  ? updateError.message
                  : "Falha ao confirmar pagamento";
              Alert.alert("Erro", message);
            } finally {
              setIsUpdatingOrder(false);
            }
          })();
        },
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const handleMarkDelivered = async (order: TNextDispatchOrder) => {
    setIsUpdatingOrder(true);

    try {
      const updatedOrder = await updateOrder(order.id, {
        deliveredAt: new Date().toISOString(),
      });
      replaceOrderInState(updatedOrder);
      await refetchNextDispatch();
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Falha ao marcar pedido como entregue";
      Alert.alert("Erro", message);
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleSecondaryAction = () => {
    if (!nextOrder || isUpdatingOrder) return;

    if (!nextOrder.paidAt) {
      handleConfirmPayment(nextOrder);
      return;
    }

    void handleMarkDelivered(nextOrder);
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.push("/"))}
        >
          <Feather name="chevron-left" size={24} color="#666666" />
        </Pressable>
        <Text style={styles.headerTitle}>{resolvedDriverName}</Text>
        {/* <View style={styles.headerRightSpacer} /> */}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.feedbackWrapper}>
            <Text style={styles.feedbackText}>Carregando próxima entrega...</Text>
          </View>
        ) : error ? (
          <View style={styles.feedbackWrapper}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !nextDispatch || !nextOrder ? (
          <View style={styles.feedbackWrapper}>
            <Text style={styles.feedbackText}>Nenhuma entrega pendente para este motorista.</Text>
          </View>
        ) : (
          <>
        <View style={styles.mainCard}>
          <View style={styles.innerContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Próxima Entrega</Text>
              <Text style={styles.customerName}>{nextCustomerName}</Text>
            </View>

            <View style={styles.addressCard}>
              <Feather name="map-pin" size={18} color="#2D2D2D" />
              <Text style={styles.addressText}>{nextAddress}</Text>
            </View>

           {nextInstruction && (
             <View style={styles.noteCard}>
              <Feather name="file-text" size={18} color="#E67E22" />
              <Text style={styles.noteText}>{nextInstruction}</Text>
            </View>
           )}

            <View style={styles.itemsBlock}>
              <Text style={styles.itemsTitle}>Itens do Pedido</Text>
              <View style={styles.itemsList}>
                {(orderItems.length > 0
                  ? orderItems.map((item) => ({
                    id: item.id,
                    quantity: item.quantity,
                    name: item.product?.name ?? "Item sem nome",
                  }))
                  : [{ id: "fallback", quantity: 1, name: "Item do pedido" }]
                ).map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.quantityBadge}>
                      <Text style={styles.quantityText}>{item.quantity}x</Text>
                    </View>
                    <Text style={styles.itemName}>{item.name}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Valor Total</Text>
                <Text style={styles.totalValue}>{formatCurrencyFromCents(orderTotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Método de pagamento</Text>
                <Text style={styles.totalValue}>
                  {getPaymentMethodLabel(nextOrder.paymentMethod)}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryAction, !nextOrder && styles.primaryActionDisabled]}
                onPress={() => {
                  void handleStartNavigation();
                }}
                disabled={!nextOrder}
              >
                <Feather name="navigation" size={18} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Iniciar Navegação</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.secondaryAction,
                  (!nextOrder || isUpdatingOrder) && styles.secondaryActionDisabled,
                ]}
                onPress={handleSecondaryAction}
                disabled={!nextOrder || isUpdatingOrder}
              >
                <Feather name="check-circle" size={18} color="#107550" />
                <Text style={styles.secondaryActionText}>
                  {isUpdatingOrder
                    ? "Processando..."
                    : isNextOrderPaid
                      ? "Marcar como Entregue"
                      : "Confirma Pagamento"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.upcomingSection}>
          <Text style={styles.upcomingTitle}>Próximas Entregas ({upcomingOrders.length})</Text>
          {upcomingOrders.length === 0 ? (
            <Text style={styles.noUpcomingText}>Sem próximas entregas.</Text>
          ) : (
            upcomingOrders.map((order, index) => (
              <View key={order.id} style={styles.upcomingCard}>
                <View style={styles.upcomingIndex}>
                  <Text style={styles.upcomingIndexText}>{index + 2}</Text>
                </View>
                <View style={styles.upcomingContent}>
                  <Text style={styles.upcomingName}>{order.customer?.name ?? "Sem cliente"}</Text>
                  <View style={styles.upcomingAddressRow}>
                    {/* <Feather name="map-pin" size={16} color="#666666" /> */}
                    <Text style={styles.upcomingAddress}>{formatAddress(order)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F9F9F9",
  },
  header: {
    // height: 76,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#DEDEDE",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2D2D2D",
  },
  headerRightSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingBottom: 24,
    paddingTop: 24,
    gap: 12
  },
  feedbackWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666666",
  },
  errorText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#B3261E",
  },
  mainCard: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#DEDEDE",
    backgroundColor: "#FFFFFF",
  },
  innerContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 15,
    color: "#666666",
    fontWeight: "500",
  },
  customerName: {
    fontSize: 20,
    color: "#2D2D2D",
    fontWeight: "700",
  },
  addressCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addressText: {
    fontSize: 16,
    color: "#2D2D2D",
    flex: 1,
  },
  noteCard: {
    backgroundColor: "#FFF4E6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteText: {
    fontSize: 16,
    color: "#E67E22",
    flex: 1,
  },
  itemsBlock: {
    gap: 12,
  },
  itemsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D2D2D",
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#F9F9F9",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
     borderWidth: 1,
    borderColor: "#DEDEDE",
    gap: 12,
  },
  quantityBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#1685FA",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  itemName: {
    fontSize: 16,
    color: "#2D2D2D",
    fontWeight: '500',
    flex: 1,
  },
  totalCard: {
    borderRadius: 12,
    backgroundColor: "#F9F9F9",
    paddingHorizontal: 16,
    paddingVertical: 12,
     borderWidth: 1,
    borderColor: "#DEDEDE",
    gap: 4,
  },
  totalRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  totalLabel: {
    fontSize: 16,
    color: "#666666",
    fontWeight: "500",
  },
  totalValue: {
    fontSize: 18,
    color: "#2D2D2D",
    fontWeight: "700",
  },
  actions: {
    gap: 12,
  },
  primaryAction: {
    // height: 59,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#1685FA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  secondaryAction: {
   paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#E6F8ED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionDisabled: {
    opacity: 0.5,
  },
  secondaryActionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#107550",
  },
  upcomingSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  upcomingTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D2D2D",
  },
  noUpcomingText: {
    fontSize: 15,
    color: "#666666",
    fontWeight: "600",
  },
  upcomingCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  upcomingIndex: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingIndexText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#666666",
  },
  upcomingContent: {
    flex: 1,
    gap: 4,
  },
  upcomingName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D2D2D",
  },
  upcomingAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  upcomingAddress: {
    fontSize: 15,
    color: "#666666",
  },
});
