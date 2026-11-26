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

   For now it is being TESTED by the administrators only:
   • emails are saved into Patient correspondence (each a contact of an issue,
     so the codes and the issue's status work as for any contact), with the
     email details in public.patient_emails (sql/add-patient-emails.sql);
   • pictures and documents from a dropped email file are kept with the
     contact (📷 Images);
   • a reply is saved, then opens in Outlook ready to send (attachments are
     downloaded to attach there).
   Everything runs in the browser (no AI, no outside service). */
(function(global){
  'use strict';
  // TESTING: only the administrators (Jason, Jacqueline) can use email linking
  // until the move to Dataverse. Set FOR_EVERYONE to true to open it to all.
  const FOR_EVERYONE=false;
  const enabled=()=>FOR_EVERYONE||!!(global.ClinicAccount&&typeof global.ClinicAccount.isAdmin==='function'&&global.ClinicAccount.isAdmin());
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
    acc.att.push({name:name||('attachment.'+(type.split('/')[1]||'bin')),type,size:bytes.length,bytes:bytes.length<=10e6?bytes:null,inline:/inline/i.test(disp)&&!/attachment/i.test(disp)});
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
  function codesFor(msgs,kind,pid,issue){
    if(!global.EpisodeCodes||typeof EpisodeCodes.preview!=='function')return [];
    const k=KINDS[kind].comm;
    const items=msgs.map((m,i)=>({id:'preview-'+i,parent_id:issue?String(issue.id):(i?'preview-0':null),kind:issue?issue.kind:k.kind,service:issue?issue.service:k.service,
      communication_date:m.when?m.when.date:(new Date().toISOString().slice(0,10)),communication_time:m.when?m.when.time+':00':null,
      created_at:(m.when?m.when.date+'T'+m.when.time:new Date().toISOString().slice(0,16))+':00',status:'Recorded'}));
    const res=EpisodeCodes.preview(pid,items);
    return res?items.map(it=>res.commCode(it)):[];
  }

  /* ------------------------------------------------------------------ *
   * Screens (preview)
   * ------------------------------------------------------------------ */
  const st={patient:null,kind:'doctor',msgs:[],codes:[],check:null,urls:[],issue:null,
    db:{pid:null,rows:[],byComm:new Map(),keys:new Set(),available:true,loaded:false,seq:0}};
  function patientNow(){return (typeof clrState!=='undefined'&&clrState&&clrState.patient)||null;}
  function mb(){return document.getElementById('mb');}
  const BANNER_HTML='<div class="ec-preview" role="note"><strong>Testing</strong> — only the administrators see email linking until the move to Dataverse. Emails are saved into Patient correspondence; a reply opens in Outlook to be sent there.</div>';
  const SETUP_MSG='Saving emails needs a one-time set-up. Run <strong>sql/add-patient-emails.sql</strong> in Supabase, then press ↻ Refresh.';
  function freeUrls(){st.urls.forEach(u=>{try{URL.revokeObjectURL(u);}catch(e){}});st.urls=[];}
  const cut=(s,n)=>{s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
  const uuid=()=>global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});
  // A message's own key: its Message-ID when the email file gave one, else a
  // fingerprint of who, when, subject and text — so the same email is never saved twice.
  function hash(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16);}
  function keyOf(m){
    if(m.messageId)return m.messageId.slice(0,300);
    const t=[m.from&&m.from.email,m.when&&m.when.date,m.when&&m.when.time,bareSubject(m.subject),String(m.body||'').replace(/\s+/g,' ').trim().slice(0,400)].join('|').toLowerCase();
    return 'fp:'+hash(t)+hash(t.split('').reverse().join(''));
  }
  const kindOfIssue=r=>r.kind==='patient'?'patient':/doctor/i.test(String(r.service||''))?'doctor':'community';
  const issues=()=>(global.PatientCommunications&&PatientCommunications.historyRows?PatientCommunications.historyRows():[]).filter(r=>!r.parent_id);
  const myName=async()=>{try{const u=await global.getCurrentUserForAudit();return String(u&&(u.name||u.email)||'');}catch(e){return '';}};
  function db(){return (typeof SB!=='undefined'&&SB)||global.SB;}

  /* ---------- the patient's saved emails ---------- */
  async function loadFor(pid){
    pid=String(pid||'');if(!pid||!db()||!enabled())return;
    const d=st.db;if(d.pid!==pid){d.pid=pid;d.rows=[];d.byComm=new Map();d.keys=new Set();d.loaded=false;}
    const seq=++d.seq;
    let res;try{res=await db().from('patient_emails').select('*').eq('patient_id',pid);}catch(e){res={data:null,error:e};}
    if(seq!==d.seq||d.pid!==pid)return;
    d.loaded=true;
    if(res.error){d.available=!/patient_emails|does not exist|relation|schema cache/i.test(String(res.error.message||res.error));d.rows=[];}
    else{d.available=true;d.rows=res.data||[];}
    d.byComm=new Map(d.rows.map(r=>[String(r.communication_id),r]));d.keys=new Set(d.rows.map(r=>r.message_id).filter(Boolean));
    paintRecords();
  }
  // Inside Patient correspondence: an email contact shows From / To / CC, the
  // original email and a print button.
  function recordSlotHTML(commId){return enabled()?'<div class="ec-rec" data-comm="'+esc(commId)+'">'+recordInner(commId)+'</div>':'';}
  function recordInner(commId){
    const r=st.db.byComm.get(String(commId));if(!r)return '';
    return '<div class="ec-rec-box"><span class="ec-rec-tag">📧 Email</span>'
      +'<dl class="ec-fields"><dt>From</dt><dd>'+esc(r.from_text||'—')+'</dd><dt>To</dt><dd>'+esc(r.to_text||'—')+'</dd>'+(r.cc_text?'<dt>CC</dt><dd>'+esc(r.cc_text)+'</dd>':'')
      +(r.attachment_names?'<dt>Attached</dt><dd>'+esc(r.attachment_names)+'</dd>':'')+'</dl>'
      +'<span class="ec-rec-acts"><button type="button" class="ch-ic" title="Print this email" onclick="EmailCorrespondence.printSaved(\''+esc(commId)+'\')">🖨 Print email</button></span>'
      +(r.original?'<details class="ch-raw"><summary>Original email</summary><pre>'+esc(r.original)+'</pre></details>':'')+'</div>';
  }
  function paintRecords(){document.querySelectorAll('.ec-rec').forEach(el=>{el.innerHTML=recordInner(el.dataset.comm);});}
  // Saved emails back into messages (for a reply or the report).
  function savedMsg(r){
    const at=r.sent_at?new Date(r.sent_at):null,p2=n=>String(n).padStart(2,'0');
    const when=at&&!isNaN(at)?{date:at.getFullYear()+'-'+p2(at.getMonth()+1)+'-'+p2(at.getDate()),time:p2(at.getHours())+':'+p2(at.getMinutes())}:null;
    return {from:people(r.from_text)[0]||null,to:people(r.to_text),cc:people(r.cc_text),when,subject:r.subject||'',body:r.body||'',
      attachments:String(r.attachment_names||'').split(/;\s*/).filter(Boolean).map(n=>({name:n,type:'',size:0})),original:r.original||'',
      messageId:r.message_id||'',saved:true,commId:String(r.communication_id),direction:r.direction};
  }

  function open(kind,issueId){
    const p=patientNow();if(!p){alert('Open the patient record first.');return;}
    st.patient=p;freeUrls();st.issue=null;
    if(issueId){st.issue=issues().find(r=>String(r.id)===String(issueId))||null;if(st.issue)st.kind=kindOfIssue(st.issue);}
    else if(KINDS[kind])st.kind=kind;
    try{if(global.EpisodeCodes)EpisodeCodes.load(p.id);}catch(e){}
    loadFor(p.id);
    const m=mb();if(!m)return;m.className='mb mb-wide ec-modal';
    m.innerHTML='<h2>📧 Add an email <span class="ec-tag">Testing</span></h2>'+BANNER_HTML
      +'<div class="msub">For <strong>'+esc(subjectFor(p))+'</strong>. '+(st.issue?'Adding to <strong>'+esc(st.issue.subject)+'</strong> ('+esc(KINDS[st.kind].label)+').':'Choose the correspondence, then drop the email file downloaded from Outlook, or paste the whole email.')+'</div>'
      +(st.issue?'':'<div class="ec-kinds" role="radiogroup" aria-label="Correspondence">'+Object.keys(KINDS).map(k=>'<label class="ec-kind'+(k===st.kind?' is-on':'')+'"><input type="radio" name="ec-kind" value="'+k+'"'+(k===st.kind?' checked':'')+' onchange="EmailCorrespondence.kind(this.value)"> '+esc(KINDS[k].label)+' <span>'+KINDS[k].code+'</span></label>').join('')+'</div>')
      +'<label class="ec-drop" id="ec-drop" ondragover="event.preventDefault();this.classList.add(\'is-over\')" ondragleave="this.classList.remove(\'is-over\')" ondrop="EmailCorrespondence.drop(event)">'
        +'<input type="file" accept=".eml,message/rfc822" hidden onchange="EmailCorrespondence.file(this.files&&this.files[0])">'
        +'<strong>📨 Drop the email file here</strong><span>or tap to choose it — in Outlook: open the email › ⋯ › Download / Save as (.eml). The file brings its pictures and documents too.</span></label>'
      +'<div class="ec-or">or paste the email</div>'
      +'<textarea id="ec-paste" class="ch-paste" rows="9" placeholder="Tip: press Forward in Outlook, select all in the draft, copy and paste it here (then close the draft without sending) — the forward carries From, Sent, To, CC and Subject."></textarea>'
      +'<div id="ec-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button><button class="btn-save" onclick="EmailCorrespondence.organise()">Organise ›</button></div>';
    if(typeof global.openMo==='function')global.openMo();
  }
  function setKind(k){if(!KINDS[k])return;st.kind=k;document.querySelectorAll('.ec-kind').forEach(l=>l.classList.toggle('is-on',l.querySelector('input').value===k));}
  function say(t,ok){const el=document.getElementById('ec-msg');if(el)el.innerHTML=t?'<div class="registry-lookup-note'+(ok?'':' error')+'" style="margin:8px 0;">'+t+'</div>':'';}
  function drop(ev){ev.preventDefault();const f=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];const z=document.getElementById('ec-drop');if(z)z.classList.remove('is-over');file(f);}
  function file(f){
    if(!f)return;
    if(!/\.eml$/i.test(f.name)&&f.type!=='message/rfc822'){say(/\.msg$/i.test(f.name)?'That is an Outlook .msg file. Please use Download / Save as <strong>.eml</strong>, or paste the email instead.':'Please choose an email file (.eml).');return;}
    const r=new FileReader();
    r.onload=()=>{const u=new Uint8Array(r.result);let bin='';for(let i=0;i<u.length;i+=32768)bin+=String.fromCharCode.apply(null,u.subarray(i,i+32768));show(parseEml(bin),'file');};
    r.onerror=()=>say('Could not read that file.');
    r.readAsArrayBuffer(f);
  }
  function organise(){
    const t=(document.getElementById('ec-paste')||{}).value||'';
    if(!t.trim()){say('Drop the email file or paste the email first.');return;}
    show(parseThread(t,null),'paste');
  }
  async function show(list,source){
    const msgs=(list||[]).slice().reverse();   // oldest first
    if(!msgs.length){say('Nothing could be read from that email.');return;}
    dropDraftFiles();st.draft=null;
    if(!st.db.loaded||st.db.pid!==String(st.patient.id))await loadFor(st.patient.id);
    msgs.forEach(m=>{m.source=source||'paste';m.key=keyOf(m);m.saved=st.db.keys.has(m.key);if(m.saved){const r=st.db.rows.find(x=>x.message_id===m.key);if(r)m.commId=String(r.communication_id);}});
    // Part of a conversation already saved: new messages join the same issue.
    if(!st.issue){const r=st.db.rows.find(x=>msgs.some(m=>m.saved&&m.key===x.message_id));if(r&&r.issue_id){st.issue=await getIssue(r.issue_id);if(st.issue)st.kind=kindOfIssue(st.issue);}}
    st.msgs=msgs;st.check=patientCheck(msgs,st.patient);refreshCodes();
    render();
  }
  // Saved messages show their real code; new ones the code they will get.
  function refreshCodes(){
    const c=global.EpisodeCodes&&EpisodeCodes.cached(st.patient&&st.patient.id);
    const pending=st.msgs.filter(m=>!m.commId);
    const pv=pending.length?codesFor(pending,st.kind,st.patient.id,st.issue):[];
    let k=0;st.codes=st.msgs.map(m=>m.commId?(c?c.commCode({id:m.commId}):''):(pv[k++]||''));
  }
  function attHTML(m,mi){
    if(!m.attachments||!m.attachments.length)return '';
    const pics=m.attachments.map((a,ai)=>({a,ai})).filter(x=>x.a.bytes&&/^image\//.test(x.a.type));
    const others=m.attachments.filter(a=>!(a.bytes&&/^image\//.test(a.type)));
    return '<div class="ec-atts"><span class="ec-label">Attachments</span>'
      // A picture that came in: one click opens it in the marker, and the
      // marked-up copy goes straight onto the reply.
      +pics.map(({a,ai})=>'<span class="ec-pic"><button type="button" class="ec-pic-img" title="Mark up this picture" aria-label="Mark up '+esc(a.name)+'" onclick="EmailCorrespondence.markUp('+mi+','+ai+')"><img src="'+imgUrl(a)+'" alt=""></button>'
        +'<span class="ec-pic-name">'+esc(a.name)+' <small>'+kb(a.size)+'</small></span>'
        +'<button type="button" class="ec-pic-edit" onclick="EmailCorrespondence.markUp('+mi+','+ai+')">✏️ Mark up &amp; reply</button></span>').join('')
      +others.map(a=>'<span class="ec-att">📎 '+esc(a.name)+(a.size?' <small>'+kb(a.size)+'</small>':'')+'</span>').join('')
      +(m.saved?'':'<span class="ec-note">'+(m.source==='file'?'Pictures and documents are saved with the email (📷 Images).':'A pasted email carries only the attachment names — drop the email file to keep the attachments.')+'</span>')+'</div>';
  }
  function msgHTML(m,i){
    const dir=direction(m),who=senderType(m,st.kind),code=st.codes[i]||'';
    return '<article class="ec-msg ec-'+dir+'">'
      +'<div class="ec-msg-head">'+(code?'<span class="ec-code" title="'+(m.saved?'Encounter code':'Encounter code it will get')+'">'+esc(code)+'</span>':'')
        +(m.saved?'<span class="ec-saved">✓ Saved</span>':'')
        +'<span class="ec-dir">'+(dir==='sent'?'⬆ Sent by the clinic':'⬇ Received')+'</span><span class="ec-who">'+esc(who)+'</span>'
        +'<span class="ec-when">'+esc(showWhen(m.when))+'</span>'
        +'<button type="button" class="ch-ic" title="Print this email" onclick="EmailCorrespondence.printOne('+i+')">🖨</button></div>'
      +'<dl class="ec-fields"><dt>From</dt><dd>'+esc(personText(m.from)||'Not in the pasted text — the top of the email was not copied')+'</dd>'
        +'<dt>To</dt><dd>'+esc(listText(m.to)||'—')+'</dd>'+(m.cc.length?'<dt>CC</dt><dd>'+esc(listText(m.cc))+'</dd>':'')
        +'<dt>Subject</dt><dd>'+esc(m.subject||'—')+'</dd></dl>'
      +'<div class="ec-body">'+esc(m.body||'(no text)')+'</div>'+attHTML(m,i)
      +(m.original?'<details class="ch-raw"><summary>Original email</summary><pre>'+esc(m.original)+'</pre></details>':'')
      +'</article>';
  }
  function render(note){
    const m=mb();if(!m)return;freeUrls();
    const c=st.check,unsaved=st.msgs.filter(x=>!x.saved).length;
    m.className='mb mb-wide ec-modal';
    m.innerHTML='<h2>📧 '+esc(KINDS[st.kind].label)+' <span class="ec-tag">Testing</span></h2>'+BANNER_HTML
      +(note?'<div class="ec-ok">'+note+'</div>':'')
      +(c&&unsaved?'<div class="'+(c.ok===false?'ch-idbad':c.ok?'ec-ok':'ec-warn')+'">'+c.text+'</div>':'')
      +'<div class="msub">'+st.msgs.length+' message'+(st.msgs.length===1?'':'s')+', oldest first'+(st.issue?' · in <strong>'+esc(st.issue.subject)+'</strong>':'')+'. '
        +(unsaved?'Each is saved as its own encounter in Patient correspondence, with the original email kept for printing.':'All of them are saved.')+'</div>'
      +'<div id="ec-msg"></div>'
      +'<div class="ec-list">'+st.msgs.map(msgHTML).join('')+'</div>'
      +'<div class="mact"><button class="btn-cancel" onclick="'+(st.fromIssue?'closeModal()':'EmailCorrespondence.open(null,'+(st.issue?'\''+esc(st.issue.id)+'\'':'null')+')')+'">'+(st.fromIssue?'Close':'‹ Back')+'</button>'
      +'<button class="btn-cancel" onclick="EmailCorrespondence.report()">📄 Correspondence report</button>'
      +'<button class="btn-cancel" onclick="EmailCorrespondence.reply()">✉️ Write a reply</button>'
      +(unsaved?'<button class="btn-save" id="ec-save" onclick="EmailCorrespondence.saveThread()">Save '+unsaved+' email'+(unsaved===1?'':'s')+'</button>':'')+'</div>';
  }

  /* ---------- saving: each email becomes a contact of a correspondence issue ---------- */
  function nowWhen(){const n=new Date(),p2=x=>String(x).padStart(2,'0');return {date:n.getFullYear()+'-'+p2(n.getMonth()+1)+'-'+p2(n.getDate()),time:p2(n.getHours())+':'+p2(n.getMinutes())};}
  function payloadFor(m,parent){
    const sent=direction(m)==='sent',other=sent?(m.to[0]||null):m.from,w=m.when||nowWhen();
    const k=parent?{kind:parent.kind,service:parent.service||''}:KINDS[st.kind].comm;
    const p={communication_date:w.date,communication_time:w.time,method:'Email',direction:sent?'Outgoing':'Incoming',
      contact_name:cut(personText(other)||(sent?'Email recipient':'Email sender'),200),service:k.kind==='community'?k.service:'',
      subject:cut(m.subject||subjectFor(st.patient),200),notes:cut(m.body||'(No text in this email.)',20000),
      status:parent?(parent.status||'Recorded'):'Recorded',followup_action:'',followup_date:'',reminder_enabled:false,parent_id:parent?String(parent.id):''};
    if(parent)p.parent_version=parent.version;
    return p;
  }
  async function getIssue(id){
    const r=issues().find(x=>String(x.id)===String(id));if(r)return r;
    try{const q=await db().from('patient_communications').select('*').eq('id',id).maybeSingle();return q.data||null;}catch(e){return null;}
  }
  async function saveRecord(m,parent,retried){
    const kind=parent?parent.kind:KINDS[st.kind].comm.kind;
    const {data,error}=await db().rpc('save_patient_communication',{p_patient_id:String(st.patient.id),p_record_id:uuid(),p_expected_version:0,p_kind:kind,p_payload:payloadFor(m,parent)});
    // The issue changed meanwhile (another contact added): read it again once.
    if(error&&error.code==='40001'&&parent&&!retried){
      const q=await db().from('patient_communications').select('*').eq('id',parent.id).maybeSingle();
      if(q.data){st.issue=q.data;return saveRecord(m,q.data,true);}
    }
    if(error)throw error;
    return data;
  }
  async function saveEmailRow(m,commId,issueId,who){
    const w=m.when||nowWhen();const at=new Date(w.date+'T'+w.time+':00');
    const row={patient_id:String(st.patient.id),communication_id:commId,issue_id:issueId,direction:direction(m)==='sent'?'Outgoing':'Incoming',
      from_text:personText(m.from),to_text:listText(m.to),cc_text:listText(m.cc),sent_at:isNaN(at)?null:at.toISOString(),subject:m.subject||'',body:m.body||'',
      original:String(m.original||'').slice(0,200000),attachment_names:(m.attachments||[]).map(a=>a.name).join('; '),message_id:m.key||keyOf(m),source:m.source||'paste',created_by_name:who};
    const r=await db().from('patient_emails').insert([row]);
    if(r.error)throw r.error;
  }
  async function saveAttachments(m,commId,who){
    if(!global.PatientImages||typeof PatientImages.saveBlob!=='function')return [];
    const errs=[];const w=m.when||nowWhen();
    for(const a of (m.attachments||[])){
      if(!a.bytes)continue;
      const r=await PatientImages.saveBlob(new Blob([a.bytes],{type:a.type}),{key:'correspondence:'+commId,name:a.name,type:a.type,
        label:'Email '+(direction(m)==='sent'?'to ':'from ')+cut(personText(direction(m)==='sent'?m.to[0]:m.from),60)+' · '+showWhen(w),taken:w.date,who});
      if(r.error)errs.push(r.error);
    }
    return errs;
  }
  async function afterSaving(){
    try{if(global.PatientCommunications&&PatientCommunications.retry)await PatientCommunications.retry();}catch(e){}
    try{if(global.EpisodeCodes)await EpisodeCodes.load(st.patient.id,{force:true});}catch(e){}
    try{if(global.PatientImages&&PatientImages.reload)await PatientImages.reload();}catch(e){}
    await loadFor(st.patient.id);
    if(st.issue)st.issue=issues().find(r=>String(r.id)===String(st.issue.id))||st.issue;
  }
  async function saveThread(quiet){
    const todo=st.msgs.filter(m=>!m.saved);if(!todo.length)return true;
    if(st.check&&st.check.ok===false&&!confirm('The ID card in this email is not this patient’s. Save it on '+subjectFor(st.patient)+' anyway?'))return false;
    const btn=document.getElementById('ec-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    // Is the email table there? (Nothing is written if not.)
    const probe=await db().from('patient_emails').select('id').limit(1);
    if(probe.error){say(/patient_emails|does not exist|relation|schema cache/i.test(String(probe.error.message||probe.error))?SETUP_MSG:'Could not save: '+esc(probe.error.message||probe.error));if(btn){btn.disabled=false;btn.textContent='Try again';}return false;}
    const who=await myName();const problems=[];let saved=0;
    try{
      let issue=st.issue;
      for(const m of todo){
        if(btn)btn.textContent='Saving '+(saved+1)+' of '+todo.length+'…';
        const data=await saveRecord(m,issue);
        const commId=String(data.id);
        if(!issue){issue=data;st.issue=data;}else if(data.issue)issue=data.issue;
        await saveEmailRow(m,commId,String(issue.id),who);
        problems.push(...await saveAttachments(m,commId,who));
        m.saved=true;m.commId=commId;saved++;
      }
    }catch(e){
      say('Saved '+saved+' of '+todo.length+'. Could not save the rest: '+esc(e.message||e));if(btn){btn.disabled=false;btn.textContent='Try again';}
      await afterSaving();refreshCodes();return false;
    }
    try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:String(st.patient.id),patient_id:String(st.patient.id),summary:'Saved '+saved+' email'+(saved===1?'':'s')+' to '+KINDS[st.kind].label+(st.issue?': '+st.issue.subject:'')});}catch(e){}
    await afterSaving();refreshCodes();
    if(!quiet)render('✓ Saved '+saved+' email'+(saved===1?'':'s')+' in Patient correspondence'+(st.issue?' · <strong>'+esc(st.issue.subject)+'</strong>':'')+'.'
      +(problems.length?'<br>Not kept: '+esc(problems.join('; ')):''));
    return true;
  }

  /* ---------- from a correspondence issue: its emails, reply, report ---------- */
  async function issueMsgs(issueId){
    await loadFor(st.patient.id);
    const rows=st.db.rows.filter(r=>String(r.issue_id)===String(issueId)).sort((a,b)=>String(a.sent_at||'').localeCompare(String(b.sent_at||'')));
    const msgs=rows.map(savedMsg);
    // Pictures saved from these emails can be marked up for a reply.
    if(global.PatientImages&&PatientImages._state){
      const pis=PatientImages._state.rows||[];
      for(const m of msgs){
        const mine=pis.filter(r=>r.link_kind==='correspondence'&&String(r.link_id)===m.commId&&/^image\//.test(r.mime));
        if(!mine.length)continue;
        try{
          const s=await db().storage.from('patient-images').createSignedUrls(mine.map(r=>r.storage_path),600);
          for(let i=0;i<mine.length;i++){
            const u=s.data&&s.data[i]&&s.data[i].signedUrl;if(!u)continue;
            const buf=await (await fetch(u)).arrayBuffer();
            m.attachments=m.attachments.filter(a=>a.name.replace(/\.[a-z0-9]+$/i,'')!==mine[i].file_name.replace(/\.[a-z0-9]+$/i,''));
            m.attachments.push({name:mine[i].file_name,type:'image/jpeg',size:buf.byteLength,bytes:new Uint8Array(buf)});
          }
        }catch(e){}
      }
    }
    return msgs;
  }
  async function fromIssue(issueId){
    const p=patientNow();if(!p)return false;st.patient=p;
    st.issue=issues().find(r=>String(r.id)===String(issueId))||null;if(!st.issue)return false;
    st.kind=kindOfIssue(st.issue);dropDraftFiles();st.draft=null;
    st.msgs=await issueMsgs(issueId);st.check=null;st.fromIssue=true;refreshCodes();
    return true;
  }
  async function viewIssue(issueId){if(!(await fromIssue(issueId)))return;if(!st.msgs.length){alert('No emails are saved in this issue yet. Use 📧 Add email.');return;}render();if(typeof global.openMo==='function')global.openMo();}
  async function replyToIssue(issueId){if(!(await fromIssue(issueId)))return;if(!st.msgs.length){alert('No emails are saved in this issue yet. Use 📧 Add email first.');return;}reply();if(typeof global.openMo==='function')global.openMo();}
  async function issueReport(issueId){if(!(await fromIssue(issueId)))return;if(!st.msgs.length){alert('No emails are saved in this issue yet.');return;}report();}
  function printSaved(commId){
    const r=st.db.byComm.get(String(commId));if(!r)return;
    const m=savedMsg(r);const c=global.EpisodeCodes&&EpisodeCodes.cached(st.db.pid);
    printWin(m.subject||'Email',emailPrintHTML(m,-1,c?c.commCode({id:commId}):''));
  }
  // The reply continues the conversation: it is sent as "Reply all" to the
  // latest email (so the doctor's first email and every reply stay underneath it
  // in one Outlook conversation). To = the last person who wrote, CC = everyone
  // else on it — the nurse can remove any of those or add others. LOCKED:
  // stomacare.mdh@gov.mt is always copied in and the subject is always the
  // patient's name, surname and ID card — neither can be changed.
  function newDraft(){
    const last=st.msgs.slice().reverse().find(m=>direction(m)==='received')||st.msgs[st.msgs.length-1]||{};
    const me=[CLINIC(),myEmail()];
    const to=last.from&&last.from.email?[last.from]:[];
    const seen=new Set(to.map(p=>p.email).concat(me));
    const cc=(last.to||[]).concat(last.cc||[]).filter(p=>p.email&&!seen.has(p.email)&&(seen.add(p.email),true));
    return {to,toText:listText(to),cc,subject:subjectFor(st.patient),replyTo:last,body:'',atts:[]};
  }
  // The reply keeps what was written and attached until another email is opened.
  function reply(){if(!st.draft)st.draft=newDraft();composer();}
  // One click on a picture that came in: open it in the marker; the marked-up
  // copy is attached to the reply.
  function markUp(mi,ai){
    const m=st.msgs[mi],a=m&&m.attachments&&m.attachments[ai];if(!a||!a.bytes)return;
    const fresh=!st.draft;if(fresh)st.draft=newDraft();
    openEditor(imgUrl(a),{kind:'new',name:a.name,from:'thread',fresh});
  }
  // The reply screen, drawn from the draft (so what was typed survives the
  // picture editor).
  function composer(){
    const d=st.draft,last=d.replyTo||{};const m=mb();if(!m)return;
    m.className='mb mb-wide ec-modal';
    m.innerHTML='<h2>✉️ Reply <span class="ec-tag">Testing</span></h2>'+BANNER_HTML
      +(last.from?'<div class="ec-replyto">↩ Replying to <strong>'+esc(personText(last.from))+'</strong> · '+esc(showWhen(last.when))+(last.subject?' · '+esc(last.subject):'')
        +'<span>Sent as a reply in the same Outlook conversation, with the earlier emails underneath it.</span></div>':'')
      +'<div class="ec-compose"><label>To<input id="ec-to" value="'+esc(d.toText)+'" oninput="EmailCorrespondence.draft(\'toText\',this.value)"></label>'
      +'<div class="ec-ccbox"><span class="ec-cc-label">CC <small>— remove anyone with ✕, or add an address</small></span><span class="ec-lock" title="Always copied in — cannot be removed">🔒 Stoma Care Clinic &lt;'+esc(CLINIC())+'&gt;</span>'
        +'<span id="ec-cc-chips" class="ec-chips">'+ccChipsHTML()+'</span>'
        +'<span class="ec-cc-add"><input id="ec-cc-add" type="email" placeholder="Add CC, e.g. name@gov.mt" aria-label="Add an address to CC" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailCorrespondence.ccAdd();}"><button type="button" class="btn-cancel" onclick="EmailCorrespondence.ccAdd()">＋ Add</button></span></div>'
      +'<label>Subject <small>🔒 always the patient’s name, surname and ID card — cannot be changed</small><input value="'+esc(d.subject)+'" readonly aria-readonly="true"></label>'
      +'<label>Message<textarea id="ec-body" rows="8" placeholder="Write the reply here…" oninput="EmailCorrespondence.draft(\'body\',this.value)">'+esc(d.body)+'</textarea></label>'
      +attachBoxHTML()+'</div>'
      +'<div id="ec-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="EmailCorrespondence.back()">‹ Back</button><button class="btn-save" onclick="EmailCorrespondence.send()">Save &amp; open in Outlook</button></div>';
  }
  function setDraft(k,v){if(st.draft)st.draft[k]=v;}

  /* ---------- attachments on a reply: photos, files, marked-up pictures ---------- */
  const MAX_TOTAL=20*1024*1024;   // Outlook's usual limit per email
  let attSeq=0;
  const kb=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  function dropDraftFiles(){if(st.draft&&st.draft.atts)st.draft.atts.forEach(x=>{try{URL.revokeObjectURL(x.url);}catch(e){}});}
  // Pictures that came in this conversation, ready to mark up or send back.
  function receivedImages(){
    const out=[];st.msgs.forEach((m,mi)=>(m.attachments||[]).forEach((a,ai)=>{if(a.bytes&&/^image\//.test(a.type))out.push({mi,ai,a});}));return out;
  }
  function attachBoxHTML(){
    const d=st.draft,recv=receivedImages();
    const total=d.atts.reduce((n,x)=>n+x.size,0);
    return '<div class="ec-attach"><div class="ec-attach-head"><strong>Attachments</strong>'
      +'<label class="ec-attach-btn">🖼 Add photos<input type="file" accept="image/*" multiple hidden onchange="EmailCorrespondence.addFiles(this.files);this.value=\'\'"></label>'
      +'<label class="ec-attach-btn">📎 Add files<input type="file" multiple hidden onchange="EmailCorrespondence.addFiles(this.files);this.value=\'\'"></label></div>'
      +(recv.length?'<div class="ec-recv"><span class="ec-recv-label">Pictures in this conversation</span>'+recv.map((r,i)=>'<span class="ec-recv-item"><img src="'+imgUrl(r.a)+'" alt=""><span class="ec-recv-name">'+esc(r.a.name)+'</span>'
          +'<span class="ec-recv-acts"><button type="button" onclick="EmailCorrespondence.editReceived('+i+')">✏️ Mark up</button><button type="button" onclick="EmailCorrespondence.attachReceived('+i+')">＋ Attach</button></span></span>').join('')+'</div>':'')
      +(d.atts.length?'<div class="ec-att-list">'+d.atts.map(x=>'<span class="ec-att-item">'+(x.url&&/^image\//.test(x.type)?'<img src="'+x.url+'" alt="">':'<span class="ec-file-ic">📄</span>')
          +'<span class="ec-att-meta"><span class="ec-att-name">'+esc(x.name)+'</span><small>'+kb(x.size)+(x.edited?' · marked up':'')+'</small></span>'
          +(/^image\//.test(x.type)?'<button type="button" title="Mark up this picture" aria-label="Mark up '+esc(x.name)+'" onclick="EmailCorrespondence.editAttachment('+x.id+')">✏️</button>':'')
          +'<button type="button" title="Remove" aria-label="Remove '+esc(x.name)+'" onclick="EmailCorrespondence.removeAttachment('+x.id+')">✕</button></span>').join('')+'</div>'
          +'<div class="ec-att-total'+(total>MAX_TOTAL?' is-over':'')+'">'+d.atts.length+' attachment'+(d.atts.length===1?'':'s')+' · '+kb(total)+(total>MAX_TOTAL?' — over the 20 MB email limit, remove something':'')+'</div>'
        :'<div class="ec-att-empty">No attachments.</div>')
      +'</div>';
  }
  const recvUrls=new Map();
  function imgUrl(a){if(!recvUrls.has(a)){const u=URL.createObjectURL(new Blob([a.bytes],{type:a.type}));recvUrls.set(a,u);}return recvUrls.get(a);}
  function addAtt(blob,name,type,edited){
    const x={id:++attSeq,name,type:type||blob.type||'application/octet-stream',size:blob.size,blob,url:URL.createObjectURL(blob),edited:!!edited};
    st.draft.atts.push(x);return x;
  }
  function addFiles(list){
    if(!st.draft||!list)return;
    Array.from(list).forEach(f=>addAtt(f,f.name,f.type,false));
    composer();
  }
  function attachReceived(i){const r=receivedImages()[i];if(!r||!st.draft)return;addAtt(new Blob([r.a.bytes],{type:r.a.type}),r.a.name,r.a.type,false);composer();}
  function removeAttachment(id){const d=st.draft;if(!d)return;const i=d.atts.findIndex(x=>x.id===id);if(i<0)return;try{URL.revokeObjectURL(d.atts[i].url);}catch(e){}d.atts.splice(i,1);composer();}

  /* ---------- the picture editor: a marker in colours, on the picture ---------- */
  const COLOURS=[['#e11d48','Red'],['#f97316','Orange'],['#facc15','Yellow'],['#16a34a','Green'],['#2563eb','Blue'],['#111827','Black'],['#ffffff','White']];
  const SIZES=[[4,'Thin'],[9,'Medium'],[16,'Thick']];
  const ed={img:null,canvas:null,ctx:null,strokes:[],cur:null,colour:'#e11d48',size:9,target:null};
  function editReceived(i){const r=receivedImages()[i];if(!r)return;openEditor(imgUrl(r.a),{kind:'new',name:r.a.name});}
  function editAttachment(id){const x=st.draft&&st.draft.atts.find(a=>a.id===id);if(!x)return;openEditor(x.url,{kind:'replace',id,name:x.name});}
  function openEditor(url,target){
    const img=new Image();
    img.onload=()=>{
      ed.img=img;ed.target=target;ed.strokes=[];ed.cur=null;
      const m=mb();if(!m)return;
      m.className='mb mb-wide ec-modal';
      m.innerHTML='<h2>✏️ Mark up the picture</h2>'
        +'<div class="ec-ed-tools" role="toolbar" aria-label="Marker">'
          +'<span class="ec-ed-group">'+COLOURS.map(([c,n])=>'<button type="button" class="ec-swatch'+(c===ed.colour?' is-on':'')+'" style="background:'+c+'" title="'+n+'" aria-label="'+n+' marker" data-c="'+c+'" onclick="EmailCorrespondence.edColour(this.dataset.c)"></button>').join('')+'</span>'
          +'<span class="ec-ed-group">'+SIZES.map(([z,n])=>'<button type="button" class="ec-size'+(z===ed.size?' is-on':'')+'" title="'+n+'" aria-label="'+n+' line" data-z="'+z+'" onclick="EmailCorrespondence.edSize(+this.dataset.z)"><i style="width:'+(z+2)+'px;height:'+(z+2)+'px"></i></button>').join('')+'</span>'
          +'<span class="ec-ed-group"><button type="button" class="ec-ed-btn" onclick="EmailCorrespondence.edUndo()">↶ Undo</button><button type="button" class="ec-ed-btn" onclick="EmailCorrespondence.edClear()">Start over</button></span>'
        +'</div>'
        +'<div class="ec-ed-stage"><canvas id="ec-canvas" aria-label="Picture — draw on it with the marker"></canvas></div>'
        +'<p class="ec-ed-hint">Draw with your finger, a pen or the mouse.</p>'
        +'<div class="mact"><button class="btn-cancel" onclick="EmailCorrespondence.edCancel()">Cancel</button><button class="btn-save" onclick="EmailCorrespondence.edDone()">'+(target.kind==='replace'?'Save the marked-up picture':'Attach the marked-up picture')+'</button></div>';
      const cv=document.getElementById('ec-canvas');
      // Kept to a sensible size for email (longest side 1600 px).
      const k=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
      cv.width=Math.max(1,Math.round(img.naturalWidth*k));cv.height=Math.max(1,Math.round(img.naturalHeight*k));
      ed.canvas=cv;ed.ctx=cv.getContext('2d');redraw();
      cv.addEventListener('pointerdown',edDown);cv.addEventListener('pointermove',edMove);
      cv.addEventListener('pointerup',edUp);cv.addEventListener('pointercancel',edUp);cv.addEventListener('pointerleave',edUp);
    };
    img.onerror=()=>alert('This picture could not be opened for editing.');
    img.src=url;
  }
  function edPoint(e){const r=ed.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*ed.canvas.width/r.width,y:(e.clientY-r.top)*ed.canvas.height/r.height};}
  // The marker keeps the same thickness on screen whatever the picture's size.
  function edScale(){const r=ed.canvas.getBoundingClientRect();return r.width?ed.canvas.width/r.width:1;}
  function edDown(e){e.preventDefault();try{ed.canvas.setPointerCapture(e.pointerId);}catch(x){}ed.cur={c:ed.colour,w:ed.size*edScale(),pts:[edPoint(e)]};ed.strokes.push(ed.cur);paintStroke(ed.cur);}
  function edMove(e){if(!ed.cur)return;e.preventDefault();ed.cur.pts.push(edPoint(e));paintStroke(ed.cur,true);}
  function edUp(){ed.cur=null;}
  function paintStroke(s,last){
    const c=ed.ctx,p=s.pts;c.strokeStyle=s.c;c.fillStyle=s.c;c.lineWidth=s.w;c.lineCap='round';c.lineJoin='round';
    if(p.length===1){c.beginPath();c.arc(p[0].x,p[0].y,s.w/2,0,Math.PI*2);c.fill();return;}
    c.beginPath();
    if(last){c.moveTo(p[p.length-2].x,p[p.length-2].y);c.lineTo(p[p.length-1].x,p[p.length-1].y);}
    else{c.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)c.lineTo(p[i].x,p[i].y);}
    c.stroke();
  }
  function redraw(){const c=ed.ctx;c.clearRect(0,0,ed.canvas.width,ed.canvas.height);c.drawImage(ed.img,0,0,ed.canvas.width,ed.canvas.height);ed.strokes.forEach(s=>paintStroke(s));}
  function edColour(c){ed.colour=c;document.querySelectorAll('.ec-swatch').forEach(b=>b.classList.toggle('is-on',b.dataset.c===c));}
  function edSize(z){ed.size=z;document.querySelectorAll('.ec-size').forEach(b=>b.classList.toggle('is-on',+b.dataset.z===z));}
  function edUndo(){ed.strokes.pop();redraw();}
  function edClear(){if(ed.strokes.length&&!confirm('Remove all the drawing and start over?'))return;ed.strokes=[];redraw();}
  function edCancel(){
    const t=ed.target||{};ed.img=null;
    // Opened straight from the email and nothing written yet: back to the email.
    if(t.from==='thread'&&t.fresh&&st.draft&&!st.draft.body&&!st.draft.atts.length){st.draft=null;render();return;}
    if(t.from==='thread')render();else composer();
  }
  function edDone(){
    if(!ed.canvas)return;
    const t=ed.target;
    ed.canvas.toBlob(blob=>{
      if(!blob){alert('The picture could not be saved.');return;}
      const base=String(t.name||'picture').replace(/\.[a-z0-9]+$/i,'');
      if(t.kind==='replace'){
        const x=st.draft.atts.find(a=>a.id===t.id);
        if(x){try{URL.revokeObjectURL(x.url);}catch(e){}x.blob=blob;x.url=URL.createObjectURL(blob);x.size=blob.size;x.type='image/jpeg';x.edited=true;x.name=(/^marked-up /.test(base)?base:'marked-up '+base)+'.jpg';}
      }else addAtt(blob,'marked-up '+base+'.jpg','image/jpeg',true);
      ed.img=null;composer();
    },'image/jpeg',0.9);
  }

  // Full control of the other CC addresses: remove any of them, add new ones.
  function ccChipsHTML(){
    const cc=st.draft&&st.draft.cc||[];
    return cc.map((p,i)=>'<span class="ec-chip">'+esc(personText(p))+'<button type="button" title="Remove from CC" aria-label="Remove '+esc(p.email||p.name)+' from CC" onclick="EmailCorrespondence.ccRemove('+i+')">✕</button></span>').join('');
  }
  function paintCc(){const h=document.getElementById('ec-cc-chips');if(h)h.innerHTML=ccChipsHTML();}
  function ccRemove(i){if(!st.draft)return;st.draft.cc.splice(i,1);paintCc();}
  function ccAdd(){
    const el=document.getElementById('ec-cc-add');if(!el||!st.draft)return;
    const add=people(el.value).filter(p=>p.email&&p.email!==CLINIC()&&!st.draft.cc.some(x=>x.email===p.email));
    if(!add.length){say(el.value.trim()?'That address is already copied in, or is not an email address.':'Type an email address to add.');return;}
    st.draft.cc.push(...add);el.value='';say('');paintCc();
  }
  function back(){render();}
  // Send: the reply is saved as the next encounter of the conversation (its
  // pictures and files kept with it), then opens in Outlook ready to send.
  // Outlook cannot take attachments from a link, so the app downloads them for
  // the nurse to attach in Outlook. (With Dataverse the reply is sent directly.)
  async function send(){
    const d=st.draft;if(!d)return;
    const body=d.body||'';
    if(!body.trim()){say('Write the reply first.');return;}
    const atts=d.atts||[],total=atts.reduce((n,x)=>n+x.size,0);
    if(total>MAX_TOTAL){say('The attachments are over the 20 MB email limit — remove something first.');return;}
    const to=people(d.toText);
    if(!to.some(p=>p.email)){say('Put at least one email address in To.');return;}
    const cc=(d.cc||[]).filter(p=>p.email!==CLINIC());cc.push({name:'Stoma Care Clinic',email:CLINIC()});
    const btn=document.querySelector('#mb .mact .btn-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    // The conversation is saved first, so the reply joins it.
    if(st.msgs.some(m=>!m.saved)){const ok=await saveThread(true);if(!ok){composer();say('The email could not be saved, so the reply was not sent.');return;}}
    const msg={from:{name:'Stoma Care Clinic',email:CLINIC()},to,cc,subject:d.subject,body,when:nowWhen(),source:'reply',
      attachments:atts.map(x=>({name:x.name,type:x.type,size:x.size})),original:''};
    msg.original=['From: Stoma Care Clinic <'+CLINIC()+'>','Sent: '+showWhen(msg.when),'To: '+listText(to),'Cc: '+listText(cc),'Subject: '+msg.subject,
      atts.length?'Attachments: '+atts.map(x=>x.name).join('; '):'','',body].filter((l,i)=>l!==''||i===6).join('\n');
    msg.key=keyOf(msg);
    const who=await myName();let commId='';
    try{
      const probe=await db().from('patient_emails').select('id').limit(1);
      if(probe.error)throw new Error(/patient_emails|does not exist|relation|schema cache/i.test(String(probe.error.message||probe.error))?'Saving emails is not set up yet (run sql/add-patient-emails.sql).':String(probe.error.message||probe.error));
      const data=await saveRecord(msg,st.issue);commId=String(data.id);
      if(!st.issue)st.issue=data;
      await saveEmailRow(msg,commId,String((data.issue||st.issue).id),who);
      for(const x of atts){
        if(global.PatientImages&&PatientImages.saveBlob)await PatientImages.saveBlob(x.blob,{key:'correspondence:'+commId,name:x.name,type:x.type,label:'Reply to '+cut(listText(to),60)+' · '+showWhen(msg.when),who});
      }
    }catch(e){composer();say('The reply was not saved or sent: '+esc(e.message||e));return;}
    try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:String(st.patient.id),patient_id:String(st.patient.id),summary:'Replied by email ('+KINDS[st.kind].label+(st.issue?': '+st.issue.subject:'')+')'});}catch(e){}
    // Attachments: downloaded so they can be attached in Outlook.
    atts.forEach((x,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=x.url;a.download=x.name;document.body.appendChild(a);a.click();a.remove();},300*i));
    // Outlook opens with To, CC (always the clinic), the patient subject and the text.
    const addr=list=>list.filter(p=>p.email).map(p=>p.email).join(';');
    let href='mailto:'+encodeURIComponent(addr(to)).replace(/%3B/g,';').replace(/%40/g,'@')+'?cc='+encodeURIComponent(addr(cc))+'&subject='+encodeURIComponent(msg.subject)+'&body='+encodeURIComponent(body);
    let copied=false;
    if(href.length>1800){
      try{await navigator.clipboard.writeText(body);copied=true;}catch(e){}
      href=href.replace(/&body=.*$/,'&body='+encodeURIComponent(copied?'(Paste the reply here — the app copied it for you.)':''));
    }
    if(typeof global.openMailtoLink==='function')global.openMailtoLink(href);else global.location.href=href;
    await afterSaving();
    const c=global.EpisodeCodes&&EpisodeCodes.cached(st.patient.id),code=c?c.commCode({id:commId}):'';
    const m=mb();if(!m)return;
    m.innerHTML='<h2>✉️ Reply opened in Outlook <span class="ec-tag">Testing</span></h2>'
      +'<div class="ec-ok">✓ Saved in Patient correspondence'+(code?' as <strong>'+esc(code)+'</strong>':'')+(st.issue?' · '+esc(st.issue.subject):'')+'.</div>'
      +'<ol class="ec-steps"><li>Outlook has opened a new email to <strong>'+esc(listText(to))+'</strong>, CC <strong>'+esc(listText(cc))+'</strong>, subject <strong>'+esc(msg.subject)+'</strong>.</li>'
      +(copied?'<li>The reply was long, so it was <strong>copied</strong> — paste it into the email.</li>':'')
      +(atts.length?'<li>'+atts.length+' attachment'+(atts.length===1?' was':'s were')+' downloaded ('+esc(atts.map(x=>x.name).join(', '))+') — <strong>attach '+(atts.length===1?'it':'them')+'</strong> in Outlook.</li>':'')
      +'<li>Press <strong>Send</strong> in Outlook.</li></ol>'
      +'<p class="ec-ed-hint">Didn’t send it after all? Delete the reply from the correspondence issue.</p>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button></div>';
    // The downloads need the files a little longer.
    const done=st.draft;st.draft=null;setTimeout(()=>(done&&done.atts||[]).forEach(x=>{try{URL.revokeObjectURL(x.url);}catch(e){}}),60000);
  }

  /* ------------------------------------------------------------------ *
   * Printing: one email laid out like Outlook, or the whole report
   * ------------------------------------------------------------------ */
  function emailPrintHTML(m,i,code){
    code=code!=null?code:st.codes[i];
    return '<section class="em">'+(code?'<div class="code">'+esc(code)+'</div>':'')
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
      +inner+'</body></html>');
    w.document.close();setTimeout(()=>{w.focus();w.print();},350);
  }
  function printOne(i){const m=st.msgs[i];if(!m)return;printWin(m.subject||'Email',emailPrintHTML(m,i));}
  function report(){
    const p=st.patient||{};
    printWin('Correspondence report — '+subjectFor(p),'<h1>Correspondence report — '+esc(KINDS[st.kind].label)+'</h1><div class="sub">'+esc(subjectFor(p))+(st.issue?' · '+esc(st.issue.subject):'')+' · '+st.msgs.length+' message'+(st.msgs.length===1?'':'s')+', oldest first</div>'
      +st.msgs.map(emailPrintHTML).join(''));
  }

  global.EmailCorrespondence={enabled,open,kind:setKind,drop,file,organise,saveThread,reply,markUp,composer,draft:setDraft,back,send,printOne,printSaved,report,ccAdd,ccRemove,
    addFiles,attachReceived,removeAttachment,editReceived,editAttachment,edColour,edSize,edUndo,edClear,edCancel,edDone,
    loadFor,recordSlotHTML,paintRecords,viewIssue,replyToIssue,issueReport,
    _parseThread:parseThread,_parseEml:parseEml,_people:people,_parseWhen:parseWhen,_subjectFor:subjectFor,_patientCheck:patientCheck,_senderType:senderType,_direction:direction,_keyOf:keyOf,_state:st};
})(window);
