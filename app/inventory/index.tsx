import { Redirect } from "expo-router";

export default function InventoryIndex() {
  return <Redirect href={"/inventory/dashboard" as never} />;
}
