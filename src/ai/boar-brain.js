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

  function stepBoarState(state,context,dt,rng=Math.random){
    const step=Math.max(0,Number(dt)||0);
    const next={
      state:Number(state?.state)||BS.IDLE,
      idleT:Number(state?.idleT)||0,
      alertTimer:Number(state?.alertTimer)||0,
      chargeCooldown:Number(state?.chargeCooldown)||0,
      chargeT:Number(state?.chargeT)||0,
      attackCooldown:Number(state?.attackCooldown)||0,
      isBoss:Boolean(state?.isBoss),
      attackRange:Math.max(0,Number(state?.attackRange)||0),
      alertRadius:Math.max(0,Number(state?.alertRadius)||0)
    };
    const distance=Math.max(0,Number(context?.distance)||0);
    const canAttack=Boolean(context?.canAttack);
    let action='none';
    let newPatrolOffset=null;
    let alertPulse=false;
    let captureChargeDirection=false;
    let attack=false;
    let chargeExpired=false;

    switch(next.state){
      case BS.IDLE:
        next.idleT-=step;
        if(distance<next.alertRadius)next.state=BS.CHASE;
        else if(next.idleT<=0){
          next.state=BS.PATROL;
          newPatrolOffset={x:(rng()-0.5)*35,z:(rng()-0.5)*35};
          next.idleT=3+rng()*4;
        }
        break;
      case BS.PATROL:
        if(distance<next.alertRadius)next.state=BS.CHASE;
        else if(!context?.hasPatrolTarget)next.state=BS.IDLE;
        else if(Number(context?.patrolDistance)<1.2){
          next.state=BS.IDLE;
          next.idleT=1.5+rng()*2;
        }else{
          action='patrol';
          next.idleT-=step;
          if(next.idleT<=0)next.state=BS.IDLE;
        }
        break;
      case BS.ALERT:
        next.alertTimer+=step;
        if(next.alertTimer>0.5){
          next.alertTimer=0;
          alertPulse=true;
        }
        if(distance<next.alertRadius||next.isBoss)next.state=BS.CHASE;
        else if(distance>next.alertRadius*1.6)next.state=BS.PATROL;
        break;
      case BS.CHASE:
        next.chargeCooldown-=step;
        if(!canAttack)action='queue';
        else if(next.chargeCooldown<=0&&distance<30&&distance>4&&!next.isBoss){
          next.state=BS.CHARGE;
          next.chargeT=0.95;
          next.chargeCooldown=3+rng()*2.6;
          captureChargeDirection=true;
        }else if(distance<next.attackRange){
          next.state=BS.ATTACK;
          next.attackCooldown=Math.max(next.attackCooldown,0.34);
        }else action='chase';
        break;
      case BS.CHARGE:
        if(!canAttack){
          next.state=BS.CHASE;
          next.chargeT=0;
        }else{
          next.chargeT-=step;
          action=next.chargeT>0.65?'chargeWindup':'chargeMove';
          if(next.chargeT<=0){
            next.state=BS.CHASE;
            chargeExpired=true;
          }
        }
        break;
      case BS.ATTACK:
        if(!canAttack)next.state=BS.CHASE;
        else{
          next.attackCooldown-=step;
          if(next.attackCooldown<=0){
            attack=true;
            next.attackCooldown=0.85;
          }
          if(distance>next.attackRange+1)next.state=BS.CHASE;
        }
        break;
    }

    return {...next,action,newPatrolOffset,alertPulse,captureChargeDirection,attack,chargeExpired};
  }

  return {BS,ACTIVE_ATTACK_STATES,canJoinAttack,queueMovementDecision,chargeSpeed,chooseVariant,boarCap,stepBoarState};
});
