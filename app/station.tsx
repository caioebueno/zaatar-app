import OrderQueueItem from "@/components/station/OrderQueueItem";
import PreparationCategoryCard from "@/components/station/PreparationCategoryCard";
import {
  isOrderCompleted,
  isPreparationStepTrackCompleted,
  sortOrdersByCompletion,
  updateOrdersPreparationTaskStation,
} from "@/components/station/stationUtils";
import { TabletTopBar } from "@/components/TabletTopBar";
import { API_BASE_URL } from "@/constants/api";
import { useAuth } from "@/contexts/auth";
import { updatePreparationTask, updatePreparationTaskStation } from "@/services/preparationTaskApi";
import { TOrder } from "@/types/order";
import type { TPreparationStepTrack } from "@/types/station";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DEFAULT_STATION_ID = "2a18e3a7-2491-422a-af43-efff08031e9b";
const OLD_ORDER_MS = 5 * 60 * 60 * 1000;

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

function formatOrderCreatedAt(createdAt?: string | null) {
  if (!createdAt) return "Data indisponível";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Data indisponível";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (date >= startOfToday && date < startOfTomorrow) {
    return `Hoje ${timeLabel}`;
  }

  if (date >= startOfYesterday && date < startOfToday) {
    return `Ontem ${timeLabel}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatStationTimer(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}H`;
  }

  return minutes >= 10
    ? `${minutes}m`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


function LoadingScreen() {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ])).start();
  }, [pulse]);
  return (
    <View style={styles.emptyScreen}>
      <Animated.Text style={[styles.emptyScreenText, { opacity: pulse, fontFamily: "GeistMono_400Regular", fontSize: 11, letterSpacing: 4 }]}>
        CARREGANDO…
      </Animated.Text>
    </View>
  );
}

export default function Station() {
  const { stationId: stationIdParam } = useLocalSearchParams<{ stationId?: string }>();
  const { owner, token } = useAuth();
  const router = useRouter();
  const userInitial = (owner?.name ?? "G").charAt(0).toUpperCase();
  const [orders, setOrders] = useState<TOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<TOrderFilter>("TODO");
  const [loading, setLoading] = useState(true);
  const [markingReady, setMarkingReady] = useState(false);
  const [finalizingAll, setFinalizingAll] = useState(false);
  const [tasksPanelW, setTasksPanelW] = useState(0);
  const stationId = Array.isArray(stationIdParam)
    ? stationIdParam[0]
    : stationIdParam ?? DEFAULT_STATION_ID;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchOrdersByStation(stationId, token)
      .then((fetchedOrders) => {
        setOrders(sortOrdersByCompletion(fetchedOrders));
        setActiveOrderId(getDefaultActiveOrderId(fetchedOrders));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stationId, token]);

  useEffect(() => {
    if (!token) return;
    const watcher = watchNewOrders({
      stationId,
      token,
      soundAsset: require("../assets/newOrder.mp3"),
      onNewOrders: (newOrders) => {
        setActiveOrderId((previousId) => previousId ?? getDefaultActiveOrderId(newOrders));
        setOrders(sortOrdersByCompletion(newOrders));
      },
    });

    return () => {
      void watcher.stop();
    };
  }, [stationId, token]);

  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const ordersByProductionIndex = useMemo(
    () => getOrdersSortedByProductionIndex(orders),
    [orders]
  );
  const pendingOrders = ordersByProductionIndex.filter((order) => !isOrderCompleted(order));
  const completedOrders = ordersByProductionIndex.filter((order) => isOrderCompleted(order));
  const filteredOrders = orderFilter === "TODO" ? pendingOrders : completedOrders;

  const handleUpdateSteps = (
    stationGroupId: string,
    steps: TPreparationStepTrack[],
  ) => {
    const currentGroup = orders
      .flatMap((order) => order.preparationTaskStation)
      .find((s) => s.id === stationGroupId);

    if (!currentGroup) return;

    const newOrders = updateOrdersPreparationTaskStation(orders, stationGroupId, {
      steps,
      completed: currentGroup.completed,
    });
    setOrders(sortOrdersByCompletion(newOrders));

    // Patch only the steps that changed
    for (const updatedStep of steps) {
      const oldStep = currentGroup.steps.find((s) => s.id === updatedStep.id);
      if (!oldStep) continue;
      const changed =
        oldStep.completed !== updatedStep.completed ||
        oldStep.completedComments !== updatedStep.completedComments;
      if (!changed) continue;

      if (!token) continue;
      void updatePreparationTask(token, updatedStep.id, {
        completed: updatedStep.completed,
        completedComments: updatedStep.completedComments,
        modifiers: (updatedStep.preparationStepModifiers ?? []).map((m) => ({
          id: m.id,
          modifierGroupItemId: m.modifierGroupItem,
          completed: m.completed ?? false,
        })),
      }).catch(console.error);
    }
  };

  // Compute active order progress for the order header
  const activeAllSteps = useMemo(
    () => activeOrder?.preparationTaskStation.flatMap((s) => s.steps) ?? [],
    [activeOrder],
  );
  const activeTotalSteps = activeAllSteps.length;
  const activeDoneSteps = activeAllSteps.filter(isPreparationStepTrackCompleted).length;
  const activeAllDone = activeTotalSteps > 0 && activeDoneSteps === activeTotalSteps;
  const activeOrderCreatedAt = useMemo(
    () => formatOrderCreatedAt(activeOrder?.createdAt),
    [activeOrder?.createdAt],
  );

  // Live elapsed time for the order header SLA pill
  const [headerElapsedMs, setHeaderElapsedMs] = useState(0);
  useEffect(() => {
    if (!activeOrder) return;
    const start = new Date(activeOrder.createdAt).getTime();
    const update = () => setHeaderElapsedMs(Math.max(0, Date.now() - start));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?.createdAt, activeOrder?.id]);
  const isActiveOrderOld = headerElapsedMs >= OLD_ORDER_MS;

  const slaRemainingSec = 15 * 60 - Math.floor(headerElapsedMs / 1000);
  const isLate = slaRemainingSec < 0;
  const headerTimeStr = formatStationTimer(Math.abs(slaRemainingSec));
  const slaColor = isLate
    ? "#ff3d14"
    : slaRemainingSec < 5 * 60
      ? "#f2b338"
      : "#34d39a";

  const handleMarkReady = async () => {
    if (!activeOrder || !token || markingReady) return;

    setMarkingReady(true);
    try {
      await Promise.all(
        activeOrder.preparationTaskStation.map((group) =>
          updatePreparationTaskStation(token, group.id, { completed: true }),
        ),
      );

      const updatedOrders = orders.map((o) => {
        if (o.id !== activeOrder.id) return o;
        return {
          ...o,
          preparationTaskStation: o.preparationTaskStation.map((s) => ({
            ...s,
            completed: true,
            steps: s.steps.map((step) => ({ ...step, completed: true, completedComments: true })),
          })),
        };
      });
      setOrders(sortOrdersByCompletion(updatedOrders));

      const next = ordersByProductionIndex.find(
        (o) => o.id !== activeOrderId && !isOrderCompleted(o),
      );
      if (next) setActiveOrderId(next.id);
    } catch (e) {
      console.error(e);
    } finally {
      setMarkingReady(false);
    }
  };

  const handleFinalizeAll = async () => {
    if (!token || finalizingAll) return;
    setFinalizingAll(true);
    try {
      await Promise.all(
        pendingOrders.flatMap((order) =>
          order.preparationTaskStation.map((group) =>
            updatePreparationTaskStation(token, group.id, { completed: true }),
          ),
        ),
      );
      const updatedOrders = orders.map((o) => {
        if (isOrderCompleted(o)) return o;
        return {
          ...o,
          preparationTaskStation: o.preparationTaskStation.map((s) => ({
            ...s,
            completed: true,
            steps: s.steps.map((step) => ({ ...step, completed: true, completedComments: true })),
          })),
        };
      });
      setOrders(sortOrdersByCompletion(updatedOrders));
    } catch (e) {
      console.error(e);
    } finally {
      setFinalizingAll(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.flexOne}>
        <TabletTopBar
          mode="inner"
          pageTitle="Estação"
          pageSubtitle="COZINHA"
          backLabel="Início"
          onBack={() => router.back()}
          userInitial={userInitial}
        />

        {loading ? (
          <LoadingScreen />
        ) : activeOrder ? (
          <View style={styles.flexOne}>
            <View style={styles.contentRow}>
              {/* ── Left rail: order queue ── */}
              <View style={styles.ordersRail}>
                <View style={styles.filterStrip}>
                  {(
                    [
                      ["TODO", "A fazer"],
                      ["COMPLETED", "Concluídos"],
                    ] as const
                  ).map(([id, label]) => {
                    const active = orderFilter === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setOrderFilter(id)}
                        style={[styles.filterBtn, active && styles.filterBtnActive]}
                      >
                        <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.railDivider} />
                <ScrollView style={styles.railScroll} contentContainerStyle={styles.railScrollContent}>
                  {filteredOrders.length === 0 ? (
                    <Text style={styles.emptyText}>NENHUM PEDIDO</Text>
                  ) : (
                    filteredOrders.map((order) => (
                      <OrderQueueItem
                        key={order.id}
                        order={order}
                        activeOrderId={activeOrderId}
                        canBeViewed
                        onPress={() => {
                          setActiveOrderId(order.id);
                          console.log("[station] preparationTasks for order", order.id, order.preparationTaskStation);
                        }}
                      />
                    ))
                  )}
                </ScrollView>
                {orderFilter === "TODO" && pendingOrders.length > 20 && (
                  <Pressable
                    style={[styles.finalizeAllBtn, finalizingAll && styles.finalizeAllBtnDisabled]}
                    onPress={() => void handleFinalizeAll()}
                    disabled={finalizingAll}
                  >
                    <Text style={styles.finalizeAllBtnText}>
                      {finalizingAll ? "Salvando…" : "Finalizar todos pedidos"}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* ── Right: work panel ── */}
              <View style={styles.workPanel}>
                {/* Order header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderHeaderLeft}>
                    <Text style={styles.orderCustomer}>
                      {activeOrder.customer?.name?.trim() || "Sem nome"}
                    </Text>
                    <Text style={styles.orderTicket}>
                      #{activeOrder.number ?? "—"}
                    </Text>
                    <Text style={styles.orderCreatedAt}>
                      {activeOrderCreatedAt}
                    </Text>
                    {isActiveOrderOld && (
                      <View style={styles.oldOrderAlert}>
                        <Text style={styles.oldOrderAlertText}>PEDIDO ANTIGO</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.orderHeaderRight}>
                    {/* Progress */}
                    <View style={styles.progressGroup}>
                      <View style={styles.progressBg}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${activeTotalSteps > 0 ? (activeDoneSteps / activeTotalSteps) * 100 : 0}%` as any,
                              backgroundColor: activeAllDone ? "#34d39a" : "#ff3d14",
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressLabel}>
                        {activeDoneSteps}/{activeTotalSteps}
                      </Text>
                    </View>

                    {/* SLA pill */}
                    <View style={[
                      styles.slaPill,
                      activeAllDone
                        ? { borderColor: "rgba(52,211,154,0.35)", backgroundColor: "rgba(52,211,154,0.12)" }
                        : { borderColor: isLate ? "rgba(255,61,20,0.35)" : "rgba(250,245,238,0.10)", backgroundColor: isLate ? "rgba(255,61,20,0.10)" : "transparent" },
                    ]}>
                      <Text style={[styles.slaTime, { color: activeAllDone ? "#34d39a" : slaColor }]}>
                        {activeAllDone ? "PRONTO" : `${isLate ? "+" : ""}${headerTimeStr}`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Tasks scroll area */}
                <ScrollView
                  style={styles.tasksScroll}
                  contentContainerStyle={styles.tasksScrollContent}
                  onLayout={(e) => setTasksPanelW(e.nativeEvent.layout.width)}
                >
                  <View style={{ flexDirection: 'column', display: 'flex', flex: 1 }}>
                    {tasksPanelW > 0 && Array.from(
                      { length: Math.ceil(activeOrder.preparationTaskStation.length / 2) },
                      (_, i) => {
                        const left = activeOrder.preparationTaskStation[i * 2];
                        // const right = activeOrder.preparationTaskStation[i * 2 + 1];
                        // const cellW = (tasksPanelW - 32 - 7) / 2;
                        return (
                          <View key={i} style={{ flexDirection: "row", gap: 7, marginBottom: 7, flex: 1,  width: '100%', display: 'flex' }}>
                            <View style={{ flex: 1 }}>
                              <PreparationCategoryCard preparationCategory={left} onUpdateSteps={handleUpdateSteps} />
                            </View>

                          </View>
                        );
                      }
                    )}
                  </View>
                </ScrollView>

                {/* Bottom bar — shown only when all tasks are done */}
                {activeAllDone && (() => {
                  const alreadyDone = activeOrder.preparationTaskStation.every((s) => s.completed);
                  const disabled = alreadyDone || markingReady;
                  return (
                    <Pressable
                      style={[styles.markReadyBtn, disabled && styles.markReadyBtnDone]}
                      onPress={() => void handleMarkReady()}
                      disabled={disabled}
                    >
                      <Text style={[styles.markReadyBtnText, alreadyDone && styles.markReadyBtnTextDone]}>
                        {alreadyDone ? "Pronto" : markingReady ? "Salvando…" : "Marcar como pronto"}
                      </Text>
                    </Pressable>
                  );
                })()}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyScreen}>
            <Text style={styles.emptyScreenText}>NENHUM PEDIDO</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );


}


export async function fetchOrdersByStation(stationId: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/orders-by-station?stationId=${stationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  return response.json();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0e0b09",
  },
  flexOne: {
    flex: 1,
  },
  contentRow: {
    flexDirection: "row",
    flex: 1,
  },

  // ── Left rail ──────────────────────────────────────────────────
  ordersRail: {
    width: 300,
    flexShrink: 0,
    backgroundColor: "#181310",
    borderRightWidth: 1,
    borderRightColor: "rgba(250,245,238,0.10)",
    flexDirection: "column",
  },
  filterStrip: {
    flexDirection: "row",
    backgroundColor: "#241d18",
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(250,245,238,0.08)",
  },
  filterBtn: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    backgroundColor: "#faf5ee",
  },
  filterBtnText: {
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "600",
    color: "rgba(250,245,238,0.62)",
  },
  filterBtnTextActive: {
    color: "#0e0b09",
  },
  railDivider: {
    height: 1,
    backgroundColor: "rgba(250,245,238,0.06)",
  },
  railScroll: {
    flex: 1,
  },
  railScrollContent: {
    paddingBottom: 8,
  },
  emptyText: {
    fontFamily: "GeistMono_400Regular",
    fontSize: 10,
    lineHeight: 13,
    color: "rgba(250,245,238,0.55)",
    letterSpacing: 2,
    textAlign: "center",
    padding: 18,
  },
  // ── Work panel ─────────────────────────────────────────────────
  workPanel: {
    flex: 1,
    backgroundColor: "#0e0b09",
    flexDirection: "column",
  },

  // Order header
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: "#181310",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(250,245,238,0.10)",
    flexShrink: 0,
    gap: 16,
  },
  orderHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  orderNum: {
    fontFamily: "monospace",
    fontSize: 38,
    fontWeight: "700",
    color: "#faf5ee",
    letterSpacing: -1.5,
    lineHeight: 30,
  },
  orderCustomer: {
    fontFamily: "monospace",
    fontSize: 28,
    fontWeight: "700",
    color: "#faf5ee",
    letterSpacing: -1,
    lineHeight: 28,
    flexShrink: 1,
  },
  channelChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  channelText: {
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    lineHeight: 10,
  },
  orderTicket: {
    fontFamily: "monospace",
    fontSize: 16,
    lineHeight: 28,
    fontWeight: "400",
    color: "rgba(250,245,238,0.52)",
    letterSpacing: -0.3,
  },
  orderCreatedAt: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 24,
    fontWeight: "500",
    color: "rgba(250,245,238,0.44)",
    letterSpacing: -0.1,
  },
  oldOrderAlert: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255,61,20,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,61,20,0.28)",
  },
  oldOrderAlertText: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 11,
    fontWeight: "700",
    color: "#ff8267",
    letterSpacing: 1,
  },
  orderHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexShrink: 0,
  },
  progressGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 160,
  },
  progressBg: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(250,245,238,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressLabel: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "600",
    color: "rgba(250,245,238,0.62)",
    minWidth: 36,
    textAlign: "right",
  },
  slaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  slaLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  slaKicker: {
    fontFamily: "monospace",
    fontSize: 9,
    lineHeight: 9,
    letterSpacing: 1.5,
    fontWeight: "500",
    marginBottom: 2,
  },
  slaTime: {
    fontFamily: "monospace",
    fontSize: 24,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  // Tasks area
  tasksScroll: {
    flex: 1,
  },
  tasksScrollContent: {
    padding: 16,
    flexDirection: 'column'
  },

  // Bottom bar
  markReadyBtn: {
    backgroundColor: "#34d39a",
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  markReadyBtnDone: {
    backgroundColor: "rgba(52,211,154,0.12)",
  },
  markReadyBtnText: {
    color: "#052e1a",
    fontSize: 17,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  markReadyBtnTextDone: {
    color: "#34d39a",
  },

  finalizeAllBtn: {
    backgroundColor: "#34d39a",
    paddingVertical: 14,
    marginHorizontal: 14,
    marginVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  finalizeAllBtnDisabled: {
    opacity: 0.5,
  },
  finalizeAllBtnText: {
    color: "#052e1a",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  // Empty screen
  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyScreenText: {
    fontFamily: "GeistMono_400Regular",
    fontSize: 11,
    lineHeight: 11,
    color: "rgba(250,245,238,0.55)",
    letterSpacing: 4,
  },
});

type TWatchNewOrdersOptions = {
  stationId: string;
  token: string;
  intervalMs?: number;
  soundAsset: number;
  onNewOrders?: (orders: TOrder[]) => void;
  onError?: (error: unknown) => void;
};

export function watchNewOrders({
  stationId,
  token,
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

      const checkedOrders = (await fetchOrdersByStation(stationId, token)) as TOrder[];
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
