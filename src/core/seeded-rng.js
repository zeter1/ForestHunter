(function attachForestSeededRng(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.core??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestSeededRng(){
  'use strict';

  function seedToUint32(seed){
    if(typeof seed==='number'&&Number.isFinite(seed)){
      const value=seed>>>0;
      return value||0x6d2b79f5;
    }
    const text=String(seed??'forest-hunter');
    let hash=2166136261>>>0;
    for(let i=0;i<text.length;i++){
      hash^=text.charCodeAt(i);
      hash=Math.imul(hash,16777619)>>>0;
    }
    return hash||0x6d2b79f5;
  }

  function createSeededRng(seed){
    let state=seedToUint32(seed);
    const random=()=>{
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      return state/4294967296;
    };
    random.state=()=>state>>>0;
    return random;
  }

  return {seedToUint32,createSeededRng};
});
