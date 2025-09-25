import type { InventoryState } from "../shared/types.js";

interface PlayerRecord {
  id: string;
  inventory: InventoryState;
  updatedAt: number;
}

export class InMemoryStore {
  private players = new Map<string, PlayerRecord>();

  savePlayer(id: string, inventory: InventoryState): void {
    this.players.set(id, { id, inventory, updatedAt: Date.now() });
  }

  loadPlayer(id: string): InventoryState | null {
    return this.players.get(id)?.inventory ?? null;
  }

  dump(): PlayerRecord[] {
    return Array.from(this.players.values());
  }
}
