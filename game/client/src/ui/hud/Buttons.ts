const LONG_PRESS_MS = 350;
let stylesInjected = false;

const STYLE = `
:root {
  --hud-button-size: clamp(58px, 13vw, 84px);
  --hud-button-bg: rgba(15, 20, 28, 0.8);
  --hud-button-border: rgba(244, 227, 194, 0.28);
  --hud-button-active: rgba(244, 140, 65, 0.9);
}

.hud-button {
  position: absolute;
  width: var(--hud-button-size);
  height: var(--hud-button-size);
  pointer-events: auto;
  touch-action: none;
}

.hud-button::before {
  content: "";
  position: absolute;
  inset: -12px;
}

.hud-button__control {
  width: 100%;
  height: 100%;
  border-radius: 24px;
  border: 1px solid var(--hud-button-border);
  background: var(--hud-button-bg);
  color: #f4e3c2;
  font-size: clamp(0.75rem, 2.6vw, 0.95rem);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
  touch-action: none;
  user-select: none;
}

.hud-button__control.active,
.hud-button__control:active {
  transform: scale(0.96);
  background: var(--hud-button-active);
  border-color: rgba(255, 190, 120, 0.9);
  color: #1b0f05;
  font-weight: 600;
}

.hud-button__control.toggled {
  background: linear-gradient(120deg, rgba(244, 140, 65, 0.95), rgba(244, 200, 120, 0.95));
  color: #1b0f05;
  font-weight: 600;
}

@media (max-width: 480px) {
  :root {
    --hud-button-size: clamp(56px, 18vw, 76px);
  }
}
`;

export interface ButtonAnchor {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface ButtonConfig {
  id: string;
  label: string;
  anchor: ButtonAnchor;
  onTap?: () => void;
  onDown?: () => void;
  onUp?: () => void;
  onHold?: (active: boolean) => void;
  onLongPress?: () => void;
  toggle?: boolean;
}

export class TouchButton {
  readonly element: HTMLButtonElement;
  private wrapper: HTMLDivElement;
  private holding = false;
  private toggleState = false;
  private longPressTimer: number | null = null;

  constructor(private readonly config: ButtonConfig, container: HTMLElement) {
    injectStyles();
    this.wrapper = document.createElement("div");
    this.wrapper.className = "hud-button";
    this.wrapper.dataset.buttonId = config.id;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "hud-button__control";
    button.textContent = config.label;

    this.wrapper.appendChild(button);
    container.appendChild(this.wrapper);

    this.element = button;
    this.setAnchor(config.anchor);

    button.addEventListener("pointerdown", (event) => this.handlePointerDown(event), { passive: false });
    button.addEventListener("pointerup", (event) => this.handlePointerUp(event), { passive: false });
    button.addEventListener("pointercancel", (event) => this.handlePointerUp(event), { passive: false });
    button.addEventListener("pointerleave", (event) => this.handlePointerLeave(event), { passive: false });
  }

  setAnchor(anchor: ButtonAnchor): void {
    applyAnchor(this.wrapper, anchor);
  }

  setToggled(state: boolean): void {
    this.toggleState = state;
    this.element.classList.toggle("toggled", state);
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
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    const wasHolding = this.holding;
    this.holding = false;
    this.element.classList.remove("active");
    this.clearTimers();
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
}

function injectStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);
  stylesInjected = true;
}

function applyAnchor(element: HTMLDivElement, anchor: ButtonAnchor): void {
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const value = anchor[side];
    if (value !== undefined) {
      element.style[side] = `${value}%`;
    } else {
      element.style[side] = "";
    }
  }
}
