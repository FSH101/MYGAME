import type { InputSettings } from "./types";

const BASE_RAD_PER_PX = (Math.PI / 180) * 0.12;
const MAX_DELTA_PX = 120;
const SLOP_PX = 2;
const SLOP_TIME_MS = 120;

export interface LookDelta {
  yaw: number;
  pitch: number;
}

export class LookController {
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private slopActive = false;
  private slopStart = 0;

  start(pointerId: number, x: number, y: number): void {
    this.pointerId = pointerId;
    this.lastX = x;
    this.lastY = y;
    this.slopActive = true;
    this.slopStart = performance.now();
  }

  move(pointerId: number, x: number, y: number, settings: InputSettings, dpiScale: number): LookDelta {
    if (this.pointerId !== pointerId) {
      return { yaw: 0, pitch: 0 };
    }
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.lastX = x;
    this.lastY = y;

    if (this.slopActive) {
      const slopTime = performance.now() - this.slopStart;
      if (Math.abs(dx) <= SLOP_PX && Math.abs(dy) <= SLOP_PX && slopTime < SLOP_TIME_MS) {
        return { yaw: 0, pitch: 0 };
      }
      this.slopActive = false;
    }

    const sensitivity = settings.LookSensitivity;
    const gamma = settings.LookGamma;

    const yaw = applyCurve(dx * dpiScale, gamma) * sensitivity * BASE_RAD_PER_PX;
    const pitchBase = applyCurve(dy * dpiScale, gamma) * sensitivity * BASE_RAD_PER_PX;
    const pitch = settings.InvertY ? pitchBase : -pitchBase;
    return { yaw, pitch };
  }

  stop(pointerId: number): void {
    if (this.pointerId === pointerId) {
      this.pointerId = null;
    }
  }
}

function applyCurve(deltaPx: number, gamma: number): number {
  const sign = Math.sign(deltaPx);
  const magnitude = Math.min(MAX_DELTA_PX, Math.abs(deltaPx));
  const normalized = magnitude / MAX_DELTA_PX;
  const curved = Math.pow(normalized, gamma) * MAX_DELTA_PX;
  return curved * sign;
}
