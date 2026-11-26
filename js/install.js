import { G } from './state.js';
import { showModal, closeModal } from './ui.js';

/*
  INSTALL AS AN APP
  • Registers the service worker (offline play) when the game runs on GitHub Pages or localhost.
  • Chrome / Android / desktop: the "Install the app" button opens the browser's own install prompt.
  • iPhone / iPad (Safari has no install prompt): the button shows the 3 taps to add it to the Home Screen.
  • When a new version is downloaded, a small notice offers to restart into it.
*/
const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferred = null;

function iosSteps() {
  showModal(`<div class="panel"><h2>Put Dead Ground on your Home Screen</h2>
    <p>It opens full screen like a real app and keeps working without internet after the first load.</p>
    <ol class="steps">
      <li>Open this page in <b>Safari</b> (not inside another app).</li>
      <li>Tap the <b>Share</b> button — the square with an arrow pointing up.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
    </ol>
    <p style="color:var(--dim);font-size:13px">Your saves stay on this iPhone and, if you set it up, in your GitHub repo.</p>
    <button class="primary" id="ios-ok">Got it</button></div>`, 'dialog');
  document.getElementById('ios-ok').onclick = closeModal;
}

export function initInstall() {
  const btn = document.getElementById('btn-install');
  const show = () => { if (!standalone()) btn.classList.remove('hidden'); };
  if (isIOS()) show();
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; show(); });
  addEventListener('appinstalled', () => btn.classList.add('hidden'));
  btn.onclick = async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btn.classList.add('hidden'); }
    else if (isIOS()) iosSteps();
  };
  if (standalone()) document.documentElement.classList.add('app');

  const allowed = location.hostname.endsWith('github.io') || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !allowed) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) updateNotice(nw);
      });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && G.wantsUpdate) { reloaded = true; location.reload(); } });
}

function updateNotice(worker) {
  const el = document.createElement('div'); el.id = 'update';
  el.innerHTML = '<span>A new version of Dead Ground is ready.</span><button class="small primary">Restart</button><button class="small">Later</button>';
  document.body.appendChild(el);
  const [go, later] = el.querySelectorAll('button');
  go.onclick = () => { G.wantsUpdate = true; G.saveNow?.(); worker.postMessage('update'); };
  later.onclick = () => el.remove();
}
