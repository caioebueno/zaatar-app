import TCategory from "./category";
import { TModifierGroupItem } from "./product";

type TStation = {
  id: string;
  name: string;
  preparationSteps: TPreparationStep[];
};

export type TPreparationStep = {
  id: string;
  name: string;
  stationId: string;
  includeModifiers?: boolean;
  includeComments?: boolean;
  productIds: string[];
};

export type TPreparationStepTrack = {
  id: string;
  name: string;
  quantity: number;
  completed: boolean;
  comments?: string;
  preparationStepModifiers?: TTPreparationStepModifierTrack[];
  preparationStepId: string;
  preparationStepCategoryId: string;
};

export type TTPreparationStepModifierTrack = {
  id: string;
  modifierGroupItem: string;
  modifierGtroupItem?: TModifierGroupItem;
};

export type TPreparationStepCategory = {
  id: string;
  categoryId: string;
  category?: TCategory;
  completed: boolean;
  orderId: string;
  snoozes: TSnooze[];
  steps: TPreparationStepTrack[];
};

export type TSnooze = {
  startedAt: string;
  duration: number;
  canceled: boolean;
};

export default TStation;
