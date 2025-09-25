import { WORLD_SIZE, type SnapshotMessage, type Vec3, type PlayerState } from "../shared/types.js";
import type { World } from "../ecs/world.js";
import type {
  TransformComponent,
  PlayerComponent,
  ResourceComponent,
  DamageableComponent,
  HeatSourceComponent,
  AIComponent,
} from "../ecs/components.js";
import { randomUUID } from "crypto";

export interface Simulation {
  world: World;
  tick: number;
  timeOfDay: number;
  temperature: number;
}

export const DAY_LENGTH_SECONDS = 600;
export const BASE_TEMPERATURE = 35;
export const NIGHT_TEMPERATURE = 18;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function randomPoint(radius: number): Vec3 {
  const x = (Math.random() - 0.5) * radius;
  const z = (Math.random() - 0.5) * radius;
  return [x, 0, z];
}

export function updateEnvironment(sim: Simulation, dt: number): void {
  sim.timeOfDay = (sim.timeOfDay + dt / DAY_LENGTH_SECONDS) % 1;
  const isDay = sim.timeOfDay >= 0.15 && sim.timeOfDay <= 0.8;
  const dayFactor = isDay ? 1 : 0;
  sim.temperature = dayFactor * BASE_TEMPERATURE + (1 - dayFactor) * NIGHT_TEMPERATURE;
}

export function toSnapshot(sim: Simulation, you: string): SnapshotMessage {
  const players: PlayerState[] = [];
  const entities = [] as SnapshotMessage["entities"];
  const world = sim.world;
  const playerEntities = world.query("transform", "player");
  for (const entity of playerEntities) {
    const transform = world.getComponent<TransformComponent>(entity, "transform")!;
    const player = world.getComponent<PlayerComponent>(entity, "player")!;
    players.push({
      id: player.id,
      name: player.name,
      position: transform.position,
      rotationY: transform.rotation[1],
      stats: player.stats,
      inventory: player.inventory,
      state: player.state,
    });
  }
  const resourceEntities = world.query("transform", "resource");
  for (const entity of resourceEntities) {
    const transform = world.getComponent<TransformComponent>(entity, "transform")!;
    const resource = world.getComponent<ResourceComponent>(entity, "resource")!;
    entities.push({
      id: `res_${entity}`,
      type: resource.type,
      position: transform.position,
      data: { amount: resource.amount },
    });
  }
  const aiEntities = world.query("transform", "ai");
  for (const entity of aiEntities) {
    const transform = world.getComponent<TransformComponent>(entity, "transform")!;
    const ai = world.getComponent<AIComponent>(entity, "ai")!;
    const dmg = world.getComponent<DamageableComponent>(entity, "damageable");
    entities.push({
      id: `ai_${entity}`,
      type: "rat",
      position: transform.position,
      hp: dmg?.hp,
      data: { state: ai.state },
    });
  }
  const heatEntities = world.query("transform", "heat");
  for (const entity of heatEntities) {
    const transform = world.getComponent<TransformComponent>(entity, "transform")!;
    const heat = world.getComponent<HeatSourceComponent>(entity, "heat")!;
    entities.push({
      id: `heat_${entity}`,
      type: "heat",
      position: transform.position,
      data: { radius: heat.radius, temperature: heat.temperature },
    });
  }

  return {
    op: "state",
    tick: sim.tick,
    you,
    players,
    entities,
    timeOfDay: sim.timeOfDay,
    temperature: sim.temperature,
  };
}

export function spawnPoint(): Vec3 {
  return randomPoint(WORLD_SIZE * 0.45);
}

export function seedRandom(seed: number): void {
  let x = seed;
  Math.random = function () {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  } as () => number;
}

export function createPlayerId(): string {
  return `p_${randomUUID().slice(0, 6)}`;
}
