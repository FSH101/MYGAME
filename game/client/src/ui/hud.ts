import type { Stats, InventoryState, Recipe } from "../shared/types";
import { triggerAction } from "../systems/inputSystem";

interface HUDRefs {
  hp: HTMLDivElement;
  hunger: HTMLDivElement;
  thirst: HTMLDivElement;
  stamina: HTMLDivElement;
  temperature: HTMLSpanElement;
  craftingList: HTMLDivElement;
  inventory: HTMLDivElement;
}

let root: HTMLElement | null = null;
let refs: HUDRefs | null = null;

export function createHUD(container: HTMLElement): void {
  root = document.createElement("div");
  root.className = "hud";
  root.innerHTML = `
    <style>
      .hud { position: absolute; inset: 0; pointer-events: none; font-family: 'Segoe UI', sans-serif; color: #f4e3c2; }
      .hud .bars { position: absolute; top: 1.5rem; left: 1rem; width: 40vw; max-width: 260px; display: grid; gap: 0.4rem; }
      .hud .bar { height: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
      .hud .bar span { display: block; height: 100%; border-radius: 8px; transition: width 0.2s ease; }
      .hud .temperature { position: absolute; top: 1.5rem; right: 1rem; font-size: 1rem; }
      .hud .actions { position: absolute; bottom: 2.5rem; right: 1rem; display: flex; flex-direction: column; gap: 0.75rem; pointer-events: auto; }
      .hud button { width: 72px; height: 72px; border-radius: 50%; background: rgba(30,30,30,0.6); border: 2px solid rgba(255,255,255,0.3); color: #f4e3c2; font-size: 0.75rem; }
      .hud .joystick { position: absolute; bottom: 2.5rem; left: 1.5rem; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.08); pointer-events: none; border: 2px solid rgba(255,255,255,0.1); }
      .hud .crafting { position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); width: 90vw; max-width: 420px; background: rgba(0,0,0,0.7); border-radius: 16px; padding: 1rem; pointer-events: auto; display: none; }
      .hud .crafting h2 { margin: 0 0 0.6rem 0; font-size: 1rem; }
      .hud .crafting .recipes { display: grid; gap: 0.6rem; max-height: 200px; overflow-y: auto; }
      .hud .crafting .recipe { display: flex; justify-content: space-between; align-items: center; }
      .hud .inventory { position: absolute; bottom: 10rem; left: 50%; transform: translateX(-50%); width: 90vw; max-width: 420px; background: rgba(0,0,0,0.65); padding: 0.6rem; border-radius: 12px; display: grid; gap: 0.4rem; grid-template-columns: repeat(5, minmax(0, 1fr)); pointer-events: auto; }
      .hud .slot { aspect-ratio: 1; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; }
      @media (min-width: 768px) {
        .hud button { width: 84px; height: 84px; font-size: 0.8rem; }
        .hud .bars { width: 300px; }
      }
    </style>
    <div class="bars">
      <div class="bar"><span class="hp" style="background:#e85f5f;width:100%"></span></div>
      <div class="bar"><span class="hunger" style="background:#f9a857;width:100%"></span></div>
      <div class="bar"><span class="thirst" style="background:#57c7f9;width:100%"></span></div>
      <div class="bar"><span class="stamina" style="background:#b3f957;width:100%"></span></div>
    </div>
    <div class="temperature">Temp: <span class="temp-value">0°C</span></div>
    <div class="joystick"></div>
    <div class="actions">
      <button data-action="jump">Прыжок</button>
      <button data-action="hit">Удар</button>
      <button data-action="interact">Взаим.</button>
      <button data-action="inventory">Инвентарь</button>
    </div>
    <div class="inventory"></div>
    <div class="crafting">
      <h2>Крафт</h2>
      <div class="recipes"></div>
    </div>
  `;
  container.appendChild(root);

  refs = {
    hp: root.querySelector<HTMLDivElement>(".hp")!,
    hunger: root.querySelector<HTMLDivElement>(".hunger")!,
    thirst: root.querySelector<HTMLDivElement>(".thirst")!,
    stamina: root.querySelector<HTMLDivElement>(".stamina")!,
    temperature: root.querySelector<HTMLSpanElement>(".temp-value")!,
    craftingList: root.querySelector<HTMLDivElement>(".recipes")!,
    inventory: root.querySelector<HTMLDivElement>(".inventory")!,
  };

  root.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      if (!action) return;
      triggerAction(action as any);
    });
  });
}

export function updateHUD(stats: Stats, temperature: number, inventory: InventoryState): void {
  if (!refs) return;
  const { hp, hunger, thirst, stamina, temperature: temp, inventory: inventoryRoot } = refs;
  hp.style.width = `${Math.max(0, stats.hp)}%`;
  hunger.style.width = `${Math.max(0, stats.hunger)}%`;
  thirst.style.width = `${Math.max(0, stats.thirst)}%`;
  stamina.style.width = `${Math.max(0, stats.stamina)}%`;
  temp.textContent = `${temperature.toFixed(1)}°C`;
  inventoryRoot.innerHTML = "";
  inventory.slots.forEach((slot) => {
    const div = document.createElement("div");
    div.className = "slot";
    div.textContent = slot ? `${slot.item} ×${slot.count}` : "";
    inventoryRoot.appendChild(div);
  });
}

export function populateCrafting(recipes: Recipe[], onCraft: (recipe: Recipe) => void): void {
  if (!refs || !root) return;
  const { craftingList } = refs;
  craftingList.innerHTML = "";
  recipes.forEach((recipe) => {
    const element = document.createElement("div");
    element.className = "recipe";
    const requires = Object.entries(recipe.requires)
      .map(([item, count]) => `${item}×${count}`)
      .join(", ");
    element.innerHTML = `<span>${recipe.output}</span><span>${requires}</span>`;
    element.addEventListener("click", () => onCraft(recipe));
    craftingList.appendChild(element);
  });
}

export function toggleCrafting(open: boolean): void {
  const panel = root?.querySelector<HTMLDivElement>(".crafting");
  if (panel) {
    panel.style.display = open ? "block" : "none";
  }
}
