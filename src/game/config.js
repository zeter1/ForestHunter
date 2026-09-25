(()=>{
  'use strict';
  const root=globalThis.ForestHunter??=(Object.create(null));
  const game=root.game??=(Object.create(null));
  game.CFG={
  worldSize:400, treeCount:160, startBoars:3, maxBoars:8, maxAttackers:2,
  gravity:28, walkSpeed:6.5, runSpeed:12, playerHeight:1.72,
  playerHp:100, spawnRadiusMin:45, spawnRadiusMax:110, respawnDelay:10500,
  initialPickups:55, maxPickups:70, pickupLifetime:180, comboSeconds:4.5,
  maxTraps:4, maxMines:4, deployableLifetime:105
};
})();
