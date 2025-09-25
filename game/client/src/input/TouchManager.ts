export type PointerRole = "move" | "look" | "button";

type DownHandler = (event: PointerEvent, manager: TouchManager) => void;
type MoveHandler = (event: PointerEvent, role: PointerRole | null, manager: TouchManager) => void;
type UpHandler = (event: PointerEvent, role: PointerRole | null, manager: TouchManager) => void;

export class TouchManager {
  private active = new Map<number, PointerRole>();
  private downHandlers = new Set<DownHandler>();
  private moveHandlers = new Set<MoveHandler>();
  private upHandlers = new Set<UpHandler>();

  private readonly blurHandler: () => void;

  constructor(private root: HTMLElement) {
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    root.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
    root.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    root.addEventListener("pointerup", this.handlePointerUp, { passive: false });
    root.addEventListener("pointercancel", this.handlePointerUp, { passive: false });
    this.blurHandler = () => this.reset();
    window.addEventListener("blur", this.blurHandler);
  }

  destroy(): void {
    this.root.removeEventListener("pointerdown", this.handlePointerDown);
    this.root.removeEventListener("pointermove", this.handlePointerMove);
    this.root.removeEventListener("pointerup", this.handlePointerUp);
    this.root.removeEventListener("pointercancel", this.handlePointerUp);
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

  private handlePointerDown(event: PointerEvent): void {
    this.downHandlers.forEach((handler) => handler(event, this));
  }

  private handlePointerMove(event: PointerEvent): void {
    const role = this.active.get(event.pointerId) ?? null;
    this.moveHandlers.forEach((handler) => handler(event, role, this));
  }

  private handlePointerUp(event: PointerEvent): void {
    const role = this.active.get(event.pointerId) ?? null;
    this.upHandlers.forEach((handler) => handler(event, role, this));
    if (role) {
      this.active.delete(event.pointerId);
    }
  }

  private reset(): void {
    this.active.clear();
  }
}
