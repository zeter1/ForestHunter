(function attachForestBoarBrain(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.ai??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestBoarBrain(){
  'use strict';
  const BS={IDLE:0,PATROL:1,ALERT:2,CHASE:3,CHARGE:4,ATTACK:5};
  const ACTIVE_ATTACK_STATES=new Set([BS.CHARGE,BS.ATTACK]);

  function canJoinAttack(boars,boar,maxAttackers,attackerBonus=0){
    const active=(boars||[]).filter(other=>other!==boar&&!other.dead&&!other.dying&&!other.removed&&ACTIVE_ATTACK_STATES.has(other.state)).length;
    return active<Math.max(1,(Number(maxAttackers)||0)+(Number(attackerBonus)||0));
  }
  function queueMovementDecision(distance,attackRange,queueHoldDist,speed){
    const hold=(Number(attackRange)||0)+(Number(queueHoldDist)||0);
    const d=Number(distance)||0,base=Math.max(0,Number(speed)||0);
    if(d>hold)return {direction:1,speed:base*.52};
    if(d<hold-1.2)return {direction:-1,speed:base*.35};
    return {direction:0,speed:0};
  }
  function chargeSpeed(speed,variantKey){return Math.min((Number(speed)||0)*3.2,variantKey==='runner'?24:28);}
  function chooseVariant(level,randomValue){
    const r=Math.max(0,Math.min(1,Number(randomValue)||0)),l=Math.max(1,Math.trunc(Number(level)||1));
    if(l>=5&&r<.13)return 'rabid';
    if(l>=3&&r<.31)return 'armored';
    if(l>=2&&r<.56)return 'runner';
    return 'normal';
  }
  function boarCap(level,cfg,capBonus=0){
    const l=Math.max(1,Math.trunc(Number(level)||1));
    const hardMax=(Number(cfg?.maxBoars)||8)+2;
    return Math.max(2,Math.min(hardMax,(Number(cfg?.startBoars)||2)+Math.floor((l-1)/2)+(Number(capBonus)||0)));
  }
  return {BS,ACTIVE_ATTACK_STATES,canJoinAttack,queueMovementDecision,chargeSpeed,chooseVariant,boarCap};
});
