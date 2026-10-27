/* The clinic UI can be reused inside either fixed, same-origin phone app.
   Installation belongs to the top-level document, never a changing SPA tab. */
window.ClinicPhone=(()=>{
  const root=new URL('../',document.currentScript.src);
  const apps=['quick-look','surgical-rotation'];
  function host(app){
    try{
      const owner=window.parent;
      if(owner!==window&&owner.location.origin===location.origin&&owner.ClinicInstall?.app===app)return owner.ClinicInstall;
    }catch(e){}
    return null;
  }
  function enter(app,replace=false){
    if(!apps.includes(app))return false;
    if(host(app))return true;
    const target=new URL(app+'/',root).href;
    let destination=window;
    try{if(apps.some(id=>host(id)))destination=window.parent;}catch(e){}
    if(replace)destination.location.replace(target);else destination.location.assign(target);
    return false;
  }
  function install(app){
    const owner=host(app);
    // This synchronous call retains the click's activation in the ancestor.
    if(owner)return owner.install();
    enter(app);
  }
  function phoneLayout(){
    const owner=host('surgical-rotation');
    try{return !!owner&&(owner.standalone()||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||matchMedia('(max-width:720px)').matches);}catch(e){return !!owner;}
  }
  const params=new URLSearchParams(location.search);
  const framed=apps.find(app=>params.get('phoneFrame')===app&&host(app));
  if(!framed){
    // A Quick Look hash wins over a stale Surgical Rotation query parameter.
    const legacy=/^#(lookup|phone)$/.test(location.hash)?'quick-look':
      (params.get('view')==='surgical-rotation'||location.hash==='#surgical-rotation'?'surgical-rotation':null);
    if(legacy)enter(legacy,true);
  }else if(framed==='surgical-rotation'&&phoneLayout()){
    document.addEventListener('DOMContentLoaded',()=>document.body.classList.add('sr-phone-only'));
  }
  return {host,enter,install,phoneLayout};
})();
