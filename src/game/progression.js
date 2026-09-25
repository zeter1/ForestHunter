(function attachForestProgression(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestProgression(){
  'use strict';

  function createUpgradeCatalog({getPlayer,getConfig,onRadar=()=>{},onArmorEnabled=()=>{}}){
    return {
      t1:[
        {id:'dmg',name:'💥 Убойность +20%',desc:'Урон всего оружия',tier:1,apply:()=>{const p=getPlayer();p.dmgMult+=.2;}},
        {id:'hp',name:'❤️ Макс. HP +40',desc:'Бонус к максимальному HP',tier:1,apply:()=>{const p=getPlayer();p.maxHp+=40;p.hp=Math.min(p.hp+40,p.maxHp);}},
        {id:'spd',name:'⚡ Скорость +15%',desc:'Быстрее ходить и бежать',tier:1,apply:()=>{const p=getPlayer();p.spdBonus+=getConfig().walkSpeed*.15;}},
        {id:'reload',name:'🔧 Перезарядка −20%',desc:'Быстрее перезаряжать',tier:1,apply:()=>{const p=getPlayer();p.reloadMult=Math.max(.15,p.reloadMult-.2);}},
        {id:'crit',name:'🎯 Крит. удар +12%',desc:'Шанс двойного урона',tier:1,apply:()=>{const p=getPlayer();p.critChance=Math.min(.65,p.critChance+.12);}},
        {id:'regen',name:'🌿 Регенерация +1.5/с',desc:'Автовосстановление HP',tier:1,apply:()=>{getPlayer().regen+=1.5;}}
      ],
      t2:[
        {id:'vamp',name:'🧛 Вампиризм',desc:'Лечение 10 HP за каждый kill',tier:2,apply:()=>{getPlayer().vampHeal+=10;}},
        {id:'mag',name:'📦 Двойной магазин',desc:'+50% к объёму магазинов',tier:2,apply:()=>{const p=getPlayer();p.magBonus+=.5;p.weapons.forEach(w=>{w.magazine=Math.round(w.baseMag*(1+p.magBonus));w.curAmmo=Math.min(w.curAmmo,w.magazine);});}},
        {id:'loot',name:'🎁 Охотничья удача',desc:'Кабаны роняют больше лута',tier:2,apply:()=>{getPlayer().lootMult+=.5;}},
        {id:'adr',name:'💊 Адреналин',desc:'Скорость ×1.5 при HP<30%',tier:2,apply:()=>{getPlayer().adrenaline=true;}},
        {id:'armor',name:'🛡️ Бронежилет',desc:'Входящий урон −18%',tier:2,apply:()=>{const p=getPlayer();p.armor=Math.min(.72,p.armor+.18);onArmorEnabled();}},
        {id:'instinct',name:'🦅 Охотничий инстинкт',desc:'Скорость+10%, перезарядка−10%',tier:2,apply:()=>{const p=getPlayer();p.spdBonus+=getConfig().walkSpeed*.1;p.reloadMult=Math.max(.1,p.reloadMult-.1);}}
      ],
      t3:[
        {id:'explode',name:'💣 Взрывные пули',desc:'Урон по площади 2.5м',tier:3,apply:()=>{getPlayer().explosive=true;}},
        {id:'berserk',name:'⚔️ Берсерк',desc:'Урон+40% при HP<50%',tier:3,apply:()=>{getPlayer().berserker=true;}},
        {id:'radar',name:'📡 Охотничий нюх',desc:'Видите кабанов сквозь стены',tier:3,apply:()=>{getPlayer().radar=true;onRadar();}},
        {id:'last',name:'⚡ Второй шанс',desc:'Один раз воскреснуть с 40% HP',tier:3,apply:()=>{getPlayer().lastStand=true;}},
        {id:'death',name:'☠️ Смертельный выстрел',desc:'Каждый 5й выстрел — тройной урон',tier:3,apply:()=>{getPlayer().deadlyShot=true;}},
        {id:'multi',name:'🔱 Рикошет',desc:'15% шанс тройного выстрела',tier:3,apply:()=>{const p=getPlayer();p.multiShot=Math.min(.6,p.multiShot+.15);}}
      ]
    };
  }

  function canOfferUpgrade(up,player){
    if(up.id==='adr')return !player.adrenaline;
    if(up.id==='explode')return !player.explosive;
    if(up.id==='berserk')return !player.berserker;
    if(up.id==='radar')return !player.radar;
    if(up.id==='last')return !player.lastStand;
    if(up.id==='death')return !player.deadlyShot;
    if(up.id==='armor')return player.armor<.7;
    if(up.id==='crit')return player.critChance<.65;
    if(up.id==='multi')return player.multiShot<.6;
    return true;
  }
  function upgradeCardCount(level){return Number(level)>=7?5:Number(level)>=4?4:3;}
  function advanceXpState(state,amount,options={}){
    let level=Math.max(1,Math.trunc(Number(state?.level)||1)),xp=Math.max(0,Number(state?.xp)||0),xpToNext=Math.max(1,Number(state?.xpToNext)||100),levelStreak=Math.max(0,Math.trunc(Number(state?.levelStreak)||0));
    let gained=0,shouldScheduleBoss=false,pending=Boolean(options.bossSpawnPending);
    xp+=Math.max(0,Number(amount)||0);
    while(xp>=xpToNext&&gained<12){
      xp-=xpToNext;level++;xpToNext=Math.floor(level*110);levelStreak++;gained++;
      if(options.canTriggerBoss&&levelStreak>=3&&!options.bossActive&&!pending){levelStreak=0;shouldScheduleBoss=true;pending=true;}
    }
    return {level,xp,xpToNext,levelStreak,gained,upgradeQueueDelta:gained,shouldScheduleBoss};
  }
  return {createUpgradeCatalog,canOfferUpgrade,upgradeCardCount,advanceXpState};
});
