import { Room } from "colyseus";

const ACTIVE_PLAYER_LIMIT = 4;
const TOTAL_SNAKES = 19;
const SNAPSHOT_HZ = 15;
const SIMULATION_HZ = 30;

const SETTINGS = {
  worldWidth: 4200,
  worldHeight: 4200,
  pelletCount: 520,
  startSegments: 34,
  segmentSpacing: 9,
  baseSpeed: 150,
  boostSpeed: 245,
  turnSpeed: 3.5,
  playerTurnSpeed: 7.2,
  headRadius: 11,
  bodyRadius: 9,
  pelletRadius: 4,
  deathPelletMinRadius: 4.5,
  deathPelletMaxRadius: 12,
  fivePointPelletChance: 0.06,
  tenPointPelletChance: 0.02,
  boostDrain: 25,
  boostRecharge: 12,
  pelletsPerGrowth: 10,
  segmentsPerGrowth: 2,
  maxRadiusGrowth: 6,
  killsPerExtraLife: 10,
  phaseDuration: 1.35,
  aiRespawnDelay: 1800,
};

const COLORS = ["#ff5d7d", "#57d6ff", "#ffcf4d", "#b47cff", "#ff8e4f", "#49f5a6", "#f06cff", "#e9ff5e", "#72a4ff"];
const AI_NAMES = ["Viper", "Nova", "Pixel", "Orbit", "Cobra", "Rex", "Blitz", "Echo", "Mamba", "Bolt", "Ghost", "Fang", "Comet", "Rogue", "Turbo", "Venom", "Neon", "Dash", "Sly", "Byte", "Ziggy", "Drift"];

const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeAngle = (value) => {
  let angle = value;
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
};
const angleDelta = (from, to) => {
  let difference = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
};
const distanceSquared = (first, second) => {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
};

function cleanName(value) {
  const name = String(value || "").trim().slice(0, 16);
  return name && /^[A-Za-z0-9 _-]+$/.test(name) ? name : "Player";
}

function cleanColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
}

function cleanPalette(value) {
  const colors = String(value || "").split(",");
  return [
    cleanColor(colors[0], "#ff405f"),
    cleanColor(colors[1], "#ffcf4d"),
    cleanColor(colors[2], "#57d6ff"),
  ];
}

export class SnakeArenaRoom extends Room {
  maxClients = 64;

  players = new Map();
  activeSessions = [];
  waitingSessions = [];
  snakes = [];
  pellets = [];
  nextSnakeId = 1;
  tick = 0;
  snapshotEvery = Math.max(1, Math.round(SIMULATION_HZ / SNAPSHOT_HZ));

  messages = {
    ready: (client) => this.sendMemberships(client.sessionId),
    input: (client, message) => {
      const profile = this.players.get(client.sessionId);
      if (!profile?.active) return;
      const snake = this.snakes.find((entry) => entry.sessionId === client.sessionId);
      if (!snake?.alive) return;
      const inputAngle = Number(message?.angle);
      if (Number.isFinite(inputAngle)) snake.targetAngle = normalizeAngle(inputAngle);
      snake.boostRequested = Boolean(message?.boosting);
    },
  };

  onCreate() {
    this.setPatchRate(null);
    this.seedPellets();
    while (this.snakes.length < TOTAL_SNAKES) this.spawnAI();
    this.setSimulationInterval((deltaTime) => this.simulate(Math.min(deltaTime / 1000, 0.05)), 1000 / SIMULATION_HZ);
  }

  onJoin(client, options) {
    const profile = {
      client,
      name: cleanName(options?.playerName),
      palette: cleanPalette(options?.palette),
      active: false,
      joinedAt: Date.now(),
    };
    this.players.set(client.sessionId, profile);
    if (this.activeSessions.length < ACTIVE_PLAYER_LIMIT) this.activate(client.sessionId);
    else this.waitingSessions.push(client.sessionId);
    setTimeout(() => this.sendMemberships(), 0);
  }

  onLeave(client) {
    const sessionId = client.sessionId;
    const wasActive = this.activeSessions.includes(sessionId);
    this.activeSessions = this.activeSessions.filter((entry) => entry !== sessionId);
    this.waitingSessions = this.waitingSessions.filter((entry) => entry !== sessionId);
    this.players.delete(sessionId);
    const snakeIndex = this.snakes.findIndex((entry) => entry.sessionId === sessionId);
    if (snakeIndex >= 0) this.snakes.splice(snakeIndex, 1);
    if (wasActive) {
      while (this.snakes.length < TOTAL_SNAKES) this.spawnAI();
      this.promoteNextPlayer();
    }
    this.sendMemberships();
  }

  activate(sessionId) {
    const profile = this.players.get(sessionId);
    if (!profile || profile.active) return;
    profile.active = true;
    this.activeSessions.push(sessionId);
    this.waitingSessions = this.waitingSessions.filter((entry) => entry !== sessionId);
    const aiIndex = this.snakes.findIndex((entry) => !entry.isHuman);
    if (aiIndex >= 0) this.snakes.splice(aiIndex, 1);
    const point = this.safeWorldPoint(500);
    const snake = this.makeSnake({
      x: point.x,
      y: point.y,
      color: profile.palette[0],
      stripeColor: profile.palette[1],
      glowColor: profile.palette[2],
      name: profile.name,
      sessionId,
      isHuman: true,
    });
    this.snakes.push(snake);
  }

  promoteNextPlayer() {
    while (this.activeSessions.length < ACTIVE_PLAYER_LIMIT && this.waitingSessions.length) {
      const sessionId = this.waitingSessions.shift();
      if (this.players.has(sessionId)) this.activate(sessionId);
    }
  }

  sendMemberships(onlySessionId = null) {
    for (const [sessionId, profile] of this.players) {
      if (onlySessionId && sessionId !== onlySessionId) continue;
      const queuePosition = profile.active ? 0 : this.waitingSessions.indexOf(sessionId) + 1;
      profile.client.send("membership", {
        status: profile.active ? "active" : "queued",
        slot: profile.active ? this.activeSessions.indexOf(sessionId) + 1 : 0,
        queue_position: Math.max(0, queuePosition),
        active_count: this.activeSessions.length,
        max_players: ACTIVE_PLAYER_LIMIT,
      });
    }
  }

  randomWorldPoint(margin = 150) {
    return {
      x: rand(margin, SETTINGS.worldWidth - margin),
      y: rand(margin, SETTINGS.worldHeight - margin),
    };
  }

  safeWorldPoint(margin = 500) {
    let fallback = this.randomWorldPoint(margin);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = this.randomWorldPoint(margin);
      fallback = candidate;
      const blocked = this.snakes.some((snake) => {
        if (!snake.alive) return false;
        if (distanceSquared(candidate, snake) < 500 * 500) return true;
        for (let index = 0; index < snake.body.length; index += 8) {
          if (distanceSquared(candidate, snake.body[index]) < 220 * 220) return true;
        }
        return false;
      });
      if (!blocked) return candidate;
    }
    return fallback;
  }

  makeSnake({ x, y, color, stripeColor = color, glowColor = color, name, sessionId = null, isHuman = false }) {
    const angle = rand(-Math.PI, Math.PI);
    const body = [];
    for (let index = 0; index < SETTINGS.startSegments; index += 1) {
      body.push({
        x: x - Math.cos(angle) * index * SETTINGS.segmentSpacing,
        y: y - Math.sin(angle) * index * SETTINGS.segmentSpacing,
      });
    }
    const id = this.nextSnakeId++;
    return {
      id,
      networkId: sessionId ? `human-${sessionId}` : `snake-${id}`,
      sessionId,
      isHuman,
      x,
      y,
      angle,
      targetAngle: angle,
      color,
      stripeColor,
      glowColor,
      name,
      alive: true,
      body,
      desiredSegments: SETTINGS.startSegments,
      speed: SETTINGS.baseSpeed,
      score: 0,
      kills: 0,
      extraLives: 0,
      phaseTime: 0,
      boost: 100,
      boostRequested: false,
      pelletProgress: 0,
      growthFlash: 0,
      aiTimer: 0,
      aiBias: rand(-0.8, 0.8),
      respawnAt: 0,
    };
  }

  spawnAI() {
    const point = this.randomWorldPoint(400);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const snake = this.makeSnake({
      x: point.x,
      y: point.y,
      color,
      stripeColor: color,
      glowColor: color,
      name: AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)],
    });
    snake.desiredSegments = SETTINGS.startSegments + Math.floor(Math.random() * 45);
    while (snake.body.length < snake.desiredSegments) {
      const tail = snake.body[snake.body.length - 1];
      snake.body.push({ x: tail.x, y: tail.y });
    }
    snake.score = Math.max(0, (snake.desiredSegments - SETTINGS.startSegments) * 5);
    this.snakes.push(snake);
  }

  randomArenaPelletValue() {
    const roll = Math.random();
    if (roll < SETTINGS.tenPointPelletChance) return 10;
    if (roll < SETTINGS.tenPointPelletChance + SETTINGS.fivePointPelletChance) return 5;
    return 1;
  }

  pelletRadiusForValue(value) {
    if (value >= 10) return 8;
    if (value >= 5) return 6;
    if (value >= 3) return 5.5;
    return SETTINGS.pelletRadius;
  }

  makePellet(x = null, y = null, value = null, color = null) {
    const point = x === null ? this.randomWorldPoint(30) : { x, y };
    const pelletValue = value === null ? this.randomArenaPelletValue() : value;
    return {
      x: point.x,
      y: point.y,
      value: pelletValue,
      r: this.pelletRadiusForValue(pelletValue),
      color: color || COLORS[Math.floor(Math.random() * COLORS.length)],
      deathDrop: false,
      vx: 0,
      vy: 0,
    };
  }

  seedPellets() {
    this.pellets = [];
    while (this.pellets.length < SETTINGS.pelletCount) this.pellets.push(this.makePellet());
  }

  radiusGrowth(snake) {
    return Math.min(SETTINGS.maxRadiusGrowth, Math.max(0, snake.desiredSegments - SETTINGS.startSegments) / 14);
  }

  headRadiusFor(snake) {
    return SETTINGS.headRadius + this.radiusGrowth(snake) * 0.82;
  }

  bodyRadiusFor(snake) {
    return SETTINGS.bodyRadius + this.radiusGrowth(snake);
  }

  steerAI(snake, deltaTime) {
    snake.aiTimer -= deltaTime;
    let target = snake.angle;
    const margin = 260;
    if (snake.x < margin) target = 0;
    else if (snake.x > SETTINGS.worldWidth - margin) target = Math.PI;
    else if (snake.y < margin) target = Math.PI / 2;
    else if (snake.y > SETTINGS.worldHeight - margin) target = -Math.PI / 2;
    else {
      let nearest = null;
      let best = Infinity;
      for (let index = 0; index < this.pellets.length; index += 3) {
        const pellet = this.pellets[index];
        const distance = distanceSquared(snake, pellet);
        if (distance < best) {
          best = distance;
          nearest = pellet;
        }
      }
      if (nearest) target = Math.atan2(nearest.y - snake.y, nearest.x - snake.x);
      target += snake.aiBias * 0.25;
      for (const other of this.snakes) {
        if (other === snake || !other.alive) continue;
        for (let index = 5; index < other.body.length; index += 8) {
          const segment = other.body[index];
          const dx = segment.x - snake.x;
          const dy = segment.y - snake.y;
          if (dx * dx + dy * dy < 250 * 250) {
            const away = Math.atan2(-dy, -dx);
            target = normalizeAngle(target + angleDelta(target, away) * 0.85);
            break;
          }
        }
      }
    }
    if (snake.aiTimer <= 0) {
      snake.aiTimer = rand(0.35, 1.1);
      snake.aiBias = rand(-1, 1);
    }
    snake.targetAngle = target;
    const maxTurn = SETTINGS.turnSpeed * 0.72 * deltaTime;
    snake.angle = normalizeAngle(snake.angle + clamp(angleDelta(snake.angle, snake.targetAngle), -maxTurn, maxTurn));
    snake.boostRequested = snake.boost > 35 && Math.random() < 0.006;
  }

  steerHuman(snake, deltaTime) {
    const maxTurn = SETTINGS.playerTurnSpeed * deltaTime;
    snake.angle = normalizeAngle(snake.angle + clamp(angleDelta(snake.angle, snake.targetAngle), -maxTurn, maxTurn));
  }

  moveSnake(snake, deltaTime) {
    const boosting = snake.boostRequested && snake.boost > 2;
    if (snake.isHuman) {
      snake.speed = boosting ? SETTINGS.boostSpeed : SETTINGS.baseSpeed;
    } else {
      snake.speed = boosting ? SETTINGS.boostSpeed * 0.9 : SETTINGS.baseSpeed * rand(0.9, 1.05);
    }
    if (boosting) {
      snake.boost = Math.max(0, snake.boost - SETTINGS.boostDrain * deltaTime);
      if (snake.desiredSegments > 18 && Math.random() < deltaTime * 5) {
        snake.desiredSegments -= 1;
        const tail = snake.body[snake.body.length - 1];
        this.pellets.push(this.makePellet(tail.x, tail.y, 1, snake.color));
      }
    } else {
      snake.boost = Math.min(100, snake.boost + SETTINGS.boostRecharge * deltaTime);
    }
    const oldX = snake.x;
    const oldY = snake.y;
    snake.x += Math.cos(snake.angle) * snake.speed * deltaTime;
    snake.y += Math.sin(snake.angle) * snake.speed * deltaTime;
    snake.x = clamp(snake.x, 0, SETTINGS.worldWidth);
    snake.y = clamp(snake.y, 0, SETTINGS.worldHeight);
    if (Math.hypot(snake.x - oldX, snake.y - oldY) > 0.1) {
      snake.body.unshift({ x: snake.x, y: snake.y });
      while (snake.body.length > snake.desiredSegments) snake.body.pop();
    }
  }

  eatPellets(snake) {
    const reach = this.headRadiusFor(snake) + 8;
    const reachSquared = reach * reach;
    for (let index = this.pellets.length - 1; index >= 0; index -= 1) {
      const pellet = this.pellets[index];
      if (distanceSquared(snake, pellet) >= reachSquared) continue;
      this.pellets.splice(index, 1);
      snake.pelletProgress += 1;
      snake.score += pellet.value;
      const growthSteps = Math.floor(snake.pelletProgress / SETTINGS.pelletsPerGrowth);
      if (growthSteps) {
        snake.desiredSegments += growthSteps * SETTINGS.segmentsPerGrowth;
        snake.pelletProgress %= SETTINGS.pelletsPerGrowth;
        snake.growthFlash = 1;
      }
    }
  }

  scatterSnakePellets(victim) {
    for (let index = 0; index < victim.body.length; index += 2) {
      const segment = victim.body[index];
      const outward = Math.atan2(segment.y - victim.y, segment.x - victim.x) + rand(-0.72, 0.72);
      const speed = rand(65, 175) + (index % 4) * 7;
      const value = Math.floor(rand(1, 21));
      const colors = [victim.color, victim.stripeColor, victim.glowColor];
      const pellet = this.makePellet(segment.x, segment.y, value, colors[index % colors.length]);
      const valueRatio = (value - 1) / 19;
      pellet.r = SETTINGS.deathPelletMinRadius + (SETTINGS.deathPelletMaxRadius - SETTINGS.deathPelletMinRadius) * valueRatio;
      pellet.vx = Math.cos(outward) * speed;
      pellet.vy = Math.sin(outward) * speed;
      pellet.deathDrop = true;
      this.pellets.push(pellet);
    }
  }

  awardKill(killer) {
    killer.kills += 1;
    killer.score += 100;
    if (killer.isHuman && killer.kills % SETTINGS.killsPerExtraLife === 0) killer.extraLives += 1;
  }

  consumeExtraLife(snake) {
    if (!snake.isHuman || snake.extraLives <= 0 || snake.phaseTime > 0) return false;
    snake.extraLives -= 1;
    snake.phaseTime = SETTINGS.phaseDuration;
    snake.x = clamp(snake.x + Math.cos(snake.angle) * 22, 0, SETTINGS.worldWidth);
    snake.y = clamp(snake.y + Math.sin(snake.angle) * 22, 0, SETTINGS.worldHeight);
    return true;
  }

  killSnake(victim, killer = null) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.boostRequested = false;
    if (killer && killer !== victim) this.awardKill(killer);
    this.scatterSnakePellets(victim);
    if (victim.isHuman) {
      const profile = this.players.get(victim.sessionId);
      profile?.client.send("game_over", {
        score: victim.score,
        kills: victim.kills,
        length: victim.desiredSegments,
      });
    } else {
      victim.respawnAt = Date.now() + SETTINGS.aiRespawnDelay;
    }
  }

  collisions() {
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      const headRadius = this.headRadiusFor(snake);
      if (
        snake.x <= headRadius ||
        snake.y <= headRadius ||
        snake.x >= SETTINGS.worldWidth - headRadius ||
        snake.y >= SETTINGS.worldHeight - headRadius
      ) {
        this.killSnake(snake);
        continue;
      }
      if (snake.phaseTime > 0) continue;
      for (const other of this.snakes) {
        if (!other.alive) continue;
        const start = other === snake ? 14 : 3;
        for (let index = start; index < other.body.length; index += 2) {
          const segment = other.body[index];
          const dx = snake.x - segment.x;
          const dy = snake.y - segment.y;
          const hit = headRadius + this.bodyRadiusFor(other) - 2;
          if (dx * dx + dy * dy < hit * hit) {
            if (!this.consumeExtraLife(snake)) this.killSnake(snake, other === snake ? null : other);
            break;
          }
        }
        if (!snake.alive || snake.phaseTime > 0) break;
      }
    }
  }

  respawnAI() {
    const now = Date.now();
    for (let index = this.snakes.length - 1; index >= 0; index -= 1) {
      const snake = this.snakes[index];
      if (!snake.isHuman && !snake.alive && now >= snake.respawnAt) {
        this.snakes.splice(index, 1);
        this.spawnAI();
      }
    }
  }

  updateDeathPellets(deltaTime) {
    for (const pellet of this.pellets) {
      if (!pellet.deathDrop) continue;
      pellet.x += pellet.vx * deltaTime;
      pellet.y += pellet.vy * deltaTime;
      pellet.vx *= Math.pow(0.982, deltaTime * 60);
      pellet.vy *= Math.pow(0.982, deltaTime * 60);
      pellet.vy += 24 * deltaTime;
    }
  }

  simulate(deltaTime) {
    this.tick += 1;
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      if (snake.isHuman) this.steerHuman(snake, deltaTime);
      else this.steerAI(snake, deltaTime);
      this.moveSnake(snake, deltaTime);
      this.eatPellets(snake);
      snake.growthFlash = Math.max(0, snake.growthFlash - deltaTime * 1.25);
      snake.phaseTime = Math.max(0, snake.phaseTime - deltaTime);
    }
    this.collisions();
    this.respawnAI();
    this.updateDeathPellets(deltaTime);
    while (this.pellets.length < SETTINGS.pelletCount) this.pellets.push(this.makePellet());
    if (this.tick % this.snapshotEvery === 0) this.sendSnapshot();
  }

  makeSnapshot() {
    return {
      v: 2,
      t: this.tick,
      o: this.activeSessions.length,
      m: ACTIVE_PLAYER_LIMIT,
      s: this.snakes.map((snake) => ({
        i: snake.networkId,
        u: snake.sessionId || "",
        h: snake.isHuman,
        n: snake.name,
        c: [snake.color, snake.stripeColor, snake.glowColor],
        x: Math.round(snake.x),
        y: Math.round(snake.y),
        a: Number(snake.angle.toFixed(4)),
        v: snake.alive,
        d: snake.desiredSegments,
        q: snake.score,
        k: snake.kills,
        l: snake.extraLives,
        z: Number(snake.boost.toFixed(1)),
        p: snake.pelletProgress,
        g: Number(snake.growthFlash.toFixed(2)),
        f: Number(snake.phaseTime.toFixed(2)),
        b: snake.body
          .filter((_point, index) => index % 2 === 0)
          .slice(0, 180)
          .map((point) => [Math.round(point.x), Math.round(point.y)]),
      })),
      p: this.pellets.slice(0, SETTINGS.pelletCount + 280).map((pellet) => [
        Math.round(pellet.x),
        Math.round(pellet.y),
        pellet.value,
        Math.round(pellet.r * 10),
        pellet.color,
        pellet.deathDrop ? 1 : 0,
      ]),
    };
  }

  sendSnapshot() {
    if (!this.activeSessions.length) return;
    const snapshot = this.makeSnapshot();
    for (const sessionId of this.activeSessions) {
      this.players.get(sessionId)?.client.send("snapshot", snapshot);
    }
  }
}
