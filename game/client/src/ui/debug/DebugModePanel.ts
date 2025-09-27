const STYLE = `
.debug-mode-root {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  font-family: 'Segoe UI', sans-serif;
  color: #f4e3c2;
}
.debug-mode-root button {
  border: none;
  border-radius: 999px;
  padding: 0.45rem 1.1rem;
  background: rgba(17, 24, 33, 0.86);
  color: inherit;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, background 0.15s ease;
}
.debug-mode-root button:hover {
  transform: translateY(-1px);
  background: rgba(28, 38, 52, 0.92);
}
.debug-mode-root .debug-panel {
  margin-top: 0.6rem;
  background: rgba(12, 17, 24, 0.95);
  border-radius: 14px;
  padding: 0.75rem;
  min-width: 220px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}
.debug-mode-root .debug-panel.hidden {
  display: none;
}
.debug-mode-root label {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 0.4rem;
}
.debug-mode-root select {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  border: none;
  font-size: 0.9rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
}
.debug-mode-root .hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  opacity: 0.8;
  line-height: 1.4;
}
`;

const MODES: Array<{ value: string; label: string; description: string }> = [
  { value: "", label: "Игровой режим", description: "Стандартный запуск клиента" },
  { value: "map-editor", label: "Редактор карты", description: "Режим работы с уровнями" },
  { value: "character-editor", label: "Редактор персонажей", description: "Просмотр и настройка героев и мобов" },
];

let root: HTMLDivElement | null = null;
let panel: HTMLDivElement | null = null;
let select: HTMLSelectElement | null = null;
let toggleButton: HTMLButtonElement | null = null;
let outsideHandler: ((event: MouseEvent) => void) | null = null;

export function ensureDebugModePanel(): void {
  if (!root) {
    createPanel();
  }
  syncSelection();
}

function createPanel(): void {
  root = document.createElement("div");
  root.className = "debug-mode-root";

  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.textContent = "Отладка";
  root.appendChild(toggleButton);

  panel = document.createElement("div");
  panel.className = "debug-panel hidden";
  root.appendChild(panel);

  const label = document.createElement("label");
  label.textContent = "Выбор режима запуска:";
  panel.appendChild(label);

  select = document.createElement("select");
  for (const mode of MODES) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    select.appendChild(option);
  }
  panel.appendChild(select);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Смена режима обновит страницу с нужным параметром mode.";
  panel.appendChild(hint);

  toggleButton.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
  });

  select.addEventListener("change", () => {
    const value = select?.value ?? "";
    applyMode(value);
  });

  outsideHandler = (event: MouseEvent) => {
    if (!root) return;
    if (!panel || panel.classList.contains("hidden")) return;
    if (root.contains(event.target as Node)) return;
    panel.classList.add("hidden");
  };
  document.addEventListener("click", outsideHandler);

  document.body.appendChild(root);
}

function syncSelection(): void {
  if (!select) return;
  const current = new URL(window.location.href).searchParams.get("mode") ?? "";
  select.value = current;
  updateHint(current);
}

function updateHint(value: string): void {
  if (!panel) return;
  const hint = panel.querySelector<HTMLDivElement>(".hint");
  if (!hint) return;
  const description = MODES.find((mode) => mode.value === value)?.description ?? "";
  hint.textContent = description
    ? `${description} — при выборе страница перезагрузится.`
    : "Стандартный запуск клиента без дополнительных параметров.";
}

function applyMode(value: string): void {
  if (!panel) return;
  panel.classList.add("hidden");
  const url = new URL(window.location.href);
  if (!value) {
    url.searchParams.delete("mode");
  } else {
    url.searchParams.set("mode", value);
  }
  window.location.href = url.toString();
}

export function disposeDebugModePanel(): void {
  if (outsideHandler) {
    document.removeEventListener("click", outsideHandler);
    outsideHandler = null;
  }
  root?.remove();
  root = null;
  panel = null;
  select = null;
  toggleButton = null;
}
