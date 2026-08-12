const SNAKE_ARENA_VERSION = '0.16';
const PLAYER_NAME_STORAGE_KEY = 'snakeArenaFirstName';
const PLAYER_COLOR_STORAGE_KEY = 'snakeArenaPlayerColor';
const PLAYER_STRIPE_COLOR_STORAGE_KEY = 'snakeArenaStripeColor';
const PLAYER_GLOW_COLOR_STORAGE_KEY = 'snakeArenaGlowColor';
const DEFAULT_PLAYER_COLOR = '#ff405f';
const DEFAULT_STRIPE_COLOR = '#ffcf4d';
const DEFAULT_GLOW_COLOR = '#57d6ff';
const ONLINE_SESSION_STORAGE_KEY = 'snakeArenaOnlineSession';
const MAX_ONLINE_PLAYERS = 4;
const MULTIPLAYER_SERVER_URL = window.SNAKE_ARENA_SERVER_URL || (location.hostname === 'localhost' ? 'http://localhost:2567' : 'https://snake-arena-realtime-production.up.railway.app');

const SETTINGS = {
  worldWidth: 4200,
  worldHeight: 4200,
  pelletCount: 520,
  aiCount: 18,
  startSegments: 34,
  segmentSpacing: 9,
  baseSpeed: 150,
  boostSpeed: 245,
  turnSpeed: 3.5,
  playerTurnSpeed: 7.2,
  touchDeadZone: 12,
  touchFullTurnDistance: 78,
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
  networkSyncInterval: 0.05
};

const DEATH_SEQUENCE_MS = 2450;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const gameOverPanel = document.getElementById('gameOver');
const startBtn = document.getElementById('startBtn');
const menuBtn = document.getElementById('menuBtn');
const hud = document.getElementById('hud');
const leaderboard = document.getElementById('leaderboard');
const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const killsEl = document.getElementById('kills');
const livesEl = document.getElementById('lives');
const lifeProgressEl = document.getElementById('lifeProgress');
const playerNameEl = document.getElementById('playerName');
const snakeCountEl = document.getElementById('snakeCount');
const boostFill = document.getElementById('boostFill');
const leadersEl = document.getElementById('leaders');
const boostBtn = document.getElementById('boostBtn');
const finalScore = document.getElementById('finalScore');
const finalKills = document.getElementById('finalKills');
const finalLength = document.getElementById('finalLength');
const finalPlaytime = document.getElementById('finalPlaytime');
const firstNameInput = document.getElementById('firstName');
const clearNameBtn = document.getElementById('clearNameBtn');
const snakeColorInput = document.getElementById('snakeColor');
const snakeStripeColorInput = document.getElementById('snakeStripeColor');
const snakeGlowColorInput = document.getElementById('snakeGlowColor');
const palettePreview = document.getElementById('palettePreview');
const colorStatus = document.getElementById('colorStatus');
const colorSwatches = [...document.querySelectorAll('.colorSwatch')];
const nameStatus = document.getElementById('nameStatus');
const saveStatus = document.getElementById('saveStatus');
const scoreLoadStatus = document.getElementById('scoreLoadStatus');
const menuScores = document.getElementById('menuScores');
const resultScores = document.getElementById('resultScores');
const networkStatus = document.getElementById('networkStatus');
const onlineCountEl = document.getElementById('onlineCount');
const onlineRoleEl = document.getElementById('onlineRole');
const queuePanel = document.getElementById('queuePanel');
const queuePositionEl = document.getElementById('queuePosition');
const queueStatusEl = document.getElementById('queueStatus');
const leaveQueueBtn = document.getElementById('leaveQueueBtn');

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
let pointer = { active:false, id:null, startX:0, startY:0, x:0, y:0 };
let mouseAim = { seen:false, x:0, y:0 };
let boostPointerId = null;
let boosting = false;
let camera = { x: SETTINGS.worldWidth / 2, y: SETTINGS.worldHeight / 2, zoom: 1 };
let nextId = 1;
let currentPlayerName = '';
let currentPlayerColor = DEFAULT_PLAYER_COLOR;
let currentPlayerStripeColor = DEFAULT_STRIPE_COLOR;
let currentPlayerGlowColor = DEFAULT_GLOW_COLOR;
let onlineScores = [];
let gameStartedAt = 0;
let lastPlaytimeSeconds = 0;
let dying = false;
let deathEndsAt = 0;
let deathOrbs = [];
let networkInputAngle = 0;
let multiplayer = {
  client:null,room:null,sessionId:'',joined:false,active:false,queued:false,slot:0,
  syncing:false,syncElapsed:0,players:[],waitTimer:null,deathPending:false,failures:0,
  intentionalLeave:false,authoritativeResult:null
};

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
function radiusGrowth(s){ return Math.min(SETTINGS.maxRadiusGrowth,Math.max(0,s.desiredSegments-SETTINGS.startSegments)/14); }
function bodyRadiusFor(s){ return SETTINGS.bodyRadius+radiusGrowth(s); }
function headRadiusFor(s){ return SETTINGS.headRadius+radiusGrowth(s)*.82; }

function getOnlineSessionId(){
  try{
    const saved=sessionStorage.getItem(ONLINE_SESSION_STORAGE_KEY);
    if(saved&&/^[a-f0-9-]{24,64}$/i.test(saved))return saved;
    const created=crypto.randomUUID();sessionStorage.setItem(ONLINE_SESSION_STORAGE_KEY,created);return created;
  }catch{return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');}
}

function makeSnake({x,y,color,stripeColor=color,glowColor=color,name,isPlayer=false}){
  const id=nextId++;
  const angle = rand(-Math.PI,Math.PI);
  const body=[];
  for(let i=0;i<SETTINGS.startSegments;i++) body.push({x:x-Math.cos(angle)*i*SETTINGS.segmentSpacing,y:y-Math.sin(angle)*i*SETTINGS.segmentSpacing});
  return {
    id,networkId:'snake-'+id,sessionId:null,isHuman:isPlayer,isNetworkProxy:false,
    x,y,angle,targetAngle:angle, color,stripeColor,glowColor,name,isPlayer, alive:true,
    body, desiredSegments:SETTINGS.startSegments, speed:SETTINGS.baseSpeed,
    score:0,kills:0,extraLives:0,phaseTime:0,lifeFlash:0,boost:100,pelletProgress:0,growthFlash:0,aiTimer:0,aiBias:rand(-0.8,0.8),respawnAt:0
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
  return {x:p.x,y:p.y,value:pelletValue,r:pelletRadiusForValue(pelletValue),color:color||COLORS[(Math.random()*COLORS.length)|0],pulse:rand(0,Math.PI*2)};
}
function seedPellets(){ pellets=[]; for(let i=0;i<SETTINGS.pelletCount;i++) pellets.push(makePellet()); }

function spawnAI(){
  const p=randomWorldPoint(400);
  const s=makeSnake({x:p.x,y:p.y,color:COLORS[(Math.random()*COLORS.length)|0],name:AI_NAMES[(Math.random()*AI_NAMES.length)|0]});
  s.desiredSegments=SETTINGS.startSegments+((Math.random()*45)|0);
  while(s.body.length<s.desiredSegments){ const t=s.body[s.body.length-1]; s.body.push({x:t.x,y:t.y}); }
  s.score=Math.max(0,(s.desiredSegments-SETTINGS.startSegments)*5);
  snakes.push(s);
}

function initGame(){
  snakes=[]; particles=[]; deathOrbs=[]; dying=false; deathEndsAt=0; seedPellets(); nextId=1;
  keys.clear();pointer={active:false,id:null,startX:0,startY:0,x:0,y:0};mouseAim.seen=false;boostPointerId=null;setBoost(false);
  player=makeSnake({x:SETTINGS.worldWidth/2,y:SETTINGS.worldHeight/2,color:currentPlayerColor,stripeColor:currentPlayerStripeColor,glowColor:currentPlayerGlowColor,name:currentPlayerName,isPlayer:true});
  player.sessionId=multiplayer.sessionId;player.networkId='human-'+multiplayer.sessionId;player.isHuman=true;
  networkInputAngle=player.angle;
  snakes.push(player);
  for(let i=0;i<SETTINGS.aiCount;i++) spawnAI();
  camera.x=player.x; camera.y=player.y; camera.zoom=1;
  gameStartedAt=performance.now();lastPlaytimeSeconds=0;
  running=true; lastTime=performance.now();
  menu.classList.add('hidden'); gameOverPanel.classList.add('hidden'); hud.classList.remove('hidden'); leaderboard.classList.remove('hidden');
  if(matchMedia('(pointer:coarse)').matches) boostBtn.classList.remove('hidden');
  requestAnimationFrame(loop);
}

function setBoost(v){ boosting=v; boostBtn.classList.toggle('active',v); }
function cleanFirstName(value){
  const name=String(value||'').trim().slice(0,16);
  return name && /^[A-Za-z0-9 _-]+$/.test(name) ? name : '';
}
function loadSavedName(){
  try{return cleanFirstName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY));}catch{return '';}
}
function savePlayerName(name){
  try{localStorage.setItem(PLAYER_NAME_STORAGE_KEY,name);}catch{}
}
function cleanPlayerColor(value,fallback=DEFAULT_PLAYER_COLOR){
  return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;
}
function loadSavedColor(key,fallback){
  try{return cleanPlayerColor(localStorage.getItem(key),fallback);}catch{return fallback;}
}
function updatePalettePreview(){
  snakeColorInput.value=currentPlayerColor;snakeStripeColorInput.value=currentPlayerStripeColor;snakeGlowColorInput.value=currentPlayerGlowColor;
  palettePreview.style.background=`linear-gradient(90deg,${currentPlayerColor} 0 38%,${currentPlayerStripeColor} 38% 68%,${currentPlayerGlowColor} 68% 100%)`;
  palettePreview.style.boxShadow=`0 0 18px ${currentPlayerGlowColor}`;
  colorStatus.textContent='Main · Stripe · Glow';
}
function selectPlayerColor(value){
  currentPlayerColor=cleanPlayerColor(value);snakeColorInput.value=currentPlayerColor;
  try{localStorage.setItem(PLAYER_COLOR_STORAGE_KEY,currentPlayerColor);}catch{}
  updatePalettePreview();
  for(const swatch of colorSwatches)swatch.setAttribute('aria-pressed',String(swatch.dataset.color===currentPlayerColor));
}
function selectStripeColor(value){
  currentPlayerStripeColor=cleanPlayerColor(value,DEFAULT_STRIPE_COLOR);
  try{localStorage.setItem(PLAYER_STRIPE_COLOR_STORAGE_KEY,currentPlayerStripeColor);}catch{}
  updatePalettePreview();
}
function selectGlowColor(value){
  currentPlayerGlowColor=cleanPlayerColor(value,DEFAULT_GLOW_COLOR);
  try{localStorage.setItem(PLAYER_GLOW_COLOR_STORAGE_KEY,currentPlayerGlowColor);}catch{}
  updatePalettePreview();
}
function parsePlayerPalette(value){
  const colors=String(value||'').split(',');
  if(colors.length===3&&colors.every(color=>/^#[0-9a-f]{6}$/i.test(color)))return colors.map(color=>color.toLowerCase());
  const main=cleanPlayerColor(colors[0]||'#9aa6b8','#9aa6b8');return [main,main,main];
}
function clearSavedName(){
  try{localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);}catch{}
  currentPlayerName='';firstNameInput.value='';playerNameEl.textContent='—';
  nameStatus.textContent='Saved name cleared';nameStatus.className='formStatus';firstNameInput.focus();
}
function currentPalette(){return [currentPlayerColor,currentPlayerStripeColor,currentPlayerGlowColor].join(',');}

function updateOnlineMeta(membership={}){
  multiplayer.joined=true;multiplayer.slot=Number(membership.slot)||0;multiplayer.queued=membership.status==='queued';
  multiplayer.active=membership.status==='active';
  const onlineCount=Math.max(0,Number(membership.active_count)||0);
  const maximum=Math.max(1,Number(membership.max_players)||MAX_ONLINE_PLAYERS);
  onlineCountEl.textContent=onlineCount+'/'+maximum;
  onlineRoleEl.textContent=multiplayer.active?'SERVER':'QUEUE';
  networkStatus.textContent=onlineCount+'/'+maximum+' ONLINE · '+(multiplayer.active?'RAILWAY REALTIME CONNECTED':'QUEUE POSITION '+(membership.queue_position||1));
}

function showWaiting(membership={},connecting=false){
  menu.classList.add('hidden');queuePanel.classList.remove('hidden');
  const position=membership.queue_position||1;
  queuePositionEl.textContent=connecting?'SYNC':('#'+position);
  queueStatusEl.textContent=connecting?'Connecting to the Railway realtime server…':'All 4 online slots are occupied. You will enter automatically.';
}

function handleMembership(membership){
  updateOnlineMeta(membership);
  if(multiplayer.queued)showWaiting(membership,false);
  else if(!running)showWaiting(membership,true);
}

async function joinOnlineArena(){
  if(!window.Colyseus?.Client)throw new Error('Realtime client could not be loaded.');
  showWaiting({},true);
  multiplayer.intentionalLeave=false;multiplayer.authoritativeResult=null;multiplayer.deathPending=false;
  multiplayer.client=new window.Colyseus.Client(MULTIPLAYER_SERVER_URL);
  const room=await multiplayer.client.joinOrCreate('snake_arena',{playerName:currentPlayerName,palette:currentPalette()});
  multiplayer.room=room;multiplayer.sessionId=room.sessionId;multiplayer.joined=true;
  room.onMessage('membership',handleMembership);
  room.onMessage('snapshot',snapshot=>{
    if(Number.isFinite(Number(snapshot.o))){onlineCountEl.textContent=Number(snapshot.o)+'/'+(Number(snapshot.m)||MAX_ONLINE_PLAYERS);}
    if(!multiplayer.active)return;
    if(!running){if(initGuestGame(snapshot))queuePanel.classList.add('hidden');}
    else applyGuestSnapshot(snapshot,false);
  });
  room.onMessage('game_over',result=>{multiplayer.authoritativeResult=result||null;});
  room.onError((_code,message)=>{console.error('Snake Arena realtime error:',message);});
  room.onLeave(()=>{
    const unexpected=!multiplayer.intentionalLeave;
    multiplayer.room=null;multiplayer.joined=false;multiplayer.active=false;multiplayer.queued=false;
    if(unexpected){
      running=false;setBoost(false);hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');queuePanel.classList.add('hidden');gameOverPanel.classList.add('hidden');menu.classList.remove('hidden');
      networkStatus.textContent='REALTIME CONNECTION LOST · PRESS START TO RECONNECT';
      nameStatus.textContent='The Railway game server connection was interrupted.';nameStatus.className='formStatus error';
    }
  });
  room.send('ready');
}

async function leaveMultiplayer(){
  clearTimeout(multiplayer.waitTimer);multiplayer.waitTimer=null;
  multiplayer.intentionalLeave=true;
  const room=multiplayer.room;multiplayer.room=null;
  if(room){try{await room.leave(true);}catch{}}
  multiplayer.client=null;multiplayer.joined=false;multiplayer.active=false;multiplayer.queued=false;multiplayer.slot=0;multiplayer.players=[];multiplayer.syncElapsed=0;multiplayer.deathPending=false;
}

async function startFromMenu(){
  const name=cleanFirstName(firstNameInput.value);
  if(!name){
    nameStatus.textContent='Enter a valid first name (maximum 16 characters).';
    nameStatus.className='formStatus error';
    firstNameInput.focus();
    return;
  }
  currentPlayerName=name;
  savePlayerName(name);
  firstNameInput.value=name;
  nameStatus.textContent='Saved player: '+name;
  nameStatus.className='formStatus success';
  startBtn.disabled=true;networkStatus.textContent='CONNECTING TO PUBLIC ARENA…';
  try{await joinOnlineArena();}
  catch(error){console.error(error);networkStatus.textContent='ONLINE ARENA UNAVAILABLE · TRY AGAIN';nameStatus.textContent=error.message;nameStatus.className='formStatus error';}
  finally{startBtn.disabled=false;}
}
startBtn.addEventListener('click',startFromMenu);
menuBtn.addEventListener('click',returnToMenu);
leaveQueueBtn.addEventListener('click',async()=>{await leaveMultiplayer();queuePanel.classList.add('hidden');menu.classList.remove('hidden');networkStatus.textContent='RAILWAY REALTIME ARENA · 4 ONLINE SLOTS';});
clearNameBtn.addEventListener('click',clearSavedName);
for(const swatch of colorSwatches)swatch.addEventListener('click',()=>selectPlayerColor(swatch.dataset.color));
snakeColorInput.addEventListener('input',()=>selectPlayerColor(snakeColorInput.value));
snakeStripeColorInput.addEventListener('input',()=>selectStripeColor(snakeStripeColorInput.value));
snakeGlowColorInput.addEventListener('input',()=>selectGlowColor(snakeGlowColorInput.value));
firstNameInput.addEventListener('input',()=>{
  firstNameInput.value=firstNameInput.value.slice(0,16);
  nameStatus.textContent='Maximum 16 characters';
  nameStatus.className='formStatus';
});
boostBtn.addEventListener('pointerdown',e=>{
  e.preventDefault();e.stopPropagation();boostPointerId=e.pointerId;
  try{boostBtn.setPointerCapture(e.pointerId);}catch{}
  setBoost(true);
});
function releaseBoost(e){
  if(boostPointerId!==null&&e.pointerId!==boostPointerId)return;
  boostPointerId=null;setBoost(false);
}
boostBtn.addEventListener('pointerup',releaseBoost);
boostBtn.addEventListener('pointercancel',releaseBoost);

window.addEventListener('keydown',e=>{ keys.add(e.key.toLowerCase()); if(e.code==='Space'){e.preventDefault();setBoost(true);} });
window.addEventListener('keyup',e=>{ keys.delete(e.key.toLowerCase()); if(e.code==='Space')setBoost(false); });
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'){mouseAim.seen=true;mouseAim.x=e.clientX;mouseAim.y=e.clientY;return;}
  if(pointer.active)return;
  e.preventDefault();pointer={active:true,id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY};
  try{canvas.setPointerCapture(e.pointerId);}catch{}
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse'){mouseAim.seen=true;mouseAim.x=e.clientX;mouseAim.y=e.clientY;return;}
  if(pointer.active&&e.pointerId===pointer.id){e.preventDefault();pointer.x=e.clientX;pointer.y=e.clientY;}
});
function releaseSteeringPointer(e){
  if(pointer.active&&e.pointerId===pointer.id){pointer.active=false;pointer.id=null;}
}
window.addEventListener('pointerup',releaseSteeringPointer);
window.addEventListener('pointercancel',releaseSteeringPointer);
window.addEventListener('blur',()=>{pointer.active=false;pointer.id=null;boostPointerId=null;setBoost(false);});
window.addEventListener('beforeunload',()=>{multiplayer.intentionalLeave=true;if(multiplayer.room)multiplayer.room.leave(true).catch(()=>{});});

function playerSteering(dt){
  let target=null;
  let turnStrength=1;
  const left=keys.has('a')||keys.has('arrowleft'), right=keys.has('d')||keys.has('arrowright');
  const up=keys.has('w')||keys.has('arrowup'), down=keys.has('s')||keys.has('arrowdown');
  if(left||right||up||down){
    const dx=(right?1:0)-(left?1:0), dy=(down?1:0)-(up?1:0);
    if(dx||dy) target=Math.atan2(dy,dx);
  } else if(pointer.active){
    const dx=pointer.x-pointer.startX,dy=pointer.y-pointer.startY;
    const distance=Math.hypot(dx,dy);
    if(distance>SETTINGS.touchDeadZone){
      target=Math.atan2(dy,dx);
      turnStrength=clamp((distance-SETTINGS.touchDeadZone)/(SETTINGS.touchFullTurnDistance-SETTINGS.touchDeadZone),.28,1);
    }
  } else if(mouseAim.seen){
    const dx=mouseAim.x-width/2, dy=mouseAim.y-height/2;
    if(Math.hypot(dx,dy)>18) target=Math.atan2(dy,dx);
  }
  if(target!=null){player.targetAngle=target;networkInputAngle=target;}
  if(multiplayer.active)return;
  const maxTurn=SETTINGS.playerTurnSpeed*turnStrength*dt;
  player.angle=normalizeAngle(player.angle+clamp(angleDelta(player.angle,player.targetAngle),-maxTurn,maxTurn));
}

function remoteHumanSteering(s,dt){
  s.targetAngle=Number.isFinite(s.netInputAngle)?s.netInputAngle:s.angle;
  const maxTurn=SETTINGS.playerTurnSpeed*dt;
  s.angle=normalizeAngle(s.angle+clamp(angleDelta(s.angle,s.targetAngle),-maxTurn,maxTurn));
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
  const wantsBoost=s.boost>35 && Math.random()<0.006;
  s.speed=wantsBoost?SETTINGS.boostSpeed*0.9:SETTINGS.baseSpeed*rand(.9,1.05);
  if(wantsBoost)s.boost=Math.max(0,s.boost-SETTINGS.boostDrain*dt); else s.boost=Math.min(100,s.boost+SETTINGS.boostRecharge*dt);
}

function moveSnake(s,dt){
  const humanControlled=s.isPlayer||s.isHuman;
  const boostRequested=s.isPlayer?boosting:Boolean(s.netBoosting);
  const boostNow=humanControlled&&boostRequested&&s.boost>2;
  if(humanControlled){
    s.speed=boostNow?SETTINGS.boostSpeed:SETTINGS.baseSpeed;
    if(boostNow){ s.boost=Math.max(0,s.boost-SETTINGS.boostDrain*dt); if(s.desiredSegments>18 && Math.random()<dt*5){ s.desiredSegments--; const tail=s.body[s.body.length-1]; pellets.push(makePellet(tail.x,tail.y,1,s.color)); } }
    else s.boost=Math.min(100,s.boost+SETTINGS.boostRecharge*dt);
  }
  const oldX=s.x, oldY=s.y;
  s.x+=Math.cos(s.angle)*s.speed*dt; s.y+=Math.sin(s.angle)*s.speed*dt;
  s.x=clamp(s.x,0,SETTINGS.worldWidth); s.y=clamp(s.y,0,SETTINGS.worldHeight);
  const moved=Math.hypot(s.x-oldX,s.y-oldY);
  if(moved>0.1){
    s.body.unshift({x:s.x,y:s.y});
    while(s.body.length>s.desiredSegments)s.body.pop();
  }
}

function eatPellets(s){
  const reach=headRadiusFor(s)+8,rr=reach*reach;
  for(let i=pellets.length-1;i>=0;i--){
    const p=pellets[i]; if(dist2(s,p)<rr){
      pellets.splice(i,1);s.pelletProgress++;s.score+=p.value;
      const growthSteps=Math.floor(s.pelletProgress/SETTINGS.pelletsPerGrowth);
      if(growthSteps){
        s.desiredSegments+=growthSteps*SETTINGS.segmentsPerGrowth;
        s.pelletProgress%=SETTINGS.pelletsPerGrowth;
        s.growthFlash=1;
        if(s.isHuman){
          for(let k=0;k<20;k++){
            const angle=rand(0,Math.PI*2),speed=rand(55,150);
            particles.push({x:s.x,y:s.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:rand(.55,.9),maxLife:.9,size:rand(2.5,5.5),color:k%3===0?'#ffbf32':k%2===0?'#e9ff5e':'#63ff9b'});
          }
        }
      }
      if(s.isHuman){ for(let k=0;k<4;k++) particles.push({x:p.x,y:p.y,vx:rand(-45,45),vy:rand(-45,45),life:.35,color:p.color}); }
    }
  }
}

function scatterSnakePellets(victim){
  return victim.body.filter((_,index)=>index%2===0).map((segment,index)=>{
    const outward=Math.atan2(segment.y-victim.y,segment.x-victim.x)+rand(-.72,.72);
    const speed=rand(65,175)+(index%4)*7;
    const orbValue=Math.floor(rand(1,21));
    const dropColors=[victim.color,victim.stripeColor||victim.color,victim.glowColor||victim.color];
    const orb=makePellet(segment.x,segment.y,orbValue,dropColors[index%dropColors.length]);
    const valueRatio=(orbValue-1)/19;
    orb.r=SETTINGS.deathPelletMinRadius+(SETTINGS.deathPelletMaxRadius-SETTINGS.deathPelletMinRadius)*valueRatio;
    orb.vx=Math.cos(outward)*speed;orb.vy=Math.sin(outward)*speed;orb.deathDrop=true;
    pellets.push(orb);return orb;
  });
}

function awardKill(killer){
  killer.kills++;killer.score+=100;
  if(killer.isHuman&&killer.kills%SETTINGS.killsPerExtraLife===0){
    killer.extraLives++;killer.lifeFlash=1;
    for(let k=0;k<28;k++){
      const angle=rand(0,Math.PI*2),speed=rand(70,190);
      particles.push({x:killer.x,y:killer.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:rand(.65,1),maxLife:1,size:rand(3,6),color:k%2?'#ffbf32':'#ffffff'});
    }
  }
}

function killSnake(victim,killer=null){
  if(!victim.alive)return;
  victim.alive=false;
  if(killer && killer!==victim)awardKill(killer);
  const scattered=scatterSnakePellets(victim);
  if(victim.isPlayer){ beginDeathSequence(victim,scattered); return; }
  if(victim.isHuman){victim.respawnAt=Infinity;return;}
  victim.respawnAt=performance.now()+SETTINGS.aiRespawnDelay;
}

function beginDeathSequence(victim,scattered){
  if(dying)return;
  dying=true;setBoost(false);pointer.active=false;pointer.id=null;keys.clear();
  lastPlaytimeSeconds=Math.max(1,Math.floor((performance.now()-gameStartedAt)/1000));
  deathEndsAt=performance.now()+DEATH_SEQUENCE_MS;
  deathOrbs=scattered;
  hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');
}

function updateDeathPellets(dt){
  for(const orb of pellets){
    if(!orb.deathDrop)continue;
    orb.x+=orb.vx*dt;orb.y+=orb.vy*dt;
    orb.vx*=Math.pow(.982,dt*60);orb.vy*=Math.pow(.982,dt*60);orb.vy+=24*dt;
  }
}

function updateDeathSequence(){
  deathOrbs=deathOrbs.filter(orb=>pellets.includes(orb));
  if(performance.now()>=deathEndsAt)endGame();
}

function consumeExtraLife(s){
  if(!s.isHuman||s.extraLives<=0||s.phaseTime>0)return false;
  s.extraLives--;s.phaseTime=SETTINGS.phaseDuration;s.lifeFlash=1;
  s.x=clamp(s.x+Math.cos(s.angle)*22,0,SETTINGS.worldWidth);
  s.y=clamp(s.y+Math.sin(s.angle)*22,0,SETTINGS.worldHeight);
  for(let k=0;k<22;k++){
    const angle=rand(0,Math.PI*2),speed=rand(60,170);
    particles.push({x:s.x,y:s.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:rand(.45,.85),maxLife:.85,size:rand(2.5,5.5),color:k%2?'#ffbf32':'#ffffff'});
  }
  return true;
}

function collisions(){
  for(const s of snakes){
    if(!s.alive)continue;
    const headRadius=headRadiusFor(s);
    if(s.x<=headRadius||s.y<=headRadius||s.x>=SETTINGS.worldWidth-headRadius||s.y>=SETTINGS.worldHeight-headRadius){ killSnake(s); continue; }
    if(s.phaseTime>0)continue;
    for(const other of snakes){
      if(!other.alive)continue;
      const start=other===s?14:3;
      for(let i=start;i<other.body.length;i+=2){
        const b=other.body[i], dx=s.x-b.x,dy=s.y-b.y;
        const hit=headRadius+bodyRadiusFor(other)-2;
        if(dx*dx+dy*dy<hit*hit){
          if(!consumeExtraLife(s))killSnake(s,other===s?null:other);
          break;
        }
      }
      if(!s.alive||s.phaseTime>0)break;
    }
  }
}

function respawnAI(){
  const now=performance.now();
  for(let i=snakes.length-1;i>=0;i--){ const s=snakes[i]; if(!s.isHuman&&!s.alive&&now>=s.respawnAt){ snakes.splice(i,1); spawnAI(); } }
}

function syncHostParticipants(participants){
  if(!multiplayer.isHost||!Array.isArray(participants))return;
  const activeIds=new Set(participants.map(entry=>entry.session_id));
  for(let i=snakes.length-1;i>=0;i--){
    const s=snakes[i];
    if(s.isHuman&&!s.isPlayer&&s.sessionId&&!activeIds.has(s.sessionId))snakes.splice(i,1);
  }
  for(const entry of participants){
    const palette=parsePlayerPalette(entry.palette);
    if(entry.session_id===multiplayer.sessionId){
      player.name=entry.player_name;player.sessionId=entry.session_id;player.networkId='human-'+entry.session_id;continue;
    }
    let human=snakes.find(s=>s.sessionId===entry.session_id);
    if(!human){
      const aiIndex=snakes.findIndex(s=>!s.isHuman);
      if(aiIndex>=0)snakes.splice(aiIndex,1);
      const point=randomWorldPoint(500);
      human=makeSnake({x:point.x,y:point.y,color:palette[0],stripeColor:palette[1],glowColor:palette[2],name:entry.player_name});
      human.isHuman=true;human.sessionId=entry.session_id;human.networkId='human-'+entry.session_id;
      snakes.push(human);
    }
    human.name=entry.player_name;human.color=palette[0];human.stripeColor=palette[1];human.glowColor=palette[2];
    const inputAngle=Number(entry.input_angle);human.netInputAngle=Number.isFinite(inputAngle)?inputAngle:human.angle;human.netBoosting=Boolean(entry.boosting);
  }
  const targetTotal=SETTINGS.aiCount+1;
  while(snakes.length<targetTotal)spawnAI();
  while(snakes.length>targetTotal){const index=snakes.findIndex(s=>!s.isHuman);if(index<0)break;snakes.splice(index,1);}
}

function serializeWorldSnapshot(){
  const compactSnakes=snakes.map(s=>({
    i:s.networkId,u:s.sessionId||'',h:Boolean(s.isHuman),n:s.name,
    c:[s.color,s.stripeColor||s.color,s.glowColor||s.color],
    x:Math.round(s.x),y:Math.round(s.y),a:Number(s.angle.toFixed(4)),v:Boolean(s.alive),
    d:s.desiredSegments,q:s.score,k:s.kills,l:s.extraLives,z:Number(s.boost.toFixed(1)),
    p:s.pelletProgress,g:Number((s.growthFlash||0).toFixed(2)),f:Number((s.phaseTime||0).toFixed(2)),
    b:s.body.filter((_,index)=>index%2===0).slice(0,180).map(point=>[Math.round(point.x),Math.round(point.y)])
  }));
  const compactPellets=pellets.slice(0,SETTINGS.pelletCount+280).map(p=>[
    Math.round(p.x),Math.round(p.y),p.value,Math.round(p.r*10),p.color,p.deathDrop?1:0
  ]);
  return {v:1,t:multiplayer.tick,s:compactSnakes,p:compactPellets};
}

function applyGuestSnapshot(snapshot,initial=false){
  if(!snapshot||!Array.isArray(snapshot.s)||!Array.isArray(snapshot.p))return false;
  const existing=new Map(snakes.map(s=>[s.networkId,s]));
  const next=[];
  for(const state of snapshot.s){
    if(!state||typeof state.i!=='string'||!Array.isArray(state.b))continue;
    const colors=Array.isArray(state.c)&&state.c.length===3?state.c.map((value,index)=>cleanPlayerColor(value,index===0?DEFAULT_PLAYER_COLOR:index===1?DEFAULT_STRIPE_COLOR:DEFAULT_GLOW_COLOR)):[DEFAULT_PLAYER_COLOR,DEFAULT_STRIPE_COLOR,DEFAULT_GLOW_COLOR];
    let s=existing.get(state.i);
    const isNew=!s;
    if(!s)s=makeSnake({x:Number(state.x)||0,y:Number(state.y)||0,color:colors[0],stripeColor:colors[1],glowColor:colors[2],name:String(state.n||'Snake')});
    s.networkId=state.i;s.sessionId=state.u||null;s.isHuman=Boolean(state.h);s.isPlayer=s.sessionId===multiplayer.sessionId;s.isNetworkProxy=true;
    s.name=String(state.n||'Snake');s.color=colors[0];s.stripeColor=colors[1];s.glowColor=colors[2];
    const body=state.b.map(point=>({x:Number(point[0])||0,y:Number(point[1])||0}));
    s.netTarget={x:Number(state.x)||0,y:Number(state.y)||0,angle:Number(state.a)||0,body};
    if(initial||isNew){s.x=s.netTarget.x;s.y=s.netTarget.y;s.angle=s.netTarget.angle;s.body=body;}
    s.alive=Boolean(state.v);s.desiredSegments=Number(state.d)||SETTINGS.startSegments;s.score=Number(state.q)||0;s.kills=Number(state.k)||0;s.extraLives=Number(state.l)||0;s.boost=Number(state.z)||0;s.pelletProgress=Number(state.p)||0;s.growthFlash=Number(state.g)||0;s.phaseTime=Number(state.f)||0;
    next.push(s);
  }
  snakes=next;player=snakes.find(s=>s.isPlayer)||null;
  if(!player)return false;
  pellets=snapshot.p.map(item=>({x:Number(item[0])||0,y:Number(item[1])||0,value:Number(item[2])||1,r:(Number(item[3])||40)/10,color:String(item[4]||'#ffffff'),deathDrop:Boolean(item[5]),pulse:0,vx:0,vy:0}));
  if(initial){camera.x=player.x;camera.y=player.y;camera.zoom=1;networkInputAngle=player.angle;}
  if(!player.alive&&!multiplayer.deathPending){
    multiplayer.deathPending=true;lastPlaytimeSeconds=Math.max(1,Math.floor((performance.now()-gameStartedAt)/1000));
    hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');
    setTimeout(()=>{if(running)endGame();},DEATH_SEQUENCE_MS);
  }
  return true;
}

function updateGuestWorld(dt){
  playerSteering(dt);
  const blend=Math.min(1,dt*12);
  for(const s of snakes){
    const target=s.netTarget;if(!target)continue;
    s.x+=(target.x-s.x)*blend;s.y+=(target.y-s.y)*blend;s.angle=normalizeAngle(s.angle+angleDelta(s.angle,target.angle)*blend);
    if(s.body.length!==target.body.length)s.body=target.body.map(point=>({...point}));
    else for(let i=0;i<s.body.length;i++){s.body[i].x+=(target.body[i].x-s.body[i].x)*blend;s.body[i].y+=(target.body[i].y-s.body[i].y)*blend;}
  }
  camera.x+=(player.x-camera.x)*Math.min(1,dt*7);camera.y+=(player.y-camera.y)*Math.min(1,dt*7);
  const targetZoom=clamp(1-(player.desiredSegments-SETTINGS.startSegments)/500,.64,1);camera.zoom+=(targetZoom-camera.zoom)*Math.min(1,dt*2.5);
  updateHud();
}

function initGuestGame(snapshot){
  snakes=[];pellets=[];particles=[];deathOrbs=[];dying=false;deathEndsAt=0;nextId=1;
  if(!applyGuestSnapshot(snapshot,true))return false;
  keys.clear();pointer={active:false,id:null,startX:0,startY:0,x:0,y:0};mouseAim.seen=false;boostPointerId=null;setBoost(false);
  gameStartedAt=performance.now();lastPlaytimeSeconds=0;multiplayer.deathPending=false;
  running=true;lastTime=performance.now();menu.classList.add('hidden');queuePanel.classList.add('hidden');gameOverPanel.classList.add('hidden');hud.classList.remove('hidden');leaderboard.classList.remove('hidden');
  if(matchMedia('(pointer:coarse)').matches)boostBtn.classList.remove('hidden');
  requestAnimationFrame(loop);return true;
}

function syncMultiplayer(){
  if(!multiplayer.active||!multiplayer.joined||!multiplayer.room)return;
  try{multiplayer.room.send('input',{angle:networkInputAngle,boosting});multiplayer.failures=0;}
  catch{multiplayer.failures++;onlineRoleEl.textContent='RECONNECT';}
}

function scheduleMultiplayerSync(dt){
  if(!multiplayer.active)return;
  multiplayer.syncElapsed+=dt;
  if(multiplayer.syncElapsed>=SETTINGS.networkSyncInterval){multiplayer.syncElapsed=0;syncMultiplayer();}
}

function update(dt){
  if(!player)return;
  scheduleMultiplayerSync(dt);
  if(multiplayer.active){updateGuestWorld(dt);return;}
  if(dying){
    updateDeathPellets(dt);updateDeathSequence();if(!running)return;
    for(const s of snakes){if(!s.alive)continue;if(s.isHuman)remoteHumanSteering(s,dt);else aiSteering(s,dt);moveSnake(s,dt);eatPellets(s);s.growthFlash=Math.max(0,(s.growthFlash||0)-dt*1.25);s.phaseTime=Math.max(0,s.phaseTime-dt);s.lifeFlash=Math.max(0,s.lifeFlash-dt*1.5);}
    collisions();respawnAI();while(pellets.length<SETTINGS.pelletCount)pellets.push(makePellet());
    return;
  }
  if(!player.alive)return;
  playerSteering(dt);
  for(const s of snakes){ if(!s.alive)continue; if(!s.isPlayer){if(s.isHuman)remoteHumanSteering(s,dt);else aiSteering(s,dt);} moveSnake(s,dt); eatPellets(s); s.growthFlash=Math.max(0,(s.growthFlash||0)-dt*1.25); s.phaseTime=Math.max(0,s.phaseTime-dt); s.lifeFlash=Math.max(0,s.lifeFlash-dt*1.5); }
  collisions(); respawnAI();
  while(pellets.length<SETTINGS.pelletCount)pellets.push(makePellet());
  updateDeathPellets(dt);
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
  camera.x+=(player.x-camera.x)*Math.min(1,dt*6); camera.y+=(player.y-camera.y)*Math.min(1,dt*6);
  const targetZoom=clamp(1-(player.desiredSegments-SETTINGS.startSegments)/500,.64,1);
  camera.zoom+=(targetZoom-camera.zoom)*Math.min(1,dt*2.5);
  updateHud();
}

function updateHud(){
  playerNameEl.textContent=currentPlayerName||'—';
  scoreEl.textContent=player.score;
  lengthEl.textContent=player.desiredSegments;
  killsEl.textContent=player.kills;
  livesEl.textContent=player.extraLives;
  lifeProgressEl.textContent='NEXT '+(player.kills%SETTINGS.killsPerExtraLife)+'/'+SETTINGS.killsPerExtraLife;
  boostFill.style.width=player.boost+'%';
  const aliveSnakes=snakes.filter(s=>s.alive);
  snakeCountEl.textContent=aliveSnakes.length+' snakes';
  const ranked=aliveSnakes.sort((a,b)=>b.desiredSegments-a.desiredSegments).slice(0,8);
  leadersEl.innerHTML=ranked.map(s=>`<li class="${s.isHuman?'humanPlayer':'aiPlayer'}">${s.name} · ${s.desiredSegments}</li>`).join('');
}

function worldToScreen(x,y){ return {x:(x-camera.x)*camera.zoom+width/2,y:(y-camera.y)*camera.zoom+height/2}; }
function visible(x,y,pad=60){ const p=worldToScreen(x,y); return p.x>-pad&&p.y>-pad&&p.x<width+pad&&p.y<height+pad; }

function drawBackground(){
  ctx.fillStyle='#03060b';ctx.fillRect(0,0,width,height);
  const grid=70*camera.zoom;
  const ox=(((-camera.x*camera.zoom+width/2)%grid)+grid)%grid;
  const oy=(((-camera.y*camera.zoom+height/2)%grid)+grid)%grid;
  ctx.strokeStyle='rgba(100,150,180,.055)';ctx.lineWidth=1;
  ctx.beginPath(); for(let x=ox;x<width;x+=grid){ctx.moveTo(x,0);ctx.lineTo(x,height)} for(let y=oy;y<height;y+=grid){ctx.moveTo(0,y);ctx.lineTo(width,y)} ctx.stroke();
  const tl=worldToScreen(0,0), br=worldToScreen(SETTINGS.worldWidth,SETTINGS.worldHeight);
  ctx.strokeStyle='rgba(255,80,95,.5)';ctx.lineWidth=3;ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
}

function drawPellets(time){
  for(const p of pellets){
    if(!visible(p.x,p.y,20))continue;const s=worldToScreen(p.x,p.y);const pulse=1+Math.sin(time*.004+p.pulse)*.13;
    ctx.beginPath();ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=p.deathDrop?10+p.value*.85:p.value>=10?22:p.value>=5?15:9;ctx.arc(s.x,s.y,p.r*camera.zoom*pulse,0,Math.PI*2);ctx.fill();
    if(!p.deathDrop&&p.value>=5){ctx.beginPath();ctx.strokeStyle=p.value>=10?'rgba(255,255,255,.9)':'rgba(255,255,255,.58)';ctx.lineWidth=(p.value>=10?2:1)*camera.zoom;ctx.arc(s.x,s.y,(p.r+2)*camera.zoom*pulse,0,Math.PI*2);ctx.stroke();}
    if(p.deathDrop){ctx.beginPath();ctx.fillStyle='rgba(255,255,255,.58)';ctx.arc(s.x-p.r*.24,s.y-p.r*.24,Math.max(1.2,p.r*.19)*camera.zoom,0,Math.PI*2);ctx.fill();}
  }
  ctx.shadowBlur=0;
}

function drawSnake(s){
  if(!s.alive)return;
  ctx.save();
  if(s.phaseTime>0)ctx.globalAlpha=.5+Math.sin(performance.now()*.035)*.22;
  const bodyRadius=bodyRadiusFor(s),headRadius=headRadiusFor(s),growthFlash=Math.max(s.growthFlash||0,s.lifeFlash||0);
  ctx.lineCap='round';ctx.lineJoin='round';
  const bodyPoints=s.isNetworkProxy?s.body:s.body.filter((_,i)=>i%2===0);
  const pts=bodyPoints.map(b=>worldToScreen(b.x,b.y));
  if(pts.length>1){
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    if(growthFlash>0){ctx.save();ctx.globalAlpha=.18+.38*growthFlash;ctx.strokeStyle=growthFlash>.55?'#ffcf4d':'#63ff9b';ctx.lineWidth=(bodyRadius*2+10*growthFlash)*camera.zoom;ctx.shadowColor='#ffcf4d';ctx.shadowBlur=38*growthFlash;ctx.stroke();ctx.restore();}
    ctx.strokeStyle=s.color;ctx.lineWidth=bodyRadius*2*camera.zoom;ctx.shadowColor=s.glowColor||s.color;ctx.shadowBlur=(s.isPlayer?19:8)+growthFlash*42;ctx.stroke();
    ctx.shadowBlur=0;
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.save();ctx.setLineDash([14*camera.zoom,10*camera.zoom]);ctx.lineDashOffset=-performance.now()*.012;ctx.strokeStyle=s.stripeColor||'rgba(255,255,255,.18)';ctx.lineWidth=Math.max(2.5,bodyRadius*.48*camera.zoom);ctx.shadowColor=s.stripeColor||s.color;ctx.shadowBlur=s.isPlayer?8:3;ctx.stroke();ctx.restore();
  }
  const h=worldToScreen(s.x,s.y), r=headRadius*camera.zoom;
  ctx.beginPath();ctx.fillStyle=s.color;ctx.shadowColor=s.glowColor||s.color;ctx.shadowBlur=(s.isPlayer?22:9)+growthFlash*48;ctx.arc(h.x,h.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.beginPath();ctx.strokeStyle=s.stripeColor||s.color;ctx.lineWidth=Math.max(2,2.5*camera.zoom);ctx.arc(h.x,h.y,r*.72,0,Math.PI*2);ctx.stroke();
  if(s.phaseTime>0){ctx.beginPath();ctx.globalAlpha=.9;ctx.strokeStyle='#ffbf32';ctx.lineWidth=3*camera.zoom;ctx.shadowColor='#ffbf32';ctx.shadowBlur=25;ctx.arc(h.x,h.y,r+10+Math.sin(performance.now()*.02)*4,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
  if(growthFlash>0){ctx.beginPath();ctx.globalAlpha=growthFlash*.85;ctx.strokeStyle='#ffcf4d';ctx.lineWidth=3*camera.zoom;ctx.shadowColor='#ffcf4d';ctx.shadowBlur=28;ctx.arc(h.x,h.y,r+(1-growthFlash)*24+8,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;}
  const fx=Math.cos(s.angle),fy=Math.sin(s.angle), sx=-fy,sy=fx;
  for(const side of [-1,1]){ const ex=h.x+(fx*5+sx*side*4)*camera.zoom,ey=h.y+(fy*5+sy*side*4)*camera.zoom;ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(ex,ey,2.5*camera.zoom,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#081018';ctx.arc(ex+fx*camera.zoom,ey+fy*camera.zoom,1.2*camera.zoom,0,Math.PI*2);ctx.fill(); }
  if(!s.isPlayer){ctx.font=`${Math.max(9,11*camera.zoom)}px Arial`;ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(s.name,h.x,h.y-r-9);}
  ctx.restore();
}

function drawParticles(){for(const p of particles){const s=worldToScreen(p.x,p.y),maxLife=p.maxLife||.35,size=p.size||4;ctx.globalAlpha=clamp(p.life/maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(s.x-size/2,s.y-size/2,size,size);}ctx.globalAlpha=1;}
function drawMiniMap(){
  const mw=110,mh=110,x=width-mw-196,y=14;ctx.fillStyle='rgba(4,8,16,.72)';ctx.fillRect(x,y,mw,mh);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.strokeRect(x,y,mw,mh);
  ctx.fillStyle='#8fa0b8';ctx.font='900 8px Arial';ctx.textAlign='left';ctx.fillText('RADAR',x+7,y+12);
  for(const s of snakes){if(!s.alive)continue;ctx.fillStyle=s.isHuman?'#ff4fd8':'#57a8ff';ctx.fillRect(x+s.x/SETTINGS.worldWidth*mw-1,y+s.y/SETTINGS.worldHeight*mh-1,s.isHuman?4:2,s.isHuman?4:2);}
}

function drawTouchControl(){
  if(!pointer.active)return;
  const dx=pointer.x-pointer.startX,dy=pointer.y-pointer.startY,distance=Math.hypot(dx,dy);
  const maxDistance=Math.max(1,SETTINGS.touchFullTurnDistance);
  const scale=Math.min(1,distance/maxDistance);
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle=currentPlayerGlowColor;ctx.globalAlpha=.48;ctx.shadowColor=currentPlayerGlowColor;ctx.shadowBlur=14;
  ctx.beginPath();ctx.arc(pointer.startX,pointer.startY,SETTINGS.touchDeadZone,0,Math.PI*2);ctx.stroke();
  if(distance>SETTINGS.touchDeadZone){ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(pointer.startX,pointer.startY);ctx.lineTo(pointer.x,pointer.y);ctx.stroke();}
  ctx.globalAlpha=.75+.2*scale;ctx.fillStyle=currentPlayerStripeColor;ctx.beginPath();ctx.arc(pointer.x,pointer.y,7+4*scale,0,Math.PI*2);ctx.fill();ctx.restore();
}

function render(time){drawBackground();drawPellets(time);const sorted=snakes.filter(s=>s.alive).sort((a,b)=>a.isPlayer?1:b.isPlayer?-1:0);for(const s of sorted)drawSnake(s);drawParticles();if(width>760)drawMiniMap();drawTouchControl();}

function loop(now){
  if(!running)return;
  const dt=Math.min((now-lastTime)/1000,.033);lastTime=now;
  update(dt);render(now);
  if(running)requestAnimationFrame(loop);
}

function formatScoreDate(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);
}

function formatPlaytime(value){
  const total=Math.max(0,Number(value)||0);
  if(!total)return '—';
  const hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=Math.floor(total%60);
  return hours?hours+':'+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0'):minutes+':'+String(seconds).padStart(2,'0');
}

function renderOnlineScores(){
  for(const body of [menuScores,resultScores]){
    body.replaceChildren();
    if(!onlineScores.length){
      const row=document.createElement('tr');
      const cell=document.createElement('td');
      cell.colSpan=7;cell.className='emptyScore';cell.textContent='No scores yet — take first place!';
      row.appendChild(cell);body.appendChild(row);continue;
    }
    onlineScores.forEach((entry,index)=>{
      const row=document.createElement('tr');
      const values=[index+1,entry.player_name,entry.score,entry.kills,entry.length,formatPlaytime(entry.playtime_seconds),formatScoreDate(entry.created_at)];
      for(const [cellIndex,value] of values.entries()){
        const cell=document.createElement('td');cell.textContent=String(value);
        if(cellIndex===1){const palette=parsePlayerPalette(entry.player_color);cell.style.background=`linear-gradient(90deg,${palette.join(',')})`;cell.style.backgroundClip='text';cell.style.webkitBackgroundClip='text';cell.style.color='transparent';cell.style.textShadow=`0 0 9px ${palette[2]}`;}
        row.appendChild(cell);
      }
      body.appendChild(row);
    });
  }
}

async function loadOnlineScores(){
  scoreLoadStatus.textContent='Loading scores...';
  try{
    const response=await fetch('/api/highscores/snake-arena',{cache:'no-store'});
    if(!response.ok)throw new Error('Score load failed: '+response.status);
    onlineScores=await response.json();
    renderOnlineScores();
    scoreLoadStatus.textContent=onlineScores.length?'Worldwide ranking':'Be the first player on the board';
  }catch(error){
    console.error(error);onlineScores=[];renderOnlineScores();scoreLoadStatus.textContent='Scores are temporarily unavailable';
  }
}

async function saveOnlineScore(){
  saveStatus.textContent='Saving score...';saveStatus.className='formStatus';
  try{
    const response=await fetch('/api/highscores/snake-arena',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({player_name:currentPlayerName,player_color:[currentPlayerColor,currentPlayerStripeColor,currentPlayerGlowColor].join(','),score:player.score,kills:player.kills,length:player.desiredSegments,playtime_seconds:lastPlaytimeSeconds})
    });
    if(!response.ok)throw new Error('Score save failed: '+response.status);
    saveStatus.textContent='Score saved online';saveStatus.className='formStatus success';
    await loadOnlineScores();
  }catch(error){
    console.error(error);saveStatus.textContent='Score could not be saved';saveStatus.className='formStatus error';
  }
}

function endGame(){
  running=false;dying=false;setBoost(false);
  if(!lastPlaytimeSeconds)lastPlaytimeSeconds=Math.max(1,Math.floor((performance.now()-gameStartedAt)/1000));
  finalScore.textContent=player.score;finalKills.textContent=player.kills;finalLength.textContent=player.desiredSegments;finalPlaytime.textContent=formatPlaytime(lastPlaytimeSeconds);
  hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');gameOverPanel.classList.remove('hidden');
  void leaveMultiplayer();
  saveOnlineScore();
}

function returnToMenu(){
  running=false;dying=false;setBoost(false);pointer.active=false;pointer.id=null;keys.clear();
  if(multiplayer.joined)void leaveMultiplayer();
  gameOverPanel.classList.add('hidden');queuePanel.classList.add('hidden');hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');menu.classList.remove('hidden');
  networkStatus.textContent='RAILWAY REALTIME ARENA · 4 ONLINE SLOTS';onlineCountEl.textContent='0/'+MAX_ONLINE_PLAYERS;onlineRoleEl.textContent='READY';
  firstNameInput.value=currentPlayerName;playerNameEl.textContent=currentPlayerName||'—';selectPlayerColor(currentPlayerColor);
  nameStatus.textContent=currentPlayerName?'Saved player: '+currentPlayerName:'Maximum 16 characters';
  nameStatus.className=currentPlayerName?'formStatus success':'formStatus';
  loadOnlineScores();
}

currentPlayerName=loadSavedName();
currentPlayerColor=loadSavedColor(PLAYER_COLOR_STORAGE_KEY,DEFAULT_PLAYER_COLOR);
currentPlayerStripeColor=loadSavedColor(PLAYER_STRIPE_COLOR_STORAGE_KEY,DEFAULT_STRIPE_COLOR);
currentPlayerGlowColor=loadSavedColor(PLAYER_GLOW_COLOR_STORAGE_KEY,DEFAULT_GLOW_COLOR);
selectPlayerColor(currentPlayerColor);selectStripeColor(currentPlayerStripeColor);selectGlowColor(currentPlayerGlowColor);
if(currentPlayerName){firstNameInput.value=currentPlayerName;playerNameEl.textContent=currentPlayerName;nameStatus.textContent='Saved player: '+currentPlayerName;nameStatus.className='formStatus success';}
loadOnlineScores();
render(0);
console.info(`Snake Arena v${SNAKE_ARENA_VERSION}`);
