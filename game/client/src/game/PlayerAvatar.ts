import {
  AbstractMesh,
  AssetContainer,
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { AnimationGroup } from "@babylonjs/core";
import { disposeInstance, instantiateAsset } from "../assets/AssetLoader";
import { logger } from "../core/Logger";
import { getWalkableHeight } from "../terrain/terrain";

const PLAYER_ASSET_KEY = "player";
const RUN_THRESHOLD = 1.2;

let idCounter = 0;

export class PlayerAvatar {
  private readonly root: TransformNode;
  private container?: AssetContainer;
  private fallbackMesh?: AbstractMesh;
  private animations = new Map<string, AnimationGroup>();
  private preferredClips: Partial<Record<"idle" | "run" | "attack", AnimationGroup>> = {};
  private currentState: "idle" | "run" | "attack" = "idle";
  private currentGroup?: AnimationGroup;
  private attackUntil = 0;
  private isLocal: boolean;

  constructor(private readonly scene: Scene, opts: { local: boolean }) {
    this.isLocal = opts.local;
    this.root = new TransformNode(`playerAvatarRoot_${idCounter++}`, scene);
    this.root.position = Vector3.Zero();
  }

  async init(): Promise<void> {
    try {
      this.container = instantiateAsset(PLAYER_ASSET_KEY, this.root);
      for (const group of this.container.animationGroups) {
        const normalized = normalizeClipName(group.name);
        this.animations.set(normalized, group);
        group.stop();
        group.reset();
      }
      this.preferredClips.idle = this.pickClip(["idle", "idletpose", "breathing", "stand", "base"]);
      this.preferredClips.run =
        this.pickClip(["run", "running", "walk", "walkcycle", "move", "jog"]) ?? this.preferredClips.idle;
      this.preferredClips.attack =
        this.pickClip(["attack", "punch", "hit", "slash", "stab", "swing"]) ?? this.preferredClips.idle;

      this.container.meshes.forEach((mesh) => this.prepareMesh(mesh));
      this.root.scaling = new Vector3(1, 1, 1);
      this.playState("idle");
      logger.info("Модель игрока загружена");
    } catch (err) {
      logger.warn("Не удалось загрузить модель игрока, используется заглушка", err);
      this.createFallbackMesh();
    }
  }

  setLocal(isLocal: boolean): void {
    this.isLocal = isLocal;
    if (this.fallbackMesh && this.fallbackMesh.material instanceof StandardMaterial) {
      this.fallbackMesh.material.diffuseColor = isLocal ? new Color3(0.3, 0.8, 0.95) : new Color3(0.9, 0.6, 0.4);
    }
  }

  setPosition(position: Vector3): void {
    const walkableHeight = getWalkableHeight(position.x, position.z);
    if (!Number.isNaN(walkableHeight)) {
      position.y = Math.max(position.y, walkableHeight);
    }
    this.root.position.copyFrom(position);
  }

  setRotation(yaw: number): void {
    this.root.rotationQuaternion = null;
    this.root.rotation.set(0, yaw, 0);
  }

  setMovementSpeed(speed: number): void {
    if (this.currentState === "attack" && performance.now() < this.attackUntil) {
      return;
    }
    const nextState = speed > RUN_THRESHOLD ? "run" : "idle";
    if (nextState !== this.currentState) {
      this.playState(nextState);
    }
  }

  triggerAttack(): void {
    if (this.animations.has("attack")) {
      this.playState("attack", false);
      this.attackUntil = performance.now() + 600;
    } else {
      this.attackUntil = performance.now() + 400;
      this.playState("idle");
    }
  }

  update(): void {
    if (this.currentState === "attack" && performance.now() > this.attackUntil) {
      this.playState("idle");
    }
  }

  dispose(): void {
    if (this.container) {
      disposeInstance(this.container);
      this.container = undefined;
    }
    if (this.fallbackMesh) {
      this.fallbackMesh.dispose();
      this.fallbackMesh = undefined;
    }
    this.root.dispose(false, true);
  }

  private prepareMesh(mesh: AbstractMesh): void {
    mesh.checkCollisions = false;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.alwaysSelectAsActiveMesh = false;
  }

  private playState(state: "idle" | "run" | "attack", loop: boolean = true): void {
    this.currentState = state;
    const group = this.resolveClip(state);
    if (this.currentGroup && this.currentGroup !== group) {
      this.currentGroup.stop();
    }
    if (group) {
      group.reset();
      group.start(loop);
      this.currentGroup = group;
    } else if (this.fallbackMesh && this.fallbackMesh.material instanceof StandardMaterial) {
      const color = state === "run" ? new Color3(0.5, 0.9, 0.5) : this.isLocal ? new Color3(0.3, 0.8, 0.95) : new Color3(0.9, 0.6, 0.4);
      this.fallbackMesh.material.diffuseColor = color;
    }
  }

  private createFallbackMesh(): void {
    const material = new StandardMaterial(`playerFallbackMat_${idCounter}`, this.scene);
    material.diffuseColor = this.isLocal ? new Color3(0.3, 0.8, 0.95) : new Color3(0.9, 0.6, 0.4);
    material.specularColor = new Color3(0.1, 0.1, 0.1);

    this.fallbackMesh = MeshBuilder.CreateCapsule(
      `playerFallback_${idCounter}`,
      { radius: 0.35, height: 1.8 },
      this.scene,
    );
    this.fallbackMesh.material = material;
    this.fallbackMesh.parent = this.root;
  }

  private resolveClip(state: "idle" | "run" | "attack"): AnimationGroup | undefined {
    if (this.preferredClips[state]) {
      return this.preferredClips[state];
    }
    const candidates =
      state === "idle"
        ? ["idle", "stand", "base"]
        : state === "run"
          ? ["run", "running", "walk", "move"]
          : ["attack", "hit", "punch", "stab"];
    const clip = this.pickClip(candidates);
    if (clip) {
      this.preferredClips[state] = clip;
    }
    return clip;
  }

  private pickClip(names: string[]): AnimationGroup | undefined {
    for (const name of names) {
      const normalized = normalizeClipName(name);
      const exact = this.animations.get(normalized);
      if (exact) {
        return exact;
      }
      for (const [storedName, group] of this.animations) {
        if (storedName.includes(normalized)) {
          return group;
        }
      }
    }
    return undefined;
  }
}

function normalizeClipName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
