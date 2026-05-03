import {
  getTodayInventoryChecklist,
  openDailyInventoryChecklist,
  submitInventoryChecklist,
  updateInventoryChecklistItem,
} from "@/services/inventoryApi";
import type {
  OpenDailyInventoryChecklistInput,
  SubmitInventoryChecklistInput,
  UpdateInventoryChecklistItemInput,
} from "@/types/inventory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryQueryKeys } from "./queryKeys";

export function useTodayInventoryChecklist(date?: string | null) {
  return useQuery({
    queryKey: inventoryQueryKeys.checklistToday(date),
    queryFn: () => getTodayInventoryChecklist(date),
  });
}

export function useOpenDailyInventoryChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OpenDailyInventoryChecklistInput) => openDailyInventoryChecklist(payload),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistById(data.id) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistItems(data.id) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
    },
  });
}

export function useUpdateInventoryChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateInventoryChecklistItemInput) => updateInventoryChecklistItem(payload),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistById(data.id) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistItems(data.id) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
    },
  });
}

export function useSubmitInventoryChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SubmitInventoryChecklistInput) => submitInventoryChecklist(payload),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistToday() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistById(data.id) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.checklistItems(data.id) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.dashboard() });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.alerts({}) });
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stocks() });
    },
  });
}
