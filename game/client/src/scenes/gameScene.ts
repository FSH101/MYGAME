import { Scene, Vector3, Color4, HemisphericLight, MeshBuilder } from "@babylonjs/core";
import { World } from "../ecs/world";
import { updateRender } from "../systems/renderSystem";
import { syncFromNetwork } from "../systems/networkSystem";
import { ensureHUD, updateUI } from "../systems/uiSystem";
import { connect } from "../net/connection";
import { setSnapshot } from "../net/state";
import type { ServerMessage } from "../shared/types";
import { updateDayNight } from "../systems/dayNightSystem";
import { trackFrame } from "../systems/metricsSystem";
import { createTouchInput } from "../input";
import type { IActions, ICharacterController, INetInputSink } from "../input/types";
import { createSettingsStore } from "../input/settings";
import { sendInput } from "../net/sendInput";
import { setInventoryVisible } from "../ui/hud";
import type { RendererHandle } from "../render/initRenderer";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { createTerrain, getTerrainHeight } from "../terrain/terrain";

type TouchHandle = ReturnType<typeof createTouchInput> | null;

export class GameScene {
  private renderer: RendererHandle;
  private scene: Scene;
  private light: HemisphericLight;
  private world = new World();

  private cameraRig: ThirdPersonCamera;
  private controller: LocalCharacterController;
  private lastFrame = performance.now();
  private hasInitialCamera = false;
  private inputHandle: TouchHandle = null;
  private networkReady = false;
  constructor(private container: HTMLElement, renderer: RendererHandle) {
    this.renderer = renderer;
    this.scene = new Scene(this.renderer.engine);
    this.scene.clearColor = new Color4(0.05, 0.08, 0.12, 1);
    this.scene.collisionsEnabled = true;

    this.cameraRig = new ThirdPersonCamera(this.scene);
    this.controller = new LocalCharacterController(this.cameraRig);

    this.light = new HemisphericLight("sun", new Vector3(0.3, 1, 0.3), this.scene);
    this.light.intensity = 1.1;

    createTerrain(this.scene);
    this.spawnLandmarks();
  }

  initializeUI(): void {
    ensureHUD(this.container);
  }

  initializeInput(): void {
    if (this.inputHandle) return;
    this.inputHandle = this.setupTouchInput();
  }

  initializeNetwork(): void {
    if (this.networkReady) return;
    this.setupNetwork();
    this.networkReady = true;
  }

  start(): void {
    this.lastFrame = performance.now();
    this.renderer.start(() => this.renderFrame());
  }

  getScene(): Scene {
    return this.scene;
  }

  handleContextRestored(): void {
    this.scene.markAllMaterialsAsDirty(1);
  }

  private spawnLandmarks(): void {
    for (let i = 0; i < 12; i++) {
      const rock = MeshBuilder.CreateCylinder(`rock_${i}`, { diameter: 6 + Math.random() * 3, height: 4 }, this.scene);
      const x = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 400;
      const groundHeight = getTerrainHeight(x, z);
      rock.position = new Vector3(x, groundHeight + 2, z);
      rock.checkCollisions = true;
    }
    for (let i = 0; i < 3; i++) {
      const tower = MeshBuilder.CreateBox(`tower_${i}`, { width: 6, height: 24, depth: 6 }, this.scene);
      const x = (Math.random() - 0.5) * 300;
      const z = (Math.random() - 0.5) * 300;
      const groundHeight = getTerrainHeight(x, z);
      tower.position = new Vector3(x, groundHeight + 12, z);
      tower.checkCollisions = true;
    }
  }

  private setupNetwork(): void {
    const socket = connect();
    socket.on("message", (message: ServerMessage) => {
      if (message.op === "state") {
        setSnapshot(message);
      }
    });
  }

  private setupTouchInput(): TouchHandle {
    const actions: IActions = {
      attack: () => {},
      interact: () => {},
      openInventory: (open) => setInventoryVisible(open),
    };
    const sink: INetInputSink = {
      sendInput: (frame) => sendInput(frame),
    };
    const settingsStore = createSettingsStore();
    return createTouchInput(
      this.container,
      this.renderer.engine,
      this.controller,
      actions,
      sink,
      settingsStore,
    );
  }

  private renderFrame(): void {
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    this.update(dt);
    this.scene.render();
  }

  private update(dt: number): void {
    syncFromNetwork(this.world);
    updateRender(this.scene, this.world);
    updateUI(this.world);
    updateDayNight(this.scene, this.light);
    this.updateCamera(dt);
    trackFrame();
  }

  private updateCamera(dt: number): void {
    const players = this.world.query("player", "transform");
    for (const entity of players) {
      const player = this.world.get(entity, "player");
      if (!player?.local) continue;
      const transform = this.world.get(entity, "transform");
      if (!transform) continue;
      const targetPos = new Vector3(transform.position[0], transform.position[1], transform.position[2]);
      const groundHeight = getTerrainHeight(targetPos.x, targetPos.z);
      if (!Number.isNaN(groundHeight) && (!Number.isFinite(targetPos.y) || targetPos.y < groundHeight)) {
        targetPos.y = groundHeight;
      }
      if (!this.hasInitialCamera) {
        this.cameraRig.setYaw(transform.rotation[1]);
        this.hasInitialCamera = true;
      }
      this.cameraRig.update({
        targetPosition: targetPos,
        heading: transform.rotation[1],
        moveMagnitude: this.controller.getMoveMagnitude(),
        lookActive: this.controller.isLookActive(),
        lastLookInputAt: this.controller.getLastLookInputAt(),
        dt,
      });
      break;
    }
  }

  dispose(): void {
    this.renderer.stop();
    this.inputHandle?.destroy();
  }
}

class LocalCharacterController implements ICharacterController {
  private move = { x: 0, z: 0 };
  private lookActive = false;
  private lastLookInputAt = performance.now();

  constructor(private readonly camera: ThirdPersonCamera) {}

  setMoveVector(localXZ: { x: number; z: number }): void {
    this.move = localXZ;
  }

  setSprint(active: boolean): void {
    void active;
  }

  jump(): void {
    // placeholder for local feedback (animation hook)
  }

  crouchToggle(): void {
    // placeholder for local feedback
  }

  proneToggle(): void {
    // placeholder for local feedback
  }

  addYaw(deltaRadians: number): void {
    if (deltaRadians !== 0) {
      this.camera.addYaw(deltaRadians);
      this.lastLookInputAt = performance.now();
    }
  }

  addPitch(deltaRadians: number): void {
    if (deltaRadians !== 0) {
      this.camera.addPitch(deltaRadians);
      this.lastLookInputAt = performance.now();
    }
  }

  setLookActive(active: boolean): void {
    this.lookActive = active;
    if (!active) {
      this.lastLookInputAt = performance.now();
    }
  }

  getMoveMagnitude(): number {
    return Math.hypot(this.move.x, this.move.z);
  }

  isLookActive(): boolean {
    return this.lookActive;
  }

  getLastLookInputAt(): number {
    return this.lastLookInputAt;
  }
}
