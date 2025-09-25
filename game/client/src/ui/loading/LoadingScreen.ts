import template from "./loading.html?raw";
import styles from "./loading.css?raw";
import type { LogEntry, Logger } from "../../core/Logger";
import { logger } from "../../core/Logger";

interface StageHandle {
  complete(): void;
  fail(error: unknown): void;
}

interface StageRow {
  element: HTMLLIElement;
  indicator: HTMLSpanElement;
  name: HTMLSpanElement;
}

const LOG_LIMIT = 400;
let stylesInjected = false;

export class LoadingScreen {
  private root: HTMLElement;
  private progressBar: HTMLSpanElement;
  private progressLabel: HTMLDivElement;
  private stageList: HTMLUListElement;
  private errorSection: HTMLDivElement;
  private errorLog: HTMLPreElement;
  private errorToggle: HTMLButtonElement;
  private retryButton: HTMLButtonElement;
  private copyButton: HTMLButtonElement;
  private logBuffer: string[] = [];
  private stages = new Map<string, StageRow>();
  private detachLogger: (() => void) | null = null;
  private retryHandler: (() => void) | null = null;

  constructor(mount: HTMLElement = document.body) {
    if (!stylesInjected) {
      const styleEl = document.createElement("style");
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
      stylesInjected = true;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = template;
    const element = wrapper.firstElementChild;
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error("Не удалось создать контейнер экрана загрузки");
    }

    this.root = element;
    this.progressBar = this.query<HTMLSpanElement>(".progress-value");
    this.progressLabel = this.query<HTMLDivElement>(".progress-label");
    this.stageList = this.query<HTMLUListElement>(".stage-log");
    this.errorSection = this.query<HTMLDivElement>(".error-section");
    this.errorLog = this.query<HTMLPreElement>(".error-log");
    this.errorToggle = this.query<HTMLButtonElement>(".error-toggle");
    this.retryButton = this.query<HTMLButtonElement>("[data-action=\"retry\"]");
    this.copyButton = this.query<HTMLButtonElement>("[data-action=\"copy\"]");

    this.errorToggle.addEventListener("click", () => this.toggleErrors());
    this.copyButton.addEventListener("click", () => this.copyLog());
    this.retryButton.addEventListener("click", () => {
      if (!this.retryHandler) return;
      this.retryButton.disabled = true;
      this.retryHandler();
    });

    mount.appendChild(this.root);
    this.attachLogger(logger);
  }

  attachLogger(source: Logger): void {
    this.detachLogger?.();
    this.detachLogger = source.addListener((entry) => this.onLogEntry(entry));
  }

  beginStage(name: string): StageHandle {
    const item = document.createElement("li");
    item.className = "stage stage-pending";
    const indicator = document.createElement("span");
    indicator.className = "stage-indicator";
    const label = document.createElement("span");
    label.className = "stage-name";
    label.textContent = name;
    item.appendChild(indicator);
    item.appendChild(label);
    this.stageList.appendChild(item);
    this.stages.set(name, { element: item, indicator, name: label });
    return {
      complete: () => this.setStageState(name, "success"),
      fail: (error) => this.handleStageFailure(name, error),
    };
  }

  setProgress(fraction: number): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    this.progressBar.style.width = `${(clamped * 100).toFixed(1)}%`;
    this.progressLabel.textContent = `${Math.round(clamped * 100)}%`;
  }

  showRetry(onRetry: () => void): void {
    this.retryHandler = onRetry;
    this.retryButton.classList.remove("hidden");
    this.retryButton.disabled = false;
  }

  finish(): void {
    this.root.classList.add("hidden");
    window.setTimeout(() => {
      this.detachLogger?.();
      this.root.remove();
    }, 450);
  }

  dispose(): void {
    this.detachLogger?.();
    this.root.remove();
  }

  appendError(message: string, details?: string): void {
    this.pushLog("ERROR", message, details);
    this.errorSection.classList.remove("collapsed");
  }

  private setStageState(name: string, state: "success" | "fail"): void {
    const row = this.stages.get(name);
    if (!row) return;
    row.element.classList.remove("stage-pending", "stage-success", "stage-fail");
    row.element.classList.add(`stage-${state}`);
  }

  private handleStageFailure(name: string, error: unknown): void {
    this.setStageState(name, "fail");
    const details = normalizeError(error);
    this.appendError(`Этап «${name}» завершился с ошибкой`, details);
  }

  private toggleErrors(): void {
    const collapsed = this.errorSection.classList.toggle("collapsed");
    this.errorToggle.textContent = collapsed ? "Показать ошибки" : "Скрыть ошибки";
  }

  private copyLog(): void {
    const text = this.logBuffer.join("\n");
    if (text.length === 0) {
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch((err) => {
        this.appendError("Не удалось скопировать лог", normalizeError(err));
      });
    } else {
      this.appendError("Clipboard API недоступен");
    }
  }

  private onLogEntry(entry: LogEntry): void {
    const level = entry.level.toUpperCase();
    this.pushLog(level, entry.message, entry.details);
    if (entry.level === "error") {
      this.errorSection.classList.remove("collapsed");
    }
  }

  private pushLog(level: string, message: string, details?: string): void {
    const timestamp = new Date().toLocaleTimeString("ru-RU", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const lines = [`[${timestamp}] ${level} ${message}`];
    if (details) {
      for (const line of details.split(/\n+/)) {
        lines.push(`  ${line}`);
      }
    }
    this.logBuffer.push(...lines);
    while (this.logBuffer.length > LOG_LIMIT) {
      this.logBuffer.shift();
    }
    this.errorLog.textContent = this.logBuffer.join("\n");
  }

  private query<T extends Element>(selector: string): T {
    const element = this.root.querySelector(selector);
    if (!element) {
      throw new Error(`LoadingScreen missing element for selector ${selector}`);
    }
    return element as T;
  }
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch (err) {
    return String(error);
  }
}
