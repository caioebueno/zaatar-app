import { Redirect } from "expo-router";

export default function InventoryDailyChecklistScreen() {
  return <Redirect href={"/inventory/dashboard?openChecklist=1" as never} />;
}
