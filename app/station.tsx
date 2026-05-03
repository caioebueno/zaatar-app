import OrderQueueItem from "@/components/station/OrderQueueItem";
import PreparationCategoryCard from "@/components/station/PreparationCategoryCard";
import StationTopBar from "@/components/station/StationTopBar";
import {
  isOrderCompleted,
  sortOrdersByCompletion,
  updateOrdersPreparationCategory,
} from "@/components/station/stationUtils";
import { API_BASE_URL } from "@/constants/api";
import { Colors } from "@/constants/theme";
import { TOrder } from "@/types/order";
import type { TPreparationStepCategory, TPreparationStepTrack, TSnooze } from "@/types/station";
import { Audio } from "expo-av";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DEFAULT_STATION_ID = "2a18e3a7-2491-422a-af43-efff08031e9b";

type TPreparationCategoryApiPayload = {
  id: string;
  categoryId: string;
  completed: boolean;
  orderId: string;
  snoozes: TSnooze[];
  steps: {
    id: string;
    name: string;
    quantity: number;
    completed: boolean;
    comments?: string;
    completedComments: boolean;
    preparationStepId: string;
    preparationStepCategoryId: string;
    preparationStepModifiers: {
      id: string;
      completed: boolean;
      modifierGroupItem: string;
    }[];
  }[];
};

type TOrderFilter = "TODO" | "COMPLETED";

function getOrderProductionIndex(order: TOrder) {
  if (typeof order.productionIndex !== "number" || !Number.isFinite(order.productionIndex)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return order.productionIndex;
}

function getOrdersSortedByProductionIndex(orderList: TOrder[]) {
  return [...orderList].sort((first, second) => {
    const firstIndex = getOrderProductionIndex(first);
    const secondIndex = getOrderProductionIndex(second);

    if (firstIndex !== secondIndex) {
      return firstIndex - secondIndex;
    }

    return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
  });
}

function getDefaultActiveOrderId(orderList: TOrder[]) {
  return orderList[0]?.id ?? null;
}

function toPreparationCategoryApiPayload(
  category: TPreparationStepCategory,
): TPreparationCategoryApiPayload {
  return {
    id: category.id,
    categoryId: category.categoryId,
    completed: category.completed,
    orderId: category.orderId,
    snoozes: category.snoozes,
    steps: category.steps.map((step) => ({
      id: step.id,
      name: step.name,
      quantity: step.quantity,
      completed: step.completed,
      comments: step.comments,
      completedComments: !!step.completedComments,
      preparationStepId: step.preparationStepId,
      preparationStepCategoryId: step.preparationStepCategoryId,
      preparationStepModifiers: (step.preparationStepModifiers || []).map((modifier) => ({
        id: modifier.id,
        completed: !!modifier.completed,
        modifierGroupItem: modifier.modifierGroupItem,
      })),
    })),
  };
}

export default function Station() {
  const { stationId: stationIdParam } = useLocalSearchParams<{ stationId?: string }>();
  const [orders, setOrders] = useState<TOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<TOrderFilter>("TODO");
  const stationId = Array.isArray(stationIdParam)
    ? stationIdParam[0]
    : stationIdParam ?? DEFAULT_STATION_ID;

  useEffect(() => {
    fetchOrdersByStation(stationId)
      .then((fetchedOrders) => {
        setOrders(sortOrdersByCompletion(fetchedOrders));
        setActiveOrderId(getDefaultActiveOrderId(fetchedOrders));
      })
      .catch(console.error);
  }, [stationId]);

  useEffect(() => {
    const watcher = watchNewOrders({
      stationId,
      soundAsset: require("../assets/newOrder.mp3"),
      onNewOrders: (newOrders) => {
        setActiveOrderId((previousId) => previousId ?? getDefaultActiveOrderId(newOrders));
        setOrders(sortOrdersByCompletion(newOrders));
      },
    });

    return () => {
      void watcher.stop();
    };
  }, [stationId]);

  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const ordersByProductionIndex = useMemo(
    () => getOrdersSortedByProductionIndex(orders),
    [orders]
  );
  const pendingOrders = ordersByProductionIndex.filter((order) => !isOrderCompleted(order));
  const completedOrders = ordersByProductionIndex.filter((order) => isOrderCompleted(order));
  const filteredOrders = orderFilter === "TODO" ? pendingOrders : completedOrders;

  const handleSnooze = (preparationStepCategoryId: string, snoozes: TSnooze[]) => {
    const newOrders = updateOrdersPreparationCategory(orders, preparationStepCategoryId, {
      snoozes,
    });
    setOrders(sortOrdersByCompletion(newOrders));
  };

  const handleUpdateSteps = (
    preparationStepCategoryId: string,
    steps: TPreparationStepTrack[],
  ) => {
    const currentCategory = orders
      .flatMap((order) => order.preparationStepCategory)
      .find((category) => category.id === preparationStepCategoryId);

    if (!currentCategory) return;

    const updatedCategory: TPreparationStepCategory = {
      ...currentCategory,
      steps,
      completed: currentCategory.completed,
    };

    const newOrders = updateOrdersPreparationCategory(orders, preparationStepCategoryId, {
      steps: updatedCategory.steps,
      completed: updatedCategory.completed,
    });
    setOrders(sortOrdersByCompletion(newOrders));

    const payload = toPreparationCategoryApiPayload(updatedCategory);
    void markPreparationCategoryAsCompleted(payload).catch(console.error);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.flexOne}>

        {activeOrder ? (
          <View style={styles.flexOne}>
            <StationTopBar
              orderFilter={orderFilter}
              onChangeOrderFilter={setOrderFilter}
            />

            <View style={styles.contentRow}>
              <View style={styles.ordersPanel}>
                <ScrollView contentContainerStyle={styles.ordersListContent}>
                  {filteredOrders.length === 0 ? (
                    <Text style={styles.emptyColumnText}>Nenhum pedido</Text>
                  ) : (
                    filteredOrders.map((order) => (
                      <OrderQueueItem
                        key={order.id}
                        order={order}
                        activeOrderId={activeOrderId}
                        canBeViewed
                        onPress={() => setActiveOrderId(order.id)}
                      />
                    ))
                  )}
                </ScrollView>
              </View>

              <View style={styles.categoriesPanel}>

                <ScrollView contentContainerStyle={styles.categoriesScrollContent} style={styles.categoriesContainer}>
                  <View style={styles.activeOrderSummary}>
                    <Text style={styles.activeOrderSummaryName}>
                      {activeOrder.customer?.name?.trim() || "Sem nome"}
                    </Text>
                    <Text
                      style={[
                        styles.activeOrderSummaryStatus,
                        isOrderCompleted(activeOrder) && styles.activeOrderSummaryStatusCompleted,
                      ]}
                    >
                      {isOrderCompleted(activeOrder) ? "Pronto" : "Em preparo"}
                    </Text>
                  </View>
                  {activeOrder.preparationStepCategory.map((item) => (
                    <PreparationCategoryCard
                      key={item.id}
                      preparationCategory={item}
                      onSnooze={handleSnooze}
                      onUpdateSteps={handleUpdateSteps}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        ) : (
          <Text>Nenhum pedido</Text>
        )}
      </SafeAreaView>
    </View>
  );
}

export async function markPreparationCategoryAsCompleted(
  payload: TPreparationCategoryApiPayload,
) {
  const response = await fetch(`${API_BASE_URL}/preparation-category`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to update preparation category");
  }

  return response.json();
}

export async function fetchOrdersByStation(stationId: string) {
  const response = await fetch(`${API_BASE_URL}/orders-by-station?stationId=${stationId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  return response.json();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  flexOne: {
    flex: 1,
  },
  contentRow: {
    flexDirection: "row",
    flex: 1,
  },
  ordersPanel: {
    paddingVertical: 24,
    paddingLeft: 24,
    width: 210,
  },
  emptyColumnText: {
    // color: Colors.light.tabIconDefault,
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  ordersListContent: {
    gap: 16,
    paddingBottom: 24,
    // width: 'auto'
  },
  categoriesContainer: {
    flex: 1,
  },
  categoriesPanel: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  activeOrderSummary: {
    marginHorizontal: 12,
    marginBottom: 12,
    width: 600,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    backgroundColor: Colors.light.foreground,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeOrderSummaryName: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.text,
  },
  activeOrderSummaryStatus: {
    borderWidth: 1,
    borderColor: "#E6DCC4",
    backgroundColor: "#FFF7E5",
    color: "#8F5D00",
    fontSize: 16,
    fontWeight: "700",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  activeOrderSummaryStatusCompleted: {
    borderColor: "#D2E9E0",
    backgroundColor: "#E6F8ED",
    color: "#107550",
  },
  categoriesScrollContent: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
    gap: 16,
    flexGrow: 1,
  },
});

type TWatchNewOrdersOptions = {
  stationId: string;
  intervalMs?: number;
  soundAsset: number;
  onNewOrders?: (orders: TOrder[]) => void;
  onError?: (error: unknown) => void;
};

export function watchNewOrders({
  stationId,
  intervalMs = 5000,
  soundAsset,
  onNewOrders,
  onError,
}: TWatchNewOrdersOptions) {
  let previousIds = new Set<string>();
  let previousProductionIndexById = new Map<string, number | null>();
  let isFirstFetch = true;
  let isFetching = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let sound: Audio.Sound | null = null;
  let stopped = false;

  async function playNotificationSound() {
    try {
      if (!sound) {
        const result = await Audio.Sound.createAsync(soundAsset);
        sound = result.sound;
      }

      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (error) {
      onError?.(error);
    }
  }

  async function check() {
    if (isFetching || stopped) return;

    try {
      isFetching = true;

      const checkedOrders = (await fetchOrdersByStation(stationId)) as TOrder[];
      const currentIds = new Set(checkedOrders.map((order) => order.id));
      const currentProductionIndexById = new Map<string, number | null>(
        checkedOrders.map((order) => [
          order.id,
          typeof order.productionIndex === "number" && Number.isFinite(order.productionIndex)
            ? order.productionIndex
            : null,
        ])
      );
      const newOrders = checkedOrders.filter((order) => !previousIds.has(order.id));
      const removedOrders = [...previousIds].filter((orderId) => !currentIds.has(orderId));
      const hasProductionIndexChanges = !isFirstFetch
        ? checkedOrders.some((order) => {
          const previousProductionIndex = previousProductionIndexById.get(order.id) ?? null;
          const currentProductionIndex = currentProductionIndexById.get(order.id) ?? null;
          return previousProductionIndex !== currentProductionIndex;
        })
        : false;

      if (!isFirstFetch && newOrders.length > 0) {
        await playNotificationSound();
      }

      if (
        !isFirstFetch &&
        (newOrders.length > 0 || removedOrders.length > 0 || hasProductionIndexChanges)
      ) {
        onNewOrders?.(checkedOrders);
      }

      previousIds = currentIds;
      previousProductionIndexById = currentProductionIndexById;
      isFirstFetch = false;
    } catch (error) {
      onError?.(error);
    } finally {
      isFetching = false;
    }
  }

  check();
  intervalId = setInterval(check, intervalMs);

  return {
    async stop() {
      stopped = true;

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      if (sound) {
        await sound.unloadAsync();
        sound = null;
      }
    },
    async refresh() {
      await check();
    },
  };
}
