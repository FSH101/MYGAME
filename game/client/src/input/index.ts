import { TouchManager } from "./TouchManager";
import { VirtualJoystick } from "./VirtualJoystick";
import { LookController } from "./LookController";
import { TouchButton } from "./Buttons";
import { InputComposer } from "./InputComposer";
import type {
  IActions,
  ICharacterController,
  INetInputSink,
  InputSettings,
  InputSettingsStore,
} from "./types";

interface TouchInputHandle {
  destroy(): void;
}

export function createTouchInput(
  container: HTMLElement,
  controller: ICharacterController,
  actions: IActions,
  sink: INetInputSink,
  settingsStore: InputSettingsStore,
): TouchInputHandle {
  const overlay = document.createElement("div");
  overlay.className = "touch-layer";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "auto";
  overlay.style.touchAction = "none";
  container.appendChild(overlay);

  injectStyles();

  const manager = new TouchManager(overlay);
  const joystick = new VirtualJoystick(overlay);
  const look = new LookController();

  let settings = settingsStore.get();
  joystick.configure(settings);

  let inventoryOpen = false;
  let buttons: Map<string, TouchButton> = new Map();

  const proxiedActions: IActions = {
    attack: (pressed) => actions.attack(pressed),
    interact: () => actions.interact(),
    openInventory: (open) => {
      inventoryOpen = open;
      actions.openInventory(open);
      const button = buttons.get("inventory");
      if (button) {
        button.element.classList.toggle("toggled", open);
      }
    },
  };

  const composer = new InputComposer(controller, proxiedActions, sink, settings);

  const dpiScale = () => window.devicePixelRatio || 1;

  buttons = createButtons(overlay, composer, () => {
    const next = !inventoryOpen;
    proxiedActions.openInventory(next);
    composer.toggleInventory(next);
    vibrate(8);
  });

  let movePointer: number | null = null;
  let lookPointer: number | null = null;
  const keyboardKeys = new Set<string>();
  let keyboardSprint = false;

  function updateLayout(): void {
    const layout = computeLayout(settings);
    for (const [id, button] of buttons.entries()) {
      button.setAnchor(layout[id] ?? {});
    }
  }

  updateLayout();

  const unsubscribe = settingsStore.subscribe((next) => {
    settings = next;
    joystick.configure(next);
    composer.setSettings(next);
    updateLayout();
  });

  const releaseMove = (pointerId: number) => {
    if (movePointer !== pointerId) return;
    joystick.deactivate(pointerId);
    movePointer = null;
    composer.clearMovement();
    joystick.setAutoRun(composer.isAutoRunning());
  };

  const applyKeyboardMovement = () => {
    if (movePointer !== null) return;
    const x = (keyboardKeys.has("KeyD") ? 1 : 0) - (keyboardKeys.has("KeyA") ? 1 : 0);
    const z = (keyboardKeys.has("KeyW") ? 1 : 0) - (keyboardKeys.has("KeyS") ? 1 : 0);
    if (x === 0 && z === 0) {
      composer.clearMovement();
      return;
    }
    const len = Math.hypot(x, z) || 1;
    composer.setMovement({ x: x / len, z: z / len }, 1, keyboardSprint, false);
  };

  manager.onDown((event, mgr) => {
    const half = window.innerWidth / 2;
    const isLeftRegion = settings.LeftHanded ? event.clientX > half : event.clientX < half;
    if (isLeftRegion && movePointer === null) {
      const radius = computeJoystickRadius();
      joystick.setAutoRun(false);
      joystick.activate(event.pointerId, event.clientX, event.clientY, radius);
      movePointer = event.pointerId;
      mgr.capture(event.pointerId, "move");
      composer.toggleAutoRun(false);
      event.preventDefault();
      return;
    }
    if (!isLeftRegion && lookPointer === null) {
      look.start(event.pointerId, event.clientX, event.clientY);
      lookPointer = event.pointerId;
      mgr.capture(event.pointerId, "look");
      event.preventDefault();
    }
  });

  manager.onMove((event, role) => {
    if (role === "move" && movePointer === event.pointerId) {
      const update = joystick.update(event.pointerId, event.clientX, event.clientY, settings);
      composer.setMovement(update.vector, update.magnitude, update.sprint, true);
      if (update.autoRunToggled) {
        composer.toggleAutoRun(joystick.isAutoRunning());
        vibrate(12);
      }
      event.preventDefault();
    } else if (role === "look" && lookPointer === event.pointerId) {
      const delta = look.move(event.pointerId, event.clientX, event.clientY, settings, dpiScale());
      composer.addLook(delta.yaw, delta.pitch);
      event.preventDefault();
    }
  });

  manager.onUp((event, role) => {
    if (role === "move") {
      releaseMove(event.pointerId);
    } else if (role === "look" && lookPointer === event.pointerId) {
      look.stop(event.pointerId);
      lookPointer = null;
    }
  });

  const resizeHandler = () => updateLayout();
  window.addEventListener("resize", resizeHandler);
  window.addEventListener("orientationchange", resizeHandler);

  const keyDownHandler = (event: KeyboardEvent) => {
    if (event.repeat) return;
    switch (event.code) {
      case "KeyW":
      case "KeyA":
      case "KeyS":
      case "KeyD":
        keyboardKeys.add(event.code);
        applyKeyboardMovement();
        event.preventDefault();
        break;
      case "ShiftLeft":
      case "ShiftRight":
        keyboardSprint = true;
        applyKeyboardMovement();
        break;
      case "Space":
        composer.queueJump();
        event.preventDefault();
        break;
      case "KeyF":
        composer.setAttack(true);
        event.preventDefault();
        break;
      case "KeyE":
        composer.queueInteract();
        event.preventDefault();
        break;
      case "KeyI": {
        const next = !inventoryOpen;
        proxiedActions.openInventory(next);
        composer.toggleInventory(next);
        break;
      }
    }
  };

  const keyUpHandler = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
      case "KeyA":
      case "KeyS":
      case "KeyD":
        keyboardKeys.delete(event.code);
        applyKeyboardMovement();
        break;
      case "ShiftLeft":
      case "ShiftRight":
        keyboardSprint = false;
        applyKeyboardMovement();
        break;
      case "KeyF":
        composer.setAttack(false);
        break;
    }
  };

  window.addEventListener("keydown", keyDownHandler);
  window.addEventListener("keyup", keyUpHandler);

  let lastTime = performance.now();
  let rafId = 0;
  const loop = (time: number) => {
    const dt = (time - lastTime) / 1000;
    lastTime = time;
    composer.update(dt);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  const attackButton = buttons.get("attack");
  attackButton?.element.addEventListener("click", (event) => event.preventDefault());

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("orientationchange", resizeHandler);
      window.removeEventListener("keydown", keyDownHandler);
      window.removeEventListener("keyup", keyUpHandler);
      unsubscribe();
      manager.destroy();
      overlay.remove();
    },
  };
}

function computeJoystickRadius(): number {
  const edge = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(80, Math.min(140, edge * 0.22));
}

function vibrate(duration: number): void {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

function createButtons(
  overlay: HTMLElement,
  composer: InputComposer,
  onInventoryToggle: () => void,
): Map<string, TouchButton> {
  const buttons = new Map<string, TouchButton>();
  const configs = [
    {
      id: "attack",
      label: "Удар",
      anchor: { bottom: 6, right: 5 },
      onHold: (active: boolean) => composer.setAttack(active),
    },
    {
      id: "jump",
      label: "Прыжок",
      anchor: { bottom: 22, right: 9 },
      onTap: () => {
        composer.queueJump();
        vibrate(10);
      },
    },
    {
      id: "crouch",
      label: "Присесть",
      anchor: { bottom: 24, right: 24 },
      onTap: () => composer.queueCrouch(),
      onLongPress: () => composer.queueProne(),
    },
    {
      id: "interact",
      label: "Взаим.",
      anchor: { right: 6, top: 45 },
      onTap: () => {
        composer.queueInteract();
        vibrate(6);
      },
    },
    {
      id: "inventory",
      label: "Инв.",
      anchor: { top: 14, left: 8 },
      toggle: true,
      onDown: onInventoryToggle,
    },
  ] as const;

  for (const config of configs) {
    const button = new TouchButton(config, overlay);
    buttons.set(config.id, button);
  }
  return buttons;
}

function computeLayout(settings: InputSettings): Record<string, { top?: number; bottom?: number; left?: number; right?: number }> {
  const isLandscape = window.innerWidth > window.innerHeight;
  const base = {
    attack: isLandscape ? { bottom: 8, right: 6 } : { bottom: 6, right: 4 },
    jump: isLandscape ? { bottom: 28, right: 10 } : { bottom: 22, right: 9 },
    crouch: isLandscape ? { bottom: 34, right: 24 } : { bottom: 24, right: 24 },
    interact: isLandscape ? { right: 10, top: 40 } : { right: 6, top: 45 },
    inventory: isLandscape ? { top: 8, left: 8 } : { top: 14, left: 8 },
  } as const;

  if (settings.LeftHanded) {
    return {
      attack: mirrorAnchor(base.attack),
      jump: mirrorAnchor(base.jump),
      crouch: mirrorAnchor(base.crouch),
      interact: mirrorAnchor(base.interact),
      inventory: mirrorAnchor(base.inventory, true),
    };
  }

  return base;
}

function mirrorAnchor(
  anchor: { top?: number; bottom?: number; left?: number; right?: number },
  vertical = false,
): { top?: number; bottom?: number; left?: number; right?: number } {
  const mirrored: { top?: number; bottom?: number; left?: number; right?: number } = {};
  mirrored.top = vertical ? anchor.top : anchor.top;
  mirrored.bottom = vertical ? anchor.bottom : anchor.bottom;
  mirrored.left = anchor.right;
  mirrored.right = anchor.left;
  return mirrored;
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
  .touch-layer { font-family: "Segoe UI", sans-serif; z-index: 5; }
  .touch-joystick-base {
    position: absolute;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.35);
    background: rgba(20, 20, 20, 0.35);
    pointer-events: none;
    backdrop-filter: blur(6px);
  }
  .touch-joystick-knob {
    position: absolute;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(120,180,255,0.4));
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .touch-button {
    pointer-events: auto;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.35);
    background: rgba(30, 30, 30, 0.55);
    color: #f4e3c2;
    font-size: clamp(0.7rem, 2.4vw, 1rem);
    width: clamp(62px, 17vw, 86px);
    height: clamp(62px, 17vw, 86px);
    backdrop-filter: blur(4px);
  }
  .touch-button::after {
    content: "";
    position: absolute;
    inset: -8px;
  }
  .touch-button.active {
    background: rgba(80, 160, 255, 0.65);
  }
  .touch-button.toggled {
    background: rgba(255, 160, 80, 0.65);
  }
  `;
  document.head.appendChild(style);
}
