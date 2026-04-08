import ElapsedTimer from "@/components/ElapsedTimer";
import SnoozeCountdown from "@/components/SnoozeCountdown";
import { Colors } from "@/constants/theme";
import { TOrder } from "@/types/order";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getOrderActiveSnooze, isOrderCompleted } from "./stationUtils";

type OrderQueueItemProps = {
  order: TOrder;
  activeOrderId: string | null;
  canBeViewed: boolean;
  onPress: () => void;
};

const ReadyBadgeLarge: React.FC = () => {
  return <Text style={styles.readyBadgeLarge}>Pronto</Text>;
};

const OrderQueueItem: React.FC<OrderQueueItemProps> = ({
  order,
  activeOrderId,
  canBeViewed,
  onPress,
}) => {
  const hasSnooze = getOrderActiveSnooze(order);

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
      ) : hasSnooze.hasSnooze ? (
        <View style={styles.orderSnoozeCard}>
          <SnoozeCountdown snooze={hasSnooze.snooze} small />
        </View>
      ) : (
        <ElapsedTimer big date={order.createdAt} />
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
  orderSnoozeCard: {
    backgroundColor: "#FCEFC3",
    borderColor: "#C9A978",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default OrderQueueItem;
