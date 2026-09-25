(()=>{
  'use strict';
  const root=globalThis.ForestHunter??=(Object.create(null));
  const weapons=root.weapons??=(Object.create(null));
  weapons.WDEFS={
  pistol:  {name:'Пистолет',    type:'pistol',  dmg:42,  rof:3.5,  reload:1.2, mag:12, ammo:120, spread:0.016, auto:false, zoom:45},
  smg:     {name:'ПП «Бизон»',  type:'smg',     dmg:22,  rof:11,   reload:2.2, mag:30, ammo:180, spread:0.038, auto:true,  zoom:40},
  shotgun: {name:'Дробовик',    type:'shotgun', dmg:28,  rof:1.1,  reload:2.5, mag:8,  ammo:64,  spread:0.065, auto:false, zoom:42},
  rifle:   {name:'АКМ',         type:'rifle',   dmg:62,  rof:5.2,  reload:2.6, mag:20, ammo:120, spread:0.022, auto:true,  zoom:40},
  sniper:  {name:'СВД',         type:'sniper',  dmg:280, rof:0.75, reload:3.2, mag:5,  ammo:30,  spread:0.002, auto:false, zoom:14},
  crossbow:{name:'Арбалет',     type:'crossbow',dmg:420, rof:0.42, reload:2.8, mag:1,  ammo:20,  spread:0.004, auto:false, zoom:38},
  bazooka: {name:'Базука',      type:'bazooka', dmg:260, rof:0.38, reload:3.4, mag:1,  ammo:10,  spread:0.006, auto:false, zoom:38, blastRadius:7.0, blastDmg:520},
  trap:    {name:'Капкан',       type:'trap',    dmg:320, rof:0.7,  reload:1.0, mag:1,  ammo:7,   spread:0,     auto:false, zoom:58, deployable:true},
  mine:    {name:'Мина',         type:'mine',    dmg:680, rof:0.5,  reload:1.35,mag:1,  ammo:5,   spread:0,     auto:false, zoom:58, deployable:true, blastRadius:7.2},
};
  weapons.AMMO_COLORS={pistol:0xffcc00, smg:0x00ccff, shotgun:0xff6600, rifle:0x00ff66, sniper:0x4488ff, crossbow:0xcc44ff, bazooka:0xff3322, trap:0xb87333, mine:0xff4444, generic:0xccaa00};
  weapons.AMMO_NAMES={pistol:'9мм', smg:'9мм пп', shotgun:'дробь', rifle:'7.62мм', sniper:'12.7мм', crossbow:'стрелы', bazooka:'ракеты', trap:'капканы', mine:'мины'};
})();
