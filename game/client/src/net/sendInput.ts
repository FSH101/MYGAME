import type { ClientMessage, Vec2 } from "../shared/types";
import { getSocket } from "./connection";

let seq = 0;

export function sendInput(move: Vec2, look: Vec2, actions: ClientMessage["actions"]): void {
  const socket = getSocket();
  if (!socket) return;
  const message: ClientMessage = {
    op: "input",
    at: performance.now(),
    seq: seq++,
    move,
    look,
    actions,
  };
  socket.emit("input", message);
}
