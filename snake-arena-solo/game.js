const SNAKE_ARENA_VERSION = '0.8';
const PLAYER_NAME_STORAGE_KEY = 'snakeArenaSoloPlayerName';
const PLAYER_COLOR_STORAGE_KEY = 'snakeArenaSoloPlayerColor';
const PLAYER_STRIPE_COLOR_STORAGE_KEY = 'snakeArenaSoloStripeColor';
const PLAYER_GLOW_COLOR_STORAGE_KEY = 'snakeArenaSoloGlowColor';
const DEFAULT_PLAYER_COLOR = '#ff405f';
const DEFAULT_STRIPE_COLOR = '#ffcf4d';
const DEFAULT_GLOW_COLOR = '#57d6ff';

const SETTINGS = {
  worldWidth: 4200,
  worldHeight: 4200,
  pelletCount: 1456,
  aiCount: 27,
  startSegments: 18,
  segmentSpacing: 7,
  baseSpeed: 150,
  boostSpeed: 245,
  turnSpeed: 3.5,
  headRadius: 11,
  bodyRadius: 9,
  pelletRadius: 4,
  deathPelletMinRadius: 4.5,
  deathPelletMaxRadius: 12,
  fivePointPelletChance: 0.06,
  tenPointPelletChance: 0.02,
  boostSegmentDrainRate: 5,
  minimumBoostSegments: 18,
  boostFullSegments: 40,
  growthPerPellet: 2,
  pelletMagnetExtraDiameter: 0.25,
  pelletMagnetSpeed: 185,
  aiRespawnDelay: 1800,
  deathSceneDuration: 2000
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const app = document.getElementById('app');
const menu = document.getElementById('menu');
const gameOverPanel = document.getElementById('gameOver');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const hud = document.getElementById('hud');
const leaderboard = document.getElementById('leaderboard');
const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const killsEl = document.getElementById('kills');
const boostFill = document.getElementById('boostFill');
const boostLengthEl = document.getElementById('boostLength');
const leadersEl = document.getElementById('leaders');
const boostBtn = document.getElementById('boostBtn');
const finalScore = document.getElementById('finalScore');
const finalKills = document.getElementById('finalKills');
const finalLength = document.getElementById('finalLength');
const snakeColorInput = document.getElementById('snakeColor');
const snakeStripeColorInput = document.getElementById('snakeStripeColor');
const snakeGlowColorInput = document.getElementById('snakeGlowColor');
const palettePreview = document.getElementById('palettePreview');
const colorStatus = document.getElementById('colorStatus');
const colorSwatches = [...document.querySelectorAll('.colorSwatch')];
const firstNameInput = document.getElementById('firstName');
const nameStatus = document.getElementById('nameStatus');
const scoreLoadStatus = document.getElementById('scoreLoadStatus');
const menuScores = document.getElementById('menuScores');
const resultScores = document.getElementById('resultScores');
const saveStatus = document.getElementById('saveStatus');
const finalPlaytime = document.getElementById('finalPlaytime');
const radarCanvas = document.getElementById('radar');
const radarCtx = radarCanvas.getContext('2d');

const COLORS = ['#ff5d7d','#57d6ff','#ffcf4d','#b47cff','#ff8e4f','#49f5a6','#f06cff','#e9ff5e','#72a4ff'];
const AI_NAMES = ['Viper','Nova','Pixel','Orbit','Cobra','Rex','Blitz','Echo','Mamba','Bolt','Ghost','Fang','Comet','Rogue','Turbo','Venom','Neon','Dash','Sly','Byte','Ziggy','Drift'];

let dpr = 1;
let width = 0;
let height = 0;
let running = false;
let lastTime = 0;
let player = null;
let snakes = [];
let pellets = [];
let particles = [];
let keys = new Set();
let pointer = { active:false, id:null, x:0, y:0, lastX:0, lastY:0, aimX:0, aimY:0 };
let mouseAim = { seen:false, x:0, y:0 };
let boostPointerId = null;
let boosting = false;
let camera = { x: SETTINGS.worldWidth / 2, y: SETTINGS.worldHeight / 2, zoom: 1 };
let nextId = 1;
let currentPlayerColor = DEFAULT_PLAYER_COLOR;
let currentPlayerStripeColor = DEFAULT_STRIPE_COLOR;
let currentPlayerGlowColor = DEFAULT_GLOW_COLOR;
let currentPlayerName = '';
let onlineScores = [];
let gameStartedAt = 0;
let lastPlaytimeSeconds = 0;
let boostDrainProgress = 0;
let deathPending = false;
let deathEndsAt = 0;
const pelletSpriteCache = new Map();

function resize(){
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);
resize();

function rand(min,max){ return Math.random() * (max-min) + min; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function dist2(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }
function angleDelta(a,b){ let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI; if(d<-Math.PI)d+=Math.PI*2; return d; }
function normalizeAngle(a){ while(a<-Math.PI)a+=Math.PI*2; while(a>Math.PI)a-=Math.PI*2; return a; }
function shiftedHeadColor(hex){
  const value=String(hex||'#57d6ff').replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(value))return '#f4fbff';
  let r=parseInt(value.slice(0,2),16)/255,g=parseInt(value.slice(2,4),16)/255,b=parseInt(value.slice(4,6),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(delta){s=delta/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/delta)%6);else if(max===g)h=60*((b-r)/delta+2);else h=60*((r-g)/delta+4);}
  h=(h+18+360)%360;l=clamp(l+.1,0,1);
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(channel=>Math.round((channel+m)*255).toString(16).padStart(2,'0')).join('');
}

function makeSnake({x,y,color,stripeColor=color,glowColor=color,name,isPlayer=false}){
  const angle = rand(-Math.PI,Math.PI);
  const body=[];
  for(let i=0;i<SETTINGS.startSegments;i++) body.push({x:x-Math.cos(angle)*i*SETTINGS.segmentSpacing,y:y-Math.sin(angle)*i*SETTINGS.segmentSpacing});
  return {
    id:nextId++, x,y,angle,targetAngle:angle, color,stripeColor,glowColor,name,isPlayer, alive:true,
    body, desiredSegments:SETTINGS.startSegments, speed:SETTINGS.baseSpeed,
    score:0,kills:0,boost:0,storedPelletPoints:0,massSegments:[],aiTimer:0,aiBias:rand(-0.8,0.8),respawnAt:0
  };
}

function randomWorldPoint(margin=150){ return {x:rand(margin,SETTINGS.worldWidth-margin),y:rand(margin,SETTINGS.worldHeight-margin)}; }
function randomArenaPelletValue(){
  const roll=Math.random();
  if(roll<SETTINGS.tenPointPelletChance)return 10;
  if(roll<SETTINGS.tenPointPelletChance+SETTINGS.fivePointPelletChance)return 5;
  return 1;
}
function pelletRadiusForValue(value){return value>=10?8:value>=5?6:value>=3?5.5:SETTINGS.pelletRadius;}
function makePellet(x=null,y=null,value=null,color=null){
  const p=x==null?randomWorldPoint(30):{x,y};
  const pelletValue=value==null?randomArenaPelletValue():value;
  return {x:p.x,y:p.y,value:pelletValue,r:pelletRadiusForValue(pelletValue),color:color||COLORS[(Math.random()*COLORS.length)|0],pulse:rand(0,Math.PI*2),sway:rand(0,Math.PI*2),swaySpeed:rand(.0012,.0024)};
}
function seedPellets(){ pellets=[]; for(let i=0;i<SETTINGS.pelletCount;i++) pellets.push(makePellet()); }

function spawnAI(){
  const p=randomWorldPoint(400);
  const s=makeSnake({x:p.x,y:p.y,color:COLORS[(Math.random()*COLORS.length)|0],name:AI_NAMES[(Math.random()*AI_NAMES.length)|0]});
  s.desiredSegments=SETTINGS.startSegments+((Math.random()*45)|0);
  while(s.body.length<s.desiredSegments){ const t=s.body[s.body.length-1]; s.body.push({x:t.x,y:t.y}); }
  s.score=Math.max(0,(s.desiredSegments-SETTINGS.startSegments)*5);
  s.storedPelletPoints=s.score;
  s.massSegments=Array.from({length:s.desiredSegments-SETTINGS.startSegments},()=>5);
  snakes.push(s);
}

function initGame(){
  const name=cleanPlayerName(firstNameInput.value);
  if(!name){nameStatus.textContent='Enter a valid first name (maximum 16 characters).';nameStatus.className='formStatus error';firstNameInput.focus();return;}
  currentPlayerName=name;savePlayerName(name);nameStatus.textContent='Saved player: '+name;nameStatus.className='formStatus success';
  snakes=[]; particles=[]; seedPellets(); nextId=1;
  player=makeSnake({x:SETTINGS.worldWidth/2,y:SETTINGS.worldHeight/2,color:currentPlayerColor,stripeColor:currentPlayerStripeColor,glowColor:currentPlayerGlowColor,name:currentPlayerName,isPlayer:true});
  snakes.push(player);
  for(let i=0;i<SETTINGS.aiCount;i++) spawnAI();
  camera.x=player.x; camera.y=player.y; camera.zoom=1;
  running=true; lastTime=performance.now(); gameStartedAt=lastTime; lastPlaytimeSeconds=0; boostDrainProgress=0; deathPending=false; deathEndsAt=0;
  menu.classList.add('hidden'); gameOverPanel.classList.add('hidden'); hud.classList.remove('hidden'); leaderboard.classList.remove('hidden');
  if(matchMedia('(pointer:coarse)').matches) boostBtn.classList.remove('hidden');
  requestAnimationFrame(loop);
}

function setBoost(v){ boosting=v; boostBtn.classList.toggle('active',v); }
startBtn.addEventListener('click',initGame);
restartBtn.addEventListener('click',initGame);
function cleanPlayerColor(value,fallback=DEFAULT_PLAYER_COLOR){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;}
function cleanPlayerName(value){const name=String(value||'').trim().slice(0,16);return name&&/^[A-Za-z0-9 _-]+$/.test(name)?name:'';}
function loadSavedName(){try{return cleanPlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY));}catch{return '';}}
function savePlayerName(value){try{localStorage.setItem(PLAYER_NAME_STORAGE_KEY,value);}catch{}}
function loadSavedColor(key,fallback){try{return cleanPlayerColor(localStorage.getItem(key),fallback);}catch{return fallback;}}
function updatePalettePreview(){
  snakeColorInput.value=currentPlayerColor;snakeStripeColorInput.value=currentPlayerStripeColor;snakeGlowColorInput.value=currentPlayerGlowColor;
  palettePreview.style.background=`linear-gradient(90deg,${currentPlayerColor} 0 38%,${currentPlayerStripeColor} 38% 68%,${currentPlayerGlowColor} 68% 100%)`;
  palettePreview.style.boxShadow=`0 0 7px ${currentPlayerGlowColor}66`;colorStatus.textContent='Color 1 · Color 2 · Subtle glow';
}
function selectPlayerColor(value){currentPlayerColor=cleanPlayerColor(value);try{localStorage.setItem(PLAYER_COLOR_STORAGE_KEY,currentPlayerColor);}catch{}updatePalettePreview();for(const swatch of colorSwatches)swatch.setAttribute('aria-pressed',String(swatch.dataset.color===currentPlayerColor));}
function selectStripeColor(value){currentPlayerStripeColor=cleanPlayerColor(value,DEFAULT_STRIPE_COLOR);try{localStorage.setItem(PLAYER_STRIPE_COLOR_STORAGE_KEY,currentPlayerStripeColor);}catch{}updatePalettePreview();}
function selectGlowColor(value){currentPlayerGlowColor=cleanPlayerColor(value,DEFAULT_GLOW_COLOR);try{localStorage.setItem(PLAYER_GLOW_COLOR_STORAGE_KEY,currentPlayerGlowColor);}catch{}updatePalettePreview();}
for(const swatch of colorSwatches)swatch.addEventListener('click',()=>selectPlayerColor(swatch.dataset.color));
snakeColorInput.addEventListener('input',event=>selectPlayerColor(event.target.value));
snakeStripeColorInput.addEventListener('input',event=>selectStripeColor(event.target.value));
snakeGlowColorInput.addEventListener('input',event=>selectGlowColor(event.target.value));
firstNameInput.addEventListener('input',()=>{firstNameInput.value=firstNameInput.value.slice(0,16);nameStatus.textContent='Maximum 16 characters';nameStatus.className='formStatus';});
boostBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();boostPointerId=e.pointerId;try{boostBtn.setPointerCapture(e.pointerId);}catch{}setBoost(true)});
function releaseBoost(e){if(boostPointerId!==null&&e.pointerId!==boostPointerId)return;boostPointerId=null;setBoost(false);}
boostBtn.addEventListener('pointerup',releaseBoost);
boostBtn.addEventListener('pointercancel',releaseBoost);

window.addEventListener('keydown',e=>{ keys.add(e.key.toLowerCase()); if(e.code==='Space'){e.preventDefault();setBoost(true);} });
window.addEventListener('keyup',e=>{ keys.delete(e.key.toLowerCase()); if(e.code==='Space')setBoost(false); });
app.addEventListener('pointerdown',e=>{
  if(!running||!player?.alive||boostBtn.contains(e.target))return;
  if(e.pointerType==='mouse'){mouseAim={seen:true,x:e.clientX,y:e.clientY};return;}
  if(pointer.active)return;
  e.preventDefault();
  const initialAimDistance=48;
  pointer={active:true,id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,aimX:Math.cos(player.angle)*initialAimDistance,aimY:Math.sin(player.angle)*initialAimDistance};
  try{app.setPointerCapture(e.pointerId);}catch{}
});
app.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse'){if(running)mouseAim={seen:true,x:e.clientX,y:e.clientY};return;}
  if(!pointer.active||e.pointerId!==pointer.id)return;
  e.preventDefault();
  const sensitivity=2.6,dx=(e.clientX-pointer.lastX)*sensitivity,dy=(e.clientY-pointer.lastY)*sensitivity;
  pointer.x=e.clientX;pointer.y=e.clientY;pointer.lastX=e.clientX;pointer.lastY=e.clientY;
  pointer.aimX+=dx;pointer.aimY+=dy;
  const magnitude=Math.hypot(pointer.aimX,pointer.aimY),maximumAimDistance=150;
  if(magnitude>maximumAimDistance){pointer.aimX=pointer.aimX/magnitude*maximumAimDistance;pointer.aimY=pointer.aimY/magnitude*maximumAimDistance;}
});
function releaseSteeringPointer(e){if(pointer.active&&e.pointerId===pointer.id){pointer.active=false;pointer.id=null;}}
window.addEventListener('pointerup',releaseSteeringPointer);
window.addEventListener('pointercancel',releaseSteeringPointer);
window.addEventListener('blur',()=>{pointer.active=false;pointer.id=null;boostPointerId=null;setBoost(false);});

function playerSteering(dt){
  let target=null;
  const left=keys.has('a')||keys.has('arrowleft'), right=keys.has('d')||keys.has('arrowright');
  const up=keys.has('w')||keys.has('arrowup'), down=keys.has('s')||keys.has('arrowdown');
  if(left||right||up||down){
    const dx=(right?1:0)-(left?1:0), dy=(down?1:0)-(up?1:0);
    if(dx||dy) target=Math.atan2(dy,dx);
  } else if(pointer.active){
    if(Math.hypot(pointer.aimX,pointer.aimY)>12)target=Math.atan2(pointer.aimY,pointer.aimX);
  } else if(mouseAim.seen){
    const head=worldToScreen(player.x,player.y),dx=mouseAim.x-head.x,dy=mouseAim.y-head.y;
    if(Math.hypot(dx,dy)>18)target=Math.atan2(dy,dx);
  }
  if(target!=null){player.targetAngle=target;player.angle=target;}
}

function aiSteering(s,dt){
  s.aiTimer-=dt;
  let target=s.angle;
  const margin=260;
  if(s.x<margin) target=0;
  else if(s.x>SETTINGS.worldWidth-margin) target=Math.PI;
  else if(s.y<margin) target=Math.PI/2;
  else if(s.y>SETTINGS.worldHeight-margin) target=-Math.PI/2;
  else {
    let nearest=null, best=Infinity;
    for(let i=0;i<pellets.length;i+=3){ const p=pellets[i], d=dist2(s,p); if(d<best){best=d;nearest=p;} }
    if(nearest) target=Math.atan2(nearest.y-s.y,nearest.x-s.x);
    target += s.aiBias*0.25;
    for(const other of snakes){
      if(other===s||!other.alive)continue;
      for(let i=5;i<other.body.length;i+=8){
        const b=other.body[i], dx=b.x-s.x,dy=b.y-s.y,d2=dx*dx+dy*dy;
        if(d2<250*250){ const away=Math.atan2(-dy,-dx); target=normalizeAngle(target+angleDelta(target,away)*0.85); break; }
      }
    }
  }
  if(s.aiTimer<=0){s.aiTimer=rand(.35,1.1);s.aiBias=rand(-1,1);}
  s.targetAngle=target;
  const maxTurn=(SETTINGS.turnSpeed*0.72)*dt;
  s.angle=normalizeAngle(s.angle+clamp(angleDelta(s.angle,s.targetAngle),-maxTurn,maxTurn));
  const wantsBoost=s.desiredSegments>SETTINGS.minimumBoostSegments+3 && Math.random()<0.006;
  s.speed=wantsBoost?SETTINGS.boostSpeed*0.9:SETTINGS.baseSpeed*rand(.9,1.05);
}

function moveSnake(s,dt){
  const boostNow=s.isPlayer && boosting && s.desiredSegments>SETTINGS.minimumBoostSegments;
  if(s.isPlayer){
    s.speed=boostNow?SETTINGS.boostSpeed:SETTINGS.baseSpeed;
    if(boostNow){
      boostDrainProgress+=SETTINGS.boostSegmentDrainRate*dt;
      while(boostDrainProgress>=1&&s.desiredSegments>SETTINGS.minimumBoostSegments){
        s.desiredSegments--;boostDrainProgress--;
        s.storedPelletPoints=Math.max(0,s.storedPelletPoints-(s.massSegments.shift()||0));
      }
      if(s.desiredSegments<=SETTINGS.minimumBoostSegments)setBoost(false);
    } else boostDrainProgress=0;
  }
  const oldX=s.x, oldY=s.y;
  s.x+=Math.cos(s.angle)*s.speed*dt; s.y+=Math.sin(s.angle)*s.speed*dt;
  s.x=clamp(s.x,0,SETTINGS.worldWidth); s.y=clamp(s.y,0,SETTINGS.worldHeight);
  const moved=Math.hypot(s.x-oldX,s.y-oldY);
  if(moved>0.1){
    const previous=s.body[1]||s.body[0];
    if(!previous||Math.hypot(s.x-previous.x,s.y-previous.y)>=SETTINGS.segmentSpacing)s.body.unshift({x:s.x,y:s.y});
    else s.body[0]={x:s.x,y:s.y};
    while(s.body.length>s.desiredSegments)s.body.pop();
  }
}

function eatPellets(s){
  for(let i=pellets.length-1;i>=0;i--){
    const p=pellets[i],eatRadius=SETTINGS.headRadius+p.r; if(dist2(s,p)<eatRadius*eatRadius){
      pellets.splice(i,1);s.desiredSegments+=SETTINGS.growthPerPellet;s.score+=p.value;s.storedPelletPoints+=p.value;
      for(let segment=0;segment<SETTINGS.growthPerPellet;segment++)s.massSegments.push(p.value/SETTINGS.growthPerPellet);
      if(s.isPlayer){ for(let k=0;k<4;k++) particles.push({x:p.x,y:p.y,vx:rand(-45,45),vy:rand(-45,45),life:.35,color:p.color}); }
    }
  }
}

function attractNearbyPellets(dt){
  if(!player?.alive)return;
  for(const p of pellets){
    const eatRadius=SETTINGS.headRadius+p.r;
    const magnetRadius=eatRadius+p.r*2*SETTINGS.pelletMagnetExtraDiameter;
    const dx=player.x-p.x,dy=player.y-p.y,distance=Math.hypot(dx,dy);
    if(distance>eatRadius&&distance<magnetRadius){
      const pull=Math.min(distance-eatRadius,SETTINGS.pelletMagnetSpeed*dt);
      p.x+=dx/distance*pull;p.y+=dy/distance*pull;
    }
  }
}

function deathDropValues(totalPoints){
  const values=[];let remaining=Math.max(0,Math.round(totalPoints));
  while(remaining>0){const value=Math.min(20,remaining);values.push(value);remaining-=value;}
  return values;
}

function updateTransientEffects(dt){
  const damping=Math.exp(-3.8*dt);
  for(const p of pellets){
    if(!p.deathDrop||(!p.vx&&!p.vy))continue;
    p.x=clamp(p.x+p.vx*dt,10,SETTINGS.worldWidth-10);p.y=clamp(p.y+p.vy*dt,10,SETTINGS.worldHeight-10);
    p.vx*=damping;p.vy*=damping;
  }
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
}

function killSnake(victim,killer=null){
  if(!victim.alive)return;
  victim.alive=false;
  if(killer&&killer!==victim){
    killer.kills++;killer.score+=100;killer.desiredSegments+=4;killer.storedPelletPoints+=100;
    for(let segment=0;segment<4;segment++)killer.massSegments.push(25);
  }
  const dropValues=deathDropValues(victim.storedPelletPoints),colors=[victim.color,victim.stripeColor||victim.color,victim.glowColor||victim.color];
  for(let i=0;i<dropValues.length;i++){
    const bodyIndex=Math.min(victim.body.length-1,Math.floor((i+.5)/Math.max(1,dropValues.length)*victim.body.length)),b=victim.body[bodyIndex]||{x:victim.x,y:victim.y},value=dropValues[i];
    const orb=makePellet(b.x+rand(-5,5),b.y+rand(-5,5),value,colors[i%colors.length]);
    const valueRatio=(value-1)/19;orb.r=SETTINGS.deathPelletMinRadius+(SETTINGS.deathPelletMaxRadius-SETTINGS.deathPelletMinRadius)*valueRatio;orb.deathDrop=true;pellets.push(orb);
    const outward=Math.atan2(b.y-victim.y,b.x-victim.x)+rand(-.72,.72),speed=rand(80,175);orb.vx=Math.cos(outward)*speed;orb.vy=Math.sin(outward)*speed;
  }
  if(victim.isPlayer){
    deathPending=true;deathEndsAt=performance.now()+SETTINGS.deathSceneDuration;
    lastPlaytimeSeconds=Math.max(1,Math.floor((performance.now()-gameStartedAt)/1000));
    setBoost(false);boostBtn.classList.add('hidden');
  }
  else victim.respawnAt=performance.now()+SETTINGS.aiRespawnDelay;
}

function collisions(){
  for(const s of snakes){
    if(!s.alive)continue;
    if(s.x<=SETTINGS.headRadius||s.y<=SETTINGS.headRadius||s.x>=SETTINGS.worldWidth-SETTINGS.headRadius||s.y>=SETTINGS.worldHeight-SETTINGS.headRadius){ killSnake(s); continue; }
    for(const other of snakes){
      if(!other.alive)continue;
      if(other===s&&s.isPlayer)continue;
      const start=other===s?14:3;
      for(let i=start;i<other.body.length;i+=2){
        const b=other.body[i], dx=s.x-b.x,dy=s.y-b.y;
        const hit=SETTINGS.headRadius+SETTINGS.bodyRadius-2;
        if(dx*dx+dy*dy<hit*hit){ killSnake(s,other===s?null:other); break; }
      }
      if(!s.alive)break;
    }
  }
}

function respawnAI(){
  const now=performance.now();
  for(let i=snakes.length-1;i>=0;i--){ const s=snakes[i]; if(!s.isPlayer&&!s.alive&&now>=s.respawnAt){ snakes.splice(i,1); spawnAI(); } }
}

function update(dt){
  if(!player)return;
  if(!player.alive){updateTransientEffects(dt);return;}
  playerSteering(dt);
  for(const s of snakes){ if(!s.alive)continue; if(!s.isPlayer)aiSteering(s,dt); moveSnake(s,dt); if(s.isPlayer)attractNearbyPellets(dt); eatPellets(s); }
  collisions(); respawnAI();
  while(pellets.length<SETTINGS.pelletCount)pellets.push(makePellet());
  updateTransientEffects(dt);
  camera.x+=(player.x-camera.x)*Math.min(1,dt*6); camera.y+=(player.y-camera.y)*Math.min(1,dt*6);
  const targetZoom=clamp(1-(player.desiredSegments-SETTINGS.startSegments)/500,.64,1);
  camera.zoom+=(targetZoom-camera.zoom)*Math.min(1,dt*2.5);
  updateHud();
}

function updateHud(){
  scoreEl.textContent=player.score;
  lengthEl.textContent=player.desiredSegments;
  killsEl.textContent=player.kills;
  const availableBoost=Math.max(0,player.desiredSegments-SETTINGS.minimumBoostSegments);
  const boostPercent=clamp(availableBoost/SETTINGS.boostFullSegments*100,0,100);
  player.boost=availableBoost;boostLengthEl.textContent=availableBoost;boostFill.style.width=boostPercent+'%';
  const ranked=snakes.filter(s=>s.alive).sort((a,b)=>b.desiredSegments-a.desiredSegments).slice(0,8);
  leadersEl.innerHTML=ranked.map(s=>`<li${s.isPlayer?' style="color:#63ff9b;font-weight:900"':''}>${s.name} · ${s.desiredSegments}</li>`).join('');
}

function worldToScreen(x,y){ return {x:(x-camera.x)*camera.zoom+width/2,y:(y-camera.y)*camera.zoom+height/2}; }
function visible(x,y,pad=60){ const p=worldToScreen(x,y); return p.x>-pad&&p.y>-pad&&p.x<width+pad&&p.y<height+pad; }

function drawBackground(){
  ctx.fillStyle='#03060b';ctx.fillRect(0,0,width,height);
  const radius=38*camera.zoom,hStep=Math.sqrt(3)*radius,vStep=1.5*radius;
  const worldLeft=camera.x-width/(2*camera.zoom)-radius*2,worldTop=camera.y-height/(2*camera.zoom)-radius*2;
  const firstRow=Math.floor(worldTop/(1.5*38)),lastRow=firstRow+Math.ceil(height/vStep)+4;
  ctx.beginPath();
  for(let row=firstRow;row<=lastRow;row++){
    const cy=row*1.5*38,startCol=Math.floor((worldLeft-(row&1)*Math.sqrt(3)*19)/(Math.sqrt(3)*38));
    for(let col=startCol;col<startCol+Math.ceil(width/hStep)+4;col++){
      const cx=col*Math.sqrt(3)*38+(row&1)*Math.sqrt(3)*19,s=worldToScreen(cx,cy);
      for(let side=0;side<6;side++){const a=Math.PI/6+side*Math.PI/3,x=s.x+Math.cos(a)*radius,y=s.y+Math.sin(a)*radius;if(side===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();
    }
  }
  ctx.fillStyle='#0a111d';ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.82)';ctx.lineWidth=Math.max(3.2,5.2*camera.zoom);ctx.stroke();
  ctx.strokeStyle='rgba(77,126,160,.44)';ctx.lineWidth=Math.max(.85,1.35*camera.zoom);ctx.stroke();
  const tl=worldToScreen(0,0), br=worldToScreen(SETTINGS.worldWidth,SETTINGS.worldHeight);
  ctx.strokeStyle='rgba(255,80,95,.5)';ctx.lineWidth=3;ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
}

function getPelletSprite(p){
  const radius=Math.max(2,Math.round(p.r*2)/2),tier=p.deathDrop?'drop':p.value>=10?'large':p.value>=5?'medium':'small';
  const key=`${p.color}:${radius}:${tier}`;
  if(pelletSpriteCache.has(key))return pelletSpriteCache.get(key);
  const glow=tier==='drop'?5:tier==='large'?4:tier==='medium'?3:2,size=Math.ceil((radius+glow+2)*2),sprite=document.createElement('canvas'),spriteCtx=sprite.getContext('2d');
  sprite.width=size;sprite.height=size;const center=size/2;
  const halo=spriteCtx.createRadialGradient(center,center,radius*.65,center,center,radius+glow);halo.addColorStop(0,p.color+'32');halo.addColorStop(.45,p.color+'18');halo.addColorStop(1,p.color+'00');
  spriteCtx.fillStyle=halo;spriteCtx.beginPath();spriteCtx.arc(center,center,radius+glow,0,Math.PI*2);spriteCtx.fill();
  spriteCtx.fillStyle=p.color;spriteCtx.beginPath();spriteCtx.arc(center,center,radius,0,Math.PI*2);spriteCtx.fill();
  spriteCtx.fillStyle='rgba(255,255,255,.5)';spriteCtx.beginPath();spriteCtx.arc(center-radius*.28,center-radius*.3,Math.max(.7,radius*.16),0,Math.PI*2);spriteCtx.fill();
  pelletSpriteCache.set(key,sprite);return sprite;
}

function drawPellets(time){
  for(const p of pellets){
    if(!visible(p.x,p.y,28))continue;const base=worldToScreen(p.x,p.y),swayAmount=(p.deathDrop?1.4:2.8)*camera.zoom;
    const s={x:base.x+Math.sin(time*p.swaySpeed+p.sway)*swayAmount,y:base.y+Math.cos(time*p.swaySpeed*.82+p.sway)*swayAmount};
    const pulse=1+Math.sin(time*.004+p.pulse)*.08,sprite=getPelletSprite(p),scale=camera.zoom*pulse;
    ctx.drawImage(sprite,s.x-sprite.width*scale/2,s.y-sprite.height*scale/2,sprite.width*scale,sprite.height*scale);
    if(!p.deathDrop&&p.value>=5){ctx.beginPath();ctx.strokeStyle=p.value>=10?'rgba(255,255,255,.72)':'rgba(255,255,255,.42)';ctx.lineWidth=(p.value>=10?2:1)*camera.zoom;ctx.arc(s.x,s.y,(p.r+2)*camera.zoom*pulse,0,Math.PI*2);ctx.stroke();}
  }
}

function drawSnake(s){
  if(!s.alive)return;
  ctx.save();
  const growth=clamp((s.desiredSegments-SETTINGS.startSegments)/180,0,1),baseRadius=SETTINGS.bodyRadius+growth*3.2;
  const sampleStep=Math.max(2,Math.ceil(s.body.length/140)),points=[];
  for(let i=0;i<s.body.length;i+=sampleStep){const bodyPoint=s.body[i];if(visible(bodyPoint.x,bodyPoint.y,baseRadius+12))points.push(worldToScreen(bodyPoint.x,bodyPoint.y));}
  if(points.length>1){
    const bodyPath=new Path2D();bodyPath.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)bodyPath.lineTo(points[i].x,points[i].y);
    const tail=points[points.length-1],bodyGradient=ctx.createLinearGradient(points[0].x,points[0].y,tail.x,tail.y);
    bodyGradient.addColorStop(0,s.color);bodyGradient.addColorStop(1,s.stripeColor||s.color);
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=bodyGradient;ctx.lineWidth=baseRadius*2*camera.zoom;ctx.shadowColor=s.glowColor||s.color;ctx.shadowBlur=s.isPlayer?3:1;ctx.stroke(bodyPath);
    ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=Math.max(1.2,baseRadius*.28*camera.zoom);ctx.stroke(bodyPath);
  }
  const h=worldToScreen(s.x,s.y), r=(SETTINGS.headRadius+growth*3.5)*camera.zoom;
  ctx.beginPath();ctx.fillStyle=shiftedHeadColor(s.color);ctx.shadowColor=s.glowColor||s.color;ctx.shadowBlur=s.isPlayer?5:2;ctx.arc(h.x,h.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.beginPath();ctx.strokeStyle=s.stripeColor||s.color;ctx.lineWidth=Math.max(2,2.5*camera.zoom);ctx.arc(h.x,h.y,r*.72,0,Math.PI*2);ctx.stroke();
  const fx=Math.cos(s.angle),fy=Math.sin(s.angle), sx=-fy,sy=fx;
  for(const side of [-1,1]){ const ex=h.x+(fx*5+sx*side*4)*camera.zoom,ey=h.y+(fy*5+sy*side*4)*camera.zoom;ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(ex,ey,2.5*camera.zoom,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#081018';ctx.arc(ex+fx*camera.zoom,ey+fy*camera.zoom,1.2*camera.zoom,0,Math.PI*2);ctx.fill(); }
  if(!s.isPlayer){ctx.font=`${Math.max(9,11*camera.zoom)}px Arial`;ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(s.name,h.x,h.y-r-9);}
  ctx.restore();
}

function drawParticles(){for(const p of particles){const s=worldToScreen(p.x,p.y);ctx.globalAlpha=clamp(p.life/.35,0,1);ctx.fillStyle=p.color;ctx.fillRect(s.x-2,s.y-2,4,4);}ctx.globalAlpha=1;}
function drawMiniMap(){
  const mw=radarCanvas.width,mh=radarCanvas.height;radarCtx.clearRect(0,0,mw,mh);radarCtx.fillStyle='rgba(2,7,13,.96)';radarCtx.fillRect(0,0,mw,mh);radarCtx.strokeStyle='rgba(87,214,255,.35)';radarCtx.strokeRect(.5,.5,mw-1,mh-1);
  for(const s of snakes){if(!s.alive)continue;radarCtx.fillStyle=s.isPlayer?currentPlayerGlowColor:'rgba(87,168,255,.78)';const size=s.isPlayer?5:3;radarCtx.fillRect(s.x/SETTINGS.worldWidth*mw-size/2,s.y/SETTINGS.worldHeight*mh-size/2,size,size);}
}

function formatPlaytime(seconds){const safe=Math.max(0,Number(seconds)||0);return `${Math.floor(safe/60)}:${String(Math.floor(safe%60)).padStart(2,'0')}`;}
function formatScoreDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleDateString(undefined,{year:'2-digit',month:'2-digit',day:'2-digit'});}
function parsePlayerPalette(value){const colors=String(value||'').split(',').filter(color=>/^#[0-9a-f]{6}$/i.test(color));return colors.length===3?colors:[colors[0]||'#ff405f',colors[0]||'#ffcf4d',colors[0]||'#57d6ff'];}
function renderOnlineScores(){
  for(const body of [menuScores,resultScores]){
    body.replaceChildren();
    if(!onlineScores.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=7;cell.className='emptyScore';cell.textContent='No SOLO scores yet — take first place!';row.appendChild(cell);body.appendChild(row);continue;}
    onlineScores.forEach((entry,index)=>{const row=document.createElement('tr');const values=[index+1,entry.player_name,entry.score,entry.kills,entry.length,formatPlaytime(entry.playtime_seconds),formatScoreDate(entry.created_at)];for(const [cellIndex,value] of values.entries()){const cell=document.createElement('td');cell.textContent=String(value);if(cellIndex===1){const palette=parsePlayerPalette(entry.player_color);cell.style.background=`linear-gradient(90deg,${palette.join(',')})`;cell.style.backgroundClip='text';cell.style.webkitBackgroundClip='text';cell.style.color='transparent';cell.style.textShadow=`0 0 9px ${palette[2]}`;}row.appendChild(cell);}body.appendChild(row);});
  }
}
async function loadOnlineScores(){
  scoreLoadStatus.textContent='Loading scores...';
  try{const response=await fetch('/api/highscores/snake-arena-solo',{cache:'no-store'});if(!response.ok)throw new Error('Score load failed: '+response.status);onlineScores=await response.json();renderOnlineScores();scoreLoadStatus.textContent=onlineScores.length?'Worldwide SOLO ranking':'Be the first player on the board';}
  catch(error){console.error(error);onlineScores=[];renderOnlineScores();scoreLoadStatus.textContent='Scores are temporarily unavailable';}
}
async function saveOnlineScore(){
  saveStatus.textContent='Saving score...';saveStatus.className='formStatus';
  try{const response=await fetch('/api/highscores/snake-arena-solo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({player_name:currentPlayerName,player_color:[currentPlayerColor,currentPlayerStripeColor,currentPlayerGlowColor].join(','),score:player.score,kills:player.kills,length:player.desiredSegments,playtime_seconds:lastPlaytimeSeconds})});if(!response.ok)throw new Error('Score save failed: '+response.status);saveStatus.textContent='Score saved online';saveStatus.className='formStatus success';await loadOnlineScores();}
  catch(error){console.error(error);saveStatus.textContent='Score could not be saved';saveStatus.className='formStatus error';}
}

function render(time){drawBackground();drawPellets(time);const sorted=snakes.filter(s=>s.alive).sort((a,b)=>a.isPlayer?1:b.isPlayer?-1:0);for(const s of sorted)drawSnake(s);drawParticles();drawMiniMap();}

function loop(now){
  if(!running)return;
  const dt=Math.min((now-lastTime)/1000,.033);lastTime=now;
  update(dt);render(now);
  if(deathPending&&now>=deathEndsAt){endGame();return;}
  if(running)requestAnimationFrame(loop);
}

function endGame(){
  running=false;deathPending=false;deathEndsAt=0;setBoost(false);
  if(!lastPlaytimeSeconds)lastPlaytimeSeconds=Math.max(1,Math.floor((performance.now()-gameStartedAt)/1000));
  finalScore.textContent=player.score;finalKills.textContent=player.kills;finalLength.textContent=player.desiredSegments;finalPlaytime.textContent=formatPlaytime(lastPlaytimeSeconds);
  hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');gameOverPanel.classList.remove('hidden');
  void saveOnlineScore();
}

render(0);
currentPlayerColor=loadSavedColor(PLAYER_COLOR_STORAGE_KEY,DEFAULT_PLAYER_COLOR);
currentPlayerStripeColor=loadSavedColor(PLAYER_STRIPE_COLOR_STORAGE_KEY,DEFAULT_STRIPE_COLOR);
currentPlayerGlowColor=loadSavedColor(PLAYER_GLOW_COLOR_STORAGE_KEY,DEFAULT_GLOW_COLOR);
currentPlayerName=loadSavedName();
if(currentPlayerName){firstNameInput.value=currentPlayerName;nameStatus.textContent='Saved player: '+currentPlayerName;nameStatus.className='formStatus success';}
selectPlayerColor(currentPlayerColor);selectStripeColor(currentPlayerStripeColor);selectGlowColor(currentPlayerGlowColor);
void loadOnlineScores();
console.info(`Snake Arena v${SNAKE_ARENA_VERSION}`);
