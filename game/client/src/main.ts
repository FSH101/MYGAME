import "./styles.css";

async function bootstrap() {
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

bootstrap().catch((err) => console.error(err));
