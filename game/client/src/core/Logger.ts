export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  details?: string;
}

type Listener = (entry: LogEntry) => void;

const HISTORY_LIMIT = 500;

export class Logger {
  private listeners = new Set<Listener>();
  private history: LogEntry[] = [];

  addListener(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHistory(): LogEntry[] {
    return [...this.history];
  }

  info(message: string): void {
    this.emit("info", message);
  }

  warn(message: string, details?: unknown): void {
    this.emit("warn", message, details);
  }

  error(message: string, details?: unknown): void {
    this.emit("error", message, details);
  }

  private emit(level: LogLevel, message: string, details?: unknown): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      details: details !== undefined ? normalizeDetails(details) : undefined,
    };

    if (this.history.length >= HISTORY_LIMIT) {
      this.history.shift();
    }
    this.history.push(entry);

    switch (level) {
      case "info":
        console.log(`[INFO] ${message}`, details ?? "");
        break;
      case "warn":
        console.warn(`[WARN] ${message}`, details ?? "");
        break;
      case "error":
        console.error(`[ERROR] ${message}`, details ?? "");
        break;
    }

    for (const listener of this.listeners) {
      listener(entry);
    }
  }
}

export const logger = new Logger();

export function setupGlobalErrorLogging(): void {
  window.addEventListener(
    "error",
    (event) => {
      logger.error(`Uncaught error: ${event.message}`, event.error ?? event.message);
    },
    { passive: true },
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      logger.error("Unhandled promise rejection", event.reason);
    },
    { passive: true },
  );
}

function normalizeDetails(details: unknown): string {
  if (details instanceof Error) {
    return details.stack ?? `${details.name}: ${details.message}`;
  }
  if (typeof details === "string") {
    return details;
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch (err) {
    return String(details);
  }
}
