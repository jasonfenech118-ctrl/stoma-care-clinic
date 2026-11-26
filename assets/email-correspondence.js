/* Email correspondence — PREVIEW, built ahead of the move to Dataverse.

   How it will work once switched on (see docs/dataverse/email-correspondence.md):
   • An email thread (pasted, or the email file downloaded from Outlook) is split
     into one entry per message, oldest first, each with From, To, CC, the date
     and time, the subject, its own new text and its attachments. The original
     email is kept word for word so it can be printed from the app.
   • Each message is an encounter of the patient's correspondence episode and
     gets its code: EP03-123456M-02-DC (Doctors), -CC (Community), -PC (Patient).
   • Replies are written in the app. The email subject is ALWAYS the patient's
     name, surname and ID card number — nothing else — and stomacare.mdh@gov.mt
     is always copied in, so every reply comes back to the clinic mailbox and can
     be filed to the right patient automatically.
   • Attachments (pictures and files) will be saved automatically with their
     message.

   For now it is a preview for the administrators: everything is shown on
   screen, NOTHING is saved and NOTHING is sent. Everything runs in the browser
   (no AI, no outside service). */
(function(global){
  'use strict';
  const ENABLED=false;   // switched on with Dataverse
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CLINIC=()=>String((typeof STOMA_CARE_EMAIL!=='undefined'&&STOMA_CARE_EMAIL)||'stomacare.mdh@gov.mt').toLowerCase();
  const normId=v=>typeof global.normaliseIdCard==='function'?global.normaliseIdCard(v):String(v||'').trim().toUpperCase().replace(/\s+/g,'').replace(/^0+(?=\d)/,'');
  const KINDS={
    doctor:{label:'Doctors correspondence',code:'DC',who:'Doctor',comm:{kind:'community',service:'Doctors correspondence'}},
    community:{label:'Community correspondence',code:'CC',who:'Community nurse',comm:{kind:'community',service:'Community'}},
    patient:{label:'Patient correspondence',code:'PC',who:'Patient / relative',comm:{kind:'patient',service:''}}
  };

  /* ------------------------------------------------------------------ *
   * The email subject: the patient's name, surname and ID card — nothing else
   * ------------------------------------------------------------------ */
  function subjectFor(p){
    p=p||{};
    return [p.first_name,p.surname].map(x=>String(x||'').trim()).filter(Boolean).join(' ')+(p.id_card?' '+String(p.id_card).trim().toUpperCase():'');
  }
  // "RE: FW: Name Surname 123456M" -> "Name Surname 123456M"
  const bareSubject=s=>String(s||'').replace(/^\s*(?:(?:re|fw|fwd|aw|tr)\s*(?:\[\d+\])?\s*:\s*)+/i,'').trim();

  /* ------------------------------------------------------------------ *
   * People, dates
   * ------------------------------------------------------------------ */
  const EMAIL_RE=/[A-Za-z0-9._%+'\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
  function people(v){
    const s=String(v||'').replace(/\s+/g,' ').trim();if(!s)return [];
    const out=[];let m;const re=/"?([^";<>]*?)"?\s*<([^<>\s]+@[^<>\s]+)>/g;let rest=s;
    while((m=re.exec(s))){out.push({name:m[1].replace(/^[,;\s]+|[,;\s]+$/g,'').trim(),email:m[2].toLowerCase()});}
    rest=s.replace(re,';');
    rest.split(/[;,]/).map(x=>x.trim()).filter(Boolean).forEach(x=>{
      const e=x.match(EMAIL_RE);
      if(e)out.push({name:x.replace(e[0],'').replace(/[<>"()]/g,'').trim(),email:e[0].toLowerCase()});
      else if(!s.includes('@')||!out.length)out.push({name:x,email:''});
    });
    // Outlook can show "Surname, Name" without addresses: rejoin those halves.
    if(!s.includes('@')&&!s.includes(';')&&out.length===2)return [{name:s,email:''}];
    const seen=new Set();return out.filter(p=>{const k=(p.email||p.name).toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true;});
  }
  const personText=p=>p?(p.name&&p.email?p.name+' <'+p.email+'>':p.name||p.email||''):'';
  const listText=a=>(a||[]).map(personText).join('; ');
  const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  // Email dates come as "Wednesday, November 26, 2026 10:15 AM", "26 November 2026 10:15",
  // "26/11/2026 10:15" (day first) or "Wed, 26 Nov 2026 10:15:00 +0100".
  function parseWhen(v){
    const s=String(v||'').trim();if(!s)return null;
    let y,mo,d,h=0,mi=0,m;
    const tm=s.match(/(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
    if(tm){h=+tm[1];mi=+tm[2];if(tm[3]){const pm=/p/i.test(tm[3]);if(pm&&h<12)h+=12;if(!pm&&h===12)h=0;}}
    if((m=s.match(/\b(\d{4})-(\d{2})-(\d{2})/)))[y,mo,d]=[+m[1],+m[2]-1,+m[3]];
    else if((m=s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/))){d=+m[1];mo=+m[2]-1;y=+m[3];if(y<100)y+=2000;}
    else if((m=s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/))&&MONTHS[m[2].slice(0,3).toLowerCase()]!=null){d=+m[1];mo=MONTHS[m[2].slice(0,3).toLowerCase()];y=+m[3];}
    else if((m=s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/))&&MONTHS[m[1].slice(0,3).toLowerCase()]!=null){mo=MONTHS[m[1].slice(0,3).toLowerCase()];d=+m[2];y=+m[3];}
    else return null;
    if(!(mo>=0&&mo<12&&d>=1&&d<=31&&y>1990))return null;
    const p=n=>String(n).padStart(2,'0');
    return {date:y+'-'+p(mo+1)+'-'+p(d),time:p(h)+':'+p(mi),text:s};
  }
  const showWhen=w=>{if(!w)return 'Date not found';const [y,m,d]=w.date.split('-');return (typeof global.fmtShortDate==='function'?global.fmtShortDate(w.date):d+'/'+m+'/'+y)+' '+w.time;};

  /* ------------------------------------------------------------------ *
   * A pasted thread → messages. Outlook puts each earlier message under a
   * header block (From / Sent / To / Cc / Subject); other mail apps write
   * "On <date>, <name> wrote:".
   * ------------------------------------------------------------------ */
  const HEAD=/^\s*\*?(From|Sent|Date|To|Cc|Subject|Attachments?)\s*:\*?\s*(.*)$/i;
  const SEPARATOR=/^\s*(?:_{8,}|-{5,}\s*(?:Original Message|Forwarded message)?\s*-{0,}|-----\s*Original Message\s*-----)\s*$/i;
  const WROTE=/^\s*On\s+(.{6,80}?),\s*(.{2,120}?)\s+wrote:\s*$/i;
  const BANNER=/^\s*(?:\[?EXTERNAL\]?|CAUTION|WARNING)\s*:?.{0,40}(?:outside|external)/i;
  function headerBlockAt(lines,i){
    if(!/^\s*\*?From\s*:/i.test(lines[i]))return null;
    const h={};let j=i,last=null;
    for(;j<lines.length&&j<i+14;j++){
      const l=lines[j];
      const m=l.match(HEAD);
      if(m){last=m[1].toLowerCase().replace(/^attachments?$/,'attachments').replace(/^date$/,'sent');h[last]=(h[last]?h[last]+' ':'')+m[2].trim();continue;}
      if(!l.trim()){if(h.subject!=null||j>i+1)break;continue;}
      // A wrapped To / Cc line
      if(last==='to'||last==='cc'||last==='attachments'){if(/@|;/.test(l)||last==='attachments'){h[last]+=' '+l.trim();continue;}}
      break;
    }
    if(!(h.sent||h.to)||h.subject==null&&!h.sent)return null;
    return {h,end:j};
  }
  function cleanBody(lines){
    const out=lines.filter(l=>!BANNER.test(l)).map(l=>l.replace(/\s+$/,''));
    while(out.length&&(!out[0].trim()||SEPARATOR.test(out[0])))out.shift();
    while(out.length&&(!out[out.length-1].trim()||SEPARATOR.test(out[out.length-1])))out.pop();
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function parseThread(text,top){
    const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
    const msgs=[];let cur={head:top||null,lines:[],raw:[]};
    for(let i=0;i<lines.length;i++){
      const hb=headerBlockAt(lines,i);
      if(hb){msgs.push(cur);cur={head:{from:hb.h.from,sent:hb.h.sent,to:hb.h.to,cc:hb.h.cc,subject:hb.h.subject,attachments:hb.h.attachments},lines:[],raw:lines.slice(i,hb.end)};i=hb.end-1;continue;}
      const w=lines[i].match(WROTE);
      if(w){msgs.push(cur);cur={head:{from:w[2],sent:w[1]},lines:[],raw:[lines[i]]};continue;}
      cur.lines.push(lines[i]);cur.raw.push(lines[i]);
    }
    msgs.push(cur);
    return msgs.map((m,k)=>{
      const h=m.head||{};
      const body=cleanBody(m.lines);
      const att=Array.isArray(h.attachments)?h.attachments:String(h.attachments||'').split(/;\s*/).map(x=>x.trim()).filter(Boolean).map(n=>({name:n.replace(/\s*\(\d+(?:\.\d+)?\s*[KMG]?B\)\s*$/i,''),type:'',size:0}));
      return {from:people(h.from)[0]||null,to:people(h.to),cc:people(h.cc),when:parseWhen(h.sent),subject:String(h.subject||'').trim(),
        body,attachments:att,original:m.raw.join('\n').trim(),hadHeader:!!m.head,index:k};
    }).filter(m=>m.body||m.hadHeader&&m.from);
  }

  /* ------------------------------------------------------------------ *
   * The email file downloaded from Outlook (.eml): exact headers, the
   * message, the earlier replies in it, and the attachments.
   * ------------------------------------------------------------------ */
  function bytesOf(bin){const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i)&255;return u;}
  function decodeBytes(bytes,cs){try{return new TextDecoder(String(cs||'utf-8').toLowerCase().replace(/^(?:us-)?ascii$/,'utf-8')).decode(bytes);}catch(e){return new TextDecoder('utf-8').decode(bytes);}}
  function b64(s){try{return bytesOf(atob(String(s).replace(/[^A-Za-z0-9+/=]/g,'')));}catch(e){return new Uint8Array(0);}}
  function qp(s,header){
    s=String(s);if(header)s=s.replace(/_/g,' ');s=s.replace(/=\r?\n/g,'');
    const out=[];for(let i=0;i<s.length;i++){const c=s[i];if(c==='='&&/^[0-9A-Fa-f]{2}$/.test(s.substr(i+1,2))){out.push(parseInt(s.substr(i+1,2),16));i+=2;}else out.push(s.charCodeAt(i)&255);}
    return new Uint8Array(out);
  }
  function words(v){
    return String(v||'').replace(/(\?=)\s+(=\?)/g,'$1$2').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,(m,cs,enc,txt)=>decodeBytes(/b/i.test(enc)?b64(txt):qp(txt,true),cs));
  }
  function splitPart(s){
    const m=s.match(/\r?\n\r?\n/);const i=m?m.index:s.length;
    const head=s.slice(0,i).replace(/\r?\n[ \t]+/g,' ');
    const h={};head.split(/\r?\n/).forEach(l=>{const k=l.indexOf(':');if(k>0){const key=l.slice(0,k).trim().toLowerCase();if(h[key]==null)h[key]=l.slice(k+1).trim();}});
    return {h,body:m?s.slice(i+m[0].length):''};
  }
  const param=(v,name)=>{const m=String(v||'').match(new RegExp(name+'\\*?=(?:"([^"]*)"|([^;\\s]*))','i'));if(!m)return '';let x=m[1]!=null?m[1]:m[2];
    const r=x.match(/^([\w\-]+)''(.*)$/);if(r){try{x=decodeURIComponent(r[2]);}catch(e){}}return words(x);};
  function leafBytes(p){const enc=String(p.h['content-transfer-encoding']||'').toLowerCase();return enc==='base64'?b64(p.body):enc==='quoted-printable'?qp(p.body):bytesOf(p.body);}
  function htmlToText(html){
    const s=String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h\d|table|blockquote)>/gi,'\n');
    try{const d=new DOMParser().parseFromString(s,'text/html');return (d.body&&d.body.textContent||'').replace(/[ \t ]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
    catch(e){return s.replace(/<[^>]+>/g,'');}
  }
  function walk(p,acc,depth){
    const ct=String(p.h['content-type']||'text/plain'),type=ct.split(';')[0].trim().toLowerCase();
    if(/^multipart\//.test(type)&&depth<8){
      const b=param(ct,'boundary');if(!b)return;
      p.body.split('--'+b).slice(1).forEach(chunk=>{if(/^--/.test(chunk))return;walk(splitPart(chunk.replace(/^\r?\n/,'')),acc,depth+1);});
      return;
    }
    const disp=String(p.h['content-disposition']||'');
    const name=param(disp,'filename')||param(ct,'name');
    if((type==='text/plain'||type==='text/html')&&!/attachment/i.test(disp)&&!name){
      const t=decodeBytes(leafBytes(p),param(ct,'charset'));
      if(type==='text/plain')acc.plain.push(t);else acc.html.push(t);return;
    }
    if(type==='message/rfc822'){acc.att.push({name:name||'Attached email.eml',type,size:p.body.length});return;}
    const bytes=leafBytes(p);
    acc.att.push({name:name||('attachment.'+(type.split('/')[1]||'bin')),type,size:bytes.length,bytes:/^image\//.test(type)&&bytes.length<=6e6?bytes:null,inline:/inline/i.test(disp)&&!/attachment/i.test(disp)});
  }
  function parseEml(bin){
    const top=splitPart(bin);
    const acc={plain:[],html:[],att:[]};walk(top,acc,0);
    const text=acc.plain.length?acc.plain.join('\n'):htmlToText(acc.html.join('\n'));
    const h=top.h;
    const head={from:words(h.from),sent:h.date,to:words(h.to),cc:words(h.cc),subject:words(h.subject)};
    const msgs=parseThread(text,head);
    // The file's own attachments belong to its newest message (the first one).
    if(msgs[0]){msgs[0].attachments=acc.att.filter(a=>!(a.inline&&/^image\//.test(a.type)&&a.size<15000));msgs[0].fromFile=true;msgs[0].messageId=String(h['message-id']||'').trim();}
    return msgs;
  }

  /* ------------------------------------------------------------------ *
   * Sorting each message: sent by the clinic or received, and from whom
   * ------------------------------------------------------------------ */
  function myEmail(){try{const u=global.ClinicAccount&&ClinicAccount.user;return String(u&&u.email||'').toLowerCase();}catch(e){return '';}}
  function direction(m){const e=String(m.from&&m.from.email||'').toLowerCase(),n=String(m.from&&m.from.name||'');
    return e&&(e===CLINIC()||e===myEmail())||/stoma\s*care/i.test(n)?'sent':'received';}
  function senderType(m,kind){
    if(direction(m)==='sent')return 'Stoma care clinic';
    const sig=String(m.body||'').split('\n').slice(-8).join(' ');
    const s=[m.from&&m.from.name,m.from&&m.from.email,sig].join(' ');
    if(/\b(?:Dr|DR|Mr|MR|Prof|PROF)\.?\s+[A-Z]|consultant|registrar|surgeon|physician|resident specialist|house officer|\bBST\b|\bHST\b/i.test(s))return 'Doctor';
    if(/comcare|community|district nurs|health cent(?:re|er)|practice nurse|\bCCP\b|home care|nursing officer|\bSN\b/i.test(s))return 'Community nurse';
    if(/@(?:gmail|googlemail|hotmail|yahoo|outlook|live|icloud|me|msn|aol|proton)\./i.test(m.from&&m.from.email||''))return 'Patient / relative';
    return KINDS[kind].who;
  }
  // Is this the right patient? The subject (name, surname, ID) is checked first.
  function patientCheck(msgs,p){
    const mine=normId(p&&p.id_card);
    const text=msgs.map(m=>bareSubject(m.subject)+' '+String(m.body||'').slice(0,600)).join(' ');
    const found=text.match(/\b\d{1,7}[A-Za-z]\b/g)||[],ids=found.map(normId);
    if(mine&&ids.includes(mine))return {ok:true,text:'✓ The ID card in the email matches this patient.'};
    if(ids.length)return {ok:false,text:'⚠️ The email mentions ID '+esc(found[0].toUpperCase())+', not this patient’s ('+esc(p&&p.id_card||'')+'). Check it is the right patient.'};
    const name=[p&&p.first_name,p&&p.surname].filter(Boolean).join(' ').toLowerCase();
    if(name&&text.toLowerCase().includes(name))return {ok:true,text:'✓ The patient’s name is in the email (no ID card found).'};
    return {ok:null,text:'No ID card or name of this patient was found in the email — check it is the right patient.'};
  }
  // The encounter codes the messages would get, worked out with the patient's
  // real episodes (nothing is saved).
  function codesFor(msgs,kind,pid){
    if(!global.EpisodeCodes||typeof EpisodeCodes.preview!=='function')return [];
    const k=KINDS[kind].comm;
    const items=msgs.map((m,i)=>({id:'preview-'+i,parent_id:i?'preview-0':null,kind:k.kind,service:k.service,
      communication_date:m.when?m.when.date:(new Date().toISOString().slice(0,10)),communication_time:m.when?m.when.time+':00':null,
      created_at:(m.when?m.when.date+'T'+m.when.time:new Date().toISOString().slice(0,16))+':00',status:'Recorded'}));
    const res=EpisodeCodes.preview(pid,items);
    return res?items.map(it=>res.commCode(it)):[];
  }

  /* ------------------------------------------------------------------ *
   * Screens (preview)
   * ------------------------------------------------------------------ */
  const st={patient:null,kind:'doctor',msgs:[],codes:[],check:null,urls:[]};
  function patientNow(){return (typeof clrState!=='undefined'&&clrState&&clrState.patient)||null;}
  function mb(){return document.getElementById('mb');}
  const BANNER_HTML='<div class="ec-preview" role="note"><strong>Preview — not switched on yet.</strong> This is how linking emails will work when the app moves to Dataverse. Nothing here is saved and no email is sent.</div>';
  function freeUrls(){st.urls.forEach(u=>{try{URL.revokeObjectURL(u);}catch(e){}});st.urls=[];}
  function open(kind){
    const p=patientNow();if(!p){alert('Open the patient record first.');return;}
    st.patient=p;if(KINDS[kind])st.kind=kind;freeUrls();
    try{if(global.EpisodeCodes)EpisodeCodes.load(p.id);}catch(e){}
    const m=mb();if(!m)return;m.className='mb mb-wide ec-modal';
    m.innerHTML='<h2>📧 Add an email <span class="ec-tag">Preview</span></h2>'+BANNER_HTML
      +'<div class="msub">For <strong>'+esc(subjectFor(p))+'</strong>. Choose the correspondence, then drop the email file downloaded from Outlook, or paste the whole email.</div>'
      +'<div class="ec-kinds" role="radiogroup" aria-label="Correspondence">'+Object.keys(KINDS).map(k=>'<label class="ec-kind'+(k===st.kind?' is-on':'')+'"><input type="radio" name="ec-kind" value="'+k+'"'+(k===st.kind?' checked':'')+' onchange="EmailCorrespondence.kind(this.value)"> '+esc(KINDS[k].label)+' <span>'+KINDS[k].code+'</span></label>').join('')+'</div>'
      +'<label class="ec-drop" id="ec-drop" ondragover="event.preventDefault();this.classList.add(\'is-over\')" ondragleave="this.classList.remove(\'is-over\')" ondrop="EmailCorrespondence.drop(event)">'
        +'<input type="file" accept=".eml,message/rfc822" hidden onchange="EmailCorrespondence.file(this.files&&this.files[0])">'
        +'<strong>📨 Drop the email file here</strong><span>or tap to choose it — in Outlook: open the email › ⋯ › Download / Save as (.eml)</span></label>'
      +'<div class="ec-or">or paste the email</div>'
      +'<textarea id="ec-paste" class="ch-paste" rows="9" placeholder="Tip: press Forward in Outlook, select all in the draft, copy and paste it here (then close the draft without sending) — the forward carries From, Sent, To, CC and Subject."></textarea>'
      +'<div id="ec-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button><button class="btn-save" onclick="EmailCorrespondence.organise()">Organise ›</button></div>';
    if(typeof global.openMo==='function')global.openMo();
  }
  function setKind(k){if(!KINDS[k])return;st.kind=k;document.querySelectorAll('.ec-kind').forEach(l=>l.classList.toggle('is-on',l.querySelector('input').value===k));}
  function say(t){const el=document.getElementById('ec-msg');if(el)el.innerHTML=t?'<div class="registry-lookup-note error" style="margin:8px 0;">'+t+'</div>':'';}
  function drop(ev){ev.preventDefault();const f=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];const z=document.getElementById('ec-drop');if(z)z.classList.remove('is-over');file(f);}
  function file(f){
    if(!f)return;
    if(!/\.eml$/i.test(f.name)&&f.type!=='message/rfc822'){say(/\.msg$/i.test(f.name)?'That is an Outlook .msg file. Please use Download / Save as <strong>.eml</strong>, or paste the email instead.':'Please choose an email file (.eml).');return;}
    const r=new FileReader();
    r.onload=()=>{const u=new Uint8Array(r.result);let bin='';for(let i=0;i<u.length;i+=32768)bin+=String.fromCharCode.apply(null,u.subarray(i,i+32768));show(parseEml(bin));};
    r.onerror=()=>say('Could not read that file.');
    r.readAsArrayBuffer(f);
  }
  function organise(){
    const t=(document.getElementById('ec-paste')||{}).value||'';
    if(!t.trim()){say('Drop the email file or paste the email first.');return;}
    show(parseThread(t,null));
  }
  function show(list){
    const msgs=(list||[]).slice().reverse();   // oldest first
    if(!msgs.length){say('Nothing could be read from that email.');return;}
    st.msgs=msgs;st.check=patientCheck(msgs,st.patient);st.codes=codesFor(msgs,st.kind,st.patient.id);
    render();
  }
  function attHTML(m){
    if(!m.attachments||!m.attachments.length)return '';
    return '<div class="ec-atts"><span class="ec-label">Attachments</span>'+m.attachments.map(a=>{
      let thumb='';
      if(a.bytes&&/^image\//.test(a.type)){try{const u=URL.createObjectURL(new Blob([a.bytes],{type:a.type}));st.urls.push(u);thumb='<img src="'+u+'" alt="">';}catch(e){}}
      return '<span class="ec-att">'+thumb+'📎 '+esc(a.name)+(a.size?' <small>'+Math.max(1,Math.round(a.size/1024))+' KB</small>':'')+'</span>';
    }).join('')+'<span class="ec-note">Will be saved automatically with the message once switched on.</span></div>';
  }
  function msgHTML(m,i){
    const dir=direction(m),who=senderType(m,st.kind),code=st.codes[i]||'';
    return '<article class="ec-msg ec-'+dir+'">'
      +'<div class="ec-msg-head">'+(code?'<span class="ec-code" title="Encounter code it would get">'+esc(code)+'</span>':'')
        +'<span class="ec-dir">'+(dir==='sent'?'⬆ Sent by the clinic':'⬇ Received')+'</span><span class="ec-who">'+esc(who)+'</span>'
        +'<span class="ec-when">'+esc(showWhen(m.when))+'</span>'
        +'<button type="button" class="ch-ic" title="Print this email" onclick="EmailCorrespondence.printOne('+i+')">🖨</button></div>'
      +'<dl class="ec-fields"><dt>From</dt><dd>'+esc(personText(m.from)||'Not in the pasted text — the top of the email was not copied')+'</dd>'
        +'<dt>To</dt><dd>'+esc(listText(m.to)||'—')+'</dd>'+(m.cc.length?'<dt>CC</dt><dd>'+esc(listText(m.cc))+'</dd>':'')
        +'<dt>Subject</dt><dd>'+esc(m.subject||'—')+'</dd></dl>'
      +'<div class="ec-body">'+esc(m.body||'(no text)')+'</div>'+attHTML(m)
      +'<details class="ch-raw"><summary>Original email as received</summary><pre>'+esc(m.original)+'</pre></details>'
      +'</article>';
  }
  function render(){
    const m=mb();if(!m)return;freeUrls();
    const c=st.check;
    m.className='mb mb-wide ec-modal';
    m.innerHTML='<h2>📧 '+esc(KINDS[st.kind].label)+' <span class="ec-tag">Preview</span></h2>'+BANNER_HTML
      +(c?'<div class="'+(c.ok===false?'ch-idbad':c.ok?'ec-ok':'ec-warn')+'">'+c.text+'</div>':'')
      +'<div class="msub">Found <strong>'+st.msgs.length+'</strong> message'+(st.msgs.length===1?'':'s')+', oldest first. Each would be saved as its own encounter, with the original email kept for printing.</div>'
      +'<div class="ec-list">'+st.msgs.map(msgHTML).join('')+'</div>'
      +'<div class="mact"><button class="btn-cancel" onclick="EmailCorrespondence.open()">‹ Back</button>'
      +'<button class="btn-cancel" onclick="EmailCorrespondence.report()">📄 Correspondence report</button>'
      +'<button class="btn-cancel" onclick="EmailCorrespondence.reply()">✉️ Write a reply</button>'
      +'<button class="btn-save" disabled title="Switched on with Dataverse">Save (with Dataverse)</button></div>';
  }
  // The reply continues the conversation: it is sent as "Reply all" to the
  // latest email (so the doctor's first email and every reply stay underneath it
  // in one Outlook conversation). To = the last person who wrote, CC = everyone
  // else on it. LOCKED: stomacare.mdh@gov.mt is always copied in and the subject
  // is always the patient's name, surname and ID card — neither can be changed.
  function reply(){
    const last=st.msgs.slice().reverse().find(m=>direction(m)==='received')||st.msgs[st.msgs.length-1]||{};
    const me=[CLINIC(),myEmail()];
    const to=last.from&&last.from.email?[last.from]:[];
    const seen=new Set(to.map(p=>p.email).concat(me));
    const cc=(last.to||[]).concat(last.cc||[]).filter(p=>p.email&&!seen.has(p.email)&&(seen.add(p.email),true));
    st.draft={to,cc,subject:subjectFor(st.patient),replyTo:last};
    const m=mb();if(!m)return;
    m.innerHTML='<h2>✉️ Reply <span class="ec-tag">Preview</span></h2>'+BANNER_HTML
      +(last.from?'<div class="ec-replyto">↩ Replying to <strong>'+esc(personText(last.from))+'</strong> · '+esc(showWhen(last.when))+(last.subject?' · '+esc(last.subject):'')
        +'<span>Sent as a reply in the same Outlook conversation, with the earlier emails underneath it.</span></div>':'')
      +'<div class="ec-compose"><label>To<input id="ec-to" value="'+esc(listText(to))+'"></label>'
      +'<div class="ec-ccbox"><span class="ec-cc-label">CC</span><span class="ec-lock" title="Always copied in — cannot be removed">🔒 Stoma Care Clinic &lt;'+esc(CLINIC())+'&gt;</span>'
        +'<input id="ec-cc" value="'+esc(listText(cc))+'" placeholder="Others copied in" aria-label="Others copied in"></div>'
      +'<label>Subject <small>🔒 always the patient’s name, surname and ID card — cannot be changed</small><input value="'+esc(st.draft.subject)+'" readonly aria-readonly="true"></label>'
      +'<label>Message<textarea id="ec-body" rows="9" placeholder="Write the reply here…"></textarea></label></div>'
      +'<div id="ec-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="EmailCorrespondence.back()">‹ Back</button><button class="btn-save" onclick="EmailCorrespondence.send()">Send reply (preview)</button></div>';
  }
  function back(){render();}
  function send(){
    const body=(document.getElementById('ec-body')||{}).value||'';
    if(!body.trim()){say('Write the reply first.');return;}
    // The clinic mailbox is added back whatever was typed — it cannot be removed.
    const cc=people((document.getElementById('ec-cc')||{}).value).filter(p=>p.email!==CLINIC());
    cc.push({name:'Stoma Care Clinic',email:CLINIC()});
    const to=people((document.getElementById('ec-to')||{}).value);
    const now=new Date(),p2=n=>String(n).padStart(2,'0');
    const last=st.draft&&st.draft.replyTo||{};
    const msg={from:{name:'Stoma Care Clinic',email:CLINIC()},to,cc,subject:st.draft.subject,body,attachments:[],original:'',
      when:{date:now.getFullYear()+'-'+p2(now.getMonth()+1)+'-'+p2(now.getDate()),time:p2(now.getHours())+':'+p2(now.getMinutes())}};
    const codes=codesFor(st.msgs.concat([msg]),st.kind,st.patient.id),code=codes[codes.length-1]||'';
    const quoted=last.from?'<div class="ec-quoted"><div class="ec-quoted-head">From: '+esc(personText(last.from))+'<br>Sent: '+esc(showWhen(last.when))+'<br>To: '+esc(listText(last.to))
      +(last.cc&&last.cc.length?'<br>Cc: '+esc(listText(last.cc)):'')+'<br>Subject: '+esc(last.subject||'')+'</div>'+esc(last.body||'')+(st.msgs.length>1?'\n\n… and the '+(st.msgs.length-1)+' earlier email'+(st.msgs.length>2?'s':'')+' of the conversation below it':'')+'</div>':'';
    const m=mb();if(!m)return;
    m.innerHTML='<h2>✉️ The reply that would be sent <span class="ec-tag">Preview</span></h2>'+BANNER_HTML
      +'<div class="msub">When switched on, this is sent as <strong>Reply all</strong> to '+(last.from?esc(personText(last.from))+'’s email of '+esc(showWhen(last.when)):'the latest email')
      +', in the same Outlook conversation, and saved here at the same time'+(code?' as <strong>'+esc(code)+'</strong>':'')+'.</div>'
      +'<div class="ec-list"><article class="ec-msg ec-sent"><dl class="ec-fields"><dt>To</dt><dd>'+esc(listText(to))+'</dd><dt>CC</dt><dd>'+esc(listText(cc))+'</dd><dt>Subject</dt><dd>'+esc((last.from?'RE: ':'')+msg.subject)+'</dd></dl>'
      +'<div class="ec-body">'+esc(body)+'</div>'+quoted+'</article></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="EmailCorrespondence.back()">‹ Back to the email</button><button class="btn-save" disabled>Send (with Dataverse)</button></div>';
  }

  /* ------------------------------------------------------------------ *
   * Printing: one email laid out like Outlook, or the whole report
   * ------------------------------------------------------------------ */
  function emailPrintHTML(m,i){
    return '<section class="em">'+(st.codes[i]?'<div class="code">'+esc(st.codes[i])+'</div>':'')
      +'<table class="hd"><tr><th>From</th><td>'+esc(personText(m.from)||'—')+'</td></tr><tr><th>Sent</th><td>'+esc(showWhen(m.when))+'</td></tr>'
      +'<tr><th>To</th><td>'+esc(listText(m.to)||'—')+'</td></tr>'+(m.cc.length?'<tr><th>CC</th><td>'+esc(listText(m.cc))+'</td></tr>':'')
      +'<tr><th>Subject</th><td>'+esc(m.subject||'—')+'</td></tr>'
      +(m.attachments&&m.attachments.length?'<tr><th>Attachments</th><td>'+esc(m.attachments.map(a=>a.name).join('; '))+'</td></tr>':'')+'</table>'
      +'<div class="bd">'+esc(m.body||'')+'</div></section>';
  }
  function printWin(title,inner){
    const w=global.open('','_blank');if(!w){alert('Please allow pop-ups to print.');return;}
    w.document.write('<html><head><title>'+esc(title)+'</title><style>body{font-family:Arial,sans-serif;color:#111;margin:18px;font-size:12.5px}h1{font-size:17px;margin:0 0 2px}.sub{color:#555;font-size:11px;margin-bottom:12px}'
      +'.em{border-top:2px solid #0d7377;padding:10px 0 14px;page-break-inside:avoid}.code{font-weight:bold;color:#0d7377;margin-bottom:6px}.hd{border-collapse:collapse;margin-bottom:10px}.hd th{text-align:left;padding:2px 12px 2px 0;color:#444;vertical-align:top;white-space:nowrap}.hd td{padding:2px 0}'
      +'.bd{white-space:pre-wrap;line-height:1.45}.pv{border:1px dashed #b45309;color:#92400e;padding:6px 8px;margin-bottom:10px;font-size:11px}@page{size:A4 portrait;margin:14mm}</style></head><body>'
      +'<div class="pv">Preview print — email linking is not switched on yet.</div>'+inner+'</body></html>');
    w.document.close();setTimeout(()=>{w.focus();w.print();},350);
  }
  function printOne(i){const m=st.msgs[i];if(!m)return;printWin(m.subject||'Email',emailPrintHTML(m,i));}
  function report(){
    const p=st.patient||{};
    printWin('Correspondence report — '+subjectFor(p),'<h1>Correspondence report — '+esc(KINDS[st.kind].label)+'</h1><div class="sub">'+esc(subjectFor(p))+' · '+st.msgs.length+' message'+(st.msgs.length===1?'':'s')+', oldest first</div>'
      +st.msgs.map(emailPrintHTML).join(''));
  }

  global.EmailCorrespondence={ENABLED,open,kind:setKind,drop,file,organise,reply,back,send,printOne,report,
    _parseThread:parseThread,_parseEml:parseEml,_people:people,_parseWhen:parseWhen,_subjectFor:subjectFor,_patientCheck:patientCheck,_senderType:senderType,_direction:direction,_state:st};
})(window);
