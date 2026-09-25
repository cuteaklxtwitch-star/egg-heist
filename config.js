// Shared between server (Node) and browser. All balance lives here.

// ---------------- layout ----------------
export const SAFE_Z = 10;          // the SAFEZONE line. Everything with z < SAFE_Z is the plaza.
export const ZONE_LEN = 140;       // length of each zone in the canyon
export const CORRIDOR_HALF = 19;   // canyon is x = -19..19
export const PLAZA_HALF_X = 78;
export const PLAZA_MIN_Z = -135;
export const MAX_PLAYERS = 8;
export const MAX_PETS = 24;
export const SPAWN = { x: 0, z: -60 };
export const SELL_POS = { x: -14, z: -4 };
export const FUSE_POS = { x: 14, z: -4 };
export const PET_FUSE_POS = { x: 32, z: -4 };

// Guardians run exactly as fast as a player with the sign's recommended speed (rec).
// wake is how close you can get before they notice you.
export const ZONES = [
  { id: 'meadow',  name: 'Meadow',      rec: 0,     ground: ['#6ad14b', '#5ec541'], wall: '#d98a4d',
    guardian: { name: 'Big Goose',       kind: 'bird',    color: '#ffffff', accent: '#ff9a2e', scale: 3.2, wake: 18 }, eggs: ['basic', 'leaf'] },
  { id: 'jungle',  name: 'Jungle',      rec: 500,   ground: ['#3fa14a', '#379041'], wall: '#6f8f3a',
    guardian: { name: 'Jungle Gorilla',  kind: 'monkey',  color: '#3b3b40', accent: '#8a6a55', scale: 3.3, wake: 18 }, eggs: ['vine', 'banana'] },
  { id: 'desert',  name: 'Desert',      rec: 5000,  ground: ['#ebd18d', '#e2c67e'], wall: '#e8c98a',
    guardian: { name: 'Sand Croc',       kind: 'lizard',  color: '#b99b5b', accent: '#6f5b2e', scale: 3.2, wake: 18 }, eggs: ['sand', 'cactus'] },
  { id: 'tundra',  name: 'Tundra',      rec: 50000, ground: ['#f2f7fc', '#e2ecf6'], wall: '#b8d6ec',
    guardian: { name: 'Emperor Penguin', kind: 'penguin', color: '#1d2330', accent: '#ffb02e', scale: 3.4, wake: 19 }, eggs: ['frost', 'crystal'] },
  { id: 'reef',    name: 'Coral Reef',  rec: 3e5,   ground: ['#f3e2b0', '#eadaa4'], wall: '#ff8a7a',
    guardian: { name: 'Giant Crab',      kind: 'crab',    color: '#e8452e', accent: '#ffd2c2', scale: 3.0, wake: 19 }, eggs: ['shell', 'pearl'] },
  { id: 'volcano', name: 'Volcano',     rec: 2e6,   ground: ['#4d3c37', '#42332f'], wall: '#3a2b28',
    guardian: { name: 'Lava Dragon',     kind: 'dragon',  color: '#d6402b', accent: '#ffb02e', scale: 3.0, wake: 20 }, eggs: ['magma', 'dragon'] },
  { id: 'candy',   name: 'Candy Land',  rec: 15e6,  ground: ['#ffc2e2', '#ffb3da'], wall: '#b58cff',
    guardian: { name: 'Gummy Bear',      kind: 'bear',    color: '#ff4f7b', accent: '#ffd23a', scale: 3.4, wake: 20 }, eggs: ['candy', 'lollipop'] },
  { id: 'void',    name: 'The Void',    rec: 1e8,   ground: ['#2e2248', '#271d3e'], wall: '#1d1631',
    guardian: { name: 'Void Serpent',    kind: 'snake',   color: '#2c2142', accent: '#b46cff', scale: 3.4, wake: 21 }, eggs: ['void', 'galaxy'] },
  // ---- past the Void ----
  { id: 'storm',   name: 'Storm Peaks',   rec: 7e8,  ground: ['#5d6a80', '#556277'], wall: '#3c4658',
    guardian: { name: 'Thunder Eagle',  kind: 'bird',    color: '#2f3f7a', accent: '#ffe03a', scale: 3.8, wake: 21 }, eggs: ['storm', 'thunder'] },
  { id: 'caves',   name: 'Crystal Caves', rec: 5e9,  ground: ['#b8f0ff', '#a8e6f8'], wall: '#5c6bd6',
    guardian: { name: 'Crystal Wolf',   kind: 'fox',     color: '#8fdcff', accent: '#ffffff', scale: 3.6, wake: 22 }, eggs: ['geode', 'prism'] },
  { id: 'abyss',   name: 'Abyss Ocean',   rec: 4e10, ground: ['#1f4f7a', '#1b476e'], wall: '#0f3350',
    guardian: { name: 'Titan Tortoise', kind: 'turtle',  color: '#2f6f5a', accent: '#1b3d3a', scale: 4.2, wake: 22 }, eggs: ['abyss', 'kraken'] },
  { id: 'sun',     name: 'Sun Kingdom',   rec: 3e11, ground: ['#ffe08a', '#ffd46e'], wall: '#ffb02e',
    guardian: { name: 'Solar Lion',     kind: 'cat',     color: '#ffc02e', accent: '#ff7a1a', scale: 3.8, wake: 23 }, eggs: ['solar', 'sunstone'] },
  { id: 'heaven',  name: 'Heaven',        rec: 2e12, ground: ['#ffffff', '#eef3ff'], wall: '#e8eeff',
    guardian: { name: 'Sky Pegasus',    kind: 'unicorn', color: '#ffffff', accent: '#ffd23a', scale: 3.6, wake: 24 }, eggs: ['halo', 'seraph'] },
  // ---- past Heaven ----
  { id: 'factory', name: 'Clockwork Factory', rec: 1.5e13, ground: ['#9aa3b2', '#8f98a8'], wall: '#5d6470',
    guardian: { name: 'Mecha Crab',     kind: 'crab',    color: '#9aa3b2', accent: '#ffb02e', scale: 3.6, wake: 24 }, eggs: ['gear', 'bolt'] },
  { id: 'dream',   name: 'Dream Garden',  rec: 1e14,   ground: ['#c9b6ff', '#bfa9ff'], wall: '#7a5cff',
    guardian: { name: 'Dream Owl',      kind: 'owl',     color: '#b28cff', accent: '#ffe0f5', scale: 3.8, wake: 25 }, eggs: ['dream', 'nightmare'] },
  { id: 'omega',   name: 'The Omega Rift', rec: 8e14,  ground: ['#1a1822', '#15131c'], wall: '#0b0a10',
    guardian: { name: 'Omega Dragon',   kind: 'dragon',  color: '#0b0a10', accent: '#ff2a55', scale: 4.2, wake: 26 }, eggs: ['omega', 'rift'] },
];

export const zoneStart = (i) => SAFE_Z + i * ZONE_LEN;
export const zoneEnd = (i) => SAFE_Z + (i + 1) * ZONE_LEN;
export const nestZ = (i) => zoneStart(i) + 95;
export const WORLD_END_Z = zoneEnd(ZONES.length - 1);
export function zoneAt(z) {
  if (z < SAFE_Z) return -1;
  return Math.min(ZONES.length - 1, Math.floor((z - SAFE_Z) / ZONE_LEN));
}

// ---------------- eggs & pets ----------------
// zone = which canyon zone it lies in. Eggs with fuseTier never spawn in the canyon: only a Fuse Machine makes them.
// pattern: spots (default), stripes, stars, rainbow, shine
const OFF = 99; // "not in the canyon"
export const EGGS = {
  basic:    { name: 'Basic Egg',    zone: 0, color: '#fbfbf5', spot: '#e0e0d6', value: 20,     hatch: 15,  weight: 80, pets: { chick: 55, piglet: 40, bunbun: 5 } },
  leaf:     { name: 'Leaf Egg',     zone: 0, color: '#4f8f3a', spot: '#79bd58', value: 60,     hatch: 25,  weight: 20, pets: { piglet: 30, bunbun: 50, clovercat: 20 } },
  vine:     { name: 'Vine Egg',     zone: 1, color: '#2f7a3a', spot: '#9be070', value: 150,    hatch: 20,  weight: 80, pets: { treefrog: 55, monkey: 40, toucan: 5 }, pattern: 'stripes' },
  banana:   { name: 'Banana Egg',   zone: 1, color: '#ffe04a', spot: '#a07a2a', value: 450,    hatch: 30,  weight: 20, pets: { monkey: 30, toucan: 50, jaguar: 20 } },
  sand:     { name: 'Sand Egg',     zone: 2, color: '#f1d9a0', spot: '#d5b36c', value: 900,    hatch: 35,  weight: 80, pets: { dunegecko: 55, cactuspup: 40, sunbird: 5 } },
  cactus:   { name: 'Cactus Egg',   zone: 2, color: '#3f9a52', spot: '#f2f0c0', value: 2700,   hatch: 45,  weight: 20, pets: { cactuspup: 30, sunbird: 50, pharaohcat: 20 }, pattern: 'stripes' },
  frost:    { name: 'Frost Egg',    zone: 3, color: '#dff3ff', spot: '#9ed6f7', value: 8000,   hatch: 50,  weight: 80, pets: { snowchick: 55, iceblob: 40, frostfox: 5 } },
  crystal:  { name: 'Crystal Egg',  zone: 3, color: '#7fd7ff', spot: '#e9fbff', value: 24000,  hatch: 60,  weight: 20, pets: { iceblob: 30, frostfox: 50, crystaldrake: 20 }, pattern: 'shine' },
  shell:    { name: 'Shell Egg',    zone: 4, color: '#ffd9c7', spot: '#ff8a7a', value: 60000,  hatch: 70,  weight: 80, pets: { crabby: 55, seaturtle: 40, jellyblob: 5 }, pattern: 'stripes' },
  pearl:    { name: 'Pearl Egg',    zone: 4, color: '#f4f1ff', spot: '#c9d6ff', value: 180000, hatch: 80,  weight: 20, pets: { seaturtle: 30, jellyblob: 50, pearlcat: 20 }, pattern: 'shine' },
  magma:    { name: 'Magma Egg',    zone: 5, color: '#3a2521', spot: '#ff6a2a', value: 500000, hatch: 90,  weight: 80, pets: { emberblob: 55, magmaliz: 40, phoenix: 5 } },
  dragon:   { name: 'Dragon Egg',   zone: 5, color: '#b8261c', spot: '#ffc23a', value: 1.5e6,  hatch: 100, weight: 20, pets: { magmaliz: 30, phoenix: 50, infernodrake: 20 } },
  candy:    { name: 'Candy Egg',    zone: 6, color: '#ff9ad5', spot: '#ffffff', value: 4e6,    hatch: 110, weight: 80, pets: { gummycub: 55, candypig: 40, cottonbunny: 5 }, pattern: 'stripes' },
  lollipop: { name: 'Lollipop Egg', zone: 6, color: '#7fe0ff', spot: '#ff5ab4', value: 1.2e7,  hatch: 125, weight: 20, pets: { candypig: 30, cottonbunny: 50, lollidog: 20 }, pattern: 'rainbow' },
  void:     { name: 'Void Egg',     zone: 7, color: '#1b1428', spot: '#8b54e8', value: 3e7,    hatch: 130, weight: 80, pets: { voidblob: 55, starcat: 40, nebulaowl: 5 }, pattern: 'stars' },
  galaxy:   { name: 'Galaxy Egg',   zone: 7, color: '#2b1f6b', spot: '#ff8ef0', value: 9e7,    hatch: 150, weight: 20, pets: { starcat: 30, nebulaowl: 50, voiddragon: 20 }, pattern: 'stars' },
  storm:    { name: 'Storm Egg',    zone: 8,  color: '#4a5fa8', spot: '#ffe03a', value: 2.5e8, hatch: 160, weight: 80, pets: { stormpup: 55, cloudbunny: 40, thunderbird: 5 }, pattern: 'stripes' },
  thunder:  { name: 'Thunder Egg',  zone: 8,  color: '#ffe03a', spot: '#3b4cb8', value: 7.5e8, hatch: 175, weight: 20, pets: { cloudbunny: 30, thunderbird: 50, stormdragon: 20 }, pattern: 'stripes' },
  geode:    { name: 'Geode Egg',    zone: 9,  color: '#6b4fe8', spot: '#bff4ff', value: 2e9,   hatch: 180, weight: 80, pets: { geodecrab: 55, crystalfox: 40, prismowl: 5 }, pattern: 'shine' },
  prism:    { name: 'Prism Egg',    zone: 9,  color: '#bff4ff', spot: '#ffffff', value: 6e9,   hatch: 195, weight: 20, pets: { crystalfox: 30, prismowl: 50, gemdragon: 20 }, pattern: 'rainbow' },
  abyss:    { name: 'Abyss Egg',    zone: 10, color: '#0f2a4a', spot: '#3fe0ff', value: 1.6e10, hatch: 200, weight: 80, pets: { anglerfrog: 55, abyssturtle: 40, krakenslime: 5 }, pattern: 'stars' },
  kraken:   { name: 'Kraken Egg',   zone: 10, color: '#6b2a8a', spot: '#ff7ae6', value: 4.8e10, hatch: 215, weight: 20, pets: { abyssturtle: 30, krakenslime: 50, leviathan: 20 } },
  solar:    { name: 'Solar Egg',    zone: 11, color: '#ffb02e', spot: '#fff27a', value: 1.3e11, hatch: 220, weight: 80, pets: { sunpig: 55, solarlion: 40, sunphoenix: 5 }, pattern: 'shine' },
  sunstone: { name: 'Sunstone Egg', zone: 11, color: '#ff6a2a', spot: '#ffe03a', value: 4e11,  hatch: 235, weight: 20, pets: { solarlion: 30, sunphoenix: 50, sungorilla: 20 } },
  halo:     { name: 'Halo Egg',     zone: 12, color: '#ffffff', spot: '#ffd23a', value: 1e12,  hatch: 240, weight: 80, pets: { halobunny: 55, angelpenguin: 40, pegasus: 5 }, pattern: 'shine' },
  seraph:   { name: 'Seraph Egg',   zone: 12, color: '#fffbe8', spot: '#9fe3ff', value: 3e12,  hatch: 260, weight: 20, pets: { angelpenguin: 30, pegasus: 50, archangel: 20 }, pattern: 'rainbow' },
  gear:      { name: 'Gear Egg',      zone: 13, color: '#9aa3b2', spot: '#ffb02e', value: 8e12,   hatch: 270, weight: 80, pets: { gearpup: 55, robocat: 40, clockowl: 5 }, pattern: 'stripes' },
  bolt:      { name: 'Bolt Egg',      zone: 13, color: '#5d6470', spot: '#3fa7ff', value: 2.4e13, hatch: 285, weight: 20, pets: { robocat: 30, clockowl: 50, mechadragon: 20 }, pattern: 'stripes' },
  dream:     { name: 'Dream Egg',     zone: 14, color: '#e8d9ff', spot: '#ff9ad5', value: 6e13,   hatch: 300, weight: 80, pets: { dreambunny: 55, sleepybear: 40, starfox: 5 }, pattern: 'stars' },
  nightmare: { name: 'Nightmare Egg', zone: 14, color: '#2a1f4a', spot: '#ff5ab4', value: 1.8e14, hatch: 315, weight: 20, pets: { sleepybear: 30, starfox: 50, nightserpent: 20 }, pattern: 'stars' },
  omega:     { name: 'Omega Egg',     zone: 15, color: '#111018', spot: '#ff2a55', value: 5e14,   hatch: 330, weight: 80, pets: { riftslime: 55, omegapenguin: 40, riftunicorn: 5 }, pattern: 'shine' },
  rift:      { name: 'Rift Egg',      zone: 15, color: '#ff2a55', spot: '#111018', value: 1.5e15, hatch: 360, weight: 20, pets: { omegapenguin: 30, riftunicorn: 50, omegadragon: 20 }, pattern: 'stars' },
  moon:     { name: 'Moon Egg',     zone: OFF, color: '#e8ecff', spot: '#b7c0ff', value: 2e8,  hatch: 160, weight: 0,  pets: { moonbunny: 85, eclipse: 15 }, power: 8 },
  // ---- fuse-only eggs ----
  golden:    { name: 'Golden Egg',    zone: OFF, fuseTier: 0, color: '#ffc92e', spot: '#fff4a8', value: 20000, hatch: 45,  weight: 0, pets: { goldbunny: 50, goldpig: 35, goldowl: 15 }, pattern: 'shine' },
  rainbow:   { name: 'Rainbow Egg',   zone: OFF, fuseTier: 1, color: '#ff5a7a', spot: '#ffffff', value: 5e5,   hatch: 60,  weight: 0, pets: { prismfrog: 50, rainbowcat: 35, unicorn: 15 }, pattern: 'rainbow' },
  diamond:   { name: 'Diamond Egg',   zone: OFF, fuseTier: 2, color: '#bff4ff', spot: '#ffffff', value: 1e7,   hatch: 90,  weight: 0, pets: { diamonddog: 50, crystalturtle: 35, diamondowl: 15 }, pattern: 'shine' },
  cosmic:    { name: 'Cosmic Egg',    zone: OFF, fuseTier: 3, color: '#1a1040', spot: '#7fe0ff', value: 2e8,   hatch: 120, weight: 0, pets: { cosmicmonkey: 50, astrocrab: 35, cosmicunicorn: 15 }, pattern: 'stars' },
  celestial: { name: 'Celestial Egg', zone: OFF, fuseTier: 4, color: '#fffbe8', spot: '#ffd23a', value: 3e9,   hatch: 180, weight: 0, pets: { angelbunny: 65, celestialdragon: 35 }, pattern: 'shine' },
};
export const FUSE_EGGS = ['golden', 'rainbow', 'diamond', 'cosmic', 'celestial'];
export const FUSE_EXCLUSIVE_CHANCE = 0.35; // chance that 3 same-zone eggs give a fuse-only egg instead

export const RARITY_COLORS = {
  Common: '#c9ced6', Uncommon: '#6fdc5a', Rare: '#3fa7ff', Epic: '#b05cff',
  Legendary: '#ffc02e', Mythic: '#ff4f7b', Secret: '#ffffff', Divine: '#7df9ff', Omega: '#ff2a55',
};
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'Divine', 'Omega'];

// kind = which animal model it uses
export const PETS = {
  chick:        { name: 'Chick',           kind: 'bird',    color: '#ffe066', accent: '#ff9a2e', rarity: 'Common',    income: 2 },
  piglet:       { name: 'Piglet',          kind: 'pig',     color: '#ffb3c7', accent: '#ff7fa3', rarity: 'Common',    income: 3 },
  bunbun:       { name: 'Bunbun',          kind: 'bunny',   color: '#ffffff', accent: '#ffb3c7', rarity: 'Uncommon',  income: 7 },
  clovercat:    { name: 'Clover Cat',      kind: 'cat',     color: '#8be06a', accent: '#2f7a2a', rarity: 'Rare',      income: 14 },
  treefrog:     { name: 'Tree Frog',       kind: 'frog',    color: '#5cd15a', accent: '#ff5a3a', rarity: 'Common',    income: 10 },
  monkey:       { name: 'Monkey',          kind: 'monkey',  color: '#8a5a3a', accent: '#f2c9a0', rarity: 'Uncommon',  income: 15 },
  toucan:       { name: 'Toucan',          kind: 'bird',    color: '#1d1f26', accent: '#ff9a2e', rarity: 'Rare',      income: 30 },
  jaguar:       { name: 'Jaguar',          kind: 'cat',     color: '#f2b233', accent: '#3a2a1a', rarity: 'Epic',      income: 60 },
  dunegecko:    { name: 'Dune Gecko',      kind: 'lizard',  color: '#e0bb72', accent: '#9a6f2e', rarity: 'Uncommon',  income: 40 },
  cactuspup:    { name: 'Cactus Pup',      kind: 'dog',     color: '#3f9a52', accent: '#f2f0c0', rarity: 'Uncommon',  income: 55 },
  sunbird:      { name: 'Sun Bird',        kind: 'bird',    color: '#ff9d2e', accent: '#ffe066', rarity: 'Rare',      income: 100 },
  pharaohcat:   { name: 'Pharaoh Cat',     kind: 'cat',     color: '#f5c542', accent: '#2a5dcf', rarity: 'Epic',      income: 200 },
  snowchick:    { name: 'Pengu',           kind: 'penguin', color: '#2a3140', accent: '#ffb02e', rarity: 'Rare',      income: 260 },
  iceblob:      { name: 'Ice Slime',       kind: 'slime',   color: '#9fe3ff', accent: '#ffffff', rarity: 'Rare',      income: 370 },
  frostfox:     { name: 'Frost Fox',       kind: 'fox',     color: '#c9ecff', accent: '#ffffff', rarity: 'Epic',      income: 720 },
  crystaldrake: { name: 'Crystal Drake',   kind: 'dragon',  color: '#6fd6ff', accent: '#e9fbff', rarity: 'Legendary', income: 1400 },
  crabby:       { name: 'Crabby',          kind: 'crab',    color: '#ff6a4a', accent: '#ffe0d6', rarity: 'Epic',      income: 1900 },
  seaturtle:    { name: 'Sea Turtle',      kind: 'turtle',  color: '#7fd09a', accent: '#2f8a6a', rarity: 'Epic',      income: 2700 },
  jellyblob:    { name: 'Jelly Slime',     kind: 'slime',   color: '#ff9ad5', accent: '#ffffff', rarity: 'Legendary', income: 5200 },
  pearlcat:     { name: 'Pearl Cat',       kind: 'cat',     color: '#f4f1ff', accent: '#9fb6ff', rarity: 'Legendary', income: 10000 },
  emberblob:    { name: 'Ember Slime',     kind: 'slime',   color: '#ff7a2e', accent: '#ffd23a', rarity: 'Legendary', income: 14000 },
  magmaliz:     { name: 'Magma Lizard',    kind: 'lizard',  color: '#c9321f', accent: '#ffb02e', rarity: 'Legendary', income: 20000 },
  phoenix:      { name: 'Phoenix',         kind: 'bird',    color: '#ff4a2a', accent: '#ffd23a', rarity: 'Mythic',    income: 38000 },
  infernodrake: { name: 'Inferno Drake',   kind: 'dragon',  color: '#e2361f', accent: '#2b1a17', rarity: 'Mythic',    income: 75000 },
  gummycub:     { name: 'Gummy Cub',       kind: 'bear',    color: '#ff4f7b', accent: '#ffd23a', rarity: 'Legendary', income: 100000 },
  candypig:     { name: 'Candy Pig',       kind: 'pig',     color: '#ff9ad5', accent: '#7fe0ff', rarity: 'Mythic',    income: 140000 },
  cottonbunny:  { name: 'Cotton Bunny',    kind: 'bunny',   color: '#ffd6f0', accent: '#7fe0ff', rarity: 'Mythic',    income: 260000 },
  lollidog:     { name: 'Lolli Dog',       kind: 'dog',     color: '#7fe0ff', accent: '#ff5ab4', rarity: 'Mythic',    income: 520000 },
  voidblob:     { name: 'Void Slime',      kind: 'slime',   color: '#3b2a5c', accent: '#b46cff', rarity: 'Mythic',    income: 700000 },
  starcat:      { name: 'Star Cat',        kind: 'cat',     color: '#1f2a6b', accent: '#ffe066', rarity: 'Mythic',    income: 1e6 },
  nebulaowl:    { name: 'Nebula Owl',      kind: 'owl',     color: '#6b4fe8', accent: '#ff7ae6', rarity: 'Mythic',    income: 2e6 },
  voiddragon:   { name: 'Void Dragon',     kind: 'dragon',  color: '#1a1326', accent: '#b46cff', rarity: 'Secret',    income: 4e6 },
  moonbunny:    { name: 'Moon Bunny',      kind: 'bunny',   color: '#eef1ff', accent: '#b7c0ff', rarity: 'Mythic',    income: 3e6 },
  eclipse:      { name: 'Eclipse Serpent', kind: 'snake',   color: '#111018', accent: '#ffc02e', rarity: 'Secret',    income: 1.2e7 },
  stormpup:     { name: 'Storm Pup',       kind: 'dog',     color: '#4a5fa8', accent: '#ffe03a', rarity: 'Mythic',    income: 8e6 },
  cloudbunny:   { name: 'Cloud Bunny',     kind: 'bunny',   color: '#eef3ff', accent: '#9fb6ff', rarity: 'Mythic',    income: 1.2e7 },
  thunderbird:  { name: 'Thunderbird',     kind: 'bird',    color: '#2f3f7a', accent: '#ffe03a', rarity: 'Secret',    income: 2.4e7 },
  stormdragon:  { name: 'Storm Dragon',    kind: 'dragon',  color: '#3c4658', accent: '#ffe03a', rarity: 'Secret',    income: 5e7 },
  geodecrab:    { name: 'Geode Crab',      kind: 'crab',    color: '#6b4fe8', accent: '#bff4ff', rarity: 'Mythic',    income: 6e7 },
  crystalfox:   { name: 'Crystal Fox',     kind: 'fox',     color: '#8fdcff', accent: '#ffffff', rarity: 'Mythic',    income: 9e7 },
  prismowl:     { name: 'Prism Owl',       kind: 'owl',     color: '#bff4ff', accent: '#ff7ae6', rarity: 'Secret',    income: 1.8e8 },
  gemdragon:    { name: 'Gem Dragon',      kind: 'dragon',  color: '#5c6bd6', accent: '#bff4ff', rarity: 'Secret',    income: 3.6e8 },
  anglerfrog:   { name: 'Angler Frog',     kind: 'frog',    color: '#0f2a4a', accent: '#3fe0ff', rarity: 'Mythic',    income: 4.5e8 },
  abyssturtle:  { name: 'Abyss Turtle',    kind: 'turtle',  color: '#2f6f5a', accent: '#123456', rarity: 'Secret',    income: 7e8 },
  krakenslime:  { name: 'Kraken Slime',    kind: 'slime',   color: '#8a3ab8', accent: '#ff7ae6', rarity: 'Secret',    income: 1.4e9 },
  leviathan:    { name: 'Leviathan',       kind: 'snake',   color: '#1b476e', accent: '#3fe0ff', rarity: 'Secret',    income: 2.8e9 },
  sunpig:       { name: 'Sun Pig',         kind: 'pig',     color: '#ffc02e', accent: '#ff7a1a', rarity: 'Secret',    income: 3.5e9 },
  solarlion:    { name: 'Solar Lion Cub',  kind: 'cat',     color: '#ffc02e', accent: '#ff7a1a', rarity: 'Secret',    income: 5e9 },
  sunphoenix:   { name: 'Sun Phoenix',     kind: 'bird',    color: '#ff6a2a', accent: '#fff27a', rarity: 'Divine',    income: 1e10 },
  sungorilla:   { name: 'Sun Gorilla',     kind: 'monkey',  color: '#ffb02e', accent: '#fff27a', rarity: 'Divine',    income: 2e10 },
  halobunny:    { name: 'Halo Bunny',      kind: 'bunny',   color: '#ffffff', accent: '#ffd23a', rarity: 'Divine',    income: 2.5e10 },
  angelpenguin: { name: 'Angel Penguin',   kind: 'penguin', color: '#e8eeff', accent: '#ffd23a', rarity: 'Divine',    income: 4e10 },
  pegasus:      { name: 'Pegasus',         kind: 'unicorn', color: '#ffffff', accent: '#9fe3ff', rarity: 'Divine',    income: 8e10 },
  archangel:    { name: 'Archangel Dragon', kind: 'dragon', color: '#fffbe8', accent: '#ffd23a', rarity: 'Divine',    income: 1.6e11 },
  gearpup:      { name: 'Gear Pup',        kind: 'dog',     color: '#9aa3b2', accent: '#ffb02e', rarity: 'Divine',    income: 3e11 },
  robocat:      { name: 'Robo Cat',        kind: 'cat',     color: '#c0c7d4', accent: '#3fa7ff', rarity: 'Divine',    income: 5e11 },
  clockowl:     { name: 'Clock Owl',       kind: 'owl',     color: '#b08a3a', accent: '#ffe03a', rarity: 'Divine',    income: 1e12 },
  mechadragon:  { name: 'Mecha Dragon',    kind: 'dragon',  color: '#5d6470', accent: '#ffb02e', rarity: 'Omega',     income: 2e12 },
  dreambunny:   { name: 'Dream Bunny',     kind: 'bunny',   color: '#e8d9ff', accent: '#ff9ad5', rarity: 'Divine',    income: 3e12 },
  sleepybear:   { name: 'Sleepy Bear',     kind: 'bear',    color: '#b28cff', accent: '#ffe0f5', rarity: 'Divine',    income: 5e12 },
  starfox:      { name: 'Star Fox',        kind: 'fox',     color: '#7a5cff', accent: '#ffe03a', rarity: 'Omega',     income: 1e13 },
  nightserpent: { name: 'Nightmare Serpent', kind: 'snake', color: '#2a1f4a', accent: '#ff5ab4', rarity: 'Omega',     income: 2e13 },
  riftslime:    { name: 'Rift Slime',      kind: 'slime',   color: '#ff2a55', accent: '#111018', rarity: 'Omega',     income: 3e13 },
  omegapenguin: { name: 'Omega Penguin',   kind: 'penguin', color: '#111018', accent: '#ff2a55', rarity: 'Omega',     income: 5e13 },
  riftunicorn:  { name: 'Rift Unicorn',    kind: 'unicorn', color: '#111018', accent: '#ff2a55', rarity: 'Omega',     income: 1e14 },
  omegadragon:  { name: 'Omega Dragon',    kind: 'dragon',  color: '#0b0a10', accent: '#ff2a55', rarity: 'Omega',     income: 2e14 },
  // ---- fuse-only pets ----
  goldbunny:       { name: 'Golden Bunny',     kind: 'bunny',   color: '#ffc92e', accent: '#fff4a8', rarity: 'Epic',      income: 600,   fuse: true },
  goldpig:         { name: 'Golden Pig',       kind: 'pig',     color: '#ffc92e', accent: '#fff4a8', rarity: 'Epic',      income: 900,   fuse: true },
  goldowl:         { name: 'Golden Owl',       kind: 'owl',     color: '#ffc92e', accent: '#ffffff', rarity: 'Legendary', income: 1800,  fuse: true },
  prismfrog:       { name: 'Prism Frog',       kind: 'frog',    color: '#7fe0ff', accent: '#ff5ab4', rarity: 'Legendary', income: 12000, fuse: true },
  rainbowcat:      { name: 'Rainbow Cat',      kind: 'cat',     color: '#ff9ad5', accent: '#7fe0ff', rarity: 'Legendary', income: 20000, fuse: true },
  unicorn:         { name: 'Unicorn',          kind: 'unicorn', color: '#ffffff', accent: '#ff7ae6', rarity: 'Mythic',    income: 45000, fuse: true },
  diamonddog:      { name: 'Diamond Dog',      kind: 'dog',     color: '#bff4ff', accent: '#ffffff', rarity: 'Mythic',    income: 250000, fuse: true },
  crystalturtle:   { name: 'Crystal Turtle',   kind: 'turtle',  color: '#e9fbff', accent: '#6fd6ff', rarity: 'Mythic',    income: 400000, fuse: true },
  diamondowl:      { name: 'Diamond Owl',      kind: 'owl',     color: '#bff4ff', accent: '#4fb8ff', rarity: 'Secret',    income: 900000, fuse: true },
  cosmicmonkey:    { name: 'Cosmic Monkey',    kind: 'monkey',  color: '#2b1f6b', accent: '#7fe0ff', rarity: 'Mythic',    income: 5e6,   fuse: true },
  astrocrab:       { name: 'Astro Crab',       kind: 'crab',    color: '#6b4fe8', accent: '#ffe066', rarity: 'Secret',    income: 9e6,   fuse: true },
  cosmicunicorn:   { name: 'Cosmic Unicorn',   kind: 'unicorn', color: '#1a1040', accent: '#ff7ae6', rarity: 'Secret',    income: 2e7,   fuse: true },
  angelbunny:      { name: 'Angel Bunny',      kind: 'bunny',   color: '#fffbe8', accent: '#ffd23a', rarity: 'Secret',    income: 6e7,   fuse: true },
  celestialdragon: { name: 'Celestial Dragon', kind: 'dragon',  color: '#fffbe8', accent: '#ffd23a', rarity: 'Secret',    income: 1.5e8, fuse: true },
};
export const petValue = (id) => Math.round(PETS[id].income * 25);

export function weighted(table) {
  const entries = Object.entries(table);
  let roll = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) { roll -= w; if (roll <= 0) return k; }
  return entries[0][0];
}
export function rollZoneEgg(zone) {
  const t = {};
  for (const id of ZONES[zone].eggs) t[id] = EGGS[id].weight;
  return weighted(t);
}
// How "strong" an egg is when fusing: canyon eggs = their zone, Moon = after the last zone,
// fuse-only eggs sit between zones (Golden ~ zone 1, Rainbow ~ 3, ...).
const eggPower = (t) => (EGGS[t].fuseTier !== undefined ? EGGS[t].fuseTier * 2 + 1 : EGGS[t].power ?? EGGS[t].zone);

// Egg Fuse Machine:
//  - 3 fuse-only eggs of the same kind -> the next fuse-only egg (Golden -> Rainbow -> Diamond -> Cosmic -> Celestial)
//  - 3 eggs from the same zone -> 35% a fuse-only egg, otherwise an egg from the next zone
//  - anything else -> an egg from the best zone you put in
export function fuseResult(types) {
  const same = types.every((t) => eggPower(t) === eggPower(types[0]));
  if (types.every((t) => EGGS[t].fuseTier !== undefined)) {
    const best = Math.max(...types.map((t) => EGGS[t].fuseTier));
    return FUSE_EGGS[Math.min(FUSE_EGGS.length - 1, same ? best + 1 : best)];
  }
  const best = Math.max(...types.map(eggPower));
  if (same) {
    if (Math.random() < FUSE_EXCLUSIVE_CHANCE) return FUSE_EGGS[Math.min(FUSE_EGGS.length - 1, Math.floor(best / 2))];
    return rollZoneEgg(Math.min(best + 1, ZONES.length - 1));
  }
  return rollZoneEgg(Math.min(best, ZONES.length - 1));
}

// Pet Fuser: 3 pets -> a fuse-only egg. Better pets = better egg; 3 of the same rarity (Rare or better) bumps it up one.
export function petFuseResult(petIds) {
  const ranks = petIds.map((id) => RARITY_ORDER.indexOf(PETS[id].rarity));
  const best = Math.max(...ranks);
  let tier = best <= 1 ? 0 : Math.min(4, best - 1); // Common/Uncommon->Golden, Rare->Rainbow, Epic->Diamond, Legendary->Cosmic, Mythic+->Celestial
  if (best >= 2 && ranks.every((r) => r === ranks[0])) tier = Math.min(4, tier + 1);
  return FUSE_EGGS[tier];
}
// How long the machines take, in seconds (600 = 10 minutes)
export const FUSE_TIME = 600;
export const PET_FUSE_TIME = 600;

// ---------------- player movement ----------------
export const SLOW_MULT = 0.38;
export const CARRY_MULT = 1;   // carrying an egg doesn't slow you down
export const GUARDIAN_RAGE = 1.5; // if you're slower than the sign, the guardian runs this much faster
export const guardianSpeed = (zone) => walkSpeed(ZONES[zone].rec);
export const walkSpeed = (stat) => 16 + 5 * Math.log10(1 + stat);

export const SHOP = {
  startNests: 3,
  maxNests: 10,        // +5 more with the Nests gamepass
  nestCost: (n) => Math.round(400 * Math.pow(4, n - 3)),
};

// ---------------- treadmill (the only way to get speed) ----------------
// Stand on your own treadmill to run in place. Upgrade it for more speed per second.
export const TREADMILL = {
  maxLevel: 33,
  gain: (lvl) => Math.round(10 * Math.pow(2.2, lvl - 1)),        // speed per second (before rebirth/VIP boosts)
  // price to go from lvl to lvl+1 (grows a bit slower after level 18)
  cost: (lvl) => Math.round(lvl <= 18 ? 150 * Math.pow(3.3, lvl - 1) : 150 * Math.pow(3.3, 17) * Math.pow(2.6, lvl - 18)),
  tiers: ['Basic', 'Sport', 'Crystal', 'Lava', 'Galaxy', 'Rainbow', 'Omega'],
  // 1-3 Basic, 4-6 Sport, 7-9 Crystal, 10-12 Lava, 13-18 Galaxy, 19-25 Rainbow, 26-33 Omega
  tier: (lvl) => (lvl >= 26 ? 6 : lvl >= 19 ? 5 : Math.min(4, Math.floor((lvl - 1) / 3))),
  len: 7, width: 3.2,
};
export function treadmillPos(i) {
  const c = plotCenter(i);
  return { x: c.x - c.side * 8, z: c.z + 6.5, side: c.side };      // belt runs along x, runner faces the plaza centre
}
export function onTreadmill(i, x, z) {
  const t = treadmillPos(i);
  return Math.abs(x - t.x) <= TREADMILL.len / 2 - 0.3 && Math.abs(z - t.z) <= TREADMILL.width / 2;
}
export function treadBoardPos(i) {
  const t = treadmillPos(i);
  return { x: t.x, z: t.z + 3.6 };
}

// ---------------- rebirth ----------------
// Reset money, speed and treadmill for a permanent boost. Pets, eggs, nests and gamepasses are kept.
export const REBIRTH = {
  cost: (r) => Math.round(1e8 * Math.pow(15, r)),   // money needed for your next rebirth (r = rebirths you already have)
  boost: 0.5,                                      // +50% money and speed per rebirth
};

// ---------------- gamepasses (real money, via Stripe) ----------------
// price is in grosze (1999 = 19,99 zł). PLN is required for BLIK.
export const PASSES = {
  x2money: { name: '2x Money', desc: 'Double the money your pets make, forever.', price: 1999, icon: '💰' },
  vip:     { name: 'VIP', desc: 'Gold name with a crown, +20% money and +20% treadmill speed.', price: 2999, icon: '👑' },
  nests:   { name: '+5 Nests', desc: 'Five extra nests at your base (up to 15), so more eggs hatch at once.', price: 1499, icon: '🪺' },
};
export const MAX_NESTS_WITH_PASS = 15;
export function moneyMult(rebirths, passes) {
  return (1 + REBIRTH.boost * rebirths) * (passes.includes('x2money') ? 2 : 1) * (passes.includes('vip') ? 1.2 : 1);
}
export function speedMult(rebirths, passes) {
  return (1 + REBIRTH.boost * rebirths) * (passes.includes('vip') ? 1.2 : 1);
}
export const maxNestsFor = (passes) => (passes.includes('nests') ? MAX_NESTS_WITH_PASS : SHOP.maxNests);

export const BAT = { range: 4.2, cooldown: 1, stun: 1, knock: 6 };
export const DAY = { cycle: 300, night: 90 }; // last 90s of every 5 minutes is night

// Keep players inside the plaza + canyon.
export function clampMove(ox, oz, nx, nz) {
  nx = Math.max(-PLAZA_HALF_X, Math.min(PLAZA_HALF_X, nx));
  nz = Math.max(PLAZA_MIN_Z, Math.min(WORLD_END_Z - 2, nz));
  if (nz > SAFE_Z && Math.abs(nx) > CORRIDOR_HALF) {
    if (oz <= SAFE_Z) nz = SAFE_Z;
    else nx = Math.sign(nx) * CORRIDOR_HALF;
  }
  return [nx, nz];
}

// ---------------- plots ----------------
export const PLOT = { w: 30, d: 24 };
export function plotCenter(i) {
  const side = i < 4 ? -1 : 1;
  return { x: side * 56, z: -118 + (i % 4) * 30, side };
}
export function insidePlot(i, x, z) {
  const c = plotCenter(i);
  return Math.abs(x - c.x) <= PLOT.w / 2 && Math.abs(z - c.z) <= PLOT.d / 2;
}
export function nestPos(i, n) {
  const c = plotCenter(i);
  const row = Math.floor(n / 5), col = n % 5;
  return { x: c.x + c.side * (3.5 + row * 4.5), z: c.z - 9.2 + col * 4.6 };
}

// ---------------- formatting ----------------
export function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const u = ['K', 'M', 'B', 'T', 'Qd', 'Qn', 'Sx', 'Sp', 'Oc'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, '')}${u[i]}`;
}
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
