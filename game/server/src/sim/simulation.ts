import {
  WORLD_SIZE,
  type InputMessage,
  type SnapshotMessage,
  type Vec3,
  SERVER_TICK_RATE,
} from "../shared/types.js";
import { World } from "../ecs/world.js";
import type {
  TransformComponent,
  PlayerComponent,
  PhysicsComponent,
  ResourceComponent,
  DamageableComponent,
  AIComponent,
  HeatSourceComponent,
  CraftingStationComponent,
  PlayerInputState,
} from "../ecs/components.js";
import {
  Simulation,
  updateEnvironment,
  toSnapshot,
  spawnPoint,
  clamp,
  createPlayerId,
} from "./world.js";
import { RECIPES, type CraftItem, type ResourceType, INVENTORY_SLOT_COUNT } from "../shared/types.js";

const JUMP_SPEED = 6;
const GRAVITY = -18;
const PLAYER_SPEED = 6;
const SPRINT_SPEED = 8.5;
const RAT_SPEED = 4.5;
const RAT_RANGE = 18;
const HIT_RANGE = 2.2;
const RESOURCE_RESPAWN = 120;
const PLAYER_RESPAWN = 10;
const STATS_DECAY = 0.01;
const THIRST_TEMP_BONUS = 0.015;
const STAMINA_REGEN = 5;
const STAMINA_SPRINT_DRAIN = 9;
const HIT_COOLDOWN = 0.8;
const DAMAGE_SPEAR = 28;
const DAMAGE_KNIFE = 20;
const DAMAGE_FIST = 8;
const RAT_DAMAGE = 6;

interface InputBuffer {
  id: string;
  pending: InputMessage[];
}

export class ServerSimulation {
  sim: Simulation;
  private inputs = new Map<string, InputBuffer>();
  private entityByPlayerId = new Map<string, number>();
  private lastHit = new Map<string, number>();

  constructor() {
    this.sim = {
      world: new World(),
      tick: 0,
      timeOfDay: 0.25,
      temperature: 32,
    };
    this.seedWorld();
  }

  private seedWorld(): void {
    const world = this.sim.world;
    // Scatter resource nodes
    const resources: ResourceType[] = ["stone", "wood", "metal", "water", "fiber"];
    for (let i = 0; i < 180; i++) {
      const type = resources[i % resources.length];
      const entity = world.createEntity();
      world.addComponent<TransformComponent>(entity, "transform", {
        position: spawnPoint(),
        rotation: [0, Math.random() * Math.PI * 2, 0],
      });
      world.addComponent<ResourceComponent>(entity, "resource", {
        type,
        amount: 1 + Math.floor(Math.random() * 3),
        respawnTime: RESOURCE_RESPAWN,
      });
    }

    // Campfire heat sources / crafting
    for (let i = 0; i < 6; i++) {
      const entity = world.createEntity();
      world.addComponent<TransformComponent>(entity, "transform", {
        position: spawnPoint(),
        rotation: [0, 0, 0],
      });
      world.addComponent<HeatSourceComponent>(entity, "heat", { radius: 6, temperature: 50 });
      world.addComponent<CraftingStationComponent>(entity, "crafting", { recipes: ["campfire", "rope", "waterskin"] });
    }

    // Mobs
    for (let i = 0; i < 12; i++) {
      const entity = world.createEntity();
      world.addComponent<TransformComponent>(entity, "transform", {
        position: spawnPoint(),
        rotation: [0, Math.random() * Math.PI * 2, 0],
      });
      world.addComponent<PhysicsComponent>(entity, "physics", { velocity: [0, 0, 0], grounded: true });
      world.addComponent<AIComponent>(entity, "ai", { state: "patrol", patrolTimer: 5 + Math.random() * 5 });
      world.addComponent<DamageableComponent>(entity, "damageable", { hp: 40, maxHp: 40 });
    }
  }

  attachPlayer(id: string, name: string): string {
    const entity = this.sim.world.createEntity();
    const spawn = spawnPoint();
    const playerId = createPlayerId();
    this.sim.world.addComponent<TransformComponent>(entity, "transform", {
      position: spawn,
      rotation: [0, 0, 0],
    });
    this.sim.world.addComponent<PhysicsComponent>(entity, "physics", {
      velocity: [0, 0, 0],
      grounded: true,
    });
    this.sim.world.addComponent<PlayerComponent>(entity, "player", {
      id: playerId,
      name,
      input: this.emptyInput(),
      inventory: this.createInventory(),
      stats: {
        hp: 100,
        hunger: 100,
        thirst: 100,
        stamina: 100,
        temperature: 32,
      },
      state: "alive",
      respawnTimer: 0,
    });
    this.inputs.set(id, { id, pending: [] });
    this.entityByPlayerId.set(id, entity);
    return playerId;
  }

  detachPlayer(id: string): void {
    const entity = this.entityByPlayerId.get(id);
    if (entity) {
      this.sim.world.destroyEntity(entity);
      this.entityByPlayerId.delete(id);
    }
    this.inputs.delete(id);
  }

  receiveInput(id: string, input: InputMessage): void {
    const buffer = this.inputs.get(id);
    if (!buffer) return;
    buffer.pending.push(input);
  }

  step(dt: number): void {
    const world = this.sim.world;
    this.sim.tick += 1;
    updateEnvironment(this.sim, dt);
    this.updatePlayers(world, dt);
    this.updateAI(world, dt);
    this.regenerateResources(world, dt);
  }

  private emptyInput(): PlayerInputState {
    return {
      seq: 0,
      t: 0,
      mv: { x: 0, z: 0 },
      sp: 0,
      yaw: 0,
      pitch: 0,
      atk: 0,
      jmp: 0,
      cr: 0,
      pr: 0,
      inr: 0,
      inv: 0,
    };
  }

  private createInventory() {
    return { slots: Array.from({ length: INVENTORY_SLOT_COUNT }, () => null) };
  }

  private updatePlayers(world: World, dt: number): void {
    for (const [socketId, entity] of this.entityByPlayerId.entries()) {
      const player = world.getComponent<PlayerComponent>(entity, "player");
      const transform = world.getComponent<TransformComponent>(entity, "transform");
      const physics = world.getComponent<PhysicsComponent>(entity, "physics");
      if (!player || !transform || !physics) continue;

      const buffer = this.inputs.get(socketId);
      if (buffer && buffer.pending.length > 0) {
        const latest = buffer.pending[buffer.pending.length - 1];
        const { op: _op, ...rest } = latest;
        void _op;
        player.input = { ...rest };
        buffer.pending = [];
      }

      if (player.state === "dead") {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          player.state = "alive";
          player.stats.hp = 100;
          player.stats.hunger = 80;
          player.stats.thirst = 80;
          transform.position = spawnPoint();
        }
        continue;
      }

      const move = player.input.mv;
      const speed = player.input.sp ? SPRINT_SPEED : PLAYER_SPEED;
      const forward: Vec3 = [Math.sin(transform.rotation[1]), 0, Math.cos(transform.rotation[1])];
      const right: Vec3 = [forward[2], 0, -forward[0]];
      const desired: Vec3 = [0, 0, 0];
      desired[0] = forward[0] * move.z + right[0] * move.x;
      desired[2] = forward[2] * move.z + right[2] * move.x;
      const mag = Math.hypot(desired[0], desired[2]);
      if (mag > 1e-3) {
        desired[0] /= mag;
        desired[2] /= mag;
      }
      physics.velocity[0] = desired[0] * speed;
      physics.velocity[2] = desired[2] * speed;

      physics.velocity[1] += GRAVITY * dt;
      if (player.input.jmp && physics.grounded) {
        physics.velocity[1] = JUMP_SPEED;
        physics.grounded = false;
        player.input.jmp = 0;
      }

      transform.position[0] = clamp(transform.position[0] + physics.velocity[0] * dt, -WORLD_SIZE / 2, WORLD_SIZE / 2);
      transform.position[2] = clamp(transform.position[2] + physics.velocity[2] * dt, -WORLD_SIZE / 2, WORLD_SIZE / 2);
      transform.position[1] = Math.max(0, transform.position[1] + physics.velocity[1] * dt);
      if (transform.position[1] <= 0) {
        physics.grounded = true;
        physics.velocity[1] = 0;
      }

      transform.rotation[1] += player.input.yaw;
      player.input.yaw = 0;
      player.input.pitch = 0;

      this.handleStats(player, dt);
      this.handleInteractions(entity, player, transform);
    }
  }

  private handleStats(player: PlayerComponent, dt: number): void {
    const thirstDrain = STATS_DECAY + (this.sim.temperature - 25) * THIRST_TEMP_BONUS * dt;
    player.stats.thirst = clamp(player.stats.thirst - thirstDrain, 0, 100);
    player.stats.hunger = clamp(player.stats.hunger - STATS_DECAY * dt, 0, 100);
    if (player.input.sp && player.stats.stamina > 0) {
      player.stats.stamina = clamp(player.stats.stamina - STAMINA_SPRINT_DRAIN * dt, 0, 100);
    } else if (player.stats.stamina < 100) {
      player.stats.stamina = clamp(player.stats.stamina + STAMINA_REGEN * dt, 0, 100);
    }
    if (player.stats.thirst <= 0 || player.stats.hunger <= 0) {
      player.stats.hp = clamp(player.stats.hp - 8 * dt, 0, 100);
    }
    if (player.stats.hp <= 0) {
      player.state = "dead";
      player.respawnTimer = PLAYER_RESPAWN;
      // Drop half inventory (simplified: clear first half)
      for (let i = 0; i < player.inventory.slots.length; i++) {
        if (i % 2 === 0) player.inventory.slots[i] = null;
      }
    }
  }

  private handleInteractions(entity: number, player: PlayerComponent, transform: TransformComponent): void {
    const world = this.sim.world;
    const input = player.input;
    if (input.atk) {
      const key = player.id;
      const last = this.lastHit.get(key) ?? 0;
      if (this.sim.tick - last > HIT_COOLDOWN * SERVER_TICK_RATE) {
        this.performHit(entity, player, transform);
        this.lastHit.set(key, this.sim.tick);
      }
    }
    if (input.inr) {
      const resources = world.query("resource", "transform");
      for (const res of resources) {
        const resource = world.getComponent<ResourceComponent>(res, "resource")!;
        const t = world.getComponent<TransformComponent>(res, "transform")!;
        const dist = distance(transform.position, t.position);
        if (dist < 3 && resource.amount > 0) {
          this.addToInventory(player.inventory, resource.type, 1);
          resource.amount -= 1;
          if (resource.amount <= 0) {
            resource.respawnTime = RESOURCE_RESPAWN;
          }
          break;
        }
      }
      input.inr = 0;
    }
  }

  private addToInventory(inventory: PlayerComponent["inventory"], item: ResourceType | CraftItem, amount: number): void {
    for (const slot of inventory.slots) {
      if (slot && slot.item === item) {
        slot.count += amount;
        return;
      }
    }
    const empty = inventory.slots.findIndex((slot) => slot === null);
    if (empty !== -1) {
      inventory.slots[empty] = { item, count: amount };
    }
  }

  craft(playerId: string, recipeId: CraftItem): boolean {
    const entity = this.entityByPlayerId.get(playerId);
    if (!entity) return false;
    const player = this.sim.world.getComponent<PlayerComponent>(entity, "player");
    if (!player || player.state === "dead") return false;
    const recipe = RECIPES.find((r) => r.output === recipeId);
    if (!recipe) return false;
    if (!this.hasItems(player.inventory, recipe.requires)) return false;
    this.consumeItems(player.inventory, recipe.requires);
    this.addToInventory(player.inventory, recipe.output, 1);
    return true;
  }

  private hasItems(inventory: PlayerComponent["inventory"], requires: Record<string, number>): boolean {
    for (const [item, count] of Object.entries(requires)) {
      const total = inventory.slots
        .filter((slot): slot is { item: ResourceType | CraftItem; count: number } => slot !== null)
        .filter((slot) => slot.item === (item as ResourceType | CraftItem))
        .reduce((sum, slot) => sum + slot.count, 0);
      if (total < count) return false;
    }
    return true;
  }

  private consumeItems(inventory: PlayerComponent["inventory"], requires: Record<string, number>): void {
    for (const [item, count] of Object.entries(requires)) {
      let remaining = count;
      for (let i = 0; i < inventory.slots.length; i++) {
        const slot = inventory.slots[i];
        if (!slot || slot.item !== (item as ResourceType | CraftItem)) continue;
        const used = Math.min(slot.count, remaining);
        slot.count -= used;
        remaining -= used;
        if (slot.count === 0) {
          inventory.slots[i] = null;
        }
        if (remaining <= 0) break;
      }
    }
  }

  private performHit(entity: number, player: PlayerComponent, transform: TransformComponent): void {
    const world = this.sim.world;
    const attackDir: Vec3 = [Math.sin(transform.rotation[1]), 0, Math.cos(transform.rotation[1])];
    const targetPos: Vec3 = [
      transform.position[0] + attackDir[0] * HIT_RANGE,
      transform.position[1],
      transform.position[2] + attackDir[2] * HIT_RANGE,
    ];

    const damage = this.computeDamage(player);

    const aiEntities = world.query("ai", "damageable", "transform");
    for (const ai of aiEntities) {
      const t = world.getComponent<TransformComponent>(ai, "transform")!;
      const dmg = world.getComponent<DamageableComponent>(ai, "damageable")!;
      if (distance(t.position, targetPos) < HIT_RANGE) {
        dmg.hp = Math.max(0, dmg.hp - damage);
        if (dmg.hp <= 0) {
          this.addToInventory(player.inventory, "hide", 1);
          this.addToInventory(player.inventory, "fiber", 1);
          t.position = spawnPoint();
          dmg.hp = dmg.maxHp;
        }
        break;
      }
    }
  }

  private computeDamage(player: PlayerComponent): number {
    const inv = player.inventory.slots;
    const hasSpear = inv.some((slot) => slot?.item === "spear");
    if (hasSpear) return DAMAGE_SPEAR;
    const hasKnife = inv.some((slot) => slot?.item === "knife");
    if (hasKnife) return DAMAGE_KNIFE;
    return DAMAGE_FIST;
  }

  private updateAI(world: World, dt: number): void {
    const aiEntities = world.query("ai", "transform", "physics");
    for (const entity of aiEntities) {
      const ai = world.getComponent<AIComponent>(entity, "ai")!;
      const transform = world.getComponent<TransformComponent>(entity, "transform")!;
      const physics = world.getComponent<PhysicsComponent>(entity, "physics")!;
      const dmg = world.getComponent<DamageableComponent>(entity, "damageable")!;

      if (dmg.hp <= 0) continue;

      ai.patrolTimer -= dt;
      if (ai.state === "patrol") {
        if (ai.patrolTimer <= 0) {
          ai.patrolTimer = 4 + Math.random() * 4;
          transform.rotation[1] += (Math.random() - 0.5) * Math.PI;
        }
        physics.velocity[0] = Math.sin(transform.rotation[1]) * RAT_SPEED;
        physics.velocity[2] = Math.cos(transform.rotation[1]) * RAT_SPEED;
      }

      const playerEntities = world.query("player", "transform");
      let closest: { entity: number; dist: number } | null = null;
      for (const playerEntity of playerEntities) {
        const pTransform = world.getComponent<TransformComponent>(playerEntity, "transform")!;
        const dist = distance(pTransform.position, transform.position);
        if (dist < RAT_RANGE && (!closest || dist < closest.dist)) {
          closest = { entity: playerEntity, dist };
        }
      }
      if (closest) {
        ai.state = "aggro";
        const targetTransform = world.getComponent<TransformComponent>(closest.entity, "transform")!;
        const dirX = targetTransform.position[0] - transform.position[0];
        const dirZ = targetTransform.position[2] - transform.position[2];
        const mag = Math.hypot(dirX, dirZ) || 1;
        physics.velocity[0] = (dirX / mag) * RAT_SPEED;
        physics.velocity[2] = (dirZ / mag) * RAT_SPEED;
        transform.rotation[1] = Math.atan2(dirX, dirZ);
        if (closest.dist < 1.5) {
          const player = world.getComponent<PlayerComponent>(closest.entity, "player")!;
          player.stats.hp = clamp(player.stats.hp - RAT_DAMAGE * dt, 0, 100);
        }
      } else {
        ai.state = "patrol";
      }

      transform.position[0] = clamp(transform.position[0] + physics.velocity[0] * dt, -WORLD_SIZE / 2, WORLD_SIZE / 2);
      transform.position[2] = clamp(transform.position[2] + physics.velocity[2] * dt, -WORLD_SIZE / 2, WORLD_SIZE / 2);
    }
  }

  private regenerateResources(world: World, dt: number): void {
    const resources = world.query("resource");
    for (const entity of resources) {
      const resource = world.getComponent<ResourceComponent>(entity, "resource")!;
      if (resource.amount <= 0) {
        resource.respawnTime -= dt;
        if (resource.respawnTime <= 0) {
          resource.amount = 1 + Math.floor(Math.random() * 3);
          resource.respawnTime = RESOURCE_RESPAWN;
        }
      }
    }
  }

  snapshotFor(id: string): SnapshotMessage {
    const entity = this.entityByPlayerId.get(id);
    const player = this.sim.world.getComponent<PlayerComponent>(entity ?? -1, "player");
    const you = player?.id ?? "";
    return toSnapshot(this.sim, you);
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
