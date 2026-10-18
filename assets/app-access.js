/* Record foreground access and real interactions, never unattended heartbeats. */
window.ClinicAccess=(()=>{
  let client=null,owner=null,lastSent=0,pending=false,epoch=0;
  async function touch(){
    if(!client||!owner||document.visibilityState==='hidden'||pending)return;
    const now=Date.now();
    if(lastSent&&now-lastSent<60000)return;
    const current=epoch,connection=client;
    pending=true;lastSent=now;
    try{
      const {error}=await connection.rpc('record_clinic_app_access');
      if(error)throw error;
    }catch(error){if(current===epoch){lastSent=0;console.warn('App access recording unavailable; will retry on next activity.');}}
    finally{if(current===epoch)pending=false;}
  }
  function stop(){epoch++;client=null;owner=null;lastSent=0;pending=false;}
  function start(connection,userId){stop();client=connection;owner=userId;return touch();}
  for(const type of ['pointerdown','keydown','scroll']){
    document.addEventListener(type,event=>{if(event.isTrusted)touch();},{passive:true,capture:true});
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')touch();});
  window.addEventListener('focus',touch);
  window.addEventListener('online',touch);
  return {start,stop,touch};
})();
