const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'quicklook.html'), 'utf8');
const start = html.indexOf('function storedQuickLookEmail()');
const end = html.indexOf('async function bootQuickLook()', start);
assert.ok(start >= 0 && end > start, 'Quick Look authentication source was found');
const authCode = html.slice(start, end);

function authWindow(url = 'https://clinic.example/quicklook.html') {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="loading"><span class="status"></span></div>
    <div id="auth" hidden></div>
    <input id="ql-email" type="email">
    <button id="ql-send"></button>
    <div id="ql-codebox" hidden></div>
    <input id="ql-code">
    <button id="ql-verify"></button>
    <div id="ql-message"></div>
  </body>`, { url, runScripts: 'outside-only' });
  dom.window.eval(authCode);
  return dom.window;
}

test('passwordless Quick Look never creates an unregistered user', async () => {
  const window = authWindow();
  const requests = [];
  window.SB = { auth: { signInWithOtp: async credentials => {
    requests.push(credentials);
    return { error: null };
  } } };
  window.document.getElementById('ql-email').value = 'Nurse@Hospital.mt';

  await window.sendQuickLookEmail();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].email, 'nurse@hospital.mt');
  assert.equal(requests[0].options.shouldCreateUser, false);
  assert.equal(requests[0].options.emailRedirectTo, 'https://clinic.example/quicklook.html?quicklook_auth=1');
  assert.equal(window.document.getElementById('ql-codebox').hidden, false);
  assert.match(window.document.getElementById('ql-message').textContent, /authorised/i);
});

test('a valid email code completes Quick Look authentication', async () => {
  const window = authWindow();
  const requests = [];
  let opened = 0;
  window.openQuickLook = () => { opened += 1; };
  window.SB = { auth: { verifyOtp: async credentials => {
    requests.push(credentials);
    return { error: null };
  } } };
  window.document.getElementById('ql-email').value = 'nurse@hospital.mt';
  window.document.getElementById('ql-code').value = '123456';

  await window.verifyQuickLookCode();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].email, 'nurse@hospital.mt');
  assert.equal(requests[0].token, '123456');
  assert.equal(requests[0].type, 'email');
  assert.equal(opened, 1);
});

test('the installed Quick Look app starts at the secure gateway', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'quicklook.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, 'quicklook.html?v=2');
});
