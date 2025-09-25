import type { Vec3, Stats, ResourceType, CraftItem, NetInputFrame } from "../shared/types.js";

export interface TransformComponent {
  position: Vec3;
  rotation: Vec3;
}

export interface PhysicsComponent {
  velocity: Vec3;
  grounded: boolean;
}

export interface PlayerComponent {
  id: string;
  name: string;
  input: PlayerInputState;
  inventory: InventoryComponent;
  stats: Stats;
  state: "alive" | "dead";
  respawnTimer: number;
}

export interface AIComponent {
  state: "idle" | "patrol" | "aggro";
  target?: string;
  patrolTimer: number;
}

export interface ResourceComponent {
  type: ResourceType;
  amount: number;
  respawnTime: number;
}

export interface DamageableComponent {
  hp: number;
  maxHp: number;
}

export interface HeatSourceComponent {
  radius: number;
  temperature: number;
}

export interface CraftingStationComponent {
  recipes: CraftItem[];
}

export interface InventoryComponent {
  slots: (InventorySlot | null)[];
}

export interface InventorySlot {
  item: ResourceType | CraftItem;
  count: number;
}

export interface PlayerInputState extends NetInputFrame {
  seq: number;
}

export interface NetworkComponent {
  dirty: boolean;
}

export type Entity = number;
