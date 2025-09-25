import type { Vec3, Stats, InventoryState, CraftItem, ResourceType } from "../shared/types";

export interface TransformComponent {
  position: Vec3;
  rotation: Vec3;
}

export interface RenderComponent {
  meshId: string;
}

export interface AnimatorComponent {
  state: "idle" | "walk" | "attack" | "gather" | "dead";
  blend: number;
}

export interface PlayerComponent {
  id: string;
  local: boolean;
  stats: Stats;
  inventory: InventoryState;
}

export interface NetworkComponent {
  targetPosition: Vec3;
  targetRotationY: number;
  lastUpdate: number;
}

export interface ResourceComponent {
  type: ResourceType;
  amount: number;
}

export interface InteractableComponent {
  radius: number;
  type: "resource" | "crafting" | "heat";
}

export interface HeatComponent {
  temperature: number;
}

export interface AIComponent {
  hp: number;
}

export interface CraftingQueueComponent {
  active: boolean;
  timer: number;
  recipe: CraftItem | null;
}

export interface UIStateComponent {
  openInventory: boolean;
}
