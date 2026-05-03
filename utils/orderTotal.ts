import {
  calculateProgressiveDiscountAmount,
  getAppliedProgressiveDiscountPercent,
  getReachedProgressiveSteps,
  type TProgressiveDiscountStep,
} from "@/utils/progressiveDiscount";

type TOrderTotalProduct = {
  amount?: number | null;
  fullAmount?: number | null;
  quantity?: number | null;
};

type TOrderTotalDeliveryAddress = {
  deliveryFee?: number | null;
};

export type TOrderTotalInput = {
  type?: "DELIVERY" | "TAKEAWAY" | string | null;
  tip?: number | null;
  tipAmount?: number | null;
  deliveryAddress?: TOrderTotalDeliveryAddress | null;
  orderProducts?: TOrderTotalProduct[] | null;
  progressiveDiscountPercent?: number | null;
  progressiveDiscountSteps?: TProgressiveDiscountStep[] | null;
  salesTaxRate?: number | null;
};

function toValidCents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function toValidQuantity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function resolveTipAmountFromPercentage(
  discountedSubtotal: number,
  tipPercentageValue: number,
) {
  if (!Number.isFinite(discountedSubtotal) || discountedSubtotal <= 0) return 0;
  if (!Number.isFinite(tipPercentageValue) || tipPercentageValue <= 0) return 0;

  const normalizedPercentage =
    tipPercentageValue > 0 && tipPercentageValue <= 1
      ? tipPercentageValue * 100
      : tipPercentageValue;

  return Math.round((discountedSubtotal * normalizedPercentage) / 100);
}

export function calculateOrderTotal(order: TOrderTotalInput | null | undefined) {
  if (!order) return 0;

  const orderProducts = order.orderProducts ?? [];
  const subtotal = orderProducts.reduce((sum, product) => {
    const fullAmountCents = toValidCents(product.fullAmount);
    const amountCents = toValidCents(product.amount);
    const quantity = toValidQuantity(product.quantity);
    const lineUnitAmount = fullAmountCents > 0 ? fullAmountCents : amountCents;
    return sum + lineUnitAmount * quantity;
  }, 0);

  const progressiveDiscountPercentFromSteps = getAppliedProgressiveDiscountPercent(
    getReachedProgressiveSteps(order.progressiveDiscountSteps, subtotal),
  );
  const progressiveDiscountPercent =
    typeof order.progressiveDiscountPercent === "number" &&
    Number.isFinite(order.progressiveDiscountPercent)
      ? Math.max(0, order.progressiveDiscountPercent)
      : progressiveDiscountPercentFromSteps;
  const progressiveDiscountAmount = calculateProgressiveDiscountAmount(
    subtotal,
    progressiveDiscountPercent,
  );
  const discountedSubtotal = Math.max(0, subtotal - progressiveDiscountAmount);

  const taxRate =
    typeof order.salesTaxRate === "number" && Number.isFinite(order.salesTaxRate)
      ? Math.max(0, order.salesTaxRate)
      : 0.065;
  const salesTax = Math.round(discountedSubtotal * taxRate);

  const deliveryFee =
    order.type === "TAKEAWAY" ? 0 : toValidCents(order.deliveryAddress?.deliveryFee ?? 0);

  const tipAmountFromTip = resolveTipAmountFromPercentage(discountedSubtotal, order.tip ?? 0);
  const tipAmountFromTipAmount = toValidCents(order.tipAmount ?? 0);
  const tipAmount =
    tipAmountFromTip > 0 ? tipAmountFromTip : tipAmountFromTipAmount;

  return Math.max(0, discountedSubtotal + deliveryFee + salesTax + tipAmount);
}
