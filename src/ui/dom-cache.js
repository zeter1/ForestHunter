(()=>{
  'use strict';
  const root=globalThis.ForestHunter??=(Object.create(null));
  const ui=root.ui??=(Object.create(null));

  ui.createDomCache=function createDomCache(doc=document){
    const DOM={};
    function cacheDom(){
      DOM.wname=doc.getElementById('wname');
      DOM.wstats=doc.getElementById('wstats');
      DOM.curAmmo=doc.getElementById('cur-ammo');
      DOM.totAmmo=doc.getElementById('tot-ammo');
      DOM.hpFill=doc.getElementById('hp-fill');
      DOM.hpText=doc.getElementById('hp-text');
      DOM.armorText=doc.getElementById('armor-text');
      DOM.scoreSpan=doc.querySelector('#score span');
      DOM.bcountSpan=doc.querySelector('#bcount span');
      DOM.kcountSpan=doc.querySelector('#kcount span');
      DOM.lvlSpan=doc.querySelector('#lvl span');
      DOM.xpFill=doc.getElementById('xp-fill');
      DOM.reloadWrap=doc.getElementById('reload-wrap');
      DOM.reloadFill=doc.getElementById('reload-fill');
      DOM.contract=doc.getElementById('contract');
      DOM.combo=doc.getElementById('combo');
      DOM.damageArrow=doc.getElementById('damage-arrow');
      DOM.eventFeed=doc.getElementById('event-feed');
      DOM.upgradeCountdown=doc.getElementById('upgrade-countdown');
      DOM.upgradeCountNumber=doc.getElementById('upgrade-count-number');
      DOM.upgradeCountLabel=doc.getElementById('upgrade-count-label');
      DOM.upgradeCountHint=doc.getElementById('upgrade-count-hint');
      DOM.lowHpPulse=doc.getElementById('lowhp-pulse');
      DOM.deployableStatus=doc.getElementById('deployable-status');
      DOM.slots=null; // set after DOM ready
    }
    return {DOM,cacheDom};
  };
})();
