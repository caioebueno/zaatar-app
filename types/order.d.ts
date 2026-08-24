import TAddress from "./address";
import TCustomer from "./costumer";
import TProduct from "./product";
import { TPreparationTaskStation } from "./station";

export type TPaymentMethod = "CARD" | "CASH" | "ZELLE";
export type TOrderType = "DELIVERY" | "TAKEAWAY";

export type TOrder = {
  id: string;
  createdAt: string;
  productionIndex?: number;
  scheduleFor?: string | null;
  number?: string;
  type: TOrderType;
  costumerId?: string;
  customer?: TCustomer;
  paymentMethod: TPaymentMethod;
  addressId?: string;
  address?: TAddress;
  orderProducts: TOrderProduct[];
  preparationTaskStation: TPreparationTaskStation[];
};

export type TOrderProduct = {
  id: string;
  productId: string;
  product?: TProduct;
  amount: number;
  fullAmount: number;
  quantity: number;
};
