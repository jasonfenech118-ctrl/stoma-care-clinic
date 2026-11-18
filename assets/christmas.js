/* Seasonal Christmas theme: on from 15 November to 6 January, off the rest of
   the year. Runs in <head> so the page paints themed straight away. */
(function(){
  function inSeason(d){d=d||new Date();var m=d.getMonth()+1,day=d.getDate();return (m===11&&day>=15)||m===12||(m===1&&day<=6);}
  window.isChristmasSeason=inSeason;
  if(inSeason())document.documentElement.classList.add('xmas');
})();
