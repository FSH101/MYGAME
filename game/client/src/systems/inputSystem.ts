import type { Vec2 } from "../shared/types";
import { sendInput } from "../net/sendInput";

interface PointerState {
  active: boolean;
  identifier: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const leftPointer: PointerState = { active: false, identifier: -1, startX: 0, startY: 0, currentX: 0, currentY: 0 };
const rightPointer: PointerState = { active: false, identifier: -1, startX: 0, startY: 0, currentX: 0, currentY: 0 };

const actions = { jump: false, hit: false, interact: false, inventory: false };

export function setupInput(root: HTMLElement): void {
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

function onPointerDown(event: PointerEvent): void {
  if (event.clientX < window.innerWidth * 0.5 && !leftPointer.active) {
    assignPointer(leftPointer, event);
  } else if (!rightPointer.active) {
    assignPointer(rightPointer, event);
  }
}

function onPointerMove(event: PointerEvent): void {
  updatePointer(leftPointer, event);
  updatePointer(rightPointer, event);
}

function onPointerUp(event: PointerEvent): void {
  releasePointer(leftPointer, event);
  releasePointer(rightPointer, event);
}

function assignPointer(pointer: PointerState, event: PointerEvent): void {
  pointer.active = true;
  pointer.identifier = event.pointerId;
  pointer.startX = event.clientX;
  pointer.startY = event.clientY;
  pointer.currentX = event.clientX;
  pointer.currentY = event.clientY;
}

function updatePointer(pointer: PointerState, event: PointerEvent): void {
  if (!pointer.active || pointer.identifier !== event.pointerId) return;
  pointer.currentX = event.clientX;
  pointer.currentY = event.clientY;
}

function releasePointer(pointer: PointerState, event: PointerEvent): void {
  if (!pointer.active || pointer.identifier !== event.pointerId) return;
  pointer.active = false;
  pointer.identifier = -1;
  pointer.currentX = pointer.startX;
  pointer.currentY = pointer.startY;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code === "Space") actions.jump = true;
  if (event.code === "KeyE") actions.interact = true;
  if (event.code === "KeyF") actions.hit = true;
  if (event.code === "KeyI") actions.inventory = true;
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code === "Space") actions.jump = false;
  if (event.code === "KeyE") actions.interact = false;
  if (event.code === "KeyF") actions.hit = false;
  if (event.code === "KeyI") actions.inventory = false;
}

export function updateInput(): void {
  const move = joystickVector(leftPointer, 70);
  const look = joystickVector(rightPointer, 60);
  sendInput(move, look, { ...actions });
  // reset tap actions that should be momentary
  actions.hit = false;
  actions.interact = false;
  actions.inventory = false;
}

function joystickVector(pointer: PointerState, radius: number): Vec2 {
  if (!pointer.active) return [0, 0];
  const dx = pointer.currentX - pointer.startX;
  const dy = pointer.currentY - pointer.startY;
  const length = Math.min(Math.hypot(dx, dy), radius);
  const angle = Math.atan2(dy, dx);
  return [Math.cos(angle) * (length / radius), Math.sin(angle) * (length / radius)];
}

export function triggerAction(action: keyof typeof actions): void {
  actions[action] = true;
}
