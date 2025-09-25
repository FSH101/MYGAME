import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "http";
import { setupSocket } from "./net/socket";
import { ServerSimulation } from "./sim/simulation";
import { SERVER_TICK_RATE, SNAPSHOT_RATE } from "./shared/types";

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });

const clientDist = join(process.cwd(), "client", "dist");
if (existsSync(clientDist)) {
  await fastify.register(fastifyStatic, {
    root: clientDist,
    prefix: "/",
    decorateReply: false,
  });
}

fastify.get("/health", async () => ({ ok: true }));

const httpServer = createServer(fastify.server);
const simulation = new ServerSimulation();
const io = setupSocket(httpServer, simulation);

let lastLog = Date.now();
setInterval(() => {
  const dt = 1 / SERVER_TICK_RATE;
  simulation.step(dt);
  if (Date.now() - lastLog > 5000) {
    fastify.log.info({ tick: simulation.sim.tick, temp: simulation.sim.temperature }, "sim stats");
    lastLog = Date.now();
  }
}, 1000 / SERVER_TICK_RATE);

setInterval(() => {
  for (const [id, socket] of io.sockets.sockets) {
    const snapshot = simulation.snapshotFor(id);
    socket.emit("message", snapshot);
  }
}, 1000 / SNAPSHOT_RATE);

const port = Number(process.env.PORT ?? 8080);
await fastify.listen({ port, host: "0.0.0.0" });
