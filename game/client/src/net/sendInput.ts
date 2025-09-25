import type { ClientMessage, NetInputFrame } from "../shared/types";
import { getSocket } from "./connection";

let seq = 0;

export function sendInput(frame: NetInputFrame): void {
  const socket = getSocket();
  if (!socket) return;
  const message: ClientMessage = {
    op: "input",
    seq: seq++,
    ...frame,
  };
  socket.emit("input", message);
}
