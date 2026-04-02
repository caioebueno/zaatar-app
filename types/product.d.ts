import { Image } from "./file";
import { TPreparationStep } from "./station";

type TProduct = {
  id: string;
  name: string;
  photos?: Image[];
  price?: number | null;
  description?: string | null;
  categoryId?: string | null;
  comparedAtPrice?: number | null;
  modifierGroups?: TModifierGroup[];
  preparationStep?: TPreparationStep[];
  translations?: {
    [key: string]: {
      [key: string];
    };
  };
};

type TModifierGroup = {
  id: string;
  title: string;
  required: boolean;
  items: TModifierGroupItem[];
};

type TModifierGroupItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
};

export default TProduct;
export { TModifierGroup, TModifierGroupItem };
