import {existsSync,readFileSync} from 'node:fs';

const fail=message=>{console.error('VALIDATION ERROR:',message);process.exitCode=1;};
const required=[
  'src/core/storage.js','src/core/seeded-rng.js',
  'src/game/config.js','src/game/progression.js','src/game/environment.js','src/game/runtime.js',
  'src/ai/config.js','src/ai/boar-brain.js',
  'src/weapons/config.js','src/weapons/geometry.js','src/weapons/combat-rules.js',
  'src/audio/audio-system.js',
  'src/ui/dom-cache.js','src/ui/hud-model.js',
  'tests/contracts.mjs','tests/scenarios.mjs','tests/fixtures/forest-replay.json',
  'docs/ARCHITECTURE.md','CHANGELOG.md'
];
for(const file of required)if(!existsSync(file))fail('missing '+file);

const html=readFileSync('index.html','utf8');
const ordered=[
  'src/core/storage.js','src/core/seeded-rng.js',
  'src/game/config.js','src/game/progression.js','src/game/environment.js',
  'src/ai/config.js','src/ai/boar-brain.js',
  'src/weapons/config.js','src/weapons/geometry.js','src/weapons/combat-rules.js',
  'src/audio/audio-system.js',
  'src/ui/dom-cache.js','src/ui/hud-model.js',
  'src/game/runtime.js'
];
let last=-1;
for(const file of ordered){
  const at=html.indexOf('src="'+file+'"');
  if(at<0)fail('index does not load '+file);
  if(at<=last)fail('script order is incorrect at '+file);
  last=at;
}

const runtime=readFileSync('src/game/runtime.js','utf8');
for(const token of [
  'stepBoarState','rollShotDamage','stepReloadFrame','advanceDeployableState','selectDeployableTarget',
  'selectHitCandidate','createEnvironmentSystem','advanceXpState','buildPlayerHud',"dataset.forestBoot='ready'"
]){
  if(!runtime.includes(token))fail('runtime integration missing: '+token);
}
for(const legacy of [
  'switch(this.state){',
  'w.reloadLeft-=dt',
  "const candidates=[];",
  "const radius=d.type==='trap'?1.35:1.65"
]){
  if(runtime.includes(legacy))fail('legacy simulation logic returned to runtime: '+legacy);
}

const rng=readFileSync('src/core/seeded-rng.js','utf8');
if(!rng.includes('createSeededRng')||!rng.includes('Math.imul'))fail('deterministic RNG module incomplete');
const ai=readFileSync('src/ai/boar-brain.js','utf8');
if(!ai.includes('stepBoarState')||!ai.includes('canJoinAttack')||!ai.includes('queueMovementDecision'))fail('boar simulation module incomplete');
const combat=readFileSync('src/weapons/combat-rules.js','utf8');
for(const token of ['rollShotDamage','stepReloadFrame','advanceDeployableState','selectDeployableTarget','selectHitCandidate']){
  if(!combat.includes(token))fail('combat simulation module incomplete: '+token);
}
const replay=JSON.parse(readFileSync('tests/fixtures/forest-replay.json','utf8'));
if(replay.version!==1||!replay.boar||!replay.shots||!replay.reload)fail('replay fixture schema incomplete');

if(!process.exitCode)console.log('Forest Hunter deterministic simulation architecture validation passed.');
