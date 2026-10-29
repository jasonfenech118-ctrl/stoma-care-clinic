/* Vacation leave in hours. The roster stays on duty outside the saved window. */
var LeaveHours=(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minutes=value=>{const m=String(value||'').match(/^(\d{2}):(\d{2})(?::00)?$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60+(+m[2]):null;};
  const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
  function read(record){
    const hours=Number(record?.leave_hours),start=minutes(record?.leave_start_time);
    if(!(hours>0&&hours<=24&&Number.isInteger(hours*4))||start===null||start+hours*60>1440)return null;
    return {hours,start,end:start+hours*60,from:time(start),until:time(start+hours*60)};
  }
  function label(record){const leave=read(record);return leave?'Vacation leave: '+leave.hours+'h ['+leave.from+'–'+leave.until+']':'';}
  function blocked(record,slot,duration=30){
    const leave=read(record?.vacationLeave||record),start=minutes(slot);
    return !!leave&&start!==null&&start<leave.end&&start+duration>leave.start;
  }
  function attach(nurses,roster){
    return nurses.map(n=>{const r=(roster||[]).find(x=>String(x.staff_id)===String(n.id));return read(r)?{...n,vacationLeave:r}:n;});
  }
  function fields(prefix,code,record={}){
    const leave=read(record);
    return `<div id="${prefix}-vacation"${code==='annual_leave'?'':' hidden'} class="vacation-fields">
      <div class="fg"><label for="${prefix}-leave-unit">Book vacation leave as</label><select id="${prefix}-leave-unit" onchange="LeaveHours.toggle('${prefix}','annual_leave')"><option value="days"${leave?'':' selected'}>Full day</option><option value="hours"${leave?' selected':''}>Number of hours</option></select></div>
      <div id="${prefix}-leave-time"${leave?'':' hidden'}>
        <div class="fg"><label for="${prefix}-leave-hours">Number of hours *</label><input id="${prefix}-leave-hours" type="number" min="0.25" max="24" step="0.25" value="${leave?.hours||''}" placeholder="e.g. 2 or 2.5" oninput="LeaveHours.preview('${prefix}')"/></div>
        <div class="fg"><label for="${prefix}-leave-from">Leave starts from *</label><input id="${prefix}-leave-from" type="time" step="60" value="${esc(leave?.from||'')}" oninput="LeaveHours.preview('${prefix}')"/></div>
        <div class="fg"><label for="${prefix}-leave-to">Leave ends at *</label><input id="${prefix}-leave-to" type="time" step="60" value="${esc(leave?time(leave.end%1440):'')}" oninput="LeaveHours.preview('${prefix}','end')"/></div>
        <p id="${prefix}-leave-preview" class="ap-hint" role="status">Enter the leave start and end times, or the hours and start time. The rest of the day remains on duty.</p>
      </div>
    </div>`;
  }
  function readForm(prefix,code){
    if(code!=='annual_leave'||document.getElementById(prefix+'-leave-unit')?.value!=='hours')return null;
    const raw=document.getElementById(prefix+'-leave-hours')?.value;
    const record={leave_hours:raw,leave_start_time:document.getElementById(prefix+'-leave-from')?.value};
    const leave=read(record);
    const end=minutes(document.getElementById(prefix+'-leave-to')?.value);
    if(!raw||!leave||end===null||(end===0?1440:end)!==leave.end)throw Error('Enter vacation leave in quarter-hour steps (for example 2 or 2.5 hours), with valid start and end times, finishing no later than midnight.');
    return {leave_hours:leave.hours,leave_start_time:leave.from};
  }
  function preview(prefix,changed){
    const hours=document.getElementById(prefix+'-leave-hours'),from=document.getElementById(prefix+'-leave-from'),to=document.getElementById(prefix+'-leave-to');
    const start=minutes(from?.value),finish=minutes(to?.value);
    if(changed==='end'){
      if(hours)hours.value=start!==null&&finish!==null&&(finish===0?1440:finish)>start?((finish===0?1440:finish)-start)/60:'';
    }else if(to){
      const saved=read({leave_hours:hours?.value,leave_start_time:from?.value});
      to.value=saved?time(saved.end%1440):'';
    }
    const note=document.getElementById(prefix+'-leave-preview');if(!note)return;
    try{const record=readForm(prefix,'annual_leave');note.textContent=record?label(record)+' · On duty outside these hours.':'Enter the leave start and end times, or the hours and start time.';}
    catch(_){note.textContent='Enter hours in quarter-hour steps and a start time; leave must finish on the same day.';}
  }
  function toggle(prefix,code){
    const box=document.getElementById(prefix+'-vacation');if(!box)return;
    box.hidden=code!=='annual_leave';
    const hours=!box.hidden&&document.getElementById(prefix+'-leave-unit')?.value==='hours';
    const timeBox=document.getElementById(prefix+'-leave-time');if(timeBox)timeBox.hidden=!hours;
    for(const suffix of ['leave-hours','leave-from','leave-to']){const input=document.getElementById(prefix+'-'+suffix);if(input){input.disabled=!hours;input.required=hours;}}
    preview(prefix);
  }
  function slotCount(record,slots){return slots.filter(slot=>!blocked(record,slot)).length;}
  function capacity(date,index,staff,people,slots,isWorking,findCore){
    if(staff===false)return 0;
    if(staff)return isWorking(staff,date,index)?slotCount(index.rosterByKey[staff.id+'_'+date],slots):0;
    let total=people.reduce((sum,person)=>sum+(isWorking(person,date,index)?slotCount(index.rosterByKey[person.id+'_'+date],slots):0),0);
    const seen=new Set();
    for(const bank of index.bankByDate[date]||[]){if(findCore(bank.bank_staff?.full_name))continue;const id=String(bank.bank_staff_id);if(!seen.has(id)){seen.add(id);total+=slots.length;}}
    return total;
  }
  function forIndex(index,staff,date){return staff?index?.rosterByKey?.[staff.id+'_'+date]:null;}
  function printed(row){
    const matches=String(row.roster_notes||'').matchAll(/Vacation leave: ([\d.]+)h \[(\d{2}:\d{2})[–-](\d{2}:\d{2})\]/g);
    return [...new Set([...matches].map(m=>m[1]+'h '+m[2]+'–'+m[3]))].join('; ');
  }
  function stripPrinted(notes){return String(notes||'').split(' · ').filter(part=>!/^Vacation leave: [\d.]+h \[/.test(part)).join(' · ');}
  return {read,label,blocked,attach,fields,readForm,preview,toggle,slotCount,capacity,forIndex,printed,stripPrinted};
})();
