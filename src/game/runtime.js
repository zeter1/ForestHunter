
if(!window.THREE){
  document.getElementById('gc').innerHTML=`
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#071007;color:#fff;padding:30px;text-align:center;font-family:Segoe UI,sans-serif">
      <div style="max-width:720px;background:rgba(0,0,0,.65);border:1px solid #775500;border-radius:16px;padding:28px">
        <h1 style="color:#ffaa00;margin-bottom:14px">Не удалось загрузить Three.js</h1>
        <p style="line-height:1.6;color:#ddd">Проверьте подключение к интернету и перезагрузите страницу. Игра попробовала загрузить библиотеку с двух серверов.</p>
      </div>
    </div>`;
}else{
// ===== MODULE BINDINGS =====
const ForestHunter=globalThis.ForestHunter;
if(!ForestHunter?.core||!ForestHunter?.game||!ForestHunter?.ai||!ForestHunter?.weapons||!ForestHunter?.audio||!ForestHunter?.ui){
  throw new Error('Forest Hunter modules were not loaded in the expected order');
}
const {readJson,writeJson}=ForestHunter.core;
const {CFG,createEnvironmentSystem,createUpgradeCatalog,canOfferUpgrade,upgradeCardCount,advanceXpState}=ForestHunter.game;
const {DIFFICULTIES,BOAR_VARIANTS,BS,canJoinAttack,queueMovementDecision,chargeSpeed,chooseVariant,boarCap,stepBoarState}=ForestHunter.ai;
const {WDEFS,AMMO_COLORS,AMMO_NAMES,createWeapon,weaponFireGate,rollShotDamage,shotSpread,beginReloadState,reloadProgress,stepReloadFrame,deployableLimit,advanceDeployableState,selectDeployableTarget,blastFalloff,selectHitCandidate,rayCircleDistanceXZ}=ForestHunter.weapons;
const {createAudioSystem}=ForestHunter.audio;
const {createDomCache,buildPlayerHud,buildWeaponHud,buildContractHud,buildDeployableHud,countAliveBoars}=ForestHunter.ui;
const SETTINGS = {difficulty:'normal',diff:DIFFICULTIES.normal,quality:'medium',sensitivity:0.002,volume:0.7};

// ===== GLOBALS =====
let scene, camera, renderer, clock;
let playerObj;
let gameStarted=false, gamePaused=false, gameOver=false;
let keys={}, shooting=false, shootOnce=false;
let boars=[], pickups=[], structureBoxes=[];
let upgradeQueue=0;
let bossActive=false, bossBoar=null, bossSpawnPending=false;
let jumpQueued=false, spawnTimer=0, lastHeadshotShot=-1;
let contract=null, lastContractId='', contractSerial=0;
let shootableProps=[], _propMeshes=[], deployables=[];
let upgradeCountdownToken=0, upgradeChoiceArmed=false;
let sunLight=null, environment=null;
let deathCinematic=null, lastPointerUnlockAt=-Infinity;
let viewBobTime=0, viewBobX=0, viewBobY=0, weaponSwayX=0, weaponSwayY=0;
const VISUAL_MAX={grass:440,dust:280};
// Pre-built list of boar meshes for raycasting (maintained on spawn/die)
let _boarMeshes=[];

// ===== PERF / PRECACHE =====
const PERF = {hudTick:0,fpsTime:0,fpsFrames:0,lastFps:60,adaptiveLevel:0};
const HUD_LAST = {};
const WEAPON_MODEL_CACHE = {};
const _screenCenter = new THREE.Vector2(0,0);
const _shootRay = new THREE.Raycaster();
const _knockDir = new THREE.Vector3();
const CACHE_VERSION = 'v2026-07-27-ultimate-6';
const SETTINGS_STORAGE_KEY = 'forestHunterSettingsV2';
const CACHE_NAME = `forest-hunter-${CACHE_VERSION}`;
const THREE_SRC = document.getElementById('three-src')?.src || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
function canUseRuntimeCache(){
  // Service Worker / Cache API intentionally work only in secure contexts.
  // file:// is left untouched so the game does not break when opened directly.
  return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
async function pruneOldRuntimeCaches(){
  if(!('caches' in window))return;
  const names=await caches.keys();
  await Promise.all(names.map(n=>n.startsWith('forest-hunter-')&&n!==CACHE_NAME?caches.delete(n):false));
}
async function cacheGameAssets(force=false){
  if(!canUseRuntimeCache() || !('caches' in window)){
    console.warn('Forest Hunter cache: нужен запуск через localhost/HTTPS, file:// не поддерживает Cache API.');
    return false;
  }
  const urls=[location.href.split('#')[0],THREE_SRC];
  const cache=await caches.open(CACHE_NAME);
  if(!force){
    let missing=false;
    for(const url of urls){
      if(!(await cache.match(url))){missing=true;break;}
    }
    if(!missing){console.info('Forest Hunter cache: уже готов.');return true;}
  }
  const attempts=[];
  for(const url of urls){
    try{
      const sameOrigin=new URL(url,location.href).origin===location.origin;
      const res=await fetch(url,{cache:'reload',mode:sameOrigin?'same-origin':'cors'});
      if(!res.ok&&res.type!=='opaque')throw new Error(`HTTP ${res.status}`);
      await cache.put(url,res.clone());
    }catch(err){
      attempts.push(`${url}: ${err&&err.message?err.message:err}`);
    }
  }
  await pruneOldRuntimeCaches();
  if(attempts.length)console.warn('Forest Hunter cache: часть ресурсов не обновилась',attempts);
  else console.info(force?'Forest Hunter cache: обновлён.':'Forest Hunter cache: создан.');
  return attempts.length===0;
}
function initRuntimeCache(){
  // В одиночном HTML нет Service Worker, поэтому не перехватываем Ctrl+F5
  // и не создаём бесполезный Cache API-кэш, который браузер всё равно не использует.
}

function precacheAssets(){
  // Build heavy weapon models once; gameplay receives cheap clones.
  Object.keys(WDEFS).forEach(t=>{ if(!WEAPON_MODEL_CACHE[t]) WEAPON_MODEL_CACHE[t]=_buildWModel(t); });
}

// ===== DOM CACHE =====
const {DOM,cacheDom}=createDomCache(document);

// ===== PLAYER =====
const P = {
  hp:CFG.playerHp, maxHp:CFG.playerHp, score:0, kills:0, headshots:0,
  combo:0, comboTimer:0, maxCombo:0,
  level:1, xp:0, xpToNext:100,
  weapons:[], curWeapon:0,
  vel:new THREE.Vector3(), onGround:false,
  aiming:false, stepTimer:0, shotCount:0,
  dmgMult:1, reloadMult:1, spdBonus:0, critChance:0, regen:0,
  vampHeal:0, magBonus:0, lootMult:1, armor:0,
  adrenaline:false, explosive:false, berserker:false, radar:false,
  lastStand:false, lastStandUsed:false, deadlyShot:false, multiShot:0,
  levelStreak:0, // consecutive levels (for boss trigger)
  damageGrace:0, lastDamageSource:null,
};

const UPGRADES=createUpgradeCatalog({
  getPlayer:()=>P,
  getConfig:()=>CFG,
  onRadar:()=>activateRadar(),
  onArmorEnabled:()=>{const el=document.getElementById('armor-text');if(el)el.style.display='block';}
});

// ===== AUDIO =====
const audio=createAudioSystem(()=>SETTINGS.volume);
function initAudio(){audio.init();}
function snd(type){audio.play(type);}

// ===== FX (optimised - reuse meshes) =====
const FX = {
  pool:[], tracers:[],
  tracerPool:[], flashPool:[], explosionLightPool:[], muzzleMeshPool:[], shellPool:[],
  _init(){
    // Pre-create particle pool
    const geo=new THREE.SphereGeometry(0.07,4,3);
    for(let i=0;i<60;i++){
      const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0x888888}));
      m.visible=false; scene.add(m);
      this.pool.push({mesh:m,life:0,vel:new THREE.Vector3(),active:false});
    }
    // Moving tracer pool: a bright core and a soft halo make bullet flight readable.
    const tCoreGeo=new THREE.CylinderGeometry(0.022,0.014,1,5);tCoreGeo.rotateX(Math.PI/2);
    const tGlowGeo=new THREE.CylinderGeometry(0.055,0.032,1,5);tGlowGeo.rotateX(Math.PI/2);
    for(let i=0;i<40;i++){
      const group=new THREE.Group();
      const core=new THREE.Mesh(tCoreGeo,new THREE.MeshBasicMaterial({color:0xfff4b0,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));
      const glow=new THREE.Mesh(tGlowGeo,new THREE.MeshBasicMaterial({color:0xffa62b,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending}));
      group.add(glow,core);group.visible=false;scene.add(group);
      this.tracerPool.push({mesh:group,core,glow,life:0,active:false,start:new THREE.Vector3(),dir:new THREE.Vector3(),distance:0,travel:0,speed:260,trail:3});
    }
    // Muzzle flash light pool (NO more add/remove per shot!)
    for(let i=0;i<4;i++){
      const L=new THREE.PointLight(0xffaa44,0,12);
      scene.add(L);
      this.flashPool.push({light:L,life:0,active:false});
    }
    for(let i=0;i<3;i++){
      const L=new THREE.PointLight(0xff6600,0,12);
      scene.add(L);
      this.explosionLightPool.push({light:L,life:0,active:false});
    }
    // Cheap geometry-based muzzle flashes: visible even when dynamic lights are disabled.
    const flashGeo=new THREE.OctahedronGeometry(0.11,0);
    for(let i=0;i<6;i++){
      const m=new THREE.Mesh(flashGeo,new THREE.MeshBasicMaterial({color:0xffcc66,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
      m.visible=false;scene.add(m);this.muzzleMeshPool.push({mesh:m,life:0,active:false});
    }
    const shellGeo=new THREE.CylinderGeometry(0.012,0.012,0.055,6);
    shellGeo.rotateZ(Math.PI/2);
    for(let i=0;i<24;i++){
      const m=new THREE.Mesh(shellGeo,new THREE.MeshStandardMaterial({color:0xb88a38,metalness:.82,roughness:.28}));
      m.visible=false;scene.add(m);
      this.shellPool.push({mesh:m,life:0,vel:new THREE.Vector3(),spin:new THREE.Vector3(),active:false});
    }
  },
  _get(){return this.pool.find(p=>!p.active)||null;},
  flash(pos){
    const f=this.flashPool.find(f=>!f.active)||this.flashPool[0];
    f.light.position.copy(pos); f.light.intensity=SETTINGS.quality==='low'?5:14;
    f.active=true; f.life=0.065;
    const fm=this.muzzleMeshPool.find(x=>!x.active)||this.muzzleMeshPool[0];
    fm.mesh.position.copy(pos);fm.mesh.quaternion.copy(camera.quaternion);
    fm.mesh.rotation.z=Math.random()*Math.PI;fm.mesh.scale.setScalar(.75+Math.random()*.5);
    fm.mesh.material.opacity=1;fm.mesh.visible=true;fm.life=.055;fm.active=true;
  },
  shell(pos,weaponType){
    if(SETTINGS.quality==='low'||weaponType==='crossbow'||weaponType==='bazooka')return;
    const s=this.shellPool.find(x=>!x.active);if(!s)return;
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const up=new THREE.Vector3(0,1,0);
    s.mesh.position.copy(pos).addScaledVector(right,.09).addScaledVector(up,.03);
    s.vel.copy(right).multiplyScalar(1.7+Math.random()*1.2).addScaledVector(up,1.6+Math.random()*.8);
    s.spin.set((Math.random()-.5)*18,(Math.random()-.5)*18,(Math.random()-.5)*18);
    s.life=1.25;s.active=true;s.mesh.visible=true;
  },
  tracer(start,end,weaponType='pistol'){
    const dir=new THREE.Vector3().subVectors(end,start);
    const len=dir.length();if(len<0.12)return;dir.normalize();
    const t=this.tracerPool.find(p=>!p.active);if(!t)return;
    const speeds={pistol:230,smg:285,shotgun:205,rifle:340,sniper:480,crossbow:95,bazooka:125};
    const colors={pistol:0xffe09a,smg:0xfff2a8,shotgun:0xffc36a,rifle:0xfff7c8,sniper:0xe6f4ff,crossbow:0xd9b2ff,bazooka:0xff7a2e};
    t.active=true;t.start.copy(start);t.dir.copy(dir);t.distance=Math.min(len,135);t.travel=0;
    t.speed=speeds[weaponType]||270;t.trail=weaponType==='sniper'?6:weaponType==='crossbow'?2.2:weaponType==='bazooka'?4.5:3.4;
    t.life=t.distance/t.speed+.13;t.core.material.color.setHex(colors[weaponType]||0xfff1a8);t.glow.material.color.setHex(colors[weaponType]||0xffa62b);
    t.core.material.opacity=1;t.glow.material.opacity=.3;t.mesh.visible=true;t.mesh.lookAt(end);
    const shown=Math.min(t.trail,t.distance);t.mesh.scale.set(1,1,shown);t.mesh.position.copy(start).addScaledVector(dir,shown*.5);
  },
  impact(pos,blood){
    const color=blood?0x990000:0xffaa33;
    const count=blood?12:8;
    for(let i=0;i<count;i++){
      const p=this._get(); if(!p)return;
      p.mesh.visible=true; p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.vel.set((Math.random()-.5)*9,Math.random()*7,(Math.random()-.5)*9);
      p.life=0.6; p.active=true;
    }
  },
  explosion(pos){
    for(let i=0;i<20;i++){
      const p=this._get(); if(!p)break;
      p.mesh.visible=true; p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(i<10?0xff6600:0xff2200);
      p.vel.set((Math.random()-.5)*14,Math.random()*10+2,(Math.random()-.5)*14);
      p.life=0.9; p.active=true;
    }
    const f=this.explosionLightPool.find(f=>!f.active)||this.explosionLightPool[0];
    f.light.position.copy(pos); f.light.intensity=18;
    f.active=true; f.life=0.18;
  },
  update(dt){
    for(const f of this.flashPool){
      if(!f.active)continue;
      f.life-=dt;
      if(f.life<=0){f.light.intensity=0;f.active=false;}
    }
    for(const f of this.explosionLightPool){
      if(!f.active)continue;
      f.life-=dt;
      if(f.life<=0){f.light.intensity=0;f.active=false;}
      else f.light.intensity=18*(f.life/0.18);
    }
    for(const f of this.muzzleMeshPool){
      if(!f.active)continue;
      f.life-=dt;
      if(f.life<=0){f.mesh.visible=false;f.mesh.material.opacity=0;f.active=false;}
      else{f.mesh.material.opacity=Math.max(0,f.life/.055);f.mesh.scale.multiplyScalar(.94);}
    }
    for(const s of this.shellPool){
      if(!s.active)continue;
      s.life-=dt;
      if(s.life<=0||s.mesh.position.y<.02){s.mesh.visible=false;s.active=false;continue;}
      s.vel.y-=9.8*dt;s.mesh.position.addScaledVector(s.vel,dt);
      s.mesh.rotation.x+=s.spin.x*dt;s.mesh.rotation.y+=s.spin.y*dt;s.mesh.rotation.z+=s.spin.z*dt;
    }
    for(const p of this.pool){
      if(!p.active)continue;
      p.life-=dt;
      if(p.life<=0){p.mesh.visible=false;p.active=false;continue;}
      p.vel.y-=14*dt;
      p.mesh.position.addScaledVector(p.vel,dt);
      if(p.mesh.position.y<0){p.mesh.visible=false;p.active=false;}
    }
    for(const t of this.tracerPool){
      if(!t.active)continue;
      t.life-=dt;t.travel=Math.min(t.distance,t.travel+t.speed*dt);
      const shown=Math.min(t.trail,t.travel,t.distance);
      const center=Math.max(shown*.5,t.travel-shown*.42);
      t.mesh.position.copy(t.start).addScaledVector(t.dir,center);t.mesh.scale.z=Math.max(.08,shown);
      const ending=t.travel>=t.distance;const fade=ending?Math.max(0,t.life/.13):1;
      t.core.material.opacity=fade;t.glow.material.opacity=.3*fade;
      if(t.life<=0){t.mesh.visible=false;t.active=false;}
    }
    for(let i=this.tracers.length-1;i>=0;i--){
      const t=this.tracers[i]; t.life-=dt;
      t.mesh.material.opacity=Math.max(0,t.life/0.05*0.8);
      if(t.life<=0){scene.remove(t.mesh);this.tracers.splice(i,1);}
    }
  }
};

// ===== WEAPON CLASS =====
function mkWeapon(type){ return createWeapon(WDEFS[type]); }

// ===== WEAPON MODELS =====
function _buildWModel(type){
  const g=new THREE.Group();
  const M =(c,me=0.85,ro=0.22)=>new THREE.MeshStandardMaterial({color:c,metalness:me,roughness:ro});
  const dark=M(0x111111,0.92,0.14);
  const metal=M(0x2a2a2a,0.85,0.26);
  const steel=M(0x3a3a40,0.8,0.28);
  const wood=(c=0x5c3a1e)=>new THREE.MeshStandardMaterial({color:c,metalness:0.02,roughness:0.88});
  const glass=new THREE.MeshStandardMaterial({color:0x2255aa,metalness:0.1,roughness:0.05,transparent:true,opacity:0.65});

  if(type==='pistol'){
    const slide=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.135,0.31),metal); slide.position.set(0,0.018,-0.015);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.22),dark); barrel.rotation.x=Math.PI/2; barrel.position.z=-0.23;
    const grip=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.19,0.11),wood()); grip.position.set(0,-0.115,0.065); grip.rotation.x=0.12;
    const trigger=new THREE.Mesh(new THREE.TorusGeometry(0.028,0.007,5,8,Math.PI),dark); trigger.position.set(0,-0.032,0.032); trigger.rotation.y=Math.PI/2;
    const sight=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.014,0.016),dark); sight.position.set(0,0.077,-0.19);
    g.add(slide,barrel,grip,trigger,sight);
  } else if(type==='smg'){
    const rcv=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.12,0.36),metal); rcv.position.set(0,0.02,0.04);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.22),dark); barrel.rotation.x=Math.PI/2; barrel.position.z=-0.19;
    const drum=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.36,12),dark); drum.rotation.x=Math.PI/2; drum.position.set(0,-0.072,0.04);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.08,0.22),steel); stock.position.set(0,0.01,0.31);
    const grip=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.16,0.09),wood(0x2a2a2a)); grip.position.set(0,-0.09,0.08); grip.rotation.x=0.1;
    const fs=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.065,0.2),dark); fs.position.set(0,-0.032,-0.09);
    g.add(rcv,barrel,drum,stock,grip,fs);
  } else if(type==='shotgun'){
    const b1=new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.58),dark); b1.rotation.x=Math.PI/2; b1.position.set(0.042,0.01,-0.38);
    const b2=b1.clone(); b2.position.set(-0.042,0.01,-0.38);
    const fore=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.1,0.3),wood(0x6B3A1F)); fore.position.set(0,-0.04,-0.19);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.16,0.42),wood()); stock.position.set(0,0.02,0.29); stock.rotation.x=-0.07;
    const rcv=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.135,0.24),metal); rcv.position.set(0,0.02,0.04);
    const guard=new THREE.Mesh(new THREE.TorusGeometry(0.034,0.009,5,10,Math.PI),dark); guard.position.set(0,-0.038,0.12); guard.rotation.y=Math.PI/2;
    g.add(b1,b2,fore,stock,rcv,guard);
  } else if(type==='rifle'){
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.016,0.95),dark); barrel.rotation.x=Math.PI/2; barrel.position.z=-0.65;
    const hg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.09,0.42),wood(0x4a2e1a)); hg.position.set(0,-0.022,-0.28);
    const rcv=new THREE.Mesh(new THREE.BoxGeometry(0.112,0.135,0.46),metal); rcv.position.set(0,0.02,0.07);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.135,0.46),wood()); stock.position.set(0,0.025,0.46); stock.rotation.x=-0.1;
    const mag=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.2,0.12),dark); mag.position.set(0,-0.15,0.05); mag.rotation.x=0.12;
    const scope=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.22),dark); scope.rotation.x=Math.PI/2; scope.position.set(0,0.115,-0.12);
    const mnt=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.038,0.2),metal); mnt.position.set(0,0.08,-0.12);
    const gas=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.28),dark); gas.rotation.x=Math.PI/2; gas.position.set(0,-0.062,-0.25);
    g.add(barrel,hg,rcv,stock,mag,scope,mnt,gas);
  } else if(type==='sniper'){
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.012,1.15),dark); barrel.rotation.x=Math.PI/2; barrel.position.z=-0.75;
    const rcv=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.125,0.44),metal); rcv.position.set(0,0.02,0.06);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.085,0.115,0.4),wood()); stock.position.set(0,0.018,0.44); stock.rotation.x=-0.1;
    const hg=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.08,0.36),wood(0x4a2e1a)); hg.position.set(0,-0.022,-0.22);
    const mag=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.14,0.09),dark); mag.position.set(0,-0.12,0.04); mag.rotation.x=-0.12;
    const scopeT=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.36),dark); scopeT.rotation.x=Math.PI/2; scopeT.position.set(0,0.115,-0.1);
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.035,10),glass); lens.rotation.x=Math.PI/2; lens.position.set(0,0.115,-0.285);
    const mnt=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.042,0.3),steel); mnt.position.set(0,0.075,-0.1);
    const brake=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.065,8),steel); brake.rotation.x=Math.PI/2; brake.position.z=-1.36;
    const cheek=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.085,0.26),wood()); cheek.position.set(0,0.085,0.3);
    g.add(barrel,rcv,stock,hg,mag,scopeT,lens,mnt,brake,cheek);
  } else if(type==='crossbow'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.058,0.56),wood(0x7B5835));
    const lbL=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.025,0.42),dark); lbL.position.set(0.19,0.09,-0.04); lbL.rotation.z=0.35;
    const lbR=lbL.clone(); lbR.position.set(-0.19,0.09,-0.04); lbR.rotation.z=-0.35;
    const str=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.005,0.005),new THREE.MeshBasicMaterial({color:0xdddddd})); str.position.set(0,0.2,-0.04);
    const arrow=new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.011,0.52),wood(0x9B7B3E)); arrow.rotation.x=Math.PI/2; arrow.position.set(0,0.024,-0.12);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(0.018,0.1,4),metal); tip.rotation.x=-Math.PI/2; tip.position.set(0,0.024,-0.39);
    const trig=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.16,0.09),wood()); trig.position.set(0,-0.09,0.08); trig.rotation.x=0.08;
    g.add(body,lbL,lbR,str,arrow,tip,trig);
  } else if(type==='bazooka'){
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.72,14),dark); tube.rotation.x=Math.PI/2; tube.position.z=-0.22;
    const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.075,0.12,14),metal); muzzle.rotation.x=Math.PI/2; muzzle.position.z=-0.62;
    const rear=new THREE.Mesh(new THREE.CylinderGeometry(0.095,0.075,0.1,14),steel); rear.rotation.x=Math.PI/2; rear.position.z=0.2;
    const rocket=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.34,10),new THREE.MeshStandardMaterial({color:0x775533,roughness:0.45,metalness:0.25})); rocket.rotation.x=Math.PI/2; rocket.position.z=-0.48;
    const tip=new THREE.Mesh(new THREE.ConeGeometry(0.04,0.12,10),new THREE.MeshStandardMaterial({color:0xff3322,roughness:0.35,metalness:0.2})); tip.rotation.x=-Math.PI/2; tip.position.z=-0.71;
    const grip=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.16,0.1),wood(0x2a2a2a)); grip.position.set(0,-0.12,-0.08); grip.rotation.x=0.12;
    const handle=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.055,0.22),steel); handle.position.set(0,0.105,-0.2);
    const sight=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.08,0.08),metal); sight.position.set(0,0.16,-0.44);
    g.add(tube,muzzle,rear,rocket,tip,grip,handle,sight);
  } else if(type==='trap'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.19,.22,.055,14),steel);base.rotation.x=Math.PI/2;base.position.z=-.12;
    const jawMat=M(0x6a4c2c,.72,.36);
    [-1,1].forEach(side=>{const jaw=new THREE.Mesh(new THREE.TorusGeometry(.18,.028,6,14,Math.PI),jawMat);jaw.rotation.set(Math.PI/2,0,side>0?0:Math.PI);jaw.position.set(side*.09,.03,-.18);g.add(jaw);});
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.1,.16,.18),wood(0x35281d));handle.position.set(0,-.12,.06);g.add(base,handle);
  } else if(type==='mine'){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.2,.24,.12,14),new THREE.MeshStandardMaterial({color:0x354034,metalness:.65,roughness:.42}));body.rotation.x=Math.PI/2;body.position.z=-.13;
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.075,.1,.07,10),steel);cap.rotation.x=Math.PI/2;cap.position.z=-.2;
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.025,6,5),new THREE.MeshBasicMaterial({color:0xff3322}));lamp.position.set(0,.09,-.23);
    const grip=new THREE.Mesh(new THREE.BoxGeometry(.1,.17,.16),wood(0x283126));grip.position.set(0,-.13,.04);g.add(body,cap,lamp,grip);
  }
  g.position.set(0.25,-0.3,-0.5);
  return g;
}
function wmodel(type){
  if(!WEAPON_MODEL_CACHE[type]) WEAPON_MODEL_CACHE[type]=_buildWModel(type);
  const clone=WEAPON_MODEL_CACHE[type].clone(true);
  clone.traverse(c=>{ if(c.isMesh){ c.castShadow=false; c.receiveShadow=false; } });
  return clone;
}
function initWeapons(){
  const p=mkWeapon('pistol');
  p.model=wmodel('pistol'); p.model.visible=true; camera.add(p.model);
  P.weapons.push(p);
}

// ===== BOAR AI STATES =====
function canBoarAttack(boar){
  return canJoinAttack(boars,boar,CFG.maxAttackers,SETTINGS.diff.attackerBonus);
}
function moveBoarSafely(boar,dir,distance){
  if(distance<=0||dir.lengthSq()<0.0001)return false;
  const extra=boar.isBoss?1.25:0.55+Math.max(0,(boar.variant?.scale||1)-1);
  const base=dir.clone().normalize();
  const attempts=[0,0.45,-0.45,0.9,-0.9,Math.PI/2,-Math.PI/2];
  for(const ang of attempts){
    const c=Math.cos(ang),s=Math.sin(ang);
    const d=new THREE.Vector3(base.x*c-base.z*s,0,base.x*s+base.z*c);
    const np=boar.mesh.position.clone().addScaledVector(d,distance);
    if(!isBlocked(np,extra)){
      boar.mesh.position.x=np.x;
      boar.mesh.position.z=np.z;
      boar.mesh.rotation.y=Math.atan2(d.x,d.z);
      return true;
    }
  }
  return false;
}
function separateBoars(boar){
  if(boar.dead||boar.dying||boar.removed)return;
  for(const other of boars){
    if(other===boar||other.dead||other.dying||other.removed)continue;
    const dx=boar.mesh.position.x-other.mesh.position.x;
    const dz=boar.mesh.position.z-other.mesh.position.z;
    const minDist=(boar.isBoss?2.6:0.85*(boar.variant?.scale||1))+(other.isBoss?2.6:0.85*(other.variant?.scale||1));
    const d2=dx*dx+dz*dz;
    if(d2>0.0001&&d2<minDist*minDist){
      const d=Math.sqrt(d2),push=(minDist-d)*0.35;
      const nx=dx/d,nz=dz/d;
      const np=boar.mesh.position.clone();np.x+=nx*push;np.z+=nz*push;
      if(!isBlocked(np,boar.isBoss?1:0.35)){boar.mesh.position.x=np.x;boar.mesh.position.z=np.z;}
    }
  }
}
function keepBoarAtAttackQueueDistance(boar,pp,dt){
  const dx=pp.x-boar.mesh.position.x,dz=pp.z-boar.mesh.position.z;
  const len=Math.hypot(dx,dz);
  if(len<0.01)return 0;
  const dir=new THREE.Vector3(dx/len,0,dz/len);
  boar.mesh.rotation.y=Math.atan2(dir.x,dir.z);
  const decision=queueMovementDecision(len,boar.attackRange,boar.queueHoldDist,boar.speed);
  if(decision.direction===0)return 0;
  if(decision.direction<0)dir.multiplyScalar(-1);
  return moveBoarSafely(boar,dir,decision.speed*dt)?decision.speed:0;
}

// ===== BOAR CLASS =====
class Boar{
  constructor(pos, lm=1, isBoss=false, variantKey=null){
    this.lm=lm; this.isBoss=isBoss;
    this.variantKey=isBoss?'boss':(variantKey||chooseVariant(P.level,Math.random()));
    this.variant=isBoss?null:BOAR_VARIANTS[this.variantKey];
    this.lastHitMeta={};
    this.dead=false; this.dying=false; this.removed=false;
    this.dyingTime=0; this.animTime=0;
    this.isFlashing=false; this.flashTimer=0;
    this.state=BS.IDLE; this.idleT=1+Math.random()*2;
    this.patrolTarget=null; this.chargeT=0;
    this.chargeCooldown=2.8+Math.random()*3.0;
    this.chargeDir=new THREE.Vector3();
    this.alertTimer=0;
    this.attackCooldown=0;
    this.stunTimer=0;
    this.queueHoldDist=3.2+Math.random()*0.9;
    this.hearRadius=isBoss?115:78;

    const v=this.variant||{hp:1,speed:1,dmg:1,scale:1};
    this.maxHp = isBoss ? Math.round(2400*lm*SETTINGS.diff.enemyHp) : Math.round(330*lm*v.hp*SETTINGS.diff.enemyHp);
    this.hp = this.maxHp;
    // Уровень, вариант и выбранная сложность совместно определяют силу врага.
    this.speed = isBoss ? Math.min(6.8*lm*SETTINGS.diff.enemySpeed,10.8) : Math.min((3.6+Math.random()*1.0)*lm*v.speed*SETTINGS.diff.enemySpeed,10.5);
    this.damage = isBoss ? Math.round(30*lm*SETTINGS.diff.enemyDmg) : Math.round(13*lm*v.dmg*SETTINGS.diff.enemyDmg);
    this.attackRange = isBoss ? 3.5 : 2.55*v.scale;
    this.alertRadius = isBoss ? 145 : 115;

    this.mesh=this.buildMesh(isBoss);
    this.mesh.position.copy(pos); this.mesh.position.y=0;
    this.mesh.userData.boar=this;
    this.mesh.traverse(c=>{if(c.isMesh){c.userData.boar=this; _boarMeshes.push(c);}});
    scene.add(this.mesh);
    this.buildHPBar();
    if(isBoss){ this.mesh.scale.set(2.1,2.1,2.1); this.state=BS.CHASE; }
    else if(this.variant&&this.variant.scale!==1)this.mesh.scale.setScalar(this.variant.scale);
    if(P.radar) addRadarDot(this);
  }

  buildMesh(boss=false){
    const g=new THREE.Group();
    const skinCol = boss ? 0x5a0a0a : (this.variant?this.variant.skin:0x3d2817);
    const darkCol = boss ? 0x2a0505 : (this.variant?this.variant.dark:0x1f160f);
    const glowEmit = boss ? new THREE.Color(0.4,0,0) : new THREE.Color(0,0,0);
    const mk=(c,e=null)=>new THREE.MeshStandardMaterial({color:c,roughness:0.88,metalness:0,emissive:e||new THREE.Color(0,0,0)});
    const skin=mk(skinCol,glowEmit);
    const dark=mk(darkCol);
    const tusk=new THREE.MeshStandardMaterial({color:0xe8dcc0,roughness:0.28,metalness:0.12});
    const eye=new THREE.MeshStandardMaterial({color:boss?0xff0000:0xdd2200,emissive:new THREE.Color(boss?0.6:0.2,0,0),roughness:0.2,metalness:0});

    // Body
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.46,0.56,1.2,10),skin.clone());
    torso.rotation.z=Math.PI/2; torso.position.y=0.76; torso.castShadow=true; g.add(torso);
    const back=new THREE.Mesh(new THREE.SphereGeometry(0.5,10,8),skin.clone());
    back.scale.set(1,0.72,1.2); back.position.set(0,0.94,0); back.castShadow=true; g.add(back);
    const belly=new THREE.Mesh(new THREE.SphereGeometry(0.46,10,8),skin.clone());
    belly.scale.set(0.88,0.65,1.1); belly.position.set(0,0.54,0.05); g.add(belly);

    // Bristle ridge
    for(let i=0;i<6;i++){
      const br=new THREE.Mesh(new THREE.ConeGeometry(0.038,0.22,4),dark.clone());
      br.position.set(0,1.16,-0.35+i*0.14); br.rotation.x=-0.25; g.add(br);
    }

    // Head
    const hg=new THREE.Group();
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.54,0.54,0.72),skin.clone());
    head.position.set(0,0.04,0); head.castShadow=true; hg.add(head);
    const snout=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.17,0.24,8),dark.clone());
    snout.rotation.x=Math.PI/2; snout.position.set(0,-0.04,0.47); hg.add(snout);
    // Nostrils
    const nGeo=new THREE.SphereGeometry(0.032,5,4);
    const nl=new THREE.Mesh(nGeo,dark.clone()); nl.position.set(0.055,-0.04,0.58); hg.add(nl);
    const nr=nl.clone(); nr.position.set(-0.055,-0.04,0.58); hg.add(nr);
    // Tusks
    [0.175,-0.175].forEach(tx=>{
      const t=new THREE.Mesh(new THREE.ConeGeometry(0.036,0.42,6),tusk.clone());
      t.rotation.x=Math.PI/2.1; t.position.set(tx,-0.18,0.49); hg.add(t);
    });
    // Eyes
    [0.175,-0.175].forEach(ex=>{
      const e=new THREE.Mesh(new THREE.SphereGeometry(0.068,8,8),eye.clone());
      e.position.set(ex,0.16,0.37); hg.add(e);
    });
    // Ears
    [0.25,-0.25].forEach(ex=>{
      const ea=new THREE.Mesh(new THREE.ConeGeometry(0.09,0.24,4),dark.clone());
      ea.position.set(ex,0.4,-0.04); ea.rotation.z=ex>0?-0.32:0.32; hg.add(ea);
    });
    if(boss){
      // Boss horns
      [0.2,-0.2].forEach(hx=>{
        const horn=new THREE.Mesh(new THREE.ConeGeometry(0.055,0.45,6),new THREE.MeshStandardMaterial({color:0x220000,roughness:0.4,metalness:0.3}));
        horn.position.set(hx,0.52,-0.05); horn.rotation.z=hx>0?-0.35:0.35; hg.add(horn);
      });
    }
    hg.position.set(0,0.88,0.96);
    hg.userData.hitZone='head';
    this.head=hg; this.headBaseZ=hg.position.z; g.add(hg);

    // Tail
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.02,0.44),dark.clone());
    tail.rotation.x=Math.PI/2.3; tail.position.set(0,0.86,-0.92); g.add(tail);

    // Legs
    this.legs=[];
    [[0.28,0.35,0.43],[-0.28,0.35,0.43],[0.28,0.35,-0.44],[-0.28,0.35,-0.44]].forEach(p=>{
      const lg=new THREE.Group();
      const up=new THREE.Mesh(new THREE.CylinderGeometry(0.077,0.066,0.34),dark.clone()); up.position.y=-0.17;
      const lo=new THREE.Mesh(new THREE.CylinderGeometry(0.062,0.046,0.3),dark.clone()); lo.position.y=-0.48;
      const hoof=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.08,0.1),new THREE.MeshStandardMaterial({color:0x111111,roughness:0.6})); hoof.position.y=-0.66;
      lg.add(up,lo,hoof); lg.position.set(...p); this.legs.push(lg); g.add(lg);
    });
    // Dedicated invisible combat hitboxes close the gaps between decorative body parts.
    const hitMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
    const bodyHit=new THREE.Mesh(new THREE.BoxGeometry(1.08,1.18,1.38),hitMat);bodyHit.position.set(0,.74,-.08);bodyHit.userData.hitZone='body';g.add(bodyHit);
    const headHit=new THREE.Mesh(new THREE.BoxGeometry(.76,.74,.88),hitMat.clone());headHit.position.set(0,.91,.95);headHit.userData.hitZone='head';g.add(headHit);
    return g;
  }

  buildHPBar(){
    const c=document.createElement('canvas'); c.width=64; c.height=8;
    this.hpCtx=c.getContext('2d');
    const tex=new THREE.CanvasTexture(c);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false}));
    sp.scale.set(1.5,0.2,1); sp.position.set(0,this.isBoss?4.2:1.9,0);
    this.mesh.add(sp); this.hpSprite=sp; this.hpCanvas=c;
    this.updateHPBar();
  }
  updateHPBar(){
    const pct=Math.max(0,this.hp/this.maxHp);
    const ctx=this.hpCtx;
    ctx.fillStyle='#1a0000'; ctx.fillRect(0,0,64,8);
    ctx.fillStyle=pct>0.5?'#00cc00':pct>0.25?'#ffaa00':'#ff2222';
    ctx.fillRect(1,1,Math.floor(62*pct),6);
    this.hpSprite.material.map.needsUpdate=true;
  }

  startFlash(){
    if(this.isFlashing)return; this.isFlashing=true; this.flashTimer=0.09;
    this.mesh.traverse(c=>{if(c.isMesh&&c.material&&c.material.emissive)c.material.emissive.setHex(0x882200);});
  }
  updateFlash(dt){
    if(!this.isFlashing)return;
    this.flashTimer-=dt;
    if(this.flashTimer<=0){
      this.isFlashing=false;
      this.mesh.traverse(c=>{if(c.isMesh&&c.material&&c.material.emissive)c.material.emissive.setHex(this.isBoss?0x440000:0x000000);});
    }
  }

  update(dt,pp){
    if(this.removed)return;
    const dist=this.mesh.position.distanceTo(pp);
    // Дальше 160м не тратим CPU на поведение, но дальнее зрение до alertRadius сохраняется.
    if(dist>160&&this.state!==BS.ATTACK&&!this.dying){
      this.updateFlash(dt);
      if(this.hpSprite)this.hpSprite.lookAt(camera.position);
      return;
    }
    if(this.dying){
      this.dyingTime+=dt;
      this.mesh.rotation.x=Math.min(this.mesh.rotation.x+dt*3.5,Math.PI/2);
      if(this.mesh.position.y>-0.4)this.mesh.position.y-=dt*1.8;
      if(this.hpSprite)this.hpSprite.visible=false;
      return;
    }
    this.updateFlash(dt);
    if(this.hpSprite)this.hpSprite.lookAt(camera.position);
    if(this.stunTimer>0){this.stunTimer=Math.max(0,this.stunTimer-dt);this.mesh.position.y=0;return;}

    const toP=new THREE.Vector3().subVectors(pp,this.mesh.position); toP.y=0;
    const toLen=toP.length();
    let moveSpeed=0;

    const patrolDistance=this.patrolTarget
      ? Math.hypot(this.patrolTarget.x-this.mesh.position.x,this.patrolTarget.z-this.mesh.position.z)
      : Infinity;
    const decision=stepBoarState({
      state:this.state,idleT:this.idleT,alertTimer:this.alertTimer,
      chargeCooldown:this.chargeCooldown,chargeT:this.chargeT,attackCooldown:this.attackCooldown,
      isBoss:this.isBoss,attackRange:this.attackRange,alertRadius:this.alertRadius
    },{
      distance:dist,canAttack:canBoarAttack(this,pp),
      hasPatrolTarget:Boolean(this.patrolTarget),patrolDistance
    },dt,Math.random);

    this.state=decision.state;
    this.idleT=decision.idleT;
    this.alertTimer=decision.alertTimer;
    this.chargeCooldown=decision.chargeCooldown;
    this.chargeT=decision.chargeT;
    this.attackCooldown=decision.attackCooldown;

    if(decision.newPatrolOffset){
      this.patrolTarget=this.mesh.position.clone().add(new THREE.Vector3(decision.newPatrolOffset.x,0,decision.newPatrolOffset.z));
    }
    if(decision.alertPulse){
      boars.forEach(b=>{
        if(b!==this&&!b.dead&&b.mesh.position.distanceTo(this.mesh.position)<16){
          if(b.state===BS.IDLE||b.state===BS.PATROL)b.state=BS.CHASE;
        }
      });
    }
    if(decision.captureChargeDirection&&toLen>0.01)this.chargeDir.copy(toP).normalize();

    if(decision.action==='queue'){
      moveSpeed=keepBoarAtAttackQueueDistance(this,pp,dt);
    }else if(decision.action==='patrol'&&this.patrolTarget){
      const toPat=new THREE.Vector3().subVectors(this.patrolTarget,this.mesh.position);toPat.y=0;
      if(toPat.lengthSq()>0.0001){
        toPat.normalize();
        this.mesh.rotation.y=Math.atan2(toPat.x,toPat.z);
        moveSpeed=moveBoarSafely(this,toPat,this.speed*0.32*dt)?this.speed*0.32:0;
      }
    }else if(decision.action==='chase'&&toLen>0.01){
      toP.normalize();
      this.mesh.rotation.y=Math.atan2(toP.x,toP.z);
      moveSpeed=moveBoarSafely(this,toP,this.speed*dt)?this.speed:0;
    }else if(decision.action==='chargeWindup'){
      if(toLen>0.01){this.chargeDir.copy(toP).normalize();this.mesh.rotation.y=Math.atan2(this.chargeDir.x,this.chargeDir.z);}
    }else if(decision.action==='chargeMove'){
      const chSpd=chargeSpeed(this.speed,this.variantKey);
      if(moveBoarSafely(this,this.chargeDir,chSpd*dt))moveSpeed=chSpd;
      else {this.state=BS.CHASE;this.chargeT=0;this.chargeCooldown=Math.max(this.chargeCooldown,1.2);}
      if(dist<this.attackRange){
        playerTakeDmg(this.damage*2.1,this.mesh.position);
        playerKnockback(this.mesh.position,this.isBoss?9.0:6.8,this.isBoss?17:12.5);
        this.state=BS.CHASE;
        this.chargeT=0;
      }
      if(decision.chargeExpired)this.state=BS.CHASE;
    }

    if(decision.attack){
      playerTakeDmg(this.damage,this.mesh.position);
      playerKnockback(this.mesh.position,this.isBoss?7.0:5.0,this.isBoss?15:10.5);
      if(this.head){
        const baseZ=Number.isFinite(this.headBaseZ)?this.headBaseZ:0.96;
        this.head.position.z=baseZ+0.18;
        setTimeout(()=>{if(this.head&&!this.dead)this.head.position.z=baseZ;},160);
      }
    }

    // Leg animation
    this.animTime+=dt*Math.max(moveSpeed,0)*1.8;
    if(this.legs.length>=4){
      this.legs[0].rotation.x=Math.sin(this.animTime)*0.55;
      this.legs[1].rotation.x=Math.sin(this.animTime+Math.PI)*0.55;
      this.legs[2].rotation.x=Math.sin(this.animTime+Math.PI)*0.55;
      this.legs[3].rotation.x=Math.sin(this.animTime)*0.55;
    }
    this.mesh.position.y=0;
    separateBoars(this);
    // Boss pulse
    if(this.isBoss){
      const pulse=1+Math.sin(performance.now()*0.005)*0.04;
      this.mesh.scale.set(2.1*pulse,2.1*pulse,2.1*pulse);
      const bfx=document.getElementById('boss-vfx');
      bfx.style.opacity=(0.12+Math.sin(performance.now()*0.004)*0.06).toString();
    }
  }

  takeDmg(amt,pt,meta={}){
    if(this.dead||this.dying||this.removed)return;
    this.lastHitMeta=meta||{};
    this.hp=Math.max(0,this.hp-amt);
    this.updateHPBar();
    this.startFlash();
    this.state=BS.CHASE;
    this.chargeCooldown=Math.min(this.chargeCooldown,0.55);
    boars.forEach(b=>{
      if(b!==this&&!b.dead&&!b.dying&&!b.removed&&b.mesh.position.distanceTo(this.mesh.position)<this.hearRadius){
        b.state=BS.CHASE;
        b.chargeCooldown=Math.min(b.chargeCooldown,1.0);
      }
    });
    if(pt)FX.impact(pt,true);
    if(this.isBoss){
      const pct=this.hp/this.maxHp*100;
      document.getElementById('boss-hp-fill').style.width=pct+'%';
    }
    if(this.hp<=0){this.dead=true;this.dying=true;this.die();}
  }

  die(){
    if(this.hpSprite)this.hpSprite.visible=false;
    const awarded=registerKill(this);
    snd('die');
    if(P.vampHeal>0)P.hp=Math.min(P.maxHp,P.hp+P.vampHeal);

    // XP зависит от типа противника и сложности.
    const xpReward=this.isBoss?500:(this.variant?this.variant.xp:80);
    grantXP(xpReward,!this.isBoss);
    updateHUD();

    // Loot
    const lootN=Math.round((1+Math.random()*2)*P.lootMult);
    for(let i=0;i<(this.isBoss?8:lootN);i++){
      const off=new THREE.Vector3((Math.random()-.5)*4,0,(Math.random()-.5)*4);
      const lpos=this.mesh.position.clone().add(off);
      const roll=Math.random();
      if(roll<0.28)spawnPickup(lpos,'health');
      else{
        const wts=P.weapons.map(w=>w.type);
        const rt=wts[Math.floor(Math.random()*wts.length)];
        spawnPickup(lpos,'ammo',rt);
      }
    }
    if(this.isBoss||Math.random()<0.18){
      const pool=['smg','shotgun','rifle','sniper','crossbow','bazooka','trap','mine'];const wt=pool[Math.floor(Math.random()*pool.length)];
      spawnWpnPickup(this.mesh.position.clone(),wt);
    }

    // Blood decal
    const bd=new THREE.Mesh(new THREE.PlaneGeometry(this.isBoss?4:2,this.isBoss?4:2),
      new THREE.MeshBasicMaterial({color:0x550000,transparent:true,opacity:0.7,depthWrite:false}));
    bd.rotation.x=-Math.PI/2; bd.position.set(this.mesh.position.x,0.02,this.mesh.position.z);
    scene.add(bd);

    if(this.isBoss){
      bossActive=false; bossBoar=null;
      document.getElementById('boss-wrap').style.display='none';
      document.getElementById('boss-vfx').style.opacity='0';
      showMsg(`☠ АЛЬФА-ВЕПРЬ ПОВЕРЖЕН! +${awarded} очков ☠`,4500);
    }

    const ref=this;
    setTimeout(()=>{
      if(ref.removed)return;
      ref.removed=true;
      _boarMeshes=_boarMeshes.filter(m=>m.userData.boar!==ref);
      disposeObject3D(ref.mesh,true);
      scene.remove(ref.mesh);
      boars=boars.filter(b=>b!==ref);
      setTimeout(()=>{scene.remove(bd);disposeObject3D(bd,true);},15000);
      updateHUD();
    },this.isBoss?8000:5000);
  }
}

// ===== BOSS SPAWN =====
function scheduleBossSpawn(delay=2500){
  if(bossActive||bossSpawnPending||gameOver)return;
  bossSpawnPending=true;
  setTimeout(()=>{
    bossSpawnPending=false;
    if(gameOver)return;
    if(gamePaused||isUpgradeOpen()){scheduleBossSpawn(900);return;}
    spawnBoss();
  },delay);
}
function spawnBoss(){
  if(bossActive||gameOver||gamePaused)return;
  bossActive=true;
  const pp=playerObj.position;
  const pos=findSafeSpawn(pp,50,72,32);
  const lm=1+P.level*0.12;
  bossBoar=new Boar(pos,lm,true);
  boars.push(bossBoar);
  snd('boss');
  showMsg('⚠️ АЛЬФА-ВЕПРЬ ПРИБЛИЖАЕТСЯ! ⚠️',4000);
  document.getElementById('boss-wrap').style.display='flex';
  document.getElementById('boss-hp-fill').style.width='100%';
}

// ===== RADAR =====
function activateRadar(){
  boars.forEach(b=>{if(!b.dead&&!b.removed)addRadarDot(b);});
}
function addRadarDot(boar){
  if(boar.radarDot)return;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({color:boar.isBoss?0xff0000:0xff3300,depthTest:false}));
  sp.scale.set(0.5,0.5,0.5); sp.position.y=boar.isBoss?5:2.5;
  boar.mesh.add(sp); boar.radarDot=sp;
}

// ===== PICKUP CLASS =====
class Pickup{
  constructor(pos,type,sub){
    this.type=type; this.sub=sub||'generic';
    this.mesh=this.build();
    this.mesh.position.copy(pos); this.mesh.position.y=0.55;
    scene.add(this.mesh);
    this.bobT=Math.random()*10;
    this.age=0;
  }
  build(){
    const g=new THREE.Group();
    if(this.type==='weapon'){
      const m=wmodel(this.sub); m.rotation.set(0,Math.PI/2,Math.PI/2); m.scale.set(1.6,1.6,1.6); g.add(m);
      const pad=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.04),new THREE.MeshBasicMaterial({color:0x553300}));
      g.add(pad);
    } else if(this.type==='health'){
      const box=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.14,0.3),new THREE.MeshLambertMaterial({color:0xffffff}));
      const v1=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.15,0.22),new THREE.MeshLambertMaterial({color:0xcc0000}));
      const v2=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.15,0.1),new THREE.MeshLambertMaterial({color:0xcc0000}));
      g.add(box,v1,v2);
    } else if(this.type==='ammo'){
      const c=AMMO_COLORS[this.sub]||AMMO_COLORS.generic;
      const box=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.44),new THREE.MeshLambertMaterial({color:c}));
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.06,0.46),new THREE.MeshLambertMaterial({color:0x222222}));
      stripe.position.y=0.07;
      g.add(box,stripe);
    }
    return g;
  }
  update(dt){
    this.age+=dt;
    this.bobT+=dt*2.4; this.mesh.position.y=0.55+Math.sin(this.bobT)*0.1;
    this.mesh.rotation.y+=dt*1.6;
  }
  label(){
    if(this.type==='weapon'){
      const n=WDEFS[this.sub]&&WDEFS[this.sub].name||this.sub;
      return `🔫 Оружие: ${n}`;
    }
    if(this.type==='health')return P.hp>=P.maxHp-0.5?'❤️ Здоровье полное':'❤️ Аптечка (+30 HP)';
    return `🎯 Патроны: ${AMMO_NAMES[this.sub]||''}`;
  }
}

function removePickupAt(index){
  const p=pickups[index];
  if(!p)return;
  scene.remove(p.mesh);
  if(p.type!=='weapon')disposeObject3D(p.mesh,true);
  pickups.splice(index,1);
}
function makeRoomForPickup(){
  if(pickups.length<CFG.maxPickups)return;
  let oldest=0;
  for(let i=1;i<pickups.length;i++)if(pickups[i].age>pickups[oldest].age)oldest=i;
  removePickupAt(oldest);
}
function spawnPickup(pos,type,sub){
  makeRoomForPickup();
  pickups.push(new Pickup(pos,type,sub));
}
function spawnWpnPickup(pos,forced=null){
  makeRoomForPickup();
  const types=['smg','shotgun','rifle','sniper','crossbow','bazooka','trap','mine'];
  const type=forced||types[Math.floor(Math.random()*types.length)];
  pickups.push(new Pickup(pos,'weapon',type));
}
function canCollectPickup(p){
  if(p.type==='health')return P.hp<P.maxHp-0.5;
  return true;
}
function checkPickups(){
  const pp=playerObj.position;
  let nearest=null,minD=Infinity;
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i]; const d=pp.distanceTo(p.mesh.position);
    if(d<2.3&&canCollectPickup(p)){applyPickup(p);removePickupAt(i);snd('pickup');continue;}
    if(d<5&&d<minD){minD=d;nearest=p;}
  }
  const h=document.getElementById('pickup-hint');
  if(nearest){h.style.display='block';h.textContent=nearest.label();}
  else h.style.display='none';
}
function applyPickup(p){
  if(p.type==='weapon'){
    const has=P.weapons.find(w=>w.type===p.sub);
    if(has){
      const bonus=has.baseMag*2;
      has.totalAmmo+=bonus;
      showMsg(`📦 Патроны для ${has.name} +${bonus}`,2000);
    } else {
      const w=mkWeapon(p.sub);
      if(P.magBonus>0)w.magazine=Math.round(w.baseMag*(1+P.magBonus));
      w.model=wmodel(p.sub); w.model.visible=false; camera.add(w.model);
      P.weapons.push(w); updateSlots();
      showMsg(`✅ Подобрано: ${w.name}!`,2500);
    }
  } else if(p.type==='health'){
    const old=P.hp; P.hp=Math.min(P.maxHp,P.hp+30);
    showMsg(`+${Math.round(P.hp-old)} HP ❤️`,1500);
  } else if(p.type==='ammo'){
    const w=P.weapons.find(w=>w.type===p.sub)||P.weapons[P.curWeapon]||P.weapons[0];
    if(w){const b=w.baseMag*2;w.totalAmmo+=b;showMsg(`+${b} ${AMMO_NAMES[w.type]||'патронов'}`,1500);}
  }
  updateHUD();
}

// ===== SHOOTING =====
function shoot(){
  const w=P.weapons[P.curWeapon];
  const now=performance.now();
  const fireGate=weaponFireGate(w,{shootOnce,now});
  if(fireGate==='blocked')return;
  if(fireGate==='empty'){shootOnce=false;snd('empty');if(w&&w.totalAmmo>0)startReload(w,true);return;}

  // Traps and mines are placed in front of the player instead of firing a ray.
  if(w.deployable){
    shootOnce=false;
    if(!placeDeployable(w.type))return;
    w.lastShot=now;w.curAmmo--;
    if(w.curAmmo<=0&&w.totalAmmo>0)startReload(w,true);
    updateHUD();return;
  }

  shootOnce=false;
  w.lastShot=now;w.curAmmo--;
  snd(w.type);

  const mpos=new THREE.Vector3(0,-0.12,-0.88).applyMatrix4(camera.matrixWorld);
  FX.flash(mpos);FX.shell(mpos,w.type);
  if(w.model){w.model.position.z+=w.type==='shotgun'||w.type==='sniper'?0.055:0.025;}

  const recoilAmt=w.type==='bazooka'?0.035:w.type==='sniper'?0.02:w.type==='shotgun'?0.022:0.01;
  camera.rotation.x=Math.min(Math.PI/2-0.01,camera.rotation.x+recoilAmt);

  P.shotCount++;
  const damageState=rollShotDamage({
    baseDamage:w.dmg,dmgMult:P.dmgMult,
    berserker:P.berserker,hp:P.hp,maxHp:P.maxHp,
    deadlyShot:P.deadlyShot,shotCount:P.shotCount,
    critChance:P.critChance
  },Math.random);
  let dmg=damageState.damage;
  const isCrit=damageState.critical;
  if(damageState.deadly)showMsg('☠ СМЕРТЕЛЬНЫЙ ВЫСТРЕЛ!',700);

  const spread=shotSpread(w.spread,P.aiming);
  // Shooting happens before renderer.render(), so refresh transforms explicitly.
  playerObj.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const rc=_shootRay;rc.setFromCamera(_screenCenter,camera);
  const origin=rc.ray.origin.clone();
  const fire=(dir,dmgMult=1,visual=true)=>{
    const d=dir.clone();d.x+=(Math.random()-.5)*spread;d.y+=(Math.random()-.5)*spread;d.normalize();
    doHit(new THREE.Raycaster(origin.clone(),d),dmg*dmgMult,mpos,isCrit,{weaponType:w.type,visualTracer:visual});
  };

  if(w.type==='shotgun'){
    for(let i=0;i<8;i++)fire(rc.ray.direction.clone(),1,i<4);
  } else if(w.type==='bazooka'){
    const d=rc.ray.direction.clone();d.x+=(Math.random()-.5)*spread;d.y+=(Math.random()-.5)*spread;d.normalize();
    doHit(new THREE.Raycaster(origin.clone(),d),dmg,mpos,isCrit,{range:70,explosionRadius:w.blastRadius,explosionDmg:w.blastDmg,weaponType:w.type,visualTracer:true});
  } else {
    fire(rc.ray.direction.clone());
    if(P.multiShot>0&&Math.random()<P.multiShot){
      for(let i=0;i<2;i++){const d2=rc.ray.direction.clone();d2.x+=(Math.random()-.5)*0.08;d2.y+=(Math.random()-.5)*0.08;d2.normalize();doHit(new THREE.Raycaster(origin.clone(),d2),dmg*0.5,mpos,false,{weaponType:w.type,visualTracer:true});}
    }
  }
  // The empty magazine starts reloading immediately after the final projectile is created.
  if(w.curAmmo<=0&&w.totalAmmo>0)startReload(w,true);
  updateHUD();
}

function userDataUp(object,key){
  let o=object;
  while(o){if(o.userData&&o.userData[key]!==undefined)return o.userData[key];o=o.parent;}
  return null;
}
function nearestPropHit(rc){
  if(!_propMeshes.length)return null;
  const hits=rc.intersectObjects(_propMeshes,false);
  for(const h of hits){
    const prop=userDataUp(h.object,'prop');
    if(prop&&!prop.exploded)return {hit:h,prop};
  }
  return null;
}
function damageProp(prop,amount,point){
  if(!prop||prop.exploded)return;
  prop.hp-=amount;
  prop.mesh.traverse(o=>{
    if(o.isMesh&&o.material&&o.material.emissive){
      o.material.emissive.setHex(0x551100);
      setTimeout(()=>{if(!prop.exploded&&o.material)o.material.emissive.setHex(0x000000);},70);
    }
  });
  FX.impact(point||prop.position,false);
  if(prop.hp<=0)explodeBarrel(prop);
}
function explodeBarrel(prop){
  if(!prop||prop.exploded)return;
  prop.exploded=true;
  const pos=prop.position.clone();
  _propMeshes=_propMeshes.filter(m=>m.userData.prop!==prop);
  shootableProps=shootableProps.filter(p=>p!==prop);
  scene.remove(prop.mesh);
  disposeObject3D(prop.mesh,true);
  FX.explosion(pos);
  snd('bazooka');
  addFeed('💥 Красная бочка взорвана');
  boars.forEach(b=>{
    if(b.dead||b.dying||b.removed)return;
    const d=b.mesh.position.distanceTo(pos);
    if(d<8)b.takeDmg(460*(1-d/8),pos,{weaponType:'barrel'});
  });
  const pd=playerObj.position.distanceTo(pos);
  if(pd<7)playerTakeDmg(Math.max(5,58*(1-pd/7)),pos);
  if(Math.random()<0.45)spawnPickup(pos.clone(),'ammo',P.weapons[P.curWeapon]?.type||'pistol');
}
function doHit(rc,dmg,startPos,crit,opts={}){
  const range=opts.range||130;
  const endPos=rc.ray.origin.clone().add(rc.ray.direction.clone().multiplyScalar(range));
  const hasBlast=Boolean(opts.explosionRadius&&opts.explosionDmg);
  const obstacle=firstObstacleHit(rc.ray,range);
  const propHit=nearestPropHit(rc);

  let liveHit=null;
  if(_boarMeshes.length){
    // Keep fast moving enemies and their dedicated hitboxes on the current frame.
    for(const b of boars)if(!b.removed)b.mesh.updateMatrixWorld(true);
    const hits=rc.intersectObjects(_boarMeshes,false);
    for(const h of hits){
      let boar=h.object.userData.boar;
      if(!boar){let o=h.object;while(o&&!boar){boar=o.userData.boar;o=o.parent;}}
      if(boar&&!boar.dead&&!boar.dying&&!boar.removed){liveHit={hit:h,boar};break;}
    }
  }

  const first=selectHitCandidate({
    obstacleDistance:obstacle?.distance,
    obstacleKind:obstacle?.kind,
    propDistance:propHit?.hit?.distance,
    boarDistance:liveHit?.hit?.distance,
    range
  });


  if(first.type==='obstacle'){
    if(opts.visualTracer!==false)FX.tracer(startPos,first.data.point,opts.weaponType);
    FX.impact(first.data.point,false);
    if(hasBlast)explode(first.data.point,opts.explosionRadius,opts.explosionDmg*0.8);
    return;
  }
  if(first.type==='prop'){
    const {hit,prop}=first.data;
    if(opts.visualTracer!==false)FX.tracer(startPos,hit.point,opts.weaponType);
    damageProp(prop,dmg,hit.point);
    if(hasBlast)explode(hit.point,opts.explosionRadius,opts.explosionDmg*0.75);
    return;
  }
  if(first.type==='boar'){
    const {hit:h,boar}=first.data;
    const headshot=userDataUp(h.object,'hitZone')==='head'&&!hasBlast;
    const dealt=dmg*(headshot?1.8:1);
    if(opts.visualTracer!==false)FX.tracer(startPos,h.point,opts.weaponType);
    boar.takeDmg(dealt,h.point,{headshot,weaponType:opts.weaponType||'unknown'});
    showHitMarker(crit||headshot);
    if(headshot&&lastHeadshotShot!==P.shotCount){
      lastHeadshotShot=P.shotCount;
      P.headshots++;
      updateContract('headshot');
      addFeed('🎯 Попадание в голову');
    }
    if(headshot&&crit)showMsg('🎯💥 КРИТ В ГОЛОВУ!',650);
    else if(headshot)showMsg('🎯 В ГОЛОВУ!',520);
    else if(crit)showMsg('💥 КРИТ!',500);
    if(hasBlast)explode(h.point,opts.explosionRadius,opts.explosionDmg);
    else if(P.explosive)explode(h.point);
    return;
  }

  if(opts.visualTracer!==false)FX.tracer(startPos,endPos,opts.weaponType);
  if(hasBlast)explode(endPos,opts.explosionRadius,opts.explosionDmg*0.65);
}

function explode(pos,radius=2.5,baseDmg=80){
  boars.forEach(b=>{
    if(!b.dead&&!b.dying&&!b.removed){
      const d=b.mesh.position.distanceTo(pos);
      if(d<radius){b.takeDmg(blastFalloff(baseDmg,d,radius)*P.dmgMult,pos);}
    }
  });
  FX.explosion(pos);
}

// ===== RELOAD =====
function updateReloadBar(w){
  if(!DOM.reloadWrap||!DOM.reloadFill)return;
  if(!w||!w.reloading){
    DOM.reloadWrap.style.display='none';
    DOM.reloadFill.style.transition='none';
    DOM.reloadFill.style.width='0%';
    return;
  }
  const pct=reloadProgress(w);
  DOM.reloadWrap.style.display='flex';
  DOM.reloadFill.style.transition='none';
  DOM.reloadFill.style.width=pct+'%';
}
function updateReloads(dt){
  let changed=false;
  P.weapons.forEach(w=>{
    const state=stepReloadFrame(w,dt);
    if(state.completed)changed=true;
  });
  const cur=P.weapons[P.curWeapon];
  updateReloadBar(cur);
  if(changed)updateHUD();
}
function startReload(w,automatic=false){
  if(!beginReloadState(w,P.reloadMult))return false;
  if(automatic&&w===P.weapons[P.curWeapon])addFeed('🔄 Автоматическая перезарядка',900);
  updateReloadBar(P.weapons[P.curWeapon]);updateHUD();return true;
}
function reload(){startReload(P.weapons[P.curWeapon],false);}

// ===== TRAPS AND MINES =====
function countDeployables(type){return deployables.filter(d=>d.type===type&&!d.removed).length;}
function buildDeployableMesh(type){
  const g=new THREE.Group();
  if(type==='trap'){
    const metal=new THREE.MeshStandardMaterial({color:0x6c5843,metalness:.72,roughness:.38});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.42,.46,.08,16),metal);base.position.y=.06;g.add(base);
    [-1,1].forEach(side=>{
      const jaw=new THREE.Mesh(new THREE.TorusGeometry(.38,.055,7,18,Math.PI),metal);
      jaw.rotation.x=Math.PI/2;jaw.rotation.z=side>0?0:Math.PI;jaw.position.set(side*.17,.15,0);g.add(jaw);
      for(let i=0;i<5;i++){const tooth=new THREE.Mesh(new THREE.ConeGeometry(.035,.16,5),metal);tooth.position.set(side*(.05+i*.065),.22,-.22+Math.abs(2-i)*.035);tooth.rotation.z=side>0?-.28:.28;g.add(tooth);}
    });
    const plate=new THREE.Mesh(new THREE.CylinderGeometry(.17,.2,.035,14),new THREE.MeshStandardMaterial({color:0x8b6a3d,metalness:.55,roughness:.45}));plate.position.y=.13;g.add(plate);
  }else{
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,.18,16),new THREE.MeshStandardMaterial({color:0x39453a,metalness:.68,roughness:.42}));body.position.y=.1;g.add(body);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,.11,12),new THREE.MeshStandardMaterial({color:0x596257,metalness:.72,roughness:.34}));cap.position.y=.24;g.add(cap);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color:0xff2a1a}));lamp.position.set(0,.33,0);lamp.userData.indicator=true;g.add(lamp);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const spike=new THREE.Mesh(new THREE.ConeGeometry(.035,.24,5),new THREE.MeshStandardMaterial({color:0x4d554d,metalness:.7,roughness:.38}));spike.position.set(Math.cos(a)*.45,.1,Math.sin(a)*.45);spike.rotation.z=Math.PI/2;spike.rotation.y=-a;g.add(spike);}
  }
  return g;
}
function removeDeployable(d){
  if(!d||d.removed)return;d.removed=true;scene.remove(d.mesh);disposeObject3D(d.mesh,true);deployables=deployables.filter(x=>x!==d);updateHUD();
}
function placeDeployable(type){
  const max=deployableLimit(type,CFG);
  if(countDeployables(type)>=max){showMsg(type==='trap'?'⚠ Уже установлено максимум капканов':'⚠ Уже установлено максимум мин',1500);return false;}
  const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,-1);forward.normalize();
  const pos=playerObj.position.clone().addScaledVector(forward,2.35);pos.y=.02;
  if(isBlocked(pos,.45)||deployables.some(d=>!d.removed&&d.mesh.position.distanceToSquared(pos)<2.25)){showMsg('⚠ Здесь нельзя установить',1300);return false;}
  const mesh=buildDeployableMesh(type);mesh.position.copy(pos);mesh.rotation.y=playerObj.rotation.y;scene.add(mesh);
  const d={type,mesh,age:0,armTime:type==='mine'?1.05:.4,removed:false,triggered:false};deployables.push(d);
  snd('pickup');addFeed(type==='trap'?'🪤 Капкан установлен':'💣 Мина установлена');updateHUD();return true;
}
function triggerDeployable(d,boar){
  if(!d||d.triggered||d.removed||!boar)return;d.triggered=true;
  if(d.type==='trap'){
    const damage=WDEFS.trap.dmg*P.dmgMult;boar.stunTimer=Math.max(boar.stunTimer,boar.isBoss?1.6:4.2);boar.takeDmg(damage,d.mesh.position,{weaponType:'trap'});
    FX.impact(d.mesh.position,true);showHitMarker(false);addFeed(`🪤 ${boar.isBoss?'Босс':'Кабан'} пойман в капкан`);setTimeout(()=>removeDeployable(d),250);
  }else{
    const pos=d.mesh.position.clone();removeDeployable(d);FX.explosion(pos);snd('bazooka');
    boars.forEach(b=>{if(b.dead||b.dying||b.removed)return;const dist=b.mesh.position.distanceTo(pos);if(dist<WDEFS.mine.blastRadius)b.takeDmg(blastFalloff(WDEFS.mine.dmg,dist,WDEFS.mine.blastRadius)*P.dmgMult,pos,{weaponType:'mine'});});
    addFeed('💥 Мина сработала');
  }
}
function updateDeployables(dt){
  for(let i=deployables.length-1;i>=0;i--){
    const d=deployables[i];if(d.removed)continue;
    const state=advanceDeployableState(d,dt,CFG.deployableLifetime);
    d.age=state.age;
    if(d.type==='mine'){
      const lamp=d.mesh.children.find(c=>c.userData.indicator);
      if(lamp)lamp.visible=d.age<d.armTime?Math.floor(d.age*8)%2===0:true;
    }
    if(state.expired){removeDeployable(d);continue;}
    if(!state.armed)continue;
    const distances=[];
    for(let bi=0;bi<boars.length;bi++){
      const b=boars[bi];
      if(b.dead||b.dying||b.removed)continue;
      distances.push({index:bi,distanceSq:b.mesh.position.distanceToSquared(d.mesh.position)});
    }
    const target=selectDeployableTarget(distances,state.radius);
    if(target.targetIndex>=0)triggerDeployable(d,boars[target.targetIndex]);
  }
}

// ===== PLAYER =====
// ===== TREE SPATIAL GRID =====
const _CELL=10;
const _treeGrid=new Map();
const _treeColliders=[];
function _regTree(x,z){
  const k=(Math.floor(x/_CELL)+1000)*2001+(Math.floor(z/_CELL)+1000);
  let a=_treeGrid.get(k); if(!a){a=[];_treeGrid.set(k,a);} a.push(x,z);
  _treeColliders.push({x,z,r:0.62,h:8});
}
function isBlocked(pos,extraRadius=0){
  const px=pos.x,pz=pos.z;
  const cx=Math.floor(px/_CELL),cz=Math.floor(pz/_CELL);
  const treeR=1.6+extraRadius;
  for(let dx=-1;dx<=1;dx++){for(let dz=-1;dz<=1;dz++){
    const a=_treeGrid.get((cx+dx+1000)*2001+(cz+dz+1000));
    if(a){for(let i=0;i<a.length;i+=2){const ddx=px-a[i],ddz=pz-a[i+1];if(ddx*ddx+ddz*ddz<treeR*treeR)return true;}}
  }}
  for(const s of structureBoxes){const dx=px-s.x,dz=pz-s.z;const r=s.r+extraRadius;if(dx*dx+dz*dz<r*r)return true;}
  return false;
}
function findSafeSpawn(center,minDist,maxDist,attempts=24){
  const lim=CFG.worldSize/2-6;
  for(let i=0;i<attempts;i++){
    const angle=Math.random()*Math.PI*2;
    const dist=minDist+Math.random()*(maxDist-minDist);
    const p=new THREE.Vector3(
      Math.max(-lim,Math.min(lim,center.x+Math.cos(angle)*dist)),0,
      Math.max(-lim,Math.min(lim,center.z+Math.sin(angle)*dist))
    );
    if(isBlocked(p,0.8))continue;
    if(boars.some(b=>!b.removed&&b.mesh.position.distanceToSquared(p)<36))continue;
    return p;
  }
  return new THREE.Vector3(Math.max(-lim,Math.min(lim,center.x+minDist)),0,Math.max(-lim,Math.min(lim,center.z)));
}
function firstObstacleHit(ray,maxDist){
  let best=maxDist+1,bestKind='none';
  for(const c of _treeColliders){
    const t=rayCircleDistanceXZ(ray,c,c.r,maxDist,c.h);
    if(t!==null&&t<best){best=t;bestKind='tree';}
  }
  for(const s of structureBoxes){
    const t=rayCircleDistanceXZ(ray,s,s.r,maxDist,s.h||5);
    if(t!==null&&t<best){best=t;bestKind='structure';}
  }
  if(ray.direction.y<-0.0001){
    const groundT=(0.03-ray.origin.y)/ray.direction.y;
    if(groundT>0&&groundT<best&&groundT<=maxDist){best=groundT;bestKind='ground';}
  }
  if(best>maxDist)return null;
  return {distance:best,kind:bestKind,point:ray.origin.clone().addScaledVector(ray.direction,best)};
}
function disposeObject3D(root,disposeGeometry=false){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(obj=>{
    if(disposeGeometry&&obj.isMesh&&obj.geometry)geometries.add(obj.geometry);
    const mats=obj.material?(Array.isArray(obj.material)?obj.material:[obj.material]):[];
    mats.forEach(m=>{materials.add(m);if(m.map)textures.add(m.map);});
  });
  textures.forEach(t=>t.dispose&&t.dispose());
  materials.forEach(m=>m.dispose&&m.dispose());
  geometries.forEach(g=>g.dispose&&g.dispose());
}
function playerKnockback(fromPos,power=3.5,up=7.5){
  if(!playerObj||gameOver)return;
  _knockDir.subVectors(playerObj.position,fromPos);
  _knockDir.y=0;
  if(_knockDir.lengthSq()<0.0001){
    camera.getWorldDirection(_knockDir);
    _knockDir.y=0;
    _knockDir.multiplyScalar(-1);
  }
  if(_knockDir.lengthSq()>0.0001)_knockDir.normalize();
  const np=playerObj.position.clone().addScaledVector(_knockDir,power);
  if(!isBlocked(np)){
    playerObj.position.x=np.x;
    playerObj.position.z=np.z;
  }
  P.vel.y=Math.max(P.vel.y,up);
  P.onGround=false;
}
function showDamageDirection(fromPos){
  if(!fromPos||!DOM.damageArrow)return;
  const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  const toSource=new THREE.Vector3().subVectors(fromPos,playerObj.position);toSource.y=0;
  if(toSource.lengthSq()<0.001)return;
  toSource.normalize();
  const cross=forward.x*toSource.z-forward.z*toSource.x;
  const dot=forward.dot(toSource);
  const angle=Math.atan2(cross,dot)*180/Math.PI;
  DOM.damageArrow.style.transform=`rotate(${angle}deg)`;
  DOM.damageArrow.classList.add('show');
  clearTimeout(DOM.damageArrow._timer);
  DOM.damageArrow._timer=setTimeout(()=>DOM.damageArrow.classList.remove('show'),420);
}
function playerTakeDmg(amt,fromPos=null){
  if(gameOver||deathCinematic)return;
  // Небольшое окно защиты не даёт нескольким врагам снять всё здоровье в один кадр.
  if(P.damageGrace>0)return;
  P.damageGrace=0.18;
  if(fromPos)P.lastDamageSource=fromPos.clone?fromPos.clone():new THREE.Vector3(fromPos.x||0,fromPos.y||0,fromPos.z||0);
  showDamageDirection(fromPos);
  if(P.armor>0)amt=Math.round(amt*(1-P.armor));
  amt=Math.max(1,Number.isFinite(amt)?amt:1);
  P.hp=Math.max(0,P.hp-amt);
  snd('hit');
  const vig=document.getElementById('dmg-vfx');
  vig.style.opacity=1; setTimeout(()=>{vig.style.opacity=0;},200);
  if(P.hp<=0){
    if(P.lastStand&&!P.lastStandUsed){P.lastStandUsed=true;P.hp=Math.round(P.maxHp*0.4);P.damageGrace=1.15;showMsg('⚡ ВТОРОЙ ШАНС!',3000);updateHUD();return;}
    playerDie(fromPos||P.lastDamageSource);
  }
  updateHUD();
}
function finishDeathScreen(){
  document.getElementById('hud').style.display='none';
  document.getElementById('death-screen').style.display='flex';
  document.getElementById('final-score').textContent=P.score;
  document.getElementById('final-kills').textContent=P.kills;
  document.getElementById('final-level').textContent=P.level;
  document.getElementById('final-headshots').textContent=P.headshots;
  document.getElementById('final-combo').textContent=P.maxCombo;
  const best=saveBestScore(P.score,P.kills,P.level);
  document.getElementById('final-record').textContent=`Рекорд: ${best.score} очков · ${best.kills} убийств · ур. ${best.level}`;
  updateCursorState();
}
function playerDie(fromPos=null){
  if(gameOver||deathCinematic)return;
  gameOver=true;
  ++upgradeCountdownToken;upgradeChoiceArmed=false;
  resetCombatInput();
  if(document.pointerLockElement)document.exitPointerLock();
  document.getElementById('pause-screen').style.display='none';
  document.getElementById('upgrade-screen').style.display='none';
  document.getElementById('death-screen').style.display='none';
  document.getElementById('hud').style.display='block';
  P.weapons.forEach(w=>{if(w.model)w.model.visible=false;});

  playerObj.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  scene.attach(camera);
  const start=camera.position.clone();
  const focus=playerObj.position.clone().add(new THREE.Vector3(0,-0.58,0));
  const attacker=fromPos&&Number.isFinite(fromPos.x)?new THREE.Vector3(fromPos.x,fromPos.y||0,fromPos.z):focus.clone().add(new THREE.Vector3(4,0,4));
  const toward=new THREE.Vector3().subVectors(attacker,focus);toward.y=0;
  if(toward.lengthSq()<0.01)toward.set(1,0,1);toward.normalize();
  const side=new THREE.Vector3(-toward.z,0,toward.x);
  const end=focus.clone().addScaledVector(side,5.4).addScaledVector(toward,-2.4);end.y=focus.y+3.3;
  deathCinematic={elapsed:0,duration:2.35,start,end,focus,attacker};
  showMsg('☠ СМЕРТЕЛЬНЫЙ УДАР',1450);
  updateCursorState();
}
function updateDeathCinematic(dt){
  if(!deathCinematic)return;
  const d=deathCinematic;
  d.elapsed+=Math.min(dt,0.05);
  const t=Math.min(1,d.elapsed/d.duration);
  const eased=1-Math.pow(1-t,3);
  camera.position.lerpVectors(d.start,d.end,eased);
  const look=d.focus.clone().lerp(d.attacker,Math.min(.22,eased*.22));
  look.y=d.focus.y-.22;
  camera.lookAt(look);
  if(t>=1){deathCinematic=null;finishDeathScreen();}
}
function switchWeapon(idx){
  if(idx<0||idx>=P.weapons.length||idx===P.curWeapon)return;
  P.weapons[P.curWeapon].model.visible=false;
  P.curWeapon=idx;
  const w=P.weapons[idx];
  w.model.visible=true;
  // Raise from hip animation
  w.model.position.set(0.5,-0.58,-0.55);
  const target=w.model.userData.readyPos||(w.model.userData.readyPos=new THREE.Vector3(0.25,-0.3,-0.5));
  let t=0; const anim=()=>{t+=0.15;if(t<=1){w.model.position.lerp(target,0.3);requestAnimationFrame(anim);}};
  anim();
  updateHUD();
}
function updatePlayer(dt){
  if(!gameStarted||gamePaused||gameOver)return;
  if(P.damageGrace>0)P.damageGrace=Math.max(0,P.damageGrace-dt);
  const isRun=keys['ShiftLeft']||keys['ShiftRight'];
  let spd=P.aiming?(CFG.walkSpeed+P.spdBonus)*0.33:(isRun?CFG.runSpeed+P.spdBonus:CFG.walkSpeed+P.spdBonus);
  if(P.adrenaline&&P.hp<P.maxHp*0.3)spd*=1.5;

  const dir=new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; if(dir.length()>0)dir.normalize();
  const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize();
  const move=new THREE.Vector3();
  if(keys['KeyW']||keys['ArrowUp'])move.add(dir);
  if(keys['KeyS']||keys['ArrowDown'])move.sub(dir);
  if(keys['KeyA']||keys['ArrowLeft'])move.sub(right);
  if(keys['KeyD']||keys['ArrowRight'])move.add(right);
  if(move.length()>0){
    move.normalize();
    const np=playerObj.position.clone().add(move.clone().multiplyScalar(spd*dt));
    if(!isBlocked(np))playerObj.position.copy(np);
    if(P.onGround){P.stepTimer+=dt;if(P.stepTimer>(isRun?0.26:0.46)){P.stepTimer=0;snd('step');}}
  }
  playerObj.position.y+=P.vel.y*dt;
  P.vel.y-=CFG.gravity*dt;
  if(playerObj.position.y<CFG.playerHeight){playerObj.position.y=CFG.playerHeight;P.vel.y=0;P.onGround=true;}
  if(jumpQueued&&P.onGround){P.vel.y=10;P.onGround=false;}
  jumpQueued=false;
  const lim=CFG.worldSize/2-2;
  playerObj.position.x=Math.max(-lim,Math.min(lim,playerObj.position.x));
  playerObj.position.z=Math.max(-lim,Math.min(lim,playerObj.position.z));
  if(P.regen>0&&P.hp<P.maxHp)P.hp=Math.min(P.maxHp,P.hp+P.regen*dt);
}

function updateViewMotion(dt){
  if(!camera||!gameStarted)return;
  const moving=Boolean(keys['KeyW']||keys['KeyS']||keys['KeyA']||keys['KeyD']||keys['ArrowUp']||keys['ArrowDown']||keys['ArrowLeft']||keys['ArrowRight']);
  const running=Boolean(keys['ShiftLeft']||keys['ShiftRight']);
  const amp=P.aiming ? .006 : (running ? .022 : .014);
  if(moving&&P.onGround)viewBobTime+=dt*(running?11:7.5);
  const targetX=moving&&P.onGround?Math.sin(viewBobTime)*amp:0;
  const targetY=moving&&P.onGround?Math.abs(Math.cos(viewBobTime))*amp*.75:0;
  viewBobX+=(targetX-viewBobX)*Math.min(1,dt*10);viewBobY+=(targetY-viewBobY)*Math.min(1,dt*10);
  camera.position.x=viewBobX;camera.position.y=viewBobY;
  const w=P.weapons[P.curWeapon];
  if(w&&w.model){
    const base=w.model.userData.readyPos||(w.model.userData.readyPos=new THREE.Vector3(.25,-.3,-.5));
    w.model.position.x+=(base.x+viewBobX*.9-w.model.position.x)*Math.min(1,dt*14);
    w.model.position.y+=(base.y-viewBobY*.45-w.model.position.y)*Math.min(1,dt*14);
    w.model.position.z+=(base.z-w.model.position.z)*Math.min(1,dt*18);
    w.model.rotation.z+=(viewBobX*1.5+weaponSwayX-w.model.rotation.z)*Math.min(1,dt*10);
    w.model.rotation.x+=(weaponSwayY-w.model.rotation.x)*Math.min(1,dt*12);
  }
  weaponSwayX*=Math.max(0,1-dt*8);weaponSwayY*=Math.max(0,1-dt*8);
}

function spawnBoar(){
  const alive=boars.filter(b=>!b.removed).length;
  if(alive>=boarCap(P.level,CFG,SETTINGS.diff.capBonus))return;
  const pp=playerObj.position;
  const pos=findSafeSpawn(pp,CFG.spawnRadiusMin,CFG.spawnRadiusMax,24);
  const lm=1+(P.level-1)*0.16;
  const b=new Boar(pos,lm,false,chooseVariant(P.level,Math.random()));
  if(P.radar)addRadarDot(b);
  boars.push(b);
}

// ===== COMBO / CONTRACTS =====
function addFeed(text,duration=2300){
  if(!DOM.eventFeed)return;
  const item=document.createElement('div');
  item.className='feed-item';item.textContent=text;
  DOM.eventFeed.prepend(item);
  while(DOM.eventFeed.children.length>4)DOM.eventFeed.lastElementChild.remove();
  setTimeout(()=>item.remove(),duration);
}
function registerKill(boar){
  P.combo=P.comboTimer>0?P.combo+1:1;
  P.comboTimer=CFG.comboSeconds;
  P.maxCombo=Math.max(P.maxCombo,P.combo);
  const comboMult=1+Math.min(9,P.combo-1)*0.12;
  const base=boar.isBoss?800:(boar.variant?boar.variant.score:100);
  const points=Math.round(base*comboMult*SETTINGS.diff.scoreMult);
  P.kills++;P.score+=points;
  updateContract('kill',boar);
  updateContract('combo',P.combo);
  if(P.combo>0&&P.combo%5===0){
    const streakBonus=Math.round(125*(P.combo/5)*SETTINGS.diff.scoreMult);
    P.score+=streakBonus;
    P.hp=Math.min(P.maxHp,P.hp+8);
    const cw=P.weapons[P.curWeapon];if(cw)cw.totalAmmo+=Math.max(1,Math.round(cw.baseMag*.6));
    addFeed(`🏆 Награда за серию ×${P.combo}: +${streakBonus} и припасы`,3200);
  }else if(boar.variantKey&&boar.variantKey!=='normal'&&!boar.isBoss)addFeed(`⚠ ${boar.variant.name} повержен · +${points}`);
  else if(P.combo>=3)addFeed(`🔥 Серия ×${P.combo} · +${points}`);
  return points;
}
function updateCombo(dt){
  if(P.comboTimer<=0)return;
  P.comboTimer=Math.max(0,P.comboTimer-dt);
  if(P.comboTimer===0)P.combo=0;
}
function makeContract(){
  const level=P.level;
  const pool=[
    {id:'kills',title:'Зачистка',desc:'Уничтожьте кабанов',target:6+Math.min(8,Math.floor(level/2)),rewardScore:350+level*35,rewardXp:90},
    {id:'headshots',title:'Меткий охотник',desc:'Попадите в голову',target:4+Math.min(5,Math.floor(level/3)),rewardScore:430+level*40,rewardXp:110},
    {id:'elite',title:'Опасная добыча',desc:'Уничтожьте особых кабанов',target:2+Math.min(3,Math.floor(level/4)),rewardScore:520+level*45,rewardXp:130},
    {id:'combo',title:'Без передышки',desc:'Достигните серии убийств',target:4+Math.min(4,Math.floor(level/4)),rewardScore:470+level*40,rewardXp:115}
  ];
  let choices=pool.filter(c=>c.id!==lastContractId);
  const c={...choices[Math.floor(Math.random()*choices.length)]};
  c.progress=0;c.serial=++contractSerial;c.completed=false;
  lastContractId=c.id;
  return c;
}
function startNewContract(){
  contract=makeContract();
  updateHUD();
  addFeed(`📜 Новый контракт: ${contract.title}`,3000);
}
function updateContract(event,payload){
  if(!contract||contract.completed)return;
  if(contract.id==='kills'&&event==='kill')contract.progress++;
  if(contract.id==='headshots'&&event==='headshot')contract.progress++;
  if(contract.id==='elite'&&event==='kill'&&(payload.isBoss||payload.variantKey!=='normal'))contract.progress++;
  if(contract.id==='combo'&&event==='combo')contract.progress=Math.max(contract.progress,payload);
  contract.progress=Math.min(contract.target,contract.progress);
  if(contract.progress>=contract.target)completeContract();
}
function completeContract(){
  if(!contract||contract.completed)return;
  contract.completed=true;
  const rewardScore=contract.rewardScore;
  P.score+=rewardScore;
  grantXP(contract.rewardXp,false);
  P.hp=Math.min(P.maxHp,P.hp+25);
  const w=P.weapons[P.curWeapon];if(w)w.totalAmmo+=Math.max(w.baseMag,Math.round(w.baseMag*1.5));
  snd('levelup');
  showMsg(`✅ КОНТРАКТ ВЫПОЛНЕН! +${rewardScore} очков`,3200);
  addFeed('🎁 Награда: опыт, здоровье и боеприпасы',3400);
  updateHUD();
  const serial=contract.serial;
  setTimeout(()=>{if(!gameOver&&contract&&contract.serial===serial)startNewContract();},2200);
}

// ===== UPGRADES =====
function grantXP(amount,canTriggerBoss=true){
  const result=advanceXpState({
    level:P.level,xp:P.xp,xpToNext:P.xpToNext,levelStreak:P.levelStreak
  },amount,{canTriggerBoss,bossActive,bossSpawnPending});
  P.level=result.level;P.xp=result.xp;P.xpToNext=result.xpToNext;P.levelStreak=result.levelStreak;
  upgradeQueue+=result.upgradeQueueDelta;
  if(result.shouldScheduleBoss)scheduleBossSpawn(2500);
  if(result.gained>0)setTimeout(()=>processUpgradeQueue(),700);
}
function processUpgradeQueue(){
  if(upgradeQueue>0&&!gamePaused&&!gameOver){upgradeQueue--;showUpgradeMenu();}
}
function showUpgradeMenu(){
  if(gameOver)return;
  gamePaused=true;
  resetCombatInput();
  upgradeChoiceArmed=false;
  const token=++upgradeCountdownToken;
  document.getElementById('pause-screen').style.display='none';
  const screen=document.getElementById('upgrade-screen');
  const container=document.getElementById('uopts');
  if(document.pointerLockElement)document.exitPointerLock();
  snd('levelup');

  const pool=[];
  UPGRADES.t1.filter(up=>canOfferUpgrade(up,P)).forEach(u=>pool.push({...u,tierClass:'t1',tierLabel:'Базовое'}));
  if(P.level>=3)UPGRADES.t2.filter(up=>canOfferUpgrade(up,P)).forEach(u=>pool.push({...u,tierClass:'t2',tierLabel:'Продвинутое'}));
  if(P.level>=5)UPGRADES.t3.filter(up=>canOfferUpgrade(up,P)).forEach(u=>pool.push({...u,tierClass:'t3',tierLabel:'Элитное'}));
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const cardCount=upgradeCardCount(P.level);
  const options=pool.slice(0,Math.min(cardCount,pool.length));

  container.innerHTML='';container.className='locked';
  DOM.upgradeCountdown.hidden=false;
  DOM.upgradeCountLabel.textContent='Приготовьтесь к выбору';
  DOM.upgradeCountHint.textContent='Стрельба остановлена. Карточки пока заблокированы.';
  document.getElementById('upgrade-subtitle').textContent=`Уровень ${P.level}! Улучшения откроются после отсчёта.`;

  const finishChoice=(up)=>{
    if(!upgradeChoiceArmed||token!==upgradeCountdownToken||gameOver)return;
    upgradeChoiceArmed=false;++upgradeCountdownToken;
    up.apply();
    screen.style.display='none';container.innerHTML='';
    updateHUD();showMsg(up.name+'!',2200);
    if(upgradeQueue>0){
      upgradeQueue--;
      gamePaused=true;
      setTimeout(()=>showUpgradeMenu(),520);
    }else{
      gamePaused=false;
      requestPointerLockSafe();
    }
    updateCursorState();
  };

  options.forEach(up=>{
    const div=document.createElement('div');
    div.className=`ucard ${up.tierClass} disabled`;
    div.innerHTML=`<div class="tier">${up.tierLabel}</div><h3>${up.name}</h3><p>${up.desc}</p>`;
    div.addEventListener('click',()=>finishChoice(up));
    container.appendChild(div);
  });
  screen.style.display='flex';
  updateCursorState();

  const steps=['3','2','1'];let index=0;
  const showStep=()=>{
    if(token!==upgradeCountdownToken||gameOver)return;
    DOM.upgradeCountNumber.textContent=steps[index];
    DOM.upgradeCountNumber.style.animation='none';void DOM.upgradeCountNumber.offsetWidth;DOM.upgradeCountNumber.style.animation='countPulse .68s ease-out both';
    index++;
    if(index<steps.length)setTimeout(showStep,760);
    else setTimeout(()=>{
      if(token!==upgradeCountdownToken||gameOver)return;
      DOM.upgradeCountNumber.textContent='✓';
      DOM.upgradeCountLabel.textContent='Выбирайте улучшение';
      DOM.upgradeCountHint.textContent='Теперь карточки активны. Нужен новый отдельный клик.';
      document.getElementById('upgrade-subtitle').textContent=`Уровень ${P.level}! Выберите улучшение (доступно ${options.length}):`;
      setTimeout(()=>{
        if(token!==upgradeCountdownToken||gameOver)return;
        DOM.upgradeCountdown.hidden=true;container.className='ready';
        container.querySelectorAll('.ucard').forEach(card=>card.classList.remove('disabled'));
        // Дополнительная короткая блокировка гарантирует, что старый клик стрельбы не станет выбором.
        setTimeout(()=>{if(token===upgradeCountdownToken)upgradeChoiceArmed=true;},260);
      },420);
    },760);
  };
  showStep();
}

// ===== HUD =====
function updateHUD(){
  const w=P.weapons[P.curWeapon];
  if(w){
    const weaponView=buildWeaponHud(w,P.dmgMult,countDeployables(w.type),CFG,AMMO_NAMES);
    const stats=weaponView.stats;
    if(HUD_LAST.wname!==w.name){DOM.wname.textContent=w.name;HUD_LAST.wname=w.name;}
    if(HUD_LAST.wstats!==stats){DOM.wstats.textContent=stats;HUD_LAST.wstats=stats;}
    if(HUD_LAST.curAmmo!==w.curAmmo){DOM.curAmmo.textContent=w.curAmmo;HUD_LAST.curAmmo=w.curAmmo;}
    if(HUD_LAST.totalAmmo!==w.totalAmmo){DOM.totAmmo.textContent=w.totalAmmo;HUD_LAST.totalAmmo=w.totalAmmo;}
    updateReloadBar(w);
  }
  const playerView=buildPlayerHud(P);
  const hpPct=playerView.hpPct;
  if(HUD_LAST.hpPct!==hpPct){DOM.hpFill.style.width=hpPct+'%';HUD_LAST.hpPct=hpPct;}
  if(DOM.lowHpPulse)DOM.lowHpPulse.classList.toggle('on',hpPct>0&&hpPct<28);
  const hpLabel=playerView.hpLabel;
  if(HUD_LAST.hpLabel!==hpLabel){DOM.hpText.textContent=hpLabel;HUD_LAST.hpLabel=hpLabel;}
  if(P.armor>0){
    const armorLabel=playerView.armorLabel;
    if(HUD_LAST.armorLabel!==armorLabel){DOM.armorText.textContent=armorLabel;HUD_LAST.armorLabel=armorLabel;}
  }
  if(HUD_LAST.score!==P.score){DOM.scoreSpan.textContent=P.score;HUD_LAST.score=P.score;}
  if(HUD_LAST.kills!==P.kills){DOM.kcountSpan.textContent=P.kills;HUD_LAST.kills=P.kills;}
  if(HUD_LAST.level!==P.level){DOM.lvlSpan.textContent=P.level;HUD_LAST.level=P.level;}
  const xpPct=playerView.xpPct;
  if(HUD_LAST.xpPct!==xpPct){DOM.xpFill.style.width=xpPct+'%';HUD_LAST.xpPct=xpPct;}
  const contractHtml=buildContractHud(contract);
  if(HUD_LAST.contractHtml!==contractHtml){DOM.contract.innerHTML=contractHtml;HUD_LAST.contractHtml=contractHtml;}
  if(P.combo>=2&&P.comboTimer>0){
    DOM.combo.textContent=`СЕРИЯ ×${P.combo}`;DOM.combo.classList.add('on');
  }else DOM.combo.classList.remove('on');
  if(DOM.deployableStatus){
    const deployableView=buildDeployableHud(countDeployables('trap'),countDeployables('mine'),CFG);
    DOM.deployableStatus.style.display=deployableView.visible?'block':'none';
    DOM.deployableStatus.textContent=deployableView.text;
  }

  // Boar count and slot classes are refreshed less often; this keeps HUD intact but cuts DOM churn.
  if((PERF.hudTick++%6)===0 || HUD_LAST.weaponIdx!==P.curWeapon || HUD_LAST.weaponLen!==P.weapons.length){
    const aliveCount=countAliveBoars(boars);
    if(HUD_LAST.aliveCount!==aliveCount){DOM.bcountSpan.textContent=aliveCount;HUD_LAST.aliveCount=aliveCount;}
    if(!DOM.slots)DOM.slots=document.querySelectorAll('.slot');
    DOM.slots.forEach((s,i)=>{
      s.classList.toggle('active',i===P.curWeapon);
      s.classList.toggle('locked',i>=P.weapons.length);
    });
    HUD_LAST.weaponIdx=P.curWeapon;
    HUD_LAST.weaponLen=P.weapons.length;
  }
}
function updateSlots(){
  document.querySelectorAll('.slot').forEach((s,i)=>{
    if(i<P.weapons.length){
      s.classList.remove('locked');
      s.querySelector('.snum').textContent=i+1;
      if(s.children[1])s.children[1].textContent=P.weapons[i].name.split(' ')[0];
    }
  });
  updateHUD();
}
function showHitMarker(critical=false){
  const c=document.getElementById('crosshair');
  c.classList.add('hit');
  clearTimeout(c._hitTimer);
  c._hitTimer=setTimeout(()=>c.classList.remove('hit'),critical?130:80);
}
function showMsg(txt,dur){
  const m=document.getElementById('msg');
  m.textContent=txt; m.style.opacity=1;
  clearTimeout(m._t);
  m._t=setTimeout(()=>{m.style.opacity=0;},dur);
}
function isUpgradeOpen(){
  return document.getElementById('upgrade-screen').style.display==='flex';
}
function resetCombatInput(){
  keys={};
  shooting=false;
  shootOnce=false;
  jumpQueued=false;
  P.aiming=false;
  const crosshair=document.getElementById('crosshair');
  crosshair.classList.remove('aim','hit');
  if(camera){camera.fov=75;camera.position.x=0;camera.position.y=0;camera.updateProjectionMatrix();}
  viewBobX=0;viewBobY=0;
}
function updateCursorState(){
  const showCursor=!gameStarted||gamePaused||isUpgradeOpen()||(gameOver&&!deathCinematic);
  document.body.classList.toggle('menu-open',showCursor);
  document.body.classList.toggle('gameplay-active',gameStarted&&!showCursor);
  if(renderer&&renderer.domElement)renderer.domElement.style.cursor=showCursor?'default':'none';
}
function requestPointerLockSafe(){
  if(!renderer||!renderer.domElement||document.pointerLockElement===renderer.domElement)return;
  try{
    const result=renderer.domElement.requestPointerLock();
    if(result&&typeof result.catch==='function')result.catch(()=>{});
  }catch(e){}
}
function setPaused(paused,requestLock=true){
  if(!gameStarted||gameOver||isUpgradeOpen())return;
  gamePaused=Boolean(paused);
  const ps=document.getElementById('pause-screen');
  if(gamePaused){
    resetCombatInput();
    ps.style.display='flex';
    const w=P.weapons[P.curWeapon];
    document.getElementById('pw').textContent=w?`Оружие: ${w.name}`:'Оружие: нет';
    if(document.pointerLockElement)document.exitPointerLock();
  }else{
    ps.style.display='none';
    if(requestLock)requestPointerLockSafe();
    setTimeout(processUpgradeQueue,0);
  }
  updateCursorState();
}
function togglePause(){
  setPaused(!gamePaused,true);
}
function readBestScore(){
  const value=readJson('forestHunterBest',null);
  if(value&&Number.isFinite(value.score))return {score:value.score||0,kills:value.kills||0,level:value.level||1};
  return {score:0,kills:0,level:1};
}
function saveBestScore(score,kills,level){
  const old=readBestScore();
  const best=score>old.score?{score,kills,level}:old;
  writeJson('forestHunterBest',best);
  return best;
}
function updateRecordText(){
  const best=readBestScore();
  const el=document.getElementById('start-record');
  if(el)el.textContent=best.score>0?`Рекорд: ${best.score} очков · ${best.kills} убийств · ур. ${best.level}`:'Рекорд пока не установлен';
}
async function toggleFullscreen(){
  try{
    if(!document.fullscreenElement)await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch(e){showMsg('Полноэкранный режим недоступен в этом браузере',1800);}
}
function updateFullscreenButtons(){
  document.querySelectorAll('.fullscreen-btn').forEach(btn=>{btn.textContent=document.fullscreenElement?'Выйти из полного экрана':'На весь экран';});
}

function loadSavedSettings(){
  const saved=readJson(SETTINGS_STORAGE_KEY,null);
  if(!saved)return;
  if(DIFFICULTIES[saved.difficulty]){SETTINGS.difficulty=saved.difficulty;SETTINGS.diff=DIFFICULTIES[saved.difficulty];}
  if(['low','medium','high'].includes(saved.quality))SETTINGS.quality=saved.quality;
  if(Number.isFinite(saved.sensitivity))SETTINGS.sensitivity=Math.max(.0012,Math.min(.0036,saved.sensitivity));
  if(Number.isFinite(saved.volume))SETTINGS.volume=Math.max(0,Math.min(1,saved.volume));
}
function saveSettings(){
  writeJson(SETTINGS_STORAGE_KEY,{difficulty:SETTINGS.difficulty,quality:SETTINGS.quality,sensitivity:SETTINGS.sensitivity,volume:SETTINGS.volume});
}
function applyAdaptiveVisualBudget(){
  if(!renderer||!environment)return;
  environment.applyVisualBudget({
    renderer,quality:SETTINGS.quality,adaptiveLevel:PERF.adaptiveLevel,
    devicePixelRatio:window.devicePixelRatio||1,width:window.innerWidth,height:window.innerHeight,
    sunLight
  });
}
function updateAdaptivePerformance(dt){
  PERF.fpsTime+=dt;PERF.fpsFrames++;
  if(PERF.fpsTime<4)return;
  const fps=PERF.fpsFrames/Math.max(.001,PERF.fpsTime);
  PERF.lastFps=fps;PERF.fpsTime=0;PERF.fpsFrames=0;
  let next=PERF.adaptiveLevel;
  if(fps<34&&next<2)next++;
  else if(fps>56&&next>0)next--;
  if(next!==PERF.adaptiveLevel){
    PERF.adaptiveLevel=next;applyAdaptiveVisualBudget();
    addFeed(next>0?'⚙ Автооптимизация снизила нагрузку':'✨ Полное качество восстановлено',2600);
  }
}
function setQuality(value,notify=false){
  SETTINGS.quality=value;
  if(notify)PERF.adaptiveLevel=0;
  if(!renderer)return;
  renderer.toneMappingExposure=value==='low' ? .98 : (value==='high' ? 1.08 : 1.03);
  if(scene&&scene.fog)scene.fog.density=value==='low' ? .0092 : (value==='high' ? .0061 : .0072);
  applyAdaptiveVisualBudget();
  const vignette=document.getElementById('cinematic-vignette');if(vignette)vignette.style.opacity=value==='low' ? .55 : 1;
  if(notify)addFeed(`🖥 Графика: ${value==='low'?'низкая':value==='high'?'высокая':'средняя'}`);
}
function syncSettingControls(source){
  const cls=source.className.split(' ').find(c=>c.endsWith('-select')||c.endsWith('-range'));
  if(!cls)return;
  document.querySelectorAll('.'+cls).forEach(el=>{if(el!==source)el.value=source.value;});
}
function applySettingControl(el,notify=false){
  syncSettingControls(el);
  if(el.classList.contains('difficulty-select')){
    const oldDiff=SETTINGS.diff;
    SETTINGS.difficulty=el.value;SETTINGS.diff=DIFFICULTIES[el.value]||DIFFICULTIES.normal;
    if(gameStarted&&oldDiff!==SETTINGS.diff){
      boars.forEach(b=>{
        if(b.dead||b.dying||b.removed)return;
        const hpPct=b.hp/Math.max(1,b.maxHp),v=b.variant||{hp:1,speed:1,dmg:1};
        b.maxHp=b.isBoss?Math.round(2400*b.lm*SETTINGS.diff.enemyHp):Math.round(330*b.lm*v.hp*SETTINGS.diff.enemyHp);
        b.hp=Math.max(1,Math.round(b.maxHp*hpPct));
        b.speed=b.isBoss?Math.min(6.8*b.lm*SETTINGS.diff.enemySpeed,10.8):Math.min((4.0)*b.lm*v.speed*SETTINGS.diff.enemySpeed,10.5);
        b.damage=b.isBoss?Math.round(30*b.lm*SETTINGS.diff.enemyDmg):Math.round(13*b.lm*v.dmg*SETTINGS.diff.enemyDmg);
        b.updateHPBar();
      });
      addFeed(`⚙ Сложность: ${SETTINGS.diff.label}`);
    }
  }
  if(el.classList.contains('quality-select'))setQuality(el.value,notify);
  if(el.classList.contains('sensitivity-range')){
    SETTINGS.sensitivity=0.002*(Number(el.value)/100);
    document.querySelectorAll('.sensitivity-value').forEach(v=>v.textContent=el.value+'%');
  }
  if(el.classList.contains('volume-range')){
    SETTINGS.volume=Number(el.value)/100;
    audio.setVolume(SETTINGS.volume);
    document.querySelectorAll('.volume-value').forEach(v=>v.textContent=el.value+'%');
  }
  saveSettings();
}
function initSettingsControls(){
  document.querySelectorAll('.difficulty-select').forEach(el=>el.value=SETTINGS.difficulty);
  document.querySelectorAll('.quality-select').forEach(el=>el.value=SETTINGS.quality);
  const sens=Math.round(SETTINGS.sensitivity/.002*100);
  const vol=Math.round(SETTINGS.volume*100);
  document.querySelectorAll('.sensitivity-range').forEach(el=>el.value=String(sens));
  document.querySelectorAll('.volume-range').forEach(el=>el.value=String(vol));
  document.querySelectorAll('.difficulty-select,.quality-select,.sensitivity-range,.volume-range').forEach(el=>{
    const evt=el.tagName==='SELECT'?'change':'input';
    el.addEventListener(evt,()=>applySettingControl(el,gameStarted));
  });
  document.querySelectorAll('#start-settings select,#start-settings input').forEach(el=>applySettingControl(el,false));
}
function spawnInitialBoars(){
  const count=Math.min(CFG.startBoars,getBoarCap());
  for(let i=0;i<count;i++){
    const pos=findSafeSpawn(playerObj.position,32,54,24);
    boars.push(new Boar(pos,1,false,chooseVariant(P.level,Math.random())));
  }
}

// ===== INIT =====
function init(){
  cacheDom();
  loadSavedSettings();
  initSettingsControls();
  updateRecordText();
  updateFullscreenButtons();
  initRuntimeCache();
  initAudio();
  clock=new THREE.Clock();
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x7ea6c2);
  scene.fog=new THREE.FogExp2(0x9eb7ad,0.0072);

  camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,800);
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',precision:'highp'});
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.03;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  document.getElementById('gc').appendChild(renderer.domElement);

  // Lights
  const amb=new THREE.AmbientLight(0x536a72,.33);scene.add(amb);
  const hemi=new THREE.HemisphereLight(0xb9d7ef,0x314315,.62);scene.add(hemi);
  sunLight=new THREE.DirectionalLight(0xffe5b2,1.28);
  sunLight.position.set(80,140,60);sunLight.castShadow=false;
  sunLight.shadow.camera.left=-42;sunLight.shadow.camera.right=42;
  sunLight.shadow.camera.top=42;sunLight.shadow.camera.bottom=-42;
  sunLight.shadow.camera.near=20;sunLight.shadow.camera.far=260;
  sunLight.shadow.mapSize.set(1024,1024);sunLight.shadow.bias=-0.0007;sunLight.shadow.normalBias=.025;
  scene.add(sunLight);scene.add(sunLight.target);
  const fill=new THREE.DirectionalLight(0x6688aa,.22);fill.position.set(-80,55,-60);scene.add(fill);
  environment=createEnvironmentSystem({
    THREE,scene,CFG,VISUAL_MAX,structureBoxes,
    registerTree:_regTree,
    registerPropMesh:mesh=>_propMeshes.push(mesh),
    registerShootableProp:prop=>shootableProps.push(prop),
    getPlayer:()=>playerObj,
    getSunLight:()=>sunLight
  });
  environment.createSkyEnvironment();

  playerObj=new THREE.Object3D();
  playerObj.position.set(0,CFG.playerHeight,0);
  playerObj.add(camera); scene.add(playerObj);

  precacheAssets();
  FX._init();
  environment.createWorld();
  setQuality(SETTINGS.quality,false);
  initWeapons();

  // Первые противники создаются после выбора сложности и нажатия «Начать охоту».

  // Initial loot
  const ammoTypes=['pistol','pistol','smg','shotgun','rifle','sniper','crossbow','bazooka','trap','mine','generic'];
  for(let i=0;i<CFG.initialPickups;i++){
    let pos;
    for(let a=0;a<12;a++){
      pos=new THREE.Vector3((Math.random()-.5)*CFG.worldSize*0.8,0,(Math.random()-.5)*CFG.worldSize*0.8);
      if(pos.length()>=18&&!isBlocked(pos,0.4))break;
    }
    if(!pos||pos.length()<18||isBlocked(pos,0.4))continue;
    const roll=Math.random();
    if(roll<0.25)spawnPickup(pos,'health');
    else if(roll<0.55)spawnPickup(pos,'ammo',ammoTypes[Math.floor(Math.random()*ammoTypes.length)]);
    else spawnWpnPickup(pos);
  }

  // Guaranteed nearby tactical weapons so the new mechanics are easy to discover.
  spawnWpnPickup(new THREE.Vector3(8,0,7),'trap');
  spawnWpnPickup(new THREE.Vector3(-8,0,7),'mine');

  // Spawn intervals
  setInterval(()=>{
    if(gameStarted&&!gamePaused&&!gameOver&&boars.length>0&&Math.random()<0.4){
      const alive=boars.filter(b=>!b.dead&&!b.removed);
      if(alive.length>0)snd('grunt');
    }
  },5000);

  // Events
  document.addEventListener('mousemove',e=>{
    if(!gameStarted||gamePaused||gameOver)return;
    if(document.pointerLockElement!==renderer.domElement)return;
    const sens=SETTINGS.sensitivity;
    playerObj.rotation.y-=e.movementX*sens;
    camera.rotation.x-=e.movementY*sens;
    weaponSwayX=Math.max(-.035,Math.min(.035,-e.movementX*.00028));
    weaponSwayY=Math.max(-.025,Math.min(.025,e.movementY*.00022));
    camera.rotation.x=Math.max(-Math.PI/2,Math.min(Math.PI/2,camera.rotation.x));
  });
  document.addEventListener('pointerlockchange',()=>{
    updateCursorState();
    if(document.pointerLockElement===renderer.domElement)return;
    if(gameStarted&&!gameOver&&!gamePaused&&!isUpgradeOpen()){
      lastPointerUnlockAt=performance.now();
      setPaused(true,false);
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.code==='Escape'){
      e.preventDefault();
      if(!gameStarted||gameOver||isUpgradeOpen())return;
      // При первом ESC браузер сам снимает pointer lock; событие не должно тут же закрыть паузу.
      if(document.pointerLockElement===renderer.domElement)return;
      if(gamePaused&&performance.now()-lastPointerUnlockAt<350)return;
      if(gamePaused)setPaused(false,true);
      else setPaused(true,false);
      return;
    }
    keys[e.code]=true;
    if(!gameStarted||gameOver||gamePaused)return;
    if(e.code==='Space'&&!e.repeat)jumpQueued=true;
    if(e.code==='KeyR'||e.code==='KeyK')reload();
    if(e.code>='Digit1'&&e.code<='Digit9')switchWeapon(parseInt(e.code[5])-1);
  });
  document.addEventListener('keyup',e=>{keys[e.code]=false;});
  document.addEventListener('mousedown',e=>{
    if(!gameStarted||gamePaused||gameOver)return;
    if(document.pointerLockElement!==renderer.domElement){requestPointerLockSafe();updateCursorState();return;}
    if(e.button===0){shooting=true;shootOnce=true;}
    if(e.button===2){
      P.aiming=true;
      document.getElementById('crosshair').classList.add('aim');
      const w=P.weapons[P.curWeapon];
      camera.fov=w&&w.zoom?w.zoom:45;
      camera.updateProjectionMatrix();
    }
  });
  document.addEventListener('wheel',e=>{
    if(!gameStarted||gamePaused||gameOver||document.pointerLockElement!==renderer.domElement||P.weapons.length<2)return;
    e.preventDefault();
    const dir=e.deltaY>0?1:-1;
    const next=(P.curWeapon+dir+P.weapons.length)%P.weapons.length;
    switchWeapon(next);
  },{passive:false});
  document.addEventListener('mouseup',e=>{
    if(e.button===0){shooting=false;shootOnce=false;}
    if(e.button===2){
      P.aiming=false;
      document.getElementById('crosshair').classList.remove('aim');
      camera.fov=75; camera.updateProjectionMatrix();
    }
  });
  document.addEventListener('contextmenu',e=>e.preventDefault());
  document.getElementById('start-btn').addEventListener('click',()=>{
    if(gameStarted)return;
    document.getElementById('start-screen').style.display='none';
    document.getElementById('hud').style.display='block';
    gameStarted=true;
    gamePaused=false;
    updateCursorState();
    spawnInitialBoars();
    startNewContract();
    resetCombatInput();
    requestPointerLockSafe();
    audio.resume();
  });
  document.getElementById('resume-btn').addEventListener('click',()=>setPaused(false,true));
  document.getElementById('restart-btn').addEventListener('click',()=>location.reload());
  document.querySelectorAll('.fullscreen-btn').forEach(btn=>btn.addEventListener('click',toggleFullscreen));
  document.addEventListener('fullscreenchange',updateFullscreenButtons);
  window.addEventListener('blur',()=>{if(gameStarted&&!gamePaused&&!gameOver&&!isUpgradeOpen())setPaused(true,false);else resetCombatInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&gameStarted&&!gamePaused&&!gameOver&&!isUpgradeOpen())setPaused(true,false);});
  window.addEventListener('resize',()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight,false);
  });

  updateCursorState();
  animate();
  document.documentElement.dataset.forestBoot='ready';
}

let _frameN=0;
function animate(){
  requestAnimationFrame(animate);
  _frameN++;
  const dt=Math.min(clock.getDelta(),0.1);
  if(gameStarted&&!gamePaused&&!gameOver){
    updateCombo(dt);
    spawnTimer+=dt*1000;
    if(spawnTimer>=CFG.respawnDelay*SETTINGS.diff.spawnMult){spawnTimer=0;spawnBoar();}
    updatePlayer(dt);
    updateAdaptivePerformance(dt);
    updateViewMotion(dt);
    environment.updateEnvironmentVisuals(dt);
    const pp=playerObj.position;
    for(let i=boars.length-1;i>=0;i--){if(!boars[i].removed)boars[i].update(dt,pp);}
    for(let i=pickups.length-1;i>=0;i--){
      const p=pickups[i];
      p.update(dt);
      if(p.age>CFG.pickupLifetime&&playerObj.position.distanceToSquared(p.mesh.position)>900)removePickupAt(i);
    }
    FX.update(dt);
    updateDeployables(dt);
    updateReloads(dt);
    if(_frameN%2===0)environment.updateCampfires(performance.now()*0.003);
    // Shoot handling
    const w=P.weapons[P.curWeapon];
    if(shooting&&w){
      if(w.auto)shoot();
      else if(shootOnce)shoot();
    }
    checkPickups();
    if(_frameN%4===0)updateHUD();
  }
  if(deathCinematic)updateDeathCinematic(dt);
  renderer.render(scene,camera);
}

init();
}
