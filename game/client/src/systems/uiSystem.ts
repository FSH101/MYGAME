import { RECIPES } from "../shared/types";
import type { World } from "../ecs/world";
import { updateHUD, createHUD, populateCrafting, toggleCrafting } from "../ui/hud";
import { requestCraft } from "../net/craft";
import { getSnapshot } from "../net/state";
import type { PlayerComponent } from "../components";

let hudCreated = false;

export function ensureHUD(container: HTMLElement): void {
  if (!hudCreated) {
    createHUD(container);
    populateCrafting(RECIPES, async (recipe) => {
      const success = await requestCraft(recipe.output);
      if (!success) {
        console.warn("Craft failed", recipe.output);
      }
    });
    hudCreated = true;
  }
}

export function updateUI(world: World): void {
  const snapshot = getSnapshot();
  if (!snapshot) return;
  const localEntity = world
    .query("player")
    .map((entity) => world.get<PlayerComponent>(entity, "player")!)
    .find((player) => player.local);
  if (!localEntity) return;
  updateHUD(localEntity.stats, snapshot.temperature, localEntity.inventory);
}

export function showCrafting(open: boolean): void {
  toggleCrafting(open);
}
