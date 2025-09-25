import { Engine, Scene, Vector3, Color4, HemisphericLight, FreeCamera, MeshBuilder } from "@babylonjs/core";
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

export class GameScene {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private light: HemisphericLight;
  private world = new World();

  private canvas: HTMLCanvasElement;
  private inputHandle: ReturnType<typeof createTouchInput> | null = null;

  constructor(private container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("id", "render-canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";
    this.container.appendChild(this.canvas);

    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: false,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.08, 0.12, 1);

    this.camera = new FreeCamera("camera", new Vector3(0, 8, -12), this.scene);
    this.camera.attachControl(this.canvas, true);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 2000;
    this.camera.speed = 0;

    this.light = new HemisphericLight("sun", new Vector3(0.3, 1, 0.3), this.scene);
    this.light.intensity = 1.1;

    this.generateTerrain();
    this.spawnLandmarks();

    ensureHUD(container);
    this.setupTouchInput();

    this.setupNetwork();

    this.engine.runRenderLoop(() => {
      this.update();
      this.scene.render();
    });

    window.addEventListener("resize", () => this.engine.resize());
  }

  private generateTerrain(): void {
    const size = 500;
    const subdivisions = 80;
    const ground = MeshBuilder.CreateGround("ground", { width: size, height: size, subdivisions }, this.scene);
    const data = ground.getVerticesData("position")!;
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i];
      const z = data[i + 2];
      const height = simplex(x * 0.03, z * 0.03) * 4 + simplex(x * 0.1, z * 0.1) * 1.2;
      data[i + 1] = height;
    }
    ground.updateVerticesData("position", data);
    ground.convertToFlatShadedMesh();
    ground.checkCollisions = false;
  }

  private spawnLandmarks(): void {
    for (let i = 0; i < 12; i++) {
      const rock = MeshBuilder.CreateCylinder(`rock_${i}`, { diameter: 6 + Math.random() * 3, height: 4 }, this.scene);
      rock.position = new Vector3((Math.random() - 0.5) * 400, 2, (Math.random() - 0.5) * 400);
    }
    for (let i = 0; i < 3; i++) {
      const tower = MeshBuilder.CreateBox(`tower_${i}`, { width: 6, height: 24, depth: 6 }, this.scene);
      tower.position = new Vector3((Math.random() - 0.5) * 300, 12, (Math.random() - 0.5) * 300);
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

  private update(): void {
    syncFromNetwork(this.world);
    updateRender(this.scene, this.world);
    updateUI(this.world);
    updateDayNight(this.scene, this.light);
    this.followLocalPlayer();
    trackFrame();
  }

  private followLocalPlayer(): void {
    const players = this.world.query("player", "transform");
    for (const entity of players) {
      const player = this.world.get(entity, "player");
      if (player?.local) {
        const transform = this.world.get(entity, "transform");
        if (!transform) continue;
        const target = new Vector3(transform.position[0], transform.position[1] + 6, transform.position[2] + 12);
        this.camera.position = Vector3.Lerp(this.camera.position, target, 0.1);
        this.camera.setTarget(new Vector3(transform.position[0], transform.position[1] + 2, transform.position[2]));
        break;
      }
    }
  }

  private setupTouchInput(): void {
    const controller = new LocalCharacterController();
    const actions: IActions = {
      attack: () => {},
      interact: () => {},
      openInventory: (open) => setInventoryVisible(open),
    };
    const sink: INetInputSink = {
      sendInput: (frame) => sendInput(frame),
    };
    const settingsStore = createSettingsStore();
    this.inputHandle = createTouchInput(this.container, controller, actions, sink, settingsStore);
  }
}

function simplex(x: number, y: number): number {
  return (Math.sin(x * 1.3 + Math.cos(y * 1.7)) + Math.sin(y * 1.9)) * 0.5;
}

class LocalCharacterController implements ICharacterController {
  private move = { x: 0, z: 0 };
  private sprint = false;
  private yaw = 0;
  private pitch = 0;

  setMoveVector(localXZ: { x: number; z: number }): void {
    this.move = localXZ;
  }

  setSprint(active: boolean): void {
    this.sprint = active;
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
    this.yaw += deltaRadians;
  }

  addPitch(deltaRadians: number): void {
    this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch + deltaRadians));
  }
}
