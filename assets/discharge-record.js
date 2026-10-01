/* Recorded-patient discharge letters. The standalone letter keeps its manual
   wizard; a registry snapshot has one section and one assessment per stoma. */
var dischargeRecord=null;
var recordedStomas=[];
var recordAssessmentIndex=0;
var recordLoadError='';

function recordedStomaLabel(stoma){
  return 'Stoma '+stoma.number+' — '+(stoma.mucusFistula?'Mucus fistula':(stoma.type||'Type not recorded'))+
    (stoma.location?' ('+stoma.location+')':'');
}
function recordedComplicationText(c){
  var text=String(c.text||'');
  if(c.note)text+=' — '+c.note;
  if(c.trend&&c.trend!=='noted')text+=' ('+c.trend+')';
  return text;
}
function recordedRodText(rod){
  if(!rod)return '';
  if(rod.removedDate)return 'Rod removed on '+_fmtDate(rod.removedDate)+'.';
  if(rod.inSitu)return 'Rod in situ'+(rod.removalDate?', due for removal on '+_fmtDate(rod.removalDate):' — removal date not recorded')+'.';
  return '';
}
function prefillRecordedLetter(){
  var token=new URLSearchParams(location.search).get('record');
  if(!token)return false;
  try{
    var data=JSON.parse(sessionStorage.getItem('stoma-discharge:'+token)||'null');
    if(!data||data.version!==1||!data.patient||!Array.isArray(data.stomas)||!data.stomas.length)
      throw Error('The recorded discharge details are unavailable. Close this tab and reopen the discharge letter from the patient record.');
    dischargeRecord=data;
    var patient=data.patient,master=WZ;
    ['title','fname','sname','id','consultant'].forEach(function(key){master[key]=String(patient[key]||'');});
    recordedStomas=data.stomas.map(function(stoma){
      resetWZ();
      ['title','fname','sname','id','consultant'].forEach(function(key){WZ[key]=master[key];});
      WZ.type=_mapStomaType(stoma.type);
      WZ.subtype=_mapSubtype(stoma.type);
      WZ.procedure=String(stoma.operation||'');
      WZ.opdate=String(stoma.operationDate||'');
      _prefillAppliances((stoma.appliances||[]).join('|'),(stoma.accessories||[]).join('|'));
      // Preserve the known system even if a catalogue name cannot be matched.
      WZ.system=stoma.system||WZ.system;
      WZ.nextChange=String(stoma.flangeDue||'');
      WZ.applianceFromRecord=true;
      WZ.rodInSitu=stoma.rod&&stoma.rod.inSitu?'yes':'no';
      WZ.rodRemovalDate=stoma.rod&&stoma.rod.removalDate||'';
      WZ.rodRemovedDate=stoma.rod&&stoma.rod.removedDate||'';
      WZ.rodFromRecord=true;
      WZ.urostomyStents=''; // Unknown is distinct from a recorded/confirmed No.
      WZ.peristomalSkin=(stoma.complications||[]).filter(function(c){
        return /peristomal|excoriation|dermatitis|skin redness|maceration/i.test(c.text||'');
      }).map(function(c){return c.text;}).join('; ');
      return {record:stoma,wizard:WZ};
    });
    WZ=master;
    var hint=document.querySelector('.toolbar .hint');
    if(hint)hint.textContent='Review each recorded stoma, complete its discharge assessment and teaching details, then save or print.';
    applyRecordedLetter();
  }catch(e){
    recordLoadError=e.message||'Could not read the discharge details.';
    document.querySelector('.body').textContent=recordLoadError;
    document.getElementById('planList').innerHTML='';
    // An unavailable snapshot must not turn into an unrelated blank letter.
    document.querySelectorAll('.toolbar .actions > button').forEach(function(button){
      if(button.textContent!=='Clear')button.disabled=true;
    });
  }
  return true;
}
function withRecordedStoma(index,action){
  var saved={wizard:WZ,type:curType,system:curSystem,outlet:curOutlet,base:curBaseplateKind};
  var state=recordedStomas[index];
  try{
    WZ=clone(state.wizard);
    ['title','fname','sname','id','consultant','teaching','teachingWith'].forEach(function(key){WZ[key]=saved.wizard[key];});
    curType=WZ.type;
    curSystem=WZ.system;
    var bag=primaryBag(),one=CAT.onePiece[parseInt(WZ.onePieceIdx,10)]||null;
    var base=CAT.baseplates[parseInt(WZ.baseplateIdx,10)]||null;
    curOutlet=state.record.outlet||(bag&&bag.outlet)||(one&&one.outlet)||'';
    curBaseplateKind=base&&base.kind||'';
    return action(state);
  }finally{
    WZ=saved.wizard;curType=saved.type;curSystem=saved.system;curOutlet=saved.outlet;curBaseplateKind=saved.base;
  }
}
function recordedReviewHTML(){
  if(recordLoadError)return '<p class="wz-record-missing">'+_esc(recordLoadError)+'</p>';
  var html='<p class="wz-cap">These details are filled from the saved patient record and handover.</p>';
  recordedStomas.forEach(function(state){
    var s=state.record;
    html+='<section class="wz-record-card"><h3>'+_esc(recordedStomaLabel(s))+'</h3>'+
      '<p><strong>Operation:</strong> '+_esc(s.operation||'Not recorded')+
      (s.operationDate?' · '+_esc(_fmtDate(s.operationDate)):'')+'</p>'+
      '<p class="'+(s.appliance?'':'wz-record-missing')+'"><strong>Appliance &amp; accessories:</strong> '+
      _esc(s.appliance||'No current appliance recorded — update the stoma record before discharge.')+'</p>';
    if(s.flangeDue)html+='<p><strong>Next flange change:</strong> '+_esc(_fmtDate(s.flangeDue))+'</p>';
    if((s.complications||[]).length)html+='<p><strong>Open complications:</strong> '+
      _esc(s.complications.map(recordedComplicationText).join('; '))+'</p>';
    var rod=recordedRodText(s.rod);
    if(rod)html+='<p><strong>'+_esc(rod)+'</strong></p>';
    html+='</section>';
  });
  if((dischargeRecord.unassignedComplications||[]).length)html+='<p><strong>Other recorded complications (stoma not specified):</strong> '+
    _esc(dischargeRecord.unassignedComplications.map(recordedComplicationText).join('; '))+'</p>';
  if(dischargeRecord.unassignedRod)html+='<p><strong>Rod (stoma not specified):</strong> '+_esc(recordedRodText(dischargeRecord.unassignedRod))+'</p>';
  return html;
}
function recordedAssessmentHTML(){
  var state=recordedStomas[recordAssessmentIndex],s=state.record,w=state.wizard;
  var tabs=recordedStomas.map(function(item,i){
    return '<button type="button" class="wz-record-tab'+(i===recordAssessmentIndex?' sel':'')+'" '+
      'aria-pressed="'+(i===recordAssessmentIndex)+'" onclick="recordSelectStoma('+i+')">'+
      _esc(recordedStomaLabel(item.record))+'</button>';
  }).join('');
  var html='<div class="wz-record-tabs">'+tabs+'</div><h3>'+_esc(recordedStomaLabel(s))+'</h3>'+
    '<p class="wz-cap">Complete the observations needed at discharge. Recorded complications, powder use and rod dates are included automatically.</p>';
  [['colour','Stoma colour','stomaColour','e.g. healthy, pink/red'],
   ['function','Stoma function','stomaFunction','e.g. functioning well'],
   ['skin','Peristomal skin','peristomalSkin','e.g. intact, or describe the skin']].forEach(function(field){
    html+='<div class="wz-field"><label for="record-'+field[0]+'">'+field[1]+'</label>'+
      '<input id="record-'+field[0]+'" value="'+_esc(w[field[2]])+'" placeholder="'+field[3]+'" '+
      'oninput="recordSetAssessment(\''+field[0]+'\',this.value)"></div>';
  });
  if(_mapStomaType(s.type)==='urostomy')html+='<div class="wz-field"><label for="record-stents">Urostomy stents in situ</label>'+
    '<select id="record-stents" onchange="recordSetAssessment(\'stents\',this.value)">'+
    '<option value=""'+(w.urostomyStents===''?' selected':'')+'>Confirm at discharge</option>'+
    '<option value="yes"'+(w.urostomyStents==='yes'?' selected':'')+'>Yes</option>'+
    '<option value="no"'+(w.urostomyStents==='no'?' selected':'')+'>No</option></select></div>';
  if(recordedStomas.length>1)html+='<p class="wz-cap">Use the stoma buttons above to complete each stoma’s assessment.</p>';
  return html;
}
function recordSelectStoma(index){
  if(!recordedStomas[index])return;
  recordAssessmentIndex=index;renderWizard();
}
function recordSetAssessment(field,value){
  var keys={colour:'stomaColour',function:'stomaFunction',skin:'peristomalSkin',stents:'urostomyStents'};
  if(keys[field]&&recordedStomas[recordAssessmentIndex])recordedStomas[recordAssessmentIndex].wizard[keys[field]]=value;
}
function recordedStomaPlan(state){
  var s=state.record,b;
  if(s.mucusFistula||!WZ.system){
    b=[planPhrase('common.wash'),s.mucusFistula?'Dressing care: [confirm instructions for the recorded dressing].':
      'Appliance care: [confirm instructions for the current appliance].'];
    if(WZ.accessories.indexOf('Stoma powder')>=0)b.push(planPhrase('acc.powder',{treatment:'protective powder'}));
    b=b.concat(automaticRodPlan());
  }else{
    b=buildPlan();
    if(WZ.type==='urostomy'&&!WZ.urostomyStents){
      var noStents=planPhrase(WZ.system==='two'?'two.uroNoStents':'one.uroNoStents');
      b=b.filter(function(text){return text!==noStents;});
      b.push('Urostomy stent status: [confirm at discharge].');
    }
  }
  // Powder use does not establish that the patient has skin excoriation. When
  // that diagnosis is absent, keep the standard instruction neutral; preserve
  // any application wording the clinic has explicitly customised.
  if(WZ.accessories.indexOf('Stoma powder')>=0&&
      !(s.complications||[]).some(function(c){return /excoriation|dermatitis/i.test(c.text||'');})&&
      PLAN_PHRASES['acc.powder']===DEFAULT_PLAN_PHRASES['acc.powder']){
    var powder=planPhrase('acc.powder',{treatment:'protective powder'});
    b=b.map(function(text){return text===powder?
      'Apply <strong>protective powder</strong> to the affected area as instructed and dust off the excess.':text;});
  }
  return b;
}
function applyRecordedLetter(){
  var body=[],plans=[];
  recordedStomas.forEach(function(state,index){
    withRecordedStoma(index,function(){
      var s=state.record,label=recordedStomaLabel(s),typeWord=s.mucusFistula?'mucus fistula':
        (subtypeLabel()||s.type||'stoma').toLowerCase();
      var procedure=WZ.procedure||'[procedure]';
      var vars={who:((WZ.title?WZ.title+' ':'')+WZ.sname).trim()||'[Patient]',
        pron:WZ.title==='Mr'?'He':_isFemaleTitle()?'She':'He/She',
        heShe:WZ.title==='Mr'?'he':_isFemaleTitle()?'she':'he/she',
        hisHer:WZ.title==='Mr'?'his':_isFemaleTitle()?'her':'his/her',
        procedure:procedure,type:typeWord,a:_an(typeWord),
        formation:/colostomy|ileostomy|urostomy|conduit|stoma|formation/i.test(procedure)?'':
          ' with formation of '+_an(typeWord)+' '+typeWord,
        date:_fmtDate(WZ.opdate)||'[date of operation]',consultant:WZ.consultant||'[consultant]',
        retracted:'',colour:WZ.stomaColour||'[stoma colour]',function:WZ.stomaFunction||'[function]',
        skin:WZ.peristomalSkin||'[peristomal skin]',mucoSep:'',rod:'',stents:'',teaching:''};
      var tpl=bodyTemplateFor(WZ.type),defaults=DEFAULT_BODY_TEMPLATES[WZ.type]||DEFAULT_BODY_TEMPLATES.colostomy;
      // Keep customised discharge wording; standard teaching is written once.
      var discharge=tpl.discharge===defaults.discharge?tpl.discharge.split(' During hospitalisation')[0]:tpl.discharge;
      body.push('<p class="record-stoma-title"><strong>'+_esc(label)+'</strong></p>',
        '<p>'+fillBodyTemplate(tpl.opening,vars)+'</p>',
        '<p>'+fillBodyTemplate(discharge,vars)+'</p>');
      if(s.findings)body.push('<p><strong>Operation findings:</strong> '+_esc(s.findings)+'</p>');
      if((s.complications||[]).length)body.push('<p><strong>Recorded complications:</strong> '+
        _esc(s.complications.map(recordedComplicationText).join('; '))+'</p>');
      body.push('<p>Patient discharged with <strong>'+_esc(s.appliance||'[current appliance not recorded]')+'</strong>.</p>');
      if(recordedRodText(s.rod))body.push('<p>'+_esc(recordedRodText(s.rod))+'</p>');
      plans.push({heading:label,bullets:recordedStomaPlan(state)});
    });
  });
  if((dischargeRecord.unassignedComplications||[]).length)body.push('<p><strong>Other recorded complications (stoma not specified):</strong> '+
    _esc(dischargeRecord.unassignedComplications.map(recordedComplicationText).join('; '))+'</p>');
  if(dischargeRecord.unassignedRod)body.push('<p><strong>Rod (stoma not specified):</strong> '+_esc(recordedRodText(dischargeRecord.unassignedRod))+'</p>');
  if(WZ.teaching==='yes')body.push('<p>A teaching session has been carried out with '+_esc(_teachingWithPhrase())+'.</p>');
  else if(WZ.teaching==='no')body.push('<p>No teaching session was carried out.</p>');
  else body.push('<p>Teaching session: [confirm at discharge].</p>');
  document.querySelector('.body').innerHTML=body.join('');
  var ul=document.getElementById('planList');ul.innerHTML='';
  plans.forEach(function(plan){
    var title=document.createElement('li');title.className='record-plan-title';
    title.innerHTML='<strong>'+_esc(plan.heading)+'</strong>';ul.appendChild(title);
    plan.bullets.forEach(function(text){var li=document.createElement('li');li.innerHTML=text;ul.appendChild(li);});
  });
  ['title','fname','sname','id'].forEach(function(key){
    var sel={title:'.fld-title',fname:'.fld-fname',sname:'.fld-sname',id:'.fld-id'}[key];
    document.querySelector(sel).value=WZ[key];
  });
  autosizePatientFlds();lastAutoPlan=planText();updateRibbon();
}
function clearRecordedLetter(){
  var token=new URLSearchParams(location.search).get('record');
  if(token){try{sessionStorage.removeItem('stoma-discharge:'+token);}catch(e){}}
  if(token){var url=new URL(location.href);url.searchParams.delete('record');history.replaceState(null,'',url.href);}
  dischargeRecord=null;recordedStomas=[];recordAssessmentIndex=0;recordLoadError='';
  document.querySelectorAll('.toolbar .actions > button').forEach(function(button){button.disabled=false;});
}
