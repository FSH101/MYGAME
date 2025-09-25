import "./styles.css";
import { isMobileDevice } from "./shared/platform";

async function bootstrap() {
  setupGlobalGuards();
  const root = document.getElementById("game-root");
  if (!root) throw new Error("Root element missing");
  const module = await import("./scenes/gameScene");
  new module.GameScene(root);
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (err) {
      console.warn("Service worker registration failed", err);
    }
  }
}

function setupGlobalGuards(): void {
  const blockTouch = (event: TouchEvent) => event.preventDefault();
  document.addEventListener("touchmove", blockTouch, { passive: false });
  document.addEventListener("gesturestart", blockTouch, { passive: false });
  document.addEventListener("touchstart", () => {
    if (isMobileDevice()) {
      attemptOrientationLock();
    }
  }, { once: true, passive: false });
  window.addEventListener("pointerdown", () => {
    if (isMobileDevice()) {
      attemptOrientationLock();
    }
  }, { once: true });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}

function attemptOrientationLock(): void {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock("portrait").catch(() => {});
  }
}

bootstrap().catch((err) => console.error(err));
