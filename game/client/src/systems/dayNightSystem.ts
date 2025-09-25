import type { Scene, HemisphericLight } from "@babylonjs/core";
import { Color3 } from "@babylonjs/core";
import { getSnapshot } from "../net/state";

export function updateDayNight(scene: Scene, light: HemisphericLight): void {
  const snapshot = getSnapshot();
  if (!snapshot) return;
  const t = snapshot.timeOfDay;
  const daylight = Math.max(0.1, Math.sin(Math.PI * t));
  light.intensity = daylight * 1.2;
  light.diffuse = new Color3(0.9 * daylight + 0.1, 0.8 * daylight + 0.2, 0.7 * daylight + 0.3);
  const sky = scene.clearColor;
  sky.r = 0.05 + daylight * 0.25;
  sky.g = 0.07 + daylight * 0.3;
  sky.b = 0.12 + daylight * 0.35;
}
