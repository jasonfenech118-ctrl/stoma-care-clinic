/* Profile controls and a server-protected login audit. Never store passwords. */
window.ClinicAccount=(()=>{
  const JASON_ID='dd084e24-e851-4243-883d-f6404299585c';
  let user=null,offset=0,request=0;
  const $=id=>document.getElementById(id);
  const isJason=()=>user?.id===JASON_ID;
  function clear(){
    user=null;request++;offset=0;
    $('login-audit-button').hidden=true;
    $('login-audit-rows').replaceChildren();
    $('profile-form').reset();$('profile-email').textContent='';
    $('profile-status').textContent='';$('login-audit-status').textContent='';
    $('page-profile').classList.remove('active');$('page-login-audit').classList.remove('active');
  }
  async function sync(){
    clear();
    const {data,error}=await SB.auth.getUser();
    if(error||!data?.user)return;
    user=data.user;
    $('profile-email').textContent=user.email||'';
    $('profile-name').value=user.user_metadata?.full_name||'';
    $('login-audit-button').hidden=!isJason();
  }
  async function save(event){
    event.preventDefault();
    const button=$('profile-save'),status=$('profile-status');
    const password=$('profile-password').value,confirm=$('profile-confirm').value;
    status.textContent='';
    if(password!==confirm){status.textContent='The new passwords do not match.';return;}
    if(password&&password.length<8){status.textContent='Use at least 8 characters for your new password.';return;}
    button.disabled=true;
    try{
      const {data:verified,error:verifyError}=await SB.auth.getUser();
      if(verifyError||!verified?.user||verified.user.id!==user?.id)throw new Error('Please sign in again before updating your profile.');
      const changes={data:{full_name:$('profile-name').value.trim()}};
      if(password)changes.password=password;
      const {data,error}=await SB.auth.updateUser(changes);
      if(error)throw error;
      user=data.user;
      $('profile-password').value='';$('profile-confirm').value='';
      status.textContent=password?'Profile and password updated.':'Profile updated.';
    }catch(error){status.textContent=error.message||'Could not update your profile. Please try again.';}
    finally{button.disabled=false;}
  }
  async function audit(delta=0){
    if(!isJason())return;
    const token=++request,owner=user.id;
    offset=Math.max(0,offset+delta);
    const status=$('login-audit-status'),body=$('login-audit-rows');
    body.replaceChildren();status.textContent='Loading logins…';
    $('login-audit-prev').disabled=true;$('login-audit-next').disabled=true;
    try{
      const {data,error}=await SB.from('clinic_login_audit')
        .select('session_id,email,logged_in_at').order('logged_in_at',{ascending:false})
        .order('session_id',{ascending:false}).range(offset,offset+50);
      if(token!==request||user?.id!==owner||!isJason())return;
      if(error)throw error;
      const rows=data||[];
      for(const row of rows.slice(0,50)){
        const tr=document.createElement('tr');
        for(const text of [row.email,new Date(row.logged_in_at).toLocaleString('en-GB',{timeZone:'Europe/Malta',dateStyle:'medium',timeStyle:'medium'})]){
          const td=document.createElement('td');td.textContent=text;tr.append(td);
        }
        body.append(tr);
      }
      status.textContent=rows.length?`Showing ${offset+1}–${offset+Math.min(rows.length,50)}. Times shown in Malta time.`:'No successful logins recorded in this range.';
      $('login-audit-prev').disabled=offset===0;$('login-audit-next').disabled=rows.length<=50;
    }catch(error){if(token===request)status.textContent='Unable to load login audit. Please refresh and try again.';}
  }
  function openProfile(){ $('profile-password').value='';$('profile-confirm').value='';$('profile-status').textContent=''; }
  return {sync,clear,save,audit,isJason,openProfile};
})();
