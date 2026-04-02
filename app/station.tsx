import ElapsedTimer from "@/components/ElapsedTimer";
import SnoozeCountdown from "@/components/SnoozeCountdown";
import { Colors } from "@/constants/theme";
import { useDoubleTap } from "@/hooks/useDoubleClick";
import { TOrder } from "@/types/order";
import { TModifierGroupItem } from "@/types/product";
import { TPreparationStepCategory, TPreparationStepTrack, TSnooze, TTPreparationStepModifierTrack } from "@/types/station";
import Feather from '@expo/vector-icons/Feather';
import { Audio } from "expo-av";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function isOrderCompleted(
    order: TOrder,
    now: Date = new Date(),
): boolean {
    return order.preparationStepCategory.every((category) => {
        if (category.completed) return true;

        // check active snooze
        const isSnoozed = category.snoozes?.some((snooze) => {
            const start = new Date(snooze.startedAt).getTime();
            const end = start + snooze.duration * 1000; // seconds
            return end > now.getTime();
        });

        return isSnoozed;
    });
}
export function getActiveSnooze(
    category: TPreparationStepCategory,
    now: Date = new Date(),
): {
    isSnoozed: boolean;
    snooze: TSnooze | null;
} {
    const nowTime = now.getTime();

    const valid = category.snoozes.filter((s) => !s.canceled);

    const mapped = valid.map((snooze) => {
        const start = new Date(snooze.startedAt).getTime();
        const end = start + snooze.duration * 1000;

        return { snooze, end };
    });

    // 🔥 1. Active snooze (soonest to end)
    const active = mapped
        .filter((s) => s.end > nowTime)
        .sort((a, b) => a.end - b.end)[0];

    if (active) {
        return {
            isSnoozed: true,
            snooze: active.snooze,
        };
    }

    // 🔥 2. Past-due snooze (most recent)
    const pastDue = mapped
        .filter((s) => s.end <= nowTime)
        .sort((a, b) => b.end - a.end)[0];

    if (pastDue) {
        return {
            isSnoozed: false, // key difference
            snooze: pastDue.snooze,
        };
    }

    return {
        isSnoozed: false,
        snooze: null,
    };
}
export default function Station() {
    const [orders, setOrders] = useState<TOrder[]>()
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null)

    useEffect(() => {
        fetchOrdersByStation("2a18e3a7-2491-422a-af43-efff08031e9b")
            .then(orders => {
                console.log(orders)
                setOrders(sortOrdersByCompletion(orders))
                setActiveOrderId(orders[0]?.id)
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        const watcher = watchNewOrders({
            stationId: "2a18e3a7-2491-422a-af43-efff08031e9b",
            soundAsset: require("../assets/notification.mp3"),
            onNewOrders: (orders) => {
                if(!activeOrderId) setActiveOrderId(orders[0].id)
                setOrders(sortOrdersByCompletion(orders))
            },
        });

        return () => watcher.stop();
    }, []);


    const activeOrder = orders?.find(order => order.id === activeOrderId)

    const handleSnooze = (preparationStepCategoryId: string, snoozes: TSnooze[]) => {
        if (!orders) return
        const newOrders = updateOrdersPreparationCategory(orders, preparationStepCategoryId, {
            snoozes: snoozes
        })
        setOrders(sortOrdersByCompletion(newOrders))
    }

    const handleComplete = (preparationStepCategoryId: string) => {
        if (!orders) return
        const newOrders = updateOrdersPreparationCategory(orders, preparationStepCategoryId, {
            completed: true
        })
        setOrders(sortOrdersByCompletion(newOrders))
        markPreparationCategoryAsCompleted(preparationStepCategoryId)
    }

    const handleNext = () => {
        if (!orders) return
        const findIndex = orders?.findIndex(order => order.id === activeOrderId)
        if (findIndex === -1) return
        const nextOrder = orders[findIndex + 1]
        if (nextOrder) setActiveOrderId(nextOrder.id)
    }
    const canNext = activeOrder ? isOrderCompleted(activeOrder) : false

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }}>
                {activeOrder ? (
                    <View style={{ flex: 1 }}>
                        <View style={styles.topbar}>
                            <View style={{ opacity: 0 }}>
                                <Pressable style={[styles.button, styles.primaryButton, !canNext ? { opacity: 0.7 } : {}]} onPress={handleNext} disabled={!canNext}>
                                    <Text style={[styles.buttonText, styles.primaryButtonText]}>Proximo</Text>
                                    <Feather name="arrow-right" size={26} color={Colors.light.foreground} />
                                </Pressable>
                            </View>
                            <View style={styles.nameRow}>
                                <Text style={styles.name}>{activeOrder.customer?.name}</Text>
                                {isOrderCompleted(activeOrder) ? (
                                    <Text style={[{
                                        backgroundColor: '#E6F8ED',
                                        borderColor: '#D2E9E0',
                                        color: '#107550',
                                        fontSize: 18,
                                        fontWeight: "600",
                                        paddingVertical: 6,
                                        paddingHorizontal: 10,
                                        borderWidth: 1,
                                        borderRadius: 12
                                    }]}>Pronto</Text>
                                ) : <ElapsedTimer
                                    date={activeOrder.createdAt}
                                />}
                            </View>

                            <View>
                                <Pressable style={[styles.button, styles.primaryButton, !canNext ? { opacity: 0.7 } : {}]} onPress={handleNext} disabled={!canNext}>
                                    <Text style={[styles.buttonText, styles.primaryButtonText]}>Proximo</Text>
                                    <Feather name="arrow-right" size={26} color={Colors.light.foreground} />
                                </Pressable>
                            </View>
                        </View>
                        <View style={{
                            flexDirection: 'row',
                            flex: 1
                        }}>
                            <View>
                                <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
                                    {orders?.map(order => <OrderSideItem canBeViewed={canViewOrder(orders, order.id)} onPress={() => setActiveOrderId(order.id)} key={order.id} order={order} actveOrderId={activeOrderId} />)}
                                </ScrollView>
                            </View>
                            <ScrollView contentContainerStyle={{
                                justifyContent: "center",
                                alignItems: "center",
                                paddingVertical: 32,
                                gap: 24,
                                flexGrow: 1
                            }} style={styles.categoriesContainer}>
                                {activeOrder.preparationStepCategory.map(item => (
                                    <PreparationCategory key={item.id} preparationCategory={item} onComplete={handleComplete} onSnooze={handleSnooze} />
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

export function getOrderActiveSnooze(
    order: TOrder,
    now: Date = new Date(),
): {
    hasSnooze: boolean;
    snooze: TSnooze | null;
} {
    const nowTime = now.getTime();

    const activeSnoozes = order.preparationStepCategory
        .flatMap((category) => category.snoozes || [])
        .filter((snooze) => {
            if (snooze.canceled) return false;

            const start = new Date(snooze.startedAt).getTime();
            const end = start + snooze.duration * 1000;

            return end > nowTime;
        })
        .map((snooze) => {
            const start = new Date(snooze.startedAt).getTime();
            const end = start + snooze.duration * 1000;

            return { snooze, end };
        });

    if (activeSnoozes.length === 0) {
        return {
            hasSnooze: false,
            snooze: null,
        };
    }

    // 🔥 pick the one that ends sooner
    const soonest = activeSnoozes.reduce((prev, curr) =>
        curr.end < prev.end ? curr : prev
    );

    return {
        hasSnooze: true,
        snooze: soonest.snooze,
    };
}

type TOrderSideItem = {
    order: TOrder
    actveOrderId: string | null
    onPress: () => void
    canBeViewed: boolean
}

export function canViewOrder(
    orders: TOrder[],
    orderId: string,
    now: Date = new Date(),
): boolean {
    const index = orders.findIndex((o) => o.id === orderId);
    if (index === -1) return false;

    const nowTime = now.getTime();

    // helper: is category resolved
    const isCategoryResolved = (category: TPreparationStepCategory) => {
        if (category.completed) return true;

        const hasSnooze = category.snoozes?.some((s) => {
            if (s.canceled) return false;

            const start = new Date(s.startedAt).getTime();
            const end = start + s.duration * 1000;

            return true; // 🔥 includes both active and past-due
        });

        return !!hasSnooze;
    };

    // helper: is order resolved
    const isOrderResolved = (order: TOrder) => {
        if (order.preparationStepCategory.length === 0) return false;

        return order.preparationStepCategory.every(isCategoryResolved);
    };

    // check all previous orders
    for (let i = 0; i < index; i++) {
        if (!isOrderResolved(orders[i])) {
            return false;
        }
    }

    return true;
}

export function sortOrdersByCompletion(
  orders: TOrder[],
  now: Date = new Date(),
): TOrder[] {
  const nowTime = now.getTime();

  const isOrderCompleted = (order: TOrder) => {
    return order.preparationStepCategory.every((category) => {
      if (category.completed) return true;

      return category.snoozes?.some((s) => {
        if (s.canceled) return false;

        const start = new Date(s.startedAt).getTime();
        const end = start + s.duration * 1000;

        return true; // includes active + past-due
      });
    });
  };

  return [...orders].sort((a, b) => {
    const aCompleted = isOrderCompleted(a);
    const bCompleted = isOrderCompleted(b);

    // 🔥 incomplete orders first
    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }

    // 🔥 within same group:
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();

    // newer goes to the end
    return aTime - bTime;
  });
}

const OrderSideItem: React.FC<TOrderSideItem> = ({
    actveOrderId,
    order,
    onPress,
    canBeViewed
}) => {
    const hasSnooze = getOrderActiveSnooze(order)

    return (
        <Pressable onPress={onPress} style={{
            padding: 16,
            borderWidth: actveOrderId === order.id ? 2 : 1,
            borderColor: actveOrderId === order.id ? Colors.light.tint : Colors.light.border,
            borderRadius: 12,
            backgroundColor: Colors.light.foreground,
            width: 220,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            opacity: canBeViewed ? 1 : 0.5
        }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>{order.customer?.name}</Text>
            {isOrderCompleted(order) ? (
                <View style={{ paddingVertical: 10, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6F8ED', borderColor: '#D2E9E0', borderWidth: 1, borderRadius: 12 }}>
                    <Text style={[{
                        backgroundColor: '#E6F8ED',
                        borderColor: '#D2E9E0',
                        color: '#107550',
                        fontSize: 18,
                        fontWeight: "600",
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderWidth: 1,
                        borderRadius: 12
                    }, {
                        borderColor: 'transparent', paddingVertical: 0, fontSize: 24,
                        paddingHorizontal: 0,
                    }]}>Pronto</Text>
                </View>
            ) : hasSnooze.hasSnooze ? (
                <View style={{
                    backgroundColor: '#FCEFC3',
                    borderColor: '#C9A978',
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'center'
                    // flex: 1
                }}>
                    <SnoozeCountdown
                        snooze={hasSnooze.snooze}
                        small
                    />
                </View>
            ) : (
                <ElapsedTimer big date={order.createdAt} />
            )}
        </Pressable>
    )
}

function areAllTrue(map: Record<string, boolean>): boolean {
    return Object.values(map).every(Boolean);
}

type TPreparationCategoryComp = {
    preparationCategory: TPreparationStepCategory
    onComplete: (preparationStepCategoryId: string) => void
    onSnooze: (preparationStepCategoryId: string, snoozes: TSnooze[]) => void
}

const PreparationCategory: React.FC<TPreparationCategoryComp> = ({
    preparationCategory,
    onComplete,
    onSnooze
}) => {
    const handleCancelSnooze = useDoubleTap(() => {
        const newSnoozes = cancelActiveSnooze(preparationCategory.snoozes)
        onSnooze(preparationCategory.id, newSnoozes)
    })
    // console.log(preparationCategory)
    const [completedTracks, setCompletedTracks]
        = useState(preparationCategory.steps.reduce((acc, track) => {
            acc[track.id] = track.completed;
            return acc;
        }, {} as Record<string, boolean>))

    const canComplete = areAllTrue(completedTracks)
    const isSnoozes = getActiveSnooze(preparationCategory)


    return (
        <View style={[styles.categoryContainer, preparationCategory.completed ? { opacity: 0.5 } : {}]}>
            {isSnoozes.isSnoozed && (
                <Pressable onPress={handleCancelSnooze} style={styles.snoozedModal}>
                    <SnoozeCountdown
                        snooze={isSnoozes.snooze}
                    />
                </Pressable>
            )}
            <View style={[styles.categoryNameContainer, isSnoozes.isSnoozed && { opacity: 0.5 }]}>
                <Text style={styles.categoryName}>{preparationCategory.category?.title}</Text>
            </View>
            <View style={[styles.tracksContainer, isSnoozes.isSnoozed && { opacity: 0.5 }]}>
                {preparationCategory.steps.map(item => (
                    <PreparationItem key={item.id} track={item} onPress={() => setCompletedTracks(prevTracks => ({
                        ...prevTracks,
                        [item.id]: !prevTracks[item.id]
                    }))} completed={completedTracks[item.id]} />
                ))}
            </View>
            <View style={[styles.categoryButtonContainer, isSnoozes.isSnoozed && { opacity: 0.5 }]}>
                <Pressable onPress={() => {
                    const newSzoones = addSnooze(preparationCategory.snoozes, 60)
                    onSnooze(preparationCategory.id, newSzoones)
                }} style={[styles.button, { paddingHorizontal: 24 }]}>
                    <Feather name="clock" size={22} color={Colors.light.text} />
                    <Text style={styles.buttonText}>Adiar</Text>
                </Pressable>
                <Pressable onPress={() => onComplete(preparationCategory.id)} disabled={!canComplete} style={[styles.button, { flex: 1, opacity: canComplete ? 1 : 0.5 }, styles.primaryButton, preparationCategory.completed ? {
                    backgroundColor: '#107550'
                } : {}]}>
                    <Feather name="check" size={22} color={Colors.light.background} />
                    <Text style={[styles.buttonText, styles.primaryButtonText]}>{preparationCategory.completed ? 'Pronto' : 'Marcar como pronto'}</Text>
                </Pressable>
            </View>
        </View>
    )
}

export function cancelActiveSnooze(
    snoozes: TSnooze[],
    now: Date = new Date(),
): TSnooze[] {
    const nowTime = now.getTime();

    return snoozes.map((snooze) => {
        const start = new Date(snooze.startedAt).getTime();
        const end = start + snooze.duration * 1000;

        const isActive =
            !snooze.canceled && end > nowTime;

        if (!isActive) return snooze;

        return {
            ...snooze,
            canceled: true,
        };
    });
}

export function addSnooze(
    snoozes: TSnooze[],
    duration: number,
    now: Date = new Date(),
): TSnooze[] {
    const nowTime = now.getTime();

    const hasActiveSnooze = snoozes.some((snooze) => {
        if (snooze.canceled) return false; // 🔥 ignore canceled

        const startedAt = new Date(snooze.startedAt).getTime();
        const endsAt = startedAt + snooze.duration * 1000;

        return endsAt > nowTime;
    });

    if (hasActiveSnooze) {
        return snoozes;
    }

    return [
        ...snoozes,
        {
            startedAt: now.toISOString(),
            duration,
            canceled: false,
        },
    ];
}

export function updateOrdersPreparationCategory(
    orders: TOrder[],
    categoryId: string,
    updates: Partial<TPreparationStepCategory>,
): TOrder[] {
    return orders.map((order) => {
        const updatedCategories = order.preparationStepCategory.map((category) => {
            if (category.id !== categoryId) return category;

            const updatedCategory: TPreparationStepCategory = {
                ...category,
                ...updates,
                steps: updates.steps ?? category.steps,
            };

            return {
                ...updatedCategory,
            };
        });

        return {
            ...order,
            preparationStepCategory: updatedCategories,
        };
    });
}

type TPreparationItemComp = {
    track: TPreparationStepTrack
    onPress: () => void
    completed: boolean
}

const PreparationItem: React.FC<TPreparationItemComp> = ({
    track,
    completed,
    onPress
}) => {
    const [commentsCompleted, setCommentsCompleted] = useState(false)

    const [modifiersStatus, setModifierStatus] = useState((track.preparationStepModifiers || []).reduce((acc, track) => {
        acc[track.id] = false;
        return acc;
    }, {} as Record<string, boolean>))

    const canComplete = (track.comments !== undefined ? commentsCompleted : true) && ((track.preparationStepModifiers && track.preparationStepModifiers?.length > 0) ? areAllTrue(modifiersStatus) : true)

    return (
        <View style={[styles.trackContainer, completed ? styles.completedContainer : {}]}>
            <Pressable onPress={() => canComplete && onPress()} style={[styles.trackInnerRow, {
                paddingVertical: 12,
                paddingHorizontal: 16,
            }]}>
                <Text style={styles.trackText}>
                    {track.quantity}x{'   '}
                    {track.name}
                </Text>
                <View style={[styles.nonActiveIndicator, !completed ? {} : {
                    borderColor: '#107550',
                    backgroundColor: '#107550'
                }]}>
                    {completed && (
                        <Feather name="check" size={20} color={Colors.light.background} />
                    )}
                </View>
            </Pressable>
            {((track.comments !== undefined) || (track.preparationStepModifiers && track.preparationStepModifiers.length > 0)) && (
                <View style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: Colors.light.background, borderTopWidth: 1, borderColor: Colors.light.border, gap: 10 }}>
                    {(track.preparationStepModifiers && track.preparationStepModifiers.length > 0) && (
                        <View style={{ gap: 10 }}>
                            <Text style={{ fontWeight: '600', color: '#555555', fontSize: 16 }}>Adicionais</Text>
                            {track.preparationStepModifiers?.map(modifier => (
                                <ModifierItem onPress={() => setModifierStatus(prev => ({
                                    ...prev,
                                    [modifier.id]: !prev[modifier.id]
                                }))} completed={modifiersStatus[modifier.id]} modifier={modifier.modifierGtroupItem} key={modifier.id} modifierTrack={modifier} />
                            ))}
                        </View>
                    )}
                    {(track.comments !== undefined) && (
                        <View style={{ gap: 10 }}>
                            <Text style={{ fontWeight: '600', color: '#555555', fontSize: 16 }}>Instruções extras</Text>
                            <Pressable onPress={() => {
                                // onPress()
                                setCommentsCompleted(prev => !prev)
                            }} style={[styles.trackInnerRow, {
                                paddingVertical: 12,
                                paddingHorizontal: 16,
                                backgroundColor: Colors.light.foreground,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: Colors.light.border
                            }, commentsCompleted ? styles.completedContainer : {}]}>
                                <Text style={styles.trackText}>
                                    {track.comments}
                                </Text>
                                <View style={[styles.nonActiveIndicator, !commentsCompleted ? {} : {
                                    borderColor: '#107550',
                                    backgroundColor: '#107550'
                                }]}>
                                    {commentsCompleted && (
                                        <Feather name="check" size={20} color={Colors.light.background} />
                                    )}
                                </View>
                            </Pressable>
                        </View>
                    )}
                </View>
            )}
        </View>
    )
}

type TModifierItem = {
    modifier?: TModifierGroupItem
    modifierTrack: TTPreparationStepModifierTrack
    completed: boolean
    onPress: () => void
}

const ModifierItem: React.FC<TModifierItem> = ({
    modifier,
    modifierTrack,
    completed,
    onPress
}) => {
    return (
        <Pressable onPress={onPress} style={[styles.trackInnerRow, {
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: Colors.light.foreground,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.light.border
        }, completed ? styles.completedContainer : {}]}>
            <Text style={styles.trackText}>
                {modifier?.description}
            </Text>
            <View style={[styles.nonActiveIndicator, !completed ? {} : {
                borderColor: '#107550',
                backgroundColor: '#107550'
            }]}>
                {completed && (
                    <Feather name="check" size={20} color={Colors.light.background} />
                )}
            </View>
        </Pressable>
    )
}

export async function markPreparationCategoryAsCompleted(preparationStepCategoryId: string) {
    const response = await fetch(
        `http://192.168.1.151:3000/api/preparation-category?preparationStepCategoryId=${preparationStepCategoryId}`, {
        method: 'PUT'
    }
    );

    if (!response.ok) {
        throw new Error("Failed to fetch orders");
    }

    return response.json();
}

export async function fetchOrdersByStation(stationId: string) {
    const response = await fetch(
        `http://192.168.1.151:3000/api/orders-by-station?stationId=${stationId}`
    );

    if (!response.ok) {
        throw new Error("Failed to fetch orders");
    }

    return response.json();
}

const styles = StyleSheet.create({
    snoozedModal: {
        position: 'absolute',
        backgroundColor: '#F7CA3770',
        borderWidth: 2,
        borderColor: '#96632C80',
        borderRadius: 11,
        width: '100%',
        height: '100%',
        zIndex: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    completedContainer: {
        backgroundColor: '#E6F8ED',
        borderColor: '#D2E9E0'
    },
    primaryButtonText: {
        color: Colors.light.foreground
    },
    primaryButton: {
        backgroundColor: Colors.light.tint,
        borderColor: Colors.light.tint
    },
    categoryButtonContainer: {
        padding: 16,
        borderTopWidth: 1,
        borderColor: Colors.light.border,
        // backgroundColor: Colors.light.foreground,
        flexDirection: "row",
        gap: 12
    },
    trackInnerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center"
    },
    nonActiveIndicator: {
        height: 28,
        width: 28,
        borderWidth: 2,
        borderColor: Colors.light.border,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center'
    },
    trackText: {
        fontSize: 20,
        fontWeight: "600"
    },
    trackContainer: {
        overflow: 'hidden',
        borderColor: Colors.light.border,
        borderWidth: 1,
        borderRadius: 12,
    },
    tracksContainer: {
        padding: 16,
        // backgroundColor: Colors.light.foreground
    },
    categoriesContainer: {
        flex: 1,
        // justifyContent: "center",
        // alignItems: "center"
    },
    categoryName: {
        fontWeight: "600",
        fontSize: 20
    },
    categoryNameContainer: {
        borderBottomWidth: 1,
        borderColor: Colors.light.border,
        padding: 16,
        // backgroundColor: Colors.light.foreground,

    },
    categoryContainer: {
        borderColor: Colors.light.border,
        borderWidth: 1,
        borderRadius: 12,
        width: 600,
        backgroundColor: Colors.light.foreground,
        overflow: 'hidden'
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: "center",
        gap: 16
    },
    button: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderColor: Colors.light.border,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: "center",
        justifyContent: "center",
        gap: 8
    },
    buttonText: {
        fontSize: 20,
        fontWeight: "600"
    },
    topbar: {
        paddingHorizontal: 32,
        paddingVertical: 12,
        backgroundColor: Colors.light.foreground,
        borderBottomColor: Colors.light.border,
        borderBottomWidth: 1,
        justifyContent: "space-between",
        alignItems: "center",
        flexDirection: "row"
    },
    name: {
        fontSize: 24,
        fontWeight: "600"
    },
    container: {
        flex: 1,
        backgroundColor: Colors.light.background
    }
})

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

            const orders = (await fetchOrdersByStation(stationId)) as TOrder[];
            console.log("ORDERCHECK")
            const currentIds = new Set(orders.map((order) => order.id));

            const newOrders = orders.filter((order) => !previousIds.has(order.id));

            if (!isFirstFetch && newOrders.length > 0) {
                await playNotificationSound();
                onNewOrders?.(orders);
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