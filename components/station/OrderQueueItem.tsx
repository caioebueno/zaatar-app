import { TOrder } from "@/types/order";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isOrderCompleted, isPreparationStepTrackCompleted } from "./stationUtils";

type OrderQueueItemProps = {
  order: TOrder;
  activeOrderId: string | null;
  canBeViewed: boolean;
  onPress: () => void;
};

const SLA_SEC = 15 * 60;
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

const CHANNEL_STYLES: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  DELIVERY: { bg: "rgba(255,61,20,0.14)", fg: "#ff8267", label: "Entrega" },
  TAKEAWAY: {
    bg: "rgba(250,245,238,0.08)",
    fg: "rgba(250,245,238,0.62)",
    label: "Balcão",
  },
};

const OrderQueueItem: React.FC<OrderQueueItemProps> = ({
  order,
  activeOrderId,
  canBeViewed,
  onPress,
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const isActive = activeOrderId === order.id;
  const completed = isOrderCompleted(order);

  useEffect(() => {
    const start = new Date(order.createdAt).getTime();
    const update = () => setElapsedMs(Math.max(0, Date.now() - start));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [order.createdAt]);

  const allSteps = order.preparationTaskStation.flatMap((s) => s.steps);
  const total = allSteps.length;
  const done = allSteps.filter((s) => isPreparationStepTrackCompleted(s)).length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  const ch = CHANNEL_STYLES[order.type] ?? CHANNEL_STYLES.TAKEAWAY;
  const slaRemainingSec = SLA_SEC - Math.floor(elapsedMs / 1000);
  const isLate = !completed && slaRemainingSec < 0;
  const absRemSec = Math.abs(slaRemainingSec);
  const timeStr = formatStationTimer(absRemSec);
  const slaColor = completed ? "#34d39a" : isLate ? "#ff3d14" : slaRemainingSec < 5 * 60 ? "#f2b338" : "#34d39a";
  const kicker = completed ? "PRONTO" : isLate ? "ATRASO" : "RESTAM";

  return (
    <Pressable
      onPress={onPress}
      disabled={!canBeViewed}
      style={[
        styles.card,
        isActive && styles.cardActive,
        !canBeViewed && styles.cardDisabled,
      ]}
    >
      {/* Top row: order number + customer name + timer */}
      <View style={styles.topRow}>
        <View style={styles.orderNumRow}>
          <Text style={styles.orderNum} numberOfLines={1}>
            {order.customer?.name?.trim().split(" ")[0] || "—"}
          </Text>
          <Text style={styles.orderNumSecondary}>
            #{order.number ?? "—"}
          </Text>
        </View>
        <View style={[styles.slaPill, {
          borderColor: isLate ? "rgba(255,61,20,0.35)" : "rgba(250,245,238,0.10)",
          backgroundColor: isLate ? "rgba(255,61,20,0.10)" : "transparent",
        }]}>
          <View>
            <Text style={[styles.slaTime, { color: slaColor }]}>
              {completed ? "Pronto" : `${isLate ? "+" : ""}${timeStr}`}
            </Text>
          </View>
        </View>
      </View>


      {/* Progress bar */}
      {total > 0 && (
        <View style={styles.progressRow}>
          <View style={styles.progressBg}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${pct}%` as any,
                  backgroundColor: pct >= 100 ? "#34d39a" : "#ff3d14",
                },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {done}/{total}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(250,245,238,0.06)",
    gap: 9,
  },
  cardActive: {
    backgroundColor: "rgba(255,61,20,0.07)",
    borderLeftColor: "#ff3d14",
  },
  cardDisabled: {
    opacity: 0.4,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderNumRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
  },
  orderNum: {
    fontFamily: "monospace",
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "700",
    color: "#faf5ee",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  orderNumSecondary: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "400",
    color: "rgba(250,245,238,0.52)",
    letterSpacing: 0,
    flexShrink: 0,
  },
  ticketNum: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 10,
    color: "rgba(250,245,238,0.42)",
    letterSpacing: 0.5,
  },
  slaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  slaLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  slaKicker: {
    fontFamily: "monospace",
    fontSize: 7.5,
    lineHeight: 7.5,
    letterSpacing: 1.2,
    fontWeight: "500",
    marginBottom: 2,
  },
  slaTime: {
    fontFamily: "monospace",
    fontSize: 16,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  midRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  channelChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  channelText: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  customerName: {
    fontSize: 13,
    lineHeight: 13,
    fontWeight: "500",
    color: "#faf5ee",
    flex: 1,
    letterSpacing: -0.1,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  progressBg: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(250,245,238,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "600",
    color: "rgba(250,245,238,0.5)",
    minWidth: 28,
    textAlign: "right",
  },
});

export default OrderQueueItem;
