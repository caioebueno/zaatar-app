import Feather from "@expo/vector-icons/Feather";
import { calculateOrderTotal } from "@/utils/orderTotal";
import {
  calculateProgressiveDiscountAmount,
  getAppliedProgressiveDiscountPercent,
  getReachedProgressiveSteps,
} from "@/utils/progressiveDiscount";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type TPaymentMethod = "CASH" | "CARD";
type TOrderType = "DELIVERY" | "TAKEAWAY";
type TModifierGroupType = "SINGLE" | "MULTI" | null;

type TModifierGroupItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  photo?: {
    id: string;
    url: string;
  } | null;
};

type TModifierGroup = {
  id: string;
  title: string;
  required: boolean;
  type: TModifierGroupType;
  minSelection?: number | null;
  maxSelection?: number | null;
  items: TModifierGroupItem[];
};

type TModifierGroupApiShape = TModifierGroup & {
  name?: string;
  modifierGroupId?: string;
  modifierGroupItems?: TModifierGroupItem[];
  modifier_group_items?: TModifierGroupItem[];
};

type TComboSlotOption = {
  productId: string;
  productName: string;
  productTranslations?: Record<string, { title?: string; description?: string }> | null;
  extraPrice?: number | null;
  sortIndex?: number | null;
};

type TComboSlot = {
  id: string;
  name: string;
  translations?: Record<string, { title?: string; description?: string }> | null;
  minSelect: number;
  maxSelect: number;
  allowDuplicates: boolean;
  sortIndex?: number | null;
  options: TComboSlotOption[];
};

type TCategoryApiProduct = {
  id: string;
  name: string;
  description?: string | null;
  itemType?: string | null;
  price: number | null;
  comparedAtPrice?: number | null;
  excludeFromProgressiveDiscount?: boolean;
  categoryIndex?: number | null;
  photos?: {
    id: string;
    url: string;
  }[];
  modifierGroups?: TModifierGroup[];
  comboSlots?: TComboSlot[];
  comboLineItems?: TComboSlot[];
};

type TCategoryApiProductApiShape = TCategoryApiProduct & {
  modifierGroup?: TModifierGroupApiShape[];
  modifier_groups?: TModifierGroupApiShape[];
};

type TCategoryApiItem = {
  id: string;
  title: string;
  menuIndex?: number | null;
  products: TCategoryApiProduct[];
};

type TCategoryApiItemShape = TCategoryApiItem & {
  products?: TCategoryApiProductApiShape[];
};

type TPosExclusivePromotionProduct = {
  id: string;
  name: string;
  itemType?: string | null;
  visible?: boolean | null;
  price?: number | null;
  comparedAtPrice?: number | null;
  translations?: Record<string, { title?: string; description?: string }> | null;
  photos?: {
    id: string;
    url: string;
  }[];
  comboLineItems?: TComboSlot[];
  comboSlots?: TComboSlot[];
};

type TPosExclusivePromotion = {
  id: string;
  name: string;
  active: boolean;
  expireAt?: string | null;
  validWeekdays?: string[];
  availableNow: boolean;
  productIds: string[];
  products: TPosExclusivePromotionProduct[];
};

type TPosExclusivePromotionsResponse = {
  timezone: string;
  at: string;
  weekday: string;
  onlyAvailable: boolean;
  promotions: TPosExclusivePromotion[];
};

type TCategoryTab = {
  id: string;
  title: string;
  count: number;
};

type TCartSelectedModifier = {
  groupId: string;
  groupTitle: string;
  itemId: string;
  itemName: string;
  itemPrice: number;
};

type TCartItem = {
  lineId: string;
  signature: string;
  productId: string;
  product: TCategoryApiProduct;
  quantity: number;
  excludeFromProgressiveDiscount: boolean;
  selectedModifiers: TCartSelectedModifier[];
  comboSelections: TCartComboSelection[];
  comment?: string;
};

type TCartComboSelection = {
  slotId: string;
  slotName: string;
  optionProductId: string;
  optionProductName: string;
  extraPrice: number;
  quantity: number;
};

export type TOrderEditorInitialOrder = {
  id?: string;
  type?: TOrderType;
  paymentMethod?: "CASH" | "CARD" | "ZELLE";
  tip?: number | null;
  tipAmount?: number | null;
  progressiveDiscountAmount?: number | null;
  selectedPrize?: {
    prizeId?: string;
    prizeName?: string;
    quantity?: number;
    selectedProductIds?: string[];
    selectedProductCounts?: {
      productId: string;
      quantity: number;
    }[];
    availableProducts?: {
      id: string;
      name: string;
    }[];
  } | null;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
  } | null;
  deliveryAddress?: {
    id: string;
    description?: string;
    street?: string;
    number?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    complement?: string;
    deliveryFee?: number;
    lat?: string;
    lng?: string;
  } | null;
  orderProducts?: {
    id?: string;
    productId: string;
    quantity?: number;
    amount?: number;
    excludeFromProgressiveDiscount?: boolean;
    product?: {
      id?: string;
      name?: string;
      price?: number | null;
      photos?: {
        id: string;
        url: string;
      }[];
    };
    selectedModifierGroupItems?: {
      id: string;
      name?: string;
      description?: string;
    }[];
    comboSelections?: {
      slotId: string;
      optionProductId: string;
      quantity: number;
      slotName?: string;
      optionProductName?: string;
      extraPrice?: number;
    }[];
    comments?: string;
    comment?: string;
    description?: string;
  }[];
};

type OrderEditorModalProps = {
  visible: boolean;
  apiBaseUrl: string;
  mode: "create" | "update";
  title?: string;
  submitLabel?: string;
  initialOrder?: TOrderEditorInitialOrder | null;
  onSubmitOrder?: (payload: TCreateOrderRequestBody) => Promise<void> | void;
  onSuccess?: () => Promise<void> | void;
  onClose: () => void;
};

type TCustomerAddress = {
  id: string;
  createdAt?: string;
  description?: string | null;
  street?: string;
  number?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  lat?: string;
  lng?: string;
  complement?: string | null;
  numberComplement?: string | null;
  customerId?: string;
  deliveryFee?: number | null;
};

type TCustomerSearchItem = {
  id: string;
  createdAt: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: unknown;
  addresses?: TCustomerAddress[];
};

type TAddressSearchResult = {
  id: string;
  display_name: string;
  lat: number;
  lon: number;
  address?: {
    house_number?: string | null;
    road?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
};

type TSelectedAddress =
  | {
    source: "CUSTOMER";
    id: string;
    displayName: string;
    address: TCustomerAddress;
  }
  | {
    source: "SEARCH";
    id: string;
    displayName: string;
    address: TAddressSearchResult;
  };

type TAddressSearchErrorResponse = {
  error?: string;
};

type TProgressiveDiscountPrize = {
  id: string;
  name: string;
  quantity: number;
  imageUrl?: string | null;
  progressiveDiscountStepId: string;
  products?: {
    id: string;
    name: string;
    price?: number | null;
    comparedAtPrice?: number | null;
    photos?: {
      id: string;
      url: string;
    }[];
  }[];
};

type TProgressiveDiscountStep = {
  id: string;
  type: "PERCENTAGEDISCOUNT" | "GIFT" | string;
  amount: number;
  discount?: number | null;
  prizes?: TProgressiveDiscountPrize[];
};

type TProgressiveDiscount = {
  id: string;
  steps: TProgressiveDiscountStep[];
};

type TCreateOrderRequestBody = {
  cart: {
    items: {
      cartId: string;
      productId: string;
      quantity: number;
      modifiers: {
        modifierId: string;
        modifierItemId: string;
      }[];
      comboSelections?: {
        slotId: string;
        optionProductId: string;
        quantity: number;
      }[];
      description?: string;
    }[];
  };
  customerId: string;
  source?: "POS";
  orderType: TOrderType;
  paymentMethod: TPaymentMethod;
  language?: string;
  addressId?: string;
  scheduleFor?: string;
  tipAmount?: number;
  selectedPrize?: {
    prizeId: string;
    selectedProductIds: string[];
  };
  cupom?: string;
};

type TUpdateOrderRequestBody = {
  paidAt?: string | null;
  paymentMethod?: "CARD" | "CASH" | "ZELLE";
  deliveredAt?: string | null;
  orderType?: TOrderType;
  tipAmount?: number | null;
  customerId?: string | null;
  addressId?: string | null;
  orderProducts?: (
    | {
        id: string;
        remove?: boolean;
        quantity?: number;
        comments?: string | null;
        selectedModifierGroupItemIds?: string[];
        comboSelections?: {
          slotId: string;
          optionProductId: string;
          quantity: number;
        }[];
      }
    | {
        productId: string;
        quantity?: number;
        comments?: string | null;
        selectedModifierGroupItemIds?: string[];
        comboSelections?: {
          slotId: string;
          optionProductId: string;
          quantity: number;
        }[];
      }
  )[];
};

type TCreateOrderErrorResponse = {
  error?: string;
  field?: string;
  reason?: string;
};

type TCreateCustomerErrorResponse = {
  error?: string;
  field?: string;
};

type TCountryCodeOption = {
  code: string;
  label: string;
};

const ALL_CATEGORY_ID = "ALL_PRODUCTS";
const PRODUCT_GRID_HORIZONTAL_PADDING = 24;
const PRODUCT_GRID_GAP = 12;
const PRODUCT_CARD_MIN_WIDTH = 170;
const SALES_TAX_RATE = 0.065;
const DEFAULT_COUNTRY_CODE = "+1";
const COUNTRY_CODE_OPTIONS: TCountryCodeOption[] = [
  { code: "+1", label: "US/CA (+1)" },
  { code: "+55", label: "BR (+55)" },
  { code: "+52", label: "MX (+52)" },
  { code: "+351", label: "PT (+351)" },
];

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function formatCurrency(amountInCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, amountInCents) / 100);
}

function sanitizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function resolvePhoneCountryCode(rawPhone: string | null | undefined) {
  const normalizedPhone = typeof rawPhone === "string" ? rawPhone.trim() : "";
  if (!normalizedPhone) {
    return {
      countryCode: DEFAULT_COUNTRY_CODE,
      localNumber: "",
    };
  }

  const matchedCountryCode = COUNTRY_CODE_OPTIONS.find((option) =>
    normalizedPhone.startsWith(option.code),
  );

  if (!matchedCountryCode) {
    return {
      countryCode: DEFAULT_COUNTRY_CODE,
      localNumber: sanitizePhoneDigits(normalizedPhone),
    };
  }

  return {
    countryCode: matchedCountryCode.code,
    localNumber: sanitizePhoneDigits(normalizedPhone.slice(matchedCountryCode.code.length)),
  };
}

function buildPhoneWithCountryCode(countryCode: string, localNumber: string) {
  const normalizedCountryCode = countryCode.trim() || DEFAULT_COUNTRY_CODE;
  const digits = sanitizePhoneDigits(localNumber);
  if (!digits) return "";
  return `${normalizedCountryCode}${digits}`;
}

function formatCurrencyInputValue(amountInCents: number) {
  const normalized = Math.max(0, Math.round(amountInCents || 0));
  return (normalized / 100).toFixed(2);
}

function normalizeCurrencyInput(rawValue: string) {
  const cleaned = rawValue.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
  if (!cleaned) return "";

  const parts = cleaned.split(".");
  const integerPartRaw = (parts[0] ?? "").replace(/^0+(?=\d)/, "");
  const integerPart = integerPartRaw.length > 0 ? integerPartRaw : "0";
  const decimalPart = parts.slice(1).join("").slice(0, 2);

  if (parts.length === 1) return integerPart;
  if (decimalPart.length === 0) return `${integerPart}.`;
  return `${integerPart}.${decimalPart}`;
}

function parseCurrencyInputToCents(inputValue: string) {
  const normalized = normalizeCurrencyInput(inputValue);
  if (!normalized || normalized === ".") return 0;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return Math.round(parsed * 100);
}

function calculateTipAmountFromPercentage(subtotalInCents: number, tipPercentageValue: number) {
  if (!Number.isFinite(subtotalInCents) || subtotalInCents <= 0) return 0;
  if (!Number.isFinite(tipPercentageValue) || tipPercentageValue <= 0) return 0;

  const normalizedPercentage =
    tipPercentageValue > 0 && tipPercentageValue <= 1 ? tipPercentageValue * 100 : tipPercentageValue;

  return Math.round((subtotalInCents * normalizedPercentage) / 100);
}

function getProductBasePrice(product: TCategoryApiProduct) {
  return typeof product.price === "number" && Number.isFinite(product.price) ? product.price : 0;
}

function getProductImageUrl(product: TCategoryApiProduct) {
  return product.photos?.[0]?.url;
}

function getProductLabel(product: TCategoryApiProduct) {
  return product.name || "Produto";
}

function getCategoryProductById(
  categories: TCategoryApiItem[],
  productId: string,
): TCategoryApiProduct | null {
  for (const category of categories) {
    const found = (category.products ?? []).find((product) => product.id === productId);
    if (found) return found;
  }
  return null;
}

function getNormalizedSelectedIds(
  selectedByGroup: Record<string, string[]>,
  groupId: string,
): string[] {
  return [...(selectedByGroup[groupId] ?? [])].sort();
}

function buildModifierSignature(
  product: TCategoryApiProduct,
  selectedByGroup: Record<string, string[]>,
  comment?: string,
) {
  const groups = (product.modifierGroups ?? [])
    .filter((group) => (group.items?.length ?? 0) > 0)
    .map((group) => `${group.id}:${getNormalizedSelectedIds(selectedByGroup, group.id).join(",")}`)
    .sort();

  const normalizedComment = (comment ?? "").trim().replace(/\s+/g, " ");
  return `${product.id}__${groups.join("|")}__comment:${normalizedComment}`;
}

function isProductExcludedFromProgressiveDiscount(product: TCategoryApiProduct | null | undefined) {
  return !!product?.excludeFromProgressiveDiscount;
}

function buildCartItemSignature(
  product: TCategoryApiProduct,
  selectedByGroup: Record<string, string[]>,
  comboSelectionsBySlot: Record<string, Record<string, number>>,
  comment?: string,
) {
  const modifierSignature = buildModifierSignature(product, selectedByGroup, comment);
  const comboSignature = getComboSelectionsSignature(comboSelectionsBySlot, product.comboSlots);
  return `${modifierSignature}__combo:${comboSignature}__deal:${isProductExcludedFromProgressiveDiscount(product) ? 1 : 0}`;
}

function getSelectionBounds(group: TModifierGroup) {
  const minSelection =
    typeof group.minSelection === "number" && group.minSelection >= 0
      ? group.minSelection
      : group.required
        ? 1
        : 0;

  const maxSelection =
    typeof group.maxSelection === "number" && group.maxSelection > 0
      ? group.maxSelection
      : group.type === "SINGLE"
        ? 1
        : Number.MAX_SAFE_INTEGER;

  return {
    minSelection,
    maxSelection,
  };
}

function getSelectedModifiers(
  product: TCategoryApiProduct,
  selectedByGroup: Record<string, string[]>,
): TCartSelectedModifier[] {
  const groups = product.modifierGroups ?? [];

  return groups.flatMap((group) => {
    const selectedSet = new Set(selectedByGroup[group.id] ?? []);

    return (group.items ?? [])
      .filter((item) => selectedSet.has(item.id))
      .map((item) => ({
        groupId: group.id,
        groupTitle: group.title,
        itemId: item.id,
        itemName: item.name,
        itemPrice:
          typeof item.price === "number" && Number.isFinite(item.price) ? item.price : 0,
      }));
  });
}

function mapImportedSelectedModifiers(
  selectedModifierItems: { id: string; name?: string; description?: string }[] | undefined,
  modifierGroups: TModifierGroup[] | undefined,
): TCartSelectedModifier[] {
  const groups = modifierGroups ?? [];

  return (selectedModifierItems ?? []).map((modifierItem) => {
    const fallbackName = modifierItem.description ?? modifierItem.name ?? "Modifier";

    for (const group of groups) {
      const foundItem = (group.items ?? []).find((item) => item.id === modifierItem.id);
      if (!foundItem) continue;

      return {
        groupId: group.id,
        groupTitle: group.title,
        itemId: foundItem.id,
        itemName: foundItem.name,
        itemPrice:
          typeof foundItem.price === "number" && Number.isFinite(foundItem.price)
            ? foundItem.price
            : 0,
      } satisfies TCartSelectedModifier;
    }

    return {
      groupId: "imported",
      groupTitle: "Modifier",
      itemId: modifierItem.id,
      itemName: fallbackName,
      itemPrice: 0,
    } satisfies TCartSelectedModifier;
  });
}

function remapSelectedModifiersWithGroups(
  selectedModifiers: TCartSelectedModifier[],
  modifierGroups: TModifierGroup[] | undefined,
) {
  const groups = modifierGroups ?? [];
  let hasChanged = false;

  const nextSelectedModifiers = selectedModifiers.map((selectedModifier) => {
    for (const group of groups) {
      const foundItem = (group.items ?? []).find((item) => item.id === selectedModifier.itemId);
      if (!foundItem) continue;

      const nextModifier: TCartSelectedModifier = {
        groupId: group.id,
        groupTitle: group.title,
        itemId: foundItem.id,
        itemName: foundItem.name,
        itemPrice:
          typeof foundItem.price === "number" && Number.isFinite(foundItem.price)
            ? foundItem.price
            : 0,
      };

      if (
        nextModifier.groupId !== selectedModifier.groupId ||
        nextModifier.groupTitle !== selectedModifier.groupTitle ||
        nextModifier.itemName !== selectedModifier.itemName ||
        nextModifier.itemPrice !== selectedModifier.itemPrice
      ) {
        hasChanged = true;
      }

      return nextModifier;
    }

    return selectedModifier;
  });

  return {
    selectedModifiers: nextSelectedModifiers,
    hasChanged,
  };
}

function getCartItemUnitPrice(item: TCartItem) {
  const base = getProductBasePrice(item.product);
  const modifiers = item.selectedModifiers.reduce(
    (total, modifier) => total + modifier.itemPrice,
    0,
  );
  const comboExtras = item.comboSelections.reduce(
    (total, selection) => total + selection.extraPrice * selection.quantity,
    0,
  );

  return base + modifiers + comboExtras;
}

function getSelectedByGroupFromCartItem(item: TCartItem) {
  return item.selectedModifiers.reduce<Record<string, string[]>>((acc, modifier) => {
    if (!acc[modifier.groupId]) {
      acc[modifier.groupId] = [];
    }

    acc[modifier.groupId].push(modifier.itemId);
    return acc;
  }, {});
}

function getComboSlots(product: TCategoryApiProduct) {
  return [...(product.comboSlots ?? [])].sort(
    (first, second) => (first.sortIndex ?? 0) - (second.sortIndex ?? 0),
  );
}

function getComboSlotTitle(slot: TComboSlot) {
  const locale = getCurrentLanguage();
  return slot.translations?.[locale]?.title ?? slot.translations?.en?.title ?? slot.name;
}

function getComboOptionTitle(option: TComboSlotOption) {
  const locale = getCurrentLanguage();
  return (
    option.productTranslations?.[locale]?.title ??
    option.productTranslations?.en?.title ??
    option.productName
  );
}

function getComboSelectionsSignature(
  selectionsBySlot: Record<string, Record<string, number>>,
  comboSlots: TComboSlot[] | undefined,
) {
  const slots = [...(comboSlots ?? [])].sort(
    (first, second) => (first.sortIndex ?? 0) - (second.sortIndex ?? 0),
  );

  return slots
    .map((slot) => {
      const optionCounts = selectionsBySlot[slot.id] ?? {};
      const serialized = Object.entries(optionCounts)
        .filter(([, quantity]) => quantity > 0)
        .sort(([firstId], [secondId]) => firstId.localeCompare(secondId))
        .map(([optionId, quantity]) => `${optionId}:${quantity}`)
        .join(",");

      return `${slot.id}[${serialized}]`;
    })
    .join("|");
}

function getSelectedComboEntries(
  product: TCategoryApiProduct,
  comboSelectionsBySlot: Record<string, Record<string, number>>,
): TCartComboSelection[] {
  return getComboSlots(product).flatMap((slot) => {
    const optionCounts = comboSelectionsBySlot[slot.id] ?? {};

    return slot.options.flatMap((option) => {
      const quantity = Math.max(0, Math.round(optionCounts[option.productId] ?? 0));
      if (quantity <= 0) return [];

      return [
        {
          slotId: slot.id,
          slotName: getComboSlotTitle(slot),
          optionProductId: option.productId,
          optionProductName: getComboOptionTitle(option),
          extraPrice:
            typeof option.extraPrice === "number" && Number.isFinite(option.extraPrice)
              ? option.extraPrice
              : 0,
          quantity,
        } satisfies TCartComboSelection,
      ];
    });
  });
}

function getSelectedByGroupForProductFromCartItem(
  item: TCartItem,
  product: TCategoryApiProduct,
) {
  const groups = product.modifierGroups ?? [];
  const selectedByGroup: Record<string, string[]> = groups.reduce<Record<string, string[]>>(
    (acc, group) => {
      acc[group.id] = [];
      return acc;
    },
    {},
  );

  for (const selectedModifier of item.selectedModifiers) {
    const directGroup = groups.find(
      (group) =>
        group.id === selectedModifier.groupId &&
        (group.items ?? []).some((groupItem) => groupItem.id === selectedModifier.itemId),
    );
    if (directGroup) {
      selectedByGroup[directGroup.id].push(selectedModifier.itemId);
      continue;
    }

    const inferredGroup = groups.find((group) =>
      (group.items ?? []).some((groupItem) => groupItem.id === selectedModifier.itemId),
    );
    if (inferredGroup) {
      selectedByGroup[inferredGroup.id].push(selectedModifier.itemId);
    }
  }

  for (const group of groups) {
    selectedByGroup[group.id] = Array.from(new Set(selectedByGroup[group.id] ?? []));
  }

  return selectedByGroup;
}

function getComboSelectionsBySlotFromCartItem(item: TCartItem) {
  return item.comboSelections.reduce<Record<string, Record<string, number>>>((acc, selection) => {
    if (!acc[selection.slotId]) {
      acc[selection.slotId] = {};
    }

    acc[selection.slotId][selection.optionProductId] =
      (acc[selection.slotId][selection.optionProductId] ?? 0) + Math.max(1, selection.quantity);

    return acc;
  }, {});
}

function formatCustomerAddress(address: TCustomerAddress) {
  const streetLine = [address.street, address.number].filter(Boolean).join(" ");
  const cityLine = [address.city, address.state, address.zipCode].filter(Boolean).join(", ");
  const complement = address.complement ?? address.numberComplement ?? "";
  const description = address.description?.trim();

  return [description, streetLine, cityLine, complement].filter(Boolean).join(" • ");
}

function formatAddressSearchResult(address: TAddressSearchResult) {
  const lineFromFields = [
    [address.address?.house_number, address.address?.road].filter(Boolean).join(" "),
    [address.address?.city, address.address?.state, address.address?.postcode]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" • ");

  return lineFromFields || address.display_name;
}

function getCurrentLanguage() {
  if (typeof navigator !== "undefined" && navigator.language) {
    const normalized = navigator.language.toLowerCase();
    if (normalized.startsWith("pt")) return "pt";
    if (normalized.startsWith("es")) return "es";
    return "en";
  }

  return "en";
}

function normalizeModifierItem(rawItem: unknown): TModifierGroupItem | null {
  if (!rawItem || typeof rawItem !== "object") return null;
  const raw = rawItem as {
    id?: string;
    name?: string;
    title?: string;
    description?: string | null;
    price?: number;
    translations?: Record<string, { title?: string }>;
    photo?: { id: string; url: string } | null;
    modifierGroupItemId?: string;
    modifier_group_item_id?: string;
    modifierGroupItem?: {
      id?: string;
      name?: string;
      title?: string;
      description?: string | null;
      price?: number;
      translations?: Record<string, { title?: string }>;
      photo?: { id: string; url: string } | null;
    };
  };

  const nested = raw.modifierGroupItem;
  const id = nested?.id ?? raw.id ?? raw.modifierGroupItemId ?? raw.modifier_group_item_id;
  if (!id) return null;

  const name =
    nested?.name ??
    nested?.title ??
    nested?.translations?.en?.title ??
    raw.name ??
    raw.title ??
    raw.translations?.en?.title ??
    "Modifier";
  const description = nested?.description ?? raw.description ?? null;
  const priceCandidate =
    typeof raw.price === "number"
      ? raw.price
      : typeof nested?.price === "number"
        ? nested.price
        : 0;
  const price = Number.isFinite(priceCandidate) ? priceCandidate : 0;
  const photo = nested?.photo ?? raw.photo ?? null;

  return {
    id,
    name,
    description,
    price,
    photo,
  };
}

function normalizeModifierGroups(product: TCategoryApiProductApiShape): TModifierGroup[] {
  const productAny = product as Record<string, unknown>;
  const discoveredGroups =
    Object.entries(productAny).find(([key, value]) => {
      if (!Array.isArray(value)) return false;
      const normalizedKey = key.toLowerCase();
      return normalizedKey.includes("modifier") && normalizedKey.includes("group");
    })?.[1] ?? [];

  const rawGroups: TModifierGroupApiShape[] =
    (product.modifierGroups as TModifierGroupApiShape[] | undefined) ??
    product.modifierGroup ??
    product.modifier_groups ??
    (discoveredGroups as TModifierGroupApiShape[]) ??
    [];

  return rawGroups.map((group) => {
    const groupAny = group as Record<string, unknown>;
    const discoveredItems =
      Object.entries(groupAny).find(([key, value]) => {
        if (!Array.isArray(value)) return false;
        const normalizedKey = key.toLowerCase();
        return normalizedKey.includes("item");
      })?.[1] ?? [];

    const rawItems =
      group.items ??
      group.modifierGroupItems ??
      group.modifier_group_items ??
      (discoveredItems as TModifierGroupItem[]) ??
      [];
    const items = rawItems
      .map((item) => normalizeModifierItem(item))
      .filter((item): item is TModifierGroupItem => Boolean(item));

    const inferredRequired =
      typeof group.required === "boolean"
        ? group.required
        : typeof group.minSelection === "number" && group.minSelection > 0;

    return {
      id: group.id ?? group.modifierGroupId ?? generateUuid(),
      title: group.title ?? group.name ?? "Modifier group",
      required: inferredRequired,
      type: group.type === "SINGLE" || group.type === "MULTI" ? group.type : null,
      minSelection:
        typeof group.minSelection === "number" ? group.minSelection : null,
      maxSelection:
        typeof group.maxSelection === "number" ? group.maxSelection : null,
      items,
    };
  });
}

function normalizeComboSlots(product: TCategoryApiProductApiShape): TComboSlot[] {
  const rawSlots = product.comboSlots ?? product.comboLineItems ?? [];

  return rawSlots
    .map((slot) => ({
      id: slot.id,
      name: slot.name,
      translations: slot.translations ?? null,
      minSelect:
        typeof slot.minSelect === "number" && Number.isFinite(slot.minSelect)
          ? slot.minSelect
          : 0,
      maxSelect:
        typeof slot.maxSelect === "number" && Number.isFinite(slot.maxSelect)
          ? slot.maxSelect
          : 0,
      allowDuplicates: !!slot.allowDuplicates,
      sortIndex:
        typeof slot.sortIndex === "number" && Number.isFinite(slot.sortIndex)
          ? slot.sortIndex
          : 0,
      options: [...(slot.options ?? [])]
        .map((option) => ({
          productId: option.productId,
          productName: option.productName,
          productTranslations: option.productTranslations ?? null,
          extraPrice:
            typeof option.extraPrice === "number" && Number.isFinite(option.extraPrice)
              ? option.extraPrice
              : 0,
          sortIndex:
            typeof option.sortIndex === "number" && Number.isFinite(option.sortIndex)
              ? option.sortIndex
              : 0,
        }))
        .sort((first, second) => (first.sortIndex ?? 0) - (second.sortIndex ?? 0)),
    }))
    .filter((slot) => slot.options.length > 0)
    .sort((first, second) => (first.sortIndex ?? 0) - (second.sortIndex ?? 0));
}

function getRenderableModifierGroups(product: TCategoryApiProduct | null): TModifierGroup[] {
  if (!product) return [];

  const productAny = product as Record<string, unknown>;
  const rawGroupsFromProduct = [
    ...(Array.isArray(productAny.modifierGroups)
      ? (productAny.modifierGroups as Record<string, unknown>[])
      : []),
    ...(Array.isArray(productAny.modifierGroup)
      ? (productAny.modifierGroup as Record<string, unknown>[])
      : []),
    ...(Array.isArray(productAny.modifier_groups)
      ? (productAny.modifier_groups as Record<string, unknown>[])
      : []),
  ];

  const normalized = normalizeModifierGroups(product as TCategoryApiProductApiShape).filter(
    (group) => (group.items?.length ?? 0) > 0,
  );
  if (normalized.length > 0) return normalized;

  return rawGroupsFromProduct
    .map((group, groupIndex) => {
      const rawItems = Array.isArray(group.items) ? (group.items as Record<string, unknown>[]) : [];
      const items = rawItems
        .map((item, itemIndex) => {
          const id =
            (typeof item.id === "string" && item.id) ||
            `modifier-item-${groupIndex}-${itemIndex}`;
          const name =
            (typeof item.name === "string" && item.name) ||
            (typeof item.description === "string" && item.description) ||
            "Modifier";
          const priceCandidate = typeof item.price === "number" ? item.price : 0;

          return {
            id,
            name,
            description:
              typeof item.description === "string" ? item.description : null,
            price: Number.isFinite(priceCandidate) ? priceCandidate : 0,
            photo:
              item.photo && typeof item.photo === "object"
                ? (item.photo as { id: string; url: string })
                : null,
          } as TModifierGroupItem;
        })
        .filter(Boolean);

      const minSelection =
        typeof group.minSelection === "number" ? group.minSelection : null;
      const maxSelection =
        typeof group.maxSelection === "number" ? group.maxSelection : null;

      return {
        id:
          (typeof group.id === "string" && group.id) ||
          `modifier-group-${groupIndex}`,
        title:
          (typeof group.title === "string" && group.title) ||
          (typeof group.name === "string" && group.name) ||
          "Modifier group",
        required:
          typeof group.required === "boolean"
            ? group.required
            : typeof minSelection === "number" && minSelection > 0,
        type:
          group.type === "SINGLE" || group.type === "MULTI"
            ? (group.type as TModifierGroupType)
            : null,
        minSelection,
        maxSelection,
        items,
      } as TModifierGroup;
    })
    .filter((group) => group.items.length > 0);
}

export default function OrderEditorModal({
  visible,
  apiBaseUrl,
  mode,
  title,
  submitLabel,
  initialOrder,
  onSubmitOrder,
  onSuccess,
  onClose,
}: OrderEditorModalProps) {
  const [categories, setCategories] = useState<TCategoryApiItem[]>([]);
  const [promotions, setPromotions] = useState<TPosExclusivePromotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_CATEGORY_ID);
  const [cartItems, setCartItems] = useState<TCartItem[]>([]);
  const [orderType, setOrderType] = useState<TOrderType>("DELIVERY");
  const [paymentMethod, setPaymentMethod] = useState<TPaymentMethod>("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<TCustomerSearchItem | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<TSelectedAddress | null>(null);
  const [isCustomerSearchModalOpen, setIsCustomerSearchModalOpen] = useState(false);
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [isAddressSelectorModalOpen, setIsAddressSelectorModalOpen] = useState(false);
  const [customerPhoneInput, setCustomerPhoneInput] = useState("");
  const [customerPhoneCountryCode, setCustomerPhoneCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [isCustomerPhoneCountryCodeSelectorOpen, setIsCustomerPhoneCountryCodeSelectorOpen] =
    useState(false);
  const [customerCreatePhoneInput, setCustomerCreatePhoneInput] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [customerSearchResults, setCustomerSearchResults] = useState<TCustomerSearchItem[]>([]);
  const [customerCreateNameInput, setCustomerCreateNameInput] = useState("");
  const [customerCreateLoading, setCustomerCreateLoading] = useState(false);
  const [customerCreateError, setCustomerCreateError] = useState<string | null>(null);
  const [addressSearchInput, setAddressSearchInput] = useState("");
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [addressSearchResults, setAddressSearchResults] = useState<TAddressSearchResult[]>([]);
  const [tipInput, setTipInput] = useState("");
  const [tipPercentageFromOrder, setTipPercentageFromOrder] = useState<number | null>(null);
  const [hasManualTipEdit, setHasManualTipEdit] = useState(false);
  const [progressiveDiscount, setProgressiveDiscount] = useState<TProgressiveDiscount | null>(null);
  const [createOrderLoading, setCreateOrderLoading] = useState(false);
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  const [productsGridWidth, setProductsGridWidth] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [modifierProduct, setModifierProduct] = useState<TCategoryApiProduct | null>(null);
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});
  const [comboSelectionsBySlot, setComboSelectionsBySlot] = useState<
    Record<string, Record<string, number>>
  >({});
  const [itemComment, setItemComment] = useState("");
  const [editingCartItemLineId, setEditingCartItemLineId] = useState<string | null>(null);
  const [modifierValidationError, setModifierValidationError] = useState<string | null>(null);
  const renderableModifierGroups = useMemo(
    () => getRenderableModifierGroups(modifierProduct),
    [modifierProduct],
  );
  const promotionProductIds = useMemo(
    () =>
      new Set(
        promotions.flatMap((promotion) => promotion.products.map((product) => product.id)),
      ),
    [promotions],
  );
  const tipAmount = useMemo(() => parseCurrencyInputToCents(tipInput), [tipInput]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const loadCategories = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${apiBaseUrl}/categories`);
        if (!response.ok) {
          throw new Error("Falha ao carregar categorias");
        }

        const responseBody = (await response.json()) as TCategoryApiItemShape[];
        const data: TCategoryApiItem[] = (responseBody ?? []).map((category) => ({
          ...category,
          products: (category.products ?? []).map((product) => {
            const normalizedGroups = normalizeModifierGroups(product);
            const normalizedComboSlots = normalizeComboSlots(product);
            const rawGroups = Array.isArray(
              (product as Record<string, unknown>).modifierGroups,
            )
              ? ((product as Record<string, unknown>).modifierGroups as TModifierGroup[])
              : [];

            return {
              ...product,
              modifierGroups: normalizedGroups.length > 0 ? normalizedGroups : rawGroups,
              comboSlots: normalizedComboSlots,
            };
          }),
        }));
        if (cancelled) return;
        setCategories(data);
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar categorias";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const loadPromotions = async () => {
      try {
        setPromotionsLoading(true);
        setPromotionsError(null);

        const response = await fetch(`${apiBaseUrl}/pos/exclusive-promotions`);
        if (!response.ok) {
          throw new Error("Falha ao carregar promoções");
        }

        const responseBody = (await response.json()) as TPosExclusivePromotionsResponse | null;
        if (cancelled) return;
        setPromotions(responseBody?.promotions ?? []);
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar promoções";
        setPromotionsError(message);
      } finally {
        if (!cancelled) {
          setPromotionsLoading(false);
        }
      }
    };

    void loadCategories();
    void loadPromotions();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, visible]);

  useEffect(() => {
    if (!visible) return;

    if (mode === "update" && initialOrder) {
      const normalizedPaymentMethod =
        initialOrder.paymentMethod === "CASH" ? "CASH" : "CARD";

      const mappedCartItems: TCartItem[] = (initialOrder.orderProducts ?? []).map(
        (orderProduct, index) => {
          const categoryProduct = getCategoryProductById(categories, orderProduct.productId);
          const fallbackQuantity =
            typeof orderProduct.quantity === "number" && orderProduct.quantity > 0
              ? orderProduct.quantity
              : 1;
          const inferredUnitPrice =
            typeof orderProduct.product?.price === "number" &&
            Number.isFinite(orderProduct.product.price)
              ? orderProduct.product.price
              : typeof categoryProduct?.price === "number" &&
                  Number.isFinite(categoryProduct.price)
                ? categoryProduct.price
                : typeof orderProduct.amount === "number" && Number.isFinite(orderProduct.amount)
                  ? Math.round(orderProduct.amount)
                  : 0;

          const resolvedName =
            orderProduct.product?.name?.trim() ||
            categoryProduct?.name?.trim() ||
            "Item";

          const mappedProduct: TCategoryApiProduct = {
            id: orderProduct.productId,
            name: resolvedName,
            itemType: categoryProduct?.itemType ?? null,
            price: inferredUnitPrice,
            excludeFromProgressiveDiscount:
              orderProduct.excludeFromProgressiveDiscount ??
              promotionProductIds.has(orderProduct.productId),
            photos:
              (orderProduct.product?.photos ?? []).length > 0
                ? orderProduct.product?.photos
                : categoryProduct?.photos ?? [],
            modifierGroups: categoryProduct?.modifierGroups ?? [],
            comboSlots: categoryProduct?.comboSlots ?? [],
          };

          const mappedModifiers: TCartSelectedModifier[] = mapImportedSelectedModifiers(
            orderProduct.selectedModifierGroupItems,
            mappedProduct.modifierGroups,
          );

          return {
            lineId: orderProduct.id ?? generateUuid(),
            signature: `${orderProduct.productId}__imported__${index}`,
            productId: orderProduct.productId,
            product: mappedProduct,
            quantity: fallbackQuantity,
            excludeFromProgressiveDiscount: isProductExcludedFromProgressiveDiscount(mappedProduct),
            selectedModifiers: mappedModifiers,
            comboSelections: (orderProduct.comboSelections ?? []).map((selection) => ({
              slotId: selection.slotId,
              slotName: selection.slotName ?? "Combo",
              optionProductId: selection.optionProductId,
              optionProductName: selection.optionProductName ?? selection.optionProductId,
              extraPrice:
                typeof selection.extraPrice === "number" && Number.isFinite(selection.extraPrice)
                  ? selection.extraPrice
                  : 0,
              quantity:
                typeof selection.quantity === "number" && selection.quantity > 0
                  ? Math.round(selection.quantity)
                  : 1,
            })),
            comment:
              orderProduct.comments ?? orderProduct.comment ?? orderProduct.description,
          };
        },
      );
      const mappedSubtotal = mappedCartItems.reduce(
        (total, item) => total + item.quantity * getCartItemUnitPrice(item),
        0,
      );
      const mappedEligibleSubtotal = mappedCartItems.reduce(
        (total, item) =>
          item.excludeFromProgressiveDiscount
            ? total
            : total + item.quantity * getCartItemUnitPrice(item),
        0,
      );
      const initialTipPercentage =
        typeof initialOrder.tip === "number" && Number.isFinite(initialOrder.tip)
          ? initialOrder.tip
          : null;
      const initialProgressiveDiscountAmount =
        typeof initialOrder.progressiveDiscountAmount === "number" &&
        Number.isFinite(initialOrder.progressiveDiscountAmount)
          ? Math.max(0, Math.round(initialOrder.progressiveDiscountAmount))
          : calculateProgressiveDiscountAmount(
              mappedEligibleSubtotal,
              getAppliedProgressiveDiscountPercent(
                getReachedProgressiveSteps(progressiveDiscount?.steps, mappedEligibleSubtotal),
              ),
            );
      const discountedSubtotal = Math.max(0, mappedSubtotal - initialProgressiveDiscountAmount);
      const tipFromPercentage = calculateTipAmountFromPercentage(
        discountedSubtotal,
        initialTipPercentage ?? 0,
      );
      const tipFromAmount =
        typeof initialOrder.tipAmount === "number" && Number.isFinite(initialOrder.tipAmount)
          ? Math.max(0, Math.round(initialOrder.tipAmount))
          : 0;
      const initialTipAmount = tipFromPercentage > 0 ? tipFromPercentage : tipFromAmount;

      setOrderType(initialOrder.type ?? "DELIVERY");
      setPaymentMethod(normalizedPaymentMethod);
      setTipInput(initialTipAmount > 0 ? formatCurrencyInputValue(initialTipAmount) : "");
      setTipPercentageFromOrder(initialTipPercentage);
      setHasManualTipEdit(false);
      setSelectedCustomer(
        initialOrder.customer
          ? {
              id: initialOrder.customer.id,
              createdAt: "",
              name: initialOrder.customer.name,
              phone: initialOrder.customer.phone,
              addresses: [],
            }
          : null,
      );

      if (initialOrder.type === "DELIVERY" && initialOrder.deliveryAddress) {
        setSelectedAddress({
          source: "CUSTOMER",
          id: initialOrder.deliveryAddress.id,
          displayName:
            formatCustomerAddress(initialOrder.deliveryAddress) ||
            "Delivery address",
          address: initialOrder.deliveryAddress,
        });
      } else {
        setSelectedAddress(null);
      }

      setCartItems(mappedCartItems);
      setSelectedCategoryId(ALL_CATEGORY_ID);
      setCreateOrderError(null);
      setIsCustomerSearchModalOpen(false);
      setIsCreateCustomerModalOpen(false);
      setIsAddressSelectorModalOpen(false);
      setCustomerPhoneInput("");
      setCustomerPhoneCountryCode(DEFAULT_COUNTRY_CODE);
      setIsCustomerPhoneCountryCodeSelectorOpen(false);
      setCustomerCreatePhoneInput("");
      setCustomerCreateNameInput("");
      setCustomerCreateError(null);
      setAddressSearchInput("");
      setEditingCartItemLineId(null);
      return;
    }

    if (mode === "create") {
      setCartItems([]);
      setSelectedProductId(null);
      setModifierProduct(null);
      setModifierSelections({});
      setItemComment("");
      setModifierValidationError(null);
      setOrderType("DELIVERY");
      setPaymentMethod("CASH");
      setSelectedCustomer(null);
      setSelectedAddress(null);
      setIsCustomerSearchModalOpen(false);
      setIsCreateCustomerModalOpen(false);
      setIsAddressSelectorModalOpen(false);
      setCustomerPhoneInput("");
      setCustomerPhoneCountryCode(DEFAULT_COUNTRY_CODE);
      setIsCustomerPhoneCountryCodeSelectorOpen(false);
      setCustomerCreatePhoneInput("");
      setCustomerSearchError(null);
      setCustomerSearchResults([]);
      setCustomerCreateNameInput("");
      setCustomerCreateError(null);
      setAddressSearchInput("");
      setAddressSearchError(null);
      setAddressSearchResults([]);
      setTipInput("");
      setTipPercentageFromOrder(null);
      setHasManualTipEdit(false);
      setEditingCartItemLineId(null);
      setCreateOrderError(null);
      setSelectedCategoryId(ALL_CATEGORY_ID);
    }
  }, [categories, initialOrder, mode, progressiveDiscount?.steps, promotionProductIds, visible]);

  useEffect(() => {
    if (!visible || mode !== "update") return;
    if (tipPercentageFromOrder === null || hasManualTipEdit) return;

    const cartSubtotal = cartItems.reduce(
      (total, item) => total + item.quantity * getCartItemUnitPrice(item),
      0,
    );
    const eligibleSubtotal = cartItems.reduce(
      (total, item) =>
        item.excludeFromProgressiveDiscount
          ? total
          : total + item.quantity * getCartItemUnitPrice(item),
      0,
    );
    const reachedSteps = getReachedProgressiveSteps(progressiveDiscount?.steps, eligibleSubtotal);
    const discountPercent = getAppliedProgressiveDiscountPercent(reachedSteps);
    const discountAmount = calculateProgressiveDiscountAmount(eligibleSubtotal, discountPercent);
    const discountedSubtotal = Math.max(0, cartSubtotal - discountAmount);
    const computedTipAmount = calculateTipAmountFromPercentage(
      discountedSubtotal,
      tipPercentageFromOrder,
    );
    setTipInput(computedTipAmount > 0 ? formatCurrencyInputValue(computedTipAmount) : "");
  }, [
    cartItems,
    hasManualTipEdit,
    mode,
    progressiveDiscount?.steps,
    tipPercentageFromOrder,
    visible,
  ]);

  useEffect(() => {
    if (!visible || mode !== "update") return;
    if (categories.length === 0) return;

    setCartItems((previous) =>
      previous.map((item) => {
        const categoryProduct = getCategoryProductById(categories, item.productId);
        if (!categoryProduct) return item;

        const resolvedName = item.product.name?.trim() || categoryProduct.name?.trim() || "Item";
        const resolvedPrice =
          typeof categoryProduct.price === "number" && Number.isFinite(categoryProduct.price)
            ? categoryProduct.price
            : typeof item.product.price === "number" && Number.isFinite(item.product.price)
              ? item.product.price
              : 0;
        const resolvedPhotos =
          (item.product.photos ?? []).length > 0
            ? item.product.photos
            : categoryProduct.photos ?? [];
        const resolvedModifierGroups =
          (item.product.modifierGroups ?? []).length > 0
            ? item.product.modifierGroups
            : categoryProduct.modifierGroups ?? [];
        const resolvedComboSlots =
          (item.product.comboSlots ?? []).length > 0
            ? item.product.comboSlots
            : categoryProduct.comboSlots ?? [];
        const remappedModifiers = remapSelectedModifiersWithGroups(
          item.selectedModifiers,
          resolvedModifierGroups,
        );

        const hasChanged =
          resolvedName !== item.product.name ||
          resolvedPrice !== item.product.price ||
          resolvedPhotos !== item.product.photos ||
          resolvedModifierGroups !== item.product.modifierGroups ||
          resolvedComboSlots !== item.product.comboSlots ||
          remappedModifiers.hasChanged;

        if (!hasChanged) return item;

        const normalizedComment = item.comment?.trim() ?? "";
        const nextSelectedByGroup = remappedModifiers.selectedModifiers.reduce<
          Record<string, string[]>
        >((acc, selectedModifier) => {
          if (!acc[selectedModifier.groupId]) {
            acc[selectedModifier.groupId] = [];
          }
          acc[selectedModifier.groupId].push(selectedModifier.itemId);
          return acc;
        }, {});
        const nextSignature = buildCartItemSignature(
          {
            ...item.product,
            modifierGroups: resolvedModifierGroups,
            comboSlots: resolvedComboSlots,
          },
          nextSelectedByGroup,
          getComboSelectionsBySlotFromCartItem(item),
          normalizedComment,
        );

        return {
          ...item,
          signature: nextSignature,
          selectedModifiers: remappedModifiers.selectedModifiers,
          product: {
            ...item.product,
            name: resolvedName,
            price: resolvedPrice,
            photos: resolvedPhotos,
            modifierGroups: resolvedModifierGroups,
            comboSlots: resolvedComboSlots,
          },
        };
      }),
    );
  }, [categories, mode, visible]);

  useEffect(() => {
    if (!isCustomerSearchModalOpen) return;

    const query = buildPhoneWithCountryCode(customerPhoneCountryCode, customerPhoneInput);
    if (query.length === 0) {
      setCustomerSearchLoading(false);
      setCustomerSearchError(null);
      setCustomerSearchResults([]);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          setCustomerSearchLoading(true);
          setCustomerSearchError(null);

          const response = await fetch(
            `${apiBaseUrl}/customers/search?phone=${encodeURIComponent(query)}`,
          );

          const responseBody = (await response.json().catch(() => null)) as
            | TCustomerSearchItem[]
            | { error?: string }
            | null;

          if (!response.ok) {
            const message =
              responseBody &&
                typeof responseBody === "object" &&
                "error" in responseBody
                ? responseBody.error
                : "Falha ao buscar cliente";
            throw new Error(message || "Falha ao buscar cliente");
          }

          if (cancelled) return;
          setCustomerSearchResults(Array.isArray(responseBody) ? responseBody : []);
        } catch (searchError) {
          if (cancelled) return;
          const message =
            searchError instanceof Error
              ? searchError.message
              : "Falha ao buscar cliente";
          setCustomerSearchError(message);
          setCustomerSearchResults([]);
        } finally {
          if (!cancelled) {
            setCustomerSearchLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    apiBaseUrl,
    customerPhoneCountryCode,
    customerPhoneInput,
    isCustomerSearchModalOpen,
  ]);

  useEffect(() => {
    if (isCustomerSearchModalOpen || isCreateCustomerModalOpen) return;
    setCustomerCreateLoading(false);
    setCustomerCreateError(null);
    setCustomerCreateNameInput("");
    setCustomerCreatePhoneInput("");
  }, [isCreateCustomerModalOpen, isCustomerSearchModalOpen]);

  useEffect(() => {
    if (!isAddressSelectorModalOpen) return;
    if (orderType !== "DELIVERY" || !selectedCustomer) return;

    const query = addressSearchInput.trim();
    if (query.length < 3) {
      setAddressSearchLoading(false);
      setAddressSearchError(null);
      setAddressSearchResults([]);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          setAddressSearchLoading(true);
          setAddressSearchError(null);

          const response = await fetch(
            `${apiBaseUrl}/address-search?q=${encodeURIComponent(query)}`,
          );

          const responseBody = (await response.json().catch(() => null)) as
            | TAddressSearchResult[]
            | TAddressSearchErrorResponse
            | null;

          if (!response.ok) {
            const message =
              responseBody &&
                typeof responseBody === "object" &&
                "error" in responseBody
                ? responseBody.error
                : "Falha ao buscar endereço";
            throw new Error(message || "Falha ao buscar endereço");
          }

          if (cancelled) return;
          setAddressSearchResults(Array.isArray(responseBody) ? responseBody : []);
        } catch (searchError) {
          if (cancelled) return;
          const message =
            searchError instanceof Error
              ? searchError.message
              : "Falha ao buscar endereço";
          setAddressSearchError(message);
          setAddressSearchResults([]);
        } finally {
          if (!cancelled) {
            setAddressSearchLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    addressSearchInput,
    apiBaseUrl,
    isAddressSelectorModalOpen,
    orderType,
    selectedCustomer,
  ]);

  useEffect(() => {
    if (orderType === "TAKEAWAY") {
      setSelectedAddress(null);
      setIsAddressSelectorModalOpen(false);
    }
  }, [orderType]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const loadProgressiveDiscount = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/progressive-discount`);
        if (!response.ok) {
          throw new Error("Falha ao carregar desconto progressivo");
        }

        const data = (await response.json()) as TProgressiveDiscount | null;
        if (cancelled) return;
        setProgressiveDiscount(data);
      } catch {
        if (cancelled) return;
        setProgressiveDiscount(null);
      }
    };

    void loadProgressiveDiscount();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, visible]);

  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products ?? []),
    [categories],
  );

  const categoryTabs = useMemo<TCategoryTab[]>(() => {
    return [
      {
        id: ALL_CATEGORY_ID,
        title: "All Product",
        count: allProducts.length,
      },
      ...categories.map((category) => ({
        id: category.id,
        title: category.title,
        count: category.products?.length ?? 0,
      })),
    ];
  }, [allProducts.length, categories]);

  const visibleProducts = useMemo(() => {
    if (selectedCategoryId === ALL_CATEGORY_ID) return allProducts;

    return categories.find((category) => category.id === selectedCategoryId)?.products ?? [];
  }, [allProducts, categories, selectedCategoryId]);

  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + item.quantity * getCartItemUnitPrice(item),
        0,
      ),
    [cartItems],
  );
  const progressiveDiscountEligibleSubtotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) =>
          item.excludeFromProgressiveDiscount
            ? total
            : total + item.quantity * getCartItemUnitPrice(item),
        0,
      ),
    [cartItems],
  );
  const reachedProgressiveSteps = useMemo(
    () => getReachedProgressiveSteps(progressiveDiscount?.steps, progressiveDiscountEligibleSubtotal),
    [progressiveDiscount?.steps, progressiveDiscountEligibleSubtotal],
  );
  const giftOrderItems = useMemo(
    () => {
      if (mode !== "update") return [];

      const selectedPrize = initialOrder?.selectedPrize;
      if (!selectedPrize) return [];

      const availablePrizeProducts = selectedPrize.availableProducts ?? [];
      const prizeProductNameById = new Map(
        availablePrizeProducts.map((product) => [product.id, product.name]),
      );

      if ((selectedPrize.selectedProductCounts?.length ?? 0) > 0) {
        return selectedPrize.selectedProductCounts.map((selectedProduct, index) => {
          const productName =
            prizeProductNameById.get(selectedProduct.productId) ?? "Prize item";

          return {
            key: `selected-prize-count-${selectedProduct.productId}-${index}`,
            label: `${Math.max(1, selectedProduct.quantity)}x ${productName}`,
          };
        });
      }

      if ((selectedPrize.selectedProductIds?.length ?? 0) > 0) {
        const countedProducts = new Map<string, number>();

        for (const productId of selectedPrize.selectedProductIds) {
          countedProducts.set(productId, (countedProducts.get(productId) ?? 0) + 1);
        }

        return Array.from(countedProducts.entries()).map(([productId, quantity]) => {
          const productName = prizeProductNameById.get(productId) ?? "Prize item";

          return {
            key: `selected-prize-id-${productId}`,
            label: `${Math.max(1, quantity)}x ${productName}`,
          };
        });
      }

      if (selectedPrize.prizeName?.trim()) {
        return [
          {
            key: `selected-prize-name-${selectedPrize.prizeId ?? "fallback"}`,
            label: `${Math.max(1, selectedPrize.quantity || 1)}x ${selectedPrize.prizeName.trim()}`,
          },
        ];
      }

      return [];
    },
    [initialOrder, mode],
  );
  const progressiveDiscountPercent = useMemo(
    () => getAppliedProgressiveDiscountPercent(reachedProgressiveSteps),
    [reachedProgressiveSteps],
  );
  const progressiveDiscountAmount = useMemo(
    () => calculateProgressiveDiscountAmount(progressiveDiscountEligibleSubtotal, progressiveDiscountPercent),
    [progressiveDiscountEligibleSubtotal, progressiveDiscountPercent],
  );
  const deliveryFee = useMemo(() => {
    if (orderType !== "DELIVERY") return 0;
    if (selectedAddress?.source !== "CUSTOMER") return 0;

    const fee = selectedAddress.address.deliveryFee;
    return typeof fee === "number" && Number.isFinite(fee) ? Math.max(0, fee) : 0;
  }, [orderType, selectedAddress]);
  const serviceTax = useMemo(
    () => Math.round(Math.max(0, subtotal - progressiveDiscountAmount) * SALES_TAX_RATE),
    [progressiveDiscountAmount, subtotal],
  );
  const totalPayment = useMemo(
    () =>
      calculateOrderTotal({
        type: orderType,
        tipAmount,
        deliveryAddress: {
          deliveryFee,
        },
        orderProducts: cartItems.map((item) => ({
          fullAmount: getCartItemUnitPrice(item),
          quantity: item.quantity,
          excludeFromProgressiveDiscount: item.excludeFromProgressiveDiscount,
        })),
        progressiveDiscountSteps: progressiveDiscount?.steps,
      }),
    [cartItems, deliveryFee, orderType, progressiveDiscount?.steps, tipAmount],
  );
  const computedProductCardWidth = useMemo(() => {
    const availableWidth = Math.max(0, productsGridWidth - PRODUCT_GRID_HORIZONTAL_PADDING);
    if (availableWidth <= 0) return PRODUCT_CARD_MIN_WIDTH;

    const columns = Math.max(
      1,
      Math.floor((availableWidth + PRODUCT_GRID_GAP) / (PRODUCT_CARD_MIN_WIDTH + PRODUCT_GRID_GAP)),
    );
    const totalGaps = PRODUCT_GRID_GAP * (columns - 1);

    return (availableWidth - totalGaps) / columns;
  }, [productsGridWidth]);

  const handleProductsLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - productsGridWidth) > 1) {
      setProductsGridWidth(width);
    }
  };

  const buildPromotionProduct = (promotionProduct: TPosExclusivePromotionProduct) => {
    const categoryProduct = getCategoryProductById(categories, promotionProduct.id);
    if (categoryProduct) {
      return {
        ...categoryProduct,
        excludeFromProgressiveDiscount: true,
      };
    }

    const normalizedComboSlots = normalizeComboSlots(
      promotionProduct as TCategoryApiProductApiShape,
    );

    return {
      id: promotionProduct.id,
      itemType: promotionProduct.itemType ?? null,
      name:
        promotionProduct.translations?.[getCurrentLanguage()]?.title ??
        promotionProduct.translations?.en?.title ??
        promotionProduct.name ??
        "Promoção",
      description:
        promotionProduct.translations?.[getCurrentLanguage()]?.description ??
        promotionProduct.translations?.en?.description ??
        null,
      price:
        typeof promotionProduct.price === "number" && Number.isFinite(promotionProduct.price)
          ? promotionProduct.price
          : null,
      comparedAtPrice:
        typeof promotionProduct.comparedAtPrice === "number" &&
        Number.isFinite(promotionProduct.comparedAtPrice)
          ? promotionProduct.comparedAtPrice
          : null,
      excludeFromProgressiveDiscount: true,
      photos: promotionProduct.photos ?? [],
      modifierGroups: [],
      comboSlots: normalizedComboSlots,
    } satisfies TCategoryApiProduct;
  };

  const handlePromotionProductPress = (promotionProduct: TPosExclusivePromotionProduct) => {
    handleProductPress(buildPromotionProduct(promotionProduct));
  };

  const addProductToCart = (
    product: TCategoryApiProduct,
    selectedByGroup: Record<string, string[]>,
    selectedComboBySlot: Record<string, Record<string, number>>,
    comment?: string,
  ) => {
    const selectedModifiers = getSelectedModifiers(product, selectedByGroup);
    const comboSelections = getSelectedComboEntries(product, selectedComboBySlot);
    const normalizedComment = (comment ?? "").trim();
    const signature = buildCartItemSignature(
      product,
      selectedByGroup,
      selectedComboBySlot,
      normalizedComment,
    );

    setCartItems((previous) => {
      const found = previous.find((item) => item.signature === signature);
      if (found) {
        return previous.map((item) =>
          item.signature === signature
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...previous,
        {
          lineId: generateUuid(),
          signature,
          productId: product.id,
          product,
          quantity: 1,
          excludeFromProgressiveDiscount: isProductExcludedFromProgressiveDiscount(product),
          selectedModifiers,
          comboSelections,
          comment: normalizedComment || undefined,
        },
      ];
    });

    setSelectedProductId(product.id);
  };

  const removeProduct = (lineId: string) => {
    setCartItems((previous) => previous.filter((item) => item.lineId !== lineId));
  };

  const decreaseQty = (lineId: string) => {
    setCartItems((previous) =>
      previous
        .map((item) =>
          item.lineId === lineId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const increaseQty = (lineId: string) => {
    setCartItems((previous) =>
      previous.map((item) =>
        item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    );
  };

  const updateItemComment = (lineId: string, nextComment: string) => {
    setCartItems((previous) =>
      previous.map((item) => {
        if (item.lineId !== lineId) return item;

        const normalizedComment = nextComment.trim();
        const nextSelectedByGroup = getSelectedByGroupFromCartItem(item);
        const nextSignature = buildCartItemSignature(
          item.product,
          nextSelectedByGroup,
          getComboSelectionsBySlotFromCartItem(item),
          normalizedComment,
        );

        return {
          ...item,
          signature: nextSignature,
          comment: normalizedComment || undefined,
        };
      }),
    );
  };

  const openModifierModal = (
    product: TCategoryApiProduct,
    options?: {
      initialSelections?: Record<string, string[]>;
      initialComboSelections?: Record<string, Record<string, number>>;
      initialComment?: string;
      editingLineId?: string | null;
    },
  ) => {
    const normalizedGroups = getRenderableModifierGroups(product);
    const normalizedProduct: TCategoryApiProduct = {
      ...product,
      modifierGroups: normalizedGroups,
    };
    const defaultSelections: Record<string, string[]> = {};

    for (const group of normalizedGroups) {
      const candidateSelections = options?.initialSelections?.[group.id] ?? [];
      const validItemIds = new Set((group.items ?? []).map((groupItem) => groupItem.id));
      defaultSelections[group.id] = Array.from(
        new Set(candidateSelections.filter((itemId) => validItemIds.has(itemId))),
      );
    }

    setModifierProduct(normalizedProduct);
    setModifierSelections(defaultSelections);
    setComboSelectionsBySlot(options?.initialComboSelections ?? {});
    setItemComment(options?.initialComment?.trim() ?? "");
    setEditingCartItemLineId(options?.editingLineId ?? null);
    setModifierValidationError(null);
  };

  const closeModifierModal = () => {
    setModifierProduct(null);
    setModifierSelections({});
    setComboSelectionsBySlot({});
    setItemComment("");
    setEditingCartItemLineId(null);
    setModifierValidationError(null);
  };

  const toggleModifierItem = (
    group: TModifierGroup,
    item: TModifierGroupItem,
  ) => {
    setModifierSelections((previous) => {
      const current = previous[group.id] ?? [];
      const isSelected = current.includes(item.id);
      const { maxSelection } = getSelectionBounds(group);
      const isSingle = group.type === "SINGLE" || maxSelection === 1;

      if (isSingle) {
        return {
          ...previous,
          [group.id]: isSelected ? [] : [item.id],
        };
      }

      if (isSelected) {
        return {
          ...previous,
          [group.id]: current.filter((selectedId) => selectedId !== item.id),
        };
      }

      if (current.length >= maxSelection) {
        return previous;
      }

      return {
        ...previous,
        [group.id]: [...current, item.id],
      };
    });

    setModifierValidationError(null);
  };

  const validateModifierSelections = (product: TCategoryApiProduct) => {
    const groups = (product.modifierGroups ?? []).filter(
      (group) => (group.items?.length ?? 0) > 0,
    );

    for (const group of groups) {
      const selectedCount = modifierSelections[group.id]?.length ?? 0;
      const { minSelection, maxSelection } = getSelectionBounds(group);

      if (selectedCount < minSelection) {
        return `Selecione ${minSelection} item(ns) em ${group.title}`;
      }

      if (selectedCount > maxSelection) {
        return `Selecione no máximo ${maxSelection} item(ns) em ${group.title}`;
      }
    }

    return null;
  };

  const validateComboSelections = (product: TCategoryApiProduct) => {
    for (const slot of getComboSlots(product)) {
      const optionCounts = comboSelectionsBySlot[slot.id] ?? {};
      const totalSelected = Object.values(optionCounts).reduce((sum, quantity) => sum + quantity, 0);

      if (totalSelected < slot.minSelect) {
        return `Selecione ${slot.minSelect} item(ns) em ${getComboSlotTitle(slot)}`;
      }

      if (totalSelected > slot.maxSelect) {
        return `Selecione no máximo ${slot.maxSelect} item(ns) em ${getComboSlotTitle(slot)}`;
      }
    }

    return null;
  };

  const updateComboOptionQuantity = (
    slot: TComboSlot,
    option: TComboSlotOption,
    delta: number,
  ) => {
    setComboSelectionsBySlot((previous) => {
      const currentSlotSelections = previous[slot.id] ?? {};
      const currentQuantity = currentSlotSelections[option.productId] ?? 0;
      const totalSelected = Object.values(currentSlotSelections).reduce((sum, quantity) => sum + quantity, 0);
      const nextQuantity = Math.max(0, currentQuantity + delta);

      if (delta > 0) {
        if (!slot.allowDuplicates && currentQuantity >= 1) {
          return previous;
        }

        if (totalSelected >= slot.maxSelect) {
          return previous;
        }
      }

      const nextSlotSelections = { ...currentSlotSelections };
      if (nextQuantity <= 0) {
        delete nextSlotSelections[option.productId];
      } else {
        nextSlotSelections[option.productId] = nextQuantity;
      }

      return {
        ...previous,
        [slot.id]: nextSlotSelections,
      };
    });

    setModifierValidationError(null);
  };

  const applyModifiersAndAddProduct = () => {
    if (!modifierProduct) return;

    const validationError = validateModifierSelections(modifierProduct);
    if (validationError) {
      setModifierValidationError(validationError);
      return;
    }

    const comboValidationError = validateComboSelections(modifierProduct);
    if (comboValidationError) {
      setModifierValidationError(comboValidationError);
      return;
    }

    if (editingCartItemLineId) {
      const normalizedComment = itemComment.trim();
      const selectedModifiers = getSelectedModifiers(modifierProduct, modifierSelections);
      const comboSelections = getSelectedComboEntries(modifierProduct, comboSelectionsBySlot);
      const nextSignature = buildCartItemSignature(
        modifierProduct,
        modifierSelections,
        comboSelectionsBySlot,
        normalizedComment,
      );

      setCartItems((previous) => {
        const editingItem = previous.find((item) => item.lineId === editingCartItemLineId);
        if (!editingItem) return previous;

        const duplicateItem = previous.find(
          (item) => item.lineId !== editingCartItemLineId && item.signature === nextSignature,
        );
        if (duplicateItem && mode === "create") {
          return previous
            .filter((item) => item.lineId !== editingCartItemLineId)
            .map((item) =>
              item.lineId === duplicateItem.lineId
                ? { ...item, quantity: item.quantity + editingItem.quantity }
                : item,
            );
        }

        return previous.map((item) =>
          item.lineId === editingCartItemLineId
            ? {
                ...item,
                signature: nextSignature,
                productId: modifierProduct.id,
                product: modifierProduct,
                excludeFromProgressiveDiscount:
                  isProductExcludedFromProgressiveDiscount(modifierProduct),
                selectedModifiers,
                comboSelections,
                comment: normalizedComment || undefined,
              }
            : item,
        );
      });

      setSelectedProductId(modifierProduct.id);
      closeModifierModal();
      return;
    }

    addProductToCart(modifierProduct, modifierSelections, comboSelectionsBySlot, itemComment);
    closeModifierModal();
  };

  const handleProductPress = (product: TCategoryApiProduct) => {
    openModifierModal(product);
  };

  const handleOrderItemPress = (item: TCartItem) => {
    const normalizedGroups = getRenderableModifierGroups(item.product);
    const normalizedProduct: TCategoryApiProduct = {
      ...item.product,
      modifierGroups: normalizedGroups,
    };
    const initialSelections = getSelectedByGroupForProductFromCartItem(item, normalizedProduct);
    const initialComboSelections = getComboSelectionsBySlotFromCartItem(item);

    openModifierModal(normalizedProduct, {
      initialSelections,
      initialComboSelections,
      initialComment: item.comment,
      editingLineId: item.lineId,
    });
  };

  const handleClose = () => {
    setSelectedProductId(null);
    closeModifierModal();
    setIsCustomerSearchModalOpen(false);
    setIsCreateCustomerModalOpen(false);
    setIsAddressSelectorModalOpen(false);
    setCreateOrderError(null);
    onClose();
  };

  const customerAddresses = selectedCustomer?.addresses ?? [];
  const canSelectAddress = orderType === "DELIVERY" && !!selectedCustomer;

  const openCustomerSearchModal = () => {
    const resolvedPhone = resolvePhoneCountryCode(selectedCustomer?.phone);
    setCustomerPhoneCountryCode(resolvedPhone.countryCode);
    setCustomerPhoneInput(resolvedPhone.localNumber);
    setCustomerSearchError(null);
    setCustomerSearchResults(selectedCustomer ? [selectedCustomer] : []);
    setIsCustomerPhoneCountryCodeSelectorOpen(false);
    setIsCreateCustomerModalOpen(false);
    setIsCustomerSearchModalOpen(true);
  };

  const openAddressSelectorModal = () => {
    if (!canSelectAddress) return;
    setAddressSearchInput("");
    setAddressSearchError(null);
    setAddressSearchResults([]);
    setIsAddressSelectorModalOpen(true);
  };

  const resolveCustomerPhoneText = () => {
    const selectedCustomerPhone = selectedCustomer?.phone?.trim();
    if (selectedCustomerPhone) return selectedCustomerPhone;

    const initialCustomerPhone = initialOrder?.customer?.phone?.trim();
    if (mode === "update" && initialCustomerPhone) return initialCustomerPhone;

    return null;
  };

  const resolveCustomerInputText = () => {
    if (!selectedCustomer) return "Select Customer";
    const customerPhone = resolveCustomerPhoneText();
    if (customerPhone) {
      return `${selectedCustomer.name} (${customerPhone})`;
    }
    return selectedCustomer.name;
  };

  const resolveAddressInputText = () => {
    if (!selectedAddress) return "Select customer address or search new address";
    return selectedAddress.displayName;
  };

  const resetOrderBuilder = () => {
    setCartItems([]);
    setSelectedProductId(null);
    setModifierProduct(null);
    setModifierSelections({});
    setItemComment("");
    setModifierValidationError(null);
    setOrderType("DELIVERY");
    setPaymentMethod("CASH");
    setSelectedCustomer(null);
    setSelectedAddress(null);
    setIsCustomerSearchModalOpen(false);
    setIsCreateCustomerModalOpen(false);
    setIsAddressSelectorModalOpen(false);
    setCustomerPhoneInput("");
    setCustomerPhoneCountryCode(DEFAULT_COUNTRY_CODE);
    setIsCustomerPhoneCountryCodeSelectorOpen(false);
    setCustomerCreatePhoneInput("");
    setCustomerSearchError(null);
    setCustomerSearchResults([]);
    setCustomerCreateNameInput("");
    setCustomerCreateError(null);
    setCustomerCreateLoading(false);
    setAddressSearchInput("");
    setAddressSearchError(null);
    setAddressSearchResults([]);
    setTipInput("");
    setTipPercentageFromOrder(null);
    setHasManualTipEdit(false);
    setEditingCartItemLineId(null);
    setCreateOrderError(null);
    setCreateOrderLoading(false);
  };

  const resolvedTitle = title ?? (mode === "update" ? "Atualizar Pedido" : "Criar Pedido");
  const resolvedSubmitLabel = submitLabel ?? (mode === "update" ? "Update Order" : "Make Order");
  const resolvedSubmittingLabel =
    mode === "update" ? "Updating..." : "Creating...";
  const initialOrderProductIds = useMemo(
    () =>
      (initialOrder?.orderProducts ?? [])
        .map((orderProduct) => orderProduct.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    [initialOrder?.orderProducts],
  );

  const handleSubmitOrder = async () => {
    if (createOrderLoading) return;

    if (mode === "create" && cartItems.length === 0) {
      setCreateOrderError("Adicione pelo menos um item ao pedido.");
      return;
    }

    if (mode === "create" && !selectedCustomer?.id) {
      setCreateOrderError("Selecione um cliente antes de criar o pedido.");
      return;
    }

    if (orderType === "DELIVERY" && !selectedAddress?.id) {
      setCreateOrderError("Selecione um endereço para pedidos de delivery.");
      return;
    }

    try {
      setCreateOrderLoading(true);
      setCreateOrderError(null);

      if (mode === "create") {
        const selectedCustomerId = selectedCustomer?.id;
        if (!selectedCustomerId) {
          throw new Error("Selecione um cliente antes de criar o pedido.");
        }

        const requestBody: TCreateOrderRequestBody = {
          cart: {
            items: cartItems.map((item) => ({
                  cartId: item.lineId,
                  productId: item.productId,
                  quantity: item.quantity,
                  modifiers: item.selectedModifiers.map((modifier) => ({
                    modifierId: modifier.groupId,
                    modifierItemId: modifier.itemId,
                  })),
                  ...(item.comboSelections.length > 0
                    ? {
                        comboSelections: item.comboSelections.map((selection) => ({
                          slotId: selection.slotId,
                          optionProductId: selection.optionProductId,
                          quantity: selection.quantity,
                        })),
                      }
                    : {}),
                  ...(item.comment ? { description: item.comment } : {}),
                })),
              },
          source: "POS",
          customerId: selectedCustomerId,
          orderType,
          paymentMethod,
          language: getCurrentLanguage(),
          ...(orderType === "DELIVERY" && selectedAddress?.id
            ? { addressId: selectedAddress.id }
            : {}),
          ...(tipAmount > 0 ? { tipAmount } : {}),
        };

        if (onSubmitOrder) {
          await onSubmitOrder(requestBody);
        } else {
          const response = await fetch(`${apiBaseUrl}/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          const responseBody = (await response.json().catch(() => null)) as
            | TCreateOrderErrorResponse
            | null;

          if (!response.ok) {
            const message =
              responseBody?.error ||
              (response.status === 400
                ? "Dados inválidos para criar o pedido."
                : "Falha ao criar pedido.");
            const fieldMessage = responseBody?.field ? ` (${responseBody.field})` : "";
            throw new Error(`${message}${fieldMessage}`);
          }
        }
      } else {
        const orderId = initialOrder?.id;
        if (!orderId) {
          throw new Error("ID do pedido não encontrado para atualização.");
        }

        const initialIdsSet = new Set(initialOrderProductIds);
        const currentIdsSet = new Set(cartItems.map((item) => item.lineId));
        const removedOrderProductIds = initialOrderProductIds.filter(
          (id) => !currentIdsSet.has(id),
        );

        const updatedOrCreatedOrderProducts = cartItems.map((item) => {
          const normalizedComments = item.comment?.trim() ?? "";
          const normalizedPayload = {
            quantity: Math.max(1, Math.round(item.quantity || 1)),
            comments: normalizedComments.length > 0 ? normalizedComments : null,
            selectedModifierGroupItemIds: Array.from(
              new Set(item.selectedModifiers.map((modifier) => modifier.itemId))
            ),
            ...(item.comboSelections.length > 0
              ? {
                  comboSelections: item.comboSelections.map((selection) => ({
                    slotId: selection.slotId,
                    optionProductId: selection.optionProductId,
                    quantity: selection.quantity,
                  })),
                }
              : {}),
          };

          if (initialIdsSet.has(item.lineId)) {
            return {
              id: item.lineId,
              ...normalizedPayload,
            };
          }

          return {
            productId: item.productId,
            ...normalizedPayload,
          };
        });

        const removedOrderProducts = removedOrderProductIds.map((id) => ({
          id,
          remove: true as const,
        }));

        const orderProducts = [...updatedOrCreatedOrderProducts, ...removedOrderProducts];

        const requestBody: TUpdateOrderRequestBody = {
          orderType,
          paymentMethod,
          tipAmount: tipAmount > 0 ? tipAmount : null,
          customerId: selectedCustomer?.id ?? null,
          addressId: orderType === "DELIVERY" ? selectedAddress?.id ?? null : null,
          orderProducts,
        };

        const response = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const responseBody = (await response.json().catch(() => null)) as
          | TCreateOrderErrorResponse
          | null;

        if (!response.ok) {
          const message =
            responseBody?.error ||
            (response.status === 404
              ? "Pedido não encontrado."
              : "Falha ao atualizar pedido.");
          const fieldMessage = responseBody?.field ? ` (${responseBody.field})` : "";
          throw new Error(`${message}${fieldMessage}`);
        }
      }

      if (onSuccess) {
        try {
          await onSuccess();
        } catch {
          // Keep modal flow resilient even if parent post-submit action fails.
        }
      }

      resetOrderBuilder();
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : mode === "update"
            ? "Falha ao atualizar pedido."
            : "Falha ao criar pedido.";
      setCreateOrderError(message);
    } finally {
      setCreateOrderLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    const phone = customerCreatePhoneInput.trim();
    const normalizedName = customerCreateNameInput.trim();
    if (!phone) {
      setCustomerCreateError("Digite o telefone para criar o cliente.");
      return;
    }

    try {
      setCustomerCreateLoading(true);
      setCustomerCreateError(null);

      const response = await fetch(`${apiBaseUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          name: normalizedName.length > 0 ? normalizedName : null,
        }),
      });

      const responseBody = (await response.json().catch(() => null)) as
        | TCustomerSearchItem
        | TCreateCustomerErrorResponse
        | null;

      if (!response.ok) {
        const message =
          responseBody &&
          typeof responseBody === "object" &&
          "error" in responseBody &&
          responseBody.error
            ? responseBody.error
            : "Falha ao criar cliente";
        throw new Error(message);
      }

      if (
        !responseBody ||
        typeof responseBody !== "object" ||
        !("id" in responseBody) ||
        typeof responseBody.id !== "string"
      ) {
        throw new Error("Resposta inválida ao criar cliente");
      }

      const createdCustomer = responseBody as TCustomerSearchItem;

      setSelectedCustomer(createdCustomer);
      setSelectedAddress(null);
      setCustomerPhoneInput(createdCustomer.phone ?? phone);
      setCustomerSearchResults((previous) => {
        const deduped = previous.filter((item) => item.id !== createdCustomer.id);
        return [createdCustomer, ...deduped];
      });
      setCustomerCreateNameInput("");
      setCustomerCreatePhoneInput("");
      setIsCreateCustomerModalOpen(false);
      setIsCustomerSearchModalOpen(false);
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Falha ao criar cliente";
      setCustomerCreateError(message);
    } finally {
      setCustomerCreateLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{resolvedTitle}</Text>
            {mode === "update" && selectedCustomer && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {resolveCustomerInputText()}
              </Text>
            )}
          </View>
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Feather name="x" size={20} color="#2d2d2d" />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.productsSection}>
            <View style={styles.categoryTabsContainer}>
              {promotionsLoading ? (
                <Text style={styles.feedbackText}>Carregando promoções...</Text>
              ) : promotionsError ? (
                <Text style={styles.errorText}>{promotionsError}</Text>
              ) : promotions.length > 0 ? (
                <View style={styles.promotionSection}>
                  <Text style={styles.promotionSectionTitle}>Promoções do POS</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.promotionRow}
                  >
                    {promotions.map((promotion) => (
                      <View key={promotion.id} style={styles.promotionCard}>
                        <Text style={styles.promotionName}>{promotion.name}</Text>
                        <View style={styles.promotionProductsWrap}>
                          {promotion.products.map((promotionProduct) => {
                            const resolvedName =
                              promotionProduct.translations?.pt?.title ??
                              promotionProduct.name ??
                              "Produto";
                            const price =
                              typeof promotionProduct.price === "number" &&
                              Number.isFinite(promotionProduct.price)
                                ? promotionProduct.price
                                : 0;

                            return (
                              <Pressable
                                key={`${promotion.id}-${promotionProduct.id}`}
                                style={styles.promotionProductChip}
                                onPress={() => handlePromotionProductPress(promotionProduct)}
                              >
                                <Text style={styles.promotionProductChipTitle}>{resolvedName}</Text>
                                <Text style={styles.promotionProductChipPrice}>
                                  {formatCurrency(price)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryTabsScroll}
                contentContainerStyle={styles.categoryTabs}
              >
                {categoryTabs.map((category) => {
                  const isActive = selectedCategoryId === category.id;

                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setSelectedCategoryId(category.id)}
                      style={[styles.categoryTab, isActive && styles.categoryTabActive]}
                    >
                      <Text
                        style={[styles.categoryTabTitle, isActive && styles.categoryTabTitleActive]}
                      >
                        {category.title}
                      </Text>
                      <Text style={styles.categoryTabCount}>{category.count} items</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView
              style={styles.productsScroll}
              contentContainerStyle={styles.productGrid}
              showsVerticalScrollIndicator={false}
              bounces={false}
              onLayout={handleProductsLayout}
            >
              {/* <Pressable style={[styles.productCard, styles.addProductCard]}>
                <Feather name="plus" size={26} color="#2d2d2d" />
                <Text style={styles.addProductText}>Add New Product</Text>
              </Pressable> */}

              {loading ? (
                <Text style={styles.feedbackText}>Carregando produtos...</Text>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : (
                visibleProducts.map((product) => {
                  const imageUrl = getProductImageUrl(product);
                  const basePrice = getProductBasePrice(product);
                  const isSelected = selectedProductId === product.id;

                  return (
                    <Pressable
                      key={product.id}
                      style={[
                        styles.productCard,
                        { width: computedProductCardWidth },
                        isSelected && styles.productCardSelected,
                      ]}
                      onPress={() => handleProductPress(product)}
                    >
                      {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={styles.productImage} />
                      ) : (
                        <View style={[styles.productImage, styles.productImagePlaceholder]}>
                          <Feather name="image" size={18} color="#999999" />
                        </View>
                      )}
                      <View style={styles.productInfo}>
                        <Text numberOfLines={1} style={styles.productName}>
                          {getProductLabel(product)}
                        </Text>
                        <View style={styles.productPriceRow}>
                          <Text style={styles.productPrice}>{formatCurrency(basePrice)}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>

          <View style={styles.orderSection}>
            {/* <Text style={styles.sectionLabel}>Order type</Text> */}
            <View style={styles.orderTypeSwitch}>
              <Pressable
                style={[
                  styles.orderTypeOption,
                  orderType === "DELIVERY" && styles.orderTypeOptionActive,
                ]}
                onPress={() => setOrderType("DELIVERY")}
              >
                <Text
                  style={[
                    styles.orderTypeOptionText,
                    orderType === "DELIVERY" && styles.orderTypeOptionTextActive,
                  ]}
                >
                  Delivery
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.orderTypeOption,
                  orderType === "TAKEAWAY" && styles.orderTypeOptionActive,
                ]}
                onPress={() => setOrderType("TAKEAWAY")}
              >
                <Text
                  style={[
                    styles.orderTypeOptionText,
                    orderType === "TAKEAWAY" && styles.orderTypeOptionTextActive,
                  ]}
                >
                  Takeaway
                </Text>
              </Pressable>
            </View>

            {/* <Text style={styles.sectionLabel}>Customer</Text> */}
            <Pressable style={[styles.customerInputWrap, {
              borderTopWidth: 0,
            }]} onPress={openCustomerSearchModal}>
              <Text
                style={[
                  styles.customerInputPreview,
                  !selectedCustomer && styles.customerInputPlaceholder,
                ]}
                numberOfLines={1}
              >
                {resolveCustomerInputText()}
              </Text>
              <Feather name="user" size={16} color="#666666" />
            </Pressable>

            {/* <Text style={styles.sectionLabel}>Address</Text> */}
            <Pressable
              style={[
                styles.customerInputWrap,
                {
                  borderTopWidth: 0,
                },
                !canSelectAddress && styles.disabledInputWrap,
              ]}
              onPress={openAddressSelectorModal}
              disabled={!canSelectAddress}
            >
              <Text
                style={[
                  styles.customerInputPreview,
                  !selectedAddress && styles.customerInputPlaceholder,
                  !canSelectAddress && styles.disabledInputText,
                ]}
                numberOfLines={1}
              >
                {canSelectAddress
                  ? resolveAddressInputText()
                  : "Select Delivery + Customer first"}
              </Text>
              <Feather
                name="map-pin"
                size={16}
                color={canSelectAddress ? "#666666" : "#b2b2b2"}
              />
            </Pressable>

            {/* <Text style={[styles.sectionLabel, styles.orderLabel]}>Your order :</Text> */}
            <ScrollView style={styles.orderList} contentContainerStyle={styles.orderListContent}>
              {cartItems.length === 0 && giftOrderItems.length === 0 ? (
                <Text style={styles.feedbackText}>Nenhum item adicionado.</Text>
              ) : (
                <>
                  {cartItems.map((item) => {
                    const unitPrice = getCartItemUnitPrice(item);
                    const categoryProduct = getCategoryProductById(categories, item.productId);
                    const displayName =
                      item.product.name?.trim() ||
                      categoryProduct?.name?.trim() ||
                      "Item";
                    const displayQuantity =
                      typeof item.quantity === "number" && item.quantity > 0
                        ? item.quantity
                        : 1;

                    return (
                      <Pressable
                        key={item.lineId}
                        style={styles.orderItemRow}
                        onPress={() => handleOrderItemPress(item)}
                      >
                        <View style={styles.orderItemMain}>
                          <View style={styles.orderItemHeader}>
                            <Text style={styles.orderItemName}>{`${displayQuantity}x ${displayName}`}</Text>
                            <Pressable
                              onPress={(event) => {
                                event.stopPropagation?.();
                                removeProduct(item.lineId);
                              }}
                            >
                              <Feather name="trash-2" size={14} color="#d26464" />
                            </Pressable>
                          </View>

                          {item.selectedModifiers.length > 0 && (
                            <Text style={styles.orderItemModifiersText}>
                              {item.selectedModifiers
                                .map((modifier) => `${modifier.groupTitle}: ${modifier.itemName}`)
                                .join(" • ")}
                            </Text>
                          )}
                          {item.comboSelections.length > 0 && (
                            <Text style={styles.orderItemModifiersText}>
                              {item.comboSelections
                                .map(
                                  (selection) =>
                                    `${selection.slotName}: ${selection.quantity}x ${selection.optionProductName}`,
                                )
                                .join(" • ")}
                            </Text>
                          )}
                          <TextInput
                            value={item.comment ?? ""}
                            onChangeText={(value) => updateItemComment(item.lineId, value)}
                            placeholder="Add product comment"
                            placeholderTextColor="#9a9a9a"
                            style={styles.orderItemCommentInput}
                            multiline
                          />

                          <View style={styles.orderItemActions}>
                            <View style={styles.qtyControls}>
                              <Pressable
                                style={styles.qtyButton}
                                onPress={(event) => {
                                  event.stopPropagation?.();
                                  decreaseQty(item.lineId);
                                }}
                              >
                                <Feather name="minus" size={14} color="#2d2d2d" />
                              </Pressable>
                              <Text style={styles.qtyValue}>{displayQuantity}</Text>
                              <Pressable
                                style={styles.qtyButton}
                                onPress={(event) => {
                                  event.stopPropagation?.();
                                  increaseQty(item.lineId);
                                }}
                              >
                                <Feather name="plus" size={14} color="#2d2d2d" />
                              </Pressable>
                            </View>
                            <View style={styles.orderItemAmountWrap}>
                              <Text style={styles.orderItemAmount}>
                                {formatCurrency(unitPrice * item.quantity)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}

                  {giftOrderItems.map((giftItem) => (
                    <View
                      key={giftItem.key}
                      style={[styles.orderItemRow, styles.orderItemRowGift]}
                    >
                      <View style={styles.orderItemMain}>
                        <View style={styles.orderItemHeader}>
                          <Text style={styles.orderItemName}>{giftItem.label}</Text>
                          <View style={styles.giftBadge}>
                            <Text style={styles.giftBadgeText}>Gift</Text>
                          </View>
                        </View>
                        {/* <Text style={styles.giftLockedText}>Non-editable item</Text> */}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal ({cartItems.length})</Text>
                <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
              </View>
              {progressiveDiscountAmount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Progressive discount ({progressiveDiscountPercent}%)
                  </Text>
                  <Text style={styles.totalDiscountValue}>
                    -{formatCurrency(progressiveDiscountAmount)}
                  </Text>
                </View>
              )}
              {orderType === "DELIVERY" && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Delivery fee</Text>
                  <Text style={styles.totalValue}>{formatCurrency(deliveryFee)}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Sales Tax (6.5%)</Text>
                <Text style={styles.totalValue}>{formatCurrency(serviceTax)}</Text>
              </View>
              <View style={styles.totalInputRow}>
                <Text style={styles.totalLabel}>Tip</Text>
                <TextInput
                  value={tipInput}
                  onChangeText={(value) => {
                    setHasManualTipEdit(true);
                    setTipInput(normalizeCurrencyInput(value));
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#9a9a9a"
                  keyboardType="decimal-pad"
                  style={styles.totalInput}
                />
              </View>
              <View style={[styles.totalRow, styles.totalRowStrong]}>
                <Text style={styles.totalStrongLabel}>Total payment</Text>
                <Text style={styles.totalStrongValue}>{formatCurrency(totalPayment)}</Text>
              </View>
            </View>

            {/* <Text style={[styles.sectionLabel, styles.paymentLabel]}>
              Payment method: <Text style={styles.required}>*</Text>
            </Text> */}
            <View style={styles.paymentSwitch}>
              <Pressable
                style={[
                  styles.orderTypeOption,
                  paymentMethod === "CASH" && styles.orderTypeOptionActive,
                ]}
                onPress={() => setPaymentMethod("CASH")}
              >
                <Text
                  style={[
                    styles.orderTypeOptionText,
                    paymentMethod === "CASH" && styles.orderTypeOptionTextActive,
                  ]}
                >
                  Cash
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.orderTypeOption,
                  paymentMethod === "CARD" && styles.orderTypeOptionActive,
                ]}
                onPress={() => setPaymentMethod("CARD")}
              >
                <Text
                  style={[
                    styles.orderTypeOptionText,
                    paymentMethod === "CARD" && styles.orderTypeOptionTextActive,
                  ]}
                >
                  Card
                </Text>
              </Pressable>
            </View>

            {!!createOrderError && (
              <Text style={styles.createOrderErrorText}>{createOrderError}</Text>
            )}

            <Pressable
              style={[
                styles.makeOrderButton,
                createOrderLoading && styles.makeOrderButtonDisabled,
              ]}
              onPress={handleSubmitOrder}
              disabled={createOrderLoading}
            >
              <Text style={styles.makeOrderButtonText}>
                {createOrderLoading ? resolvedSubmittingLabel : resolvedSubmitLabel}
              </Text>
              <Feather name="send" size={14} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        <Modal
          visible={isCustomerSearchModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCustomerSearchModalOpen(false)}
        >
          <View style={styles.customerSearchOverlay}>
            <Pressable
              style={styles.customerSearchBackdrop}
              onPress={() => setIsCustomerSearchModalOpen(false)}
            />
            <View style={[styles.customerSearchCard, styles.customerSearchCardFullHeight]}>
              <View style={styles.customerSearchHeader}>
                <Text style={styles.customerSearchTitle}>Buscar cliente</Text>
                <Pressable
                  style={styles.customerSearchCloseButton}
                  onPress={() => setIsCustomerSearchModalOpen(false)}
                >
                  <Feather name="x" size={18} color="#2d2d2d" />
                </Pressable>
              </View>

              <View style={styles.customerSearchPhoneRow}>
                <Pressable
                  style={[
                    styles.countryCodeSelectorButton,
                    isCustomerPhoneCountryCodeSelectorOpen &&
                      styles.countryCodeSelectorButtonOpen,
                  ]}
                  onPress={() =>
                    setIsCustomerPhoneCountryCodeSelectorOpen((previous) => !previous)
                  }
                >
                  <Text style={styles.countryCodeSelectorButtonText}>
                    {customerPhoneCountryCode}
                  </Text>
                  <Feather
                    name={isCustomerPhoneCountryCodeSelectorOpen ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#4f5b67"
                  />
                </Pressable>

                <TextInput
                  autoFocus
                  keyboardType="number-pad"
                  value={customerPhoneInput}
                  onChangeText={(value) => setCustomerPhoneInput(sanitizePhoneDigits(value))}
                  placeholder="Digite o telefone"
                  style={[styles.customerSearchInput, styles.customerSearchPhoneInput]}
                />
              </View>

              {isCustomerPhoneCountryCodeSelectorOpen && (
                <View style={styles.countryCodeSelectorList}>
                  {COUNTRY_CODE_OPTIONS.map((option) => {
                    const isSelected = option.code === customerPhoneCountryCode;
                    return (
                      <Pressable
                        key={option.code}
                        style={[
                          styles.countryCodeOption,
                          isSelected && styles.countryCodeOptionSelected,
                        ]}
                        onPress={() => {
                          setCustomerPhoneCountryCode(option.code);
                          setIsCustomerPhoneCountryCodeSelectorOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.countryCodeOptionText,
                            isSelected && styles.countryCodeOptionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <ScrollView
                style={styles.customerSearchResultsScroll}
                contentContainerStyle={styles.customerSearchResultsScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {customerSearchLoading ? (
                  <Text style={styles.feedbackText}>Buscando cliente...</Text>
                ) : customerSearchError ? (
                  <Text style={styles.errorText}>{customerSearchError}</Text>
                ) : sanitizePhoneDigits(customerPhoneInput).length > 0 ? (
                  customerSearchResults.length > 0 ? (
                    <View style={styles.customerResultsList}>
                      {customerSearchResults.map((customer) => (
                        <Pressable
                          key={customer.id}
                          style={styles.customerResultCard}
                          onPress={() => {
                            setSelectedCustomer(customer);
                            setSelectedAddress(null);
                            setIsCustomerSearchModalOpen(false);
                          }}
                        >
                          <View style={styles.customerResultRow}>
                            <Text numberOfLines={1} style={styles.customerResultName}>
                              {customer.name?.trim() || "Sem nome"}
                            </Text>
                            <Text style={styles.customerResultPhone}>
                              {customer.phone ?? "Sem telefone"}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.feedbackText}>Nenhum cliente encontrado.</Text>
                  )
                ) : (
                  <View />
                )}
              </ScrollView>

              <View style={styles.customerSearchActions}>
                <Pressable
                  style={[styles.customerActionButton, styles.createCustomerTriggerButton]}
                  onPress={() => {
                    setCustomerCreatePhoneInput(
                      buildPhoneWithCountryCode(customerPhoneCountryCode, customerPhoneInput),
                    );
                    setCustomerCreateNameInput("");
                    setCustomerCreateError(null);
                    setIsCustomerPhoneCountryCodeSelectorOpen(false);
                    setIsCustomerSearchModalOpen(false);
                    setIsCreateCustomerModalOpen(true);
                  }}
                >
                  <Text style={styles.createCustomerButtonText}>Criar cliente</Text>
                </Pressable>
                <Pressable
                  style={styles.customerActionButton}
                  onPress={() => {
                    setSelectedCustomer(null);
                    setSelectedAddress(null);
                    setCustomerPhoneInput("");
                    setCustomerPhoneCountryCode(DEFAULT_COUNTRY_CODE);
                    setIsCustomerPhoneCountryCodeSelectorOpen(false);
                    setCustomerCreatePhoneInput("");
                    setCustomerSearchResults([]);
                    setCustomerSearchError(null);
                    setCustomerCreateNameInput("");
                    setCustomerCreateError(null);
                    setIsCustomerSearchModalOpen(false);
                  }}
                >
                  <Text style={styles.customerActionButtonText}>Sem cliente</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isCreateCustomerModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCreateCustomerModalOpen(false)}
        >
          <View style={styles.customerSearchOverlay}>
            <Pressable
              style={styles.customerSearchBackdrop}
              onPress={() => setIsCreateCustomerModalOpen(false)}
            />
            <View style={[styles.customerSearchCard, styles.customerSearchCardFullHeight]}>
              <View style={styles.customerSearchHeader}>
                <Text style={styles.customerSearchTitle}>Criar cliente</Text>
                <Pressable
                  style={styles.customerSearchCloseButton}
                  onPress={() => setIsCreateCustomerModalOpen(false)}
                >
                  <Feather name="x" size={18} color="#2d2d2d" />
                </Pressable>
              </View>

              <TextInput
                value={customerCreateNameInput}
                onChangeText={setCustomerCreateNameInput}
                placeholder="Nome (opcional)"
                style={styles.customerSearchInput}
              />
              <TextInput
                keyboardType="number-pad"
                value={customerCreatePhoneInput}
                onChangeText={setCustomerCreatePhoneInput}
                placeholder="Telefone"
                style={styles.customerSearchInput}
              />

              {!!customerCreateError && (
                <Text style={styles.errorText}>{customerCreateError}</Text>
              )}

              <View style={styles.customerSearchActions}>
                <Pressable
                  style={styles.customerActionButton}
                  onPress={() => {
                    setCustomerCreateError(null);
                    setIsCreateCustomerModalOpen(false);
                  }}
                >
                  <Text style={styles.customerActionButtonText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.customerActionButton,
                    styles.createCustomerButton,
                    customerCreateLoading && styles.createCustomerButtonDisabled,
                  ]}
                  onPress={handleCreateCustomer}
                  disabled={customerCreateLoading}
                >
                  <Text style={styles.createCustomerButtonText}>
                    {customerCreateLoading ? "Criando..." : "Criar cliente"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isAddressSelectorModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsAddressSelectorModalOpen(false)}
        >
          <View style={styles.customerSearchOverlay}>
            <Pressable
              style={styles.customerSearchBackdrop}
              onPress={() => setIsAddressSelectorModalOpen(false)}
            />
            <View style={styles.customerSearchCard}>
              <View style={styles.customerSearchHeader}>
                <Text style={styles.customerSearchTitle}>Selecionar endereço</Text>
                <Pressable
                  style={styles.customerSearchCloseButton}
                  onPress={() => setIsAddressSelectorModalOpen(false)}
                >
                  <Feather name="x" size={18} color="#2d2d2d" />
                </Pressable>
              </View>

              <ScrollView
                style={styles.addressSelectorScroll}
                contentContainerStyle={styles.addressSelectorScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.addressSectionLabel}>Endereços do cliente</Text>
                {customerAddresses.length > 0 ? (
                  <View style={styles.customerResultsList}>
                    {customerAddresses.map((address) => {
                      const displayName = formatCustomerAddress(address);
                      const isSelected =
                        selectedAddress?.source === "CUSTOMER" &&
                        selectedAddress.id === address.id;

                      return (
                        <Pressable
                          key={address.id}
                          style={[
                            styles.addressResultCard,
                            isSelected && styles.addressResultCardSelected,
                          ]}
                          onPress={() => {
                            setSelectedAddress({
                              source: "CUSTOMER",
                              id: address.id,
                              displayName,
                              address,
                            });
                            setIsAddressSelectorModalOpen(false);
                          }}
                        >
                          <Text style={styles.addressResultPrimaryText}>
                            {displayName || "Endereço sem descrição"}
                          </Text>
                          {typeof address.deliveryFee === "number" && (
                            <Text style={styles.addressResultSecondaryText}>
                              Taxa: {formatCurrency(address.deliveryFee)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.feedbackText}>Cliente sem endereços salvos.</Text>
                )}

                <Text style={styles.addressSectionLabel}>Buscar novo endereço</Text>
                <TextInput
                  value={addressSearchInput}
                  onChangeText={setAddressSearchInput}
                  placeholder="Digite rua e número"
                  style={styles.customerSearchInput}
                />

                {addressSearchLoading ? (
                  <Text style={styles.feedbackText}>Buscando endereço...</Text>
                ) : addressSearchError ? (
                  <Text style={styles.errorText}>{addressSearchError}</Text>
                ) : addressSearchInput.trim().length >= 3 ? (
                  addressSearchResults.length > 0 ? (
                    <View style={styles.customerResultsList}>
                      {addressSearchResults.map((result) => {
                        const displayName = formatAddressSearchResult(result);
                        const isSelected =
                          selectedAddress?.source === "SEARCH" &&
                          selectedAddress.id === result.id;

                        return (
                          <Pressable
                            key={result.id}
                            style={[
                              styles.addressResultCard,
                              isSelected && styles.addressResultCardSelected,
                            ]}
                            onPress={() => {
                              setSelectedAddress({
                                source: "SEARCH",
                                id: result.id,
                                displayName,
                                address: result,
                              });
                              setIsAddressSelectorModalOpen(false);
                            }}
                          >
                            <Text style={styles.addressResultPrimaryText}>{displayName}</Text>
                            <Text style={styles.addressResultSecondaryText}>
                              {result.display_name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.feedbackText}>Nenhum endereço encontrado.</Text>
                  )
                ) : (
                  <Text style={styles.feedbackText}>
                    Digite ao menos 3 caracteres para buscar.
                  </Text>
                )}
              </ScrollView>

              <View style={styles.customerSearchActions}>
                <Pressable
                  style={styles.customerActionButton}
                  onPress={() => {
                    setSelectedAddress(null);
                    setAddressSearchInput("");
                    setAddressSearchResults([]);
                    setAddressSearchError(null);
                    setIsAddressSelectorModalOpen(false);
                  }}
                >
                  <Text style={styles.customerActionButtonText}>Sem endereço</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {modifierProduct && (
          <View style={styles.modifierOverlay}>
            <Pressable style={styles.modifierBackdrop} onPress={closeModifierModal} />
            <View style={styles.modifierCard}>
              <View style={styles.modifierHeader}>
                <View style={styles.modifierHeaderTextWrap}>
                  <Text style={styles.modifierTitle}>{modifierProduct.name}</Text>
                  {/* {!!modifierProduct.description && (
                    <Text style={styles.modifierSubtitle}>{modifierProduct.description}</Text>
                  )} */}
                </View>
                <Pressable style={styles.modifierCloseButton} onPress={closeModifierModal}>
                  <Feather name="x" size={20} color="#2d2d2d" />
                </Pressable>
              </View>
              <ScrollView style={styles.modifierBody} contentContainerStyle={styles.modifierBodyContent}>
                {renderableModifierGroups.length === 0 &&
                  (modifierProduct?.comboSlots?.length ?? 0) === 0 && (
                  <Text style={styles.feedbackText}>No modifiers available for this product.</Text>
                )}
                {getComboSlots(modifierProduct ?? { comboSlots: [] }).map((slot) => {
                  const optionCounts = comboSelectionsBySlot[slot.id] ?? {};
                  const totalSelected = Object.values(optionCounts).reduce(
                    (sum, quantity) => sum + quantity,
                    0,
                  );

                  return (
                    <View key={slot.id} style={styles.modifierGroupBlock}>
                      <View style={styles.modifierGroupHeader}>
                        <Text style={styles.modifierGroupTitle}>{getComboSlotTitle(slot)}</Text>
                        <Text style={styles.modifierGroupHint}>
                          {`${totalSelected}/${slot.maxSelect}`}{slot.minSelect > 0 ? ` • mín ${slot.minSelect}` : ""}
                        </Text>
                      </View>

                      <View style={styles.comboOptionsWrap}>
                        {slot.options.map((option) => {
                          const quantity = optionCounts[option.productId] ?? 0;
                          const optionTitle = getComboOptionTitle(option);
                          const extraPrice =
                            typeof option.extraPrice === "number" && Number.isFinite(option.extraPrice)
                              ? option.extraPrice
                              : 0;

                          return (
                            <View key={`${slot.id}-${option.productId}`} style={styles.comboOptionRow}>
                              <View style={styles.comboOptionInfo}>
                                <Text style={styles.comboOptionTitle}>{optionTitle}</Text>
                                {extraPrice > 0 ? (
                                  <Text style={styles.comboOptionPrice}>
                                    +{formatCurrency(extraPrice)}
                                  </Text>
                                ) : null}
                              </View>
                              <View style={styles.comboOptionControls}>
                                <Pressable
                                  style={styles.comboOptionButton}
                                  onPress={() => updateComboOptionQuantity(slot, option, -1)}
                                >
                                  <Feather name="minus" size={14} color="#2d2d2d" />
                                </Pressable>
                                <Text style={styles.comboOptionQty}>{quantity}</Text>
                                <Pressable
                                  style={styles.comboOptionButton}
                                  onPress={() => updateComboOptionQuantity(slot, option, 1)}
                                >
                                  <Feather name="plus" size={14} color="#2d2d2d" />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
                {renderableModifierGroups.map((group) => {
                    const selectedIds = modifierSelections[group.id] ?? [];
                    const selectedSet = new Set(selectedIds);
                    const { maxSelection } = getSelectionBounds(group);
                    const selectionHint =
                      maxSelection >= Number.MAX_SAFE_INTEGER
                        ? "Selecione"
                        : `Select up to ${maxSelection}`;

                    return (
                      <View key={group.id} style={styles.modifierGroupBlock}>
                        <View style={styles.modifierGroupHeader}>
                          <Text style={styles.modifierGroupTitle}>{group.title}</Text>
                          <Text style={styles.modifierGroupHint}>
                            {selectionHint}{group.required ? " *" : ""}
                          </Text>
                        </View>

                        <View style={styles.modifierItemsWrap}>
                          {group.items.map((item) => {
                            const isSelected = selectedSet.has(item.id);

                            return (
                              <Pressable
                                key={`${group.id}-${item.id}`}
                                onPress={() => toggleModifierItem(group, item)}
                                style={[
                                  styles.modifierItemChip,
                                  isSelected && styles.modifierItemChipSelected,
                                ]}
                              >
                                {isSelected && (
                                  <Feather name="check" size={14} color="#2f6ed6" />
                                )}
                                <Text
                                  style={[
                                    styles.modifierItemChipText,
                                    isSelected && styles.modifierItemChipTextSelected,
                                  ]}
                                >
                                  {item.name}
                                  {item.price > 0 ? ` ${formatCurrency(item.price)}` : ""}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}

                <View style={styles.commentBlock}>
                  <Text style={styles.commentTitle}>Comentário do item</Text>
                  <TextInput
                    value={itemComment}
                    onChangeText={setItemComment}
                    placeholder="Ex: sem cebola, cortar em 8..."
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    style={styles.commentInput}
                  />
                </View>
              </ScrollView>

              <View style={styles.modifierFooter}>
                <Pressable
                  style={styles.clearAllButton}
                  onPress={() => {
                    setModifierSelections({});
                    setItemComment("");
                  }}
                >
                  <Text style={styles.clearAllButtonText}>Clear all</Text>
                </Pressable>
                <Pressable style={styles.applyButton} onPress={applyModifiersAndAddProduct}>
                  <Text style={styles.applyButtonText}>Apply</Text>
                </Pressable>
              </View>

              {!!modifierValidationError && (
                <Text style={styles.modifierValidationError}>{modifierValidationError}</Text>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f1f2f4",
  },
  header: {
    minHeight: 64,
    // borderBottomWidth: 1,
    // borderBottomColor: "#dddddd",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: 12,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: "#666666",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dedede",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  body: {
    flex: 1,
    flexDirection: "row",
    // gap: 12,
    // padding: 12,
  },
  productsSection: {
    flex: 1,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  categoryTabsContainer: {
    zIndex: 2,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderBottomColor: "#f0f1f3",
    borderTopColor: "#f0f1f3",
    paddingVertical: 10,
  },
  promotionSection: {
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  promotionSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  promotionRow: {
    gap: 10,
    paddingRight: 8,
  },
  promotionCard: {
    width: 260,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F0D285",
    backgroundColor: "#FFF8DD",
    padding: 14,
    gap: 12,
  },
  promotionName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#7A5800",
  },
  promotionProductsWrap: {
    gap: 8,
  },
  promotionProductChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7C86E",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  promotionProductChipTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1D2B3A",
  },
  promotionProductChipPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8A6400",
  },
  categoryTabsScroll: {
    flexGrow: 0,
  },
  categoryTabs: {
    gap: 10,
    paddingHorizontal: 12,
  },
  categoryTab: {
    width: 150,
    height: 100,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dddddd",
    backgroundColor: "#f7f7f8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  categoryTabActive: {
    borderColor: "#4d91ff",
    backgroundColor: "#f1f7ff",
  },
  categoryTabTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  categoryTabTitleActive: {
    color: "#2f6ed6",
  },
  categoryTabCount: {
    fontSize: 14,
    color: "#777777",
    fontWeight: "500",
  },
  productsScroll: {
    flex: 1,
    zIndex: 1,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignContent: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
  },
  productCard: {
    width: 170,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dddddd",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  productCardSelected: {
    borderColor: "#4d91ff",
    borderWidth: 2,
  },
  addProductCard: {
    height: 188,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#f8f9fa",
  },
  addProductText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  productImage: {
    width: "100%",
    height: 100,
    backgroundColor: "#eeeeee",
  },
  productImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  productPrice: {
    fontSize: 15,
    color: "#5a5a5a",
    fontWeight: "600",
  },
  orderSection: {
    width: 360,
    // borderRadius: 14,
    // borderWidth: 1,
    // borderColor: "#dedede",
    backgroundColor: "#ffffff",
    // padding: 12,
    // gap: 10,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4f4f4f",
  },
  orderTypeSwitch: {
    // borderRadius: 10,
    // borderWidth: 1,
    // borderColor: "#dedede",
    // backgroundColor: "#f6f7f9",
    // padding: 4,
    flexDirection: "row",
    // gap: 6,
  },
  orderTypeOption: {
    flex: 1,
    minHeight: 48,
    // borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dddddd",
    justifyContent: "center",
  },
  orderTypeOptionActive: {
    // backgroundColor: "#ffffff",
    borderWidth: 1,
    // borderColor: "#d6d9dd",
    borderColor: "#4d91ff",
    backgroundColor: "#f1f7ff",
  },
  orderTypeOptionText: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "700",
  },
  orderTypeOptionTextActive: {
    color: "#2f6ed6",
  },
  customerInputWrap: {
    height: 48,
    // borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dedede",
    // backgroundColor: "#f8f8f9",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  disabledInputWrap: {
    backgroundColor: "#f1f2f4",
    borderColor: "#e7e7e9",
  },
  disabledInputText: {
    color: "#a0a0a0",
  },
  customerInput: {
    flex: 1,
    fontSize: 15,
    color: "#2d2d2d",
  },
  customerInputPreview: {
    flex: 1,
    fontSize: 15,
    color: "#2d2d2d",
    fontWeight: "600",
  },
  customerInputPlaceholder: {
    color: "#8a8a8a",
    fontWeight: "500",
  },
  customerSearchOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 0,
  },
  customerSearchBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000066",
  },
  customerSearchCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "80%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 12,
  },
  customerSearchCardFullHeight: {
    maxHeight: "100%",
    flex: 1,
    minHeight: 0,
  },
  customerSearchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customerSearchTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  customerSearchCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  customerSearchInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#2d2d2d",
  },
  customerSearchPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerSearchPhoneInput: {
    flex: 1,
  },
  countryCodeSelectorButton: {
    minWidth: 96,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#f7f8fa",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  countryCodeSelectorButtonOpen: {
    borderColor: "#7f8ea3",
  },
  countryCodeSelectorButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4f5b67",
  },
  countryCodeSelectorList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  countryCodeOption: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
  },
  countryCodeOptionSelected: {
    backgroundColor: "#eef4ff",
  },
  countryCodeOptionText: {
    fontSize: 14,
    color: "#4f5b67",
    fontWeight: "600",
  },
  countryCodeOptionTextSelected: {
    color: "#2b57d6",
  },
  customerSearchResultsScroll: {
    flex: 1,
    minHeight: 0,
  },
  customerSearchResultsScrollContent: {
    paddingVertical: 2,
    flexGrow: 1,
  },
  addressSelectorScroll: {
    maxHeight: 420,
  },
  addressSelectorScrollContent: {
    paddingVertical: 2,
    gap: 10,
  },
  addressSectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5d6570",
  },
  addressResultCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dfe6ef",
    backgroundColor: "#f8fbff",
    padding: 12,
    gap: 4,
  },
  addressResultCardSelected: {
    borderColor: "#6f9ef5",
    backgroundColor: "#edf4ff",
  },
  addressResultPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  addressResultSecondaryText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#5f6975",
  },
  customerResultCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dfe6ef",
    backgroundColor: "#f8fbff",
    padding: 9,
    gap: 4,
  },
  customerResultsList: {
    gap: 8,
  },
  customerResultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  customerResultName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  customerResultPhone: {
    fontSize: 12,
    color: "#5a6672",
    fontWeight: "600",
  },
  customerSearchActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  createCustomerTriggerButton: {
    borderColor: "#5a84f5",
    backgroundColor: "#eaf1ff",
  },
  createCustomerButton: {
    borderColor: "#5a84f5",
    backgroundColor: "#eaf1ff",
  },
  createCustomerButtonDisabled: {
    opacity: 0.7,
  },
  createCustomerButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2b57d6",
  },
  customerActionButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#f7f8fa",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  customerActionButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4f5b67",
  },
  orderLabel: {
    marginTop: 2,
  },
  orderList: {
    // maxHeight: 300,
  },
  orderListContent: {
    // gap: 10,
    paddingBottom: 6,
    borderLeftWidth: 1,
    borderLeftColor: "#f0f1f3",
    // borderTopColor: "#f0f1f3",
    // flex: 1,
  },
  orderItemRow: {
    // borderRadius: 10,
    borderBottomWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    paddingHorizontal: 8
  },
  orderItemRowGift: {
    backgroundColor: "#f5f9ff",
  },
  orderItemMain: {
    flex: 1,
    gap: 8,
  },
  orderItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  orderItemModifiersText: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "500",
  },
  orderItemCommentInput: {
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#2d2d2d",
    backgroundColor: "#fbfbfb",
    minHeight: 36,
    textAlignVertical: "top",
  },
  orderItemActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8d8d8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2d2d2d",
    minWidth: 16,
    textAlign: "center",
  },
  orderItemAmountWrap: {
    alignItems: "flex-end",
    gap: 2,
  },
  orderItemAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  giftBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#9fc1f9",
    backgroundColor: "#eaf3ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  giftBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2f6ed6",
  },
  giftLockedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6f7f91",
  },
  totalsCard: {
    // borderRadius: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#dedede",
    // backgroundColor: "#fafafb",
    padding: 12,
    gap: 8,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  totalLabel: {
    fontSize: 15,
    color: "#5f5f5f",
    fontWeight: "500",
  },
  totalValue: {
    fontSize: 15,
    color: "#2d2d2d",
    fontWeight: "700",
  },
  totalDiscountValue: {
    fontSize: 15,
    color: "#1f8f57",
    fontWeight: "700",
  },
  totalInput: {
    width: 110,
    height: 36,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: "700",
    color: "#2d2d2d",
    backgroundColor: "#ffffff",
    textAlign: "right",
  },
  totalRowStrong: {
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e3e3e3",
  },
  totalStrongLabel: {
    fontSize: 18,
    color: "#2d2d2d",
    fontWeight: "700",
  },
  totalStrongValue: {
    fontSize: 18,
    color: "#2d2d2d",
    fontWeight: "800",
  },
  paymentLabel: {
    marginTop: 2,
  },
  required: {
    color: "#d26464",
  },
  paymentSwitch: {
    // borderRadius: 10,
    // borderWidth: 1,
    // borderColor: "#dedede",
    // backgroundColor: "#f6f7f9",
    // padding: 4,
    flexDirection: "row",
    // gap: 6,
  },
  paymentOption: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentOptionActive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6d9dd",
  },
  paymentOptionText: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "700",
  },
  paymentOptionTextActive: {
    color: "#2d2d2d",
  },
  makeOrderButton: {
    // marginTop: "auto",
    minHeight: 48,
    // borderRadius: 10,
    backgroundColor: "#3f67da",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  makeOrderButtonDisabled: {
    opacity: 0.6,
  },
  makeOrderButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  createOrderErrorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#b3261e",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  feedbackText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666666",
  },
  errorText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#b3261e",
  },
  modifierOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modifierBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000066",
  },
  modifierCard: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d6d9dd",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  modifierHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#e3e3e3",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modifierHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  modifierTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  modifierSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666666",
  },
  modifierCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modifierBody: {
    // flex: 1,
  },
  modifierBodyContent: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 12,
  },
  modifierGroupBlock: {
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eceff3",
    paddingBottom: 12,
  },
  modifierGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modifierGroupTitle: {
    fontSize: 27,
    fontWeight: "700",
    color: "#2d2d2d",
    flex: 1,
  },
  modifierGroupHint: {
    fontSize: 17,
    fontWeight: "600",
    color: "#7d7d7d",
  },
  modifierItemsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  comboOptionsWrap: {
    gap: 10,
  },
  comboOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  comboOptionInfo: {
    flex: 1,
    gap: 3,
  },
  comboOptionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  comboOptionPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8A6400",
  },
  comboOptionControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  comboOptionButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  comboOptionQty: {
    minWidth: 18,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#2d2d2d",
  },
  commentBlock: {
    gap: 8,
    paddingBottom: 6,
  },
  commentTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2d2d2d",
  },
  commentInput: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d9dce0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#2d2d2d",
  },
  modifierItemChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9dce0",
    backgroundColor: "#ffffff",
    minHeight: 36,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modifierItemChipSelected: {
    borderColor: "#9fc1f9",
    backgroundColor: "#eef5ff",
  },
  modifierItemChipText: {
    fontSize: 18,
    color: "#3d3d3d",
    fontWeight: "600",
  },
  modifierItemChipTextSelected: {
    color: "#2f6ed6",
  },
  modifierFooter: {
    borderTopWidth: 1,
    borderTopColor: "#e3e3e3",
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  clearAllButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  clearAllButtonText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#2d2d2d",
  },
  applyButton: {
    minHeight: 42,
    minWidth: 130,
    borderRadius: 999,
    backgroundColor: "#2f8f64",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  applyButtonText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
  },
  modifierValidationError: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#b3261e",
  },
});
