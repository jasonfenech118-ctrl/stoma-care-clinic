const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const install=read('assets/phone-install.js');
const route=read('assets/phone-route.js');
const rotation=read('assets/surgical-rotation.js');
const index=read('index.html');
const ql=index.slice(index.indexOf('function qlIsStandalone()'),index.indexOf('// Back button (or any hash change away from Quick Look)'));
const android='Mozilla/5.0 (Linux; Android 17) AppleWebKit/537.36 Chrome/143.0 Mobile Safari/537.36';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,app='surgical-rotation',ua=android,options={}){
  const dom=new JSDOM(read(app+'/index.html'),{url:'https://clinic.example/stoma-care-clinic/'+app+'/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  Object.defineProperty(w.navigator,'userAgent',{value:ua});
  w.matchMedia=()=>({matches:!!options.standalone});
  w.eval(install);
  return w;
}
function child(w,app){
  const frame=w.document.getElementById('phone-app');
  frame.src='../index.html?phoneFrame='+app+(app==='surgical-rotation'?'&view=surgical-rotation#surgical-rotation':'#lookup');
  const c=frame.contentWindow;
  c.document.open();c.document.write('<!doctype html><body><section id="page-surgical-rotation" class="active"></section><button id="ql-install-btn"></button></body>');c.document.close();
  Object.defineProperty(c.document,'currentScript',{value:{src:'https://clinic.example/stoma-care-clinic/assets/phone-route.js'}});
  c.matchMedia=()=>({matches:false});
  c.eval(route);
  if(app==='surgical-rotation'){
    c.eval(rotation);
    c.SurgicalRotation.open({db:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})}});
  }else{c.eval(ql);c.document.getElementById('ql-install-btn').onclick=c.qlInstall;}
  return c;
}
function offer(w,prompt){const event=new w.Event('beforeinstallprompt',{cancelable:true});event.prompt=prompt;w.dispatchEvent(event);return event;}
test('two fixed entries have stable separate IDs, icons, starts and non-overlapping scopes',()=>{
  const base='https://clinic.example/stoma-care-clinic/';
  const quick=JSON.parse(read('quicklook.webmanifest')),surgical=JSON.parse(read('surgical-rotation.webmanifest'));
  assert.equal(quick.id,'mdh-quicklook');assert.equal(surgical.id,'mdh-surgical-rotation');
  assert.notEqual(quick.icons[0].src,surgical.icons[0].src);
  for(const [manifest,app] of [[quick,'quick-look'],[surgical,'surgical-rotation']]){
    assert.equal(manifest.start_url,app+'/');assert.equal(manifest.scope,app+'/');
    assert(new URL(manifest.start_url,base).pathname.startsWith(new URL(manifest.scope,base).pathname));
    assert.match(read(app+'/index.html'),new RegExp('data-phone-app="'+app+'"'));
  }
  assert(!quick.scope.startsWith(surgical.scope));assert(!surgical.scope.startsWith(quick.scope));
  assert.doesNotMatch(index.slice(0,index.indexOf('</head>')),/rel="manifest"/);
});
test('an early Surgical Rotation prompt survives startup and fires directly from its button',async t=>{
  const w=fixture(t);let calls=0;
  offer(w,()=>{calls++;return Promise.resolve({outcome:'accepted'});});
  const c=child(w,'surgical-rotation');
  c.document.getElementById('sr-phone').click();assert.equal(calls,1,'no timer or awaited preparation before prompt');
  await tick();assert.equal(w.ClinicInstall.installed,false,'acceptance is not completion');
  w.dispatchEvent(new w.Event('appinstalled'));assert.equal(c.document.getElementById('sr-phone').hidden,true);
});
test('Quick Look and Surgical Rotation never consume each other’s prompt or installed state',async t=>{
  const quick=fixture(t,'quick-look'),surgical=fixture(t);let q=0,s=0;
  offer(quick,()=>{q++;return Promise.resolve({outcome:'accepted'});});
  offer(surgical,()=>{s++;return Promise.resolve({outcome:'accepted'});});
  const qc=child(quick,'quick-look'),sc=child(surgical,'surgical-rotation');
  qc.document.getElementById('ql-install-btn').click();assert.equal(q,1);assert.equal(s,0);
  await tick();quick.dispatchEvent(new quick.Event('appinstalled'));
  assert.equal(qc.document.getElementById('ql-install-btn').hidden,true);
  assert.equal(sc.document.getElementById('sr-phone').hidden,false);assert.equal(surgical.ClinicInstall.installed,false);
  sc.document.getElementById('sr-phone').click();assert.equal(s,1);assert.equal(q,1);await tick();
});
for(const [name,ua,detected,step] of [
  ['Samsung Internet',android+' SamsungBrowser/30.0','Samsung Internet',/Add page to/],
  ['Chrome',android,'Chrome',/Chrome/],
  ['Edge',android+' EdgA/143.0','Microsoft Edge',/Edge/],
  ['Firefox','Mozilla/5.0 (Android 17; Mobile; rv:143.0) Firefox/143.0','Firefox',/Firefox/],
  ['iPhone Safari','Mozilla/5.0 (iPhone; CPU iPhone OS 27_0) Version/27.0 Mobile Safari/605.1','iPhone / iPad',/Share/],
  ['iPhone Chrome','Mozilla/5.0 (iPhone; CPU iPhone OS 27_0) CriOS/143.0 Mobile Safari/605.1','iPhone / iPad',/Share/],
  ['embedded browser',android.replace('Android 17)','Android 17; wv)'),'In-app browser',/Open in browser/],
  ['computer','Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0','Desktop browser',/computer/]
])test(name+' is detected automatically without a browser picker',t=>{
  const w=fixture(t,'surgical-rotation',ua),url=w.location.href;w.ClinicInstall.install();
  assert.equal(w.document.querySelectorAll('#phone-install-help select').length,0);
  assert.equal(w.document.getElementById('phone-install-browser').textContent,detected+' detected automatically');
  assert.match(w.document.getElementById('phone-install-steps').textContent,step);
  assert.equal(w.document.querySelectorAll('#phone-install-steps li').length,3);
  assert.equal(w.location.href,url,'Add never changes the shortcut address');
});
test('a native event takes priority over browser instructions without a browser choice',async t=>{
  const w=fixture(t,'surgical-rotation',android+' SamsungBrowser/30.0');let calls=0;
  offer(w,()=>{calls++;return Promise.resolve({outcome:'accepted'});});
  w.ClinicInstall.install();assert.equal(calls,1);assert.equal(w.document.getElementById('phone-install-help'),null);await tick();
});
test('a late offer waits for a fresh click and is never fired by a timer',async t=>{
  const w=fixture(t);w.ClinicInstall.install();let calls=0;
  offer(w,()=>{calls++;return Promise.resolve({outcome:'accepted'});});
  assert.equal(calls,0);assert.equal(w.document.getElementById('phone-install-now').hidden,false);
  w.document.getElementById('phone-install-now').click();assert.equal(calls,1);await tick();
});
test('dismissed or rejected requests leave a usable automatically detected fallback',async t=>{
  for(const rejected of [false,true]){
    const w=fixture(t,'surgical-rotation',android+' SamsungBrowser/30.0');let calls=0;
    offer(w,()=>{calls++;return rejected?Promise.reject(Error('NotAllowedError')):Promise.resolve({outcome:'dismissed'});});
    await w.ClinicInstall.install();assert.equal(w.ClinicInstall.installed,false);assert.equal(w.ClinicInstall.installing,false);
    await w.ClinicInstall.install();assert.equal(calls,1);
    assert.match(w.document.getElementById('phone-install-steps').textContent,/Add page to/);
  }
});
test('running either installed phone app hides only its own add button',async t=>{
  for(const app of ['quick-look','surgical-rotation']){
    const w=fixture(t,app,android,{standalone:true}),c=child(w,app);
    if(app==='quick-look')c.qlUpdateInstallButton();
    assert.equal(c.document.getElementById(app==='quick-look'?'ql-install-btn':'sr-phone').hidden,true);
  }
  await tick();
});
test('legacy shortcuts route correctly, including a stale surgical query on Quick Look',()=>{
  for(const [suffix,expected] of [['#lookup','quick-look/'],['#phone','quick-look/'],['?view=surgical-rotation#lookup','quick-look/'],['?view=surgical-rotation#surgical-rotation','surgical-rotation/'],['#surgical-rotation','surgical-rotation/']]){
    const url=new URL('https://clinic.example/stoma-care-clinic/index.html'+suffix);let target;
    const location={origin:url.origin,search:url.search,hash:url.hash,replace:value=>{target=value;},assign:value=>{target=value;}};
    const w={location};w.parent=w;
    vm.runInNewContext(route,{window:w,location,document:{currentScript:{src:'https://clinic.example/stoma-care-clinic/assets/phone-route.js'}},URL,URLSearchParams});
    assert.equal(target,'https://clinic.example/stoma-care-clinic/'+expected);
  }
});
test('the service worker never stores responses or patient data',()=>{
  assert.doesNotMatch(read('quicklook-sw.js'),/caches\.(?:open|match)\s*\(/);
  assert.doesNotMatch(rotation,/preparePhoneInstall|manifest\.href|sr-install-browser/);
});
