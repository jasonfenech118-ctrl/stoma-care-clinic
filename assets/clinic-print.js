/* Shared print chrome. Document content and clinical signatures stay with their source. */
(function(w){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cssString=s=>'"'+String(s??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n\f]/g,' ')+'"';
  function metadata(extra={}){
    const generated=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Malta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    return {generated,preparedBy:w.ClinicWorkspace?.state?.user?.name||'',...extra};
  }
  const styles=`.cp-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0d7377;padding:0 0 9px;margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;color:#18354d;break-inside:avoid}.cp-brand{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}.cp-title{font-size:18px;font-weight:700;line-height:1.3}.cp-subtitle,.cp-date{font-size:11px;line-height:1.5;color:#415768}.cp-date{font-weight:700;text-align:right}.cp-patient{font-size:15px;font-weight:700;margin:10px 0;padding:8px 0;border-bottom:1px solid #dce5ec}.cp-footer{font:9px/1.5 Arial,Helvetica,sans-serif;color:#415768;border-top:1px solid #b9c7d1;padding-top:5px;margin-top:12px;display:flex;justify-content:space-between;gap:12px;break-inside:avoid}.cp-signature{font:10px/1.8 Arial,Helvetica,sans-serif;margin-top:10px;color:#233b4d;break-inside:avoid}.cp-signature span{display:inline-block;min-width:140px;border-bottom:1px solid #536777;margin-left:5px}table thead{display:table-header-group}@media print{.cp-header,.cp-footer{break-inside:avoid}}`;
  function headerHTML(title,opt={}){
    return `<header class="cp-header"><div><div class="cp-brand">Mater Dei Hospital · Stoma Care Clinic</div><div class="cp-title">${esc(title)}</div>${opt.subTitle?`<div class="cp-subtitle">${esc(opt.subTitle)}</div>`:''}</div>${opt.documentDate?`<div class="cp-date">${esc(opt.documentDate)}</div>`:''}</header>${opt.patientName||opt.patientId?`<div class="cp-patient">${esc(opt.patientName)}${opt.patientId?` · ID: ${esc(opt.patientId)}`:''}</div>`:''}`;
  }
  function footerHTML(opt={}){
    const m=metadata(opt);
    return `${opt.signature?'<div class="cp-signature">Handover accepted by<span>&nbsp;</span> &nbsp; Signature<span>&nbsp;</span></div>':''}<footer class="cp-footer"><span>Generated ${esc(m.generated)} · Malta time${m.preparedBy?' · Prepared by '+esc(m.preparedBy):''}</span><span>${esc(m.pageLabel||'')}</span></footer>`;
  }
  function pageCSS(opt={}){
    const m=metadata(opt);
    return styles+`@page{@bottom-left{content:${cssString('Stoma Care Clinic · Generated '+m.generated+' · Malta time')};font:7pt Arial;color:#415768}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:7pt Arial;color:#415768}}`;
  }
  function decorateDocument(doc,opt={}){
    if(!doc?.body||doc.querySelector('[data-clinic-print]'))return;
    const style=doc.createElement('style');style.dataset.clinicPrint='1';style.textContent=pageCSS(opt);doc.head.appendChild(style);
    // A supplied clinic header (attendance) already carries the document title.
    if(!doc.querySelector('.cp-header')){
      const title=opt.title||doc.title||'Clinic document';
      const old=doc.body.querySelector('h1');
      if(old&&opt.replaceHeading!==false)old.remove();
      doc.body.insertAdjacentHTML('afterbegin',headerHTML(title,opt));
    }
    doc.body.insertAdjacentHTML('beforeend',footerHTML(opt));
  }
  function stampPdf(pdf,opt={}){
    const m=metadata(opt),k=pdf.internal.scaleFactor||1;
    const total=pdf.internal.getNumberOfPages();
    const label='Stoma Care Clinic · Generated '+m.generated+' · Malta time'+(m.preparedBy?' · '+m.preparedBy:'');
    for(let page=1;page<=total;page++){
      pdf.setPage(page);
      const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
      pdf.setDrawColor(185,199,209);pdf.setLineWidth(.5/k);pdf.line(16/k,height-25/k,width-16/k,height-25/k);
      pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.setTextColor(65,87,104);
      const number='Page '+page+' of '+total,available=width-36/k-pdf.getTextWidth(number);
      let text=label;while(text.length>8&&pdf.getTextWidth(text)>available)text=text.slice(0,-1);
      if(text!==label)text=text.slice(0,-1)+'…';
      pdf.text(text,16/k,height-13/k);pdf.text(number,width-16/k,height-13/k,{align:'right'});
    }
    return pdf;
  }
  function addRasterPages(pdf,canvas){
    // Slice into the printable area, reserving the footer on every page.
    const k=pdf.internal.scaleFactor||1,M=16/k,bottom=34/k;
    const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight(),imageWidth=width-2*M;
    const pxPerUnit=canvas.width/imageWidth,pagePixels=Math.floor((height-M-bottom)*pxPerUnit);
    for(let top=0,page=0;top<canvas.height;top+=pagePixels,page++){
      if(page)pdf.addPage();
      const slice=w.document.createElement('canvas');slice.width=canvas.width;slice.height=Math.min(pagePixels,canvas.height-top);
      slice.getContext('2d').drawImage(canvas,0,top,canvas.width,slice.height,0,0,canvas.width,slice.height);
      pdf.addImage(slice.toDataURL('image/jpeg',.95),'JPEG',M,M,imageWidth,slice.height/pxPerUnit);
    }
    return pdf;
  }
  w.ClinicPrint={metadata,styles,headerHTML,footerHTML,pageCSS,decorateDocument,stampPdf,addRasterPages};
})(window);
