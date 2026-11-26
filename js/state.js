// The one shared game state. Everything that must be saved lives in G.save.
export const VERSION = '0.28';

export const G = {
  scene: null, camera: null, renderer: null,
  player: null,          // runtime player object (mesh, velocity…)
  systems: [],           // objects with update(dt) called every frame
  time: 0,
  save: null,            // plain JSON — this is what gets written to GitHub
  // tiny event bus so systems can react to each other
  _ev: {},
  on(name, fn) { (this._ev[name] = this._ev[name] || []).push(fn); },
  emit(name, data) { for (const fn of this._ev[name] || []) fn(data); }
};

export function newSave(name = 'Survivor') {
  return {
    version: VERSION,
    created: new Date().toISOString(),
    player: { name, x: 0, z: 0, rot: 0, look: null, perk: null },
    skills: {},
    missions: { active: [], done: [], tracked: null, chain: {} },
    stats: { hp: 100, maxHp: 100, hunger: 90, thirst: 90, stamina: 100, kills: 0, xp: 0, level: 1, points: 0, warmth: 100 },
    inv: { melee: 'bat', gun: null, armor: 'none', ammo: 0, bolts: 0, food: 1, water: 1, meds: 0, wood: 0, scrap: 0, fuel: 0, ownedMelee: ['bat'], ownedGuns: [], ownedArmor: [] },
    world: { day: 1, hour: 8, mods: {}, discovered: [], looted: {} },
    factions: { rep: { haven: 10, wolves: -10, order: 0 }, allies: [], destroyed: [], leadersKilled: [], player: null },
    builds: [],
    vehicles: [],
    karma: 0,
    story: { flags: {}, done: {}, log: [], endings: [], jobs: {} }
  };
}
