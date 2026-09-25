(function attachForestEnvironment(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.ForestHunter??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createForestEnvironmentModule(){
  'use strict';

  function createEnvironmentSystem({
    THREE,scene,CFG,VISUAL_MAX,structureBoxes,
    registerTree,registerPropMesh,registerShootableProp,
    getPlayer,getSunLight
  }){
    let skyDome=null,sunDisc=null,grassMesh=null,dustField=null,distantHills=null;
    const campfires=[];

    // ===== WORLD =====
    function createWorld(){
      // Low-poly terrain with vertex color variation: more depth without textures or network assets.
      const geo=new THREE.PlaneGeometry(CFG.worldSize,CFG.worldSize,28,28);
      const pos=geo.attributes.position;
      const colors=[];
      const cDark=new THREE.Color(0x28470f),cMid=new THREE.Color(0x426b18),cDry=new THREE.Color(0x6d6a22);
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i);
        const h=Math.sin(x*0.055)*Math.cos(y*0.055)*0.7+Math.sin(x*0.12+y*0.08)*0.25+Math.sin((x-y)*.025)*.16;
        pos.setZ(i,h);
        const moisture=(Math.sin(x*.041)+Math.cos(y*.037)+2)/4;
        const col=cDark.clone().lerp(cMid,.35+moisture*.55).lerp(cDry,Math.max(0,h-.45)*.28);
        colors.push(col.r,col.g,col.b);
      }
      geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geo.computeVertexNormals();
      const groundMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:0});
      const ground=new THREE.Mesh(geo,groundMat);
      ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    
      // Irregular dirt clearings. They remain cheap flat meshes and help navigation.
      const dirtMats=[0x6a511c,0x80672b,0x57451d].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1,transparent:true,opacity:.54,depthWrite:false}));
      for(let i=0;i<13;i++){
        const dp=new THREE.Mesh(new THREE.CircleGeometry(4+Math.random()*5,14),dirtMats[i%dirtMats.length]);
        dp.rotation.x=-Math.PI/2;dp.scale.set(1.4+Math.random(),.75+Math.random()*.55,1);
        dp.position.set((Math.random()-.5)*300,0.018,(Math.random()-.5)*300);dp.rotation.z=Math.random()*Math.PI;
        scene.add(dp);
      }
    
      createTreesInstanced(CFG.treeCount);
      createBushesInstanced(90);
      createRocksInstanced(30);
      createGrassInstanced();
      createDistantHills();
      createDecorations();
    }
    
    function createSkyEnvironment(){
      const geo=new THREE.SphereGeometry(430,28,16);
      const mat=new THREE.ShaderMaterial({
        side:THREE.BackSide,depthWrite:false,fog:false,
        uniforms:{top:{value:new THREE.Color(0x477fb2)},horizon:{value:new THREE.Color(0xc4d6d0)},bottom:{value:new THREE.Color(0x8ca87b)},sunDir:{value:new THREE.Vector3(.55,.72,.38).normalize()}},
        vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'uniform vec3 top;uniform vec3 horizon;uniform vec3 bottom;uniform vec3 sunDir;varying vec3 vPos;void main(){vec3 n=normalize(vPos);float h=clamp(n.y*.5+.5,0.0,1.0);vec3 col=mix(bottom,horizon,smoothstep(.05,.48,h));col=mix(col,top,smoothstep(.42,.92,h));float sun=pow(max(dot(n,sunDir),0.0),420.0);col+=vec3(1.0,.72,.34)*sun*1.45;gl_FragColor=vec4(col,1.0);}'
      });
      skyDome=new THREE.Mesh(geo,mat);scene.add(skyDome);
      sunDisc=new THREE.Mesh(new THREE.SphereGeometry(7,12,8),new THREE.MeshBasicMaterial({color:0xffe5a3,fog:false}));
      sunDisc.position.set(235,305,160);scene.add(sunDisc);
      createDustField();
    }
    function createGrassInstanced(){
      const geo=new THREE.ConeGeometry(.105,.72,3);geo.translate(0,.36,0);
      grassMesh=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({color:0x4b741d,side:THREE.DoubleSide}),VISUAL_MAX.grass);
      const dummy=new THREE.Object3D();let placed=0;
      for(let a=0;a<VISUAL_MAX.grass*4&&placed<VISUAL_MAX.grass;a++){
        const x=(Math.random()-.5)*CFG.worldSize*.92,z=(Math.random()-.5)*CFG.worldSize*.92;
        if(Math.abs(x)<10&&Math.abs(z)<10)continue;
        if(isBlocked(new THREE.Vector3(x,0,z),.08))continue;
        const s=.45+Math.random()*.8;dummy.position.set(x,.01,z);dummy.scale.set(s,.55+Math.random()*.85,s);dummy.rotation.y=Math.random()*Math.PI*2;dummy.updateMatrix();grassMesh.setMatrixAt(placed++,dummy.matrix);
      }
      grassMesh.instanceMatrix.needsUpdate=true;grassMesh.castShadow=false;grassMesh.receiveShadow=false;scene.add(grassMesh);
    }
    function createDistantHills(){
      const count=30,geo=new THREE.ConeGeometry(18,34,7),mat=new THREE.MeshLambertMaterial({color:0x31512a,flatShading:true});
      distantHills=new THREE.InstancedMesh(geo,mat,count);const dummy=new THREE.Object3D();
      for(let i=0;i<count;i++){
        const a=i/count*Math.PI*2+(Math.random()-.5)*.13,r=225+Math.random()*36,s=.65+Math.random()*.9;
        dummy.position.set(Math.cos(a)*r,2+Math.random()*4,Math.sin(a)*r);dummy.scale.set(s,.65+Math.random()*.8,s);dummy.rotation.y=Math.random()*Math.PI;dummy.updateMatrix();distantHills.setMatrixAt(i,dummy.matrix);
      }
      distantHills.instanceMatrix.needsUpdate=true;scene.add(distantHills);
    }
    function createDustField(){
      const arr=new Float32Array(VISUAL_MAX.dust*3);
      for(let i=0;i<VISUAL_MAX.dust;i++){arr[i*3]=(Math.random()-.5)*260;arr[i*3+1]=.5+Math.random()*13;arr[i*3+2]=(Math.random()-.5)*260;}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(arr,3));
      dustField=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffe9bd,size:.07,transparent:true,opacity:.36,depthWrite:false,blending:THREE.AdditiveBlending}));
      scene.add(dustField);
    }
    function updateEnvironmentVisuals(dt){
      const player=getPlayer();
      const light=getSunLight();
      if(!player)return;
      if(dustField&&dustField.visible){dustField.rotation.y+=dt*.003;dustField.position.x=player.position.x*.08;dustField.position.z=player.position.z*.08;}
      if(skyDome){skyDome.position.x=player.position.x*.12;skyDome.position.z=player.position.z*.12;}
      if(light){
        light.position.set(player.position.x+80,140,player.position.z+60);
        light.target.position.set(player.position.x,0,player.position.z);
        light.target.updateMatrixWorld();
      }
    }
    
    // ===== INSTANCED TREES (9 draw calls for 160 trees) =====
    function createTreesInstanced(count){
      const normCount=Math.round(count*0.75);
      const pineCount=count-normCount;
    
      const imNT=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22,0.4,3.2,7),new THREE.MeshLambertMaterial({color:0x4a3728}),normCount);
      const imNL1=new THREE.InstancedMesh(new THREE.ConeGeometry(1.7,2.5,7),new THREE.MeshLambertMaterial({color:0x2a7a25}),normCount);
      const imNL2=new THREE.InstancedMesh(new THREE.ConeGeometry(1.3,2.5,7),new THREE.MeshLambertMaterial({color:0x257520}),normCount);
      const imNL3=new THREE.InstancedMesh(new THREE.ConeGeometry(0.9,2.5,7),new THREE.MeshLambertMaterial({color:0x1e6018}),normCount);
      const imPT=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16,0.28,4,6), new THREE.MeshLambertMaterial({color:0x5a4030}),pineCount);
      const imPL1=new THREE.InstancedMesh(new THREE.ConeGeometry(0.9,2,6), new THREE.MeshLambertMaterial({color:0x155a15}),pineCount);
      const imPL2=new THREE.InstancedMesh(new THREE.ConeGeometry(1.5,2,6), new THREE.MeshLambertMaterial({color:0x115511}),pineCount);
      const imPL3=new THREE.InstancedMesh(new THREE.ConeGeometry(1.1,2,6), new THREE.MeshLambertMaterial({color:0x0d4a0d}),pineCount);
      const imPL4=new THREE.InstancedMesh(new THREE.ConeGeometry(0.7,2,6), new THREE.MeshLambertMaterial({color:0x0a3d0a}),pineCount);
    
      const dummy=new THREE.Object3D();
      const setM=(im,idx,x,y,z,s,ry)=>{
        dummy.position.set(x,y,z); dummy.scale.set(s,s,s);
        dummy.rotation.set(0,ry,0); dummy.updateMatrix();
        im.setMatrixAt(idx,dummy.matrix);
      };
    
      let ni=0,pi=0;
      for(let att=0;att<count*6&&(ni<normCount||pi<pineCount);att++){
        const x=(Math.random()-.5)*CFG.worldSize*0.92;
        const z=(Math.random()-.5)*CFG.worldSize*0.92;
        if(Math.abs(x)<14&&Math.abs(z)<14)continue;
        const s=0.82+Math.random()*0.55, ry=Math.random()*Math.PI*2;
        const doNorm=ni<normCount&&(pi>=pineCount||Math.random()<0.75);
        if(doNorm){
          setM(imNT,ni,x,1.6*s,z,s,ry); setM(imNL1,ni,x,3.1*s,z,s,ry);
          setM(imNL2,ni,x,4.4*s,z,s,ry); setM(imNL3,ni,x,5.3*s,z,s,ry);
          registerTree(x,z); ni++;
        } else if(pi<pineCount){
          setM(imPT,pi,x,2*s,z,s,ry);   setM(imPL1,pi,x,2.5*s,z,s,ry);
          setM(imPL2,pi,x,3.5*s,z,s,ry);setM(imPL3,pi,x,4.8*s,z,s,ry);
          setM(imPL4,pi,x,5.8*s,z,s,ry);registerTree(x,z); pi++;
        }
      }
      [imNT,imNL1,imNL2,imNL3,imPT,imPL1,imPL2,imPL3,imPL4].forEach(im=>{
        im.instanceMatrix.needsUpdate=true;
        im.castShadow=false; im.receiveShadow=false;
        scene.add(im);
      });
    }
    
    // ===== INSTANCED BUSHES (3 draw calls for 90 bushes) =====
    function createBushesInstanced(count){
      const perTier=Math.ceil(count/3);
      const tiers=[
        {s:0.4, col:0x256610},{s:0.58,col:0x1e5c0a},{s:0.75,col:0x2d7a10}
      ].map(t=>({
        ...t,
        im:new THREE.InstancedMesh(
          new THREE.SphereGeometry(t.s,5,4),
          new THREE.MeshBasicMaterial({color:t.col}),
          perTier
        ),
        idx:0
      }));
      const dummy=new THREE.Object3D();
      for(let att=0;att<count*5;att++){
        if(tiers.every(t=>t.idx>=perTier))break;
        const x=(Math.random()-.5)*CFG.worldSize*0.9, z=(Math.random()-.5)*CFG.worldSize*0.9;
        if(Math.abs(x)<10&&Math.abs(z)<10)continue;
        const t=tiers[Math.floor(Math.random()*3)];
        if(t.idx>=perTier)continue;
        dummy.position.set(x,t.s*0.55,z);
        dummy.scale.set(1+Math.random()*0.4, 0.55+Math.random()*0.3, 1+Math.random()*0.4);
        dummy.rotation.y=Math.random()*Math.PI*2; dummy.updateMatrix();
        t.im.setMatrixAt(t.idx++,dummy.matrix);
      }
      tiers.forEach(t=>{
        t.im.instanceMatrix.needsUpdate=true;
        t.im.castShadow=false; scene.add(t.im);
      });
    }
    
    // ===== INSTANCED ROCKS (1 draw call for 30 rocks) =====
    function createRocksInstanced(count){
      const im=new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(0.5,0),
        new THREE.MeshBasicMaterial({color:0x888880}),
        count
      );
      const dummy=new THREE.Object3D();
      let placed=0;
      for(let att=0;att<count*5&&placed<count;att++){
        const x=(Math.random()-.5)*CFG.worldSize*0.9, z=(Math.random()-.5)*CFG.worldSize*0.9;
        const s=0.3+Math.random()*0.8;
        dummy.position.set(x,s*0.35,z);
        dummy.scale.set(s,s*0.7,s);
        dummy.rotation.set(Math.random()*2,Math.random()*2,Math.random()*2);
        dummy.updateMatrix(); im.setMatrixAt(placed++,dummy.matrix);
      }
      im.instanceMatrix.needsUpdate=true; im.castShadow=false; scene.add(im);
    }
    
    function createDecorations(){
      // Tents
      [[45,30],[-38,55],[72,-42],[-62,-28],[22,-72],[80,18],[-80,60],[58,-82]].forEach(([x,z])=>mkTent(x,z));
      // Gazebos
      [[-52,42],[63,32],[-32,-62],[72,-72]].forEach(([x,z])=>mkGazebo(x,z));
      // Campfires — only 4 (each has a PointLight, expensive)
      [[44,28],[-36,52],[70,-44],[-64,-32]].forEach(([x,z])=>mkCampfire(x,z));
      // Barrels
      for(let i=0;i<28;i++){
        const x=(Math.random()-.5)*280, z=(Math.random()-.5)*280;
        if(Math.abs(x)<12&&Math.abs(z)<12)continue;
        mkBarrel(x,z);
      }
      // Benches
      for(let i=0;i<10;i++){
        const x=(Math.random()-.5)*250,z=(Math.random()-.5)*250;
        if(Math.abs(x)<12&&Math.abs(z)<12)continue;
        mkBench(x,z,Math.random()*Math.PI*2);
      }
      // Crates
      for(let i=0;i<22;i++){
        const x=(Math.random()-.5)*280,z=(Math.random()-.5)*280;
        if(Math.abs(x)<12&&Math.abs(z)<12)continue;
        mkCrate(x,z);
      }
    }
    
    function mkTent(x,z){
      const g=new THREE.Group();
      const fabric=new THREE.MeshLambertMaterial({color:0x8B7355,side:THREE.DoubleSide});
      const dark=new THREE.MeshLambertMaterial({color:0x2a1f0e,side:THREE.DoubleSide});
      const pole=new THREE.MeshLambertMaterial({color:0x5c3a1e});
      const body=new THREE.Mesh(new THREE.ConeGeometry(2.6,2.4,4),fabric); body.position.y=1.2; body.rotation.y=Math.PI/4; g.add(body);
      const door=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.35),dark); door.position.set(0,0.67,1.84); door.rotation.y=0; g.add(door);
      const cp=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,2.6),new THREE.MeshLambertMaterial({color:0x5c3a1e})); cp.position.y=1.3; g.add(cp);
      for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2+Math.PI/4;const pg=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.01,0.28),new THREE.MeshLambertMaterial({color:0x444444}));pg.position.set(Math.cos(a)*2.4,0.14,Math.sin(a)*2.4);pg.rotation.z=0.25;g.add(pg);}
      g.position.set(x,0,z); g.rotation.y=Math.random()*Math.PI*2; scene.add(g);
      structureBoxes.push({x,z,r:3,h:4.2});
    }
    
    function mkGazebo(x,z){
      const g=new THREE.Group();
      const wood=new THREE.MeshLambertMaterial({color:0x6B4423});
      const roof=new THREE.MeshLambertMaterial({color:0x3d2010,side:THREE.DoubleSide});
      for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;const p=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,3.2),wood);p.position.set(Math.cos(a)*2.3,1.6,Math.sin(a)*2.3);g.add(p);}
      const rc=new THREE.Mesh(new THREE.ConeGeometry(2.9,1.6,6),roof); rc.position.y=4; g.add(rc);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(2.5,0.07,4,6),wood); rim.position.y=3.2; rim.rotation.x=Math.PI/2; g.add(rim);
      const fl=new THREE.Mesh(new THREE.CylinderGeometry(2.45,2.45,0.1,6),wood); fl.position.y=0.05; g.add(fl);
      // Benches inside
      for(let i=0;i<4;i++){
        const a=(i/4)*Math.PI*2+Math.PI/4;
        const b=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.08,0.34),wood); b.position.set(Math.cos(a)*1.55,0.44,Math.sin(a)*1.55); b.rotation.y=a; g.add(b);
      }
      g.position.set(x,0,z); g.rotation.y=Math.random()*Math.PI/3; scene.add(g);
      structureBoxes.push({x,z,r:3.2,h:4.8});
    }
    
    function mkCampfire(x,z){
      const g=new THREE.Group();
      const stone=new THREE.MeshLambertMaterial({color:0x666666});
      const logM=new THREE.MeshLambertMaterial({color:0x4a3728});
      for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;const s=new THREE.Mesh(new THREE.DodecahedronGeometry(0.18+Math.random()*0.08),stone);s.position.set(Math.cos(a)*0.46,0.1,Math.sin(a)*0.46);s.rotation.set(Math.random(),Math.random(),Math.random());g.add(s);}
      for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2;const l=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.82),logM);l.rotation.z=Math.PI/2;l.position.set(Math.cos(a)*0.14,0.075,Math.sin(a)*0.14);l.rotation.y=a;g.add(l);}
      const f1=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.52,6),new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:0.85})); f1.position.y=0.36; g.add(f1);
      const f2=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.36,5),new THREE.MeshBasicMaterial({color:0xffaa00,transparent:true,opacity:0.75})); f2.position.y=0.46; g.add(f2);
      const fl=new THREE.PointLight(0xff7700,2.0,10); fl.position.y=0.55; g.add(fl);
      g.userData={fireLight:fl,flame:f1,flame2:f2};
      g.position.set(x,0,z); scene.add(g); campfires.push(g);
    }
    
    function mkBarrel(x,z){
      const g=new THREE.Group();
      const isRed=Math.random()<0.28;
      const bm=new THREE.MeshLambertMaterial({color:isRed?0xaa3333:0x7a5020});
      const mm=new THREE.MeshLambertMaterial({color:0x555555});
      const body=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.3,0.76,12),bm); body.position.y=0.38; g.add(body);
      [0.19,0.56].forEach(y=>{const b=new THREE.Mesh(new THREE.TorusGeometry(0.33,0.025,4,12),mm);b.rotation.x=Math.PI/2;b.position.y=y;g.add(b);});
      const lid=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.05,12),mm); lid.position.y=0.78; g.add(lid);
      if(Math.random()<0.28){g.rotation.z=Math.PI/2;g.position.y=0.32;}
      g.position.set(x,0,z); g.rotation.y=Math.random()*Math.PI*2; scene.add(g);
      if(isRed){
        const prop={mesh:g,hp:95,maxHp:95,exploded:false,position:new THREE.Vector3(x,0.45,z)};
        g.traverse(o=>{if(o.isMesh){o.userData.prop=prop;registerPropMesh(o);}});
        registerShootableProp(prop);
      }
    }
    
    function mkBench(x,z,ang){
      const g=new THREE.Group();
      const wm=new THREE.MeshLambertMaterial({color:0x9B6B14});
      const lm=new THREE.MeshLambertMaterial({color:0x6a4500});
      const seat=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.09,0.46),wm); seat.position.y=0.48; g.add(seat);
      const back=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.52,0.07),wm); back.position.set(0,0.77,-0.2); g.add(back);
      [-0.85,0.85].forEach(px=>{
        const lg=new THREE.Group(); lg.position.x=px;
        [-0.17,0.17].forEach(pz=>{const l=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.5,0.07),lm);l.position.set(0,0.25,pz);lg.add(l);});
        g.add(lg);
      });
      g.position.set(x,0,z); g.rotation.y=ang; scene.add(g);
    }
    
    function mkCrate(x,z){
      const g=new THREE.Group();
      const wm=new THREE.MeshLambertMaterial({color:0x9B7B3E});
      const mm=new THREE.MeshLambertMaterial({color:0x8a8a8a});
      const sz=0.5+Math.random()*0.35;
      const c=new THREE.Mesh(new THREE.BoxGeometry(sz,sz,sz),wm); c.position.y=sz/2; g.add(c);
      // Metal edges
      ['x','z'].forEach(axis=>{
        for(let side of[-0.5,0.5]){
          const e=new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?0.02:sz+0.02,sz*0.1,axis==='z'?0.02:sz+0.02),mm);
          e.position.set(axis==='x'?side*(sz/2+0.01):0,sz/2,axis==='z'?side*(sz/2+0.01):0);
          g.add(e);
        }
      });
      g.position.set(x,0,z); g.rotation.y=Math.random()*Math.PI/2; scene.add(g);
    }
    
    

    function updateCampfires(t){
      campfires.forEach(cf=>{
        if(cf.userData.fireLight)cf.userData.fireLight.intensity=1.8+Math.sin(t*8)*0.6+Math.sin(t*13.3)*0.3;
        if(cf.userData.flame){cf.userData.flame.scale.y=1+Math.sin(t*10)*0.18;cf.userData.flame.rotation.y+=0.12;}
      });
    }

    function applyVisualBudget({renderer,quality,adaptiveLevel,devicePixelRatio,width,height,sunLight}){
      const level=Math.max(0,Math.min(2,adaptiveLevel||0));
      const ratios={low:.72,medium:1,high:Math.min(devicePixelRatio||1,1.35)};
      const scales=[1,.86,.72];
      renderer.setPixelRatio((ratios[quality]||1)*scales[level]);
      renderer.setSize(width,height,false);
      const baseGrass=quality==='low'?140:quality==='high'?VISUAL_MAX.grass:280;
      const grassScale=[1,.72,.45][level];
      if(grassMesh)grassMesh.count=Math.max(70,Math.round(baseGrass*grassScale));
      if(dustField){
        const baseDust=quality==='high'?VISUAL_MAX.dust:155;
        dustField.visible=quality!=='low'&&level<2;
        dustField.geometry.setDrawRange(0,Math.max(55,Math.round(baseDust*(level===0?1:.62))));
      }
      if(distantHills)distantHills.visible=quality!=='low'&&level<2;
      const shadows=quality==='high'&&level===0;
      renderer.shadowMap.enabled=shadows;renderer.shadowMap.autoUpdate=shadows;
      if(sunLight){sunLight.castShadow=shadows;sunLight.shadow.mapSize.set(shadows?1024:512,shadows?1024:512);}
    }

    return {createWorld,createSkyEnvironment,updateEnvironmentVisuals,updateCampfires,applyVisualBudget};
  }

  return {createEnvironmentSystem};
});
