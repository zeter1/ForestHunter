(()=>{
  'use strict';
  const root=globalThis.ForestHunter??=(Object.create(null));
  const core=root.core??=(Object.create(null));
  core.readJson=function readJson(key,fallback=null){
    try{
      const raw=localStorage.getItem(key);
      return raw===null?fallback:JSON.parse(raw);
    }catch{
      return fallback;
    }
  };
  core.writeJson=function writeJson(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));return true;}
    catch{return false;}
  };
})();
