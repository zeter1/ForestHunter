(function attachForestHudModel(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.ui??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestHudModel(){
  'use strict';
  const pct=(value,total)=>Number(total)>0?Math.max(0,Math.min(100,Number(value||0)/Number(total)*100)):0;
  function buildPlayerHud(player){
    return {
      hpPct:pct(player?.hp,player?.maxHp),
      hpLabel:`ЗДОРОВЬЕ ${Math.ceil(Math.max(0,Number(player?.hp)||0))} / ${Number(player?.maxHp)||0}`,
      armorLabel:`🛡 БРОНЯ −${Math.round((Number(player?.armor)||0)*100)}%`,
      xpPct:pct(player?.xp,player?.xpToNext)
    };
  }
  function buildWeaponHud(weapon,dmgMult,installed,cfg,ammoNames){
    const dmgTxt=Math.round((Number(weapon?.dmg)||0)*(Number(dmgMult)||1));
    const max=weapon?.type==='trap'?Number(cfg?.maxTraps||0):Number(cfg?.maxMines||0);
    return {damage:dmgTxt,stats:weapon?.deployable?`Урон: ${dmgTxt} | Установлено: ${Number(installed)||0}/${max}`:`Урон: ${dmgTxt} | ${ammoNames?.[weapon?.type]||''}`};
  }
  function buildContractHud(contract){
    return contract
      ?`<strong>${contract.completed?'КОНТРАКТ ВЫПОЛНЕН':String(contract.title||'').toUpperCase()}</strong><span>${contract.desc}: ${contract.progress} / ${contract.target}<br>Награда: ${contract.rewardScore} очков + припасы</span>`
      :'<strong>КОНТРАКТ</strong><span>Будет выдан после начала охоты</span>';
  }
  function buildDeployableHud(traps,mines,cfg){
    const tc=Number(traps)||0,mc=Number(mines)||0;
    return {visible:Boolean(tc||mc),text:`🪤 ${tc}/${Number(cfg?.maxTraps||0)}   💣 ${mc}/${Number(cfg?.maxMines||0)}`};
  }
  function countAliveBoars(boars){return (boars||[]).filter(b=>!b.dead&&!b.removed).length;}
  return {buildPlayerHud,buildWeaponHud,buildContractHud,buildDeployableHud,countAliveBoars};
});
