export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface Stats {
  hp: number;
  hunger: number;
  thirst: number;
  stamina: number;
  temperature: number;
}

export type ResourceType = "stone" | "wood" | "metal" | "water" | "fiber" | "hide" | "rope";
export type CraftItem = "knife" | "spear" | "campfire" | "waterskin" | "rope";

export interface InventorySlot {
  item: ResourceType | CraftItem;
  count: number;
}

export interface InventoryState {
  slots: (InventorySlot | null)[];
}

export interface PlayerState {
  id: string;
  name: string;
  position: Vec3;
  rotationY: number;
  stats: Stats;
  inventory: InventoryState;
  state: "alive" | "dead";
}

export interface EntityState {
  id: string;
  type: string;
  position: Vec3;
  rotationY?: number;
  hp?: number;
  data?: Record<string, unknown>;
}

export const SERVER_TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const PLAYER_RADIUS = 0.4;
export const WORLD_SIZE = 500;

export interface InputMessage {
  op: "input";
  at: number;
  seq: number;
  move: Vec2;
  look: Vec2;
  actions: {
    jump: boolean;
    hit: boolean;
    interact: boolean;
    inventory: boolean;
  };
}

export interface JoinMessage {
  op: "join";
  id: string;
  seed: number;
}

export interface SnapshotMessage {
  op: "state";
  tick: number;
  you: string;
  players: PlayerState[];
  entities: EntityState[];
  timeOfDay: number;
  temperature: number;
}

export type ServerMessage = JoinMessage | SnapshotMessage;
export type ClientMessage = InputMessage;

export interface Recipe {
  output: CraftItem;
  requires: Partial<Record<ResourceType | CraftItem, number>>;
}

export const RECIPES: Recipe[] = [
  { output: "knife", requires: { stone: 1, metal: 1 } },
  { output: "spear", requires: { wood: 1, stone: 1 } },
  { output: "campfire", requires: { wood: 3, stone: 3 } },
  { output: "rope", requires: { fiber: 3 } },
  { output: "waterskin", requires: { hide: 1, rope: 1 } },
];

export const INVENTORY_SLOT_COUNT = 20;
export const MAX_PLAYERS = 16;
