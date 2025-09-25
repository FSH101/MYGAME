import type { PlayerState, SnapshotMessage, EntityState } from "../shared/types";

export interface WorldSnapshot {
  you: string;
  tick: number;
  players: PlayerState[];
  entities: EntityState[];
  timeOfDay: number;
  temperature: number;
}

let snapshot: WorldSnapshot | null = null;

export function setSnapshot(state: SnapshotMessage): void {
  snapshot = { ...state };
}

export function getSnapshot(): WorldSnapshot | null {
  return snapshot;
}
