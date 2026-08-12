import { defineRoom, defineServer } from "colyseus";
import { SnakeArenaRoom } from "./rooms/SnakeArenaRoom.js";

const DEFAULT_ORIGINS = [
  "https://4me2play.com",
  "https://www.4me2play.com",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://terminal.local:4173",
];

function allowedOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

const server = defineServer({
  rooms: {
    snake_arena: defineRoom(SnakeArenaRoom),
  },
  express: (app) => {
    const origins = allowedOrigins();
    app.use((request, response, next) => {
      const origin = request.headers.origin;
      if (origin && origins.has(origin)) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      }
      if (request.method === "OPTIONS") {
        response.sendStatus(origin && origins.has(origin) ? 204 : 403);
        return;
      }
      next();
    });
    app.get("/health", (_request, response) => {
      response.json({ ok: true, service: "snake-arena", version: "0.20.0" });
    });
  },
});

export default server;
