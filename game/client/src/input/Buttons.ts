const LONG_PRESS_MS = 350;

export interface ButtonConfig {
  id: string;
  label: string;
  anchor: Partial<Record<"top" | "bottom" | "left" | "right", number>>;
  onTap?: () => void;
  onDown?: () => void;
  onUp?: () => void;
  onHold?: (active: boolean) => void;
  onLongPress?: () => void;
  toggle?: boolean;
}

export class TouchButton {
  readonly element: HTMLButtonElement;
  private holding = false;
  private toggleState = false;
  private longPressTimer: number | null = null;

  constructor(private config: ButtonConfig, container: HTMLElement) {
    const btn = document.createElement("button");
    btn.className = "touch-button";
    btn.textContent = config.label;
    btn.style.position = "absolute";
    btn.style.touchAction = "none";
    btn.style.userSelect = "none";
    btn.dataset.buttonId = config.id;
    this.element = btn;
    this.applyAnchor(config.anchor);
    container.appendChild(btn);

    btn.addEventListener("pointerdown", (event) => this.handlePointerDown(event), { passive: false });
    btn.addEventListener("pointerup", (event) => this.handlePointerUp(event), { passive: false });
    btn.addEventListener("pointercancel", (event) => this.handlePointerUp(event), { passive: false });
    btn.addEventListener("pointerleave", (event) => this.handlePointerLeave(event), { passive: false });
  }

  setAnchor(anchor: ButtonConfig["anchor"]): void {
    this.applyAnchor(anchor);
  }

  private handlePointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.element.setPointerCapture(event.pointerId);
    this.holding = true;
    this.element.classList.add("active");
    this.config.onDown?.();
    this.config.onHold?.(true);
    if (this.config.toggle) {
      this.toggleState = !this.toggleState;
      this.element.classList.toggle("toggled", this.toggleState);
    }
    if (this.config.onLongPress) {
      this.longPressTimer = window.setTimeout(() => {
        if (this.holding) {
          this.config.onLongPress?.();
        }
      }, LONG_PRESS_MS);
    }
  }

  private handlePointerUp(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.clearTimers();
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    const wasHolding = this.holding;
    this.holding = false;
    this.element.classList.remove("active");
    this.config.onHold?.(false);
    this.config.onUp?.();
    if (wasHolding && !this.config.toggle) {
      this.config.onTap?.();
    }
  }

  private handlePointerLeave(event: PointerEvent): void {
    if (!this.holding) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.holding = false;
    this.element.classList.remove("active");
    this.clearTimers();
    this.config.onHold?.(false);
    this.config.onUp?.();
  }

  private clearTimers(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private applyAnchor(anchor: ButtonConfig["anchor"]): void {
    for (const prop of ["top", "bottom", "left", "right"] as const) {
      const value = anchor[prop];
      if (value !== undefined) {
        this.element.style[prop] = `${value}%`;
      } else {
        this.element.style[prop] = "";
      }
    }
  }
}
