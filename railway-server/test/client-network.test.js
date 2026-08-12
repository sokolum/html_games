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
        { i: "human-player-session", x: ownX, y: 1000, a: 0, w: 150, v: true },
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
