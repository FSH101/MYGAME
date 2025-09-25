import { Server as IOServer } from "socket.io";
import type { Server } from "http";
import type { ServerSimulation } from "../sim/simulation";
import type { InputMessage, ClientMessage } from "../shared/types";

export function setupSocket(server: Server, sim: ServerSimulation): IOServer {
  const io = new IOServer(server, {
    cors: { origin: true },
    transports: ["websocket"],
  });

  io.on("connection", (socket) => {
    const name = `Runner${Math.floor(Math.random() * 999)}`;
    const playerId = sim.attachPlayer(socket.id, name);
    socket.emit("message", { op: "join", id: playerId, seed: Date.now() });

    socket.on("input", (msg: ClientMessage) => {
      if (msg.op !== "input") return;
      sim.receiveInput(socket.id, msg as InputMessage);
    });

    socket.on("craft", (recipe: string, cb?: (success: boolean) => void) => {
      const success = sim.craft(socket.id, recipe as never);
      cb?.(success);
    });

    socket.on("disconnect", () => {
      sim.detachPlayer(socket.id);
    });
  });

  return io;
}
