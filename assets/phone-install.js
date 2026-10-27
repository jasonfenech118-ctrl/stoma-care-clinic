/* Each phone entry has one immutable manifest, scope, icon and install event. */
window.ClinicInstall=(()=>{
  const app=document.documentElement.dataset.phoneApp;
  const settings={
    'quick-look':{name:'Quick Look',icon:'../assets/ql-192.png'},
    'surgical-rotation':{name:'Surgical Rotation',icon:'../assets/surgical-rotation-192.png'}
  };
  const config=settings[app];
  if(!config)throw Error('Unknown phone app');
  let prompt=null,installed=false,installing=false;
  const $=id=>document.getElementById(id);
  function standalone(){try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(e){return navigator.standalone===true;}}
  function notify(){
    try{const child=$('phone-app')?.contentWindow;child?.dispatchEvent(new child.Event('clinic-install-state'));}catch(e){}
  }
  function message(text){const note=$('phone-install-status');if(note){note.textContent=text;note.hidden=!text;}}
  function browser(){
    const ua=navigator.userAgent;
    if(/; wv\)|\bwv\b|FBAN|FBAV|Instagram|\bLine\/|ChatGPT/i.test(ua))return 'embedded';
    if(/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'ios';
    if(/SamsungBrowser/i.test(ua))return 'samsung';
    if(/Android/i.test(ua)){
      if(/Firefox|Fennec/i.test(ua))return 'firefox';
      if(/EdgA/i.test(ua))return 'edge';
      if(/Chrome|Chromium/i.test(ua))return 'chrome';
      return 'other';
    }
    return /Mobile/i.test(ua)?'other':'computer';
  }
  const guides={
    samsung:{name:'Samsung Internet',steps:['Open the browser’s ☰ menu or the ＋ beside its address bar.','Choose Add page to → Home screen, or Add shortcut on Home screen.','Confirm Add or Install.']},
    chrome:{name:'Chrome',steps:['Open Chrome’s ⋮ menu.','Choose Add to Home screen or Install app.','Confirm Add or Install.']},
    edge:{name:'Microsoft Edge',steps:['Open Edge’s … menu.','Choose Add to phone, Add to Home screen or Install app.','Confirm Add or Install.']},
    ios:{name:'iPhone / iPad',steps:['Open the browser’s Share menu.','Choose Add to Home Screen. Use Safari if this option is unavailable.','Keep Open as Web App enabled if shown, then confirm Add.']},
    firefox:{name:'Firefox',steps:['Open Firefox’s ⋮ menu.','Choose Install or Add to Home screen.','Confirm Add or Install.']},
    embedded:{name:'In-app browser',steps:['Open this app’s … menu.','Choose Open in browser or Open in Safari, if available.','On the same page, tap Add to phone.']},
    other:{name:'Your browser',steps:['Open the browser’s menu or Share menu.','Choose Add to Home screen or Install app.','Confirm Add or Install.']},
    computer:{name:'Desktop browser',steps:['For an icon on this computer, open the browser’s menu.','Choose Install app if available, then confirm Install.','For an icon on your phone, open this page on the phone and tap Add to phone.']}
  };
  function close(){const dialog=$('phone-install-help');if(!dialog)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');}
  function updateHelp(){
    const dialog=$('phone-install-help');if(!dialog)return;
    const guide=guides[browser()];
    $('phone-install-browser').textContent=guide.name+' detected automatically';
    $('phone-install-steps').replaceChildren(...guide.steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('phone-install-now').hidden=!prompt;
    $('phone-install-explanation').textContent=prompt?'Ready. Tap Install now, then confirm on your phone.':'Your browser has not offered an installation prompt. Use its home-screen menu below.';
  }
  function help(reason=''){
    let dialog=$('phone-install-help');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='phone-install-help';
      dialog.setAttribute('aria-labelledby','phone-install-title');
      dialog.innerHTML='<div class="phone-install-heading"><img id="phone-install-icon" alt="" width="56" height="56"><h2 id="phone-install-title"></h2><button id="phone-install-close" type="button" aria-label="Close installation help">×</button></div><p id="phone-install-reason" role="status"></p><p id="phone-install-browser"></p><p id="phone-install-explanation"></p><button id="phone-install-now" type="button" hidden>Install now</button><ol id="phone-install-steps"></ol><p class="phone-install-note">Your phone requires confirmation. Each icon opens its own page.</p>';
      document.body.appendChild(dialog);
      $('phone-install-icon').src=config.icon;$('phone-install-title').textContent='Add '+config.name;
      $('phone-install-close').onclick=close;$('phone-install-now').onclick=install;
    }
    $('phone-install-reason').textContent=reason;$('phone-install-reason').hidden=!reason;
    updateHelp();
    if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
  }
  async function install(){
    if(installing)return;
    if(installed||standalone()){message(config.name+' is already running as an app.');return;}
    if(!prompt){help();return;}
    const event=prompt;prompt=null;installing=true;close();notify();
    try{
      // Must run synchronously in the button click, before the first await.
      const request=event.prompt();
      message('Confirm Add or Install for '+config.name+' on your phone.');
      const result=await request;
      const choice=result?.outcome?result:await event.userChoice;
      message(choice?.outcome==='accepted'?'Request accepted. Finish the phone confirmation for '+config.name+'.':'Installation cancelled. You can add '+config.name+' later.');
    }catch(e){help('The browser could not open its installation prompt.');}
    finally{installing=false;notify();}
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();prompt=event;updateHelp();notify();
    // Never invoke a late prompt from a timer or without a fresh user click.
  });
  window.addEventListener('appinstalled',()=>{
    installed=true;prompt=null;close();message(config.name+' installed. Look for its own icon on your phone.');notify();
  });
  if('serviceWorker' in navigator){try{navigator.serviceWorker.register('../quicklook-sw.js',{scope:'../',updateViaCache:'none'}).catch(()=>{});}catch(e){}}
  document.addEventListener('DOMContentLoaded',()=>{
    const frame=$('phone-app');if(frame)frame.addEventListener('load',()=>{const loading=$('phone-loading');if(loading)loading.hidden=true;notify();});
  });
  return {app,install,standalone,get installed(){return installed;},get installing(){return installing;}};
})();
