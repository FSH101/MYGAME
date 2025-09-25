import type { World } from "../ecs/world";
import type { TransformComponent, PlayerComponent, NetworkComponent, ResourceComponent, InteractableComponent, HeatComponent, AIComponent } from "../components";
import { getSnapshot } from "../net/state";
import type { WorldSnapshot } from "../net/state";

const playerMap = new Map<string, number>();
const entityMap = new Map<string, number>();

export function syncFromNetwork(world: World): void {
  const snapshot = getSnapshot();
  if (!snapshot) return;
  syncPlayers(world, snapshot);
  syncEntities(world, snapshot);
}

function syncPlayers(world: World, snapshot: WorldSnapshot): void {
  const seen = new Set<string>();
  for (const state of snapshot.players) {
    seen.add(state.id);
    let entity = playerMap.get(state.id);
    if (!entity) {
      entity = world.create();
      world.set<TransformComponent>(entity, "transform", { position: state.position, rotation: [0, state.rotationY, 0] });
      world.set<PlayerComponent>(entity, "player", {
        id: state.id,
        local: state.id === snapshot.you,
        stats: state.stats,
        inventory: state.inventory,
      });
      world.set<NetworkComponent>(entity, "network", {
        targetPosition: state.position,
        targetRotationY: state.rotationY,
        lastUpdate: performance.now(),
      });
      playerMap.set(state.id, entity);
    } else {
      const transform = world.get<TransformComponent>(entity, "transform");
      const player = world.get<PlayerComponent>(entity, "player");
      const net = world.get<NetworkComponent>(entity, "network");
      if (transform && net && player) {
        net.targetPosition = state.position;
        net.targetRotationY = state.rotationY;
        net.lastUpdate = performance.now();
        transform.position = lerpVec(transform.position, state.position, 0.2);
        transform.rotation[1] = lerp(transform.rotation[1], state.rotationY, 0.3);
        player.stats = state.stats;
        player.inventory = state.inventory;
      }
    }
  }
  for (const [id, entity] of playerMap.entries()) {
    if (!seen.has(id)) {
      world.destroy(entity);
      playerMap.delete(id);
    }
  }
}

function syncEntities(world: World, snapshot: WorldSnapshot): void {
  const seen = new Set<string>();
  for (const state of snapshot.entities) {
    seen.add(state.id);
    let entity = entityMap.get(state.id);
    if (!entity) {
      entity = world.create();
      world.set<TransformComponent>(entity, "transform", { position: state.position, rotation: [0, state.rotationY ?? 0, 0] });
      entityMap.set(state.id, entity);
      if (state.type === "rat") {
        world.set<AIComponent>(entity, "ai", { hp: state.hp ?? 40 });
      }
      if (state.type === "rock" || state.type === "wood" || state.type === "metal" || state.type === "water" || state.type === "fiber") {
        world.set<ResourceComponent>(entity, "resource", { type: state.type as ResourceComponent["type"], amount: (state.data?.amount as number) ?? 0 });
        world.set<InteractableComponent>(entity, "interactable", { radius: 3, type: "resource" });
      }
      if (state.type === "heat") {
        const data = state.data ?? {};
        world.set<HeatComponent>(entity, "heat", { temperature: Number(data.temperature ?? 45) });
        world.set<InteractableComponent>(entity, "interactable", { radius: Number(data.radius ?? 4), type: "heat" });
      }
    } else {
      const transform = world.get<TransformComponent>(entity, "transform");
      if (transform) {
        transform.position = lerpVec(transform.position, state.position, 0.35);
        if (state.rotationY !== undefined) {
          transform.rotation[1] = lerp(transform.rotation[1], state.rotationY, 0.35);
        }
      }
      const resource = world.get<ResourceComponent>(entity, "resource");
      if (resource && state.data?.amount !== undefined) {
        resource.amount = state.data.amount as number;
      }
      const ai = world.get<AIComponent>(entity, "ai");
      if (ai && state.hp !== undefined) {
        ai.hp = state.hp;
      }
    }
  }
  for (const [id, entity] of entityMap.entries()) {
    if (!seen.has(id)) {
      world.destroy(entity);
      entityMap.delete(id);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
