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
| Build mode (Z category, 1-7 pick, T rotate, F place, X remove) | B | BUILD |
| Crafting | C | CRAFT |
| Skills | K | SKILLS |
| Missions | O | QUESTS |
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
- **v0.13** — crafting tiers: gather wood (trees), stone/metal (rocks), berries & herbs (bushes), lake water; new materials (cloth, leather, metal, bone, rope…); crafting menu with Workbench / Campfire / Forge stations; tier 1–3 weapons (bone spear, crossbow + bolts, machete, fire axe, pistol, shotgun, rifle, katana), armour (leather 15%, riot 30%, military 45%), bandages, herbal remedies, medkits, cooking (meat, stews, boiled water); equip gear in the backpack
- **v0.14** — hunting: deer and rabbits (run away), boars (charge), wolf packs (hunt at night); butcher bodies for raw meat, hide and bone; new builds: snare (catches rabbits overnight), hunting stand (climb up — zombies can't reach you), tanning rack (hide → leather), smokehouse (jerky)
- **v0.15** — more base buildings, sorted into Defense / Survival / Crafting / Hunting: stone walls, metal gates, barricades, watchtower (climb up, zombies can't reach), torch posts, garden plots (plant seeds → vegetables in 2 days), rain collectors (daily water, more when it rains)
- **v0.16** — explorable buildings: Pine Hollow houses now have rooms and furniture to search (beds, fridges, shelves, sofas); three new two-storey places with real stairs — Kessler County Police (lockers with guns and riot gear), Hillside Apartments, Pine Valley School; upper floors and roofs hide while you're inside
- **v0.17** — new zombies: screamers (call the horde), exploders (blow up when close or killed), armoured riot zombies (only heavy hits get through), crawlers; bosses with health bars: The Colonel at Fort Kessler (charges, ground slams, calls soldiers) and Patient Zero at Helix Lab (teleports, spits acid, calls runners) — big rewards, and killing Patient Zero weakens every zombie
- **v0.18** — character creator (name, skin, hairstyle and colour, jacket, trousers, live 3D preview) with 5 backgrounds (Fighter, Scavenger, Medic, Hunter, Mechanic) that give a starting kit and bonus; XP and levels (+5 max health each) from kills, bosses, hunting, gathering, crafting, building, exploring; skill tree with 6 skills in Combat / Survival / Crafting
- **v0.19** — missions: 3-part story chains from each faction leader (Haven: medicine run → rescue the lost scout → defend the Haven; Iron Wolves: fuel → riot zombies → take Fort Kessler; Order: screamers → the old radio → Patient Zero), side missions from survivors (clear hordes, hunt, deliver, rescue + escort a friend who then joins you), tracked mission with a gold beacon, minimap star and HUD tracker; story chapters (Outbreak → Factions at War → The Source → The Last Signal) and 2 new endings (Evacuation, The New World)
- **v0.20** — polish: parked cars are solid; settings menu (graphics Auto/Low/Medium/High — Auto lowers quality by itself if it runs slowly; ink outlines on/off; look sensitivity; invert look; FPS counter; tutorial on/off); step-by-step tips for new players

## Saving to GitHub
1. Create a fine-grained token: github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → *Generate new token*.
   - Repository access: **Only select repositories** → this repo
   - Permissions → Repository → **Contents: Read and write**
2. In the game: title screen → **GitHub storage** (or pause → GitHub settings). Owner and repo fill in automatically on GitHub Pages; paste the token.
3. Pause → **Save to GitHub**. Each save is a commit to `saves/<slot>.json` — your full world, faction, members and decisions.

The token is kept only in that browser's local storage and is only sent to `api.github.com`.

## How decisions change the game
Every story choice sets flags, shifts faction reputation, can wipe out or arm whole factions, changes zombie strength/numbers, and unlocks different endings. Your journal (J) records every decision.
