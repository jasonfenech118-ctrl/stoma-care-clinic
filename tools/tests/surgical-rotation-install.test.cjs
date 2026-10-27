const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bootstrap = index.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const rotation = fs.readFileSync(path.join(root, 'assets/surgical-rotation.js'), 'utf8');
const android = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/145.0 Mobile Safari/537.36';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture(t, ua = android, relatedApps, workerFails = false) {
  const dom = new JSDOM('<!doctype html><head><link rel="manifest" href="surgical-rotation.webmanifest"><link rel="apple-touch-icon"><meta name="apple-mobile-web-app-title"></head><body><section id="page-surgical-rotation" class="active"></section></body>', {
    url: 'https://clinic.example/stoma-care-clinic/', runScripts: 'outside-only'
  });
  const w = dom.window;
  t.after(() => w.close());
  Object.defineProperty(w.navigator, 'userAgent', { value: ua });
  Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => workerFails ? Promise.reject(Error('blocked')) : Promise.resolve({}) } });
  if (relatedApps) w.navigator.getInstalledRelatedApps = async () => relatedApps;
  w.matchMedia = () => ({ matches: false });
  w.setInterval = () => 0;
  const timers = new Map(); let timerID = 0;
  w.setTimeout = (fn, delay) => { timers.set(++timerID, { fn, delay }); return timerID; };
  w.clearTimeout = id => timers.delete(id);
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.eval(bootstrap);
  function open() {
    w.eval(rotation);
    w.SurgicalRotation.open({ db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } });
  }
  function offer(outcome = 'accepted', failure = false) {
    const event = new w.Event('beforeinstallprompt', { cancelable: true });
    let calls = 0;
    event.prompt = () => { calls++; return failure ? Promise.reject(Error('no user activation')) : Promise.resolve(); };
    event.userChoice = Promise.resolve({ outcome });
    w.dispatchEvent(event);
    return { event, calls: () => calls };
  }
  return { w, open, offer, timers, $: id => w.document.getElementById(id) };
}

test('an early native offer is retained and invoked synchronously from a phone tap', async t => {
  const f = fixture(t); const offer = f.offer(); f.open();
  f.$('sr-phone').click();
  assert.equal(offer.calls(), 1);
  assert.equal(offer.event.defaultPrevented, true);
  assert.equal(f.w.location.href, 'https://clinic.example/stoma-care-clinic/');
  await flush();
  assert.match(f.$('sr-install-status').textContent, /accepted/i);
  assert.equal(f.w.srInstallState.installed, false, 'acceptance alone does not claim installation completed');
  f.w.dispatchEvent(new f.w.Event('appinstalled'));
  assert.equal(f.$('sr-phone').hidden, true);
});

test('a late offer enables Install inside the open panel and waits for a fresh tap', async t => {
  const f = fixture(t); f.open(); f.$('sr-phone').click();
  assert.equal(f.$('sr-install-dialog').open, true);
  assert.equal(f.$('sr-install-confirm').hidden, true);
  const offer = f.offer();
  assert.equal(f.$('sr-install-confirm').hidden, false);
  assert.equal(offer.calls(), 0, 'readiness must not consume the required user gesture');
  assert.equal(f.timers.size, 0);
  f.$('sr-install-confirm').click();
  assert.equal(offer.calls(), 1);
  await flush();
  assert.equal(f.w.srInstallState.prompt, null, 'a prompt can only be used once');
});

test('a computer cannot silently install the app onto a phone', t => {
  const f = fixture(t, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/145.0');
  const offer = f.offer(); f.open(); f.$('sr-phone').click();
  assert.equal(offer.calls(), 0);
  assert.equal(f.$('sr-install-confirm').hidden, true);
  assert.match(f.$('sr-install-dialog-status').textContent, /use your phone/i);
  f.offer();
  assert.match(f.$('sr-install-dialog-status').textContent, /use your phone/i);
});

test('Safari receives its required Share and Add steps', t => {
  const f = fixture(t, 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Version/19.0 Mobile Safari/604.1');
  f.open(); f.$('sr-phone').click();
  assert.match(f.$('sr-install-steps').textContent, /Share.*Add to Home Screen.*confirm Add/s);
  assert.equal(f.timers.size, 0);
});

test('Samsung Internet receives Samsung installation controls', t => {
  const f = fixture(t, android + ' SamsungBrowser/30.0'); f.open(); f.$('sr-phone').click();
  assert.match(f.$('sr-install-steps').textContent, /Samsung Internet.*Home screen/s);
  assert.equal(f.timers.size, 0);
});

test('an embedded Android browser explains that the phone browser must handle installation', t => {
  const f = fixture(t, 'Mozilla/5.0 (Linux; Android 16; Phone Build/ABC; wv) Version/4.0 Chrome/145.0');
  f.open(); f.$('sr-phone').click();
  assert.match(f.$('sr-install-dialog-status').textContent, /in-app browser cannot install/i);
  assert.match(f.$('sr-install-steps').textContent, /open the current page in Chrome/i);
});

test('a failed native prompt leaves usable steps and unlocks the button', async t => {
  const f = fixture(t); const offer = f.offer('dismissed', true); f.open(); f.$('sr-phone').click();
  await flush();
  assert.equal(offer.calls(), 1);
  assert.equal(f.$('sr-install-dialog').open, true);
  assert.match(f.$('sr-install-dialog-status').textContent, /could not open.*steps/i);
  assert.equal(f.$('sr-phone').disabled, false);
});

test('only a confirmed matching installed app hides the install button', async t => {
  const f = fixture(t, android, [{ platform: 'webapp', url: 'https://clinic.example/stoma-care-clinic/surgical-rotation.webmanifest' }]);
  f.open(); await flush();
  assert.equal(f.$('sr-phone').hidden, true);
  const other = fixture(t, android, [{ platform: 'webapp', url: 'https://clinic.example/stoma-care-clinic/quicklook.webmanifest' }]);
  other.open(); await flush();
  assert.equal(other.$('sr-phone').hidden, false);
});

test('no offer provides menu instructions without claiming that the app is installed', t => {
  const f = fixture(t); f.open(); f.$('sr-phone').click();
  const timer = [...f.timers.values()].find(value => value.delay === 35000);
  assert.ok(timer); timer.fn();
  assert.match(f.$('sr-install-dialog-status').textContent, /Chrome has not offered.*menu/s);
  assert.equal(f.w.srInstallState.installed, false);
  f.$('sr-install-close').click();
  assert.equal(f.$('sr-install-dialog').open, false);
});

test('worker registration failure is visible rather than swallowed', async t => {
  const f = fixture(t, android, null, true); f.open(); await flush(); f.$('sr-phone').click();
  assert.match(f.$('sr-install-dialog-status').textContent, /could not prepare installation/i);
  assert.equal(f.timers.size, 0);
});
