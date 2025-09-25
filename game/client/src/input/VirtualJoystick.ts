import type { InputSettings } from "./types";

const AUTO_RUN_TAP_WINDOW = 280;
const FORWARD_SECTOR_RAD = Math.PI / 4;

export interface JoystickUpdate {
  vector: { x: number; z: number };
  magnitude: number;
  sprint: boolean;
  autoRunToggled: boolean;
}

export class VirtualJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private active = false;
  private centerX = 0;
  private centerY = 0;
  private radius = 80;
  private deadzone = 12;
  private sprintThreshold = 0.75;
  private lastTapTime = 0;
  private lastTapVector: { x: number; z: number } = { x: 0, z: 0 };
  private pointerId: number | null = null;
  private autoRun = false;

  constructor(container: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "touch-joystick-base";
    this.knob = document.createElement("div");
    this.knob.className = "touch-joystick-knob";
    this.base.appendChild(this.knob);
    container.appendChild(this.base);
    this.hide();
  }

  configure(settings: InputSettings): void {
    this.deadzone = settings.MoveDeadzonePx;
    this.sprintThreshold = settings.MoveSprintThreshold;
  }

  getPointer(): number | null {
    return this.pointerId;
  }

  setAutoRun(enabled: boolean): void {
    this.autoRun = enabled;
  }

  isAutoRunning(): boolean {
    return this.autoRun;
  }

  activate(pointerId: number, x: number, y: number, radius: number): void {
    this.pointerId = pointerId;
    this.active = true;
    this.radius = radius;
    this.centerX = x;
    this.centerY = y;
    this.base.style.display = "block";
    this.base.style.left = `${x - radius}px`;
    this.base.style.top = `${y - radius}px`;
    this.base.style.width = `${radius * 2}px`;
    this.base.style.height = `${radius * 2}px`;
    this.knob.style.transform = `translate(${radius - 32}px, ${radius - 32}px)`;
  }

  update(pointerId: number, x: number, y: number, settings: InputSettings): JoystickUpdate {
    if (!this.active || this.pointerId !== pointerId) {
      return { vector: { x: 0, z: 0 }, magnitude: 0, sprint: false, autoRunToggled: false };
    }
    this.configure(settings);
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, this.radius);
    const angle = Math.atan2(dy, dx);

    const normalized = clamped <= this.deadzone
      ? { x: 0, z: 0 }
      : {
          x: Math.cos(angle) * (clamped / this.radius),
          z: -Math.sin(angle) * (clamped / this.radius),
        };

    const magnitude = clamped <= this.deadzone ? 0 : clamp01((clamped - this.deadzone) / (this.radius - this.deadzone));
    const sprint = magnitude >= this.sprintThreshold;
    const knobRadius = this.radius - 32;
    const ratio = this.radius === 0 ? 0 : clamped / this.radius;
    const offsetX = Math.cos(angle) * knobRadius * ratio;
    const offsetY = Math.sin(angle) * knobRadius * ratio;
    this.knob.style.transform = `translate(${knobRadius + offsetX}px, ${knobRadius + offsetY}px)`;

    let autoRunToggled = false;
    if (magnitude > 0.95) {
      const now = performance.now();
      const timeDelta = now - this.lastTapTime;
      const forwardAngle = Math.atan2(-normalized.z, normalized.x);
      const forward = Math.abs(forwardAngle) < FORWARD_SECTOR_RAD;
      if (timeDelta < AUTO_RUN_TAP_WINDOW && forward) {
        this.autoRun = !this.autoRun;
        autoRunToggled = true;
      }
      this.lastTapTime = now;
      this.lastTapVector = { ...normalized };
    }

    return { vector: normalized, magnitude, sprint, autoRunToggled };
  }

  deactivate(pointerId: number): void {
    if (this.pointerId !== pointerId) return;
    this.hide();
  }

  hide(): void {
    this.active = false;
    this.pointerId = null;
    this.base.style.display = "none";
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
