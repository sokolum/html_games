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
