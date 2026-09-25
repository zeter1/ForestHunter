import {existsSync,readFileSync} from 'node:fs';

const fail=message=>{console.error('VALIDATION ERROR:',message);process.exitCode=1;};
const required=[
  'src/core/storage.js','src/game/config.js','src/game/runtime.js','src/ai/config.js',
  'src/weapons/config.js','src/audio/audio-system.js','src/ui/dom-cache.js',
  'docs/ARCHITECTURE.md','CHANGELOG.md'
];
for(const file of required)if(!existsSync(file))fail('missing '+file);

const html=readFileSync('index.html','utf8');
const ordered=[
  'src/core/storage.js','src/game/config.js','src/ai/config.js','src/weapons/config.js',
  'src/audio/audio-system.js','src/ui/dom-cache.js','src/game/runtime.js'
];
let last=-1;
for(const file of ordered){
  const at=html.indexOf('src="'+file+'"');
  if(at<0)fail('index does not load '+file);
  if(at<=last)fail('script order is incorrect at '+file);
  last=at;
}
for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
  if(match[1].trim().length>300)fail('large inline script returned');
}

const runtime=readFileSync('src/game/runtime.js','utf8');
for(const token of ['ForestHunter.core','ForestHunter.game','ForestHunter.ai','ForestHunter.weapons','ForestHunter.audio','ForestHunter.ui',"dataset.forestBoot='ready'"]){
  if(!runtime.includes(token))fail('runtime integration missing: '+token);
}
for(const legacy of ['const CFG = {','const WDEFS = {','let audioCtx, audioMaster;','const DOM={};']){
  if(runtime.includes(legacy))fail('legacy inline subsystem returned: '+legacy);
}
for(const token of ['class Boar','function shoot()','function animate()','createAudioSystem','createDomCache']){
  if(!runtime.includes(token))fail('gameplay/runtime contract missing: '+token);
}

const cfg=readFileSync('src/game/config.js','utf8');
for(const token of ['worldSize:400','treeCount:160','maxBoars:8','runSpeed:12'])if(!cfg.includes(token))fail('game config missing '+token);

const ai=readFileSync('src/ai/config.js','utf8');
for(const token of ['DIFFICULTIES','BOAR_VARIANTS',"runner:{name:'Быстрый кабан'","armored:{name:'Бронированный кабан'"])if(!ai.includes(token))fail('AI config missing '+token);

const weapons=readFileSync('src/weapons/config.js','utf8');
for(const token of ['WDEFS',"sniper:","bazooka:","AMMO_COLORS","AMMO_NAMES"])if(!weapons.includes(token))fail('weapons config missing '+token);

const audio=readFileSync('src/audio/audio-system.js','utf8');
if(!audio.includes('createAudioSystem')||!audio.includes("type==='sniper'"))fail('audio module incomplete');

if(!process.exitCode)console.log('Forest Hunter modular architecture validation passed.');
