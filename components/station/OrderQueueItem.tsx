import { Colors } from "@/constants/theme";
import { TOrder } from "@/types/order";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isOrderCompleted } from "./stationUtils";

type OrderQueueItemProps = {
  order: TOrder;
  activeOrderId: string | null;
  canBeViewed: boolean;
  onPress: () => void;
};

const ReadyBadgeLarge: React.FC = () => {
  return <Text style={styles.readyBadgeLarge}>Pronto</Text>;
};

function formatScheduleTime(scheduleFor: string) {
  const scheduleDate = new Date(scheduleFor);
  if (Number.isNaN(scheduleDate.getTime())) return null;

  const hours24 = scheduleDate.getHours();
  const minutes = scheduleDate.getMinutes();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  if (minutes === 0) return `${hours12}${period}`;

  return `${hours12}:${String(minutes).padStart(2, "0")}${period}`;
}

const ProductionIndexBadge: React.FC<{ productionIndex?: number }> = ({ productionIndex }) => {
  return (
    <Text style={styles.productionIndexBadge}>
      #{productionIndex ?? "-"}
    </Text>
  );
};

const ScheduleBadge: React.FC<{ scheduleFor: string }> = ({ scheduleFor }) => {
  const scheduleLabel = formatScheduleTime(scheduleFor);

  return <Text style={styles.scheduleBadge}>{scheduleLabel ?? "Agendado"}</Text>;
};

const OrderQueueItem: React.FC<OrderQueueItemProps> = ({
  order,
  activeOrderId,
  canBeViewed,
  onPress,
}) => {
  const hasSchedule = typeof order.scheduleFor === "string" && order.scheduleFor.length > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!canBeViewed}
      style={[
        styles.orderCard,
        activeOrderId === order.id ? styles.activeOrderCard : styles.inactiveOrderCard,
        !canBeViewed && styles.disabledCard,
      ]}
    >
      <Text style={styles.orderCustomerName}>{order.customer?.name}</Text>
      {isOrderCompleted(order) ? (
        <View style={styles.orderReadyCard}>
          <ReadyBadgeLarge />
        </View>
      ) : hasSchedule ? (
        <ScheduleBadge scheduleFor={order.scheduleFor as string} />
      ) : (
        <ProductionIndexBadge productionIndex={order.productionIndex} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  orderCard: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: Colors.light.foreground,
    width: 180,
    borderWidth: 2,
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  activeOrderCard: {
    borderColor: Colors.light.tint,
  },
  inactiveOrderCard: {
    borderColor: Colors.light.border,
  },
  disabledCard: {
    opacity: 0.5,
  },
  orderCustomerName: {
    fontSize: 18,
    fontWeight: "600",
  },
  orderReadyCard: {
    paddingVertical: 8,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6F8ED",
    borderColor: "#D2E9E0",
    borderWidth: 1,
    borderRadius: 12,
  },
  readyBadgeLarge: {
    color: "#107550",
    fontSize: 20,
    fontWeight: "600",
  },
  productionIndexBadge: {
    backgroundColor: "#EEF4FF",
    borderColor: "#B8CBF8",
    color: "#2C4D9A",
    fontSize: 20,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  scheduleBadge: {
    backgroundColor: "#F3EEFF",
    borderColor: "#D5C4FF",
    color: "#5E34B1",
    fontSize: 20,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});

export default OrderQueueItem;
