import type { InputSettings, InputSettingsStore } from "./types";
import { isMobileDevice } from "../shared/platform";

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

const mobileForced: Partial<InputSettings> = {
  MoveDeadzonePx: 18,
  MoveSprintThreshold: 0.78,
  MoveCurve: "expo",
  LookSensitivityADS: 0.5,
  LookGamma: 0.84,
  InvertY: false,
  GyroAim: false,
};

export function createSettingsStore(): InputSettingsStore {
  let current = loadSettings();
  const listeners = new Set<(settings: InputSettings) => void>();

  function emit() {
    listeners.forEach((listener) => listener(current));
  }

  const mobile = isMobileDevice();

  return {
    get() {
      return current;
    },
    update(patch) {
      if (mobile) {
        const filtered: Partial<InputSettings> = {};
        if (patch.LookSensitivity !== undefined) {
          filtered.LookSensitivity = clamp(patch.LookSensitivity, 0.2, 2);
        }
        if (patch.LeftHanded !== undefined) {
          filtered.LeftHanded = patch.LeftHanded;
        }
        current = applyMobilePreset({ ...current, ...filtered });
      } else {
        current = { ...current, ...patch };
      }
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
    return applyMobilePreset({ ...defaultSettings, ...parsed });
  } catch (error) {
    console.warn("Failed to load touch settings", error);
    return applyMobilePreset({ ...defaultSettings });
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

function applyMobilePreset(settings: InputSettings): InputSettings {
  if (!isMobileDevice()) return settings;
  return { ...settings, ...mobileForced };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
