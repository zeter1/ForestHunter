(()=>{
  'use strict';
  const root=globalThis.ForestHunter??=(Object.create(null));
  const ai=root.ai??=(Object.create(null));
  ai.DIFFICULTIES={
  easy:  {label:'Лёгкая',enemyHp:0.78,enemyDmg:0.72,enemySpeed:0.92,spawnMult:1.25,capBonus:-1,attackerBonus:-1,scoreMult:0.85},
  normal:{label:'Нормальная',enemyHp:1,enemyDmg:1,enemySpeed:1,spawnMult:1,capBonus:0,attackerBonus:0,scoreMult:1},
  hard:  {label:'Тяжёлая',enemyHp:1.28,enemyDmg:1.22,enemySpeed:1.08,spawnMult:0.78,capBonus:2,attackerBonus:1,scoreMult:1.25}
};
  ai.BOAR_VARIANTS={
  normal:{name:'Кабан',hp:1,speed:1,dmg:1,scale:1,score:100,xp:80,skin:0x3d2817,dark:0x1f160f},
  runner:{name:'Быстрый кабан',hp:0.68,speed:1.48,dmg:0.82,scale:0.88,score:135,xp:95,skin:0x8a4d18,dark:0x3b1e09},
  armored:{name:'Бронированный кабан',hp:1.85,speed:0.74,dmg:1.2,scale:1.2,score:195,xp:125,skin:0x4f5558,dark:0x22282b},
  rabid:{name:'Бешеный кабан',hp:1.18,speed:1.2,dmg:1.58,scale:1.06,score:230,xp:145,skin:0x781818,dark:0x300707}
};
})();
