/* Private server drafts. Final encounter signing remains an explicit action. */
(function(){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  let session=null;
  const key=c=>[c.patient.id,c.episode.id,TODAY,c.record?.id||'',c.expectedVersion].join('|');
  const active=s=>session===s&&!s.cancelled&&s.ctx.mode==='form'&&s.ctx.editable&&key(s.ctx)===s.key;
  const dirty=c=>stable(c.draft)!==stable(c.baseline);
  function status(s,text,kind='draft'){s.text=text;s.kind=kind;if(!active(s)||s.ctx.saving)return;const el=document.getElementById('jenc-draft-state');if(el){el.textContent=text;el.className='cw-save-note '+kind;}window.ClinicWorkspace?.saveStatus(text,kind);}
  function statusHTML(c){const s=session;return ClinicWorkspace.esc(!c.editable?'Signed encounter':s?.ctx===c&&s.text?s.text:'No unsaved changes');}
  function recoverable(c,r){return r&&r.baseline_version===c.expectedVersion&&stable(r.baseline)===stable(c.baseline)&&
    stable((r.snapshot.scope||[]).slice().sort())===stable((c.draft.scope||[]).slice().sort());}
  function recoveryHTML(c){
    const s=session,r=s?.recovery;if(!r||!active(s)||s.ctx!==c)return '';
    const time=new Date(r.updated_at).toLocaleString('en-GB',{timeZone:'Europe/Malta',dateStyle:'short',timeStyle:'short'}),full=recoverable(c,r);
    return '<div class="cw-recovery"><strong>Unfinished draft · '+ClinicWorkspace.esc(time)+'</strong><p>'+(full?'Your private draft is available. It has not been signed or published to the handover.':'The signed record or current care changed after this draft. You can recover its written notes while keeping the current care settings.')+'</p><button type="button" class="cw-button" data-draft-action="restore">'+(full?'Restore draft':'Recover written notes')+'</button> <button type="button" class="cw-button" data-draft-action="discard">Discard draft</button><details><summary>View saved wording</summary><div class="cw-timeline-detail">'+ClinicWorkspace.esc([r.snapshot.notes,...(r.snapshot.stomas||[]).map(s=>[s.type,s.notes].filter(Boolean).join(': '))].filter(Boolean).join('\n'))+'</div></details></div>';
  }
  function renderRecovery(){const el=document.getElementById('jenc-recovery');if(el&&session)el.innerHTML=recoveryHTML(session.ctx);}
  function observe(c){
    if(!c?.editable||c.mode!=='form')return;
    if(!session||session.ctx!==c||session.key!==key(c)){
      if(session){clearTimeout(session.timer);session.cancelled=true;}
      const s=session={ctx:c,key:key(c),revision:0,recovery:null,loaded:false,cancelled:false,paused:false,last:stable(c.baseline),inflight:Promise.resolve()};
      s.ready=(async()=>{
        try{
          const {data,error}=await SB.auth.getUser();if(error||!data.user?.id)throw new Error('Sign in to protect a draft.');s.user=data.user;
          const {data:r,error:e}=await SB.from('clinic_encounter_drafts').select('*').eq('user_id',s.user.id).eq('patient_id',c.patient.id).eq('episode_id',c.episode.id).eq('draft_day',TODAY).maybeSingle();
          if(e)throw e;if(!active(s))return;s.recovery=r;s.revision=r?.revision||0;s.loaded=true;renderRecovery();
          if(dirty(c))touch(c);else status(s,r?'Recovery draft available':'No unsaved changes','neutral');
        }catch(_){if(active(s)){s.failed=true;status(s,'Draft recovery unavailable — keep this page open','error');}}
      })();
    }
    const s=session;if(s.loaded&&dirty(c)&&stable(c.draft)!==s.last)touch(c);
  }
  function touch(c){
    const s=session;if(!s||s.ctx!==c||!active(s)||s.paused||!dirty(c))return;
    clearTimeout(s.timer);
    if(s.failed){status(s,'Draft recovery unavailable — changes remain on this page','error');return;}
    status(s,s.loaded?'Unsaved changes — protecting draft…':'Unsaved changes — loading recovery…');
    if(!s.loaded)return;
    // Do not silently overwrite an older recoverable draft before the nurse has
    // chosen Restore or Discard. Current typing stays in memory meanwhile.
    if(s.recovery){status(s,'Unsaved changes — choose Restore or Discard for the earlier draft');return;}
    s.timer=setTimeout(()=>persist(s),1500);
  }
  function persist(s){
    if(!active(s)||s.paused||!s.loaded||s.recovery)return s.inflight;
    const snapshot=copy(s.ctx.draft),fingerprint=stable(snapshot);if(fingerprint===s.last)return s.inflight;
    s.inflight=s.inflight.catch(()=>{}).then(async()=>{
      if(!active(s)||s.paused)return;
      status(s,'Protecting draft…');
      try{
        const {data,error}=await SB.rpc('save_clinic_encounter_draft',{p_patient_id:s.ctx.patient.id,p_episode_id:s.ctx.episode.id,p_encounter_id:s.ctx.record?.id||null,p_baseline_version:s.ctx.expectedVersion,p_baseline:copy(s.ctx.baseline),p_snapshot:snapshot,p_expected_revision:s.revision});
        if(error)throw error;if(!data?.revision)throw new Error('Draft was not returned.');s.revision=data.revision;s.last=fingerprint;
        if(active(s))status(s,'Draft protected at '+new Date(data.updated_at).toLocaleTimeString('en-GB',{timeZone:'Europe/Malta',hour:'2-digit',minute:'2-digit'}));
        if(active(s)&&stable(s.ctx.draft)!==fingerprint)touch(s.ctx);
      }catch(e){if(active(s))status(s,e.code==='40001'?'Draft changed on another device — reopen before recovering':'Draft not protected — changes remain on this page','error');}
    });return s.inflight;
  }
  async function remove(s){
    await s.ready;await s.inflight.catch(()=>{});if(!s.user)return;
    const {error}=await SB.from('clinic_encounter_drafts').delete().eq('user_id',s.user.id).eq('patient_id',s.ctx.patient.id).eq('episode_id',s.ctx.episode.id).eq('draft_day',s.day||s.key.split('|')[2]).eq('revision',s.revision);
    if(error)throw error;
  }
  function discard(c){
    const s=session;if(!s||s.ctx!==c)return Promise.resolve();clearTimeout(s.timer);s.cancelled=true;
    const result=remove(s);if(session===s){session=null;window.ClinicWorkspace?.saveStatus('Encounter edits discarded','neutral');}return result;
  }
  async function action(kind){
    const s=session;if(!s||!active(s))return;const c=s.ctx,r=s.recovery;if(!r)return;
    if(kind==='restore'){
      if(dirty(c)&&!confirm('Replace the current written edits with the recovered draft?'))return;
      if(recoverable(c,r))c.draft=copy(r.snapshot);
      else{c.draft.notes=r.snapshot.notes||'';for(const st of c.draft.stomas||[]){const old=(r.snapshot.stomas||[]).find(x=>x.uid===st.uid);if(old)st.notes=old.notes||'';}}
      s.recovery=null;s.last=stable(c.baseline);JasonEncounters.refresh();touch(c);
    }else{
      clearTimeout(s.timer);try{await remove(s);s.recovery=null;s.revision=0;s.last=stable(c.baseline);renderRecovery();touch(c);}catch(_){status(s,'Could not discard the draft — try again','error');}
    }
  }
  async function beforeFinalSave(c){const s=session;if(!s||s.ctx!==c)return;clearTimeout(s.timer);s.paused=true;await s.ready;await s.inflight.catch(()=>{});}
  async function finalSaved(c){const s=session;if(!s||s.ctx!==c)return;clearTimeout(s.timer);s.cancelled=true;try{await remove(s);}catch(_){}if(session===s)session=null;}
  function finalFailed(c){const s=session;if(s?.ctx===c){s.paused=false;touch(c);}}
  document.addEventListener('input',e=>{if(e.target.closest('#page-jason-encounters')&&session)touch(session.ctx);});
  document.addEventListener('change',e=>{if(e.target.closest('#page-jason-encounters')&&session)touch(session.ctx);});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-draft-action]');if(b)action(b.dataset.draftAction);});
  window.addEventListener('online',()=>{if(!session)return;if(session.failed){const c=session.ctx;session.cancelled=true;session=null;observe(c);}else touch(session.ctx);});
  window.ClinicDrafts={observe,touch,recoveryHTML,recoverable,discard,beforeFinalSave,finalSaved,finalFailed,action,stable,statusHTML,get session(){return session;},flush:()=>session?persist(session):Promise.resolve()};
})();
