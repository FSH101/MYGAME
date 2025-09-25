import type { Scene, AbstractMesh } from "@babylonjs/core";
import { Color3, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { World } from "../ecs/world";
import type { TransformComponent, PlayerComponent, ResourceComponent, AIComponent, HeatComponent } from "../components";

const meshCache = new Map<number, AbstractMesh>();
let playerMaterial: StandardMaterial | null = null;
let otherMaterial: StandardMaterial | null = null;
const resourceMaterials = new Map<string, StandardMaterial>();
let heatMaterial: StandardMaterial | null = null;

export function updateRender(scene: Scene, world: World): void {
  const entities = world.query("transform");
  const seen = new Set<number>();
  for (const entity of entities) {
    const transform = world.get<TransformComponent>(entity, "transform");
    if (!transform) continue;
    seen.add(entity);
    let mesh = meshCache.get(entity);
    if (!mesh) {
      const player = world.get<PlayerComponent>(entity, "player");
      const resource = world.get<ResourceComponent>(entity, "resource");
      const ai = world.get<AIComponent>(entity, "ai");
      const heat = world.get<HeatComponent>(entity, "heat");
      if (player) {
        mesh = MeshBuilder.CreateCapsule(`player_${entity}`, { radius: 0.4, height: 1.8 }, scene);
        mesh.material = getPlayerMaterial(scene, player.local);
      } else if (resource) {
        mesh = MeshBuilder.CreateBox(`res_${entity}`, { size: 1 }, scene);
        mesh.material = getResourceMaterial(scene, resource.type);
      } else if (ai) {
        mesh = MeshBuilder.CreateSphere(`rat_${entity}`, { diameter: 1.2 }, scene);
        mesh.material = getResourceMaterial(scene, "rat");
      } else if (heat) {
        mesh = MeshBuilder.CreateCylinder(`heat_${entity}`, { diameter: 1.2, height: 0.2 }, scene);
        mesh.material = getHeatMaterial(scene);
      } else {
        mesh = MeshBuilder.CreateBox(`ent_${entity}`, { size: 1 }, scene);
      }
      meshCache.set(entity, mesh);
    }
    mesh.position = new Vector3(transform.position[0], transform.position[1], transform.position[2]);
    mesh.rotationQuaternion = null;
    mesh.rotation.y = transform.rotation[1];
    const resource = world.get<ResourceComponent>(entity, "resource");
    if (resource && resource.amount <= 0) {
      mesh.setEnabled(false);
    } else {
      mesh.setEnabled(true);
    }
  }

  for (const [entity, mesh] of meshCache.entries()) {
    if (!seen.has(entity)) {
      mesh.dispose();
      meshCache.delete(entity);
    }
  }
}

function getPlayerMaterial(scene: Scene, local: boolean): StandardMaterial {
  if (local) {
    if (!playerMaterial) {
      playerMaterial = new StandardMaterial("playerLocal", scene);
      playerMaterial.diffuseColor = new Color3(0.4, 0.8, 0.9);
    }
    return playerMaterial;
  }
  if (!otherMaterial) {
    otherMaterial = new StandardMaterial("playerRemote", scene);
    otherMaterial.diffuseColor = new Color3(0.9, 0.6, 0.4);
  }
  return otherMaterial;
}

function getResourceMaterial(scene: Scene, type: string): StandardMaterial {
  if (!resourceMaterials.has(type)) {
    const mat = new StandardMaterial(`mat_${type}`, scene);
    switch (type) {
      case "stone":
        mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
        break;
      case "wood":
        mat.diffuseColor = new Color3(0.4, 0.3, 0.2);
        break;
      case "metal":
        mat.diffuseColor = new Color3(0.7, 0.7, 0.8);
        break;
      case "water":
        mat.diffuseColor = new Color3(0.2, 0.4, 0.9);
        mat.alpha = 0.8;
        break;
      case "fiber":
        mat.diffuseColor = new Color3(0.3, 0.6, 0.3);
        break;
      case "rat":
        mat.diffuseColor = new Color3(0.8, 0.7, 0.4);
        break;
      default:
        mat.diffuseColor = new Color3(0.8, 0.8, 0.8);
        break;
    }
    resourceMaterials.set(type, mat);
  }
  return resourceMaterials.get(type)!;
}

function getHeatMaterial(scene: Scene): StandardMaterial {
  if (!heatMaterial) {
    heatMaterial = new StandardMaterial("heat", scene);
    heatMaterial.diffuseColor = new Color3(0.95, 0.45, 0.2);
    heatMaterial.alpha = 0.85;
  }
  return heatMaterial;
}
