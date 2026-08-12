import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@colyseus/sdk";

const PORT = 27657;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

async function waitForHealth(serverOutput) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Realtime server did not become healthy.\n${serverOutput.join("")}`);
}

test("a real client receives acknowledged fixed-step movement snapshots", async (context) => {
  const output = [];
  const server = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk) => output.push(chunk.toString()));
  context.after(() => server.kill("SIGTERM"));

  await waitForHealth(output);

  const client = new Client(SERVER_URL);
  const room = await client.joinOrCreate("snake_arena", {
    playerName: "MovementTest",
    palette: "#ff405f,#ffcf4d,#57d6ff",
  });
  context.after(async () => room.leave(true));

  const snapshots = [];
  room.onMessage("membership", () => {});
  room.onMessage("snapshot", (snapshot) => snapshots.push(structuredClone(snapshot)));
  room.send("ready");
  const initialDeadline = Date.now() + 3_000;
  while (snapshots.length < 1 && Date.now() < initialDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const firstSnapshot = snapshots[0];
  const firstPlayer = firstSnapshot.s.find((snake) => snake.u === room.sessionId);
  assert.ok(firstPlayer);
  assert.equal(firstPlayer.w, 150);
  let sequence = 1;
  for (let batch = 0; batch < 6; batch += 1) {
    room.send("input", {
      frames: Array.from({ length: 12 }, () => [sequence++, firstPlayer.a, 1, 0]),
    });
  }

  const acknowledgementDeadline = Date.now() + 3_000;
  while (!snapshots.some((snapshot) => snapshot.s.find((snake) => snake.i === firstPlayer.i)?.r >= 60) && Date.now() < acknowledgementDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const nextSnapshot = snapshots.findLast((snapshot) => snapshot.s.find((snake) => snake.i === firstPlayer.i)?.r >= 60);
  assert.ok(nextSnapshot, "Expected the server to acknowledge at least 60 input frames");
  const nextPlayer = nextSnapshot.s.find((snake) => snake.i === firstPlayer.i);
  const travelled = Math.hypot(nextPlayer.x - firstPlayer.x, nextPlayer.y - firstPlayer.y);

  assert.ok(nextPlayer.r >= 60);
  assert.ok(nextSnapshot.t - firstSnapshot.t >= 60);
  assert.ok(travelled >= 145, `Expected at least 145px movement, received ${travelled.toFixed(1)}px`);
  assert.equal(nextSnapshot.v, 4);
});
