import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const {createSeededRng}=require('../src/core/seeded-rng.js');
const ai=require('../src/ai/boar-brain.js');
const combat=require('../src/weapons/combat-rules.js');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/forest-replay.json',import.meta.url),'utf8'));

const close=(actual,expected,tolerance=1e-6,message='')=>{
  assert.ok(Math.abs(actual-expected)<=tolerance,`${message} expected ${expected}, got ${actual}`);
};

{
  const spec=fixture.boar;
  const rng=createSeededRng(spec.seed);
  let state={...spec.state};
  const actions={chase:0,chargeWindup:0,chargeMove:0,attack:0,capture:0,expired:0};
  for(let frame=0;frame<spec.frames;frame++){
    const phase=spec.phases.find(item=>frame<item.untilFrame)||spec.phases.at(-1);
    const decision=ai.stepBoarState(state,{
      distance:phase.distance,canAttack:phase.canAttack,
      hasPatrolTarget:false,patrolDistance:Infinity
    },spec.dt,rng);
    if(actions[decision.action]!==undefined)actions[decision.action]++;
    if(decision.attack)actions.attack++;
    if(decision.captureChargeDirection)actions.capture++;
    if(decision.chargeExpired)actions.expired++;
    state={
      state:decision.state,idleT:decision.idleT,alertTimer:decision.alertTimer,
      chargeCooldown:decision.chargeCooldown,chargeT:decision.chargeT,attackCooldown:decision.attackCooldown,
      isBoss:decision.isBoss,attackRange:decision.attackRange,alertRadius:decision.alertRadius
    };
  }
  assert.equal(state.state,spec.expected.state);
  close(state.chargeCooldown,spec.expected.chargeCooldown,1e-9,'charge cooldown');
  close(state.chargeT,spec.expected.chargeT,1e-9,'charge timer');
  close(state.attackCooldown,spec.expected.attackCooldown,1e-9,'attack cooldown');
  assert.deepEqual(actions,spec.expected.actions);
}

{
  const spec=fixture.shots;
  const rng=createSeededRng(spec.seed);
  let criticals=0,deadly=0,totalDamage=0;
  for(let shotCount=1;shotCount<=spec.count;shotCount++){
    const result=combat.rollShotDamage({...spec.options,shotCount},rng);
    if(result.critical)criticals++;
    if(result.deadly)deadly++;
    totalDamage+=result.damage;
  }
  assert.equal(criticals,spec.expected.criticals);
  assert.equal(deadly,spec.expected.deadly);
  close(totalDamage,spec.expected.totalDamage,1e-9,'seeded damage total');
}

{
  const spec=fixture.reload;
  const weapon={...spec.weapon};
  assert.equal(combat.beginReloadState(weapon,spec.reloadMult),true);
  let frames=0;
  while(weapon.reloading&&frames<100){
    combat.stepReloadFrame(weapon,spec.dt);
    frames++;
  }
  assert.equal(frames,spec.expected.frames);
  assert.equal(weapon.curAmmo,spec.expected.curAmmo);
  assert.equal(weapon.totalAmmo,spec.expected.totalAmmo);
}

for(const sample of fixture.hitSelection){
  assert.equal(combat.selectHitCandidate(sample.input).type,sample.expected);
}

{
  const mine={type:'mine',age:0.9,armTime:1.05,triggered:false};
  const state=combat.advanceDeployableState(mine,0.2,180);
  assert.equal(state.armed,true);
  const target=combat.selectDeployableTarget([
    {index:3,distanceSq:4},
    {index:5,distanceSq:1.44},
    {index:7,distanceSq:2.2}
  ],state.radius);
  assert.equal(target.targetIndex,5);
}

console.log('Forest Hunter deterministic replay scenarios passed.');
