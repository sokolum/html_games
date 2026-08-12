import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { webcrypto } from "node:crypto";

class FakeElement {
  constructor() {
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.style = {};
    this.dataset = {};
    this.value = "";
    this.textContent = "";
  }

  addEventListener() {}
  appendChild() {}
  replaceChildren() {}
  setAttribute() {}
  setPointerCapture() {}
  focus() {}
}

function createGameContext() {
  const elements = new Map();
  const drawingContext = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        const element = new FakeElement();
        if (id === "game") element.getContext = () => drawingContext;
        elements.set(id, element);
      }
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return new FakeElement(); },
  };
  const storage = () => {
    const values = new Map();
    return {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    };
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
  };
  return vm.createContext({
    window,
    document,
    location: { hostname: "localhost" },
    localStorage: storage(),
    sessionStorage: storage(),
    performance,
    crypto: webcrypto,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame() {},
    fetch: async () => ({ ok: true, json: async () => [] }),
    console: { info() {}, error() {} },
    setTimeout,
    clearTimeout,
    structuredClone,
    Intl,
    Date,
    Math,
  });
}

const body = (x, y) => Array.from({ length: 12 }, (_, index) => [x - index * 8, y]);
const details = (id, sessionId, x, y) => ({
  i: id,
  u: sessionId,
  h: Boolean(sessionId),
  n: sessionId ? "Player" : "Viper",
  c: ["#ff405f", "#ffcf4d", "#57d6ff"],
  x,
  y,
  a: 0,
  w: 150,
  v: true,
  d: 34,
  q: 0,
  k: 0,
  l: 0,
  z: 100,
  p: 0,
  g: 0,
  f: 5,
  r: 0,
  b: body(x, y),
});

test("the browser accepts fast head-only snapshots and predicts its own snake", async () => {
  const context = createGameContext();
  const source = await readFile(new URL("../../snake-arena/game.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  vm.runInContext("multiplayer.sessionId='player-session'; multiplayer.active=true; multiplayer.joined=true; multiplayer.room={send(){}}", context);

  context.snapshot = {
    t: 0,
    s: [
      details("human-player-session", "player-session", 1000, 1000),
      details("snake-2", "", 1200, 1200),
    ],
    p: [[900, 900, 1, 40, "#ffffff", 0]],
  };
  assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,true)", context), true);

  for (const [tick, ownX, remoteX] of [[3, 1008, 1208], [6, 1015, 1215], [9, 1023, 1223]]) {
    context.snapshot = {
      t: tick,
      s: [
        { i: "human-player-session", x: ownX, y: 1000, a: 0, w: 150, v: true, z: 100, r: 0 },
        { i: "snake-2", x: remoteX, y: 1200, a: 0, w: 150, v: true },
      ],
    };
    assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,false)", context), true);
  }

  const before = vm.runInContext("player.x", context);
  vm.runInContext("updateGuestWorld(1/60)", context);
  const state = vm.runInContext("({playerX:player.x,snakeCount:snakes.length,pelletCount:pellets.length,remoteX:snakes.find(s=>s.networkId==='snake-2').x})", context);

  assert.ok(state.playerX > before, "the local head should move immediately between server snapshots");
  assert.equal(state.snakeCount, 2);
  assert.equal(state.pelletCount, 1, "a head-only snapshot must preserve the last pellet state");
  assert.ok(Math.abs(state.remoteX - 1208) < 0.001, "remote snakes should render from the interpolation buffer");
});

test("an acknowledged snapshot replays every unprocessed input instead of pulling the player backwards", async () => {
  const context = createGameContext();
  const source = await readFile(new URL("../../snake-arena/game.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  vm.runInContext("multiplayer.sessionId='player-session'; multiplayer.active=true; multiplayer.joined=true; multiplayer.room={send(){}}", context);

  context.snapshot = {
    t: 0,
    s: [details("human-player-session", "player-session", 1000, 1000)],
    p: [],
  };
  assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,true)", context), true);

  vm.runInContext("networkInputAngle=0; networkTurnStrength=1; for(let frame=0;frame<18;frame++)createPredictedInputFrame(player)", context);
  const before = vm.runInContext("player.x", context);
  assert.ok(Math.abs(before - 1045) < 0.001, "18 fixed frames should cover 45px at 150px/s");

  context.snapshot = {
    t: 6,
    s: [{ i: "human-player-session", x: 1015, y: 1000, a: 0, w: 150, v: true, z: 100, r: 6 }],
  };
  assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,false)", context), true);
  const reconciliation = vm.runInContext("({ack:multiplayer.lastAckInputSequence,pending:multiplayer.pendingInputs.length,target:player.predictedTarget.x,correction:player.correctionX})", context);

  assert.equal(reconciliation.ack, 6);
  assert.equal(reconciliation.pending, 12);
  assert.ok(Math.abs(reconciliation.target - 1045) < 0.001, "the authoritative state plus replay must stay at the locally predicted present");
  assert.ok(Math.abs(reconciliation.correction) < 0.001, "a delayed but matching server snapshot must not slow the local snake");
});

test("fixed prediction keeps arena speed independent of render frame duration and batches network input", async () => {
  const context = createGameContext();
  const source = await readFile(new URL("../../snake-arena/game.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  vm.runInContext("multiplayer.sessionId='player-session'; multiplayer.active=true; multiplayer.joined=true; multiplayer.room={messages:[],send(type,message){this.messages.push({type,message})}}", context);

  context.snapshot = {
    t: 0,
    s: [details("human-player-session", "player-session", 1000, 1000)],
    p: [],
  };
  assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,true)", context), true);

  vm.runInContext("for(let frame=0;frame<20;frame++)update(0.05)", context);
  const result = vm.runInContext("({distance:player.x-1000,sequences:multiplayer.nextInputSequence-1,messages:multiplayer.room.messages.map(entry=>entry.message.frames)})", context);

  assert.ok(Math.abs(result.distance - 150) < 0.01, `expected 150px in one second, received ${result.distance.toFixed(3)}px`);
  assert.equal(result.sequences, 60);
  assert.equal(result.messages.length, 20);
  assert.ok(result.messages.every((frames) => frames.length === 3), "three fixed input frames should share each 20Hz packet");
  assert.deepEqual([...result.messages[0][0]], [1, 0, 1, 0]);
});

for (const roundTripLatencyMs of [0, 100, 200, 300]) {
  test(`prediction remains 150px/s with ${roundTripLatencyMs}ms round-trip latency`, async () => {
    const context = createGameContext();
    const source = await readFile(new URL("../../snake-arena/game.js", import.meta.url), "utf8");
    vm.runInContext(source, context);
    vm.runInContext("multiplayer.sessionId='player-session'; multiplayer.active=true; multiplayer.joined=true; multiplayer.room={send(){}}", context);

    context.snapshot = {
      t: 0,
      s: [details("human-player-session", "player-session", 1000, 1000)],
      p: [],
    };
    assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,true)", context), true);

    const oneWayTicks = Math.round(roundTripLatencyMs * 60 / 2000);
    const inputTransit = [];
    const serverQueue = [];
    const snapshotTransit = [];
    let serverX = 1000;
    let serverAcknowledgement = 0;

    for (let tick = 1; tick <= 120; tick += 1) {
      const input = vm.runInContext("structuredClone(createPredictedInputFrame(player))", context);
      inputTransit.push({ deliverAt: tick + oneWayTicks, input });
      while (inputTransit.length && inputTransit[0].deliverAt <= tick) serverQueue.push(inputTransit.shift().input);
      if (serverQueue.length) {
        const processed = serverQueue.shift();
        serverAcknowledgement = processed.sequence;
        serverX += 150 / 60;
      }
      if (tick % 3 === 0) {
        snapshotTransit.push({
          deliverAt: tick + oneWayTicks,
          snapshot: {
            t: tick,
            s: [{ i: "human-player-session", x: serverX, y: 1000, a: 0, w: 150, v: true, z: 100, r: serverAcknowledgement }],
          },
        });
      }
      while (snapshotTransit.length && snapshotTransit[0].deliverAt <= tick) {
        context.snapshot = snapshotTransit.shift().snapshot;
        assert.equal(vm.runInContext("applyGuestSnapshot(snapshot,false)", context), true);
      }
      vm.runInContext("updatePredictedPlayer(player,1/60)", context);
    }

    const state = vm.runInContext("({x:player.x,correctionX:player.correctionX,pending:multiplayer.pendingInputs.length})", context);
    assert.ok(Math.abs(state.x - 1300) < 0.01, `expected 300px after two seconds, received ${(state.x - 1000).toFixed(3)}px`);
    assert.ok(Math.abs(state.correctionX) < 0.001, "matching delayed snapshots must not create a backwards correction");
    assert.ok(state.pending >= oneWayTicks * 2, "unacknowledged latency frames should remain available for replay");
  });
}
