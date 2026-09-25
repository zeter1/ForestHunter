(function attachForestCombatRules(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.weapons??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestCombatRules(){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

  function createWeapon(def){
    return {...def,curAmmo:def.mag,baseMag:def.mag,magazine:def.mag,totalAmmo:def.ammo,lastShot:0,reloading:false,reloadLeft:0,reloadDuration:0,model:null};
  }
  function weaponFireGate(weapon,{shootOnce=false,now=0}={}){
    if(!weapon||weapon.reloading)return 'blocked';
    if(!weapon.auto&&!shootOnce)return 'blocked';
    if(Number(now)-Number(weapon.lastShot||0)<1000/Math.max(1,Number(weapon.rof)||1))return 'blocked';
    if(Number(weapon.curAmmo||0)<=0)return 'empty';
    return 'ready';
  }
  function computeShotDamage({baseDamage,dmgMult=1,berserker=false,hp=0,maxHp=1,deadlyShot=false,shotCount=0,critChance=0,critRoll=1}){
    let damage=(Number(baseDamage)||0)*(Number(dmgMult)||1);
    const berserk=Boolean(berserker)&&Number(hp)<Number(maxHp)*.5;if(berserk)damage*=1.4;
    const deadly=Boolean(deadlyShot)&&Number(shotCount)>0&&Number(shotCount)%5===0;if(deadly)damage*=3;
    const critical=Number(critRoll)<clamp(Number(critChance)||0,0,1);if(critical)damage*=2;
    return {damage,berserk,deadly,critical};
  }
  function shotSpread(baseSpread,aiming){return Math.max(0,Number(baseSpread)||0)*(aiming?.22:1);}
  function beginReloadState(weapon,reloadMult=1){
    if(!weapon||weapon.reloading||weapon.curAmmo===weapon.magazine||weapon.totalAmmo<=0)return false;
    weapon.reloading=true;weapon.reloadDuration=Math.max(.05,(Number(weapon.reload)||0)*(Number(reloadMult)||1));weapon.reloadLeft=weapon.reloadDuration;return true;
  }
  function finishReloadState(weapon){
    if(!weapon)return 0;
    const need=Math.max(0,Number(weapon.magazine||0)-Number(weapon.curAmmo||0));
    const take=Math.min(need,Math.max(0,Number(weapon.totalAmmo||0)));
    weapon.curAmmo+=take;weapon.totalAmmo-=take;weapon.reloading=false;weapon.reloadLeft=0;weapon.reloadDuration=0;return take;
  }
  function reloadProgress(weapon){
    if(!weapon||!weapon.reloading||weapon.reloadDuration<=0)return 0;
    return clamp((1-weapon.reloadLeft/weapon.reloadDuration)*100,0,100);
  }
  function deployableLimit(type,cfg){return type==='trap'?Number(cfg?.maxTraps||0):Number(cfg?.maxMines||0);}
  function deployableTriggerRadius(type){return type==='trap'?1.35:1.65;}
  function blastFalloff(baseDamage,distance,radius){
    const r=Math.max(.0001,Number(radius)||0);
    return Math.max(0,(Number(baseDamage)||0)*(1-Math.max(0,Number(distance)||0)/r));
  }
  return {createWeapon,weaponFireGate,computeShotDamage,shotSpread,beginReloadState,finishReloadState,reloadProgress,deployableLimit,deployableTriggerRadius,blastFalloff};
});
