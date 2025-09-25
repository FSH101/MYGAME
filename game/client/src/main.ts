import "./styles.css";
import { isMobileDevice } from "./shared/platform";
import { initRenderer } from "./render/initRenderer";
import type { RendererHandle } from "./render/initRenderer";
import { GameScene } from "./scenes/gameScene";
import { LoadingScreen } from "./ui/loading/LoadingScreen";
import { loadAssets, clearAssetCache } from "./assets/AssetLoader";
import { logger, setupGlobalErrorLogging } from "./core/Logger";

const TOTAL_STAGES = 7;

async function bootstrap(): Promise<void> {
  setupGlobalGuards();
  setupGlobalErrorLogging();

  const root = document.getElementById("game-root");
  if (!root) throw new Error("Не найден корневой элемент для игры");

  const loading = new LoadingScreen(document.body);
  loading.setProgress(0);

  let renderer: RendererHandle | null = null;
  let scene: GameScene | null = null;

  const stages: Array<{
    name: string;
    run: (setStageProgress: (value: number) => void) => Promise<void>;
  }> = [
    {
      name: "Регистрация кеша",
      run: async (setStageProgress) => {
        await registerServiceWorker();
        setStageProgress(1);
      },
    },
    {
      name: "Инициализация рендера",
      run: async (setStageProgress) => {
        renderer = initRenderer(root, {
          onContextRestored: () => scene?.handleContextRestored(),
        });
        setStageProgress(1);
      },
    },
    {
      name: "Создание сцены",
      run: async (setStageProgress) => {
        if (!renderer) throw new Error("Рендер ещё не инициализирован");
        scene = new GameScene(root, renderer);
        scene.initializeUI();
        setStageProgress(1);
      },
    },
    {
      name: "Загрузка ассетов",
      run: async (setStageProgress) => {
        if (!scene) throw new Error("Игровая сцена не создана");
        await loadAssets(
          scene.getScene(),
          [
            {
              key: "player",
              type: "max",
              url: "/assets/models/player.max",
            },
          ],
          (progress) => setStageProgress(progress),
        );
        setStageProgress(1);
      },
    },
    {
      name: "Инициализация сети",
      run: async (setStageProgress) => {
        scene?.initializeNetwork();
        setStageProgress(1);
      },
    },
    {
      name: "Создание игрока",
      run: async (setStageProgress) => {
        scene?.initializeInput();
        setStageProgress(1);
      },
    },
    {
      name: "Запуск игрового цикла",
      run: async (setStageProgress) => {
        scene?.start();
        setStageProgress(1);
      },
    },
  ];

  try {
    for (let i = 0; i < stages.length; i++) {
      const { name, run } = stages[i];
      const stageHandle = loading.beginStage(name);
      logger.info(`${name}…`);
      try {
        await run((value) => updateGlobalProgress(loading, i, value));
        stageHandle.complete();
        updateGlobalProgress(loading, i + 1, 0);
        logger.info(`${name} готов`);
      } catch (err) {
        stageHandle.fail(err);
        throw err;
      }
    }
    loading.finish();
  } catch (err) {
    logger.error("Инициализация игры завершилась с ошибкой", err);
    loading.showRetry(() => {
      void handleRetry();
    });
  }
}

function updateGlobalProgress(loading: LoadingScreen, stageIndex: number, localProgress: number): void {
  const base = stageIndex / TOTAL_STAGES;
  const progress = Math.min(1, base + localProgress / TOTAL_STAGES);
  loading.setProgress(progress);
}

async function handleRetry(): Promise<void> {
  logger.info("Запрошен повторный запуск: очищаем кеши");
  try {
    clearAssetCache();
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    logger.warn("Не удалось очистить кеши перед перезапуском", error);
  }
  const url = new URL(window.location.href);
  url.searchParams.set("retry", Date.now().toString());
  window.location.replace(url.toString());
}

async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    logger.warn("Service Worker недоступен в текущем окружении");
    return;
  }
  try {
    await navigator.serviceWorker.register("/service-worker.js");
    logger.info("Service Worker успешно зарегистрирован");
  } catch (err) {
    logger.warn("Не удалось зарегистрировать Service Worker", err);
  }
}

function setupGlobalGuards(): void {
  const blockTouch = (event: TouchEvent) => event.preventDefault();
  document.addEventListener("touchmove", blockTouch, { passive: false });
  document.addEventListener("gesturestart", blockTouch, { passive: false });
  document.addEventListener(
    "touchstart",
    () => {
      if (isMobileDevice()) {
        attemptOrientationLock();
      }
    },
    { once: true, passive: false },
  );
  window.addEventListener(
    "pointerdown",
    () => {
      if (isMobileDevice()) {
        attemptOrientationLock();
      }
    },
    { once: true },
  );
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}

function attemptOrientationLock(): void {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock("portrait").catch(() => {});
  }
}

bootstrap().catch((err) => {
  logger.error("Необработанная ошибка инициализации", err);
});
