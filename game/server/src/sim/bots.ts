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
      at: Date.now(),
      seq: seq++,
      move: [Math.sin(seq / 20), Math.cos(seq / 40)],
      look: [Math.sin(seq / 10) * 5, 0],
      actions: { jump: false, hit: seq % 50 === 0, interact: seq % 30 === 0, inventory: false },
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
