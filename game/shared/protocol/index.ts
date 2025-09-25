import type { ClientMessage, InputMessage } from "../types";

export function createInputMessage(partial: Omit<InputMessage, "op">): ClientMessage {
  return { op: "input", ...partial };
}
