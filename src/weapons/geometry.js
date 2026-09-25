(function attachForestWeaponGeometry(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.weapons??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestWeaponGeometry(){
  'use strict';
  function rayCircleDistanceXZ(ray,center,radius,maxDist,height){
    const ox=(Number(ray?.origin?.x)||0)-(Number(center?.x)||0),oz=(Number(ray?.origin?.z)||0)-(Number(center?.z)||0);
    const dx=Number(ray?.direction?.x)||0,dz=Number(ray?.direction?.z)||0,a=dx*dx+dz*dz;
    if(a<1e-8)return null;
    const r=Math.max(0,Number(radius)||0),b=2*(ox*dx+oz*dz),cc=ox*ox+oz*oz-r*r,disc=b*b-4*a*cc;
    if(disc<0)return null;
    const root=Math.sqrt(disc);let t=(-b-root)/(2*a);if(t<0)t=(-b+root)/(2*a);
    if(t<0||t>Number(maxDist))return null;
    const y=(Number(ray?.origin?.y)||0)+(Number(ray?.direction?.y)||0)*t;
    if(y<.02||y>Number(height))return null;
    return t;
  }
  return {rayCircleDistanceXZ};
});
