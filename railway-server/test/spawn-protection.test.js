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

test("fast motion snapshots contain head movement without repeating body details", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1600,
    y: 1600,
    color: "#ff405f",
    name: "Player",
    sessionId: "compact-player",
    isHuman: true,
  });
  room.snakes.push(human);

  const snapshot = room.makeSnapshot(false, false);

  assert.equal("p" in snapshot, false);
  assert.equal("b" in snapshot.s[0], false);
  assert.equal(snapshot.s[0].x, 1600);
  assert.equal(snapshot.s[0].w, 150);
});

test("human steering uses the same analogue turn strength as the client", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1600,
    y: 1600,
    angle: 0,
    color: "#ff405f",
    name: "Player",
    sessionId: "turn-player",
    isHuman: true,
  });
  room.players.set("turn-player", { active: true });
  room.snakes.push(human);
  room.messages.input({ sessionId: "turn-player" }, { angle: Math.PI / 2, turnStrength: 0.5, boosting: false });
  human.targetAngle = Math.PI / 2;

  room.steerHuman(human, 1 / 60);

  assert.equal(human.turnStrength, 0.5);
  assert.ok(Math.abs(human.angle - 0.06) < 0.000001);
});

test("framed input is processed once per fixed simulation tick and acknowledged", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1600,
    y: 1600,
    angle: 0,
    color: "#ff405f",
    name: "Player",
    sessionId: "framed-player",
    isHuman: true,
  });
  room.players.set("framed-player", { active: true });
  room.snakes.push(human);
  room.messages.input({ sessionId: "framed-player" }, {
    frames: [
      [1, 0, 1, 0],
      [2, 0, 1, 0],
      [2, Math.PI / 2, 1, 0],
    ],
  });

  assert.equal(human.inputQueue.length, 2, "duplicate sequences must be ignored");
  room.simulate(1 / 60);
  assert.equal(human.lastProcessedInputSequence, 1);
  assert.ok(Math.abs(human.x - 1602.5) < 0.001);
  room.simulate(1 / 60);
  assert.equal(human.lastProcessedInputSequence, 2);
  assert.ok(Math.abs(human.x - 1605) < 0.001);

  const snapshot = room.makeSnapshot(false, false);
  assert.equal(snapshot.s[0].r, 2);
});

test("the server accumulator advances only in fixed 60 Hz steps", () => {
  const room = new SnakeArenaRoom();
  let steps = 0;
  room.simulate = (deltaTime) => {
    assert.equal(deltaTime, 1 / 60);
    steps += 1;
  };

  room.advanceSimulation(1000 / 30);

  assert.equal(steps, 2);
  assert.ok(room.simulationAccumulatorMs < 0.000001);
});

test("the authoritative server advances a human snake at arena speed", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1600,
    y: 1600,
    angle: 0,
    color: "#ff405f",
    name: "Player",
    sessionId: "speed-test-player",
    isHuman: true,
  });

  for (let tick = 0; tick < 60; tick += 1) room.moveSnake(human, 1 / 60);

  assert.ok(Math.abs(human.x - 1750) < 0.001);
  assert.equal(human.y, 1600);
  assert.equal(human.speed, 150);
});

test("motion snapshots include server speed for smooth client rendering", () => {
  const room = new SnakeArenaRoom();
  const human = room.makeSnake({
    x: 1600,
    y: 1600,
    color: "#ff405f",
    name: "Player",
    sessionId: "snapshot-player",
    isHuman: true,
  });
  room.snakes.push(human);

  const snapshot = room.makeSnapshot(false);

  assert.equal(snapshot.v, 4);
  assert.equal(snapshot.s[0].w, 150);
  assert.equal(snapshot.s[0].r, 0);
  assert.equal(snapshot.s[0].z, 100);
});
