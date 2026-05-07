export type TProgressiveDiscountStep = {
  type: string;
  amount: number;
  discount?: number | null;
};

export function getReachedProgressiveSteps<TStep extends TProgressiveDiscountStep>(
  steps: TStep[] | null | undefined,
  subtotal: number,
): TStep[] {
  return (steps ?? [])
    .filter((step) => typeof step.amount === "number" && subtotal >= step.amount)
    .sort((first, second) => first.amount - second.amount);
}

export function getAppliedProgressiveDiscountPercent<TStep extends TProgressiveDiscountStep>(
  reachedSteps: TStep[],
): number {
  const percentageSteps = reachedSteps.filter(
    (step) =>
      step.type === "PERCENTAGEDISCOUNT" &&
      typeof step.discount === "number" &&
      step.discount > 0,
  );

  return percentageSteps[percentageSteps.length - 1]?.discount ?? 0;
}

export function calculateProgressiveDiscountAmount(
  subtotal: number,
  progressiveDiscountPercent: number,
): number {
  return Math.min(
    subtotal,
    Math.max(0, Math.round((subtotal * progressiveDiscountPercent) / 100)),
  );
}
