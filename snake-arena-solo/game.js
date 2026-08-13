const SNAKE_ARENA_VERSION = '0.2';
const PLAYER_COLOR_STORAGE_KEY = 'snakeArenaSoloPlayerColor';
const PLAYER_STRIPE_COLOR_STORAGE_KEY = 'snakeArenaSoloStripeColor';
const PLAYER_GLOW_COLOR_STORAGE_KEY = 'snakeArenaSoloGlowColor';
const DEFAULT_PLAYER_COLOR = '#ff405f';
const DEFAULT_STRIPE_COLOR = '#ffcf4d';
const DEFAULT_GLOW_COLOR = '#57d6ff';

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
  headRadius: 11,
  bodyRadius: 9,
  pelletRadius: 4,
  deathPelletMinRadius: 4.5,
  deathPelletMaxRadius: 12,
  fivePointPelletChance: 0.06,
  tenPointPelletChance: 0.02,
  boostDrain: 25,
  boostRecharge: 12,
  growthPerPellet: 2,
  aiRespawnDelay: 1800
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
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
let pointer = { active:false, x:0, y:0 };
let boosting = false;
let camera = { x: SETTINGS.worldWidth / 2, y: SETTINGS.worldHeight / 2, zoom: 1 };
let nextId = 1;
let currentPlayerColor = DEFAULT_PLAYER_COLOR;
let currentPlayerStripeColor = DEFAULT_STRIPE_COLOR;
let currentPlayerGlowColor = DEFAULT_GLOW_COLOR;

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

function makeSnake({x,y,color,stripeColor=color,glowColor=color,name,isPlayer=false}){
  const angle = rand(-Math.PI,Math.PI);
  const body=[];
  for(let i=0;i<SETTINGS.startSegments;i++) body.push({x:x-Math.cos(angle)*i*SETTINGS.segmentSpacing,y:y-Math.sin(angle)*i*SETTINGS.segmentSpacing});
  return {
    id:nextId++, x,y,angle,targetAngle:angle, color,stripeColor,glowColor,name,isPlayer, alive:true,
    body, desiredSegments:SETTINGS.startSegments, speed:SETTINGS.baseSpeed,
    score:0,kills:0,boost:100, aiTimer:0, aiBias:rand(-0.8,0.8), respawnAt:0
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
  snakes=[]; particles=[]; seedPellets(); nextId=1;
  player=makeSnake({x:SETTINGS.worldWidth/2,y:SETTINGS.worldHeight/2,color:currentPlayerColor,stripeColor:currentPlayerStripeColor,glowColor:currentPlayerGlowColor,name:'YOU',isPlayer:true});
  snakes.push(player);
  for(let i=0;i<SETTINGS.aiCount;i++) spawnAI();
  camera.x=player.x; camera.y=player.y; camera.zoom=1;
  running=true; lastTime=performance.now();
  menu.classList.add('hidden'); gameOverPanel.classList.add('hidden'); hud.classList.remove('hidden'); leaderboard.classList.remove('hidden');
  if(matchMedia('(pointer:coarse)').matches) boostBtn.classList.remove('hidden');
  requestAnimationFrame(loop);
}

function setBoost(v){ boosting=v; boostBtn.classList.toggle('active',v); }
startBtn.addEventListener('click',initGame);
restartBtn.addEventListener('click',initGame);
function cleanPlayerColor(value,fallback=DEFAULT_PLAYER_COLOR){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;}
function loadSavedColor(key,fallback){try{return cleanPlayerColor(localStorage.getItem(key),fallback);}catch{return fallback;}}
function updatePalettePreview(){
  snakeColorInput.value=currentPlayerColor;snakeStripeColorInput.value=currentPlayerStripeColor;snakeGlowColorInput.value=currentPlayerGlowColor;
  palettePreview.style.background=`linear-gradient(90deg,${currentPlayerColor} 0 38%,${currentPlayerStripeColor} 38% 68%,${currentPlayerGlowColor} 68% 100%)`;
  palettePreview.style.boxShadow=`0 0 18px ${currentPlayerGlowColor}`;colorStatus.textContent='Main · Stripe · Glow';
}
function selectPlayerColor(value){currentPlayerColor=cleanPlayerColor(value);try{localStorage.setItem(PLAYER_COLOR_STORAGE_KEY,currentPlayerColor);}catch{}updatePalettePreview();for(const swatch of colorSwatches)swatch.setAttribute('aria-pressed',String(swatch.dataset.color===currentPlayerColor));}
function selectStripeColor(value){currentPlayerStripeColor=cleanPlayerColor(value,DEFAULT_STRIPE_COLOR);try{localStorage.setItem(PLAYER_STRIPE_COLOR_STORAGE_KEY,currentPlayerStripeColor);}catch{}updatePalettePreview();}
function selectGlowColor(value){currentPlayerGlowColor=cleanPlayerColor(value,DEFAULT_GLOW_COLOR);try{localStorage.setItem(PLAYER_GLOW_COLOR_STORAGE_KEY,currentPlayerGlowColor);}catch{}updatePalettePreview();}
for(const swatch of colorSwatches)swatch.addEventListener('click',()=>selectPlayerColor(swatch.dataset.color));
snakeColorInput.addEventListener('input',event=>selectPlayerColor(event.target.value));
snakeStripeColorInput.addEventListener('input',event=>selectStripeColor(event.target.value));
snakeGlowColorInput.addEventListener('input',event=>selectGlowColor(event.target.value));
boostBtn.addEventListener('pointerdown',e=>{e.preventDefault();setBoost(true)});
boostBtn.addEventListener('pointerup',()=>setBoost(false));
boostBtn.addEventListener('pointercancel',()=>setBoost(false));

window.addEventListener('keydown',e=>{ keys.add(e.key.toLowerCase()); if(e.code==='Space'){e.preventDefault();setBoost(true);} });
window.addEventListener('keyup',e=>{ keys.delete(e.key.toLowerCase()); if(e.code==='Space')setBoost(false); });
canvas.addEventListener('pointerdown',e=>{ pointer.active=true; pointer.x=e.clientX; pointer.y=e.clientY; });
canvas.addEventListener('pointermove',e=>{ if(pointer.active || e.pointerType==='mouse'){ pointer.x=e.clientX; pointer.y=e.clientY; } });
window.addEventListener('pointerup',()=>pointer.active=false);

function playerSteering(dt){
  let target=null;
  const left=keys.has('a')||keys.has('arrowleft'), right=keys.has('d')||keys.has('arrowright');
  const up=keys.has('w')||keys.has('arrowup'), down=keys.has('s')||keys.has('arrowdown');
  if(left||right||up||down){
    const dx=(right?1:0)-(left?1:0), dy=(down?1:0)-(up?1:0);
    if(dx||dy) target=Math.atan2(dy,dx);
  } else if(pointer.active || matchMedia('(pointer:fine)').matches){
    const dx=pointer.x-width/2, dy=pointer.y-height/2;
    if(Math.hypot(dx,dy)>18) target=Math.atan2(dy,dx);
  }
  if(target!=null) player.targetAngle=target;
  const maxTurn=SETTINGS.turnSpeed*dt;
  player.angle=normalizeAngle(player.angle+clamp(angleDelta(player.angle,player.targetAngle),-maxTurn,maxTurn));
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
  const boostNow=s.isPlayer && boosting && s.boost>2;
  if(s.isPlayer){
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
  const rr=(SETTINGS.headRadius+8)*(SETTINGS.headRadius+8);
  for(let i=pellets.length-1;i>=0;i--){
    const p=pellets[i]; if(dist2(s,p)<rr){
      pellets.splice(i,1); s.desiredSegments+=SETTINGS.growthPerPellet; s.score+=p.value;
      if(s.isPlayer){ for(let k=0;k<4;k++) particles.push({x:p.x,y:p.y,vx:rand(-45,45),vy:rand(-45,45),life:.35,color:p.color}); }
    }
  }
}

function killSnake(victim,killer=null){
  if(!victim.alive)return;
  victim.alive=false;
  if(killer && killer!==victim){ killer.kills++; killer.score+=100; killer.desiredSegments+=4; }
  for(let i=2;i<victim.body.length;i+=2){
    const b=victim.body[i],value=Math.floor(rand(1,21));
    const colors=[victim.color,victim.stripeColor||victim.color,victim.glowColor||victim.color];
    const orb=makePellet(b.x+rand(-6,6),b.y+rand(-6,6),value,colors[i%colors.length]);
    const valueRatio=(value-1)/19;orb.r=SETTINGS.deathPelletMinRadius+(SETTINGS.deathPelletMaxRadius-SETTINGS.deathPelletMinRadius)*valueRatio;orb.deathDrop=true;pellets.push(orb);
  }
  if(victim.isPlayer){ endGame(); }
  else victim.respawnAt=performance.now()+SETTINGS.aiRespawnDelay;
}

function collisions(){
  for(const s of snakes){
    if(!s.alive)continue;
    if(s.x<=SETTINGS.headRadius||s.y<=SETTINGS.headRadius||s.x>=SETTINGS.worldWidth-SETTINGS.headRadius||s.y>=SETTINGS.worldHeight-SETTINGS.headRadius){ killSnake(s); continue; }
    for(const other of snakes){
      if(!other.alive)continue;
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
  if(!player||!player.alive)return;
  playerSteering(dt);
  for(const s of snakes){ if(!s.alive)continue; if(!s.isPlayer)aiSteering(s,dt); moveSnake(s,dt); eatPellets(s); }
  collisions(); respawnAI();
  while(pellets.length<SETTINGS.pelletCount)pellets.push(makePellet());
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
  camera.x+=(player.x-camera.x)*Math.min(1,dt*6); camera.y+=(player.y-camera.y)*Math.min(1,dt*6);
  const targetZoom=clamp(1-(player.desiredSegments-SETTINGS.startSegments)/500,.64,1);
  camera.zoom+=(targetZoom-camera.zoom)*Math.min(1,dt*2.5);
  updateHud();
}

function updateHud(){
  scoreEl.textContent=player.score;
  lengthEl.textContent=player.desiredSegments;
  killsEl.textContent=player.kills;
  boostFill.style.width=player.boost+'%';
  const ranked=snakes.filter(s=>s.alive).sort((a,b)=>b.desiredSegments-a.desiredSegments).slice(0,8);
  leadersEl.innerHTML=ranked.map(s=>`<li${s.isPlayer?' style="color:#63ff9b;font-weight:900"':''}>${s.name} · ${s.desiredSegments}</li>`).join('');
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
  ctx.lineCap='round';ctx.lineJoin='round';
  const pts=s.body.filter((_,i)=>i%2===0).map(b=>worldToScreen(b.x,b.y));
  if(pts.length>1){
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.strokeStyle=s.color;ctx.lineWidth=SETTINGS.bodyRadius*2*camera.zoom;ctx.shadowColor=s.glowColor||s.color;ctx.shadowBlur=s.isPlayer?19:8;ctx.stroke();
    ctx.shadowBlur=0;
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.save();ctx.setLineDash([14*camera.zoom,10*camera.zoom]);ctx.lineDashOffset=-performance.now()*.012;ctx.strokeStyle=s.stripeColor||'rgba(255,255,255,.18)';ctx.lineWidth=Math.max(2.5,SETTINGS.bodyRadius*.48*camera.zoom);ctx.shadowColor=s.stripeColor||s.color;ctx.shadowBlur=s.isPlayer?8:3;ctx.stroke();ctx.restore();
  }
  const h=worldToScreen(s.x,s.y), r=SETTINGS.headRadius*camera.zoom;
  ctx.beginPath();ctx.fillStyle=s.color;ctx.shadowColor=s.glowColor||s.color;ctx.shadowBlur=s.isPlayer?22:9;ctx.arc(h.x,h.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.beginPath();ctx.strokeStyle=s.stripeColor||s.color;ctx.lineWidth=Math.max(2,2.5*camera.zoom);ctx.arc(h.x,h.y,r*.72,0,Math.PI*2);ctx.stroke();
  const fx=Math.cos(s.angle),fy=Math.sin(s.angle), sx=-fy,sy=fx;
  for(const side of [-1,1]){ const ex=h.x+(fx*5+sx*side*4)*camera.zoom,ey=h.y+(fy*5+sy*side*4)*camera.zoom;ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(ex,ey,2.5*camera.zoom,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#081018';ctx.arc(ex+fx*camera.zoom,ey+fy*camera.zoom,1.2*camera.zoom,0,Math.PI*2);ctx.fill(); }
  if(!s.isPlayer){ctx.font=`${Math.max(9,11*camera.zoom)}px Arial`;ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(s.name,h.x,h.y-r-9);}
  ctx.restore();
}

function drawParticles(){for(const p of particles){const s=worldToScreen(p.x,p.y);ctx.globalAlpha=clamp(p.life/.35,0,1);ctx.fillStyle=p.color;ctx.fillRect(s.x-2,s.y-2,4,4);}ctx.globalAlpha=1;}
function drawMiniMap(){
  const mw=110,mh=110,x=width-mw-18,y=height-mh-18;ctx.fillStyle='rgba(4,8,16,.66)';ctx.fillRect(x,y,mw,mh);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.strokeRect(x,y,mw,mh);
  for(const s of snakes){if(!s.alive)continue;ctx.fillStyle=s.isPlayer?currentPlayerGlowColor:'rgba(87,168,255,.72)';ctx.fillRect(x+s.x/SETTINGS.worldWidth*mw-1,y+s.y/SETTINGS.worldHeight*mh-1,s.isPlayer?4:2,s.isPlayer?4:2);}
}

function render(time){drawBackground();drawPellets(time);const sorted=snakes.filter(s=>s.alive).sort((a,b)=>a.isPlayer?1:b.isPlayer?-1:0);for(const s of sorted)drawSnake(s);drawParticles();if(width>760)drawMiniMap();}

function loop(now){
  if(!running)return;
  const dt=Math.min((now-lastTime)/1000,.033);lastTime=now;
  update(dt);render(now);
  if(running)requestAnimationFrame(loop);
}

function endGame(){
  running=false;setBoost(false);
  finalScore.textContent=player.score;finalKills.textContent=player.kills;finalLength.textContent=player.desiredSegments;
  hud.classList.add('hidden');leaderboard.classList.add('hidden');boostBtn.classList.add('hidden');gameOverPanel.classList.remove('hidden');
}

render(0);
currentPlayerColor=loadSavedColor(PLAYER_COLOR_STORAGE_KEY,DEFAULT_PLAYER_COLOR);
currentPlayerStripeColor=loadSavedColor(PLAYER_STRIPE_COLOR_STORAGE_KEY,DEFAULT_STRIPE_COLOR);
currentPlayerGlowColor=loadSavedColor(PLAYER_GLOW_COLOR_STORAGE_KEY,DEFAULT_GLOW_COLOR);
selectPlayerColor(currentPlayerColor);selectStripeColor(currentPlayerStripeColor);selectGlowColor(currentPlayerGlowColor);
console.info(`Snake Arena v${SNAKE_ARENA_VERSION}`);
