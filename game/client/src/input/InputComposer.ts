import type { NetInputFrame } from "../shared/types";
import type { IActions, ICharacterController, INetInputSink, InputSettings, MoveCurve } from "./types";

const SEND_RATE = 1 / 15; // 15 Hz snapshots
const MOVE_SMOOTH_RATE = 10.5;
const LOOK_SMOOTH_RATE = 12.5;
const MAX_FRAME_DT = 1 / 24; // clamp to ~41ms to stay in sync with refresh cycles

export class InputComposer {
  private moveTarget = { x: 0, z: 0 };
  private moveCurrent = { x: 0, z: 0 };
  private sprintTarget = false;
  private sprintCurrent = false;
  private autoRun = false;
  private autoRunVector = { x: 0, z: 1 };

  private yawPending = 0;
  private pitchPending = 0;
  private yawFrame = 0;
  private pitchFrame = 0;

  private attackHeld = false;
  private jumpQueued = false;
  private crouchQueued = false;
  private proneQueued = false;
  private interactQueued = false;
  private inventoryQueued = false;

  private accumulator = 0;

  constructor(
    private readonly controller: ICharacterController,
    private readonly actions: IActions,
    private readonly sink: INetInputSink,
    private settings: InputSettings,
  ) {}

  setSettings(settings: InputSettings): void {
    this.settings = settings;
  }

  setMovement(vector: { x: number; z: number }, magnitude: number, sprint: boolean, fromJoystick: boolean): void {
    const curvedMagnitude = applyMoveCurve(magnitude, this.settings.MoveCurve);
    this.moveTarget = {
      x: vector.x * curvedMagnitude,
      z: vector.z * curvedMagnitude,
    };
    this.sprintTarget = sprint;
    if (fromJoystick && magnitude > 0.01) {
      this.autoRunVector = { x: vector.x, z: vector.z === 0 ? 1 : Math.sign(vector.z) };
    }
  }

  clearMovement(): void {
    this.moveTarget = { x: 0, z: 0 };
    this.sprintTarget = false;
  }

  toggleAutoRun(active: boolean): void {
    this.autoRun = active;
  }

  isAutoRunning(): boolean {
    return this.autoRun;
  }

  addLook(yaw: number, pitch: number): void {
    this.yawPending += yaw;
    this.pitchPending += pitch;
  }

  setAttack(pressed: boolean): void {
    this.attackHeld = pressed;
    this.actions.attack(pressed);
  }

  queueJump(): void {
    this.jumpQueued = true;
    this.controller.jump();
  }

  queueCrouch(): void {
    this.crouchQueued = true;
    this.controller.crouchToggle();
  }

  queueProne(): void {
    this.proneQueued = true;
    this.controller.proneToggle();
  }

  queueInteract(): void {
    this.interactQueued = true;
    this.actions.interact();
  }

  toggleInventory(open: boolean): void {
    this.inventoryQueued = true;
    this.actions.openInventory(open);
  }

  update(dt: number): void {
    const clampedDt = Math.min(dt, MAX_FRAME_DT);
    this.accumulator += clampedDt;

    if (this.autoRun) {
      this.moveTarget = { ...this.autoRunVector };
      this.sprintTarget = true;
    }

    const moveBlend = smoothingFactor(MOVE_SMOOTH_RATE, clampedDt);
    this.moveCurrent.x = lerp(this.moveCurrent.x, this.moveTarget.x, moveBlend);
    this.moveCurrent.z = lerp(this.moveCurrent.z, this.moveTarget.z, moveBlend);
    if (Math.abs(this.moveCurrent.x) < 0.001) this.moveCurrent.x = 0;
    if (Math.abs(this.moveCurrent.z) < 0.001) this.moveCurrent.z = 0;

    this.sprintCurrent = lerp(
      this.sprintCurrent ? 1 : 0,
      this.sprintTarget ? 1 : 0,
      moveBlend,
    ) > 0.5;

    if (this.yawPending || this.pitchPending) {
      const lookBlend = smoothingFactor(LOOK_SMOOTH_RATE, clampedDt);
      const yawStep = this.yawPending * lookBlend;
      const pitchStep = this.pitchPending * lookBlend;
      this.controller.addYaw(yawStep);
      this.controller.addPitch(pitchStep);
      this.yawFrame += yawStep;
      this.pitchFrame += pitchStep;
      this.yawPending -= yawStep;
      this.pitchPending -= pitchStep;
      if (Math.abs(this.yawPending) < 1e-4) this.yawPending = 0;
      if (Math.abs(this.pitchPending) < 1e-4) this.pitchPending = 0;
    }

    this.controller.setMoveVector(this.moveCurrent);
    this.controller.setSprint(this.sprintCurrent);

    if (this.accumulator >= SEND_RATE) {
      this.accumulator -= SEND_RATE;
      this.emitFrame();
    }
  }

  private emitFrame(): void {
    const frame: NetInputFrame = {
      t: performance.now(),
      mv: { ...this.moveCurrent },
      sp: this.sprintCurrent ? 1 : 0,
      yaw: this.yawFrame,
      pitch: this.pitchFrame,
      atk: this.attackHeld ? 1 : 0,
      jmp: this.consumeFlag("jump"),
      cr: this.consumeFlag("crouch"),
      pr: this.consumeFlag("prone"),
      inr: this.consumeFlag("interact"),
      inv: this.consumeFlag("inventory"),
    };
    this.sink.sendInput(frame);
    this.yawFrame = 0;
    this.pitchFrame = 0;
  }

  private consumeFlag(type: "jump" | "crouch" | "prone" | "interact" | "inventory"): 0 | 1 {
    switch (type) {
      case "jump":
        if (this.jumpQueued) {
          this.jumpQueued = false;
          return 1;
        }
        break;
      case "crouch":
        if (this.crouchQueued) {
          this.crouchQueued = false;
          return 1;
        }
        break;
      case "prone":
        if (this.proneQueued) {
          this.proneQueued = false;
          return 1;
        }
        break;
      case "interact":
        if (this.interactQueued) {
          this.interactQueued = false;
          return 1;
        }
        break;
      case "inventory":
        if (this.inventoryQueued) {
          this.inventoryQueued = false;
          return 1;
        }
        break;
    }
    return 0;
  }
}

function applyMoveCurve(magnitude: number, curve: MoveCurve): number {
  if (curve === "expo") {
    return Math.pow(magnitude, 0.7);
  }
  return magnitude;
}

function smoothingFactor(rate: number, dt: number): number {
  if (dt <= 0) return 0;
  return 1 - Math.exp(-rate * dt);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
