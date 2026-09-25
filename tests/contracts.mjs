import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const ai=require('../src/ai/boar-brain.js');
const combat=require('../src/weapons/combat-rules.js');
const geometry=require('../src/weapons/geometry.js');
const progression=require('../src/game/progression.js');
const hud=require('../src/ui/hud-model.js');

assert.equal(ai.chooseVariant(1,.1),'normal');
assert.equal(ai.chooseVariant(2,.4),'runner');
assert.equal(ai.chooseVariant(3,.2),'armored');
assert.equal(ai.chooseVariant(5,.1),'rabid');
assert.equal(ai.boarCap(1,{startBoars:2,maxBoars:8},0),2);
assert.equal(ai.boarCap(30,{startBoars:2,maxBoars:8},4),10);
assert.equal(ai.canJoinAttack([{state:ai.BS.ATTACK,dead:false,dying:false,removed:false}],{},1,0),false);
assert.deepEqual(ai.queueMovementDecision(10,2.5,3.2,8),{direction:1,speed:4.16});
assert.deepEqual(ai.queueMovementDecision(3,2.5,3.2,8),{direction:-1,speed:2.8});
assert.equal(ai.chargeSpeed(10,'runner'),24);
assert.equal(ai.chargeSpeed(5,'normal'),16);

const weapon=combat.createWeapon({type:'rifle',mag:30,ammo:90,rof:600,reload:2,dmg:20,spread:.1});
assert.equal(weapon.curAmmo,30);assert.equal(weapon.totalAmmo,90);
assert.equal(combat.weaponFireGate(weapon,{shootOnce:true,now:2000}),'ready');
weapon.curAmmo=0;assert.equal(combat.weaponFireGate(weapon,{shootOnce:true,now:2000}),'empty');
weapon.curAmmo=10;
const shot=combat.computeShotDamage({baseDamage:20,dmgMult:1.5,berserker:true,hp:40,maxHp:100,deadlyShot:true,shotCount:5,critChance:.5,critRoll:.2});
assert.equal(shot.damage,252);assert.equal(shot.deadly,true);assert.equal(shot.critical,true);
assert.ok(Math.abs(combat.shotSpread(.1,true)-.022)<1e-12);
assert.equal(combat.beginReloadState(weapon,.5),true);
weapon.reloadLeft=weapon.reloadDuration/2;assert.equal(combat.reloadProgress(weapon),50);
weapon.curAmmo=10;weapon.totalAmmo=15;weapon.magazine=30;assert.equal(combat.finishReloadState(weapon),15);assert.equal(weapon.curAmmo,25);assert.equal(weapon.totalAmmo,0);
assert.equal(combat.deployableLimit('trap',{maxTraps:3,maxMines:4}),3);
assert.equal(combat.deployableTriggerRadius('mine'),1.65);
assert.equal(combat.blastFalloff(100,5,10),50);
assert.equal(combat.blastFalloff(100,11,10),0);

assert.equal(geometry.rayCircleDistanceXZ({origin:{x:0,y:1,z:0},direction:{x:1,y:0,z:0}},{x:5,z:0},1,20,3),4);
assert.equal(geometry.rayCircleDistanceXZ({origin:{x:0,y:4,z:0},direction:{x:1,y:0,z:0}},{x:5,z:0},1,20,3),null);

const xp=progression.advanceXpState({level:1,xp:0,xpToNext:100,levelStreak:0},700,{canTriggerBoss:true,bossActive:false,bossSpawnPending:false});
assert.equal(xp.gained,3);assert.equal(xp.shouldScheduleBoss,true);assert.equal(xp.upgradeQueueDelta,3);
assert.equal(progression.upgradeCardCount(3),3);assert.equal(progression.upgradeCardCount(4),4);assert.equal(progression.upgradeCardCount(7),5);
assert.equal(progression.canOfferUpgrade({id:'radar'},{radar:true}),false);
assert.equal(progression.canOfferUpgrade({id:'radar'},{radar:false}),true);

const playerHud=hud.buildPlayerHud({hp:50,maxHp:100,armor:.18,xp:25,xpToNext:100});
assert.equal(playerHud.hpPct,50);assert.equal(playerHud.xpPct,25);assert.equal(playerHud.armorLabel,'🛡 БРОНЯ −18%');
const deployHud=hud.buildDeployableHud(1,2,{maxTraps:3,maxMines:4});
assert.equal(deployHud.visible,true);assert.equal(deployHud.text,'🪤 1/3   💣 2/4');
assert.equal(hud.countAliveBoars([{dead:false,removed:false},{dead:true,removed:false},{dead:false,removed:true}]),1);

console.log('Forest Hunter gameplay contract tests passed.');
