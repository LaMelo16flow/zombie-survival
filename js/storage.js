import { G, newSave, VERSION } from './state.js';
import { pressed, addTouchButton } from './input.js';
import { toast, showModal, closeModal, esc } from './ui.js';

/*
  SAVING
  • Autosave to this device every 30 s (localStorage).
  • Save / load to GitHub: each save is a JSON file in the repo at  saves/<slot>.json,
    written through the GitHub API with a personal access token.
    The token stays only on this device (localStorage) and is sent only to api.github.com.
*/

const LOCAL_KEY = 'deadground.save';
const CFG_KEY = 'deadground.github';

/* ---------- Save data helpers ---------- */
// Fill in anything an older save is missing, so old saves keep working after updates.
function merge(base, data) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return data === undefined ? base : data;
  const out = { ...base };
  for (const k of Object.keys(data || {})) out[k] = k in base ? merge(base[k], data[k]) : data[k];
  return out;
}
export const upgrade = data => { const s = merge(newSave(), data); s.version = VERSION; return s; };

export function saveLocal() {
  if (!G.save || G.dead) return;
  G.save.saved = new Date().toISOString();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(G.save));
}
export function loadLocal() { try { const s = localStorage.getItem(LOCAL_KEY); return s ? upgrade(JSON.parse(s)) : null; } catch { return null; } }
export function clearLocal() { localStorage.removeItem(LOCAL_KEY); }

// Loading needs a fresh world, so we park the save and reload the page.
export function bootWith(save) { sessionStorage.setItem('deadground.boot', JSON.stringify(save)); location.reload(); }
export function takeBootSave() { const s = sessionStorage.getItem('deadground.boot'); sessionStorage.removeItem('deadground.boot'); return s ? upgrade(JSON.parse(s)) : null; }

/* ---------- GitHub ---------- */
export function getCfg() {
  let c = {}; try { c = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch {}
  // When the game runs on GitHub Pages, guess the repo from the address.
  if (!c.owner && location.hostname.endsWith('.github.io')) {
    c.owner = location.hostname.split('.')[0];
    c.repo = location.pathname.split('/').filter(Boolean)[0] || `${c.owner}.github.io`;
  }
  return { branch: 'main', slot: 'slot1', ...c };
}
const setCfg = c => localStorage.setItem(CFG_KEY, JSON.stringify(c));
export const ghReady = () => { const c = getCfg(); return !!(c.owner && c.repo && c.token); };

async function gh(path, opts = {}) {
  const c = getCfg();
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path}`, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = { 401: 'GitHub refused the token (check it in Settings).', 403: 'The token is not allowed to write to this repo.', 409: 'Save conflict — try again.', 422: 'GitHub rejected the save.' }[res.status];
    throw new Error(msg || `GitHub error ${res.status}`);
  }
  return res.json();
}
const toB64 = str => { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
const cleanSlot = s => (s || 'slot1').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40) || 'slot1';

export async function saveGitHub(slot) {
  const c = getCfg(); slot = cleanSlot(slot || c.slot);
  const path = `saves/${slot}.json`;
  G.save.saved = new Date().toISOString();
  const existing = await gh(`${path}?ref=${encodeURIComponent(c.branch)}`);
  const f = G.save.factions.player;
  const message = `Save ${slot}: day ${G.save.world.day}` + (f ? ` — ${f.name} (${f.members.length} members)` : '');
  await gh(path, { method: 'PUT', body: JSON.stringify({ message, content: toB64(JSON.stringify(G.save, null, 1)), branch: c.branch, ...(existing ? { sha: existing.sha } : {}) }) });
  setCfg({ ...c, slot });
  return slot;
}

export async function listGitHubSaves() {
  const c = getCfg();
  const files = await gh(`saves?ref=${encodeURIComponent(c.branch)}`);
  return (files || []).filter(f => f.name.endsWith('.json')).map(f => f.name.replace(/\.json$/, ''));
}

export async function loadGitHub(slot) {
  const c = getCfg();
  const f = await gh(`saves/${cleanSlot(slot)}.json?ref=${encodeURIComponent(c.branch)}`);
  if (!f) throw new Error('Save not found.');
  const save = upgrade(JSON.parse(fromB64(f.content)));
  setCfg({ ...c, slot: cleanSlot(slot) });
  return save;
}

/* ---------- Screens ---------- */
export function openSettings(back) {
  const c = getCfg();
  showModal(`<div class="panel"><h2>GitHub storage</h2>
    <p style="font-size:13px">Saves go to <b>saves/&lt;slot&gt;.json</b> in your repo. You need a <b>fine-grained personal access token</b>
    (github.com → Settings → Developer settings → Fine-grained tokens) with access to <b>only this repo</b> and
    <b>Contents: Read and write</b>. The token is stored only on this device.</p>
    <label>Owner (your GitHub username)<input id="g-owner" value="${esc(c.owner || '')}" placeholder="LaMelo16flow"></label>
    <label>Repository<input id="g-repo" value="${esc(c.repo || '')}" placeholder="zombie-survival"></label>
    <label>Branch<input id="g-branch" value="${esc(c.branch || 'main')}"></label>
    <label>Token<input id="g-token" type="password" value="${esc(c.token || '')}" placeholder="github_pat_…" autocomplete="off"></label>
    <button class="primary" id="g-save">Save settings</button> <button id="g-forget">Forget token</button> <button id="g-back">Back</button>
    <p id="g-msg" style="font-size:13px"></p></div>`);
  const v = id => document.getElementById(id).value.trim();
  document.getElementById('g-save').onclick = async () => {
    setCfg({ ...getCfg(), owner: v('g-owner'), repo: v('g-repo'), branch: v('g-branch') || 'main', token: v('g-token') });
    const m = document.getElementById('g-msg'); m.textContent = 'Checking…';
    try { await listGitHubSaves(); m.textContent = '✅ Connected to GitHub.'; } catch (e) { m.textContent = '❌ ' + e.message; }
  };
  document.getElementById('g-forget').onclick = () => { const c2 = getCfg(); delete c2.token; setCfg(c2); openSettings(back); };
  document.getElementById('g-back').onclick = () => back ? back() : closeModal();
}

export async function openLoadList(back) {
  if (!ghReady()) return openSettings(back);
  showModal(`<div class="panel"><h2>Load from GitHub</h2><p id="l-msg">Loading saves…</p><div id="l-list" class="choices"></div><button id="l-back">Back</button></div>`);
  document.getElementById('l-back').onclick = () => back ? back() : closeModal();
  try {
    const list = await listGitHubSaves();
    document.getElementById('l-msg').textContent = list.length ? 'Pick a save:' : 'No saves in this repo yet.';
    const wrap = document.getElementById('l-list');
    for (const slot of list) {
      const b = document.createElement('button'); b.textContent = '📂 ' + slot;
      b.onclick = async () => { b.textContent = 'Loading…'; try { bootWith(await loadGitHub(slot)); } catch (e) { b.textContent = '❌ ' + e.message; } };
      wrap.appendChild(b);
    }
  } catch (e) { document.getElementById('l-msg').textContent = '❌ ' + e.message; }
}

function openSaveGitHub() {
  if (!ghReady()) return openSettings(openPause);
  const c = getCfg();
  showModal(`<div class="panel"><h2>Save to GitHub</h2>
    <label>Save slot name<input id="s-slot" value="${esc(c.slot || 'slot1')}"></label>
    <button class="primary" id="s-go">Save</button> <button id="s-back">Back</button><p id="s-msg"></p></div>`);
  document.getElementById('s-back').onclick = openPause;
  document.getElementById('s-go').onclick = async () => {
    const m = document.getElementById('s-msg'); m.textContent = 'Saving to GitHub…';
    try { const slot = await saveGitHub(document.getElementById('s-slot').value); saveLocal(); m.textContent = `✅ Saved as saves/${slot}.json`; } catch (e) { m.textContent = '❌ ' + e.message; }
  };
}

export function openPause() {
  const c = getCfg();
  showModal(`<div class="panel" style="text-align:center"><h2>Paused</h2>
    <p style="font-size:13px;opacity:.7">Day ${G.save.world.day} · GitHub: ${ghReady() ? `${esc(c.owner)}/${esc(c.repo)}` : 'not set up'}</p>
    <div class="choices">
      <button class="primary" id="p-resume">Resume</button>
      <button id="p-gh">☁️ Save to GitHub</button>
      <button id="p-load">📂 Load from GitHub</button>
      <button id="p-local">💾 Save on this device</button>
      <button id="p-set">⚙️ GitHub settings</button>
      <button id="p-quit">Quit to title</button>
    </div></div>`);
  const on = (id, fn) => document.getElementById(id).onclick = fn;
  on('p-resume', closeModal);
  on('p-gh', openSaveGitHub);
  on('p-load', () => openLoadList(openPause));
  on('p-local', () => { saveLocal(); toast('Saved on this device.'); closeModal(); });
  on('p-set', () => openSettings(openPause));
  on('p-quit', () => { saveLocal(); location.reload(); });
}

let autoT = 30;
export const storageSystem = {
  init() { addTouchButton('MENU', 'menu', true); },
  update(dt) {
    if (pressed('menu')) openPause();
    autoT -= dt; if (autoT <= 0) { autoT = 30; saveLocal(); }
  }
};
addEventListener('pagehide', saveLocal);
