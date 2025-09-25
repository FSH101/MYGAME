import { FreeCamera, Scene, Vector3 } from "@babylonjs/core";

export interface CameraUpdateState {
  targetPosition: Vector3;
  heading: number;
  moveMagnitude: number;
  lookActive: boolean;
  lastLookInputAt: number;
  dt: number;
}

const ALIGN_THRESHOLD = 0.2;
const LOOK_IDLE_MS = 200;

export class ThirdPersonCamera {
  private camera: FreeCamera;
  private yaw = 0;
  private pitch = -0.35;
  private readonly minPitch = (-80 * Math.PI) / 180;
  private readonly maxPitch = (10 * Math.PI) / 180;
  private readonly followDistance = 9.5;
  private readonly targetHeight = 2.1;
  private readonly alignSpeed = 5.2;

  constructor(scene: Scene) {
    this.camera = new FreeCamera("third-person-camera", new Vector3(0, 6, -8), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.2;
    this.camera.maxZ = 2000;
    this.camera.checkCollisions = true;
    this.camera.applyGravity = false;
    this.camera.ellipsoid = new Vector3(0.7, 1.4, 0.7);
    this.camera.ellipsoidOffset = new Vector3(0, 1.2, 0);
    scene.activeCamera = this.camera;
  }

  getCamera(): FreeCamera {
    return this.camera;
  }

  addYaw(delta: number): void {
    this.setYaw(this.yaw + delta);
  }

  addPitch(delta: number): void {
    this.pitch = clamp(this.pitch + delta, this.minPitch, this.maxPitch);
  }

  setYaw(angle: number): void {
    this.yaw = wrapAngle(angle);
  }

  setPitch(angle: number): void {
    this.pitch = clamp(angle, this.minPitch, this.maxPitch);
  }

  getYaw(): number {
    return this.yaw;
  }

  update(state: CameraUpdateState): void {
    const now = performance.now();
    const sinceLook = now - state.lastLookInputAt;
    if (
      state.moveMagnitude > ALIGN_THRESHOLD &&
      !state.lookActive &&
      sinceLook > LOOK_IDLE_MS
    ) {
      const step = clamp(state.dt * this.alignSpeed, 0, 1);
      this.yaw = lerpAngle(this.yaw, state.heading, step);
    }

    const horizontal = this.followDistance * Math.cos(this.pitch);
    const vertical = this.followDistance * Math.sin(this.pitch);
    const offsetX = Math.sin(this.yaw) * horizontal;
    const offsetZ = Math.cos(this.yaw) * horizontal;

    const cameraPosition = new Vector3(
      state.targetPosition.x - offsetX,
      state.targetPosition.y + this.targetHeight + vertical,
      state.targetPosition.z - offsetZ,
    );

    this.camera.position.copyFrom(cameraPosition);
    const target = new Vector3(
      state.targetPosition.x,
      state.targetPosition.y + this.targetHeight * 0.4,
      state.targetPosition.z,
    );
    this.camera.setTarget(target);
  }
}

function wrapAngle(angle: number): number {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerpAngle(from: number, to: number, t: number): number {
  const delta = shortestAngleDiff(from, to);
  return wrapAngle(from + delta * t);
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = wrapAngle(to - from);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
