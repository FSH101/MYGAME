import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { setupSocket } from "./net/socket.js";
import { ServerSimulation } from "./sim/simulation.js";
import { SERVER_TICK_RATE, SNAPSHOT_RATE } from "./shared/types.js";

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });

const fileDir = fileURLToPath(new URL(".", import.meta.url));
const clientDist = join(fileDir, "..", "..", "client", "dist");
let spaIndex: string | null = null;
if (existsSync(clientDist)) {
  await fastify.register(fastifyStatic, {
    root: clientDist,
    prefix: "/",
    decorateReply: false,
  });

  try {
    spaIndex = await readFile(join(clientDist, "index.html"), "utf8");
  } catch (err) {
    fastify.log.error({ err }, "Failed to preload index.html for SPA fallback");
  }

  fastify.setNotFoundHandler(async (request, reply) => {
    if (spaIndex && (request.method === "GET" || request.method === "HEAD")) {
      reply.type("text/html");
      if (request.method === "HEAD") {
        return reply.send();
      }

      return reply.send(spaIndex);
    }

    return reply.code(404).send({ error: "Not Found" });
  });
}

fastify.get("/health", async () => ({ ok: true }));

const simulation = new ServerSimulation();

const port = Number(process.env.PORT ?? 8080);
await fastify.listen({ port, host: "0.0.0.0" });

const io = setupSocket(fastify.server, simulation);

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
