import { Engine } from "@babylonjs/core";
import { isMobileDevice } from "../shared/platform";

export interface RendererHandle {
  canvas: HTMLCanvasElement;
  engine: Engine;
  start(loop: () => void): void;
  stop(): void;
  dispose(): void;
}

interface InitOptions {
  onContextRestored?: () => void;
  onContextLost?: () => void;
}

const OVERLAY_CLASS = "render-overlay";

export function initRenderer(container: HTMLElement, options: InitOptions = {}): RendererHandle {
  const canvas = document.createElement("canvas");
  canvas.id = "render-canvas";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  canvas.setAttribute("tabindex", "0");
  container.appendChild(canvas);

  const overlay = ensureOverlay(container);

  const showOverlay = (message: string) => {
    overlay.textContent = message;
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
  };

  const hideOverlay = () => {
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
  };

  const engine = createEngine(canvas, overlay);
  let running = false;
  let loopFn: (() => void) | null = null;

  const resize = () => {
    const dpr = getCappedDpr();
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
    if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
      engine.setSize(width, height, true);
    }
  };

  const visibilityHandler = () => {
    if (document.hidden) {
      stopLoop();
    } else if (loopFn) {
      startLoop(loopFn);
    }
  };

  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      showOverlay("Графический контекст потерян. Восстанавливаем...");
      stopLoop();
      options.onContextLost?.();
    },
    { passive: false },
  );

  canvas.addEventListener(
    "webglcontextrestored",
    () => {
      hideOverlay();
      resize();
      options.onContextRestored?.();
      if (loopFn) {
        startLoop(loopFn);
      }
    },
    { passive: false },
  );

  resize();

  function startLoop(callback: () => void) {
    loopFn = callback;
    if (running) return;
    running = true;
    engine.runRenderLoop(() => {
      if (document.hidden) {
        stopLoop();
        return;
      }
      resize();
      callback();
    });
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    engine.stopRenderLoop();
  }

  function dispose() {
    stopLoop();
    document.removeEventListener("visibilitychange", visibilityHandler);
    window.removeEventListener("resize", resize);
    window.removeEventListener("orientationchange", resize);
    canvas.remove();
    hideOverlay();
    engine.dispose();
  }

  return {
    canvas,
    engine,
    start: startLoop,
    stop: stopLoop,
    dispose,
  };
}

function createEngine(canvas: HTMLCanvasElement, overlay: HTMLDivElement): Engine {
  try {
    return new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: false,
      audioEngine: false,
    });
  } catch (err) {
    console.warn("WebGL2 init failed, retrying with WebGL1", err);
  }
  try {
    return new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: true,
      audioEngine: false,
    });
  } catch (err) {
    console.error("WebGL init failed", err);
    overlay.textContent =
      "Не удалось инициализировать WebGL. Попробуйте обновить браузер или выключить энергосберегающий режим.";
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
    throw err;
  }
}

function ensureOverlay(container: HTMLElement): HTMLDivElement {
  let overlay = container.querySelector<HTMLDivElement>(`.${OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0, 0, 0, 0.78)";
    overlay.style.color = "#f4e3c2";
    overlay.style.fontFamily = "'Segoe UI', sans-serif";
    overlay.style.fontSize = "1rem";
    overlay.style.padding = "1.5rem";
    overlay.style.textAlign = "center";
    overlay.style.zIndex = "20";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transition = "opacity 0.25s ease";
    container.appendChild(overlay);
  } else {
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
  }
  return overlay;
}

function getCappedDpr(): number {
  const dpr = window.devicePixelRatio || 1;
  if (isMobileDevice()) {
    return Math.min(2, dpr);
  }
  return Math.min(1.5, dpr);
}
