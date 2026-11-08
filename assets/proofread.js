/* Proofread — an OFFLINE spelling / grammar / wording helper for the clinical
   review ("Seen" appointment) free-text editor.

   It runs entirely in the browser: NO patient text is ever sent to any external
   service (on purpose — clinical notes stay in this app). It suggests fixes and
   rephrasings but never changes meaning, and it never edits the note on its own —
   the nurse applies each suggestion (or "Apply all" for the safe mechanical ones).

   window.Proofread.check(text)  -> [{start,end,original,suggestion,message,type}]
   window.Proofread.open(editor) -> opens the review panel over the given editor. */
(function(){
  'use strict';

  // ---- Common + clinical misspellings (lower-case key -> correction) ----------
  const MISSPELL={
    recieve:'receive',recieved:'received',seperate:'separate',seperated:'separated',
    definately:'definitely',occured:'occurred',occuring:'occurring',occurence:'occurrence',
    neccessary:'necessary',necessay:'necessary',accomodate:'accommodate',accomodated:'accommodated',
    untill:'until',wich:'which',teh:'the',adn:'and',thier:'their',becuase:'because',
    becasue:'because',alot:'a lot',alpha:'alpha',noticable:'noticeable',
    tolerate:'tolerate',tolarated:'tolerated',reccomend:'recommend',reccommend:'recommend',
    recomend:'recommend',recomended:'recommended',enviroment:'environment',
    goverment:'government',publically:'publicly',refered:'referred',refering:'referring',
    begining:'beginning',beleive:'believe',acheived:'achieved',truely:'truly',
    arguement:'argument',calender:'calendar',concious:'conscious',embarass:'embarrass',
    foriegn:'foreign',gaurd:'guard',harrass:'harass',independant:'independent',
    occassion:'occasion',persistant:'persistent',priviledge:'privilege',
    recepit:'receipt',rythm:'rhythm',succesful:'successful',sucessful:'successful',
    tommorow:'tomorrow',wierd:'weird',writting:'writing',youre:"you're",
    // clinical / stoma-specific
    abdomin:'abdomen',abdominel:'abdominal',abdomenal:'abdominal',
    colostmy:'colostomy',colosotomy:'colostomy',colostmoy:'colostomy',
    ileostmy:'ileostomy',illeostomy:'ileostomy',ileostomoy:'ileostomy',
    urostmy:'urostomy',urostomoy:'urostomy',
    peristomial:'peristomal',peristonal:'peristomal',peristomel:'peristomal',
    paristomal:'parastomal',parastomial:'parastomal',
    dehiscense:'dehiscence',dehisence:'dehiscence',
    erythma:'erythema',erythyma:'erythema',
    granruloma:'granuloma',granuoma:'granuloma',
    excoriaton:'excoriation',excoriaion:'excoriation',excoriatation:'excoriation',
    prolaps:'prolapse',prolpase:'prolapse',
    mucocutanous:'mucocutaneous',mucocutaneus:'mucocutaneous',
    flang:'flange',flanage:'flange',
    effluant:'effluent',
    applaince:'appliance',applience:'appliance',appliace:'appliance',
    accesory:'accessory',accesories:'accessories',accessary:'accessory',
    nures:'nurse',nurseing:'nursing',
    pateint:'patient',patinet:'patient',patien:'patient',
    reveiw:'review',reivew:'review',
    assesment:'assessment',assessement:'assessment',asessment:'assessment',
    hopital:'hospital',hospitel:'hospital',
    dischage:'discharge',discharing:'discharging',dicharge:'discharge',
    henia:'hernia',herina:'hernia',
    bleedin:'bleeding',bleding:'bleeding',
    leakege:'leakage',leackage:'leakage',leakadge:'leakage',
    healthly:'healthy',heathy:'healthy',
    suronding:'surrounding',surounding:'surrounding',sorrounding:'surrounding',
    swellign:'swelling',sweling:'swelling',
    convexed:'convex',
    retracton:'retraction',retracion:'retraction',
    stenosys:'stenosis',stensosis:'stenosis',
    mantained:'maintained',maintaned:'maintained',
    sutured:'sutured',sutre:'suture',
    abcess:'abscess',absess:'abscess',
    diarrhoea:'diarrhoea',diarhoea:'diarrhoea',diarrohea:'diarrhoea',
    constipaton:'constipation',
    comfortabe:'comfortable',comfertable:'comfortable'
  };

  // ---- Wordy phrases -> concise, meaning-preserving replacements --------------
  const PHRASES=[
    [/\bin order to\b/gi,'to','Simpler wording'],
    [/\bdue to the fact that\b/gi,'because','Simpler wording'],
    [/\bin the event that\b/gi,'if','Simpler wording'],
    [/\bat this (?:point|moment) in time\b/gi,'now','Simpler wording'],
    [/\bin spite of the fact that\b/gi,'although','Simpler wording'],
    [/\bwith regards? to\b/gi,'regarding','Simpler wording'],
    [/\bin close proximity to\b/gi,'near','Simpler wording'],
    [/\ba large number of\b/gi,'many','Simpler wording'],
    [/\bprior to\b/gi,'before','Simpler wording'],
    [/\bsubsequent to\b/gi,'after','Simpler wording'],
    [/\bis able to\b/gi,'can','Simpler wording'],
    [/\bwas able to\b/gi,'could','Simpler wording'],
    [/\bin the near future\b/gi,'soon','Simpler wording'],
    [/\bon a daily basis\b/gi,'daily','Simpler wording'],
    [/\buntil such time as\b/gi,'until','Simpler wording'],
    [/\bfor the purpose of\b/gi,'for','Simpler wording'],
    [/\bhas the ability to\b/gi,'can','Simpler wording'],
    [/\butilis(e|ed|ing|es)\b/gi,function(m,g){return {e:'use',ed:'used',ing:'using',es:'uses'}[g]||'use';},'Plain word'],
    [/\butiliz(e|ed|ing|es)\b/gi,function(m,g){return {e:'use',ed:'used',ing:'using',es:'uses'}[g]||'use';},'Plain word']
  ];

  const H_EXC=/^(hour|honest|honor|honour|heir)/i;      // silent-h -> vowel sound
  function vowelSound(word){
    const w=String(word||'').toLowerCase();
    if(!w)return false;
    if(/^(eu|ewe|one|uni|use|ubi|ur[aeiou])/.test(w))return false; // "a european", "a one", "a unit", "a urostomy"
    if(w[0]==='u')return false;                           // most u- words sound like "yoo"
    if(w[0]==='h')return H_EXC.test(w);
    return 'aeio'.indexOf(w[0])>=0;                       // a,e,i,o (not u, handled above)
  }
  function keepCase(src,repl){return /^[A-Z]/.test(src)?repl.charAt(0).toUpperCase()+repl.slice(1):repl;}

  function check(text){
    text=String(text||'');
    const issues=[];let m;
    // 1) spelling
    const wordRe=/[A-Za-z]+(?:'[A-Za-z]+)?/g;
    while((m=wordRe.exec(text))){
      const w=m[0],key=w.toLowerCase();
      if(Object.prototype.hasOwnProperty.call(MISSPELL,key)){
        const sug=keepCase(w,MISSPELL[key]);
        if(sug!==w)issues.push({start:m.index,end:m.index+w.length,original:w,suggestion:sug,message:'Spelling: “'+w+'” → “'+sug+'”',type:'spelling'});
      }
    }
    // 2) repeated word ("the the")
    const repRe=/\b([A-Za-z]{2,})(\s+)(\1)\b/gi;
    while((m=repRe.exec(text))){
      issues.push({start:m.index,end:m.index+m[0].length,original:m[0],suggestion:m[1],message:'Repeated word “'+m[1]+'”',type:'grammar'});
    }
    // 3) extra spaces (not across line breaks)
    const dsp=/[ \t]{2,}/g;
    while((m=dsp.exec(text))){issues.push({start:m.index,end:m.index+m[0].length,original:m[0],suggestion:' ',message:'Extra spaces',type:'mechanics'});}
    // 4) space before , ; : .
    const spb=/[ \t]+([,;:.])/g;
    while((m=spb.exec(text))){issues.push({start:m.index,end:m.index+m[0].length,original:m[0],suggestion:m[1],message:'Space before “'+m[1]+'”',type:'mechanics'});}
    // 5) missing space after , or ; (not inside numbers like 1,000)
    const msp=/([,;])(?=[A-Za-z])/g;
    while((m=msp.exec(text))){issues.push({start:m.index,end:m.index+1,original:m[1],suggestion:m[1]+' ',message:'Missing space after “'+m[1]+'”',type:'mechanics'});}
    // 6) missing space after a sentence period ("seen.The")
    const mspP=/([a-z]{2,})\.([A-Z])/g;
    while((m=mspP.exec(text))){const s=m.index+m[1].length;issues.push({start:s,end:s+2,original:'.'+m[2],suggestion:'. '+m[2],message:'Missing space after “.”',type:'mechanics'});}
    // 6b) missing space after a period before a lower-case word ("protect.the") —
    //     skip anything that looks like an email, URL or dotted name (a.b.c).
    const mspLow=/([a-z]{2,})\.([a-z])([a-z]+)/g;
    while((m=mspLow.exec(text))){
      const after=m.index+m[0].length;
      if(/[@/:]/.test(text.slice(Math.max(0,m.index-1),after+2)))continue;
      if(text[after]==='.')continue;
      const s=m.index+m[1].length;
      issues.push({start:s,end:s+2,original:'.'+m[2],suggestion:'. '+m[2].toUpperCase(),message:'Missing space after “.”',type:'mechanics'});
    }
    // 7) lower-case word starting a new sentence ("seen. the patient")
    const capRe=/\b([a-z]{3,})\.(\s+)([a-z])([a-z]{2,})/g;
    while((m=capRe.exec(text))){
      const s=m.index+m[1].length+1+m[2].length;
      issues.push({start:s,end:s+1,original:m[3],suggestion:m[3].toUpperCase(),message:'Start the sentence with a capital',type:'grammar'});
    }
    // 8) first letter of the text
    const fm=/^(\s*)([a-z])/.exec(text);
    if(fm){const s=fm[1].length;issues.push({start:s,end:s+1,original:fm[2],suggestion:fm[2].toUpperCase(),message:'Start with a capital letter',type:'grammar'});}
    // 9) a / an (skip acronyms in ALL-CAPS)
    const art=/\b(an?)\s+([A-Za-z]+)/gi;
    while((m=art.exec(text))){
      const a=m[1],w=m[2];
      if(/^[A-Z]{2,}$/.test(w))continue;                 // "a MRI" etc — leave acronyms
      const isAn=a.toLowerCase()==='an',vs=vowelSound(w);
      if(isAn&&!vs){const sug=keepCase(a,'a');issues.push({start:m.index,end:m.index+a.length,original:a,suggestion:sug,message:'“'+a+' '+w+'” → “'+sug+' '+w+'”',type:'grammar'});}
      else if(!isAn&&vs){const sug=keepCase(a,'an');issues.push({start:m.index,end:m.index+a.length,original:a,suggestion:sug,message:'“'+a+' '+w+'” → “'+sug+' '+w+'”',type:'grammar'});}
    }
    // 10) wordy phrases
    PHRASES.forEach(function(rule){
      const re=new RegExp(rule[0].source,rule[0].flags);
      while((m=re.exec(text))){
        const orig=m[0];let sug=typeof rule[1]==='function'?rule[1].apply(null,m):rule[1];
        sug=keepCase(orig,String(sug));
        if(sug.toLowerCase()!==orig.toLowerCase())issues.push({start:m.index,end:m.index+orig.length,original:orig,suggestion:sug,message:rule[2]+': “'+orig+'” → “'+sug+'”',type:'style'});
        if(re.lastIndex===m.index)re.lastIndex++;
      }
    });
    // de-duplicate exact overlaps, keep earliest, sort by position
    issues.sort(function(a,b){return a.start-b.start||a.end-b.end;});
    const out=[];const seen=new Set();
    issues.forEach(function(i){const k=i.start+'|'+i.end+'|'+i.type;if(!seen.has(k)){seen.add(k);out.push(i);}});
    return out;
  }

  // ---- Map plain-text offsets to DOM positions in the editor ------------------
  function buildModel(root){
    let text='';const map=[];       // map[i] = {node,off} for char i, or {node:null}
    (function walk(node){
      node.childNodes.forEach(function(ch){
        if(ch.nodeType===3){
          const v=ch.nodeValue;
          for(let i=0;i<v.length;i++)map.push({node:ch,off:i});
          text+=v;
        }else if(ch.nodeType===1){
          const tag=ch.tagName.toLowerCase();
          if(tag==='br'){text+='\n';map.push({node:null});}
          else{
            if(/^(div|p|li)$/.test(tag)&&text&&!text.endsWith('\n')){text+='\n';map.push({node:null});}
            walk(ch);
          }
        }
      });
    })(root);
    return {text:text,map:map};
  }
  function applyFix(root,start,end,repl){
    const model=buildModel(root);
    if(start<0||end>model.map.length||end<=start)return false;
    for(let i=start;i<end;i++){if(!model.map[i]||!model.map[i].node)return false;}
    const s=model.map[start],e=model.map[end-1];
    try{
      const r=document.createRange();
      r.setStart(s.node,s.off);
      r.setEnd(e.node,e.off+1);
      r.deleteContents();
      if(repl)r.insertNode(document.createTextNode(repl));
      root.normalize();
      root.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }catch(_){return false;}
  }

  // ---- The review panel (an overlay; the visit modal stays open beneath) ------
  const TYPE_LABEL={spelling:'Spelling',grammar:'Grammar',mechanics:'Spacing',style:'Wording'};
  const TYPE_COLOUR={spelling:'#b91c1c',grammar:'#9a3412',mechanics:'#1d4ed8',style:'#7c3aed'};
  const SAFE=new Set(['spelling','grammar','mechanics']);  // "Apply all" leaves wording to the nurse
  let panel=null;
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

  function ensurePanel(){
    if(panel)return panel;
    panel=document.createElement('div');
    panel.className='pf-panel';
    panel.style.cssText='position:fixed;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 32px);max-height:70vh;z-index:2147483000;'
      +'background:#fff;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.28);display:none;flex-direction:column;'
      +'font-family:inherit;color:#0f172a;overflow:hidden;';
    panel._ignored=new Set();
    document.body.appendChild(panel);
    return panel;
  }
  function sig(i){return i.type+'|'+i.original+'|'+i.suggestion;}

  function render(){
    const editor=panel._editor;if(!editor)return;
    const model=buildModel(editor);
    const all=check(model.text);
    const issues=all.filter(function(i){return !panel._ignored.has(sig(i));});
    panel._issues=issues;
    const safeCount=issues.filter(function(i){return SAFE.has(i.type);}).length;
    let rows='';
    if(!issues.length){
      rows='<div style="padding:22px 16px;text-align:center;color:#15803d;font-weight:700;">✓ No issues found — the text reads well.</div>';
    }else{
      issues.forEach(function(i,idx){
        const before=esc(model.text.slice(Math.max(0,i.start-24),i.start));
        const after=esc(model.text.slice(i.end,i.end+24));
        const orig=esc(i.original).replace(/ /g,'·');
        const sug=esc(i.suggestion).replace(/ /g,'·');
        rows+='<div class="pf-row" style="padding:10px 12px;border-top:1px solid #eef2f7;">'
          +'<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:'+(TYPE_COLOUR[i.type]||'#334155')+';margin-bottom:3px;">'+esc(TYPE_LABEL[i.type]||i.type)+'</div>'
          +'<div style="font-size:12px;line-height:1.5;color:#334155;margin-bottom:5px;">'
            +'<span style="color:#94a3b8;">…'+before+'</span>'
            +'<span style="text-decoration:line-through;color:#b91c1c;background:#fee2e2;border-radius:3px;padding:0 2px;">'+orig+'</span>'
            +' <span style="color:#64748b;">→</span> '
            +'<span style="color:#166534;background:#dcfce7;border-radius:3px;padding:0 2px;font-weight:700;">'+sug+'</span>'
            +'<span style="color:#94a3b8;">'+after+'…</span>'
          +'</div>'
          +'<div style="display:flex;gap:6px;">'
            +'<button type="button" data-pf-apply="'+idx+'" style="border:none;background:#0d7377;color:#fff;font-weight:700;font-size:12px;border-radius:7px;padding:5px 12px;cursor:pointer;">Apply</button>'
            +'<button type="button" data-pf-ignore="'+idx+'" style="border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:600;font-size:12px;border-radius:7px;padding:5px 12px;cursor:pointer;">Ignore</button>'
          +'</div></div>';
      });
    }
    panel.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;background:#0f766e;color:#fff;">'
        +'<span style="font-weight:800;font-size:14px;">✓ Proofread</span>'
        +'<span style="font-size:12px;opacity:.9;">'+(issues.length?issues.length+' suggestion'+(issues.length===1?'':'s'):'all clear')+'</span>'
        +'<button type="button" data-pf-close="1" aria-label="Close" style="margin-left:auto;border:none;background:rgba(255,255,255,.18);color:#fff;font-weight:800;font-size:15px;border-radius:7px;width:28px;height:28px;cursor:pointer;">✕</button>'
      +'</div>'
      +'<div style="padding:8px 12px;font-size:11px;color:#64748b;border-bottom:1px solid #eef2f7;line-height:1.4;">Suggestions only — meaning is kept. Nothing changes until you press <b>Apply</b>. Runs offline; no note text leaves this app.</div>'
      +'<div class="pf-list" style="overflow:auto;flex:1;">'+rows+'</div>'
      +(safeCount?'<div style="padding:10px 12px;border-top:1px solid #eef2f7;background:#f8fafc;"><button type="button" data-pf-applyall="1" style="width:100%;border:none;background:#1a2e4a;color:#fff;font-weight:800;font-size:13px;border-radius:8px;padding:9px;cursor:pointer;">Apply all spelling, grammar &amp; spacing fixes ('+safeCount+')</button></div>':'');
  }

  function open(editor){
    if(!editor){alert('Open a clinical review note first, then press Proofread.');return;}
    ensurePanel();
    panel._editor=editor;
    panel._ignored=new Set();
    render();
    panel.style.display='flex';
  }
  function close(){if(panel)panel.style.display='none';}

  // delegated clicks on the panel
  document.addEventListener('click',function(e){
    if(!panel||panel.style.display==='none')return;
    const t=e.target.closest&&e.target.closest('[data-pf-close],[data-pf-apply],[data-pf-ignore],[data-pf-applyall]');
    if(!t||!panel.contains(t))return;
    if(t.hasAttribute('data-pf-close')){close();return;}
    const issues=panel._issues||[];
    if(t.hasAttribute('data-pf-apply')){
      const i=issues[Number(t.getAttribute('data-pf-apply'))];
      if(i){applyIssue(i);}
      return;
    }
    if(t.hasAttribute('data-pf-ignore')){
      const i=issues[Number(t.getAttribute('data-pf-ignore'))];
      if(i){panel._ignored.add(sig(i));render();}
      return;
    }
    if(t.hasAttribute('data-pf-applyall')){applyAllSafe();return;}
  });

  function applyIssue(clicked){
    const editor=panel._editor;if(!editor)return;
    const fresh=check(buildModel(editor).text);
    const match=fresh.find(function(i){return i.original===clicked.original&&i.suggestion===clicked.suggestion&&Math.abs(i.start-clicked.start)<=3;})
             ||fresh.find(function(i){return i.original===clicked.original&&i.suggestion===clicked.suggestion;});
    if(match)applyFix(editor,match.start,match.end,match.suggestion);
    render();
  }
  function applyAllSafe(){
    const editor=panel._editor;if(!editor)return;let guard=0;
    while(guard++<800){
      const issues=check(buildModel(editor).text).filter(function(i){return SAFE.has(i.type)&&!panel._ignored.has(sig(i));});
      let did=false;
      for(let k=0;k<issues.length;k++){const it=issues[k];if(applyFix(editor,it.start,it.end,it.suggestion)){did=true;break;}}
      if(!did)break;
    }
    render();
  }

  // ---- Live underlining as you type (CSS Custom Highlight API) ----------------
  // Draws a wavy underline under spelling / grammar / spacing issues over the real
  // text — no DOM or caret changes, so typing is never disturbed. Where the API is
  // unsupported it does nothing (the ✓ Proofread button still works).
  const LIVE_TYPES=['spelling','grammar','mechanics'];   // wording (style) stays button-only
  const liveEditors=new Set();
  let liveTimer=null,styleInjected=false;
  function supportsHighlight(){return typeof CSS!=='undefined'&&CSS.highlights&&typeof Highlight!=='undefined'&&typeof Range!=='undefined';}
  function injectStyle(){
    if(styleInjected||!document.head)return;styleInjected=true;
    const st=document.createElement('style');
    st.textContent='::highlight(pf-spelling){text-decoration:red wavy underline;text-decoration-skip-ink:none;}'
      +'::highlight(pf-grammar){text-decoration:#d97706 wavy underline;text-decoration-skip-ink:none;}'
      +'::highlight(pf-mechanics){text-decoration:#2563eb wavy underline;text-decoration-skip-ink:none;}';
    document.head.appendChild(st);
  }
  function ensureHighlights(){
    if(!supportsHighlight())return false;
    LIVE_TYPES.forEach(function(t){if(!CSS.highlights.has('pf-'+t))CSS.highlights.set('pf-'+t,new Highlight());});
    return true;
  }
  function rebuildHighlights(){
    if(!ensureHighlights())return;
    const byType={spelling:[],grammar:[],mechanics:[]};
    Array.from(liveEditors).forEach(function(ed){
      if(!ed.isConnected){liveEditors.delete(ed);return;}
      const model=buildModel(ed);
      check(model.text).forEach(function(i){
        if(!byType[i.type])return;                       // skip wording etc.
        const a=model.map[i.start],b=model.map[i.end-1];
        if(!a||!a.node||!b||!b.node)return;
        try{const r=document.createRange();r.setStart(a.node,a.off);r.setEnd(b.node,b.off+1);byType[i.type].push(r);}catch(_){}
      });
    });
    LIVE_TYPES.forEach(function(t){const h=CSS.highlights.get('pf-'+t);if(h){h.clear();byType[t].forEach(function(r){h.add(r);});}});
  }
  function refreshLive(){clearTimeout(liveTimer);liveTimer=setTimeout(rebuildHighlights,250);}
  function live(editor){
    if(!editor||!supportsHighlight())return;
    injectStyle();
    if(!editor.dataset.pfLive){
      editor.dataset.pfLive='1';
      editor.addEventListener('input',refreshLive);
      editor.addEventListener('blur',refreshLive);
      liveEditors.add(editor);
    }
    rebuildHighlights();
  }

  window.Proofread={check:check,open:open,close:close,live:live,refreshLive:refreshLive};
})();
