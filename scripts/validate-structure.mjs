import {existsSync,readFileSync} from 'node:fs';

const fail=message=>{console.error('VALIDATION ERROR:',message);process.exitCode=1;};
const required=[
  'src/core/storage.js',
  'src/game/config.js','src/game/progression.js','src/game/environment.js','src/game/runtime.js',
  'src/ai/config.js','src/ai/boar-brain.js',
  'src/weapons/config.js','src/weapons/geometry.js','src/weapons/combat-rules.js',
  'src/audio/audio-system.js',
  'src/ui/dom-cache.js','src/ui/hud-model.js',
  'tests/contracts.mjs','docs/ARCHITECTURE.md','CHANGELOG.md'
];
for(const file of required)if(!existsSync(file))fail('missing '+file);

const html=readFileSync('index.html','utf8');
const ordered=[
  'src/core/storage.js',
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
for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
  if(match[1].trim().length>300)fail('large inline script returned');
}

const runtime=readFileSync('src/game/runtime.js','utf8');
for(const token of [
  'createEnvironmentSystem','advanceXpState','createWeapon','weaponFireGate','computeShotDamage',
  'beginReloadState','deployableTriggerRadius','rayCircleDistanceXZ',
  'canJoinAttack','queueMovementDecision','chooseVariant','boarCap',
  'buildPlayerHud','buildWeaponHud',"dataset.forestBoot='ready'"
]){
  if(!runtime.includes(token))fail('runtime integration missing: '+token);
}
for(const legacy of [
  'const UPGRADES = {','class Weapon{','const BS =','function chooseBoarVariant','function getBoarCap',
  'function createWorld(){','function createSkyEnvironment(){','function rayCircleDistanceXZ(',
  'campfires.forEach'
]){
  if(runtime.includes(legacy))fail('legacy subsystem logic returned to runtime: '+legacy);
}
for(const token of ['class Boar','function shoot()','function animate()']){
  if(!runtime.includes(token))fail('runtime orchestration contract missing: '+token);
}

const contracts=readFileSync('tests/contracts.mjs','utf8');
for(const token of ['chooseVariant','queueMovementDecision','computeShotDamage','reloadProgress','rayCircleDistanceXZ','advanceXpState','buildPlayerHud']){
  if(!contracts.includes(token))fail('contract coverage missing: '+token);
}
const environment=readFileSync('src/game/environment.js','utf8');
if(!environment.includes('createEnvironmentSystem')||!environment.includes('createWorld')||!environment.includes('applyVisualBudget'))fail('environment module incomplete');
const ai=readFileSync('src/ai/boar-brain.js','utf8');
if(!ai.includes('canJoinAttack')||!ai.includes('queueMovementDecision')||!ai.includes('boarCap'))fail('boar brain module incomplete');
const combat=readFileSync('src/weapons/combat-rules.js','utf8');
if(!combat.includes('computeShotDamage')||!combat.includes('beginReloadState')||!combat.includes('blastFalloff'))fail('combat rules module incomplete');
const progression=readFileSync('src/game/progression.js','utf8');
if(!progression.includes('createUpgradeCatalog')||!progression.includes('advanceXpState'))fail('progression module incomplete');
const hud=readFileSync('src/ui/hud-model.js','utf8');
if(!hud.includes('buildPlayerHud')||!hud.includes('buildContractHud'))fail('HUD model incomplete');

if(!process.exitCode)console.log('Forest Hunter deep gameplay architecture validation passed.');
