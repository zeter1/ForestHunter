(()=>{
  'use strict';
  const root=globalThis.ForestHunter??=(Object.create(null));
  const audioNs=root.audio??=(Object.create(null));

  audioNs.createAudioSystem=function createAudioSystem(getVolume){
    let audioCtx,audioMaster;
    function initAudio(){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioMaster=audioCtx.createGain();audioMaster.gain.value=getVolume();audioMaster.connect(audioCtx.destination);}catch(e){}}
    function snd(type){
      if(!audioCtx)return;
      try{
        const t=audioCtx.currentTime;
        const g=audioCtx.createGain();
        g.connect(audioMaster||audioCtx.destination);
        if(type==='pistol'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(650,t); o.frequency.exponentialRampToValueAtTime(80,t+0.09);
          g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.11);
          o.connect(g); o.start(); o.stop(t+0.12);
        } else if(type==='smg'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(500,t); o.frequency.exponentialRampToValueAtTime(60,t+0.06);
          g.gain.setValueAtTime(0.13,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.07);
          o.connect(g); o.start(); o.stop(t+0.08);
        } else if(type==='shotgun'){
          const n=audioCtx.createBuffer(1,audioCtx.sampleRate*0.22,audioCtx.sampleRate);
          const d=n.getChannelData(0);
          for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*0.022));
          const src=audioCtx.createBufferSource(); src.buffer=n;
          g.gain.setValueAtTime(0.35,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.2);
          src.connect(g); src.start();
        } else if(type==='rifle'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(700,t); o.frequency.exponentialRampToValueAtTime(55,t+0.1);
          g.gain.setValueAtTime(0.25,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.12);
          o.connect(g); o.start(); o.stop(t+0.13);
        } else if(type==='sniper'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(900,t); o.frequency.exponentialRampToValueAtTime(40,t+0.18);
          g.gain.setValueAtTime(0.38,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.22);
          o.connect(g); o.start(); o.stop(t+0.24);
        } else if(type==='crossbow'){
          const o=audioCtx.createOscillator();
          o.type='sine'; o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(70,t+0.08);
          g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.1);
          o.connect(g); o.start(); o.stop(t+0.12);
        } else if(type==='bazooka'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(35,t+0.22);
          g.gain.setValueAtTime(0.34,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.26);
          o.connect(g); o.start(); o.stop(t+0.28);
        } else if(type==='empty'){
          const o=audioCtx.createOscillator();
          o.type='square'; o.frequency.setValueAtTime(110,t);
          g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.04);
          o.connect(g); o.start(); o.stop(t+0.05);
        } else if(type==='pickup'){
          const o=audioCtx.createOscillator();
          o.type='sine'; o.frequency.setValueAtTime(500,t); o.frequency.exponentialRampToValueAtTime(1200,t+0.15);
          g.gain.setValueAtTime(0.15,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.2);
          o.connect(g); o.start(); o.stop(t+0.2);
        } else if(type==='step'){
          const o=audioCtx.createOscillator();
          o.type='triangle'; o.frequency.setValueAtTime(55,t); o.frequency.exponentialRampToValueAtTime(22,t+0.08);
          g.gain.setValueAtTime(0.04,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.08);
          o.connect(g); o.start(); o.stop(t+0.09);
        } else if(type==='levelup'){
          const o=audioCtx.createOscillator();
          o.type='sine'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(900,t+0.35);
          g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.4);
          o.connect(g); o.start(); o.stop(t+0.4);
        } else if(type==='boss'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(80,t); o.frequency.linearRampToValueAtTime(40,t+0.8);
          g.gain.setValueAtTime(0.35,t); g.gain.linearRampToValueAtTime(0,t+0.9);
          o.connect(g); o.start(); o.stop(t+0.9);
        } else if(type==='hit'){
          const o=audioCtx.createOscillator();
          o.type='triangle'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(35,t+0.14);
          g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.14);
          o.connect(g); o.start(); o.stop(t+0.15);
        } else if(type==='die'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(180,t); o.frequency.linearRampToValueAtTime(35,t+0.55);
          g.gain.setValueAtTime(0.14,t); g.gain.linearRampToValueAtTime(0,t+0.58);
          o.connect(g); o.start(); o.stop(t+0.6);
        } else if(type==='grunt'){
          const o=audioCtx.createOscillator();
          o.type='sawtooth'; o.frequency.setValueAtTime(130,t); o.frequency.linearRampToValueAtTime(55,t+0.28);
          g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.3);
          o.connect(g); o.start(); o.stop(t+0.3);
        }
      }catch(e){}
    }
    function setVolume(value){if(audioMaster)audioMaster.gain.value=value;}
    function resume(){
      if(audioCtx&&audioCtx.state==='suspended'){
        const result=audioCtx.resume();
        result?.catch?.(()=>{});
        return result;
      }
      return null;
    }
    return {init:initAudio,play:snd,setVolume,resume};
  };
})();
