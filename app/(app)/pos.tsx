import { parsePhoneNumber } from "libphonenumber-js";
import { API_BASE_URL } from "@/constants/api";
import { useAuth } from "@/contexts/auth";
import { TabletTopBar } from "@/components/TabletTopBar";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:     "#0a0807",
  surf:   "#181310",
  surf2:  "#1e1812",
  surf3:  "#2a211b",
  line:   "rgba(250,245,238,0.08)",
  lineA:  "rgba(250,245,238,0.14)",
  text:   "#faf5ee",
  dim:    "rgba(250,245,238,0.72)",
  faint:  "rgba(250,245,238,0.52)",
  vfaint: "rgba(250,245,238,0.30)",
  zippy:  "#ff3d14",
  green:  "#34d39a",
  amber:  "#f2b338",
  blue:   "#4a9eff",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type TranslationMap = Record<string, Record<string, string>>;

type TModifierGroupItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  photo?: { id: string; url: string };
  translations?: TranslationMap;
};

type TModifierGroup = {
  id: string;
  title: string;
  required: boolean;
  type: "MULTI" | "SINGLE" | null;
  minSelection: number | null;
  maxSelection: number | null;
  translations?: TranslationMap;
  items: TModifierGroupItem[];
};

type TComboSlotOption = {
  id: string;
  productId: string;
  productName: string;
  productTranslations?: TranslationMap;
  productPhotoUrl?: string;
  extraPrice: number;
  sortIndex: number | null;
};

type TComboSlot = {
  id: string;
  name: string;
  translations?: TranslationMap;
  minSelect: number;
  maxSelect: number;
  allowDuplicates: boolean;
  sortIndex: number | null;
  options: TComboSlotOption[];
};

type TProduct = {
  id: string;
  name: string;
  visible: boolean;
  itemType: "PRODUCT" | "COMBO";
  price?: number;
  description?: string;
  comparedAtPrice?: number;
  categoryIndex?: number;
  translations?: TranslationMap;
  modifierGroups: TModifierGroup[];
  photos?: Array<{ id: string; url: string }>;
  comboSlots: TComboSlot[];
  products: Array<{ productId: string; quantity: number; productName: string; productTranslations?: TranslationMap }>;
};

type TCategory = {
  id: string;
  title: string;
  menuIndex: number | null;
  translations?: TranslationMap;
  products: TProduct[];
};

type TProgressiveDiscountStep = {
  id: string;
  type: string;
  amount?: number;
  discount?: number;
  prizes: Array<{
    id: string;
    name: string;
    quantity: number;
    imageUrl: string | null;
    progressiveDiscountStepId: string;
    products: Array<{ id: string; name: string; price: number | null; photos: Array<{ id: string; url: string }> }>;
  }>;
};

type TProgressiveDiscount = {
  id: string;
  steps: TProgressiveDiscountStep[];
} | null;

type TAddress = {
  id: string;
  createdAt: string;
  description: string;
  street: string;
  number: string;
  city: string;
  state: string;
  zipCode: string;
  lat: string;
  lng: string;
  complement: string | null;
  numberComplement: string | null;
  customerId: string | null;
  deliveryFee: number;
};

type TCustomer = {
  id: string;
  createdAt: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  addresses: TAddress[];
};

type TSelectedModifiers = Record<string, string[]>; // groupId → itemIds[]

type TCartItem = {
  uid: number;
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  selectedModifiers: TSelectedModifiers;
  note: string;
  colorIdx: number;
  imageUrl?: string | null;
  orderProductId?: string;
  existingModifierItemIds?: string[];
};

type TOrderPayment = {
  id?: string;
  paymentId?: string;
  createdAt: string;
  amount: number;
  paidAt?: string | null;
  paymentType: "CASH" | "CARD" | "ZELLE";
  paymentProvider?: "STRIPE" | null;
  externalId?: string | null;
  orderId: string;
};

type TLocalPayment = {
  id: string; // local row key
  paymentId?: string; // backend payment id from payments array
  serverId?: string; // server UUID; undefined = not yet persisted
  sourceIndex?: number; // index from the payments array returned by the API
  persisted?: boolean;
  type: "CASH" | "CARD" | "ZELLE";
  amount: number; // cents
};

type TPaymentPatchPayload = Partial<
  Pick<TOrderPayment, "amount" | "paymentType" | "paymentProvider" | "externalId" | "paidAt">
>;

function getOrderPaymentId(payment: Partial<TOrderPayment> | null | undefined): string | null {
  if (!payment) return null;

  const candidate =
    (typeof payment.id === "string" && payment.id.trim().length > 0 ? payment.id : null)
    ?? (typeof payment.paymentId === "string" && payment.paymentId.trim().length > 0 ? payment.paymentId : null);

  return candidate;
}

function resolvePaymentId(
  localPayment: TLocalPayment | null | undefined,
  serverPayment?: TOrderPayment | null
): string | null {
  return (
    getOrderPaymentId(serverPayment)
    ?? localPayment?.paymentId
    ?? localPayment?.serverId
    ?? null
  );
}

function mapServerPaymentToLocal(payment: TOrderPayment, sourceIndex: number): TLocalPayment {
  const paymentId = getOrderPaymentId(payment) ?? "";
  const rowKey =
    paymentId
    || payment.externalId
    || [sourceIndex, payment.createdAt, payment.paymentType, payment.amount].filter(Boolean).join("-");

  return {
    id: rowKey,
    paymentId: paymentId || undefined,
    serverId: paymentId || undefined,
    sourceIndex,
    persisted: true,
    type: payment.paymentType,
    amount: payment.amount,
  };
}

type TEditOrder = {
  id: string;
  sourcePlatform?: "FOODY" | "DOORDASH" | "UBER_EATS" | "SQUARE" | null;
  type: "DELIVERY" | "TAKEAWAY";
  paymentMethod: "CARD" | "CASH" | "ZELLE";
  tip?: number | null;
  tipAmount?: number | null;
  amount?: number | null;
  paidAt?: string | null;
  payments?: TOrderPayment[];
  customer?: { id: string; name: string; phone?: string | null } | null;
  deliveryAddress?: {
    id: string;
    street: string;
    number: string;
    complement?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: string;
    lng?: string;
    deliveryFee?: number;
  } | null;
  orderProducts: {
    id: string;
    productId: string;
    comments?: string;
    comment?: string;
    description?: string;
    amount: number;
    quantity: number;
    selectedModifierGroupItemIds?: string[];
    product?: { id: string; name: string; price?: number | null };
  }[];
};

// External marketplace sources (imported via Square). FOODY = internal, editable.
const ORDER_SOURCE_CFG: Record<
  "DOORDASH" | "UBER_EATS" | "SQUARE",
  { label: string; fg: string; bg: string }
> = {
  DOORDASH: { label: "DoorDash", fg: "#ff6a4d", bg: "rgba(235,23,0,0.16)" },
  UBER_EATS: { label: "Uber Eats", fg: "#4fd87a", bg: "rgba(6,193,103,0.16)" },
  SQUARE: { label: "Square", fg: "#5aa9ff", bg: "rgba(74,158,255,0.16)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
let _uid = 0;
const nextUid = () => ++_uid;

function fmt(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

function buildPaymentPatchPayload(
  current: TLocalPayment,
  next: { type: "CASH" | "CARD" | "ZELLE"; amount: number }
): TPaymentPatchPayload {
  const payload: TPaymentPatchPayload = {};

  if (current.amount !== next.amount) {
    payload.amount = next.amount;
  }

  if (current.type !== next.type) {
    payload.paymentType = next.type;
  }

  return payload;
}

function initials(s: string | null | undefined) {
  if (!s) return "?";
  return s
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const phone = parsePhoneNumber("+" + raw);
    return phone.formatNational();
  } catch {
    return raw;
  }
}

const GRAD_PAIRS: Array<[string, string]> = [
  ["#6b2916", "#3d1409"],
  ["#6b4516", "#3d2809"],
  ["#4a6b16", "#2b3d09"],
  ["#166b3e", "#093d22"],
  ["#163e6b", "#09223d"],
  ["#3e166b", "#22093d"],
  ["#6b163e", "#3d0922"],
  ["#6b5516", "#3d3409"],
];

function productColorIdx(id: string): number {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % GRAD_PAIRS.length;
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function modifierItemLabel(item: TModifierGroupItem) {
  return item.description ?? item.name;
}

function groupTitle(g: TModifierGroup) {
  return g.title;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconUser = ({ color = D.faint, size = 15 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth="1.75" />
  </Svg>
);

const IconPin = ({ color = D.faint, size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="12" cy="10" r="3" stroke={color} strokeWidth="1.75" />
  </Svg>
);

const IconBag = ({ color = D.faint, size = 32 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M16 10a4 4 0 0 1-8 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconCheck = ({ color = "#fff", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconTrash = ({ color = D.faint, size = 13 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconSearch = ({ color = D.faint, size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="1.75" />
    <Path d="M21 21l-4.35-4.35" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
  </Svg>
);

const IconX = ({ color = D.faint, size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

const IconChevron = ({ color = D.faint, size = 11 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconEdit = ({ color = D.faint, size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconNote = ({ color = D.faint, size = 11 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
  </Svg>
);

const IconMoto = ({ color = D.faint, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="5.5" cy="17" r="2.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="18" cy="17" r="2.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M8 17h6l2-5h3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5.5 14.4 8 8h3l1.6 4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 8h3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconTakeaway = ({ color = D.faint, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 8h12l-1 12H7z" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 8a3 3 0 0 1 6 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconCash = ({ color = D.faint, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <Circle cx="12" cy="12" r="2.5" stroke={color} strokeWidth="1.6" />
    <Path d="M6 9.5v0M18 14.5v0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

const IconCard = ({ color = D.faint, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <Path d="M2.5 9.5h19" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <Path d="M6 15h4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

const IconZelle = ({ color = D.faint, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 5h16M4 19h16M8 5l8 14M16 5L8 19" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ── Segmented Control ─────────────────────────────────────────────────────────
function SegmentedControl({ options, value, onChange, style }: {
  options: Array<{ id: string; label: string; badge?: number }>;
  value: string;
  onChange: (id: string) => void;
  style?: object;
}) {
  return (
    <View style={[s.segControl, style]}>
      {options.map((opt) => {
        const on = value === opt.id;
        return (
          <Pressable key={opt.id} onPress={() => onChange(opt.id)} style={[s.segBtn, on && s.segBtnActive]}>
            <Text style={[s.segBtnText, on && s.segBtnTextActive]}>{opt.label}</Text>
            {!!opt.badge && (
              <View style={s.segBadge}><Text style={s.segBadgeText}>{opt.badge}</Text></View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Select Card (large touch-first icon+label card) ──────────────────────────
function SelectCard({ icon, label, active, onPress }: {
  icon: (color: string, size: number) => React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.selectCard, active && s.selectCardActive, { opacity: pressed ? 0.85 : 1 }]}
    >
      {icon(active ? D.zippy : D.faint, 22)}
      <Text style={[s.selectCardLabel, { color: active ? D.text : D.faint }]}>{label}</Text>
    </Pressable>
  );
}

// ── Category Rail ─────────────────────────────────────────────────────────────
type CatItem = { id: string; label: string; count: number };

function CategoryRail({
  cats,
  active,
  onSelect,
  cartCountByCat,
}: {
  cats: CatItem[];
  active: string;
  onSelect: (id: string) => void;
  cartCountByCat: Record<string, number>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.rail}
      contentContainerStyle={s.railContent}
    >
      {cats.map((cat) => {
        const isActive = active === cat.id;
        const inCart =
          cat.id === "all"
            ? Object.values(cartCountByCat).reduce((a, b) => a + b, 0)
            : cartCountByCat[cat.id] ?? 0;
        return (
          <Pressable
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            style={[s.railBtn, isActive && s.railBtnActive]}
          >
            <Text style={[s.railBtnText, isActive && s.railBtnTextActive]}>
              {cat.label}
            </Text>
            {inCart > 0 ? (
              <View style={s.railCartBadge}>
                <Text style={s.railCartBadgeText}>{inCart}</Text>
              </View>
            ) : (
              <Text style={s.railCount}>{cat.count}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({
  product,
  qty,
  colorIdx,
  onAdd,
  onDec,
}: {
  product: TProduct;
  qty: number;
  colorIdx: number;
  onAdd: (p: TProduct) => void;
  onDec: (p: TProduct) => void;
}) {
  const [pressed, setPressed] = useState(false);
  const hasQty = qty > 0;
  const hasModifiers = product.modifierGroups.length > 0;
  const colors = GRAD_PAIRS[colorIdx];
  const price = product.price ?? 0;
  const imgUri = product.photos?.[0]?.url;

  return (
    <Pressable
      onPress={() => onAdd(product)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        s.productCard,
        hasQty && s.productCardActive,
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {/* Thumbnail */}
      {imgUri ? (
        <View style={s.productThumb}>
          <Image source={{ uri: imgUri }} style={s.productThumbImg} resizeMode="cover" />
          {hasQty && (
            <View style={s.productQtyBadge}>
              <Text style={s.productQtyBadgeText}>{qty}×</Text>
            </View>
          )}
        </View>
      ) : (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.productThumb}
        >
          <Text style={s.productThumbText}>{initials(product.name)}</Text>
          {hasQty && (
            <View style={s.productQtyBadge}>
              <Text style={s.productQtyBadgeText}>{qty}×</Text>
            </View>
          )}
        </LinearGradient>
      )}

      {/* Info */}
      <View style={s.productInfo}>
        <Text style={s.productName} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={s.productRow}>
          <Text style={[s.productPrice, hasQty && { color: D.zippy }]}>
            {fmt(price)}
          </Text>
          {hasModifiers ? (
            hasQty ? (
              <View style={[s.addBtn, { borderColor: D.zippy, backgroundColor: "rgba(255,61,20,0.12)" }]}>
                <Text style={[s.addBtnText, { color: D.zippy }]}>{qty}× · + Add</Text>
              </View>
            ) : (
              <View style={s.addBtn}>
                <Text style={s.addBtnText}>Personalizar</Text>
              </View>
            )
          ) : hasQty ? (
            <View style={s.qtyControl}>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onDec(product); }}
                style={[s.qtyBtn, s.qtyBtnLeft]}
              >
                <Text style={s.qtyBtnText}>−</Text>
              </Pressable>
              <View style={s.qtyNum}>
                <Text style={s.qtyNumText}>{qty}</Text>
              </View>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onAdd(product); }}
                style={[s.qtyBtn, s.qtyBtnRight]}
              >
                <Text style={[s.qtyBtnText, { color: "#fff" }]}>+</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.addBtn}>
              <Text style={s.addBtnText}>+ Add</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ── Product Grid ──────────────────────────────────────────────────────────────
function ProductGrid({
  products,
  cartQtyByProductId,
  colorIdxByProductId,
  onAdd,
  onDec,
}: {
  products: TProduct[];
  cartQtyByProductId: Record<string, number>;
  colorIdxByProductId: Record<string, number>;
  onAdd: (p: TProduct) => void;
  onDec: (p: TProduct) => void;
}) {
  const [cols, setCols] = useState(4);
  const [containerW, setContainerW] = useState(0);

  const ITEM_MARGIN = 5;
  const GRID_PADDING = 10;
  const cardWidth = containerW > 0
    ? (containerW - GRID_PADDING * 2 - ITEM_MARGIN * 2 * cols) / cols
    : 168;

  if (products.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: D.faint, fontFamily: "GeistMono_400Regular", fontSize: 11, letterSpacing: 1 }}>
          NENHUM PRODUTO
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      key={cols}
      data={products}
      keyExtractor={(p) => p.id}
      numColumns={cols}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setContainerW(w);
        setCols(Math.max(2, Math.floor(w / 168)));
      }}
      contentContainerStyle={s.gridContent}
      columnWrapperStyle={cols > 1 ? s.gridRow : undefined}
      renderItem={({ item: p }) => (
        <View style={{ width: cardWidth, margin: ITEM_MARGIN }}>
          <ProductCard
            product={p}
            qty={cartQtyByProductId[p.id] ?? 0}
            colorIdx={colorIdxByProductId[p.id] ?? 0}
            onAdd={onAdd}
            onDec={onDec}
          />
        </View>
      )}
    />
  );
}

// ── Cart Item Row ─────────────────────────────────────────────────────────────
function CartItemRow({
  item,
  onInc,
  onDec,
  onRemove,
  onNoteChange,
}: {
  item: TCartItem;
  onInc: (uid: number) => void;
  onDec: (uid: number) => void;
  onRemove: (uid: number) => void;
  onNoteChange: (uid: number, note: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const colors = GRAD_PAIRS[item.colorIdx];
  const modCount = Object.values(item.selectedModifiers).flat().length + (item.existingModifierItemIds?.length ?? 0);

  return (
    <View style={s.cartItem}>
      <View style={s.cartItemTop}>
        {/* Thumb */}
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={[s.cartThumb, { borderRadius: 9 }]} resizeMode="cover" />
        ) : (
          <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cartThumb}>
            <Text style={s.cartThumbText}>{initials(item.name)}</Text>
          </LinearGradient>
        )}

        {/* Name + modifiers */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.cartItemName} numberOfLines={2}>{item.name}</Text>
          {modCount > 0 && (
            <Text style={s.cartItemMods} numberOfLines={1}>
              {modCount} opção{modCount !== 1 ? "ões" : ""} selecionada{modCount !== 1 ? "s" : ""}
            </Text>
          )}
        </View>

        {/* Price + qty controls */}
        <View style={s.cartItemRight}>
          <Text style={s.cartItemPrice}>{fmt(item.lineTotal)}</Text>
          <View style={s.qtyControl}>
            <Pressable onPress={() => onDec(item.uid)} style={[s.qtyBtn, s.qtyBtnLeft]}>
              <Text style={s.qtyBtnText}>−</Text>
            </Pressable>
            <View style={s.qtyNum}>
              <Text style={s.qtyNumText}>{item.qty}</Text>
            </View>
            <Pressable onPress={() => onInc(item.uid)} style={[s.qtyBtn, s.qtyBtnRight]}>
              <Text style={[s.qtyBtnText, { color: "#fff" }]}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Note row */}
      <View style={s.cartItemNoteRow}>
        {editingNote || item.note ? (
          <TextInput
            value={item.note}
            onChangeText={(v) => onNoteChange(item.uid, v)}
            onBlur={() => { if (!item.note) setEditingNote(false); }}
            autoFocus={editingNote && !item.note}
            placeholder="Observação do item…"
            placeholderTextColor={D.vfaint}
            style={s.cartItemNoteInput}
          />
        ) : (
          <Pressable onPress={() => setEditingNote(true)} style={s.cartItemNoteBtn}>
            <IconNote color={D.faint} size={11} />
            <Text style={s.cartItemNoteBtnText}>Observação</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onRemove(item.uid)} style={{ padding: 4, marginLeft: "auto" }}>
          <IconTrash color={D.faint} size={13} />
        </Pressable>
      </View>
    </View>
  );
}

// ── Modifier Modal ────────────────────────────────────────────────────────────
function ModifierModal({
  product,
  onClose,
  onAdd,
}: {
  product: TProduct;
  onClose: () => void;
  onAdd: (product: TProduct, selected: TSelectedModifiers, totalPrice: number) => void;
}) {
  const groups = product.modifierGroups ?? [];
  const [selected, setSelected] = useState<TSelectedModifiers>({});
  const [comment, setComment] = useState("");

  const extraPrice = useMemo(() => {
    let total = 0;
    for (const [gid, itemIds] of Object.entries(selected)) {
      const grp = groups.find((g) => g.id === gid);
      if (!grp) continue;
      for (const iid of itemIds) {
        const item = grp.items.find((i) => i.id === iid);
        if (item) total += item.price;
      }
    }
    return total;
  }, [selected, groups]);

  const totalPrice = (product.price ?? 0) + extraPrice;

  function toggleItem(groupId: string, itemId: string, maxSel: number) {
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      if (cur.includes(itemId)) {
        return { ...prev, [groupId]: cur.filter((id) => id !== itemId) };
      }
      if (maxSel === 1) {
        return { ...prev, [groupId]: [itemId] };
      }
      if (cur.length >= maxSel) return prev; // max reached, block
      return { ...prev, [groupId]: [...cur, itemId] };
    });
  }

  const allRequiredMet = groups
    .filter((g) => g.required || (g.minSelection ?? 0) > 0)
    .every((g) => (selected[g.id]?.length ?? 0) >= (g.minSelection ?? 1));

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={s.modifierSheet} onPress={() => {}}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{product.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <Text style={s.modalSubtitle}>Base {fmt(product.price ?? 0)}</Text>
                {extraPrice > 0 && (
                  <Text style={[s.modalSubtitle, { color: D.zippy, fontFamily: "GeistMono_700Bold" }]}>
                    → {fmt(totalPrice)}
                  </Text>
                )}
              </View>
            </View>
            <Pressable onPress={onClose} style={s.modalCloseBtn}>
              <IconX color={D.text} size={16} />
            </Pressable>
          </View>

          {/* Groups */}
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 20 }}>
            {groups.map((grp) => {
              const selIds = selected[grp.id] ?? [];
              const max = grp.maxSelection ?? 1;
              const min = grp.minSelection ?? (grp.required ? 1 : 0);
              const isRequired = grp.required || min > 0;
              const met = selIds.length >= min;
              const unmet = isRequired && !met;
              const atMax = selIds.length >= max;

              return (
                <View key={grp.id} style={[
                  { marginBottom: 16, padding: 14, borderRadius: 12, borderWidth: 1.5 },
                  unmet
                    ? { borderColor: "rgba(255,61,20,0.35)", backgroundColor: "rgba(255,61,20,0.05)" }
                    : met && isRequired
                      ? { borderColor: "rgba(52,211,154,0.25)", backgroundColor: "rgba(52,211,154,0.04)" }
                      : { borderColor: D.line, backgroundColor: "transparent" },
                ]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      {isRequired && (
                        <View style={{
                          width: 6, height: 6, borderRadius: 3,
                          backgroundColor: unmet ? D.zippy : D.green,
                          flexShrink: 0,
                        }} />
                      )}
                      <Text style={[s.modGroupTitle, { flex: 1 }]} numberOfLines={1}>{groupTitle(grp)}</Text>
                    </View>
                    <View style={[
                      s.modGroupBadge,
                      unmet && { backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.30)" },
                      (met && isRequired) || atMax ? { backgroundColor: "rgba(52,211,154,0.12)", borderColor: "rgba(52,211,154,0.28)" } : null,
                    ]}>
                      <Text style={[
                        s.modGroupBadgeText,
                        unmet && { color: D.zippy },
                        met && isRequired && { color: D.green },
                        atMax && !unmet && { color: D.green },
                      ]}>
                        {unmet
                          ? `OBRIGATÓRIO · ${selIds.length}/${min}`
                          : atMax && max > 1
                            ? `${selIds.length}/${max} · Máximo`
                            : max > 1
                              ? `${selIds.length}/${max} sel.`
                              : min > 0
                                ? `Escolha ${min}`
                                : `Até ${max}`}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {grp.items.map((item) => {
                      const isSel = selIds.includes(item.id);
                      const disabled = atMax && !isSel;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => { if (!disabled) toggleItem(grp.id, item.id, max); }}
                          style={[
                            s.modItem,
                            isSel && s.modItemSel,
                            { flexBasis: "48%", flexGrow: 1 },
                            disabled && { opacity: 0.38 },
                          ]}
                        >
                          <Text style={[s.modItemLabel, isSel && { color: D.zippy, fontWeight: "700" }]} numberOfLines={2}>
                            {modifierItemLabel(item)}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                            {item.price > 0 && (
                              <Text style={[s.modItemPrice, isSel && { color: D.zippy }]}>
                                +{fmt(item.price)}
                              </Text>
                            )}
                            <View style={[s.modCheckbox, isSel && s.modCheckboxSel, { marginLeft: "auto" }]}>
                              {isSel && <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>✓</Text>}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {/* Comment */}
            <View>
              <Text style={[s.modGroupTitle, { marginBottom: 8 }]}>Observação</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Instruções especiais…"
                placeholderTextColor={D.vfaint}
                multiline
                numberOfLines={2}
                style={s.modCommentInput}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={s.modalFooter}>
            <Pressable
              onPress={() => { setSelected({}); setComment(""); }}
              style={s.modalSecondaryBtn}
            >
              <Text style={s.modalSecondaryBtnText}>Limpar</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!allRequiredMet) return;
                const allIds = { ...selected };
                if (comment.trim()) {
                  // Store comment separately via note
                }
                onAdd(product, allIds, totalPrice);
              }}
              style={[s.modalPrimaryBtn, !allRequiredMet && s.modalPrimaryBtnDisabled]}
            >
              <Text style={[s.modalPrimaryBtnText, !allRequiredMet && { opacity: 0.45 }]}>
                {allRequiredMet
                  ? `Adicionar · ${fmt(totalPrice)}`
                  : "Selecione as opções"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const DIAL_CODES = [
  { dial: "1",  flag: "🇺🇸", name: "United States" },
  { dial: "55", flag: "🇧🇷", name: "Brasil" },
  { dial: "44", flag: "🇬🇧", name: "United Kingdom" },
  { dial: "34", flag: "🇪🇸", name: "España" },
  { dial: "351", flag: "🇵🇹", name: "Portugal" },
  { dial: "52", flag: "🇲🇽", name: "México" },
  { dial: "57", flag: "🇨🇴", name: "Colombia" },
  { dial: "54", flag: "🇦🇷", name: "Argentina" },
];

// ── Customer Search Modal ─────────────────────────────────────────────────────
function CustomerSearchModal({
  token,
  onSelect,
  onClose,
}: {
  token: string;
  onSelect: (c: TCustomer) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [dialCode, setDialCode] = useState(DIAL_CODES[0]);
  const [dialOpen, setDialOpen] = useState(false);
  const [results, setResults] = useState<TCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); setSearchError(null); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setSearchError(null);
    fetch(
      `${API_BASE_URL}/customers/search?phone=${encodeURIComponent(dialCode.dial + q.trim())}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) { setSearchError(data?.error ?? `Erro ${r.status}`); return; }
        console.log("[POS] customer search results:", data);
        setResults(Array.isArray(data) ? data : []);
      })
      .catch((e) => { if (e?.name !== "AbortError") { console.error("[POS] customer search error:", e); setSearchError("Erro de conexão"); } })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q, token]);

  async function handleCreate() {
    const digits = q.replace(/\D/g, "");
    if (digits.length < 10) { setCreateError("Telefone inválido (mín. 10 dígitos)"); return; }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/customers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: dialCode.dial + digits,
          name: newName.trim() || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setCreateError(data.error ?? "Erro ao criar cliente"); return; }
      onSelect(data as TCustomer);
      onClose();
    } catch {
      setCreateError("Erro de conexão");
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={s.searchSheet} onPress={() => {}}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{creating ? "Novo cliente" : "Selecionar cliente"}</Text>
              <Text style={s.modalSubtitle}>{creating ? `Telefone: +${dialCode.dial} ${q}` : "Busque por telefone"}</Text>
            </View>
            <Pressable onPress={onClose} style={s.modalCloseBtn}>
              <IconX color={D.text} size={16} />
            </Pressable>
          </View>

          {/* Search input */}
          <View style={s.searchInputWrap}>
            <Pressable
              onPress={() => setDialOpen((o) => !o)}
              style={s.dialBtn}
            >
              <Text style={s.dialFlag}>{dialCode.flag}</Text>
              <Text style={s.dialCode}>+{dialCode.dial}</Text>
              <IconChevron color={D.faint} size={10} />
            </Pressable>
            <View style={s.dialDivider} />
            <TextInput
              ref={inputRef}
              value={q}
              onChangeText={(t) => setQ(t.replace(/\D/g, ""))}
              placeholder="Telefone…"
              placeholderTextColor={D.vfaint}
              keyboardType="phone-pad"
              style={s.searchInput}
            />
            {loading && <ActivityIndicator size="small" color={D.zippy} />}
            {q.length > 0 && !loading && (
              <Pressable onPress={() => setQ("")}>
                <IconX color={D.faint} size={14} />
              </Pressable>
            )}
          </View>

          {/* Dial picker dropdown */}
          {dialOpen && (
            <View style={s.dialPicker}>
              {DIAL_CODES.map((c) => (
                <Pressable
                  key={c.dial}
                  onPress={() => { setDialCode(c); setDialOpen(false); }}
                  style={[s.dialPickerRow, c.dial === dialCode.dial && s.dialPickerRowActive]}
                >
                  <Text style={s.dialFlag}>{c.flag}</Text>
                  <Text style={s.dialPickerName}>{c.name}</Text>
                  <Text style={s.dialCode}>+{c.dial}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Results — hidden when creating */}
          {!creating && (
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 14 }}>
              {searchError && (
                <Text style={[s.searchEmpty, { color: D.zippy }]}>{searchError}</Text>
              )}
              {!searchError && results.length === 0 && q.trim().length > 0 && !loading && (
                <Text style={s.searchEmpty}>Nenhum cliente encontrado</Text>
              )}
              {results.map((c, i) => (
                <Pressable
                  key={c.id}
                  onPress={() => { console.log("[POS] customer selected:", c); onSelect(c); onClose(); }}
                  style={[s.customerRow, i < results.length - 1 && { marginBottom: 6 }]}
                >
                  <View style={s.customerAvatar}>
                    <Text style={s.customerAvatarText}>{initials(c.name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.customerName}>{c.name ?? "—"}</Text>
                    <Text style={s.customerPhone}>{formatPhone(c.phone)}</Text>
                  </View>
                  <IconChevron color={D.faint} size={11} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Create form — name only, phone comes from the search input */}
          {creating && (
            <View style={{ padding: 16, gap: 12 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Nome (opcional)"
                placeholderTextColor={D.vfaint}
                autoFocus
                style={s.createField}
              />
              {createError && (
                <Text style={{ fontFamily: "Geist_400Regular", fontSize: 12, color: D.zippy }}>{createError}</Text>
              )}
            </View>
          )}

          {/* Footer */}
          <View style={s.modalFooter}>
            {!creating ? (
              <Pressable style={s.newCustomerBtn} onPress={() => setCreating(true)}>
                <Text style={s.newCustomerBtnText}>+ Novo cliente</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => { setCreating(false); setCreateError(null); setNewName(""); }}
                  style={[s.newCustomerBtn, { flex: 1 }]}
                >
                  <Text style={s.newCustomerBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleCreate}
                  style={[s.newCustomerBtn, { flex: 1, backgroundColor: "rgba(255,61,20,0.14)", borderColor: "rgba(255,61,20,0.30)", borderStyle: "solid" }]}
                >
                  {createLoading
                    ? <ActivityIndicator size="small" color={D.zippy} />
                    : <Text style={[s.newCustomerBtnText, { color: D.zippy }]}>Criar cliente</Text>
                  }
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Address Modal ─────────────────────────────────────────────────────────────
function AddressModal({
  customer,
  selected,
  token,
  onSelect,
  onClose,
  onAddressUpdated,
  onOpenAddressSearch,
}: {
  customer: TCustomer;
  selected: TAddress | null;
  token: string;
  onSelect: (a: TAddress) => void;
  onClose: () => void;
  onAddressUpdated: (addr: TAddress) => void;
  onOpenAddressSearch: () => void;
}) {
  const addresses = customer.addresses ?? [];
  const [editingAddr, setEditingAddr] = useState<TAddress | null>(null);
  const [editComplement, setEditComplement] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editInputRef = useRef<TextInput>(null);

  function openEdit(addr: TAddress) {
    setEditingAddr(addr);
    setEditComplement(addr.complement ?? "");
    setSaveError(null);
    setTimeout(() => editInputRef.current?.focus(), 80);
  }

  function closeEdit() {
    setEditingAddr(null);
    setEditComplement("");
    setSaveError(null);
  }

  async function handleSaveEdit() {
    if (!editingAddr) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/delivery-addresses/${editingAddr.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ complement: editComplement.trim() || null }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Erro ${res.status}`);
      }
      const updated: TAddress = await res.json();
      onAddressUpdated(updated);
      closeEdit();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={editingAddr ? closeEdit : onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable style={s.modalBackdrop} onPress={editingAddr ? closeEdit : onClose}>
        <Pressable style={[s.searchSheet, { maxWidth: 520 }]} onPress={() => {}}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={[s.modalCloseBtn, { backgroundColor: "rgba(255,61,20,0.12)", borderColor: "rgba(255,61,20,0.22)" }]}>
              <IconPin color={D.zippy} size={16} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.modalTitle}>
                {editingAddr ? "Editar endereço" : "Endereço de entrega"}
              </Text>
              <Text style={s.modalSubtitle}>{customer.name ?? formatPhone(customer.phone) ?? "Cliente"}</Text>
            </View>
            <Pressable onPress={editingAddr ? closeEdit : onClose} style={s.modalCloseBtn}>
              <IconX color={D.text} size={16} />
            </Pressable>
          </View>

          {editingAddr ? (
            /* ── Edit view ── */
            <View style={{ padding: 14, gap: 12 }}>
              {/* Address preview */}
              <View style={[s.addressRow, { pointerEvents: "none" as any }]}>
                <View style={[s.addrRadio, { backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.22)" }]}>
                  <IconPin color={D.zippy} size={9} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.addrLabel} numberOfLines={2}>
                    {editingAddr.description || `${editingAddr.street}, ${editingAddr.number}`}
                  </Text>
                  {[editingAddr.city, editingAddr.state].filter(Boolean).join(" · ") ? (
                    <Text style={s.addrDefault}>{[editingAddr.city, editingAddr.state].filter(Boolean).join(" · ")}</Text>
                  ) : null}
                </View>
              </View>

              {/* Complement input */}
              <View style={[s.searchInputWrap, { marginHorizontal: 0 }]}>
                <TextInput
                  ref={editInputRef}
                  value={editComplement}
                  onChangeText={setEditComplement}
                  placeholder="Complemento (apto, bloco, casa…)"
                  placeholderTextColor={D.vfaint}
                  style={s.searchInput}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveEdit}
                />
                {editComplement.length > 0 && (
                  <Pressable onPress={() => setEditComplement("")}>
                    <IconX color={D.faint} size={14} />
                  </Pressable>
                )}
              </View>

              {saveError && (
                <Text style={[s.searchEmpty, { color: D.zippy, marginTop: 0 }]}>{saveError}</Text>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={closeEdit}
                  style={[s.customerRow, { flex: 1, justifyContent: "center", paddingVertical: 12 }]}
                >
                  <Text style={{ color: D.faint, fontSize: 13, fontWeight: "600" }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveEdit}
                  disabled={saving}
                  style={[s.customerRow, { flex: 2, justifyContent: "center", paddingVertical: 12, backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.22)" }]}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={D.zippy} />
                    : <Text style={{ color: D.zippy, fontSize: 13, fontWeight: "700" }}>Salvar</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            /* ── List view ── */
            <>
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 14 }}>
                {addresses.length === 0 && (
                  <Text style={s.searchEmpty}>Nenhum endereço salvo</Text>
                )}
                {addresses.map((addr, i) => {
                  const isSel = selected?.id === addr.id;
                  const isBase = i === 0;
                  const line1 = addr.description || `${addr.street}, ${addr.number}`;
                  const line2Parts = [addr.city, addr.state].filter(Boolean).join(" · ");
                  return (
                    <Pressable
                      key={addr.id}
                      onPress={() => { onSelect(addr); onClose(); }}
                      style={[
                        s.addressRow,
                        isSel && { borderColor: "rgba(255,61,20,0.30)", backgroundColor: "rgba(255,61,20,0.07)" },
                        i < addresses.length - 1 && { marginBottom: 7 },
                      ]}
                    >
                      <View style={[s.addrRadio, isSel && s.addrRadioSel]}>
                        {isSel && <IconCheck color="#fff" size={10} />}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.addrLabel, isSel && { fontWeight: "700" }]} numberOfLines={2}>
                          {line1}{addr.complement ? ` — ${addr.complement}` : ""}
                        </Text>
                        {line2Parts ? (
                          <Text style={s.addrDefault}>{line2Parts}</Text>
                        ) : null}
                        {isBase && (
                          <Text style={[s.addrDefault, { color: D.zippy }]}>PADRÃO</Text>
                        )}
                      </View>
                      {addr.deliveryFee > 0 && (
                        <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.dim, flexShrink: 0, marginLeft: 8 }}>
                          +{fmt(addr.deliveryFee)}
                        </Text>
                      )}
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); openEdit(addr); }}
                        style={{ padding: 6, marginLeft: 4 }}
                        hitSlop={8}
                      >
                        <IconEdit color={D.vfaint} size={14} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Footer */}
              <View style={[s.modalFooter, { paddingHorizontal: 14 }]}>
                <Pressable
                  onPress={() => { onClose(); onOpenAddressSearch(); }}
                  style={[s.newCustomerBtn, { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }]}
                >
                  <IconSearch color={D.dim} size={13} />
                  <Text style={s.newCustomerBtnText}>Buscar novo endereço</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Address Search Modal (Mapbox Geocoding) ───────────────────────────────────
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

type MapboxFeature = {
  id: string;
  place_name: string;
  text: string;
  address?: string;
  center: [number, number];
  context?: Array<{ id: string; text: string }>;
};

function featureToAddress(f: MapboxFeature): TAddress {
  const ctx = f.context ?? [];
  const get = (prefix: string) => ctx.find(c => c.id.startsWith(prefix))?.text ?? "";
  return {
    id: `mapbox_${f.id}`,
    createdAt: new Date().toISOString(),
    description: f.place_name,
    street: f.text,
    number: f.address ?? "",
    city: get("place"),
    state: get("region"),
    zipCode: get("postcode"),
    lat: String(f.center[1]),
    lng: String(f.center[0]),
    complement: null,
    numberComplement: null,
    customerId: null,
    deliveryFee: 0,
  };
}

function SearchAddressModal({
  token,
  customerId,
  onSelect,
  onClose,
}: {
  token: string;
  customerId: string | null;
  onSelect: (addr: TAddress) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MapboxFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingFeature, setPendingFeature] = useState<MapboxFeature | null>(null);
  const [complement, setComplement] = useState("");
  const inputRef = useRef<TextInput>(null);
  const complementRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q.trim())}.json?access_token=${MAPBOX_TOKEN}&language=pt&types=address&limit=6`,
        { signal: ctrl.signal },
      )
        .then(r => r.json())
        .then(data => setResults(data?.features ?? []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 350);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  async function handleSave(f: MapboxFeature, comp: string) {
    const addr = { ...featureToAddress(f), complement: comp.trim() || null };
    setSaveError(null);

    if (!customerId) {
      onSelect(addr);
      onClose();
      return;
    }

    setSavingId(f.id);
    try {
      const body: Record<string, unknown> = {
        description: addr.description,
        street: addr.street,
        number: addr.number,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zipCode,
        lat: addr.lat,
        lng: addr.lng,
      };
      if (addr.complement)       body.complement       = addr.complement;
      if (addr.numberComplement) body.numberComplement = addr.numberComplement;

      const res = await fetch(`${API_BASE_URL}/customers/${customerId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Erro ${res.status}`);
      }

      const created: TAddress = await res.json();
      onSelect(created);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar endereço");
    } finally {
      setSavingId(null);
    }
  }

  function handleSelectResult(f: MapboxFeature) {
    setPendingFeature(f);
    setComplement("");
    setSaveError(null);
    setTimeout(() => complementRef.current?.focus(), 80);
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <Pressable style={s.modalBackdrop} onPress={onClose}>
          <Pressable style={s.searchSheet} onPress={() => {}}>
            {/* Header */}
            <View style={s.modalHeader}>
              <View style={[s.modalCloseBtn, { backgroundColor: "rgba(255,61,20,0.12)", borderColor: "rgba(255,61,20,0.22)" }]}>
                <IconPin color={D.zippy} size={16} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.modalTitle}>Buscar endereço</Text>
                <Text style={s.modalSubtitle}>
                  {customerId ? "O endereço será salvo no cadastro do cliente" : "Digite o endereço de entrega"}
                </Text>
              </View>
              <Pressable onPress={onClose} style={s.modalCloseBtn}>
                <IconX color={D.text} size={16} />
              </Pressable>
            </View>

            {/* Input */}
            <View style={[s.searchInputWrap, { margin: 14, marginBottom: 10 }]}>
              <IconSearch color={D.faint} size={15} />
              <TextInput
                ref={inputRef}
                value={q}
                onChangeText={setQ}
                placeholder="Rua, número, cidade…"
                placeholderTextColor={D.vfaint}
                style={s.searchInput}
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color={D.zippy} />}
              {q.length > 0 && !searching && (
                <Pressable onPress={() => { setQ(""); setResults([]); }}>
                  <IconX color={D.faint} size={14} />
                </Pressable>
              )}
            </View>

            {/* Results */}
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 14, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
              {q.trim().length > 0 && q.trim().length < 3 && (
                <Text style={s.searchEmpty}>Continue digitando…</Text>
              )}
              {q.trim().length >= 3 && !searching && results.length === 0 && (
                <Text style={s.searchEmpty}>Nenhum endereço encontrado</Text>
              )}
              {pendingFeature ? (
                <View style={{ gap: 10 }}>
                  {/* Selected address preview */}
                  <View style={[s.customerRow, { pointerEvents: "none" as any }]}>
                    <View style={[s.modalCloseBtn, { backgroundColor: "rgba(255,61,20,0.10)", flexShrink: 0 }]}>
                      <IconPin color={D.zippy} size={14} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {(() => {
                        const parts = pendingFeature.place_name.split(", ");
                        return (
                          <>
                            <Text style={[s.customerName, { fontSize: 13 }]} numberOfLines={1}>{parts.slice(0, 2).join(", ")}</Text>
                            {parts.length > 2 && <Text style={s.customerPhone} numberOfLines={1}>{parts.slice(2).join(", ")}</Text>}
                          </>
                        );
                      })()}
                    </View>
                  </View>

                  {/* Complement input */}
                  <View style={[s.searchInputWrap, { marginHorizontal: 0 }]}>
                    <TextInput
                      ref={complementRef}
                      value={complement}
                      onChangeText={setComplement}
                      placeholder="Complemento (apto, bloco, casa…)"
                      placeholderTextColor={D.vfaint}
                      style={s.searchInput}
                      returnKeyType="done"
                      onSubmitEditing={() => pendingFeature && handleSave(pendingFeature, complement)}
                    />
                    {complement.length > 0 && (
                      <Pressable onPress={() => setComplement("")}>
                        <IconX color={D.faint} size={14} />
                      </Pressable>
                    )}
                  </View>

                  {saveError && (
                    <Text style={[s.searchEmpty, { color: D.zippy, marginTop: 0 }]}>{saveError}</Text>
                  )}

                  {/* Action row */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => { setPendingFeature(null); setComplement(""); setSaveError(null); setTimeout(() => inputRef.current?.focus(), 80); }}
                      style={[s.customerRow, { flex: 1, justifyContent: "center", paddingVertical: 12 }]}
                    >
                      <Text style={{ color: D.faint, fontSize: 13, fontWeight: "600" }}>Voltar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleSave(pendingFeature, complement)}
                      disabled={!!savingId}
                      style={[s.customerRow, { flex: 2, justifyContent: "center", paddingVertical: 12, backgroundColor: "rgba(255,61,20,0.10)", borderColor: "rgba(255,61,20,0.22)" }]}
                    >
                      {savingId ? (
                        <ActivityIndicator size="small" color={D.zippy} />
                      ) : (
                        <Text style={{ color: D.zippy, fontSize: 13, fontWeight: "700" }}>Confirmar endereço</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : results.map((f, i) => {
                const parts = f.place_name.split(", ");
                const primary = parts.slice(0, 2).join(", ");
                const secondary = parts.slice(2).join(", ");
                const isSaving = savingId === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => !savingId && handleSelectResult(f)}
                    style={[s.customerRow, i < results.length - 1 && { marginBottom: 6 }, savingId && { opacity: 0.6 }]}
                  >
                    <View style={[s.modalCloseBtn, { backgroundColor: D.surf2, flexShrink: 0 }]}>
                      {isSaving ? <ActivityIndicator size="small" color={D.zippy} /> : <IconPin color={D.faint} size={14} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.customerName, { fontSize: 13 }]} numberOfLines={1}>{primary}</Text>
                      {secondary ? <Text style={s.customerPhone} numberOfLines={1}>{secondary}</Text> : null}
                    </View>
                    <IconChevron color={D.faint} size={11} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Cart Panel ────────────────────────────────────────────────────────────────
function CartPanel({
  cart, orderNote, setOrderNote, onInc, onDec, onRemove, onNoteChange,
  containerStyle, showHeader = true,
}: {
  cart: TCartItem[];
  orderNote: string; setOrderNote: (n: string) => void;
  onInc: (uid: number) => void;
  onDec: (uid: number) => void;
  onRemove: (uid: number) => void;
  onNoteChange: (uid: number, note: string) => void;
  containerStyle?: object;
  showHeader?: boolean;
}) {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  return (
    <View style={[s.cartPanel, containerStyle]}>
      {showHeader && (
        <View style={s.cartPanelHeader}>
          <Text style={s.panelKicker}>ITENS</Text>
          {count > 0 && (
            <View style={s.cartPanelBadge}>
              <Text style={s.cartPanelBadgeText}>{count}</Text>
            </View>
          )}
        </View>
      )}
      <ScrollView style={s.cartScroll} contentContainerStyle={s.cartContent}>
        {cart.length === 0 ? (
          <View style={s.cartEmpty}>
            <IconBag color={D.faint} size={32} />
            <Text style={s.cartEmptyTitle}>Pedido vazio</Text>
            <Text style={s.cartEmptySubtitle}>Toque em um produto{"\n"}para adicionar ao pedido</Text>
          </View>
        ) : (
          cart.map((item) => (
            <CartItemRow
              key={item.uid}
              item={item}
              onInc={onInc}
              onDec={onDec}
              onRemove={onRemove}
              onNoteChange={onNoteChange}
            />
          ))
        )}
      </ScrollView>
      {cart.length > 0 && (
        <View style={s.orderNoteWrap}>
          <TextInput
            value={orderNote}
            onChangeText={setOrderNote}
            placeholder="Observações do pedido…"
            placeholderTextColor={D.vfaint}
            style={s.orderNoteInput}
          />
        </View>
      )}
    </View>
  );
}

// ── Order Panel (Info tab — order type / customer / address only) ─────────────
function OrderPanel({
  orderType, setOrderType,
  customer, onOpenCustomerSearch, onClearCustomer,
  selectedAddress, onOpenAddress,
  containerStyle,
}: {
  orderType: string; setOrderType: (t: string) => void;
  customer: TCustomer | null;
  onOpenCustomerSearch: () => void;
  onClearCustomer: () => void;
  selectedAddress: TAddress | null;
  onOpenAddress: () => void;
  containerStyle?: object;
}) {
  return (
    <View style={[s.panel, containerStyle]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.infoScrollContent}>

        {/* Order type */}
        <View style={s.infoGroup}>
          <Text style={s.infoGroupKicker}>TIPO DE PEDIDO</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SelectCard
              icon={(c, sz) => <IconMoto color={c} size={sz} />}
              label="Delivery"
              active={orderType === "DELIVERY"}
              onPress={() => setOrderType("DELIVERY")}
            />
            <SelectCard
              icon={(c, sz) => <IconTakeaway color={c} size={sz} />}
              label="Retirada"
              active={orderType === "TAKEAWAY"}
              onPress={() => setOrderType("TAKEAWAY")}
            />
          </View>
        </View>

        {/* Customer */}
        <View style={s.infoGroup}>
          <Text style={s.infoGroupKicker}>CLIENTE</Text>
          {customer ? (
            <View style={s.bigCustomerFilled}>
              <View style={s.bigCustomerAvatar}>
                <Text style={s.bigCustomerAvatarText}>{initials(customer.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.bigCustomerName} numberOfLines={1}>{customer.name}</Text>
                <Text style={s.bigCustomerPhone}>{formatPhone(customer.phone)}</Text>
              </View>
              <Pressable onPress={onOpenCustomerSearch} style={s.bigCustomerSwap}>
                <Text style={s.bigCustomerSwapText}>Trocar</Text>
              </Pressable>
              <Pressable onPress={onClearCustomer} style={s.bigCustomerClear}>
                <IconX color={D.faint} size={14} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={onOpenCustomerSearch} style={s.bigCustomerEmpty}>
              <View style={s.bigCustomerEmptyIcon}>
                <IconUser color={D.zippy} size={20} />
              </View>
              <Text style={s.bigCustomerEmptyLabel}>Adicionar cliente</Text>
              <IconChevron color={D.faint} size={14} />
            </Pressable>
          )}
        </View>

        {/* Delivery address */}
        {orderType === "DELIVERY" && (
          <View style={s.infoGroup}>
            <Text style={s.infoGroupKicker}>ENTREGA</Text>
            {customer ? (
              <Pressable onPress={onOpenAddress} style={s.bigAddressCard}>
                <View style={[s.bigAddressIcon, {
                  backgroundColor: selectedAddress ? "rgba(255,61,20,0.12)" : "rgba(250,245,238,0.05)",
                }]}>
                  <IconPin color={selectedAddress ? D.zippy : D.faint} size={20} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {selectedAddress ? (
                    <>
                      <Text style={[s.bigAddressText, { color: D.text }]} numberOfLines={1}>
                        {`${selectedAddress.street}, ${selectedAddress.number}`}
                      </Text>
                      {(selectedAddress.complement || selectedAddress.numberComplement) && (
                        <Text style={s.bigAddressComplement} numberOfLines={1}>
                          {[selectedAddress.complement, selectedAddress.numberComplement].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={s.bigAddressText}>Toque para definir…</Text>
                  )}
                </View>
                <IconChevron color={D.faint} size={14} />
              </Pressable>
            ) : (
              <Pressable onPress={onOpenCustomerSearch} style={[s.bigAddressCard, s.bigAddressCardDashed]}>
                <View style={[s.bigAddressIcon, { backgroundColor: "rgba(250,245,238,0.05)" }]}>
                  <IconPin color={D.faint} size={20} />
                </View>
                <Text style={[s.bigAddressText, { flex: 1 }]}>Endereço de entrega</Text>
              </Pressable>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Payment Panel (Pagamentos tab — payment method / totals / submit) ─────────
// ── Payment keypad modal ──────────────────────────────────────────────────────
const PAY_TYPE_OPTS: { id: "CASH" | "CARD" | "ZELLE"; label: string; icon: (c: string, sz: number) => React.ReactNode }[] = [
  { id: "CASH",  label: "Dinheiro", icon: (c, sz) => <IconCash color={c} size={sz} /> },
  { id: "CARD",  label: "Cartão",   icon: (c, sz) => <IconCard color={c} size={sz} /> },
  { id: "ZELLE", label: "Zelle",    icon: (c, sz) => <IconZelle color={c} size={sz} /> },
];
function PaymentModal({
  total, othersCents, editing, onAdd, onUpdate, onRequestRemove, onClose,
}: {
  total: number;
  othersCents: number;
  editing: TLocalPayment | null;
  onAdd: (p: Omit<TLocalPayment, "id" | "serverId">) => Promise<void>;
  onUpdate: (payment: TLocalPayment, upd: { type: "CASH" | "CARD" | "ZELLE"; amount: number }) => Promise<void>;
  onRequestRemove: (payment: TLocalPayment) => void;
  onClose: () => void;
}) {
  const remainCents = Math.max(0, total - othersCents);

  const [type, setType] = useState<"CASH" | "CARD" | "ZELLE">(editing?.type ?? "CARD");
  const [entryStr, setEntryStr] = useState(editing ? (editing.amount / 100).toFixed(2) : "");
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isBusy = loading;

  const entryCents = Math.round(parseFloat(entryStr.replace(",", ".") || "0") * 100);
  const overCents  = Math.max(0, othersCents + entryCents - total);

  async function commit() {
    if (entryCents <= 0 || loading) return;
    setLoading(true);
    setSaveError(null);
    try {
      if (editing != null) await onUpdate(editing, { type, amount: entryCents });
      else await onAdd({ type, amount: entryCents });
      onClose();
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!isBusy) onClose(); }}>
      <View style={s.pmOverlay}>
        <Pressable disabled={isBusy} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.pmSheet}>
          {/* Header */}
          <View style={s.pmHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.pmTitle}>{editing != null ? "Editar pagamento" : "Novo pagamento"}</Text>
              <Text style={s.pmSubtitle}>Falta {fmt(remainCents)} de {fmt(total)}</Text>
            </View>
            {editing != null && (
              <Pressable
                disabled={isBusy}
                onPress={isBusy ? undefined : () => {
                  onRequestRemove(editing);
                  onClose();
                }}
                style={[s.pmDeleteBtn, isBusy && { opacity: 0.5 }]}
              >
                <>
                  <Svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke={D.faint} strokeWidth="2" strokeLinecap="round" />
                  </Svg>
                  <Text style={s.pmDeleteText}>Excluir</Text>
                </>
              </Pressable>
            )}
            <Pressable disabled={isBusy} onPress={onClose} style={[s.pmCloseBtn, isBusy && { opacity: 0.5 }]}>
              <Text style={{ fontSize: 20, color: D.text, lineHeight: 20 }}>×</Text>
            </Pressable>
          </View>

          {/* Body */}
          <View style={{ padding: 16, flexDirection: "column", gap: 13 }}>
            {/* Type selector */}
            <View style={{ flexDirection: "row", gap: 9 }}>
              {PAY_TYPE_OPTS.map((t) => (
                <SelectCard
                  key={t.id}
                  icon={t.icon}
                  label={t.label}
                  active={type === t.id}
                  onPress={isBusy ? undefined : () => setType(t.id)}
                />
              ))}
            </View>

            {/* Amount input */}
            <View style={s.pmAmountBox}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={s.pmAmountLabel}>Valor</Text>
                {type === "CASH" && overCents > 0 && (
                  <Text style={s.pmChangeText}>Troco {fmt(overCents)}</Text>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                <Text style={{ fontFamily: "GeistMono_700Bold", fontSize: 22, color: D.faint, marginRight: 6 }}>R$</Text>
                <TextInput
                  autoFocus
                  value={entryStr}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9.,]/g, "").replace(",", ".").replace(/(\..*)\./g, "$1");
                    setEntryStr(cleaned);
                  }}
                  editable={!isBusy}
                  onSubmitEditing={commit}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={D.faint}
                  returnKeyType="done"
                  style={{ flex: 1, fontFamily: "GeistMono_700Bold", fontSize: 36, color: D.text, padding: 0 }}
                />
              </View>
            </View>

            {/* Confirm */}
            <Pressable
              disabled={entryCents <= 0 || isBusy}
              onPress={entryCents > 0 && !isBusy ? commit : undefined}
              style={[s.submitBtn, entryCents <= 0 && s.submitBtnDisabled, loading && s.submitBtnLoading]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[s.submitBtnText, entryCents <= 0 && { opacity: 0.4 }]}>
                  {editing != null ? "Salvar" : "Adicionar"} {entryCents > 0 ? fmt(entryCents) : ""}
                </Text>
              )}
            </Pressable>
            {saveError != null && (
              <Text style={{ color: D.zippy, fontSize: 12, textAlign: "center", marginTop: 4 }}>{saveError}</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DeletePaymentConfirmModal({
  payment,
  paymentId,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  payment: TLocalPayment | null;
  paymentId: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payment: TLocalPayment, paymentId: string | null) => Promise<void>;
}) {
  if (payment == null) return null;

  const payLabel: Record<TLocalPayment["type"], string> = {
    CASH: "Dinheiro",
    CARD: "Cartao",
    ZELLE: "Zelle",
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!loading) onClose(); }}>
      <View style={s.pmOverlay}>
        <Pressable disabled={loading} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.pmConfirmSheet}>
          <View style={s.pmConfirmHeader}>
            <Text style={s.pmTitle}>Excluir pagamento?</Text>
            <Text style={s.pmSubtitle}>
              Esta acao remove {payLabel[payment.type]} de {fmt(payment.amount)}.
            </Text>
          </View>

          <View style={s.pmConfirmBody}>
            <Text style={s.pmConfirmWarning}>
              Tem certeza que deseja excluir este pagamento? Esta acao nao pode ser desfeita.
            </Text>
            {error != null && (
              <Text style={s.pmConfirmError}>{error}</Text>
            )}
          </View>

          <View style={s.pmConfirmActions}>
            <Pressable
              disabled={loading}
              onPress={onClose}
              style={[s.pmConfirmSecondaryBtn, loading && { opacity: 0.5 }]}
            >
              <Text style={s.pmConfirmSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={() => { void onConfirm(payment, paymentId); }}
              style={[s.pmConfirmDangerBtn, loading && s.submitBtnLoading]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.pmConfirmDangerText}>Excluir</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PaymentPanel({
  cart, orderType, selectedAddress, progressiveDiscount,
  payment, setPayment, tip, setTip,
  customer, onSubmit, submitting, isEdit,
  existingPayments, orderId, onOrderUpdated,
  containerStyle,
}: {
  cart: TCartItem[];
  orderType: string;
  selectedAddress: TAddress | null;
  progressiveDiscount: TProgressiveDiscount;
  payment: string; setPayment: (p: string) => void;
  tip: number; setTip: (t: number) => void;
  customer: TCustomer | null;
  onSubmit: () => void;
  submitting: boolean;
  isEdit?: boolean;
  existingPayments?: TOrderPayment[];
  orderId?: string;
  onOrderUpdated?: () => void | Promise<void>;
  containerStyle?: object;
}) {
  const { token } = useAuth();
  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const tax = Math.round(subtotal * 0.065);
  const deliveryFee = orderType === "DELIVERY" ? (selectedAddress?.deliveryFee ?? 0) : 0;
  const tipCents = tip > 0 ? Math.round(subtotal * tip / 100) : 0;

  const pdSteps = progressiveDiscount?.steps ?? [];
  const sortedSteps = [...pdSteps].sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
  const activeStep = [...sortedSteps].reverse().find((st) => subtotal >= (st.amount ?? 0)) ?? null;
  const nextStep = sortedSteps.find((st) => subtotal < (st.amount ?? 0)) ?? null;
  const metSteps = sortedSteps.filter((st) => subtotal >= (st.amount ?? 0));
  const bestDiscountPct = metSteps.reduce((max, st) => Math.max(max, st.discount ?? 0), 0);
  const discountAmount = bestDiscountPct > 0 ? Math.round(subtotal * bestDiscountPct / 100) : 0;
  const total = subtotal + tax + deliveryFee + tipCents - discountAmount;
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const TIP_OPTS = [0, 10, 15, 20];
  const deliveryReady = orderType !== "DELIVERY" || (!!customer && !!selectedAddress);
  const canSubmit = cart.length > 0 && !submitting && deliveryReady;

  // Local payments list — seeded from server when orderId is known
  const [localPayments, setLocalPayments] = useState<TLocalPayment[]>(
    () => (existingPayments ?? []).map((payment, index) => mapServerPaymentToLocal(payment, index))
  );
  const [serverPayments, setServerPayments] = useState<TOrderPayment[]>(() => existingPayments ?? []);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payModal, setPayModal] = useState<{ open: boolean; editing: TLocalPayment | null }>({ open: false, editing: null });
  const [deleteConfirmPayment, setDeleteConfirmPayment] = useState<TLocalPayment | null>(null);
  const [deleteConfirmPaymentId, setDeleteConfirmPaymentId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadPayments = useCallback(async (options?: { showLoader?: boolean }) => {
    if (!orderId || !token) return;

    const showLoader = options?.showLoader ?? true;
    if (showLoader) setPaymentsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`GET /orders/${orderId}/payments failed: ${response.status}`);

      const data = (await response.json()) as TOrderPayment[];
      if (Array.isArray(data)) {
        setServerPayments(data);
        setLocalPayments(data.map((payment, index) => mapServerPaymentToLocal(payment, index)));
      }
    } finally {
      if (showLoader) setPaymentsLoading(false);
    }
  }, [orderId, token]);

  // Fetch payments from server whenever we have an orderId (ensures serverId is set on all payments)
  useEffect(() => {
    if (!orderId || !token) return;
    void loadPayments();
  }, [orderId, token, loadPayments]);

  const paidCents   = localPayments.reduce((s, p) => s + p.amount, 0);
  const remainCents = Math.max(0, total - paidCents);
  const changeCents = Math.max(0, paidCents - total);
  const settled     = cart.length > 0 && total > 0 && remainCents === 0;

  async function addLocalPayment(p: Omit<TLocalPayment, "id" | "serverId">) {
    const tempId = String(Date.now());
    setLocalPayments((prev) => [...prev, { id: tempId, ...p }]);
    setPayment(p.type.toLowerCase());
    if (orderId && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/orders/${orderId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: p.amount, paymentType: p.type }),
        });
        if (!res.ok) throw new Error(`POST /payments failed: ${res.status}`);
        const data: TOrderPayment = await res.json();
        const persistedPaymentId = getOrderPaymentId(data);
        if (!persistedPaymentId) throw new Error("POST /payments returned no payment id");
        setServerPayments((prev) => [...prev, data]);
        setLocalPayments((prev) =>
          prev.map((lp) =>
            lp.id === tempId
              ? {
                  ...lp,
                  id: persistedPaymentId,
                  paymentId: persistedPaymentId,
                  serverId: persistedPaymentId,
                  sourceIndex: lp.sourceIndex,
                  persisted: true,
                }
              : lp
          )
        );
      } catch (err) {
        setLocalPayments((prev) => prev.filter((lp) => lp.id !== tempId));
        throw err;
      }
    }
  }
  async function updateLocalPayment(payment: TLocalPayment, upd: { type: "CASH" | "CARD" | "ZELLE"; amount: number }) {
    setLocalPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, ...upd } : p)));
    setPayment(upd.type.toLowerCase());
    const paymentId = payment.paymentId ?? payment.serverId ?? payment.id;
    if (payment.persisted && paymentId && token) {
      try {
        const payload = buildPaymentPatchPayload(payment, upd);
        if (Object.keys(payload).length === 0) return;

        const res = await fetch(`${API_BASE_URL}/payments/${paymentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`PATCH /payments/${paymentId} failed: ${res.status}`);
      } catch (err) {
        setLocalPayments((prev) => prev.map((p) => (p.id === payment.id ? payment : p)));
        throw err;
      }
    }
  }
  async function removeLocalPayment(paymentId: string | null) {
    if (!token) {
      throw new Error("DELETE_PAYMENT_MISSING_TOKEN");
    }

    if (!paymentId) {
      throw new Error("DELETE_PAYMENT_MISSING_ID");
    }

    const res = await fetch(`${API_BASE_URL}/payments/${paymentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`DELETE /payments/${paymentId} failed: ${res.status}`);
  }

  function openNew() { setPayModal({ open: true, editing: null }); }
  function openEdit(p: TLocalPayment) { setPayModal({ open: true, editing: p }); }
  function requestDelete(p: TLocalPayment) {
    const sourcePayment =
      typeof p.sourceIndex === "number" ? serverPayments[p.sourceIndex] : undefined;
    const resolvedPaymentId = resolvePaymentId(p, sourcePayment);
    setDeleteError(null);
    setDeleteConfirmPayment(p);
    setDeleteConfirmPaymentId(resolvedPaymentId);
  }
  function closeDeleteConfirm() {
    if (deleteLoading) return;
    setDeleteConfirmPayment(null);
    setDeleteConfirmPaymentId(null);
    setDeleteError(null);
  }
  async function confirmDeletePayment(payment: TLocalPayment, paymentId: string | null) {
    if (deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await removeLocalPayment(paymentId);
      await loadPayments({ showLoader: false });
      await onOrderUpdated?.();
      setDeleteConfirmPayment(null);
      setDeleteConfirmPaymentId(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Erro ao excluir pagamento. Tente novamente.");
    } finally {
      setDeleteLoading(false);
    }
  }

  const PAY_LABEL: Record<string, string> = { CASH: "Dinheiro", CARD: "Cartão", ZELLE: "Zelle" };

  return (
    <View style={[s.panel, containerStyle]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.infoScrollContent}>

        {/* Balance bar */}
        <View style={[s.pmBalanceBar, settled && s.pmBalanceBarSettled]}>
          {[
            { k: "Total", v: fmt(total), c: D.text },
            { k: "Pago",  v: fmt(paidCents), c: D.text },
            changeCents > 0
              ? { k: "Troco", v: fmt(changeCents), c: D.green }
              : { k: "Falta", v: fmt(remainCents), c: remainCents > 0 ? D.zippy : D.green },
          ].map((cell, i) => (
            <View key={cell.k} style={[s.pmBalanceCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: D.line }]}>
              <Text style={s.pmBalanceCellLabel}>{cell.k}</Text>
              <Text style={[s.pmBalanceCellValue, { color: cell.c }]}>{cell.v}</Text>
            </View>
          ))}
        </View>

        {/* Payment rows or empty state */}
        {paymentsLoading ? (
          <View style={s.pmEmptyState}>
            <ActivityIndicator color={D.zippy} size="small" />
          </View>
        ) : localPayments.length > 0 ? (
          <View style={s.infoGroup}>
            <Text style={s.infoGroupKicker}>PAGAMENTOS</Text>
            {localPayments.map((p) => (
              <Pressable key={p.id} onPress={() => openEdit(p)} style={({ pressed }) => [s.paymentRecordRow, { opacity: pressed ? 0.8 : 1 }]}>
                <View style={s.paymentRecordIcon}>
                  {p.type === "CASH"  && <IconCash  color={D.zippy} size={18} />}
                  {p.type === "CARD"  && <IconCard  color={D.zippy} size={18} />}
                  {p.type === "ZELLE" && <IconZelle color={D.zippy} size={18} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.paymentRecordLabel}>{PAY_LABEL[p.type]}</Text>
                  <Text style={s.paymentRecordTime}>Toque para editar</Text>
                </View>
                <Text style={s.paymentRecordAmount}>{fmt(p.amount)}</Text>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    requestDelete(p);
                  }}
                  style={s.pmRowDeleteBtn}
                  hitSlop={8}
                >
                  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke={D.faint} strokeWidth="2" strokeLinecap="round" />
                  </Svg>
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={s.pmEmptyState}>
            <IconCash color={D.faint} size={26} />
            <Text style={s.pmEmptyTitle}>Nenhum pagamento</Text>
            <Text style={s.pmEmptySubtitle}>Adicione um ou divida{"\n"}entre formas de pagamento</Text>
          </View>
        )}

        {/* Add payment button */}
        <Pressable onPress={openNew} style={({ pressed }) => [
          s.pmAddBtn,
          settled && s.pmAddBtnSettled,
          { opacity: pressed ? 0.85 : 1 },
        ]}>
          <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <Path d="M12 5v14M5 12h14" stroke={settled ? D.faint : "#fff"} strokeWidth="2.4" strokeLinecap="round" />
          </Svg>
          <Text style={[s.pmAddBtnText, settled && { color: D.faint }]}>
            {settled ? "Adicionar outro" : `Adicionar pagamento${remainCents > 0 ? " · " + fmt(remainCents) : ""}`}
          </Text>
        </Pressable>

        {/* Tip */}
        <View style={s.infoGroup}>
          <Text style={s.infoGroupKicker}>GORJETA</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {TIP_OPTS.map((pct) => {
              const isOn = tip === pct;
              return (
                <Pressable key={pct} onPress={() => setTip(pct)} style={[s.selectCard, isOn && s.selectCardActive, { paddingVertical: 12 }]}>
                  <Text style={[s.selectCardLabel, { color: isOn ? D.text : D.faint, fontSize: 15, fontWeight: "700" }]}>
                    {pct === 0 ? "Não" : `${pct}%`}
                  </Text>
                  {pct > 0 && (
                    <Text style={{ fontSize: 10.5, color: isOn ? D.zippy : D.vfaint, fontFamily: "GeistMono_400Regular" }}>
                      {cart.length > 0 ? fmt(Math.round(subtotal * pct / 100)) : "—"}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* Progressive discount widget */}
      {cart.length > 0 && progressiveDiscount && (nextStep || activeStep) && (
        <View style={s.pdWidget}>
          {nextStep ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Text style={[s.pdWidgetLabel, { flex: 1 }]} numberOfLines={1}>
                  {activeStep ? `${bestDiscountPct}% aplicado` : `${nextStep.discount}% de desconto`}
                </Text>
                <Text style={[s.pdWidgetLabel, { color: activeStep ? D.green : D.amber, flexShrink: 0 }]}>
                  {fmt(subtotal)} / {fmt(nextStep.amount ?? 0)}
                </Text>
              </View>
              <View style={s.pdBar}>
                <View style={[s.pdBarFill, {
                  width: `${Math.min(100, (subtotal / (nextStep.amount ?? 1)) * 100)}%` as any,
                  backgroundColor: activeStep ? D.green : D.amber,
                }]} />
              </View>
            </>
          ) : activeStep ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: D.green }} />
              <Text style={[s.pdWidgetLabel, { color: D.green, flex: 1 }]}>
                {bestDiscountPct}% de desconto aplicado — nível máximo!
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Totals */}
      {cart.length > 0 && (
        <View style={s.totalsSection}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal ({count} item{count !== 1 ? "s" : ""})</Text>
            <Text style={s.totalValue}>{fmt(subtotal)}</Text>
          </View>
          {discountAmount > 0 && (
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: D.green }]}>Desconto ({bestDiscountPct}%)</Text>
              <Text style={[s.totalValue, { color: D.green }]}>−{fmt(discountAmount)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Taxa (6.5%)</Text>
            <Text style={s.totalValue}>{fmt(tax)}</Text>
          </View>
          {orderType === "DELIVERY" && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Frete{deliveryFee === 0 ? " (grátis)" : ""}</Text>
              <Text style={[s.totalValue, deliveryFee === 0 && { color: D.green }]}>
                {deliveryFee === 0 ? "Grátis" : fmt(deliveryFee)}
              </Text>
            </View>
          )}
          {tipCents > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Gorjeta ({tip}%)</Text>
              <Text style={s.totalValue}>{fmt(tipCents)}</Text>
            </View>
          )}
          <View style={s.totalDivider} />
          <View style={s.totalRow}>
            <Text style={[s.totalLabel, { fontSize: 15, fontWeight: "700", color: D.text }]}>Total</Text>
            <Text style={s.grandTotal}>{fmt(total)}</Text>
          </View>
        </View>
      )}

      {/* Submit */}
      <View style={s.paymentSection}>
        <Pressable
          onPress={canSubmit ? onSubmit : undefined}
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              {cart.length > 0 && <IconCheck color={cart.length > 0 ? "#fff" : "rgba(255,255,255,0.35)"} size={18} />}
              <Text style={[s.submitBtnText, !canSubmit && { opacity: 0.4 }]}>
                {cart.length === 0
                  ? "Adicione itens ao pedido"
                  : !customer && orderType === "DELIVERY"
                    ? "Selecione um cliente"
                    : !selectedAddress && orderType === "DELIVERY"
                      ? "Selecione um endereço"
                      : isEdit ? `Salvar alterações · ${fmt(total)}` : `Criar pedido · ${fmt(total)}`}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Payment modal */}
      {payModal.open && (
        <PaymentModal
          key={payModal.editing?.id ?? "new"}
          total={total}
          othersCents={localPayments.filter((lp) => lp.id !== payModal.editing?.id).reduce((s, lp) => s + lp.amount, 0)}
          editing={payModal.editing}
          onAdd={addLocalPayment}
          onUpdate={updateLocalPayment}
          onRequestRemove={requestDelete}
          onClose={() => setPayModal({ open: false, editing: null })}
        />
      )}
      <DeletePaymentConfirmModal
        payment={deleteConfirmPayment}
        paymentId={deleteConfirmPaymentId}
        loading={deleteLoading}
        error={deleteError}
        onClose={closeDeleteConfirm}
        onConfirm={confirmDeletePayment}
      />
    </View>
  );
}

// ── Combined right panel with Itens / Info / Pagamentos tabs ─────────────────
function CombinedOrderPanel({
  cart, orderNote, setOrderNote, onInc, onDec, onRemove, onNoteChange,
  orderType, setOrderType,
  customer, onOpenCustomerSearch, onClearCustomer,
  selectedAddress, onOpenAddress,
  payment, setPayment,
  tip, setTip,
  onSubmit, submitting, orderNum,
  progressiveDiscount, isEdit, existingPayments, orderId, onOrderUpdated,
}: {
  cart: TCartItem[];
  orderNote: string; setOrderNote: (n: string) => void;
  onInc: (uid: number) => void; onDec: (uid: number) => void;
  onRemove: (uid: number) => void; onNoteChange: (uid: number, note: string) => void;
  orderType: string; setOrderType: (t: string) => void;
  customer: TCustomer | null;
  onOpenCustomerSearch: () => void; onClearCustomer: () => void;
  selectedAddress: TAddress | null; onOpenAddress: () => void;
  payment: string; setPayment: (p: string) => void;
  tip: number; setTip: (t: number) => void;
  onSubmit: () => void; submitting: boolean; orderNum: string;
  progressiveDiscount: TProgressiveDiscount; isEdit?: boolean;
  existingPayments?: TOrderPayment[];
  orderId?: string;
  onOrderUpdated?: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState<"items" | "info" | "pagamentos">("items");
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <View style={s.combinedPanel}>
      {/* Tab selector */}
      <View style={s.panelSection}>
        <SegmentedControl
          options={[
            { id: "items",      label: "Itens",      badge: cartCount > 0 ? cartCount : undefined },
            { id: "info",       label: "Info" },
            { id: "pagamentos", label: "Pagamento" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as "items" | "info" | "pagamentos")}
        />
      </View>

      {tab === "items" && (
        <CartPanel
          cart={cart} orderNote={orderNote} setOrderNote={setOrderNote}
          onInc={onInc} onDec={onDec} onRemove={onRemove} onNoteChange={onNoteChange}
          showHeader={false}
          containerStyle={{ width: "100%", borderLeftWidth: 0, flex: 1 }}
        />
      )}
      {tab === "info" && (
        <OrderPanel
          orderType={orderType} setOrderType={setOrderType}
          customer={customer} onOpenCustomerSearch={onOpenCustomerSearch} onClearCustomer={onClearCustomer}
          selectedAddress={selectedAddress} onOpenAddress={onOpenAddress}
          containerStyle={{ width: "100%", borderLeftWidth: 0, flex: 1 }}
        />
      )}
      {tab === "pagamentos" && (
        <PaymentPanel
          cart={cart}
          orderType={orderType} selectedAddress={selectedAddress}
          progressiveDiscount={progressiveDiscount}
          payment={payment} setPayment={setPayment}
          tip={tip} setTip={setTip}
          customer={customer}
          onSubmit={onSubmit} submitting={submitting} isEdit={isEdit}
          existingPayments={existingPayments} orderId={orderId} onOrderUpdated={onOrderUpdated}
          containerStyle={{ width: "100%", borderLeftWidth: 0, flex: 1 }}
        />
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function POSScreen({
  onClose,
  onOrderCreated,
  onOrderUpdated,
  editOrder,
}: {
  onClose?: () => void;
  onOrderCreated?: () => void;
  onOrderUpdated?: () => void | Promise<void>;
  editOrder?: TEditOrder;
} = {}) {
  const { token, owner, signOut } = useAuth();

  // Catalog
  const [categories, setCategories] = useState<TCategory[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState("all");

  // Progressive discount
  const [progressiveDiscount, setProgressiveDiscount] = useState<TProgressiveDiscount>(null);

  // Order state
  const [cart, setCart] = useState<TCartItem[]>([]);
  const [orderType, setOrderType] = useState("DELIVERY");
  const [customer, setCustomer] = useState<TCustomer | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<TAddress | null>(null);
  const [payment, setPayment] = useState("card");
  const [tip, setTip] = useState(0);
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editReady, setEditReady] = useState(!editOrder);

  const editInitRef = useRef<string | null>(null);

  // Modals
  const [modifierProduct, setModifierProduct] = useState<TProduct | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);

  const orderNum = useRef(`#${1000 + Math.floor(Math.random() * 8999)}`).current;

  // ── Fetch catalog ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setCatalogLoading(true);
    fetch(`${API_BASE_URL}/categories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: TCategory[]) => {
        const cats = Array.isArray(data) ? data : [];
        setCategories(cats);
        const allMods = cats.flatMap(c => c.products.flatMap(p => p.modifierGroups ?? []));
        console.log("[POS] modifierGroups sample:", JSON.stringify(allMods.slice(0, 5), null, 2));
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, [token]);

  // ── Fetch progressive discount ────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/progressive-discount`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setProgressiveDiscount(data ?? null))
      .catch(() => {});
  }, [token]);

  // ── Reset address when customer changes (skip in edit mode — address is pre-set) ──
  useEffect(() => {
    if (editInitRef.current) return;
    setSelectedAddress(customer?.addresses[0] ?? null);
  }, [customer?.id]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const allProducts = useMemo(
    () => categories.flatMap((c) => c.products),
    [categories],
  );

  const colorIdxByProductId = useMemo(() => {
    const map: Record<string, number> = {};
    allProducts.forEach((p) => { map[p.id] = productColorIdx(p.id); });
    return map;
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    if (selectedCat === "all") return allProducts;
    const cat = categories.find((c) => c.id === selectedCat);
    return cat?.products ?? [];
  }, [selectedCat, allProducts, categories]);

  const cartQtyByProductId = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach((i) => { m[i.productId] = (m[i.productId] ?? 0) + i.qty; });
    return m;
  }, [cart]);

  const cartCountByCat = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach((i) => {
      const cat = categories.find((c) => c.products.some((p) => p.id === i.productId));
      if (cat) m[cat.id] = (m[cat.id] ?? 0) + i.qty;
    });
    return m;
  }, [cart, categories]);

  const catRailItems: CatItem[] = useMemo(() => [
    { id: "all", label: "Todos", count: allProducts.length },
    ...categories.map((c) => ({ id: c.id, label: c.title, count: c.products.length })),
  ], [categories, allProducts.length]);

  // ── Initialize from editOrder once catalog is ready ───────────────────────
  useEffect(() => {
    if (!editOrder || catalogLoading || editInitRef.current === editOrder.id) return;
    editInitRef.current = editOrder.id;

    setOrderType(editOrder.type);
    setPayment(editOrder.paymentMethod.toLowerCase());
    setTip(editOrder.tip ?? 0);

    const da = editOrder.deliveryAddress;
    const addrForCustomer: TAddress | null = da
      ? {
          id: da.id,
          createdAt: "",
          description: `${da.street}, ${da.number}`,
          street: da.street,
          number: da.number,
          city: da.city ?? "",
          state: da.state ?? "",
          zipCode: da.zipCode ?? "",
          lat: da.lat ?? "",
          lng: da.lng ?? "",
          complement: da.complement ?? null,
          numberComplement: null,
          customerId: editOrder.customer?.id ?? null,
          deliveryFee: da.deliveryFee ?? 0,
        }
      : null;

    if (editOrder.customer) {
      const baseCustomer: TCustomer = {
        id: editOrder.customer.id,
        name: editOrder.customer.name,
        phone: editOrder.customer.phone ?? null,
        createdAt: "",
        email: null,
        address: null,
        addresses: addrForCustomer ? [addrForCustomer] : [],
      };
      setCustomer(baseCustomer);

      // Fetch full customer via same search endpoint used in create mode (returns addresses[])
      const phone = editOrder.customer.phone;
      if (token && phone) {
        fetch(
          `${API_BASE_URL}/customers/search?phone=${encodeURIComponent(phone)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
          .then((r) => r.ok ? r.json() : Promise.reject(r.status))
          .then((data: TCustomer[]) => {
            const match = Array.isArray(data) ? data.find((c) => c.id === editOrder.customer!.id) : undefined;
            if (match?.addresses) {
              setCustomer((prev) => prev ? { ...prev, addresses: match!.addresses } : prev);
            }
          })
          .catch(() => {});
      }
    }

    setSelectedAddress(addrForCustomer);

    const newCart: TCartItem[] = editOrder.orderProducts.map((op) => {
      const product = allProducts.find((p) => p.id === op.productId);
      const unitPrice = op.amount; // includes modifier costs
      const existingModifierItemIds = op.selectedModifierGroupItemIds?.length
        ? op.selectedModifierGroupItemIds
        : undefined;
      return {
        uid: nextUid(),
        productId: op.productId,
        name: product?.name ?? op.product?.name ?? "Produto",
        unitPrice,
        qty: op.quantity,
        lineTotal: unitPrice * op.quantity,
        selectedModifiers: {},
        note: op.comments ?? op.comment ?? op.description ?? "",
        colorIdx: colorIdxByProductId[op.productId] ?? 0,
        imageUrl: product?.photos?.[0]?.url ?? null,
        orderProductId: op.id,
        existingModifierItemIds,
      };
    });

    setCart(newCart);
    setEditReady(true);
  }, [editOrder, catalogLoading, allProducts, colorIdxByProductId]);

  // ── Cart operations ───────────────────────────────────────────────────────
  const addProduct = useCallback((product: TProduct) => {
    const hasModifiers = (product.modifierGroups?.length ?? 0) > 0;
    if (hasModifiers) {
      console.log("[POS] opening modifier modal for:", product.name, JSON.stringify(product.modifierGroups, null, 2));
      setModifierProduct(product);
      return;
    }
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === product.id && Object.keys(i.selectedModifiers).length === 0,
      );
      if (existing) {
        return prev.map((i) =>
          i.uid === existing.uid
            ? { ...i, qty: i.qty + 1, lineTotal: i.lineTotal + i.unitPrice }
            : i,
        );
      }
      return [
        ...prev,
        {
          uid: nextUid(),
          productId: product.id,
          name: product.name,
          unitPrice: product.price ?? 0,
          qty: 1,
          lineTotal: product.price ?? 0,
          selectedModifiers: {},
          note: "",
          colorIdx: colorIdxByProductId[product.id] ?? 0,
          imageUrl: product.photos?.[0]?.url,
        },
      ];
    });
  }, [colorIdxByProductId]);

  const decProduct = useCallback((product: TProduct) => {
    setCart((prev) => {
      const idx = [...prev].reverse().findIndex((i) => i.productId === product.id);
      if (idx === -1) return prev;
      const ai = prev.length - 1 - idx;
      const item = prev[ai];
      if (item.qty === 1) return prev.filter((_, j) => j !== ai);
      return prev.map((i, j) =>
        j === ai ? { ...i, qty: i.qty - 1, lineTotal: i.lineTotal - i.unitPrice } : i,
      );
    });
  }, []);

  const addCustomized = useCallback(
    (product: TProduct, selected: TSelectedModifiers, totalPrice: number) => {
      setCart((prev) => [
        ...prev,
        {
          uid: nextUid(),
          productId: product.id,
          name: product.name,
          unitPrice: totalPrice,
          qty: 1,
          lineTotal: totalPrice,
          selectedModifiers: selected,
          note: "",
          colorIdx: colorIdxByProductId[product.id] ?? 0,
          imageUrl: product.photos?.[0]?.url,
        },
      ]);
      setModifierProduct(null);
    },
    [colorIdxByProductId],
  );

  const incItem = useCallback((uid: number) => {
    setCart((p) =>
      p.map((i) => i.uid === uid ? { ...i, qty: i.qty + 1, lineTotal: i.lineTotal + i.unitPrice } : i),
    );
  }, []);

  const decItem = useCallback((uid: number) => {
    setCart((p) => {
      const item = p.find((i) => i.uid === uid);
      if (!item) return p;
      if (item.qty === 1) return p.filter((i) => i.uid !== uid);
      return p.map((i) => i.uid === uid ? { ...i, qty: i.qty - 1, lineTotal: i.lineTotal - i.unitPrice } : i);
    });
  }, []);

  const removeItem = useCallback((uid: number) => {
    setCart((p) => p.filter((i) => i.uid !== uid));
  }, []);

  const noteItem = useCallback((uid: number, note: string) => {
    setCart((p) => p.map((i) => i.uid === uid ? { ...i, note } : i));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!cart.length || submitting || !token) return;
    setSubmitting(true);
    try {
      const paymentMethodMap: Record<string, string> = {
        cash: "CASH", card: "CARD", zelle: "ZELLE",
      };

      if (editOrder) {
        // ── PATCH mode ───────────────────────────────────────────────────────
        const orderProducts: Record<string, unknown>[] = [];

        for (const item of cart) {
          if (item.orderProductId) {
            orderProducts.push({
              id: item.orderProductId,
              quantity: item.qty,
              ...(item.note ? { comments: item.note } : {}),
              selectedModifierGroupItemIds:
                item.existingModifierItemIds ?? Object.values(item.selectedModifiers).flat(),
            });
          } else {
            orderProducts.push({
              productId: item.productId,
              quantity: item.qty,
              ...(item.note ? { comments: item.note } : {}),
              selectedModifierGroupItemIds: Object.values(item.selectedModifiers).flat(),
            });
          }
        }

        const existingIds = new Set(cart.map((i) => i.orderProductId).filter(Boolean));
        for (const op of editOrder.orderProducts) {
          if (!existingIds.has(op.id)) {
            orderProducts.push({ id: op.id, remove: true });
          }
        }

        const patchBody: Record<string, unknown> = {
          orderProducts,
          paymentMethod: paymentMethodMap[payment] ?? payment.toUpperCase(),
          orderType,
          customerId: customer?.id ?? null,
        };
        if (orderType === "DELIVERY" && selectedAddress && !selectedAddress.id.startsWith("mapbox_")) {
          patchBody.addressId = selectedAddress.id;
        }

        const res = await fetch(`${API_BASE_URL}/orders/${editOrder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        setToast("Pedido atualizado!");
        setTimeout(() => { setToast(null); onOrderCreated?.(); }, 2200);
      } else {
        // ── POST mode ────────────────────────────────────────────────────────
        const items = cart.map((item) => {
          const modifiers = Object.entries(item.selectedModifiers).flatMap(
            ([modifierId, itemIds]) =>
              itemIds.map((modifierItemId) => ({ modifierId, modifierItemId })),
          );
          return {
            cartId: uuidv4(),
            productId: item.productId,
            quantity: item.qty,
            ...(item.note ? { description: item.note } : {}),
            modifiers,
          };
        });

        const body = {
          cart: { items },
          orderType,
          paymentMethod: paymentMethodMap[payment] ?? payment.toUpperCase(),
          tipAmount: tip > 0 ? tip : undefined,
          customerId: customer?.id ?? null,
          addressId:
            orderType === "DELIVERY" && selectedAddress && !selectedAddress.id.startsWith("mapbox_")
              ? selectedAddress.id
              : null,
        };

        const res = await fetch(`${API_BASE_URL}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        setToast("Pedido criado com sucesso!");
        setTimeout(() => {
          setToast(null);
          setCart([]);
          setCustomer(null);
          setOrderNote("");
          setTip(0);
          onOrderCreated?.();
        }, 2200);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Erro ao salvar pedido");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Read-only external orders (DoorDash / Uber Eats / Square) ───────────────
  // Only an Info view is shown; these orders cannot be edited.
  const externalSource =
    editOrder?.sourcePlatform && editOrder.sourcePlatform !== "FOODY"
      ? editOrder.sourcePlatform
      : null;
  if (externalSource) {
    const sourceCfg = ORDER_SOURCE_CFG[externalSource];
    const roName = editOrder?.customer?.name?.trim() || "Guest";
    const roPhone = editOrder?.customer?.phone?.trim() || null;
    const roItems = (editOrder?.orderProducts ?? []).map((op, index) => ({
      key: op.id ?? `${op.productId}-${index}`,
      quantity: typeof op.quantity === "number" && op.quantity > 0 ? op.quantity : 1,
      name: op.product?.name?.trim() || "Item",
    }));

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top", "bottom"]}>
        <TabletTopBar
          mode="inner"
          pageTitle="Detalhes do Pedido"
          pageSubtitle="POS · CAIXA"
          onBack={onClose ?? (() => router.back())}
          backLabel="Início"
          userInitial={(owner?.name ?? "C").charAt(0).toUpperCase()}
          onAvatarPress={() => void signOut()}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.roContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Only the Info tab is available for external orders */}
          <View style={s.roTabBar}>
            <View style={[s.roTab, s.roTabActive]}>
              <Text style={s.roTabText}>Info</Text>
            </View>
          </View>

          {/* Source + customer */}
          <View style={s.roCard}>
            <View style={s.roCardHeader}>
              <Text style={s.roCardLabel}>Cliente</Text>
              <View style={[s.roSourceBadge, { backgroundColor: sourceCfg.bg }]}>
                <Text style={[s.roSourceText, { color: sourceCfg.fg }]}>{sourceCfg.label}</Text>
              </View>
            </View>
            <Text style={s.roCustomerName}>{roName}</Text>
            <Text style={roPhone ? s.roCustomerPhone : s.roMuted}>
              {roPhone ?? "Sem telefone"}
            </Text>
          </View>

          {/* Items */}
          <View style={s.roCard}>
            <Text style={s.roCardLabel}>Itens</Text>
            {roItems.length === 0 ? (
              <Text style={s.roMuted}>Nenhum item.</Text>
            ) : (
              roItems.map((item) => (
                <View key={item.key} style={s.roItemRow}>
                  <Text style={s.roItemQty}>{item.quantity}×</Text>
                  <Text style={s.roItemName}>{item.name}</Text>
                </View>
              ))
            )}
          </View>

          {/* Lock note */}
          <View style={s.roLockNote}>
            <Text style={s.roLockText}>Pedido de origem externa — somente leitura.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!editReady) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top", "bottom"]}>
        <TabletTopBar
          mode="inner"
          pageTitle="Editar Pedido"
          pageSubtitle="POS · CAIXA"
          onBack={onClose ?? (() => router.back())}
          backLabel="Início"
          userInitial={(owner?.name ?? "C").charAt(0).toUpperCase()}
          onAvatarPress={() => void signOut()}
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 13, color: "rgba(250,245,238,0.40)", letterSpacing: 0.4 }}>Carregando pedido…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top", "bottom"]}>
      <TabletTopBar
        mode="inner"
        pageTitle={editOrder ? "Editar Pedido" : "Novo Pedido"}
        pageSubtitle="POS · CAIXA"
        onBack={onClose ?? (() => router.back())}
        backLabel="Início"
        userInitial={(owner?.name ?? "C").charAt(0).toUpperCase()}
        onAvatarPress={() => void signOut()}
      />

      {catalogLoading || submitting ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "GeistMono_400Regular", fontSize: 13, color: "rgba(250,245,238,0.40)", letterSpacing: 0.4 }}>
            {submitting
              ? (editOrder ? "Salvando alterações…" : "Criando pedido…")
              : "Carregando cardápio..."}
          </Text>
        </View>
      ) : (
        <View style={s.body}>
          {/* Left: catalog */}
          <View style={s.catalogSide}>
            <CategoryRail
              cats={catRailItems}
              active={selectedCat}
              onSelect={setSelectedCat}
              cartCountByCat={cartCountByCat}
            />
            <ProductGrid
              products={filteredProducts}
              cartQtyByProductId={cartQtyByProductId}
              colorIdxByProductId={colorIdxByProductId}
              onAdd={addProduct}
              onDec={decProduct}
            />
          </View>

          <CombinedOrderPanel
            cart={cart}
            orderNote={orderNote} setOrderNote={setOrderNote}
            onInc={incItem} onDec={decItem}
            onRemove={removeItem} onNoteChange={noteItem}
            orderType={orderType} setOrderType={setOrderType}
            customer={customer}
            onOpenCustomerSearch={() => setCustomerModalOpen(true)}
            onClearCustomer={() => { setCustomer(null); setSelectedAddress(null); }}
            selectedAddress={selectedAddress}
            onOpenAddress={() => { if (customer) setAddressModalOpen(true); }}
            payment={payment} setPayment={setPayment}
            tip={tip} setTip={setTip}
            onSubmit={handleSubmit}
            submitting={submitting}
            orderNum={orderNum}
            progressiveDiscount={progressiveDiscount}
            isEdit={!!editOrder}
            existingPayments={editOrder?.payments ?? []}
            orderId={editOrder?.id}
            onOrderUpdated={onOrderUpdated}
          />
        </View>
      )}

      {/* Toast */}
      {toast && (
        <View style={s.toast} pointerEvents="none">
          <IconCheck color="#052e1a" size={18} />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}

      {/* Modifier modal */}
      {modifierProduct && (
        <ModifierModal
          product={modifierProduct}
          onClose={() => setModifierProduct(null)}
          onAdd={addCustomized}
        />
      )}

      {/* Customer search modal */}
      {customerModalOpen && token && (
        <CustomerSearchModal
          token={token}
          onSelect={(c) => setCustomer(c)}
          onClose={() => setCustomerModalOpen(false)}
        />
      )}

      {/* Address modal (saved) */}
      {addressModalOpen && customer && token && (
        <AddressModal
          customer={customer}
          selected={selectedAddress}
          token={token}
          onSelect={setSelectedAddress}
          onClose={() => setAddressModalOpen(false)}
          onAddressUpdated={(updated) => {
            setCustomer((prev) =>
              prev
                ? { ...prev, addresses: prev.addresses.map((a) => a.id === updated.id ? updated : a) }
                : prev
            );
            if (selectedAddress?.id === updated.id) setSelectedAddress(updated);
          }}
          onOpenAddressSearch={() => { setAddressModalOpen(false); setAddressSearchOpen(true); }}
        />
      )}

      {/* Address search modal (Mapbox) */}
      {addressSearchOpen && token && (
        <SearchAddressModal
          token={token}
          customerId={customer?.id ?? null}
          onSelect={(addr) => {
            setSelectedAddress(addr);
            if (customer && !addr.id.startsWith("mapbox_")) {
              setCustomer(prev => prev ? { ...prev, addresses: [...prev.addresses, addr] } : prev);
            }
          }}
          onClose={() => setAddressSearchOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  body: {
    flex: 1, flexDirection: "row", minHeight: 0,
  },

  // ── Read-only external order info ─────────────────────────────────────────
  roContent: {
    padding: 20, gap: 14, maxWidth: 720, width: "100%", alignSelf: "center",
  },
  roTabBar: { flexDirection: "row", gap: 8 },
  roTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10,
    borderWidth: 1, borderColor: D.line, backgroundColor: D.surf,
  },
  roTabActive: { borderColor: D.lineA, backgroundColor: D.surf2 },
  roTabText: {
    fontFamily: "Geist_600SemiBold", fontSize: 13.5, fontWeight: "600", color: D.text,
  },
  roCard: {
    backgroundColor: D.surf, borderRadius: 14, borderWidth: 1, borderColor: D.line,
    padding: 16, gap: 7,
  },
  roCardHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
  },
  roCardLabel: {
    fontFamily: "Geist_600SemiBold", fontSize: 11.5, fontWeight: "600",
    color: D.faint, textTransform: "uppercase", letterSpacing: 0.5,
  },
  roSourceBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 7, paddingVertical: 3, paddingHorizontal: 8,
  },
  roSourceText: {
    fontFamily: "Geist_700Bold", fontSize: 11, lineHeight: 13, fontWeight: "700", letterSpacing: 0.2,
  },
  roCustomerName: {
    fontFamily: "Geist_600SemiBold", fontSize: 18, fontWeight: "600", color: D.text, marginTop: 2,
  },
  roCustomerPhone: { fontFamily: "Geist_400Regular", fontSize: 14, color: D.dim },
  roMuted: { fontFamily: "Geist_400Regular", fontSize: 14, color: D.vfaint },
  roItemRow: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 5 },
  roItemQty: {
    fontFamily: "Geist_600SemiBold", fontSize: 14.5, fontWeight: "600", color: D.text, minWidth: 30,
  },
  roItemName: { flex: 1, fontFamily: "Geist_400Regular", fontSize: 14.5, color: D.dim },
  roLockNote: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 4, paddingTop: 2 },
  roLockText: { fontFamily: "Geist_400Regular", fontSize: 12.5, color: D.vfaint },

  // ── Catalog side ──────────────────────────────────────────────────────────
  catalogSide: {
    flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden",
    backgroundColor: D.bg,
  },

  // ── Category Rail ─────────────────────────────────────────────────────────
  rail: {
    flexShrink: 0, height: 52,
    backgroundColor: D.surf, borderBottomWidth: 1, borderBottomColor: D.line,
  },
  railContent: {
    alignItems: "center", gap: 4, paddingHorizontal: 16,
  },
  railBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: D.line,
  },
  railBtnActive: {
    borderColor: "rgba(255,61,20,0.30)", backgroundColor: "rgba(255,61,20,0.11)",
  },
  railBtnText: {
    fontSize: 13, fontWeight: "500", color: D.dim, letterSpacing: -0.1,
  },
  railBtnTextActive: {
    fontWeight: "700", color: D.zippy,
  },
  railCartBadge: {
    backgroundColor: D.zippy, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1,
  },
  railCartBadgeText: {
    fontSize: 10.5, fontWeight: "700", color: "#fff", lineHeight: 15,
  },
  railCount: {
    fontFamily: "GeistMono_400Regular", fontSize: 10.5, color: D.faint,
  },

  // ── Product Grid ──────────────────────────────────────────────────────────
  gridContent: {
    padding: 10, paddingBottom: 24,
  },
  gridRow: {
    gap: 0,
  },

  // ── Product Card ──────────────────────────────────────────────────────────
  productCard: {
    backgroundColor: D.surf,
    borderWidth: 1, borderColor: D.line,
    borderRadius: 12, overflow: "hidden",
    flexDirection: "column",
  },
  productCardActive: {
    borderColor: "rgba(255,61,20,0.30)",
    shadowColor: D.zippy, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 0.15,
    elevation: 4,
  },
  productThumb: {
    aspectRatio: 16 / 10, alignItems: "center", justifyContent: "center",
    position: "relative", overflow: "hidden",
  },
  productThumbImg: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  },
  productThumbText: {
    fontSize: 28, fontWeight: "800", color: "rgba(255,255,255,0.18)", letterSpacing: -1,
  },
  productQtyBadge: {
    position: "absolute", top: 7, right: 7,
    backgroundColor: D.zippy, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  productQtyBadgeText: {
    fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 15,
  },
  productCustomBadge: {
    position: "absolute", bottom: 7, left: 7,
    backgroundColor: "rgba(255,61,20,0.85)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
  },
  productCustomBadgeText: {
    fontFamily: "GeistMono_400Regular", fontSize: 8, fontWeight: "700",
    color: "#fff", letterSpacing: 0.8, textTransform: "uppercase",
  },
  productInfo: {
    padding: 10, gap: 5,
  },
  productName: {
    fontSize: 12.5, fontWeight: "600", color: D.text, letterSpacing: -0.1, lineHeight: 17, minHeight: 34,
  },
  productRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  productPrice: {
    fontFamily: "GeistMono_700Bold", fontSize: 13, color: D.text, letterSpacing: -0.3,
  },
  addBtn: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: D.line,
  },
  addBtnText: {
    fontSize: 11.5, fontWeight: "600", color: D.faint, letterSpacing: -0.1,
  },

  // ── Qty controls ──────────────────────────────────────────────────────────
  qtyControl: {
    flexDirection: "row", alignItems: "center",
  },
  qtyBtn: {
    width: 24, height: 24,
    alignItems: "center", justifyContent: "center",
    backgroundColor: D.surf2,
  },
  qtyBtnLeft: {
    borderWidth: 1, borderColor: D.line,
    borderRightWidth: 0,
    borderTopLeftRadius: 5, borderBottomLeftRadius: 5,
  },
  qtyBtnRight: {
    borderWidth: 1, borderColor: D.zippy,
    borderLeftWidth: 0,
    borderTopRightRadius: 5, borderBottomRightRadius: 5,
    backgroundColor: D.zippy,
  },
  qtyBtnText: {
    fontSize: 15, fontWeight: "700", color: D.dim, lineHeight: 18,
  },
  qtyNum: {
    width: 24, height: 24,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: D.line,
    alignItems: "center", justifyContent: "center",
    backgroundColor: D.surf2,
  },
  qtyNumText: {
    fontSize: 12, fontWeight: "700", color: D.text,
  },

  // ── Cart item ─────────────────────────────────────────────────────────────
  cartItem: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.line,
    borderRadius: 10, padding: 10, gap: 8,
  },
  cartItemTop: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
  },
  cartThumb: {
    width: 38, height: 38, borderRadius: 9, flexShrink: 0,
    alignItems: "center", justifyContent: "center",
  },
  cartThumbText: {
    fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.65)",
  },
  cartItemName: {
    fontSize: 13, fontWeight: "700", color: D.text, letterSpacing: -0.1, lineHeight: 17,
  },
  cartItemMods: {
    fontSize: 11, color: D.faint, marginTop: 2,
  },
  cartItemRight: {
    flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0,
  },
  cartItemPrice: {
    fontFamily: "GeistMono_700Bold", fontSize: 13, color: D.text,
  },
  cartItemNoteRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  cartItemNoteBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  cartItemNoteBtnText: {
    fontSize: 11.5, color: D.faint,
  },
  cartItemNoteInput: {
    flex: 1, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 9,
    borderWidth: 1, borderColor: D.line, borderRadius: 6,
    color: D.dim, backgroundColor: D.bg, fontFamily: "Geist_400Regular",
  },

  // ── Order Panel ───────────────────────────────────────────────────────────
  cartPanel: {
    width: 280, flexShrink: 0,
    backgroundColor: D.surf,
    borderLeftWidth: 1, borderLeftColor: D.line,
    flexDirection: "column", overflow: "hidden",
  },
  cartPanelHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: D.line,
    flexShrink: 0,
  },
  cartPanelBadge: {
    backgroundColor: D.zippy, borderRadius: 10,
    minWidth: 18, height: 18, paddingHorizontal: 5,
    alignItems: "center", justifyContent: "center",
  },
  cartPanelBadgeText: {
    fontSize: 10, fontWeight: "700", color: "#fff",
  },
  panel: {
    width: 300, flexShrink: 0,
    backgroundColor: D.surf,
    borderLeftWidth: 1, borderLeftColor: D.line,
    flexDirection: "column", overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: D.line,
    flexShrink: 0,
  },
  panelKicker: {
    fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 1.4, color: D.faint,
  },
  panelOrderNum: {
    fontFamily: "GeistMono_700Bold", fontSize: 18, color: D.text, letterSpacing: -0.8, marginTop: 4,
  },
  panelItemsBadge: {
    backgroundColor: D.zippy, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2,
  },
  panelItemsBadgeText: {
    fontSize: 12, fontWeight: "700", color: "#fff",
  },
  panelSection: {
    padding: 10, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: D.line,
    flexShrink: 0,
  },

  // ── Segmented control ─────────────────────────────────────────────────────
  segControl: {
    flexDirection: "row", padding: 3, gap: 2, height: 40,
    backgroundColor: "rgba(239,231,218,0.05)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(239,231,218,0.08)",
  },
  segBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: 7, paddingHorizontal: 14,
  },
  segBtnActive: {
    backgroundColor: "#352D27",
  },
  segBtnText: {
    fontSize: 13.5, fontWeight: "500", color: "#9C8E83",
  },
  segBtnTextActive: {
    fontWeight: "600", color: "#FAF5EE",
  },
  segBadge: {
    backgroundColor: "rgba(239,231,218,0.10)", borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 1,
  },
  segBadgeText: {
    fontFamily: "GeistMono_400Regular", fontSize: 11, fontWeight: "600", color: "#FAF5EE",
  },

  // ── Select Card ───────────────────────────────────────────────────────────
  selectCard: {
    flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, paddingHorizontal: 4,
    borderRadius: 13, borderWidth: 1.5, borderColor: D.line,
    backgroundColor: D.surf2,
  },
  selectCardActive: {
    borderColor: D.zippy,
    backgroundColor: "rgba(255,61,20,0.10)",
    shadowColor: D.zippy, shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, shadowOpacity: 0.16,
    elevation: 4,
  },
  selectCardLabel: {
    fontSize: 12.5, fontWeight: "500", letterSpacing: -0.1,
  },

  // ── Info scroll ───────────────────────────────────────────────────────────
  infoScrollContent: {
    padding: 14, gap: 18,
  },
  infoGroup: {
    gap: 9,
  },
  infoGroupKicker: {
    fontFamily: "GeistMono_400Regular", fontSize: 9, letterSpacing: 1.4, color: D.faint,
  },

  // ── Big customer card ─────────────────────────────────────────────────────
  bigCustomerEmpty: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 13, paddingHorizontal: 14, borderRadius: 13,
    backgroundColor: D.surf2, borderWidth: 1.5, borderColor: D.line,
  },
  bigCustomerEmptyIcon: {
    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
    backgroundColor: "rgba(255,61,20,0.12)", alignItems: "center", justifyContent: "center",
  },
  bigCustomerEmptyLabel: {
    flex: 1, fontSize: 14, fontWeight: "700", color: D.text, letterSpacing: -0.2,
  },
  bigCustomerFilled: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, paddingHorizontal: 14, borderRadius: 13,
    backgroundColor: "rgba(255,61,20,0.08)", borderWidth: 1.5, borderColor: "rgba(255,61,20,0.30)",
  },
  bigCustomerAvatar: {
    width: 42, height: 42, borderRadius: 21, flexShrink: 0,
    backgroundColor: D.zippy, alignItems: "center", justifyContent: "center",
  },
  bigCustomerAvatarText: {
    fontSize: 14, fontWeight: "700", color: "#fff",
  },
  bigCustomerName: {
    fontSize: 14, fontWeight: "700", color: D.text, letterSpacing: -0.1,
  },
  bigCustomerPhone: {
    fontFamily: "GeistMono_400Regular", fontSize: 11.5, color: D.dim, marginTop: 1,
  },
  bigCustomerSwap: {
    height: 30, paddingHorizontal: 11, borderRadius: 8,
    borderWidth: 1, borderColor: D.line, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  bigCustomerSwapText: {
    fontSize: 12, fontWeight: "600", color: D.dim,
  },
  bigCustomerClear: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1, borderColor: D.line, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },

  // ── Big address card ──────────────────────────────────────────────────────
  bigAddressCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 13, paddingHorizontal: 14, borderRadius: 13,
    backgroundColor: D.surf2, borderWidth: 1.5, borderColor: D.line,
  },
  bigAddressCardDashed: {
    borderStyle: "dashed",
  },
  bigAddressIcon: {
    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
    alignItems: "center", justifyContent: "center",
  },
  bigAddressText: {
    fontSize: 13, lineHeight: 18, color: D.faint,
  },
  bigAddressComplement: {
    fontSize: 11.5, color: D.faint, marginTop: 2,
    fontFamily: "GeistMono_400Regular",
  },

  // ── Customer (legacy inline chip — kept for other uses) ───────────────────
  customerSearchBtn: {
    flexDirection: "row", alignItems: "center", gap: 9,
    padding: 10, paddingHorizontal: 13,
    backgroundColor: D.bg, borderWidth: 1, borderColor: D.line,
    borderRadius: 10,
  },
  customerSearchBtnText: {
    fontSize: 13, color: D.faint,
  },

  // ── Address ───────────────────────────────────────────────────────────────
  addressTrigger: {
    flexDirection: "row", alignItems: "flex-start", gap: 9,
    padding: 9, paddingHorizontal: 11,
    backgroundColor: D.bg, borderWidth: 1, borderColor: D.line, borderRadius: 9,
  },
  addressTriggerText: {
    flex: 1, fontSize: 12.5, lineHeight: 18, color: D.faint,
  },
  tableInput: {
    flex: 1, fontSize: 15, fontWeight: "700", color: D.text,
    fontFamily: "GeistMono_700Bold", letterSpacing: -0.3,
  },

  // ── Cart ──────────────────────────────────────────────────────────────────
  cartScroll: { flex: 1 },
  cartContent: {
    padding: 10, paddingHorizontal: 14, gap: 7,
  },
  cartEmpty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 40,
  },
  cartEmptyTitle: {
    fontSize: 13, fontWeight: "600", color: D.dim,
  },
  cartEmptySubtitle: {
    fontSize: 12, color: D.faint, textAlign: "center", lineHeight: 18,
  },

  // ── Order note ────────────────────────────────────────────────────────────
  orderNoteWrap: {
    paddingHorizontal: 14, paddingBottom: 8, flexShrink: 0,
  },
  orderNoteInput: {
    padding: 8, paddingHorizontal: 12,
    backgroundColor: D.bg, borderWidth: 1, borderColor: D.line, borderRadius: 9,
    fontSize: 12.5, color: D.text, fontFamily: "Geist_400Regular",
  },

  // ── Progressive discount widget ───────────────────────────────────────────
  pdWidget: {
    padding: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: D.line,
    backgroundColor: D.surf2, flexShrink: 0,
  },
  pdWidgetLabel: {
    fontFamily: "GeistMono_400Regular", fontSize: 10,
    color: D.dim, letterSpacing: 0.02,
  },
  pdBar: {
    height: 4, borderRadius: 2,
    backgroundColor: "rgba(250,245,238,0.07)", overflow: "hidden",
  },
  pdBarFill: {
    height: "100%", borderRadius: 2,
    transition: "width 300ms",
  } as any,

  // ── Totals ────────────────────────────────────────────────────────────────
  totalsSection: {
    padding: 10, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: D.line,
    backgroundColor: D.surf2, flexShrink: 0, gap: 6,
  },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
  },
  totalLabel: {
    fontSize: 12.5, color: D.dim,
  },
  totalValue: {
    fontFamily: "GeistMono_400Regular", fontSize: 12.5, color: D.dim,
  },
  tipRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  tipBtn: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5,
    borderWidth: 1, borderColor: D.line,
  },
  tipBtnActive: {
    backgroundColor: D.zippy, borderColor: D.zippy,
  },
  tipBtnText: {
    fontSize: 11, fontWeight: "600", color: D.dim, fontFamily: "Geist_400Regular",
  },
  tipBtnTextActive: {
    color: "#fff",
  },
  totalDivider: {
    height: 1, backgroundColor: D.line, marginVertical: 2,
  },
  grandTotal: {
    fontFamily: "GeistMono_700Bold", fontSize: 18, color: D.zippy, letterSpacing: -0.8,
  },

  // ── Payment records list ─────────────────────────────────────────────────
  paymentRecordRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 11, paddingHorizontal: 13, borderRadius: 12,
    backgroundColor: D.surf2, borderWidth: 1.5, borderColor: D.line,
  },
  paymentRecordIcon: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    backgroundColor: "rgba(255,61,20,0.10)", alignItems: "center", justifyContent: "center",
  },
  paymentRecordLabel: {
    fontSize: 13.5, fontWeight: "600", color: D.text, letterSpacing: -0.1,
  },
  paymentRecordTime: {
    fontSize: 11, color: D.faint, fontFamily: "GeistMono_400Regular",
  },
  paymentRecordAmount: {
    fontFamily: "GeistMono_700Bold", fontSize: 14, color: D.text, letterSpacing: -0.5, flexShrink: 0,
  },
  paymentProviderBadge: {
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5,
    backgroundColor: "rgba(255,61,20,0.12)",
  },
  paymentProviderText: {
    fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.zippy, letterSpacing: 0.5,
  },
  // ── Payment ───────────────────────────────────────────────────────────────
  paymentSection: {
    padding: 10, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: D.line,
    flexShrink: 0, gap: 10,
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 15, borderRadius: 12,
    backgroundColor: D.zippy,
    shadowColor: D.zippy, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, shadowOpacity: 0.3,
    elevation: 8,
  },
  submitBtnDisabled: {
    backgroundColor: "rgba(255,61,20,0.15)",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnLoading: {
    opacity: 0.75,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.2,
  },

  // ── Submitting overlay ────────────────────────────────────────────────────
  // ── Toast ─────────────────────────────────────────────────────────────────
  toast: {
    position: "absolute", bottom: 30,
    alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: D.green, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 24,
    shadowColor: D.green, shadowOffset: { width: 0, height: 8 }, shadowRadius: 32, shadowOpacity: 0.3,
    elevation: 12,
  },
  toastText: {
    fontSize: 15, fontWeight: "700", color: "#052e1a", letterSpacing: -0.2,
  },

  // ── Modals shared ─────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: D.line, flexShrink: 0,
  },
  modalTitle: {
    fontSize: 18, fontWeight: "800", color: D.text, letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 12, color: D.faint, marginTop: 3,
    fontFamily: "GeistMono_400Regular",
  },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 9,
    borderWidth: 1, borderColor: D.line,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  modalFooter: {
    flexDirection: "row", gap: 10, alignItems: "center",
    padding: 14, paddingHorizontal: 24,
    borderTopWidth: 1, borderTopColor: D.line, flexShrink: 0,
  },
  modalSecondaryBtn: {
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: 10, borderWidth: 1, borderColor: D.line,
  },
  modalSecondaryBtnText: {
    fontSize: 13, fontWeight: "500", color: D.dim,
  },
  modalPrimaryBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: D.zippy, alignItems: "center",
    shadowColor: D.zippy, shadowOffset: { width: 0, height: 6 }, shadowRadius: 20, shadowOpacity: 0.28,
  },
  modalPrimaryBtnDisabled: {
    backgroundColor: "rgba(255,61,20,0.15)", shadowOpacity: 0,
  },
  modalPrimaryBtnText: {
    fontSize: 15, fontWeight: "800", color: "#fff", letterSpacing: -0.2,
  },

  // ── Modifier modal ────────────────────────────────────────────────────────
  modifierSheet: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.lineA,
    borderRadius: 18, width: "88%", maxWidth: 680, maxHeight: "88%",
    flexDirection: "column", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 40 }, shadowRadius: 100, shadowOpacity: 0.55,
    elevation: 24,
  },
  modGroupTitle: {
    fontSize: 15, fontWeight: "700", color: D.text,
  },
  modGroupBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1,
    borderColor: D.line, backgroundColor: "rgba(250,245,238,0.06)",
  },
  modGroupBadgeText: {
    fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.faint, letterSpacing: 0.3,
  },
  modItem: {
    flexDirection: "column", justifyContent: "space-between",
    padding: 10, borderRadius: 9, minHeight: 62,
    borderWidth: 1.5, borderColor: D.line,
  },
  modItemSel: {
    borderColor: D.zippy, backgroundColor: "rgba(255,61,20,0.08)",
  },
  modItemLabel: {
    fontSize: 13, color: D.text, flex: 1, letterSpacing: -0.1,
  },
  modItemPrice: {
    fontFamily: "GeistMono_400Regular", fontSize: 11, color: D.faint,
  },
  modCheckbox: {
    width: 16, height: 16, borderRadius: 4,
    borderWidth: 1.5, borderColor: D.line,
    alignItems: "center", justifyContent: "center",
  },
  modCheckboxSel: {
    backgroundColor: D.zippy, borderColor: D.zippy,
  },
  modCommentInput: {
    padding: 10, paddingHorizontal: 12, borderRadius: 9,
    borderWidth: 1, borderColor: D.line,
    backgroundColor: D.bg, color: D.text,
    fontSize: 13, fontFamily: "Geist_400Regular", lineHeight: 20,
  },

  // ── Customer search modal ─────────────────────────────────────────────────
  searchSheet: {
    backgroundColor: D.surf, borderWidth: 1, borderColor: D.lineA,
    borderRadius: 18, width: 520, maxHeight: 620,
    flexDirection: "column", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 40 }, shadowRadius: 100, shadowOpacity: 0.6,
    elevation: 24,
  },
  searchInputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: D.bg, borderWidth: 1, borderColor: D.line,
    borderRadius: 11, padding: 11, paddingHorizontal: 12,
    margin: 14, marginTop: 10, flexShrink: 0,
  },
  dialBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0,
  },
  dialFlag: { fontSize: 18 },
  dialCode: { fontFamily: "GeistMono_400Regular", fontSize: 12, color: D.dim },
  dialDivider: { width: 1, height: 18, backgroundColor: D.line },
  dialPicker: {
    marginHorizontal: 14, marginTop: -8, marginBottom: 6,
    backgroundColor: D.surf2, borderRadius: 10, borderWidth: 1, borderColor: D.line,
    overflow: "hidden", flexShrink: 0,
  },
  dialPickerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  dialPickerRowActive: { backgroundColor: "rgba(255,61,20,0.10)" },
  dialPickerName: { flex: 1, fontFamily: "Geist_400Regular", fontSize: 13, color: D.text },
  searchInput: {
    flex: 1, fontSize: 14, color: D.text, fontFamily: "Geist_400Regular",
  },
  searchEmpty: {
    textAlign: "center", color: D.dim, fontSize: 13, paddingVertical: 28,
  },
  customerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: D.line, borderRadius: 11,
  },
  customerAvatar: {
    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
    backgroundColor: "rgba(255,61,20,0.14)", alignItems: "center", justifyContent: "center",
  },
  customerAvatarText: {
    fontSize: 13, fontWeight: "700", color: D.zippy,
  },
  customerName: {
    fontSize: 14, fontWeight: "700", color: D.text, letterSpacing: -0.2,
  },
  customerPhone: {
    fontFamily: "GeistMono_400Regular", fontSize: 11.5, color: D.dim, marginTop: 2,
  },
  createField: {
    backgroundColor: D.bg, borderWidth: 1, borderColor: D.line,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: D.text, fontFamily: "Geist_400Regular",
  },
  newCustomerBtn: {
    flex: 1, paddingVertical: 11,
    borderWidth: 1, borderStyle: "dashed", borderColor: D.line, borderRadius: 11,
    alignItems: "center",
  },
  newCustomerBtnText: {
    fontSize: 13, fontWeight: "600", color: D.dim,
  },

  // ── Combined panel ────────────────────────────────────────────────────────
  combinedPanel: {
    width: 420, flexShrink: 0,
    backgroundColor: D.surf,
    borderLeftWidth: 1, borderLeftColor: D.line,
    flexDirection: "column", overflow: "hidden",
  },
  combinedTabBar: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: D.line,
    flexShrink: 0,
  },
  combinedTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 11,
  },
  combinedTabActive: {
    borderBottomWidth: 2, borderBottomColor: D.zippy,
  },
  combinedTabText: {
    fontFamily: "Geist_700Bold", fontSize: 13, color: D.faint, letterSpacing: -0.1,
  },
  combinedTabTextActive: {
    color: D.text,
  },

  // ── Address modal ─────────────────────────────────────────────────────────
  addressRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: D.line, borderRadius: 11,
    cursor: "pointer",
  } as any,
  addrRadio: {
    width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
    borderWidth: 1.5, borderColor: D.line,
    alignItems: "center", justifyContent: "center",
  },
  addrRadioSel: {
    backgroundColor: D.zippy, borderColor: D.zippy,
  },
  addrLabel: {
    fontSize: 13.5, color: D.text, lineHeight: 20,
  },
  addrDefault: {
    fontFamily: "GeistMono_400Regular", fontSize: 9, color: D.faint,
    letterSpacing: 1, textTransform: "uppercase", marginTop: 3,
  },

  // ── Payment modal ─────────────────────────────────────────────────────────
  pmOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
  },
  pmSheet: {
    width: 420, maxHeight: "92%",
    backgroundColor: D.surf, borderRadius: 18,
    borderWidth: 1, borderColor: D.line,
    shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowRadius: 40, shadowOpacity: 0.5, elevation: 20,
  },
  pmHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: D.line,
  },
  pmTitle: {
    fontSize: 18, fontWeight: "800", color: D.text, letterSpacing: -0.4,
  },
  pmSubtitle: {
    fontSize: 12, color: D.faint, marginTop: 3,
  },
  pmDeleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 34, paddingHorizontal: 12, borderRadius: 9,
    borderWidth: 1, borderColor: D.line,
  },
  pmDeleteText: {
    fontSize: 12.5, fontWeight: "600", color: D.dim,
  },
  pmConfirmSheet: {
    width: 380,
    maxWidth: "92%",
    backgroundColor: D.surf,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: D.line,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 40,
    shadowOpacity: 0.5,
    elevation: 20,
  },
  pmConfirmHeader: {
    padding: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.line,
    gap: 4,
  },
  pmConfirmBody: {
    padding: 18,
    paddingTop: 14,
    gap: 10,
  },
  pmConfirmWarning: {
    fontSize: 13.5,
    lineHeight: 20,
    color: D.dim,
  },
  pmConfirmError: {
    fontSize: 12,
    color: D.zippy,
  },
  pmConfirmActions: {
    flexDirection: "row",
    gap: 10,
    padding: 18,
    paddingTop: 0,
  },
  pmConfirmSecondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: D.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: D.surf2,
  },
  pmConfirmSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: D.text,
  },
  pmConfirmDangerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: D.zippy,
    shadowColor: D.zippy,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    shadowOpacity: 0.2,
    elevation: 8,
  },
  pmConfirmDangerText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  pmCloseBtn: {
    width: 34, height: 34, borderRadius: 9,
    borderWidth: 1, borderColor: D.line,
    alignItems: "center", justifyContent: "center",
  },
  pmAmountBox: {
    padding: 14, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: D.bg, borderWidth: 1.5, borderColor: D.line,
  },
  pmAmountLabel: {
    fontSize: 10.5, fontWeight: "700", color: D.faint,
    letterSpacing: 0.6, textTransform: "uppercase",
  },
  pmChangeText: {
    fontSize: 11.5, fontWeight: "600", color: D.green,
  },
  // ── Payments tab (in PaymentPanel scrollable area) ────────────────────────
  pmBalanceBar: {
    flexDirection: "row", borderRadius: 14, overflow: "hidden",
    borderWidth: 1.5, borderColor: D.line, backgroundColor: D.surf2,
  },
  pmBalanceBarSettled: {
    borderColor: "rgba(46,196,124,0.45)", backgroundColor: "rgba(46,196,124,0.08)",
  },
  pmBalanceCell: {
    flex: 1, paddingVertical: 11, paddingHorizontal: 10, alignItems: "center",
  },
  pmBalanceCellLabel: {
    fontSize: 9.5, fontWeight: "700", color: D.faint,
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  pmBalanceCellValue: {
    fontFamily: "GeistMono_700Bold", fontSize: 15, letterSpacing: -0.5, marginTop: 4,
  },
  pmEmptyState: {
    alignItems: "center", gap: 8,
    padding: 26, paddingHorizontal: 12,
    borderRadius: 13, borderWidth: 1.5, borderStyle: "dashed", borderColor: D.line,
  },
  pmEmptyTitle: {
    fontSize: 12.5, fontWeight: "600", color: D.dim,
  },
  pmEmptySubtitle: {
    fontSize: 11.5, color: D.faint, textAlign: "center", lineHeight: 18,
  },
  pmAddBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
    paddingVertical: 15, borderRadius: 13,
    backgroundColor: D.zippy,
    shadowColor: D.zippy, shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, shadowOpacity: 0.22, elevation: 6,
  },
  pmAddBtnSettled: {
    backgroundColor: "transparent",
    borderWidth: 1.5, borderColor: D.line,
    shadowOpacity: 0, elevation: 0,
  },
  pmAddBtnText: {
    fontSize: 14.5, fontWeight: "800", color: "#fff", letterSpacing: -0.2,
  },
  pmRowDeleteBtn: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1, borderColor: D.line,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6,
  },
});
