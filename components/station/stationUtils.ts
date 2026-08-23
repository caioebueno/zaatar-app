import { TOrder } from "@/types/order";
import type { TPreparationTaskStation, TPreparationStepTrack, TSnooze } from "@/types/station";

export function isPreparationStepTrackCompleted(track: TPreparationStepTrack): boolean {
  const modifiers = track.preparationStepModifiers ?? [];
  const modifiersCompleted =
    modifiers.length > 0 ? modifiers.every((modifier) => !!modifier.completed) : true;
  const commentsCompleted = track.comments ? !!track.completedComments : true;

  return !!track.completed && modifiersCompleted && commentsCompleted;
}

export function isOrderCompleted(order: TOrder): boolean {
  if (order.preparationTaskStation.length === 0) return false;
  return order.preparationTaskStation.every((s) => s.completed);
}

export function getActiveSnooze(
  station: TPreparationTaskStation,
  now: Date = new Date(),
): {
  isSnoozed: boolean;
  snooze: TSnooze | null;
} {
  const nowTime = now.getTime();
  const valid = station.snoozes.filter((s) => !s.canceled);

  const mapped = valid.map((snooze) => {
    const start = new Date(snooze.startedAt).getTime();
    const end = start + snooze.duration * 1000;
    return { snooze, end };
  });

  const active = mapped
    .filter((s) => s.end > nowTime)
    .sort((a, b) => a.end - b.end)[0];

  if (active) {
    return { isSnoozed: true, snooze: active.snooze };
  }

  const pastDue = mapped
    .filter((s) => s.end <= nowTime)
    .sort((a, b) => b.end - a.end)[0];

  if (pastDue) {
    return { isSnoozed: false, snooze: pastDue.snooze };
  }

  return { isSnoozed: false, snooze: null };
}

export function getOrderActiveSnooze(
  order: TOrder,
  now: Date = new Date(),
): {
  hasSnooze: boolean;
  snooze: TSnooze | null;
} {
  const nowTime = now.getTime();

  const activeSnoozes = order.preparationTaskStation
    .flatMap((station) => station.snoozes || [])
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
    return { hasSnooze: false, snooze: null };
  }

  const soonest = activeSnoozes.reduce((prev, curr) =>
    curr.end < prev.end ? curr : prev
  );

  return { hasSnooze: true, snooze: soonest.snooze };
}

export function isOrderActivelySnoozed(
  order: TOrder,
  now: Date = new Date(),
): boolean {
  return getOrderActiveSnooze(order, now).hasSnooze;
}

export function canViewOrder(orders: TOrder[], orderId: string): boolean {
  const index = orders.findIndex((o) => o.id === orderId);
  if (index === -1) return false;
  if (isOrderCompleted(orders[index])) return true;

  const isStationResolved = (station: TPreparationTaskStation) => {
    if (station.completed) return true;
    const hasSnooze = station.snoozes?.some((s) => !s.canceled);
    return !!hasSnooze;
  };

  const isOrderResolved = (order: TOrder) => {
    if (order.preparationTaskStation.length === 0) return false;
    return order.preparationTaskStation.every(isStationResolved);
  };

  for (let i = 0; i < index; i++) {
    if (!isOrderResolved(orders[i])) return false;
  }

  return true;
}

export function sortOrdersByCompletion(orders: TOrder[]): TOrder[] {
  const getCreatedAtTime = (order: TOrder) => new Date(order.createdAt).getTime();

  const pendingOrders = orders
    .filter((order) => !isOrderCompleted(order))
    .sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b));

  const completedOrders = orders
    .filter((order) => isOrderCompleted(order))
    .sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b));

  return [...pendingOrders, ...completedOrders];
}

export function cancelActiveSnooze(
  snoozes: TSnooze[],
  now: Date = new Date(),
): TSnooze[] {
  const nowTime = now.getTime();

  return snoozes.map((snooze) => {
    const start = new Date(snooze.startedAt).getTime();
    const end = start + snooze.duration * 1000;
    const isActive = !snooze.canceled && end > nowTime;
    if (!isActive) return snooze;
    return { ...snooze, canceled: true };
  });
}

export function addSnooze(
  snoozes: TSnooze[],
  duration: number,
  now: Date = new Date(),
): TSnooze[] {
  const nowTime = now.getTime();

  const hasActiveSnooze = snoozes.some((snooze) => {
    if (snooze.canceled) return false;
    const startedAt = new Date(snooze.startedAt).getTime();
    const endsAt = startedAt + snooze.duration * 1000;
    return endsAt > nowTime;
  });

  if (hasActiveSnooze) return snoozes;

  return [
    ...snoozes,
    { startedAt: now.toISOString(), duration, canceled: false },
  ];
}

export function updateOrdersPreparationTaskStation(
  orders: TOrder[],
  stationGroupId: string,
  updates: Partial<TPreparationTaskStation>,
): TOrder[] {
  return orders.map((order) => ({
    ...order,
    preparationTaskStation: order.preparationTaskStation.map((station) => {
      if (station.id !== stationGroupId) return station;
      return {
        ...station,
        ...updates,
        steps: updates.steps ?? station.steps,
      };
    }),
  }));
}
