/* Vacation leave in hours. The roster stays on duty outside the saved window. */
var LeaveHours=(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minutes=value=>{const m=String(value||'').match(/^(\d{2}):(\d{2})(?::00)?$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60+(+m[2]):null;};
  const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
  function previousDate(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
  function read(record){
    if(record?._vacationWindow)return record;
    const hours=Number(record?.leave_hours),start=minutes(record?.leave_start_time);
    if(!(hours>0&&hours<=24&&Number.isInteger(hours*4))||start===null)return null;
    const end=start+hours*60;
    return {hours,start,end,from:time(start),until:time(end%1440),nextDay:end>=1440};
  }
  function label(record){return (Array.isArray(record)?record:[record]).map(read).filter(Boolean).map(leave=>'Vacation leave: '+Math.round(leave.hours*100)/100+'h ['+leave.from+'–'+leave.until+']'+(leave.nextDay?' (+1 day)':'')).join(' · ');}
  function blocked(record,slot,duration=30){
    const records=record?.vacationLeave||record,start=minutes(slot);
    return (Array.isArray(records)?records:[records]).map(read).filter(Boolean).some(leave=>start!==null&&start<leave.end&&start+duration>leave.start);
  }
  function windows(records,staffId,date){
    const previous=previousDate(date),out=[];
    for(const record of records||[]){
      if(staffId!=null&&String(record.staff_id)!==String(staffId))continue;
      const leave=read(record);if(!leave)continue;
      const savedDate=record.roster_date||record.start_date||date;
      const offset=savedDate===date?0:savedDate===previous?-1440:null;if(offset===null)continue;
      const start=Math.max(0,leave.start+offset),end=Math.min(1440,leave.end+offset);
      if(end>start)out.push({_vacationWindow:true,start,end,hours:(end-start)/60,from:time(start),until:time(end)});
    }
    return out;
  }
  function attach(nurses,roster,date){
    return nurses.map(n=>{const leave=windows(roster,n.id,date);return leave.length?{...n,vacationLeave:leave}:n;});
  }
  function fields(prefix,code,record={}){
    const leave=read(record);
    return `<div id="${prefix}-vacation"${code==='annual_leave'?'':' hidden'} class="vacation-fields">
      <div class="fg"><label for="${prefix}-leave-unit">Book vacation leave as</label><select id="${prefix}-leave-unit" onchange="LeaveHours.toggle('${prefix}','annual_leave')"><option value="days"${leave?'':' selected'}>Full day</option><option value="hours"${leave?' selected':''}>Number of hours</option></select></div>
      <div id="${prefix}-leave-time"${leave?'':' hidden'}>
        <div class="fg"><label for="${prefix}-leave-from">Leave starts at *</label><input id="${prefix}-leave-from" type="time" step="60" value="${esc(leave?.from||'')}" oninput="LeaveHours.preview('${prefix}',true)"/></div>
        <div class="fg"><label for="${prefix}-leave-to">Leave ends at *</label><input id="${prefix}-leave-to" type="time" step="60" value="${esc(leave?.until||'')}" oninput="LeaveHours.preview('${prefix}',true)"/></div>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0 14px;"><input id="${prefix}-leave-next-day" type="checkbox"${leave?.nextDay?' checked':''} onchange="LeaveHours.preview('${prefix}')"/> Ends the following day</label>
        <div class="fg"><label for="${prefix}-leave-hours">Number of hours (calculated)</label><input id="${prefix}-leave-hours" type="number" value="${leave?.hours||''}" readonly aria-readonly="true"/></div>
        <p id="${prefix}-leave-preview" class="ap-hint" role="status">Enter start and end times. An earlier end time finishes the following day.</p>
      </div>
    </div>`;
  }
  function readForm(prefix,code){
    if(code!=='annual_leave'||document.getElementById(prefix+'-leave-unit')?.value!=='hours')return null;
    const from=document.getElementById(prefix+'-leave-from')?.value,to=document.getElementById(prefix+'-leave-to')?.value;
    const start=minutes(from),end=minutes(to),nextDay=!!document.getElementById(prefix+'-leave-next-day')?.checked;
    if(start===null||end===null)throw Error('Enter both the leave start time and end time.');
    const record={leave_hours:(end-start+(nextDay?1440:0))/60,leave_start_time:from};
    const leave=read(record);
    if(!leave)throw Error('Choose start and end times giving 15 minutes to 24 hours in quarter-hour steps. Check “Ends the following day” for overnight leave.');
    return {leave_hours:leave.hours,leave_start_time:leave.from};
  }
  function preview(prefix,autoEndDay=false){
    const note=document.getElementById(prefix+'-leave-preview');if(!note)return;
    const start=minutes(document.getElementById(prefix+'-leave-from')?.value),end=minutes(document.getElementById(prefix+'-leave-to')?.value);
    if(autoEndDay&&start!==null&&end!==null)document.getElementById(prefix+'-leave-next-day').checked=end<start;
    const total=document.getElementById(prefix+'-leave-hours');
    try{const record=readForm(prefix,'annual_leave');if(total)total.value=record?.leave_hours||'';note.textContent=record?label(record)+' · On duty outside these hours.':'Enter start and end times.';}
    catch(error){if(total)total.value='';note.textContent=error.message;}
  }
  function toggle(prefix,code){
    const box=document.getElementById(prefix+'-vacation');if(!box)return;
    box.hidden=code!=='annual_leave';
    const hours=!box.hidden&&document.getElementById(prefix+'-leave-unit')?.value==='hours';
    const timeBox=document.getElementById(prefix+'-leave-time');if(timeBox)timeBox.hidden=!hours;
    for(const suffix of ['leave-hours','leave-from','leave-to','leave-next-day']){const input=document.getElementById(prefix+'-'+suffix);if(input){input.disabled=!hours;input.required=hours&&['leave-from','leave-to'].includes(suffix);}}
    preview(prefix);
  }
  function slotCount(record,slots){return slots.filter(slot=>!blocked(record,slot)).length;}
  function capacity(date,index,staff,people,slots,isWorking,findCore){
    if(staff===false)return 0;
    if(staff)return isWorking(staff,date,index)?slotCount(forIndex(index,staff,date),slots):0;
    let total=people.reduce((sum,person)=>sum+(isWorking(person,date,index)?slotCount(forIndex(index,person,date),slots):0),0);
    const seen=new Set();
    for(const bank of index.bankByDate[date]||[]){if(findCore(bank.bank_staff?.full_name))continue;const id=String(bank.bank_staff_id);if(!seen.has(id)){seen.add(id);total+=slots.length;}}
    return total;
  }
  function forIndex(index,staff,date){
    if(!staff)return [];
    const records=[previousDate(date),date].map(d=>{const r=index?.rosterByKey?.[staff.id+'_'+d];return r?{...r,roster_date:d}:null;}).filter(Boolean);
    return windows(records,null,date);
  }
  function printed(row){
    const matches=String(row.roster_notes||'').matchAll(/Vacation leave: ([\d.]+)h \[(\d{2}:\d{2})[–-](\d{2}:\d{2})\]/g);
    return [...new Set([...matches].map(m=>m[1]+'h '+m[2]+'–'+m[3]))].join('; ');
  }
  function stripPrinted(notes){return String(notes||'').split(' · ').filter(part=>!/^Vacation leave: [\d.]+h \[/.test(part)).join(' · ');}
  return {read,label,blocked,attach,fields,readForm,preview,toggle,slotCount,capacity,forIndex,printed,stripPrinted,previousDate,windows};
})();
