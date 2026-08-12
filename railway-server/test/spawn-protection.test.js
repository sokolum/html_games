import test from "node:test";
import assert from "node:assert/strict";

import { SnakeArenaRoom } from "../src/rooms/SnakeArenaRoom.js";

test("a human player cannot die during the first spawn ticks", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1200,
    y: 1200,
    color: "#ff405f",
    name: "Player",
    sessionId: "test-player",
    isHuman: true,
  });
  const rival = room.makeSnake({
    x: human.x,
    y: human.y,
    color: "#57d6ff",
    name: "Rival",
  });

  room.snakes.push(human, rival);
  room.collisions();

  assert.equal(human.alive, true);
  assert.ok(human.phaseTime > 0);
});

test("AI snakes use a location clear of existing snake bodies", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 2100,
    y: 2100,
    color: "#ff405f",
    name: "Player",
    sessionId: "test-player",
    isHuman: true,
  });
  room.snakes.push(human);

  for (let index = 0; index < 12; index += 1) room.spawnAI();

  for (const snake of room.snakes.slice(1)) {
    const dx = snake.x - human.x;
    const dy = snake.y - human.y;
    assert.ok(dx * dx + dy * dy >= 500 * 500);
  }
});

test("a human snake never collides with its own body", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1600,
    y: 1600,
    color: "#ff405f",
    name: "Player",
    sessionId: "test-player",
    isHuman: true,
  });
  human.phaseTime = 0;
  human.body[20] = { x: human.x, y: human.y };
  room.snakes.push(human);

  room.collisions();

  assert.equal(human.alive, true);
});

test("human spawn direction points toward the safe center", () => {
  const room = new SnakeArenaRoom();
  const point = { x: 900, y: 900 };
  const angle = room.inwardSpawnAngle(point);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const towardCenter = { x: 2100 - point.x, y: 2100 - point.y };

  assert.ok(direction.x * towardCenter.x + direction.y * towardCenter.y > 0);
});

test("motion snapshots can omit pellets between compact pellet updates", () => {
  const room = new SnakeArenaRoom();
  room.seedPellets();

  const motionSnapshot = room.makeSnapshot(false);
  const fullSnapshot = room.makeSnapshot(true);

  assert.equal("p" in motionSnapshot, false);
  assert.equal(fullSnapshot.p.length, 520);
});
