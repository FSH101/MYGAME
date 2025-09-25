import type { InputSettings, InputSettingsStore } from "./types";

const STORAGE_KEY = "wasteland-touch-settings";

const defaultSettings: InputSettings = {
  MoveDeadzonePx: 16,
  MoveSprintThreshold: 0.75,
  MoveCurve: "expo",
  LookSensitivity: 0.72,
  LookSensitivityADS: 0.48,
  LookGamma: 0.85,
  InvertY: false,
  GyroAim: false,
  LeftHanded: false,
};

export function createSettingsStore(): InputSettingsStore {
  let current = loadSettings();
  const listeners = new Set<(settings: InputSettings) => void>();

  function emit() {
    listeners.forEach((listener) => listener(current));
  }

  return {
    get() {
      return current;
    },
    update(patch) {
      current = { ...current, ...patch };
      saveSettings(current);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
  };
}

function loadSettings(): InputSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<InputSettings>;
    return { ...defaultSettings, ...parsed };
  } catch (error) {
    console.warn("Failed to load touch settings", error);
    return { ...defaultSettings };
  }
}

function saveSettings(settings: InputSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to save touch settings", error);
  }
}

export { defaultSettings };
