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
  completedAt?: string;
  goalMinutes?: number;
  expectedAt?: string;
  comments?: string;
  completedComments?: boolean;
  preparationStepModifiers?: TTPreparationStepModifierTrack[];
  preparationStepId: string;
  preparationStepCategoryId: string;
};

export type TTPreparationStepModifierTrack = {
  id: string;
  completed?: boolean;
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

export type TPreparationTaskStation = {
  id: string;
  stationId?: string;
  completed: boolean;
  orderId: string;
  snoozes: TSnooze[];
  station: { id: string; name: string };
  steps: TPreparationStepTrack[];
};

export type TSnooze = {
  startedAt: string;
  duration: number;
  canceled: boolean;
};

export default TStation;
