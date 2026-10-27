const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const head = index.slice(0, index.indexOf('</head>'));
const bootstrap = head.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const rotation = fs.readFileSync(path.join(root, 'assets/surgical-rotation.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const android = 'Mozilla/5.0 (Linux; Android 17) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36';

function fixture(t, ua = android, options = {}) {
  const dom = new JSDOM('<!doctype html><head>' + head.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') +
    '</head><body><section id="page-surgical-rotation" class="active"></section></body>', {
    url: options.url || 'https://clinic.example/stoma-care-clinic/index.html', runScripts: 'outside-only'
  });
  const w = dom.window;
  t.after(() => w.close());
  Object.defineProperty(w.navigator, 'userAgent', { value: ua });
  w.matchMedia = () => ({ matches: !!options.standalone });
  w.eval(bootstrap);
  if (options.earlyPrompt) w.dispatchEvent(options.earlyPrompt(w));
  w.eval(rotation);
  w.SurgicalRotation.open({ db: { from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null, error: null })
  }) }) }) }, readExcel: async () => { throw new Error('No workbook used by installation'); } });
  return w;
}

function offer(w, prompt) {
  const event = new w.Event('beforeinstallprompt', { cancelable: true });
  event.prompt = prompt;
  return event;
}

test('a prompt offered before the rotation module loads survives until the button click', async t => {
  let calls = 0;
  const w = fixture(t, android, { earlyPrompt: w => offer(w, () => {
    calls++;
    return Promise.resolve({ outcome: 'accepted' });
  }) });
  assert.equal(calls, 0);
  w.document.getElementById('sr-phone').click();
  assert.equal(calls, 1, 'prompt is called synchronously from the user click');
  await tick();
  assert.match(w.document.getElementById('sr-install-status').textContent, /Request accepted/);
  assert.equal(w.srInstallState.installed, false, 'acceptance alone is not installation completion');
  w.dispatchEvent(new w.Event('appinstalled'));
  assert.equal(w.document.getElementById('sr-phone').hidden, true);
});

test('Samsung without an install event gets its own menu steps and a correct shortcut on the same page', t => {
  const w = fixture(t, android + ' SamsungBrowser/30.0');
  const marker = { sessionView: 'rotation' };
  w.history.replaceState(marker, '');
  const historyCount = w.history.length;
  w.document.getElementById('sr-phone').click();
  assert.equal(w.document.getElementById('sr-install-dialog').open, true);
  assert.equal(w.document.getElementById('sr-install-browser').value, 'samsung');
  assert.match(w.document.getElementById('sr-install-steps').textContent, /Add page to → Home screen/);
  assert.equal(w.document.getElementById('sr-install-now').hidden, true);
  assert.equal(w.history.length, historyCount, 'no navigation or extra history entry');
  assert.equal(w.history.state.sessionView, 'rotation');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'surgical-rotation.webmanifest'), 'utf8'));
  assert.equal(w.location.href, new URL(manifest.start_url, w.location.href).href);
  assert.match(w.document.querySelector('#sr-install-dialog img').src, /surgical-rotation-192.png$/);
});

test('a late prompt enables Install now but waits for another user click', async t => {
  const w = fixture(t, android + ' SamsungBrowser/30.0');
  w.document.getElementById('sr-phone').click();
  let calls = 0;
  const event = offer(w, () => { calls++; return Promise.resolve({ outcome: 'accepted' }); });
  w.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(calls, 0, 'no prompt from a delayed event without user activation');
  assert.equal(w.document.getElementById('sr-install-now').hidden, false);
  w.document.getElementById('sr-install-now').click();
  assert.equal(calls, 1);
  await tick();
  assert.equal(w.document.getElementById('sr-install-dialog').open, false);
});

test('a rejected native prompt leaves a usable browser-specific alternative', async t => {
  const w = fixture(t, android + ' SamsungBrowser/30.0');
  w.dispatchEvent(offer(w, () => Promise.reject(new Error('NotAllowedError'))));
  w.document.getElementById('sr-phone').click();
  await tick();
  assert.equal(w.document.getElementById('sr-install-dialog').open, true);
  assert.equal(w.document.getElementById('sr-install-browser').value, 'samsung');
  assert.equal(w.document.getElementById('sr-phone').disabled, false);
  assert.equal(w.srInstallState.prompt, null, 'a consumed prompt is never reused');
});

test('dismissing installation never claims it succeeded or prompts again automatically', async t => {
  const w = fixture(t);
  let calls = 0;
  w.dispatchEvent(offer(w, () => { calls++; return Promise.resolve({ outcome: 'dismissed' }); }));
  w.document.getElementById('sr-phone').click();
  await tick();
  assert.match(w.document.getElementById('sr-install-status').textContent, /cancelled/);
  assert.equal(w.document.getElementById('sr-phone').hidden, false);
  w.document.getElementById('sr-phone').click();
  assert.equal(calls, 1);
  assert.equal(w.document.getElementById('sr-install-dialog').open, true);
});

for (const [name, ua, expected] of [
  ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Version/27.0 Mobile Safari/605.1.15', 'ios'],
  ['iPhone Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) CriOS/143.0 Mobile Safari/605.1', 'ios'],
  ['Android Chrome', android, 'android'],
  ['Android Edge', android + ' EdgA/143.0', 'android'],
  ['Android Firefox', 'Mozilla/5.0 (Android 17; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0', 'firefox'],
  ['an Android embedded webview', android.replace('Android 17)', 'Android 17; wv)'), 'embedded'],
  ['a computer', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0 Safari/537.36', 'computer']
]) {
  test(name + ' has an actionable fallback without a native install event', t => {
    const w = fixture(t, ua);
    w.document.getElementById('sr-phone').click();
    assert.equal(w.document.getElementById('sr-install-dialog').open, true);
    assert.equal(w.document.getElementById('sr-install-browser').value, expected);
    assert.equal(w.document.querySelectorAll('#sr-install-steps li').length, 3);
    assert.equal(w.document.getElementById('sr-phone').disabled, false);
  });
}

test('the detected browser can be corrected without reopening the panel', t => {
  const w = fixture(t);
  w.document.getElementById('sr-phone').click();
  const picker = w.document.getElementById('sr-install-browser');
  picker.value = 'samsung';picker.dispatchEvent(new w.Event('change'));
  assert.match(w.document.getElementById('sr-install-steps').textContent, /Add page to/);
  picker.value = 'ios';picker.dispatchEvent(new w.Event('change'));
  assert.match(w.document.getElementById('sr-install-steps').textContent, /Share/);
});

test('running Surgical Rotation as an installed app hides the add button', t => {
  const w = fixture(t, android, { standalone: true,
    url: 'https://clinic.example/stoma-care-clinic/index.html?view=surgical-rotation#surgical-rotation' });
  assert.equal(w.document.getElementById('sr-phone').hidden, true);
});

test('early registration is independent of the rest of the clinic app and never caches data', t => {
  const dom = new JSDOM('<head>' + head.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') + '</head>', {
    url: 'https://clinic.example/stoma-care-clinic/', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  let registered = false;
  Object.defineProperty(dom.window.navigator, 'serviceWorker', { value: {
    register: () => { registered = true; return Promise.resolve({}); }
  } });
  dom.window.eval(bootstrap);
  assert.equal(registered, true, 'worker registration starts in the head before clinic startup');
  const worker = fs.readFileSync(path.join(root, 'quicklook-sw.js'), 'utf8');
  assert.doesNotMatch(worker, /caches\.(?:open|match)\s*\(/, 'no stored responses or patient data');
});

test('Quick Look keeps its own install identity', t => {
  const w = fixture(t, android, { url: 'https://clinic.example/stoma-care-clinic/index.html#lookup' });
  // Opening Surgical Rotation legitimately switches identity. Re-run the head
  // alone to check the initial Quick Look route independently of that action.
  w.eval(bootstrap);
  const event = offer(w, () => Promise.resolve({ outcome: 'accepted' }));
  w.dispatchEvent(event);
  assert.equal(w.srInstallState.prompt, null);
  assert.equal(w.document.querySelector('link[rel="manifest"]').getAttribute('href'), 'quicklook.webmanifest');
});
