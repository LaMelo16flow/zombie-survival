# Dead Ground — 3D Zombie Survival

An open-world zombie survival game that runs in the browser (PC and iPhone), built with Three.js.
Every decision changes where the story goes. Create your own faction, recruit survivors, explore.

**Play:** enable GitHub Pages for this repo (Settings → Pages → Deploy from branch `main`, folder `/`).

## Controls
| | PC | iPhone |
|---|---|---|
| Move | WASD | left thumb |
| Look | mouse (click to lock) | drag right side |
| Sprint | Shift | push stick to the edge |
| Melee | F / Space / left click | HIT |
| Shoot | R / right click | SHOOT |
| Use / search | E | USE |
| Backpack | I | BAG |
| Map | M | MAP |
| Your faction | Q | CREW |
| Follow / hold position | G | CMD |
| Journal (goals + your decisions) | J | LOG |
| Pause / save / load | P | MENU |
| Build mode (1-7 pick, T rotate, F place, X remove) | B | BUILD |
| Drive: get in/out · gas/brake · steer · horn | E · W/S · A/D · F | USE · stick · HIT |

## Build log
- **v0.1** — 3D open world (1 km²), third-person character, camera, PC + touch controls
- **v0.2** — zombies (walker, runner, brute), melee + guns, health/food/water/stamina, day–night cycle (night = more, faster zombies), flashlight, death screen
- **v0.3** — 10 places to explore (town, gas station, farm, hospital, military fort, mall, lab, 3 faction camps), walk-in buildings, lootable crates that refill, backpack (eat/drink/heal), map with discovery, hordes guarding dangerous places
- **v0.4** — factions: create your own (name, colour, belief), recruit survivors who follow and fight, claim a base (safe zone, daily food/water from guards, sleep), 3 rival factions (Riverside Haven, Iron Wolves, Order of the Signal) with leaders, guards, trading, reputation and alliances; hostile factions attack you
- **v0.5** — branching story: 9 decision events (the radio, Dr. Okafor, the armory, the faction war, the Signal, Helix Lab, the cure, raids, sieges), faction side-jobs, karma, journal, and 5 endings (The Cure, Warlord, A New Dawn, The Signal's Choir, Lone Survivor)
- **v0.6** — saving: autosave on the device every 30 s, plus Save/Load to GitHub (`saves/<slot>.json` in this repo, one commit per save), title screen Continue / Load, pause menu
- **v0.7** — anime cel-shaded graphics: toon shading, ink outlines (post-process), painted sky with sun, puffy clouds and stars, sunrise/sunset colours and blue anime nights, lakes with foam and glints (you can swim), round and pine trees, grass and flowers, brighter buildings
- **v0.8** — anime characters: big heads with anime eyes and shine, 5 hairstyles, scarves, backpacks, sneakers, faction bandanas; zombies with glowing red eyes, torn sleeves, blood stains and a lurching walk (4 looks per type); new weapon models; blood bursts, impact stars, camera shake; melee soft lock-on
- **v0.9** — anime menus & HUD: comic-style title screen, slanted HP/food/water/stamina bars with damage trail, portrait with health ring, clock with sun/moon, rotating minimap (zombies, people, lakes), painted world map, cinematic place/day banners, visual-novel dialog boxes (number keys pick choices), backpack item cards, floating damage numbers, restyled touch buttons
- **v0.10** — sound & atmosphere: live-synthesised music (calm pads by day, darker at night, drums kick in when zombies chase you), swings, hits, gunshots, footsteps (splashes in water), zombie groans from the left/right, pickups, rain, wind, thunder, night crickets; weather (clear, cloudy, rain, storm with lightning, fog) that changes over time — rain and fog make zombies see less; fireflies on clear nights; music/sound toggles in the pause menu
- **v0.11** — base building: walls (snap together), doors, spike traps, campfires (light + healing), beds (sleep), workbench (craft ammo, meds, machete, pistol, rifle), storage boxes; zombies claw through walls and doors, so defend and rebuild; everything you build is saved (and to GitHub)
- **v0.12** — vehicles: 8 cars and pickup trucks around the map, arcade driving with suspension tilt and headlights, engine sound, fuel (fuel cans + the gas station pump), crash damage, wrecks you can repair with scrap, run over zombies; vehicle position, fuel and damage are saved

## Saving to GitHub
1. Create a fine-grained token: github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → *Generate new token*.
   - Repository access: **Only select repositories** → this repo
   - Permissions → Repository → **Contents: Read and write**
2. In the game: title screen → **GitHub storage** (or pause → GitHub settings). Owner and repo fill in automatically on GitHub Pages; paste the token.
3. Pause → **Save to GitHub**. Each save is a commit to `saves/<slot>.json` — your full world, faction, members and decisions.

The token is kept only in that browser's local storage and is only sent to `api.github.com`.

## How decisions change the game
Every story choice sets flags, shifts faction reputation, can wipe out or arm whole factions, changes zombie strength/numbers, and unlocks different endings. Your journal (J) records every decision.
