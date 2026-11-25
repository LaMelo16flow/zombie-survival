// Every item, weapon and armour in one place.

// Stackable items in the backpack. use = what happens when you tap it.
export const ITEMS = {
  food:    { name: 'Canned food', icon: 'food', use: { label: 'Eat', fx: s => { s.hunger = Math.min(100, s.hunger + 35); }, msg: '+35 food' } },
  water:   { name: 'Water', icon: 'water', use: { label: 'Drink', fx: s => { s.thirst = Math.min(100, s.thirst + 40); }, msg: '+40 water' } },
  meds:    { name: 'Medkit', icon: 'meds', use: { label: 'Heal', fx: s => { s.hp = Math.min(s.maxHp, s.hp + 45); }, msg: '+45 health' } },
  bandage: { name: 'Bandage', icon: 'cloth', use: { label: 'Use', fx: s => { s.hp = Math.min(s.maxHp, s.hp + 20); }, msg: '+20 health' } },
  herbmed: { name: 'Herbal remedy', icon: 'leaf', use: { label: 'Drink', fx: s => { s.hp = Math.min(s.maxHp, s.hp + 30); s.thirst = Math.min(100, s.thirst + 10); }, msg: '+30 health' } },
  rawmeat: { name: 'Raw meat', icon: 'meat', use: { label: 'Eat raw', fx: s => { s.hunger = Math.min(100, s.hunger + 12); s.hp = Math.max(1, s.hp - 8); }, msg: '+12 food, but you feel sick (−8 health)' } },
  meat:    { name: 'Cooked meat', icon: 'meat', use: { label: 'Eat', fx: s => { s.hunger = Math.min(100, s.hunger + 40); }, msg: '+40 food' } },
  jerky:   { name: 'Smoked jerky', icon: 'meat', use: { label: 'Eat', fx: s => { s.hunger = Math.min(100, s.hunger + 30); s.stamina = 100; }, msg: '+30 food, full stamina' } },
  stew:    { name: 'Hearty stew', icon: 'food', use: { label: 'Eat', fx: s => { s.hunger = Math.min(100, s.hunger + 60); s.thirst = Math.min(100, s.thirst + 25); s.hp = Math.min(s.maxHp, s.hp + 15); }, msg: '+60 food, +25 water, +15 health' } },
  berries: { name: 'Berries', icon: 'leaf', use: { label: 'Eat', fx: s => { s.hunger = Math.min(100, s.hunger + 10); s.thirst = Math.min(100, s.thirst + 5); }, msg: '+10 food' } },
  veg:     { name: 'Vegetables', icon: 'leaf', use: { label: 'Eat', fx: s => { s.hunger = Math.min(100, s.hunger + 20); }, msg: '+20 food' } },
  wood:    { name: 'Wood', icon: 'wood' },
  stone:   { name: 'Stone', icon: 'stone' },
  scrap:   { name: 'Scrap', icon: 'scrap' },
  metal:   { name: 'Metal bars', icon: 'metal' },
  cloth:   { name: 'Cloth', icon: 'cloth' },
  hide:    { name: 'Raw hide', icon: 'leather' },
  leather: { name: 'Leather', icon: 'leather' },
  bone:    { name: 'Bone', icon: 'bone' },
  herbs:   { name: 'Herbs', icon: 'leaf' },
  seeds:   { name: 'Seeds', icon: 'leaf' },
  rope:    { name: 'Rope', icon: 'cloth' },
  ammo:    { name: 'Bullets', icon: 'ammo' },
  bolts:   { name: 'Crossbow bolts', icon: 'ammo' },
  fuel:    { name: 'Fuel can', icon: 'water' },
  lakewater: { name: 'Lake water', icon: 'water', use: { label: 'Drink', fx: s => { s.thirst = Math.min(100, s.thirst + 20); if (Math.random() < 0.4) s.hp = Math.max(1, s.hp - 10); }, msg: '+20 water (boil it at a campfire to be safe)' } }
};

// Melee weapons — tier 0 to 3
export const MELEE = {
  fists:   { name: 'Fists', tier: 0, dmg: 10, range: 1.8, arc: 1.2, cd: 0.45 },
  bat:     { name: 'Baseball bat', tier: 1, dmg: 24, range: 2.4, arc: 1.4, cd: 0.6 },
  spear:   { name: 'Bone spear', tier: 1, dmg: 30, range: 3.1, arc: 0.8, cd: 0.6 },
  machete: { name: 'Machete', tier: 2, dmg: 38, range: 2.5, arc: 1.3, cd: 0.55 },
  axe:     { name: 'Fire axe', tier: 2, dmg: 52, range: 2.5, arc: 1.4, cd: 0.8, chop: 2 },
  katana:  { name: 'Katana', tier: 3, dmg: 70, range: 2.8, arc: 1.7, cd: 0.5 }
};
// Ranged weapons
export const GUNS = {
  crossbow: { name: 'Crossbow', tier: 1, dmg: 75, cd: 1.1, ammo: 'bolts', noise: 14 },
  pistol:   { name: 'Pistol', tier: 1, dmg: 34, cd: 0.35, ammo: 'ammo', noise: 60 },
  shotgun:  { name: 'Shotgun', tier: 2, dmg: 22, cd: 0.9, ammo: 'ammo', noise: 70, pellets: 6 },
  rifle:    { name: 'Rifle', tier: 3, dmg: 90, cd: 0.9, ammo: 'ammo', noise: 80 }
};
// Armour: fraction of damage blocked
export const ARMOR = {
  none:     { name: 'No armour', block: 0 },
  leather:  { name: 'Leather jacket', block: 0.15, tier: 1 },
  riot:     { name: 'Riot gear', block: 0.3, tier: 2 },
  military: { name: 'Military armour', block: 0.45, tier: 3 }
};
