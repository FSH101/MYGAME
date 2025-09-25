import { isIOS, isStandaloneIOS } from "../shared/platform";

export type PointerRole = "move" | "look" | "button";

interface PointerLikeEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault(): void;
}

type DownHandler = (event: PointerLikeEvent, manager: TouchManager) => void;
type MoveHandler = (event: PointerLikeEvent, role: PointerRole | null, manager: TouchManager) => void;
type UpHandler = (event: PointerLikeEvent, role: PointerRole | null, manager: TouchManager) => void;

export class TouchManager {
  private active = new Map<number, PointerRole>();
  private downHandlers = new Set<DownHandler>();
  private moveHandlers = new Set<MoveHandler>();
  private upHandlers = new Set<UpHandler>();

  private readonly blurHandler: () => void;
  private readonly usePointerEvents: boolean;

  constructor(private root: HTMLElement) {
    this.usePointerEvents = shouldUsePointerEvents();

    if (this.usePointerEvents) {
      root.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
      root.addEventListener("pointermove", this.handlePointerMove, { passive: false });
      root.addEventListener("pointerup", this.handlePointerUp, { passive: false });
      root.addEventListener("pointercancel", this.handlePointerUp, { passive: false });
    } else {
      root.addEventListener("touchstart", this.handleTouchStart, { passive: false });
      root.addEventListener("touchmove", this.handleTouchMove, { passive: false });
      root.addEventListener("touchend", this.handleTouchEnd, { passive: false });
      root.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });
    }

    this.blurHandler = () => this.reset();
    window.addEventListener("blur", this.blurHandler);
  }

  destroy(): void {
    if (this.usePointerEvents) {
      this.root.removeEventListener("pointerdown", this.handlePointerDown);
      this.root.removeEventListener("pointermove", this.handlePointerMove);
      this.root.removeEventListener("pointerup", this.handlePointerUp);
      this.root.removeEventListener("pointercancel", this.handlePointerUp);
    } else {
      this.root.removeEventListener("touchstart", this.handleTouchStart);
      this.root.removeEventListener("touchmove", this.handleTouchMove);
      this.root.removeEventListener("touchend", this.handleTouchEnd);
      this.root.removeEventListener("touchcancel", this.handleTouchEnd);
    }
    window.removeEventListener("blur", this.blurHandler);
    this.reset();
  }

  onDown(handler: DownHandler): () => void {
    this.downHandlers.add(handler);
    return () => this.downHandlers.delete(handler);
  }

  onMove(handler: MoveHandler): () => void {
    this.moveHandlers.add(handler);
    return () => this.moveHandlers.delete(handler);
  }

  onUp(handler: UpHandler): () => void {
    this.upHandlers.add(handler);
    return () => this.upHandlers.delete(handler);
  }

  capture(pointerId: number, role: PointerRole): void {
    this.active.set(pointerId, role);
  }

  release(pointerId: number): void {
    this.active.delete(pointerId);
  }

  roleOf(pointerId: number): PointerRole | null {
    return this.active.get(pointerId) ?? null;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.dispatchDown(event);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const role = this.active.get(event.pointerId) ?? null;
    this.dispatchMove(event, role);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const role = this.active.get(event.pointerId) ?? null;
    this.dispatchUp(event, role);
    if (role) {
      this.active.delete(event.pointerId);
    }
  };

  private handleTouchStart = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      const pointer = this.wrapTouch(event, touch);
      this.dispatchDown(pointer);
    }
  };

  private handleTouchMove = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      const pointer = this.wrapTouch(event, touch);
      const role = this.active.get(pointer.pointerId) ?? null;
      this.dispatchMove(pointer, role);
    }
  };

  private handleTouchEnd = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      const pointer = this.wrapTouch(event, touch);
      const role = this.active.get(pointer.pointerId) ?? null;
      this.dispatchUp(pointer, role);
      if (role) {
        this.active.delete(pointer.pointerId);
      }
    }
  };

  private dispatchDown(event: PointerLikeEvent): void {
    this.downHandlers.forEach((handler) => handler(event, this));
  }

  private dispatchMove(event: PointerLikeEvent, role: PointerRole | null): void {
    this.moveHandlers.forEach((handler) => handler(event, role, this));
  }

  private dispatchUp(event: PointerLikeEvent, role: PointerRole | null): void {
    this.upHandlers.forEach((handler) => handler(event, role, this));
  }

  private reset(): void {
    this.active.clear();
  }

  private wrapTouch(event: TouchEvent, touch: Touch): PointerLikeEvent {
    return {
      pointerId: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
      preventDefault: () => event.preventDefault(),
    };
  }
}

function shouldUsePointerEvents(): boolean {
  if (typeof window === "undefined") return true;
  const hasPointer = typeof window.PointerEvent !== "undefined";
  if (!hasPointer) {
    return false;
  }
  if (isIOS()) {
    // iOS Safari in standalone/webview still has issues with pointer events.
    return !isStandaloneIOS();
  }
  return true;
}
