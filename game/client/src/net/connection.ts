import { io, Socket } from "socket.io-client";
import type { ClientMessage, ServerMessage } from "../shared/types";

let socket: Socket<ServerMessage, ClientMessage> | null = null;

export function connect(): Socket<ServerMessage, ClientMessage> {
  if (!socket) {
    socket = io("/", { transports: ["websocket"], autoConnect: true });
  }
  return socket;
}

export function getSocket(): Socket<ServerMessage, ClientMessage> | null {
  return socket;
}
