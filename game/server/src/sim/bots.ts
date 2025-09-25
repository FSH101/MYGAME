import { performance } from "node:perf_hooks";
import { io } from "socket.io-client";
import type { ClientMessage } from "../shared/types.js";

const BOT_COUNT = Number(process.argv[2] ?? 16);
const URL = process.env.BOT_URL ?? "ws://localhost:8080";

const sockets = [] as ReturnType<typeof io>[];

for (let i = 0; i < BOT_COUNT; i++) {
  const socket = io(URL, { transports: ["websocket"], path: "/socket.io" });
  socket.on("connect", () => {
    console.log(`bot ${i} connected`);
  });
  socket.on("message", (msg) => {
    if (msg.op === "state") {
      // no-op; rely on server for state
    }
  });

  let seq = 0;
  const sendInput = () => {
    const input: ClientMessage = {
      op: "input",
      seq: seq++,
      t: performance.now(),
      mv: { x: Math.sin(seq / 25) * 0.6, z: Math.cos(seq / 32) * 0.8 },
      sp: seq % 40 < 20 ? 1 : 0,
      yaw: Math.sin(seq / 15) * 0.01,
      pitch: 0,
      atk: seq % 50 === 0 ? 1 : 0,
      jmp: 0,
      cr: 0,
      pr: 0,
      inr: seq % 80 === 0 ? 1 : 0,
      inv: 0,
    };
    socket.emit("input", input);
  };
  const interval = setInterval(sendInput, 50);
  socket.on("disconnect", () => {
    clearInterval(interval);
  });
  sockets.push(socket);
}

process.on("SIGINT", () => {
  sockets.forEach((socket) => socket.disconnect());
  process.exit(0);
});
