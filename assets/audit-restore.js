/* Recovery uses protected server snapshots, never client-supplied old values. */
window.AuditRestore=(()=>{
  let dialog,client,busy=false,returnFocus,preview;
  const label=k=>k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const value=v=>v===null||v===undefined?'Not recorded':typeof v==='object'?JSON.stringify(v,null,2):String(v);
  const close=()=>{if(busy)return;dialog?.remove();dialog=null;returnFocus?.focus();};
  async function open(id){
    if(dialog)return;client=SB;returnFocus=document.activeElement;dialog=el('dialog',undefined,'audit-recovery');
    const openedDialog=dialog;
    const head=el('h2','Review & restore');head.id='audit-recovery-title';dialog.setAttribute('aria-labelledby',head.id);const cancel=el('button','Close','btn-secondary');cancel.type='button';cancel.onclick=close;
    const status=el('p','Loading previous values…');status.setAttribute('role','status');
    const refresh=el('button','Refresh preview','btn-secondary');refresh.type='button';refresh.onclick=()=>{if(busy)return;close();open(id);};
    dialog.append(head,status,cancel,refresh);document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...dialog.querySelectorAll('button,input,textarea')].filter(n=>!n.disabled);if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    try{
      const result=await client.rpc('audit_restore_preview',{source:id});if(result.error)throw result.error;if(dialog!==openedDialog)return;
      preview=result.data;status.textContent='Choose previous values to restore. Later changes are protected. Recovery expires after 90 days; restored values remain in use.';
      const deleted=preview.records.some(r=>r.operation==='DELETE');
      const content=el('div');dialog.insertBefore(content,cancel);
      if(deleted)content.append(el('p','Deleting a parent may also remove related records. This restoration restores the linked records together, or applies nothing.'));
      const checks=[];let blocked=false;
      for(const r of preview.records){
        content.append(el('h3',label(r.table)+(r.operation==='DELETE'?' — deleted record':'')));
        content.append(el('p','Record: '+r.id,'audit-recovery-id'));
        if(r.versioned)content.append(el('p','Restoring this report adds a new signed version and keeps its original history. Encounter restoration changes the report, not the patient’s current care setup.','audit-recovery-note'));
        if(r.skipped.length){content.append(el('p','Excluded from recovery: '+r.skipped.map(label).join(', ')+'. Photograph and large-file backups are not retained.','audit-recovery-warning'));if(r.operation==='DELETE')blocked=true;}
        const table=el('table');const thead=el('thead');const hr=el('tr');for(const t of ['Restore','Field','Previous value','Current value'])hr.append(el('th',t));thead.append(hr);table.append(thead);const body=el('tbody');table.append(body);
        for(const f of r.fields){
          const row=el('tr');const choose=el('td');
          if(!deleted){const checkbox=el('input');checkbox.type='checkbox';checkbox.value=f.key;checkbox.disabled=!f.available;checkbox.setAttribute('aria-label','Restore '+label(f.key));choose.append(checkbox);checks.push(checkbox);}
          else choose.textContent='Together';
          const name=el('td',label(f.key));if(f.reason)name.append(el('small',f.reason,'audit-recovery-warning'));
          const before=el('td');before.append(el('pre',value(f.before)));const current=el('td');current.append(el('pre',value(f.current)));
          row.append(choose,name,before,current);body.append(row);
          if(deleted&&!f.available)blocked=true;
        }
        content.append(table);
      }
      // Report and assessment are one correction, not independent histories.
      const reportKeys=['assessment','nursing_report'];for(const c of checks.filter(c=>reportKeys.includes(c.value)&&preview.records.some(r=>r.table==='encounters'))){c.onchange=()=>checks.filter(x=>reportKeys.includes(x.value)&&!x.disabled).forEach(x=>x.checked=c.checked);}
      const reasonLabel=el('label','Reason for restoration');const reason=el('textarea');reason.rows=3;reason.maxLength=1000;reasonLabel.append(reason);content.append(reasonLabel);
      const apply=el('button',deleted?'Restore linked records':'Restore selected values','btn-add');apply.disabled=blocked;dialog.insertBefore(apply,cancel);
      if(blocked)content.append(el('p','This deletion cannot currently be restored safely. No partial restoration will be applied.','audit-recovery-warning'));
      apply.onclick=async()=>{
        if(busy)return;
        const selected=checks.filter(c=>c.checked&&!c.disabled).map(c=>c.value);
        if(!deleted&&!selected.length){status.textContent='Select at least one available field.';return;}
        if(reason.value.trim().length<3){status.textContent='Enter a reason for the restoration.';reason.focus();return;}
        if(!confirm(deleted?'Restore these deleted records together?':'Restore the selected previous values?'))return;
        busy=true;apply.disabled=true;cancel.disabled=true;refresh.disabled=true;status.textContent='Restoring…';
        try{const result=await client.rpc('audit_restore_apply',{source:id,selected_fields:selected,reason:reason.value.trim()});if(result.error)throw result.error;
          busy=false;close();alert('Restored successfully. The app will reload with the saved values.');location.reload();
        }catch(error){status.textContent=error.message||String(error);busy=false;apply.disabled=blocked;cancel.disabled=false;refresh.disabled=false;}
      };
    }catch(error){if(dialog===openedDialog)status.textContent=error.message||String(error);}
  }
  return {open};
})();
