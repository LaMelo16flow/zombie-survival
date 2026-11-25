import { G } from './state.js';
import { pressed, addTouchButton } from './input.js';
import { LOCATIONS } from './locations.js';
import { FACTIONS, relation, changeRep, karma, destroyFaction, spawnRaiders, addSpecialMember, members } from './factions.js';
import { spawnGroup } from './zombies.js';
import { toast, showChoice, showModal, closeModal, esc } from './ui.js';

/*
  THE STORY — every event is a decision. Choices set flags, change reputations,
  destroy or strengthen factions, change the zombies, and unlock different endings.

  Main threads:
   • The Signal  — a radio voice. Who is really broadcasting? (Order of the Signal / Helix Lab)
   • The Cure    — Dr. Okafor + the Strain Zero sample from Helix Lab
   • The War     — the Iron Wolves want Riverside Haven gone
*/

const S = () => G.save.story;
const flag = (k, v = true) => { S().flags[k] = v; };
const has = k => !!S().flags[k];
const loc = id => LOCATIONS.find(l => l.id === id);
const near = (id, pad = 0) => { const L = loc(id), p = G.player.pos; return Math.hypot(p.x - L.x, p.z - L.z) < L.r + pad; };
const day = () => G.save.world.day;
const mine = () => G.save.factions.player;

export function log(text) { S().log.push({ day: day(), text }); }
function mod(k, v) { G.save.world.mods[k] = v; }

// Each event: id, when() → should it fire now, run() → shows the decision.
const EVENTS = [
  {
    id: 'wake', when: () => G.time > 2,
    run: () => showChoice('Day 1 — The Radio', `You wake up in a crashed car outside Pine Hollow. Your head is bleeding. On the dashboard a radio crackles:<br><br>
      <i>"...anyone alive... the dead are a judgement... come to the tower... the Signal will save you..."</i>`, [
      { label: 'Answer the radio', note: 'The Order will know you exist', fn: () => { flag('answered'); changeRep('order', 10); log('Answered the Signal on the radio.'); } },
      { label: 'Turn it off and stay quiet', note: 'Zombies notice you less', fn: () => { flag('silent'); mod('stealth', 0.85); log('Stayed silent and slipped away unseen.'); toast('You move more quietly from now on.'); } },
      { label: 'Rip the radio out for parts', note: '+3 scrap', fn: () => { G.save.inv.scrap += 3; flag('noradio'); log('Took the radio apart for scrap.'); } }
    ], { lock: true })
  },
  {
    id: 'hospital', when: () => near('hospital', -8),
    run: () => {
      const choices = [
        { label: 'Break the door and save her', note: 'A horde will come — fight them off', fn: () => {
          flag('doctor'); karma(3); spawnGroup(loc('hospital').x, loc('hospital').z + 30, 10, ['walker', 'runner']);
          if (mine()) { addSpecialMember('Dr. Okafor', 'doctor'); toast('<b>Dr. Okafor</b> joins you. She heals you when she is near.', 4); }
          else { flag('doctorAtHaven'); toast('Dr. Okafor escapes to Riverside Haven. Find her there.', 4); changeRep('haven', 10); }
          log('Saved Dr. Okafor from the hospital.');
        } },
        { label: 'Take her research notes and leave her', note: 'Cold, but safe', fn: () => { flag('notes'); karma(-3); G.save.inv.meds += 2; log('Took Dr. Okafor\'s notes and left her behind.'); } }
      ];
      if (relation('order') !== 'hostile' && relation('order') !== 'gone') choices.push({ label: 'Tell the Order of the Signal where she is', note: 'They want her "for the Signal"', fn: () => {
        flag('doctorOrder'); karma(-4); changeRep('order', 25); changeRep('haven', -10); log('Gave Dr. Okafor to the Order of the Signal.'); } });
      showChoice("St. Mary's Hospital — Dr. Okafor", `Behind a barricaded door a woman shouts: <i>"I'm Dr. Okafor! I was working on a cure before the fall. My research is on that desk — please, get me out!"</i><br><br>Dozens of the dead are pressing against the other side.`, choices, { lock: true });
    }
  },
  {
    id: 'armory', when: () => near('fort', -15),
    run: () => {
      const ch = [
        { label: 'Keep the weapons for yourself', note: 'Rifle + 20 ammo', fn: () => { G.save.inv.gun = 'rifle'; G.save.inv.ammo += 20; flag('armory', 'self'); changeRep('wolves', -5); log('Took the Fort Kessler armory for yourself.'); } },
        { label: 'Tell the Iron Wolves', note: 'Wolves grow much stronger', fn: () => { flag('armory', 'wolves'); changeRep('wolves', 25); changeRep('haven', -10); karma(-2); log('Sold the armory location to the Iron Wolves.'); } },
        { label: 'Tell Riverside Haven', note: 'Haven can finally defend itself', fn: () => { flag('armory', 'haven'); changeRep('haven', 25); changeRep('wolves', -10); karma(2); log('Gave the armory to Riverside Haven.'); } },
        { label: 'Blow it up so nobody gets it', note: 'The explosion will draw every zombie for miles', fn: () => {
          flag('armory', 'destroyed'); mod('density', 1.5); spawnGroup(loc('fort').x, loc('fort').z, 14, ['walker', 'runner', 'brute']);
          G.save.story.flags.hordeUntil = day() + 2; log('Destroyed the Fort Kessler armory. The dead are swarming.'); toast('BOOM. The dead are coming…', 3); } }
      ];
      showChoice('Fort Kessler — The Armory', 'Behind a blast door you find a sealed armory: rifles, crates of ammunition, explosives. Enough to arm a small army. Whoever controls this controls the region.', ch, { lock: true });
    }
  },
  {
    id: 'war', when: () => day() >= 3 && G.save.world.hour > 9 && relation('wolves') !== 'gone' && relation('haven') !== 'gone',
    run: () => showChoice('Day ' + day() + ' — Kane\'s Offer', `An Iron Wolves rider finds you. <i>"Kane says Riverside Haven is sitting on food and medicine they don't deserve. Tomorrow we take it. Ride with us and you get a share — or get out of the way."</i>`, [
      { label: 'Join the raid on Riverside Haven', note: 'Haven will be wiped out', fn: () => {
        destroyFaction('haven'); changeRep('wolves', 30); karma(-6); flag('war', 'joined'); G.save.inv.food += 6; G.save.inv.meds += 3; G.save.inv.ammo += 10;
        log('Joined the Iron Wolves and destroyed Riverside Haven.'); toast('Riverside Haven burns. You take your share.', 4); } },
      { label: 'Warn Riverside Haven', note: 'The Wolves will turn on you', fn: () => {
        changeRep('haven', 30); changeRep('wolves', -45); karma(3); flag('war', 'warned'); S().flags.raidDay = day() + 1;
        log('Warned Riverside Haven. Kane swears revenge.'); } },
      { label: 'Stay out of it', note: 'Let them fight it out', fn: () => {
        flag('war', 'neutral'); const havenWins = has('armory') && S().flags.armory === 'haven';
        if (havenWins) { changeRep('wolves', -10, true); log('Stayed out of the war. Haven, armed from the fort, drove the Wolves back.'); toast('Haven fought off the raid.'); }
        else { destroyFaction('haven'); log('Stayed out of the war. Riverside Haven fell.'); toast('Smoke rises over Riverside Haven…', 3); }
      } }
    ], { lock: true })
  },
  {
    id: 'revenge', when: () => S().flags.raidDay && day() >= S().flags.raidDay && relation('wolves') === 'hostile',
    run: () => {
      const P = G.player.pos, b = mine()?.base ? loc(mine().base) : null;
      const at = b || { x: P.x, z: P.z };
      const count = S().flags.armory === 'wolves' ? 8 : 5;
      spawnRaiders('wolves', at.x + 40, at.z + 40, count);
      log(b ? `The Iron Wolves attacked your base at ${b.name}.` : 'The Iron Wolves hunted you down.');
      showChoice('RAID!', `Engines roar. ${count} Iron Wolves are coming${b ? ' for your base' : ' for you'}. Kane wants you dead.`, [{ label: 'Fight!' }], { lock: true });
    }
  },
  {
    id: 'signal', when: () => near('tower', 0) && relation('order') !== 'hostile' && relation('order') !== 'gone',
    run: () => showChoice('The Radio Tower — Brother Elias', `Brother Elias spreads his arms. <i>"The Signal speaks to me every night. It says the dead are cleansing the world, and that we must lead them to the unbelievers. Will you serve the Signal?"</i><br><br>Behind him you notice a cable running from the transmitter… south, toward the old Helix Research Lab.`, [
      { label: 'Serve the Signal', note: 'Join the Order’s crusade', fn: () => { changeRep('order', 30); flag('servedSignal'); karma(-3); mod('zDmg', 0.85); log('Swore to serve the Signal.'); toast('The dead seem… gentler with you.'); } },
      { label: 'Follow the cable to Helix Lab', note: 'Find out who is really broadcasting', fn: () => { flag('cable'); if (!G.save.world.discovered.includes('lab')) G.save.world.discovered.push('lab'); log('Found a cable from the tower to Helix Lab.'); toast('Helix Research Lab marked on your map.'); } },
      { label: 'Sabotage the transmitter', note: 'The Order will hunt you', fn: () => { changeRep('order', -60); flag('sabotage'); karma(1); log('Sabotaged the Order\'s transmitter.'); } }
    ], { lock: true })
  },
  {
    id: 'lab', when: () => near('lab', -10),
    run: () => {
      const doc = has('doctor') || has('doctorAtHaven');
      showChoice('Helix Research Lab — Strain Zero', `Dead scientists everywhere. A terminal is still running, looping a recording into the radio tower: <b>the Signal is a machine</b> — an automatic message Helix made to keep survivors away from the lab.<br><br>In a cold-storage locker you find a vial labeled <b>STRAIN ZERO — PATIENT ORIGIN</b>. This is where it all started.`, [
        { label: doc ? 'Take the sample to Dr. Okafor' : 'Take the sample', note: doc ? 'The start of a cure' : 'Someone might know what to do with it', fn: () => { flag('sample'); flag('truth'); log('Took the Strain Zero sample from Helix Lab and learned the truth about the Signal.'); } },
        { label: 'Destroy the sample and the lab', note: 'No one can ever use it again', fn: () => { flag('labBurned'); flag('truth'); karma(1); mod('zHp', 0.85); log('Burned Helix Lab. The dead seem weaker.'); toast('The dead seem weaker now.'); } },
        { label: 'Broadcast the truth on the radio', note: 'The Order will collapse', fn: () => { flag('truth'); flag('exposed'); changeRep('haven', 10);
          if (relation('order') !== 'gone') { destroyFaction('order'); toast('The Order of the Signal falls apart.', 3); } log('Exposed the Signal as a machine. The Order collapsed.'); } }
      ], { lock: true });
    }
  },
  {
    id: 'cure', when: () => has('sample') && (has('doctor') && members().some(n => n.data.special === 'doctor') || (has('doctorAtHaven') && near('haven', 0))),
    run: () => showChoice('Dr. Okafor — The Cure', `Dr. Okafor holds the vial up to the light. <i>"With this and my notes I can make a vaccine. It will take time, a safe lab and people to protect it. Where do we build it?"</i>`, [
      { label: mine()?.base ? `At our base, ${loc(mine().base).name}` : 'At our base (you need one)', disabled: !mine()?.base, fn: () => { flag('cureAt', 'base'); S().flags.cureDay = day() + 3; log('Dr. Okafor began making a vaccine at your base.'); toast('Protect the base for 3 days.'); } },
      { label: 'At Riverside Haven', disabled: relation('haven') === 'gone', fn: () => { flag('cureAt', 'haven'); S().flags.cureDay = day() + 3; changeRep('haven', 20); log('Dr. Okafor began making a vaccine at Riverside Haven.'); } },
      { label: 'Sell the formula to the Iron Wolves', note: 'They will control who lives', disabled: relation('wolves') === 'gone', fn: () => { flag('cureSold'); changeRep('wolves', 40); karma(-6); log('Sold the cure to the Iron Wolves.'); } }
    ], { lock: true })
  },
  {
    id: 'lastSignal', when: () => G.save.world.bosses?.colonel === 'dead' && G.save.world.bosses?.zero === 'dead',
    run: () => showChoice('Chapter 4 — The Last Signal', `A real voice cuts through the static — not the Helix machine this time. <i>"This is the 4th Recovery Group. We heard Fort Kessler and Helix Lab have gone quiet. One helicopter. It lands at the Radio Tower at dawn. Room for one."</i>`, [
      { label: 'Take the helicopter and leave', note: 'Ends your story here', fn: () => { flag('evac'); log('Chose to leave on the helicopter.'); } },
      { label: 'Stay and rebuild', note: 'Your people need you', fn: () => { flag('stay'); karma(2); log('Chose to stay and rebuild.'); toast('Build a home: a base, 6 members and an ally.', 4); } },
      { label: 'Give the frequency to every faction', note: 'Everyone learns help exists — and you stay', fn: () => { flag('stay'); flag('shared'); karma(5);
        for (const f of ['haven', 'wolves', 'order']) if (relation(f) !== 'gone') changeRep(f, 20); log('Shared the rescue frequency with every faction.'); } }
    ], { lock: true })
  },
  {
    id: 'siege', when: () => mine()?.base && day() >= 5 && !S().flags.siegeDone && G.save.world.hour > 20,
    run: () => {
      const b = loc(mine().base); S().flags.siegeDone = true;
      spawnGroup(b.x + 45, b.z, 10, ['walker', 'runner']); spawnGroup(b.x - 45, b.z, 10, ['walker', 'brute']);
      log(`A horde besieged ${b.name}.`);
      showChoice('The Horde', `Night falls and the moaning grows louder. A huge horde is heading for ${b.name}. Get your people inside the walls!`, [{ label: 'Defend the base!' }], { lock: true });
    }
  }
];

/* ---------- Faction side-jobs ---------- */
const JOBS = {
  haven: { text: 'bring 3 food for the children', need: () => G.save.inv.food >= 3, pay: () => { G.save.inv.food -= 3; }, rep: 12, reward: () => { G.save.inv.meds += 1; return '1 meds'; } },
  wolves: { text: 'kill 15 of the dead to prove yourself', kill: 15, rep: 12, reward: () => { G.save.inv.ammo += 8; return '8 ammo'; } },
  order: { text: 'bring 2 medicine "for the faithful"', need: () => G.save.inv.meds >= 2, pay: () => { G.save.inv.meds -= 2; }, rep: 12, reward: () => { G.save.inv.water += 3; return '3 water'; } }
};
export function offerWork(f) {
  const J = JOBS[f], q = S().jobs[f], F = FACTIONS[f];
  if (q && q.doneDay === day()) { showChoice(F.leader, '"You\'ve done enough today. Come back tomorrow."', [{ label: 'OK' }]); return true; }
  if (!q || q.doneDay) {
    S().jobs[f] = { start: G.save.stats.kills };
    showChoice(F.leader, `"Want to earn our trust? ${J.text}."`, [{ label: 'I\'ll do it' }]); return true;
  }
  const ready = J.kill ? G.save.stats.kills - q.start >= J.kill : J.need();
  if (!ready) { showChoice(F.leader, `"Not done yet. ${J.text}${J.kill ? ` (${G.save.stats.kills - q.start}/${J.kill})` : ''}."`, [{ label: 'OK' }]); return true; }
  J.pay?.(); const got = J.reward(); changeRep(f, J.rep); q.doneDay = day();
  showChoice(F.leader, `"Good work." They give you ${got}.`, [{ label: 'Thanks' }]);
  return true;
}

/* ---------- Endings ---------- */
const ENDINGS = [
  { id: 'evac', title: 'Evacuation', when: () => has('evac'),
    text: () => `The helicopter lifts off at dawn. Below you, the world you survived shrinks to a green smudge. ${mine() ? esc(mine().name) + ' will have to go on without you.' : 'You never look back.'}` },
  { id: 'newworld', title: 'The New World', when: () => has('stay') && mine()?.base && (mine()?.members.length || 0) >= 6 && G.save.factions.allies.length >= 1,
    text: () => `${esc(mine().name)} becomes the heart of a new world — walls, gardens, children, and a radio that tells strangers where to find safety.${has('shared') ? ' Because you shared the frequency, even the Wolves come to trade instead of raid.' : ''}` },
  { id: 'cure', title: 'The Cure', when: () => S().flags.cureDay && day() >= S().flags.cureDay && (S().flags.cureAt === 'base' ? !!mine()?.base : relation('haven') !== 'gone'),
    text: () => `Dr. Okafor's vaccine works. The first injected survivor is bitten — and lives. ${S().flags.cureAt === 'base' ? esc(mine().name) + ' becomes the place the whole region comes to for hope.' : 'Riverside Haven shares it with everyone who asks.'} The dead will not win.` },
  { id: 'warlord', title: 'Warlord', when: () => (relation('haven') === 'gone' && (G.save.factions.rep.wolves >= 60 || S().flags.cureSold) && mine()?.members.length >= 4) || (G.save.factions.leadersKilled.length >= 2 && mine()?.members.length >= 4),
    text: () => `${mine() ? esc(mine().name) : 'Your gang'} controls every road, every well and every bullet. People survive — because you allow it.` },
  { id: 'dawn', title: 'A New Dawn', when: () => mine()?.base && G.save.factions.allies.includes('haven') && (mine()?.members.length || 0) >= 5 && (has('exposed') || relation('order') === 'gone' || has('labBurned')),
    text: () => `With Riverside Haven at your side and the lie of the Signal gone, ${esc(mine().name)} becomes a real town. Children play behind the walls again.` },
  { id: 'choir', title: "The Signal's Choir", when: () => has('servedSignal') && G.save.factions.rep.order >= 70,
    text: () => 'You lead the dead to the unbelievers night after night. You never learn the Signal was only a machine. You die certain you were chosen.' },
  { id: 'lone', title: 'Lone Survivor', when: () => !mine() && day() >= 15,
    text: () => 'Fifteen days. No flag, no friends, no one to lose. You are still alive — and the road keeps going.' }
];

function showEnding(E) {
  G.save.story.endings.push(E.id);
  log(`ENDING reached: ${E.title}`);
  showModal(`<div class="panel center"><h2 style="font-size:28px">${E.title}</h2><p>${E.text()}</p>
    <p style="opacity:.6;font-size:13px">Day ${day()} · ${G.save.stats.kills} zombies killed · karma ${G.save.karma}<br>Endings found: ${G.save.story.endings.length}/${ENDINGS.length}</p>
    <button class="primary" id="end-go">Keep playing</button> <button id="end-new">New game</button></div>`);
  G.lockModal = true;
  document.getElementById('end-go').onclick = () => { G.lockModal = false; closeModal(); };
  document.getElementById('end-new').onclick = () => { G.newGame?.(); };
}

/* ---------- Journal ---------- */
function hints() {
  const h = [];
  if (!mine()) h.push('Found your own faction (Q / CREW) and recruit survivors.');
  else if (!mine().base) h.push('Claim a place you discovered as your base (10 wood, 5 scrap).');
  if (!S().done.hospital) h.push('Someone may still be alive in St. Mary\'s Hospital (north-west).');
  if (!S().done.armory) h.push('Fort Kessler (south-east) was a military base.');
  if (!S().done.signal) h.push('The radio voice comes from the Radio Tower (far south).');
  if (has('cable') && !S().done.lab) h.push('Follow the cable to Helix Research Lab (south-west corner).');
  if (has('sample') && !S().done.cure) h.push('Bring the Strain Zero sample to Dr. Okafor.');
  if (S().flags.cureDay && day() < S().flags.cureDay) h.push(`Protect the vaccine work until day ${S().flags.cureDay}.`);
  return h;
}
const CHAPTERS = ['', 'Outbreak', 'Factions at War', 'The Source', 'The Last Signal'];
function chapter() { return S().done.lastSignal ? 4 : (S().done.lab || has('cable') || has('truth')) ? 3 : (S().done.war || day() >= 3) ? 2 : 1; }
export function openJournal() {
  const L = S().log.slice().reverse().map(e => `<div class="row"><span>Day ${e.day}</span><span style="text-align:right;max-width:75%">${e.text}</span></div>`).join('') || '<p>Nothing yet.</p>';
  const tm = G.missions?.tracked();
  showModal(`<div class="panel"><h2>Journal — Chapter ${chapter()}: ${CHAPTERS[chapter()]}</h2>${tm ? `<h3>Tracked mission</h3><p><b>${tm.title}</b> — ${G.missions.objectiveText(tm)}</p>` : ''}<h3>Goals</h3><ul>${hints().map(x => `<li>${x}</li>`).join('') || '<li>Survive.</li>'}</ul>
    <h3>Your decisions</h3>${L}<p style="opacity:.6;font-size:12px">Endings found: ${S().endings.join(', ') || 'none yet'}</p>
    <button class="primary" id="j-close">Close</button></div>`);
  document.getElementById('j-close').onclick = closeModal;
}

/* ---------- System ---------- */
let checkT = 0;
export const storySystem = {
  init() {
    G.story = { offerWork, log }; G.openJournal = openJournal;
    addTouchButton('LOG', 'journal', true);
    G.on('newDay', () => { if (S().flags.hordeUntil && day() >= S().flags.hordeUntil) { delete G.save.world.mods.density; delete S().flags.hordeUntil; } });
    G.on('leaderKilled', f => log(`Killed ${FACTIONS[f].leader}, leader of ${FACTIONS[f].name}.`));
    G.on('factionCreated', p => log(`Founded ${esc(p.name)}.`));
    G.on('baseClaimed', L => log(`Claimed ${L.name} as your base.`));
    G.on('alliance', f => log(`Allied with ${FACTIONS[f].name}.`));
    G.on('robbed', n => log(`Robbed a survivor named ${esc(n.name)}.`));
  },
  update(dt) {
    if (pressed('journal')) openJournal();
    // the doctor heals you when she is close
    const doc = members().find(n => n.data.special === 'doctor');
    if (doc && Math.hypot(doc.pos.x - G.player.pos.x, doc.pos.z - G.player.pos.z) < 6) { const s = G.save.stats; s.hp = Math.min(s.maxHp, s.hp + dt * 1.5); }
    checkT -= dt; if (checkT > 0) return; checkT = 0.5;
    const ch = chapter(); if (ch > (S().chapter || 1)) { S().chapter = ch; G.banner?.(CHAPTERS[ch], 'CHAPTER ' + ch, 4); }
    for (const E of EVENTS) if (!S().done[E.id] && E.when()) { S().done[E.id] = day(); E.run(); return; }
    for (const E of ENDINGS) if (!S().endings.includes(E.id) && E.when()) { showEnding(E); return; }
  }
};
