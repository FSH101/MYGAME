import type { NetInputFrame } from "../shared/types";

export interface ICharacterController {
  setMoveVector(localXZ: { x: number; z: number }): void;
  setSprint(active: boolean): void;
  jump(): void;
  crouchToggle(): void;
  proneToggle(): void;
  addYaw(deltaRadians: number): void;
  addPitch(deltaRadians: number): void;
  setLookActive?(active: boolean): void;
}

export interface IActions {
  attack(pressed: boolean): void;
  interact(): void;
  openInventory(open: boolean): void;
}

export interface INetInputSink {
  sendInput(frame: NetInputFrame): void;
}

export type MoveCurve = "linear" | "expo";

export interface InputSettings {
  MoveDeadzonePx: number;
  MoveSprintThreshold: number;
  MoveCurve: MoveCurve;
  LookSensitivity: number;
  LookSensitivityADS: number;
  LookGamma: number;
  InvertY: boolean;
  GyroAim: boolean;
  LeftHanded: boolean;
}

export interface InputSettingsStore {
  get(): InputSettings;
  update(settings: Partial<InputSettings>): void;
  subscribe(listener: (settings: InputSettings) => void): () => void;
}

export interface PointerSnapshot {
  id: number;
  x: number;
  y: number;
  time: number;
}
