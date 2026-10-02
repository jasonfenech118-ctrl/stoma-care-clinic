/*
 * Downloads the current Malta and Gozo local-council flags used by the clinic
 * map.  The mapping deliberately leaves Paola out: the Commons gallery marks
 * its current flag as copyrighted and no licensed current replacement was
 * available when this feature was added.
 *
 * Run from the repository root:
 *   node tools/fetch-locality-flags.mjs
 * To resume a rate-limited transfer in a small group:
 *   node tools/fetch-locality-flags.mjs <start-index> <count>
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUTPUT=resolve(ROOT,'assets/locality-flags');
const COMMONS_API='https://commons.wikimedia.org/w/api.php';
const execFileAsync=promisify(execFile);

// The display names match LOCALITIES_DEFAULT and MALTA_MAP in index.html.
const FLAGS=[
  ['Attard','Flag_of_Attard.svg'],
  ['Balzan','Flag_of_Balzan.svg'],
  ['Birgu (Vittoriosa)','Flag_of_Birgu.svg'],
  ['Birkirkara','Flag_of_Birkirkara.svg'],
  ['Birżebbuġa','Flag of Birżebbuġa.svg'],
  ['Bormla (Cospicua)','Flag_of_Cospicua_(Bormla).svg'],
  ['Dingli','Flag_of_Dingli.svg'],
  ['Fgura','Flag_of_Il-Fgura.svg'],
  ['Floriana','Flag_of_Floriana.svg'],
  ['Fontana','Flag of Fontana.svg'],
  ['Għajnsielem','Għajnsielem Malta flag.svg'],
  ['Għarb','Flag of Gharb.svg'],
  ['Għargħur','Flag_of_Għargħur.svg'],
  ['Għasri','Flag of Għasri.svg'],
  ['Għaxaq','Flag_of_Għaxaq.svg'],
  ['Gudja','Flag_of_Gudja.svg'],
  ['Gżira','Flag_of_Gżira.svg'],
  ['Ħamrun','Hamrun.svg'],
  ['Iklin','Flag of Iklin.svg'],
  ['Isla (Senglea)','Flag of Isla.svg'],
  ['Kalkara','Flag of Kalkara (2009-).svg'],
  ['Kerċem','Flag of Kercem.svg'],
  ['Kirkop','Flag of Kirkop.svg'],
  ['Lija','Flag of Lija.svg'],
  ['Luqa','Luqa.svg'],
  ['Marsa','Flag of Marsa.svg'],
  ['Marsaskala','Flag of Marsaskala.svg'],
  ['Marsaxlokk','Flag of Marsaxlokk.svg'],
  ['Mdina','Flag of Mdina, Malta.svg'],
  ['Mellieħa','MelliehaHTML.svg'],
  ['Mġarr','Flag of Mġarr.svg'],
  ['Mosta','Flag of Mosta.svg'],
  ['Mqabba','Mqabba.svg'],
  ['Msida','Msida.svg'],
  ['Mtarfa','Flag of Mtarfa.svg'],
  ['Munxar','Flag of Munxar.svg'],
  ['Nadur','Flag of Nadur.svg'],
  ['Naxxar','Flag of Naxxar.svg'],
  ['Pembroke','Flag of Pembroke.svg'],
  ['Pietà','Flag of Pietà.svg'],
  ['Qala','Flag of Qala.svg'],
  ['Qormi','Flag of Qormi.svg'],
  ['Qrendi','Flag of Qrendi.svg'],
  ['Rabat','Rabat Malta flag.svg'],
  ['Safi','Flag of Safi.svg'],
  ['San Ġiljan (St Julian\'s)','Flag of San Ġiljan.svg'],
  ['San Ġwann','Flag of San Ġwann.svg'],
  ['San Lawrenz','Flag of San Lawrenz.svg'],
  ['San Pawl il-Baħar (St Paul\'s Bay)','Flag of Saint Paul\'s Bay.svg'],
  ['Sannat','Flag of Sannat.svg'],
  ['Santa Luċija','Flag of Santa Lucija.svg'],
  ['Santa Venera','Flag of Santa Venera.svg'],
  ['Siġġiewi','Flag of Siġġiewi.svg'],
  ['Sliema','Flag of Sliema.svg'],
  ['Swieqi','Flag of Swieqi.svg'],
  ['Ta\' Xbiex','Flag of Ta\' Xbiex.svg'],
  ['Tarxien','Flag of Tarxien.svg'],
  ['Valletta','Flag of Valletta, Malta.svg'],
  ['Victoria (Rabat, Gozo)','Flag of Victoria, Gozo.svg'],
  ['Xagħra','Flag of Xaghra.svg'],
  ['Xewkija','Flag of Xewkija, Malta.svg'],
  ['Xgħajra','Flag of Xghajra.svg'],
  ['Żabbar','Zabbar.svg'],
  ['Żebbuġ (Gozo)','Flag of Żebbuġ, Gozo.svg'],
  ['Żebbuġ (Malta)','Flag of Zebbug, Malta.svg'],
  ['Żejtun','Flag of Żejtun.svg'],
  ['Żurrieq','Zurrieq.svg']
];

function localFileName(name){
  return name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[ħĦ]/g,m=>m==='ħ'?'h':'H')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.svg';
}

function fetchCommonsJson(url){
  const text=execFileSync('curl',[
    '-L','--fail','--silent','--show-error','--retry','4','--retry-delay','2',
    '-A','StomaCareClinic locality flag updater',url.toString()
  ],{encoding:'utf8'});
  return JSON.parse(text);
}

function originalUrls(fileTitles){
  const url=new URL(COMMONS_API);
  url.searchParams.set('action','query');
  url.searchParams.set('format','json');
  url.searchParams.set('prop','imageinfo');
  url.searchParams.set('iiprop','url');
  // Commons accepts up to 50 titles per request. Batching avoids repeatedly
  // asking its API for what is, in effect, a small static catalogue.
  url.searchParams.set('titles',fileTitles.map(title=>'File:'+title).join('|'));
  // curl is used here rather than fetch because the clinic's deployment
  // environment supplies its proxy settings through curl.
  const json=fetchCommonsJson(url);
  const canonical=new Map((json.query?.normalized||[]).map(row=>[
    String(row.from||'').replace(/^File:/,''),String(row.to||'').replace(/^File:/,'')
  ]));
  const byCanonicalTitle=new Map();
  for(const page of Object.values(json.query?.pages||{})){
    const title=String(page?.title||'').replace(/^File:/,'');
    const mediaUrl=page?.imageinfo?.[0]?.url;
    if(title&&mediaUrl)byCanonicalTitle.set(title,mediaUrl);
  }
  const urls=new Map();
  for(const title of fileTitles){
    const mediaUrl=byCanonicalTitle.get(canonical.get(title)||title);
    if(mediaUrl)urls.set(title,mediaUrl);
  }
  return urls;
}
async function fileExists(path){try{await access(path);return true;}catch{return false;}}

async function downloadFlag(locality,title,source){
  const fileName=localFileName(locality);
  const outputPath=resolve(OUTPUT,fileName);
  if(await fileExists(outputPath)){
    process.stdout.write(`Kept ${locality}\n`);
    return {locality,title,fileName,sourcePage:`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replaceAll(' ','_'))}`};
  }
  const {stdout:bytes}=await execFileAsync('curl',[
    '-L','--fail','--silent','--show-error','--retry','1','--retry-delay','2',
    '--connect-timeout','10','--max-time','25',
    '-A','StomaCareClinic locality flag updater',source
  ],{encoding:'buffer',maxBuffer:10*1024*1024});
  await writeFile(outputPath,bytes);
  process.stdout.write(`Downloaded ${locality}\n`);
  return {locality,title,fileName,sourcePage:`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replaceAll(' ','_'))}`};
}
async function runPool(items,maxWorkers,work){
  const output=[];let next=0;
  const worker=async()=>{while(next<items.length){const item=items[next++];output.push(await work(item));}};
  await Promise.all(Array.from({length:Math.min(maxWorkers,items.length)},worker));
  return output;
}
async function main(){
  await mkdir(OUTPUT,{recursive:true});
  const start=Number.parseInt(process.argv[2]||'0',10);
  const count=Number.parseInt(process.argv[3]||String(FLAGS.length),10);
  if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1)throw new Error('Use non-negative start index and a positive count.');
  const selected=FLAGS.slice(start,start+count);
  if(!selected.length)throw new Error('The requested flag range is empty.');
  const urls=new Map();
  for(let i=0;i<selected.length;i+=50){
    for(const [title,url] of originalUrls(selected.slice(i,i+50).map(([,title])=>title)))urls.set(title,url);
  }
  const sources=await runPool(selected,2,async([locality,title])=>{
    const source=urls.get(title);
    if(!source)throw new Error(`No original media URL returned for ${title}`);
    return downloadFlag(locality,title,source);
  });
  sources.sort((a,b)=>a.locality.localeCompare(b.locality));
  if(selected.length!==FLAGS.length){
    process.stdout.write(`\nSaved ${sources.length} flags from this batch.\n`);
    return;
  }
  /*
   * Keep a compact machine-readable provenance manifest beside the files. The
   * interface links to these source pages as well.
   */
  await writeFile(resolve(OUTPUT,'sources.json'),JSON.stringify(sources,null,2)+'\n');
  process.stdout.write(`\nSaved ${sources.length} flags to assets/locality-flags/.\n`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
