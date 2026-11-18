/* Seasonal Christmas theme: on from 15 November to 6 January, off the rest of
   the year. Runs in <head> so the page paints themed straight away. */
(function(){
  function inSeason(d){d=d||new Date();var m=d.getMonth()+1,day=d.getDate();return (m===11&&day>=15)||m===12||(m===1&&day<=6);}
  window.isChristmasSeason=inSeason;
  if(!inSeason())return;
  document.documentElement.classList.add('xmas');
  // The folder this script was loaded from, so the corner images resolve on any page.
  var src=(document.currentScript&&document.currentScript.src)||'';
  var dir=src?src.replace(/[^/]*$/,''):'assets/';
  // Corner decorations: candy canes hanging under the top bar, an elf peeking up
  // bottom-left and a pile of sweets bottom-right. Decorative only — they never
  // take clicks (pointer-events:none) and are hidden when printing.
  function addCorners(){
    if(document.getElementById('xmas-corners'))return;
    var wrap=document.createElement('div');wrap.id='xmas-corners';wrap.setAttribute('aria-hidden','true');
    [['xc-cane xc-tl','xmas-cane.svg'],['xc-cane xc-tr','xmas-cane.svg'],['xc-elf xc-bl','xmas-elf.svg'],['xc-candy xc-br','xmas-candy.svg']]
      .forEach(function(c){var i=document.createElement('img');i.className='xc '+c[0];i.src=dir+c[1]+'?v=1';i.alt='';wrap.appendChild(i);});
    document.body.appendChild(wrap);
  }
  if(document.body)addCorners();else document.addEventListener('DOMContentLoaded',addCorners);
})();
