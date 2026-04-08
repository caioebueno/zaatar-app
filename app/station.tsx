import BackToSitemapButton from "@/components/BackToSitemapButton";
import OrderQueueItem from "@/components/station/OrderQueueItem";
import PreparationCategoryCard from "@/components/station/PreparationCategoryCard";
import StationTopBar from "@/components/station/StationTopBar";
import {
  canViewOrder,
  isOrderActivelySnoozed,
  isOrderCompleted,
  sortOrdersByCompletion,
  updateOrdersPreparationCategory,
} from "@/components/station/stationUtils";
import { Colors } from "@/constants/theme";
import { TOrder } from "@/types/order";
import type { TPreparationStepCategory, TPreparationStepTrack, TSnooze } from "@/types/station";
import { Audio } from "expo-av";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STATION_ID = "2a18e3a7-2491-422a-af43-efff08031e9b";
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "web" ? "/api" : "http://192.168.1.151:3000/api");

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
  const [orders, setOrders] = useState<TOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrdersByStation(STATION_ID)
      .then((fetchedOrders) => {
        setOrders(sortOrdersByCompletion(fetchedOrders));
        setActiveOrderId(fetchedOrders[0]?.id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const watcher = watchNewOrders({
      stationId: STATION_ID,
      soundAsset: require("../assets/newOrder.mp3"),
      onNewOrders: (newOrders) => {
        setActiveOrderId((previousId) => previousId ?? newOrders[0]?.id ?? null);
        setOrders(sortOrdersByCompletion(newOrders));
      },
    });

    return () => {
      void watcher.stop();
    };
  }, []);

  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const pendingOrders = orders.filter((order) => !isOrderCompleted(order));
  const completedOrders = orders.filter((order) => isOrderCompleted(order));
  const canGoNext = activeOrder
    ? isOrderCompleted(activeOrder) || isOrderActivelySnoozed(activeOrder)
    : false;

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

  const handleComplete = (preparationStepCategoryId: string) => {
    const currentCategory = orders
      .flatMap((order) => order.preparationStepCategory)
      .find((category) => category.id === preparationStepCategoryId);

    if (!currentCategory) return;

    const updatedCategory: TPreparationStepCategory = {
      ...currentCategory,
      completed: true,
      steps: currentCategory.steps.map((step) => ({
        ...step,
        completed: true,
      })),
    };

    const newOrders = updateOrdersPreparationCategory(orders, preparationStepCategoryId, {
      completed: updatedCategory.completed,
      steps: updatedCategory.steps,
    });
    setOrders(sortOrdersByCompletion(newOrders));

    const payload = toPreparationCategoryApiPayload(updatedCategory);
    void markPreparationCategoryAsCompleted(payload).catch(console.error);
  };

  const handleNext = () => {
    if (!activeOrder) return;
    if (!canGoNext) return;

    if (isOrderCompleted(activeOrder)) {
      const firstPendingOrder = orders.find((order) => !isOrderCompleted(order));
      if (firstPendingOrder) {
        setActiveOrderId(firstPendingOrder.id);
      }
      return;
    }

    const findIndex = orders.findIndex((order) => order.id === activeOrderId);
    if (findIndex === -1) return;

    for (let i = findIndex + 1; i < orders.length; i++) {
      const candidate = orders[i];
      const isReadyNow =
        canViewOrder(orders, candidate.id) &&
        !isOrderCompleted(candidate) &&
        !isOrderActivelySnoozed(candidate);

      if (isReadyNow) {
        setActiveOrderId(candidate.id);
        return;
      }
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.flexOne}>
        <BackToSitemapButton absolute />
        {activeOrder ? (
          <View style={styles.flexOne}>
            <StationTopBar
              customerName={activeOrder.customer?.name ?? undefined}
              createdAt={activeOrder.createdAt}
              isCompleted={isOrderCompleted(activeOrder)}
              canGoNext={canGoNext}
              onGoNext={handleNext}
            />

            <View style={styles.contentRow}>
              <View style={styles.ordersPanel}>
                <View style={styles.orderColumns}>
                  <View style={styles.orderColumn}>
                    <Text style={styles.orderColumnTitle}>Completed</Text>
                    <ScrollView contentContainerStyle={styles.ordersListContent}>
                      {completedOrders.length === 0 ? (
                        <Text style={styles.emptyColumnText}>No orders</Text>
                      ) : (
                        completedOrders.map((order) => (
                          <OrderQueueItem
                            key={order.id}
                            order={order}
                            activeOrderId={activeOrderId}
                            canBeViewed={canViewOrder(orders, order.id)}
                            onPress={() => setActiveOrderId(order.id)}
                          />
                        ))
                      )}
                    </ScrollView>
                  </View>

                  <View style={styles.orderColumn}>
                    <Text style={styles.orderColumnTitle}>To Do</Text>
                    <ScrollView contentContainerStyle={styles.ordersListContent}>
                      {pendingOrders.map((order) => (
                        <OrderQueueItem
                          key={order.id}
                          order={order}
                          activeOrderId={activeOrderId}
                          canBeViewed={canViewOrder(orders, order.id)}
                          onPress={() => setActiveOrderId(order.id)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.categoriesScrollContent} style={styles.categoriesContainer}>
                {activeOrder.preparationStepCategory.map((item) => (
                  <PreparationCategoryCard
                    key={item.id}
                    preparationCategory={item}
                    onComplete={handleComplete}
                    onSnooze={handleSnooze}
                    onUpdateSteps={handleUpdateSteps}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        ) : (
          <Text>No orders</Text>
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
    // flex: 1
  },
  orderColumns: {
    flexDirection: "row",
    gap: 16,
    flex: 1,
  },
  orderColumn: {
    width: 180,
  },
  orderColumnTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    paddingHorizontal: 4,
    paddingBottom: 8,
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
      const newOrders = checkedOrders.filter((order) => !previousIds.has(order.id));

      if (!isFirstFetch && newOrders.length > 0) {
        await playNotificationSound();
        onNewOrders?.(checkedOrders);
      }

      previousIds = currentIds;
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
