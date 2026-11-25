// The one shared game state. Everything that must be saved lives in G.save.
export const VERSION = '0.1';

export const G = {
  scene: null, camera: null, renderer: null,
  player: null,          // runtime player object (mesh, velocity…)
  systems: [],           // objects with update(dt) called every frame
  time: 0,
  save: null             // plain JSON — this is what gets written to GitHub
};

export function newSave(name = 'Survivor') {
  return {
    version: VERSION,
    created: new Date().toISOString(),
    player: { name, x: 0, z: 0, rot: 0 }
  };
}
