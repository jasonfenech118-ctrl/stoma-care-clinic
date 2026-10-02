/* ===========================================================================
   USER MANUAL  ·  MDH Stoma Care Clinic
   In-app, colour-coded, searchable help. Lives in the app (GitHub), NOT in
   Supabase — it uses no database and no patient data.

   ┌─────────────────────────────────────────────────────────────────────┐
   │  KEEP THIS UPDATED.  Whenever a user-facing feature, button, page or │
   │  automation is added or changed anywhere in the app, update the      │
   │  matching page below (and the Automations catalogue) in the SAME     │
   │  change, and bump the "Updated" date in MANUAL_META. See CLAUDE.md.  │
   └─────────────────────────────────────────────────────────────────────┘
   =========================================================================== */
const MANUAL_META={updated:'2 October 2026 (SAMOC oncology wards added by full name — Adult Oncology 1/2, Haematology, Paediatric/Adolescent, Palliative Care, Radioisotope Unit — coloured violet, sorted after Mater Dei, with the centre name shown)'};

/* ---- small picture helpers (crisp, printable, in-HTML) ------------------- */
const MAN_TABS=[
  ['calendar','📅','Clinic Calendar','#7c3aed'],
  ['appointments','🕘','Appointments','#2980b9'],
  ['siting','📍','Siting','#7c3aed'],
  ['handover','🏥','Handover','#b45309'],
  ['patients','👥','Registry','#0891b2'],
  ['audit','📊','Audit & Reports','#c0392b']
];
/* A mini replica of the real top tab-bar, with one area lit up: "you are here". */
function manMap(activeKey){
  const cells=MAN_TABS.map(t=>{
    const on=t[0]===activeKey;
    const style=on?`background:${t[3]};`:'';
    return `<span class="man-tab${on?' on':''}" style="${style}">${t[1]} ${t[2]}</span>`;
  }).join('');
  return `<div class="man-map" aria-label="Where this lives in the app">${cells}</div>`;
}
/* A coloured chip that looks like the real button a step refers to. */
function manBtn(label,bg,fg){return `<span class="man-btn" style="background:${bg||'#eef0f3'};color:${fg||'#31474f'};">${label}</span>`;}
/* A left-to-right flow of boxes joined by arrows. Pass ['Box', '→', 'Box', …]. */
function manFlow(parts){
  return `<div class="man-flow">${parts.map(p=>p==='→'
    ? '<span class="man-arrow">→</span>'
    : (p.startsWith('~')?`<span class="man-node soft">${p.slice(1)}</span>`:`<span class="man-node">${p}</span>`)).join('')}</div>`;
}
function manWhen(t){return `<div class="man-when"><span>💡</span><div><b>When to use it:</b> ${t}</div></div>`;}
function manSteps(items){return `<ol class="man-steps">${items.map(i=>`<li>${i}</li>`).join('')}</ol>`;}
function manNote(kind,ic,t){return `<div class="man-note ${kind}"><span class="man-note-ic">${ic}</span><div>${t}</div></div>`;}
function manH2(ic,t){return `<div class="man-h2">${ic?`<span>${ic}</span>`:''}${t}</div>`;}

/* ---- the manual content -------------------------------------------------- */
const MANUAL_SECTIONS=[
{id:'start',title:'Getting Started',icon:'🚀',color:'#0d7377',blurb:'Sign in, find your way around, print, and use this manual.',pages:[
  {id:'basics',title:'Finding your way around',keywords:'login sign in navigation tabs menu home start version build refresh help button bell',html:`
    ${manNote('tip','❓','Open this manual any time from the <b>❓ button next to the 🔔 bell</b>, top-right. It opens beside your work — read a step, do it, read the next.')}
    ${manNote('tip','🔔','Top-right you also have the <b>📝 button</b> (add a to-do or dated reminder) and the <b>🔔 bell</b> (every reminder, in tabs with counts). Both carry a number when something needs attention.')}
    ${manWhen('Your first time in the app, or when you cannot find a page.')}
    ${manH2('🧭','The six work areas')}
    <p class="man-lede">The tabs along the top run in the order the day is worked, and <b>each area has its own colour</b> — the name is written in that colour and the open area is underlined in it, so you always know where you are. Tap an area to open it, then use the row of <b>sub-tabs</b> underneath to reach each page.</p>
    ${manSteps([
      `${manBtn('📅 Clinic Calendar','#efe7fb','#6d28d9')} <b>(violet)</b> — the roster, daily attendance and change of duty.`,
      `${manBtn('🕘 Appointments','#e6effd','#1d4ed8')} <b>(blue)</b> — the daily clinic list and follow-up planning.`,
      `${manBtn('📍 Siting','#e0f3f7','#0b6b7a')} <b>(cyan)</b> — pre-operative stoma siting.`,
      `${manBtn('🏥 Handover','#fdece0','#c2410c')} <b>(orange)</b> — the inpatient ward sheet.`,
      `${manBtn('👥 Registry','#e3f6ea','#15803d')} <b>(green)</b> — every patient and their record.`,
      `${manBtn('📊 Audit & Reports','#fdeaea','#b91c1c')} <b>(red)</b> — the numbers, charts and annual report.`
    ])}
    ${manNote('tip','📌','On a phone, tap the menu button (top-left) to open the same list as a drawer.')}
    ${manH2('🔢','Which version am I on?')}
    <p class="man-lede">A small grey pill next to <b>MDH Stoma Care Clinic</b> shows the build, e.g. <span class="man-kbd">v2026.09.29-336</span>. If a new feature is missing, do a hard refresh: <span class="man-kbd">Ctrl</span>+<span class="man-kbd">Shift</span>+<span class="man-kbd">R</span> (on a phone, pull down to refresh).</p>
  `},
  {id:'usingmanual',title:'Using this manual (split screen)',keywords:'help search find how to question mark manual guide split screen side panel dock beside open close help button',html:`
    ${manWhen('Any time you are unsure how to do something — keep it open beside your work.')}
    ${manH2('🪟','It opens beside the app, not over it')}
    <p class="man-lede">The manual opens as a <b>side panel</b>, so the page you are working on stays open next to it. Read a step, do it on the app, read the next — you never have to remember it all.</p>
    ${manSteps([
      `Open it from the ${manBtn('❓','#0d7377','#fff')} <b>button next to the 🔔 bell</b> at the top-right of every screen. Tap it again to close.`,
      `Type what you want in the <b>search box</b> at the top — e.g. <i>"add a patient"</i>, <i>"discharge to Gozo"</i>, <i>"flange due"</i> — and pick the page.`,
      `Or tap a <b>coloured section</b> to browse. Each section is the same colour as its area in the app.`,
      `Use the panel’s top buttons: <b>☰</b> all sections · <b>⇔</b> make it wider/narrower · <b>✕</b> close.`
    ])}
    ${manNote('tip','🔎','On a computer the panel sits to the right and the app shifts across so nothing is hidden. On a phone it opens full-screen — close it to go back to your work.')}
    ${manNote('tip','📌','The whole manual is inside the app, so it always matches the version you are using. There is nothing to download.')}
  `}
]},

{id:'registry',title:'Registry & Patients',icon:'👥',color:'#16a34a',blurb:'Add patients, open records, record operations, find duplicates.',pages:[
  {id:'add',title:'Add a new patient',keywords:'add patient new register demographics id card create',html:`
    ${manMap('patients')}
    ${manWhen('A patient is new to the stoma service and is not yet on the system.')}
    ${manSteps([
      `Open ${manBtn('👥 Registry','#e0f2f5','#0b6b7a')} → ${manBtn('➕ Add Patient','#e7f7ef','#1c8f5f')}.`,
      `Complete the <b>Patient</b> page — name, ID card, sex, date of birth, locality, phone and consultant/firm.`,
      `Press <b>Next</b> for the first stoma’s page. Enter its type, location, surgery date, date of discharge, and operation and findings.`,
      `Press <b>Save</b>. The patient now appears in the Registry and a stoma code (<span class="man-kbd">STO-…</span>) is created for them automatically.`
    ])}
    ${manNote('auto','⚙️','You do not type a stoma code — the app generates <b>STO-…</b> for each stoma and <b>EP-…</b> for each admission automatically.')}
  `},
  {id:'record',title:'Open a patient record',keywords:'open patient record registry search find overview name surname prominent identity ID card number badge mobile stomas outcome reversal closure button appointments episodes edit input missing stoma details patient demographics unlock save single card golden title appliance history discharge current closed colours purple black blue teal missing date sex gender male female pink tint background colour coded locality flag',html:`
    ${manMap('patients')}
    ${manWhen('To view or change anything about one patient.')}
    ${manSteps([
      `Open ${manBtn('👥 Registry','#e0f2f5','#0b6b7a')} → ${manBtn('👥 Patient Registry','#e0f2f5','#0b6b7a')} and search by name or ID card.`,
      `Tap the patient to open their record. It has tabs: <b>Overview</b>, <b>Stomas &amp; operation</b>, <b>Outcome</b>, <b>Appointments</b> and <b>Episodes</b>.`,
      `The top of every record tab shows the patient's <b>name and surname beside their ID card number</b> in one row. The ID has a compact dark badge with consistent text and spacing. These appear once in the header; <b>Patient details</b> starts with date of birth and telephone. There is no separate <b>Sex</b> field — the whole record is tinted by sex instead (see below). Long names wrap within their space, and an absent ID is shown as <b>Not recorded</b>.`,
      `Use <b>Edit patient</b> to open patient details. Press ${manBtn('Input / edit stoma details','#fff6d8','#7a4b00')} to open the present stoma, or start the new-stoma form when none is present. When no stoma type has been recorded, this is the main action; you can go straight to the stoma without re-entering demographics.`,
      `In <b>Stomas &amp; operation</b>, each stoma appears once, on its own card with a bold golden title, stoma code, surgery date, discharge date and operation and findings. Select the card heading to edit that stoma. Tabs inside the stoma form take you directly to another stoma.`,
      `The latest recorded appliances and accessories sit underneath that stoma's details. Expand <b>Appliance history</b> for its dated ward and clinic changes. Use <b>Current</b> or <b>Closed</b> to view the relevant stomas when there is more than one.`
    ])}
    <p class="man-lede">When stoma details are missing, <b>Save patient details</b> appears only after you change a demographic field or press <b>Unlock to correct</b>. Saving from an appointment still offers <b>Save &amp; return to appointment</b>.</p>
    ${manH2('🗂','What each tab holds')}
    <ul class="man-ul">
      <li><b>Overview</b> — demographics, follow-up status and owner, contact.</li>
      <li><b>Stomas &amp; operation</b> — one card per stoma, with its code, operation and dates, and its own appliances &amp; accessories and history. Older appliance entries whose stoma cannot be identified are kept under <b>Other appliance history</b>. Also the upcoming-surgery date for existing patients.</li>
      <li><b>Outcome</b> — the follow-up outcome (active, reversed, deceased, relocated overseas, discharged to Gozo …). Under <b>Change the outcome</b>, press <b>Reversal / closure</b> to record the operation on the affected stoma. The buttons match the table: <b>purple</b> for reversal / closure, <b>black</b> for deceased, <b>blue</b> for Gozo and <b>teal</b> for overseas. The current outcome keeps its colour; an amber outline and <b>add date</b> label show a missing date.</li>
      <li><b>Appointments</b> — this patient's clinic appointments.</li>
      <li><b>Episodes</b> — their inpatient admissions.</li>
    </ul>
    ${manH2('🎨','Colour tells you the sex at a glance')}
    <p class="man-lede">The whole patient record is <b>colour-coded by sex</b> so you can tell it apart at a glance without reading a field:</p>
    <ul class="man-ul">
      <li>${manBtn('Male','#dbeafe','#1d4ed8')} — a <b>blue</b> wash across the page, cards and avatar.</li>
      <li>${manBtn('Female','#fbcfe8','#be185d')} — a <b>pink</b> wash across the page, cards and avatar.</li>
    </ul>
    ${manNote('tip','📍','The <b>Locality</b> sits in its own prominent green row in Patient details, with the local council flag (or a neat initials marker when a town has no flag on file).')}
  `},
  {id:'operation',title:'Record a new stoma, refashioning or reversal',keywords:'operation new stoma refashioning refashion reversal closure outcome revert status undo deceased gozo overseas undated button supersede record surgery confirm yes no cancel date unknown comments replacement',html:`
    ${manMap('patients')}
    ${manWhen('The patient had a stoma operation — a new stoma, a refashioning, or a reversal/closure.')}
    ${manSteps([
      `Open the patient → <b>Stomas &amp; operation</b>.`,
      `Open the individual stoma form. Its golden heading shows the stoma type; tabs above it let you switch between this patient's stomas.`,
      `Choose <b>Closed / reversed</b> to reveal the closure date; <b>Refashioned</b> → <b>Yes</b> to review the confirmation and open a new stoma ID with the same, fixed type; or <b>Add new stoma</b> to choose a new type.`,
      `For a new stoma or refashioning, enter the surgery date, discharge date if known, and operation and findings, then review and save. A reversal needs the selected stoma and its closure date only.`
    ])}
    <p class="man-lede">The individual stoma form has no separate <b>Comments</b> field or same-site replacement question. Previously saved notes and replacement links remain in the record.</p>
    ${manH2('↩','Reversal from the Outcome tab')}
    ${manSteps([
      `Open the patient → <b>Outcome</b> → ${manBtn('↩ Reversal / closure','#6d28d9','#ede9fe')} under <b>Change the outcome</b>. This button is available when a stoma is present.`,
      `Check the patient's name and ID card in the inline confirmation. Press <b>Yes</b> to enter the closure details, or <b>No, leave it</b> to leave the record unchanged.`,
      `Choose the stoma that was reversed or closed. Enter its reversal / closure date, or select <b>Date not known</b>.`,
      `Check the selected stoma and details, then press <b>OK</b> to save. <b>Cancel</b> leaves the record unchanged. The selected stoma's history is retained; any other present stomas remain present.`
    ])}
    ${manH2('↺','Revert an outcome')}
    ${manSteps([
      `Open <b>Outcome</b> and press <b>Revert status</b>. This is available for any outcome other than Active, including a status with no date on file.`,
      `Read the confirmation, including the resulting outcome. For Reversed, it names the stoma or stomas from the latest closure that will be reopened; earlier closures and superseded stomas remain in the history.`,
      `Press <b>Yes, revert</b> to save directly, or <b>No, leave it</b> to cancel. No date, operation or findings need to be re-entered. Other outcome dates are retained; the resulting outcome follows the remaining record.`
    ])}
    <p class="man-lede">On an individual closed stoma, <b>Undo closed / reversed selection</b> also asks for confirmation; press <b>Save this stoma</b> to save the correction. If another user changes the record before saving, reopen it to review their change.</p>
    ${manNote('auto','⚙️','A <b>refashioning automatically supersedes</b> the stoma it replaced — the old stoma stays as an old case. The refashioned stoma gets its own ID; choose a new appliance for that ID in handover.')}
    ${manNote('auto','⚙️','Recording a <b>reversal</b> clears any planned reversal date and updates the follow-up status; a fully-reversed patient then drops off the handover by itself.')}
  `},
  {id:'surgerydate',title:'Add an upcoming surgery date',keywords:'upcoming surgery date existing patient handover expected coming in operation planned',html:`
    ${manMap('patients')}
    ${manWhen('An existing stoma patient is coming in for an operation and you want the ward to expect them.')}
    ${manSteps([
      `Open the patient → <b>Stomas &amp; operation</b>. Under <b>Upcoming surgery</b> press ${manBtn('＋ Add surgery date','#e7f7ef','#1c8f5f')}.`,
      `Pick the operation date and save.`
    ])}
    ${manNote('auto','⚙️','From that date the patient rides at the <b>top of the Handover, highlighted</b>, so the ward is expecting them. The date <b>clears itself</b> once they are admitted.')}
    ${manNote('tip','ℹ️','For a brand-new patient with no stoma yet, use <b>Siting</b> instead — the button there is "Add siting session".')}
  `},
  {id:'duplicates',title:'Needs Checking (duplicates)',keywords:'duplicate needs checking merge same patient twice name swapped',html:`
    ${manMap('patients')}
    ${manWhen('To catch the same patient entered twice.')}
    ${manSteps([
      `Open ${manBtn('👥 Registry','#e0f2f5','#0b6b7a')} → ${manBtn('🔍 Needs Checking','#fbeccd','#9a6410')}.`,
      `Review each flagged pair and merge or correct as needed.`
    ])}
    ${manNote('auto','⚙️','The app flags likely duplicates for you, including <b>name-order-swapped</b> ones (surname/first name entered the wrong way round).')}
  `},
  {id:'quicklook',title:'Quick Look & New Patients',keywords:'quick look phone lookup new patients recent',html:`
    ${manMap('patients')}
    ${manSteps([
      `${manBtn('📱 Quick Look','#e7e6fb','#3a34a0')} — a fast phone-friendly lookup to check a patient at the bedside.`,
      `${manBtn('🆕 New Patients','#e7f7ef','#1c8f5f')} — patients recently added, so nothing is missed.`
    ])}
  `}
]},

{id:'appointments',title:'Appointments & Visits',icon:'🕘',color:'#2563eb',blurb:'Book clinics, record outcomes, complete a visit, plan follow-ups.',pages:[
  {id:'daily',title:'The daily clinic list',keywords:'appointments daily clinic book appointment schedule slot',html:`
    ${manMap('appointments')}
    ${manWhen('To see and manage today’s clinic.')}
    ${manSteps([
      `Open ${manBtn('🕘 Appointments','#e6f0f8','#22608f')} → ${manBtn('🕘 Daily Clinic','#e6f0f8','#22608f')}.`,
      `Book a slot for a patient, and record what happened from each row.`
    ])}
  `},
  {id:'outcome',title:'Record a visit outcome',keywords:'outcome seen did not turn up dntu cancelled attended visit complete',html:`
    ${manMap('appointments')}
    ${manWhen('A booked appointment has happened (or not).')}
    ${manH2('🔘','The four outcomes')}
    <ul class="man-ul">
      <li><b>Seen</b> — the patient attended; complete the visit (next page).</li>
      <li><b>Did not turn up (DNTU)</b> — they missed it.</li>
      <li><b>Cancelled by patient</b> / <b>Cancelled by clinic</b> — record which.</li>
    </ul>
    ${manNote('auto','⚙️','<b>Three did-not-turn-ups in a row automatically pause</b> the patient’s follow-up. The visit summary shows the streak as "Did not turn up — 2 of 3".')}
  `},
  {id:'complete',title:'Complete a visit (Seen)',keywords:'complete visit seen stepper attendance complications appliances follow up review nurse owner',html:`
    ${manMap('appointments')}
    ${manWhen('The patient attended and you are writing the visit up.')}
    ${manFlow(['Attendance','→','Clinical','→','Appliances','→','Follow-up','→','Review'])}
    ${manSteps([
      `Choose <b>Seen</b> on the appointment. The visit opens as a step-by-step form.`,
      `<b>Attendance</b> — confirm date, time and outcome, and set the <b>Nurse owner</b> (shown as a gold badge).`,
      `<b>Clinical</b> — record complications if any.`,
      `<b>Appliances &amp; accessories</b> — set what is in use (per stoma).`,
      `<b>Follow-up</b> — choose the next follow-up owner and due month.`,
      `<b>Review</b> — check the summary (it shows the last follow-up date and outcome) and save.`
    ])}
    ${manNote('auto','🩹','The Review’s <b>Appliance &amp; accessories</b> card shows the patient’s <b>current appliance</b> — never "None recorded" when one is on file. If you changed it during the visit it reads <b>Before …</b> / <b>Modified to …</b> so the change is clear at a glance.')}
    ${manNote('auto','⚙️','The next <b>follow-up due month is worked out for you</b>, and the patient is added to the booking worklist. Booking an appointment on/after their due date takes them off it automatically.')}
  `},
  {id:'planning',title:'Follow-up Planning',keywords:'follow up planning due months booking worklist owner overdue awaiting booking my patients add patient saved appliances details assignment selected nurse month appointment alphabetical first name surname print scroll scrollbar keyboard last follow up history see follow-up history previous follow-ups booked appointments rebook add patient my patients all users duplicate already on list ID card prominent same name matching names colour color',html:`
    ${manMap('appointments')}
    ${manWhen('To see who is due and book them in.')}
    ${manSteps([
      `Open ${manBtn('🕘 Appointments','#e6f0f8','#22608f')} → ${manBtn('🔁 Follow-up Planning','#e0f2f0','#0b6b6b')}.`,
      `Work the <b>booking worklist</b> — patients due or overdue with no appointment yet — from the top down.`,
      `Filter by <b>owner</b> to see one nurse’s caseload, then choose the year and month.`,
      `Scroll the <b>Due this month</b> patient column with its own right-hand scrollbar, mouse wheel or a vertical swipe. Its heading and the calendar stay in view. You can also focus the list and use the arrow keys or Page Up / Page Down. Your place in the list is kept when selecting a patient or opening a calendar day; choosing a different nurse, month or list starts at the top.`,
      `Each patient card shows their <b>last follow-up appointment date and outcome</b> in place of the surgery date; <b>Print patient list</b> shows the same information. Click the card or the patient’s name to open their full follow-up history and current booking status.`,
      `The <b>ID card number</b> has its own large, bold badge beneath the name. If patients in the current list share both a first name and surname but have different ID card numbers, their cards use subtly different backgrounds and show <b>Same name — check ID card</b>. This also applies to <b>Flexible &amp; DNTU</b>. Selecting a card keeps the usual selection highlight.`,
      `Each card has a ${manBtn('🗂 See follow-up history','#edf1f5','#12304f')} button that opens the patient’s <b>previous follow-ups</b> and, separately, any <b>booked appointments</b>, with a <b>Rebook</b> button. To book, drag the patient onto an available day or slot, or open their follow-up history and press <b>Rebook</b>.`,
      `In <b>My patients</b> (available to every user), press <b>Add patient</b>, enter the ID card and press <b>Find</b>. Check the patient, then press <b>Add to list</b>. Saved appliances from ward and clinic records appear automatically; no stoma choice, appliance selection or complication review is required to assign the patient. If that patient is <b>already on the list</b> for this nurse &amp; month — or already showing in <b>Due this month</b> — they are <b>not added again</b> and a message says so. If instead they are <b>already due in another month</b> or <b>already have a booked appointment</b>, the form shows an amber <b>already due … / already booked …</b> notice and asks you to confirm before moving their due month, so you never book a patient earlier than planned by mistake.`,
      `Saving a patient in <b>My patients</b> assigns the selected nurse and due month. The patient appears in <b>Due this month</b> when they have no upcoming booked appointment.`
    ])}
    ${manNote('tip','ℹ️','Adding a patient to this list uses their existing record and creates no appointment or new clinical entry. Their saved appliances, accessories, complications and clinical status stay on record. To change clinical details, press <b>Patient record</b> beside the patient on your list.')}
    ${manNote('auto','🔤','The <b>Due this month</b> patient list is sorted A–Z by the displayed name (first name, then surname), ignoring capitalisation and accents. <b>Print patient list</b> uses the same order.')}
    ${manNote('auto','⚙️','The booking workspace omits patients with any upcoming booked appointment, including a booking for a different month or nurse. Cancelled appointments, completed visits and past bookings do not hide someone needing a new appointment.')}
  `},
  {id:'history',title:'Follow-up history & bookings',keywords:'follow up history patient card past visits last appointment booked appointments awaiting appointment upcoming nurse outcome appliances accessories',html:`
    ${manMap('appointments')}
    ${manWhen('To review previous follow-ups and check whether another appointment is booked.')}
    ${manSteps([
      `Click a patient card or name in <b>Due this month</b>, or use a <b>History</b> button elsewhere in the app.`,
      `<b>Booked appointments</b> lists upcoming bookings separately, with dates, times and the nurse or clinic column. If there is no upcoming booking, this section shows <b>Awaiting appointment</b>.`,
      `<b>Follow-up history</b> lists earlier appointment records, including Seen, DNTU and cancellations, with recorded appliances and accessories.`,
      `Use <b>Edit</b> beside an appointment or <b>Rebook Patient</b> to arrange the next appointment.`
    ])}
  `}
]},

{id:'siting',title:'Stoma Siting',icon:'📍',color:'#0891b2',blurb:'Pre-operative siting for patients who do not have a stoma yet.',pages:[
  {id:'book',title:'Book a siting session',keywords:'siting session pre operative mark site book new patient before surgery',html:`
    ${manMap('siting')}
    ${manWhen('A patient (often not yet on the registry) needs their stoma site marked before surgery.')}
    ${manSteps([
      `Open ${manBtn('📍 Siting','#efe7fb','#5b3aa8')} → ${manBtn('📍 Siting Session','#efe7fb','#5b3aa8')} → ${manBtn('＋ Book siting session','#e7f7ef','#1c8f5f')}.`,
      `Enter the patient, the firm/consultant, what they are sited for and the planned surgery date.`,
      `On the day, mark the site and complete the assessment (you can add a photograph).`
    ])}
    ${manNote('auto','⚙️','When the planned <b>surgery day arrives</b>, the sited patient appears at the top of the Handover as <b>"Awaiting surgery"</b> automatically — nobody has to add them.')}
  `},
  {id:'performed',title:'Performed & No-stoma outcomes',keywords:'performed stoma no stomas performed siting outcome result operation done',html:`
    ${manMap('siting')}
    ${manSteps([
      `From the Handover’s awaiting-surgery row, press <b>Stoma performed</b> to carry the patient into the registry as an inpatient, or <b>No stoma performed</b> to file them under ${manBtn('📋 No Stomas Performed','#efe7fb','#5b3aa8')}.`,
      `${manBtn('🩺 Performed Stoma','#efe7fb','#5b3aa8')} lists siting patients whose stoma went ahead.`
    ])}
  `}
]},

{id:'handover',title:'Handover (Ward)',icon:'🏥',color:'#ea580c',blurb:'The inpatient ward sheet: appliances, dates, complications, discharges.',pages:[
  {id:'sheet',title:'Reading the handover sheet',keywords:'handover ward inpatient sheet appliance notes latest Lentell duplicate closed stoma legacy links flange due rod loop stoma end ileostomy end colostomy urostomy removal date removed discharge letter complications button infection cre vre chip urgency reminders schedule 5 permit bell green yellow orange red daily colour foyer block level floor walking order samoc oncology mamo hospital sort',html:`
    ${manMap('handover')}
    ${manWhen('Walking the ward, or preparing the printed sheet.')}
    ${manH2('🎨','Ward colours and the walking order')}
    <p class="man-lede">Type the <b>ward</b> (it is forced to CAPITALS) and the cell takes the <b>colour of that ward's foyer / block</b> — Orange, Red, Brown, Yellow, Green and Blue foyers, Blocks A, B and C each their own colour, so the sheet reads like the colour plan on the wall. The rows then <b>sort in walking order</b>: across the foyers left-to-right, then each foyer's <b>floors from the top down</b>, then by bed number.</p>
    ${manNote('auto','🏥','<b>SAMOC — the Sir Anthony Mamo Oncology Centre</b> (across the road from Mater Dei) is included as its own hospital, in its own violet colour, listed <b>after all the Mater Dei wards</b>, with the full centre name shown beneath the ward. Its wards are recognised by their <b>full names</b>: Adult Oncology Ward 1, Adult Oncology Ward 2, Haematology Ward, Paediatric / Adolescent Ward, Palliative Care Ward and Radioisotope Unit (and anything you type starting SAMOC / SAMOK).')}
    ${manH2('📋','What each part of the Appliance + notes cell means')}
    <ul class="man-ul">
      <li><b>Appliance line</b> — only the latest appliance &amp; accessories for each present stoma (e.g. "Colo: Lentell 100mm"). Older unlinked entries and appliances belonging to closed stomas remain in history and do not appear beside the current selection.</li>
      <li><b>Notes</b> — free text you can type straight onto the sheet.</li>
      <li><b>Flange due</b> chip — colours by urgency; overdue turns red.</li>
      <li><b>Schedule V permit</b> — “Left in ward” records today's date and starts green. The handover colour changes every calendar day through yellow and orange, red on day six and dark red from day seven. The saved Left in ward date controls the colour and days waiting. “Signed” or “Collected” clears the waiting warning.</li>
      <li><b>⚠️ Complication line</b> — open complications, named, with the latest trend.</li>
      <li><b>⚠️ Complications / ROD</b> button — one button opens the full complication timeline and, where a rod applies, the rod's removal date. The rod is <b>not</b> a separate line on the sheet any more — it lives behind this button. The label reads <b>Complications/ROD</b> only while a rod is relevant and not yet recorded; it reads just <b>Complications</b> for an <b>end ileostomy, end colostomy or urostomy</b> (which never have a rod) and once a rod has already been recorded, so you are not asked about it again on a later admission with the same stoma.</li>
    </ul>
    ${manNote('auto','⚙️','A rod only exists under a <b>loop</b> (or transverse) ileostomy/colostomy. Once you record a rod it stops being offered here; the bell still chases its removal and the printed ward sheet still shows "rod due" until it is out.')}
    ${manNote('auto','⚙️','A note carrying <b>CRE, VRE or "+ve"</b> turns the whole cell <b>bright red</b> so an infection alert can never be missed.')}
    ${manNote('auto','⚙️','"Awaiting first review" means an appliance has not been set yet — tap the cell to set it. An appliance set before the stoma is even on the registry is kept and shown, and follows the stoma once it is recorded.')}
    ${manNote('auto','⚙️','The handover is shared by all nurses. Saved appliance changes update other open handovers automatically. It also checks every 30 seconds and when you return to the page. Updates wait while you are typing or using a form. If the current appliances cannot be loaded, the sheet shows a message so an older appliance is not presented as current.')}
  `},
  {id:'reminders',title:'Ward reminders in the bell',keywords:'bell schedule 5 permit left in ward signed collected five days sixth day flange change due today overdue two piece handover green yellow orange dark red daily colour tabs ward siting reversals tasks category count missed nothing',html:`
    <p class="man-lede">The shared bell checks the dates already recorded on the handover and patient record. It does not assign these to a person.</p>
    ${manH2('🗂','Tabs so nothing is missed')}
    <p class="man-lede">Open the <b>🔔 bell</b> and every reminder is split into tabs, each with its own <b>count</b> so you can see at a glance what is waiting without scrolling past anything. A tab turns <b>red</b> when it holds something due today or overdue.</p>
    ${manSteps([
      `${manBtn('🏥 Ward','#eef2f6','#12304f')} — rod removals, flange changes and overdue Schedule V permits.`,
      `${manBtn('📍 Siting','#eef2f6','#12304f')} — surgery-day, siting assessments and patients with no surgery date yet.`,
      `${manBtn('🔄 Reversals','#eef2f6','#12304f')} — reversal surgery that has come round.`,
      `${manBtn('☑ Tasks','#eef2f6','#12304f')} — your free-text pending tasks and dated reminders (view and tick them off here).`
    ])}
    ${manNote('tip','🔴','The bell opens on the first tab that has something <b>due today or overdue</b>, so the most pressing list shows first. The number on the bell is the total still to action.')}
    ${manH2('📝','Adding a to-do or dated reminder')}
    <p class="man-lede">Use the <b>📝 button next to the bell</b> to add things — it opens a small panel with two boxes:</p>
    ${manSteps([
      `<b>Pending task</b> — type anything that is outstanding and press <b>Add</b>. It stays until someone ticks it off (and remains until the next day so it is not lost).`,
      `<b>Reminder with a date</b> — type the reminder, pick a date and press <b>Add</b>. It becomes <b>due</b> on that date and shows <b>Overdue</b> after it.`
    ])}
    ${manNote('auto','🔔','Anything you add here appears in the 🔔 bell under <b>☑ Tasks</b>, and the due ones are counted on both the 📝 button and the bell — so the input is separate but nothing is hidden.')}
    <ol class="man-steps">
      <li>Mark a Schedule V permit <b>Left in ward</b> on the handover. Its button starts green and changes shade daily, using only the recorded Left in ward date. The overdue bell reminder appears on day six in red, then dark red from day seven. It can remain after discharge.</li>
      <li>Tap <b>Open permit</b> in the bell to set the actual status. <b>Signed</b> or <b>Collected</b> clears the reminder. Without a recorded left date, the app cannot count the days and does not guess.</li>
      <li>For a two-piece appliance, choose the next flange-change date in the appliance form. Saving it updates the <b>Flange due</b> chip and the bell together. You can also edit the date directly on the handover. The bell shows it on the due date and while overdue, naming the current stoma where recorded. <b>Open handover</b> goes to that editable date.</li>
      <li>Update or clear the flange date when it changes. The alert also clears when a one-piece replaces the two-piece, the patient leaves the handover, or that stoma is reversed or superseded.</li>
    </ol>
    ${manNote('auto','📋','The day the permit is left is <b>day 0 (green)</b>. Then: <b>day 1 light green</b>, <b>day 2 yellow-green</b>, <b>day 3 yellow</b>, <b>day 4 amber</b>, <b>day 5 orange</b>, <b>day 6 red</b>, and <b>day 7 onwards dark red</b>. The colour updates automatically when the calendar day changes; the number of days waiting remains visible.')}
  `},
  {id:'setappliance',title:'Set an appliance from the ward',keywords:'set appliance handover wizard one piece two piece flange bag accessory stoma',html:`
    ${manMap('handover')}
    ${manWhen('Recording what a patient is wearing, at the bedside.')}
    ${manSteps([
      `On the patient’s row, tap the <b>appliance cell</b> (the blue text or "Awaiting first review").`,
      `Choose the stoma, then the appliance system and the items. Set a flange-due date for a two-piece.`,
      `Save — the latest selection for that stoma replaces the previous selection on the handover at once. The selected flange date updates the handover and bell together. With several current flanges, the shared chip uses the earliest recorded due date. A date edited on the handover is kept when reopening a sole flange’s appliance form. An older two-piece system does not remain beside a new one-piece system. Older stoma links are recognised too, so a closed stoma’s Lentell does not appear as a second current appliance.`
    ])}
    ${manNote('auto','⚙️','What you set is written against the stoma and the current admission, so it lands in the stoma’s history — not only on the ward note.')}
  `},
  {id:'awaiting',title:'Awaiting surgery / reversal / upcoming surgery',keywords:'awaiting surgery reversal upcoming highlighted top handover expecting expected coming in',html:`
    ${manMap('handover')}
    ${manWhen('Understanding the highlighted rows at the top of the sheet.')}
    <ul class="man-ul">
      <li><b>Awaiting surgery</b> (amber) — a sited patient whose surgery day has come.</li>
      <li><b>Awaiting reversal</b> (blue) — a patient whose planned reversal date has come.</li>
      <li><b>Surgery</b> (violet) — an existing stoma patient with an upcoming-surgery date that has arrived.</li>
    </ul>
    ${manNote('auto','⚙️','All three appear <b>automatically</b> on the day, and drop off once you record the outcome or admit the patient.')}
  `},
  {id:'discharge',title:'Discharge a patient from the handover',keywords:'discharge handover postop old case overseas gozo relocated abroad off ward date automatic',html:`
    ${manMap('handover')}
    ${manWhen('A patient is leaving the ward.')}
    ${manH2('🔘','The four discharge buttons')}
    <ul class="man-ul">
      <li>${manBtn('Postop discharge','#fdecea','#c0392b')} — normal post-op discharge home; they join the Postop Discharges list for follow-up booking.</li>
      <li>${manBtn('Discharge (old case)','#eef0f3','#4b5563')} — off the ward, but not counted as a post-op discharge.</li>
      <li>${manBtn('Relocated overseas','#fef9c3','#713f12')} — patient left the country; sets the status.</li>
      <li>${manBtn('Discharged to Gozo','#dbeafe','#1e3a8a')} — patient moved to Gozo; sets the status.</li>
    </ul>
    ${manNote('auto','⚙️','Every discharge <b>fills the date automatically</b> (today): Postop stamps the post-op discharge date on the operation; Overseas/Gozo stamp today as the outcome date and the status effective date. All of them close the inpatient episode and take the patient off the handover.')}
  `},
  {id:'postop',title:'Postop Discharges & Archived Handover',keywords:'postop discharges worklist booking archived snapshot 4pm print pdf',html:`
    ${manMap('handover')}
    <ul class="man-ul">
      <li>${manBtn('📤 Postop Discharges','#fdf0e1','#b45309')} — everyone discharged post-op who still needs a follow-up booked. A patient leaves this list once you book them, or once they are recorded as overseas / Gozo / deceased.</li>
      <li>${manBtn('📸 Archived Handover','#fdf0e1','#b45309')} — a read-only picture of the handover.</li>
    </ul>
    ${manNote('auto','⚙️','The handover is <b>archived automatically at 4&nbsp;pm every day</b>, and kept for reference. You can also press "Capture now".')}
  `},
  {id:'print',title:'Print the handover',keywords:'print handover pdf ward sheet paper letter a4 complications infection cre vre +ve positive isolation',html:`
    ${manMap('handover')}
    ${manSteps([
      `On the Handover page press <b>Print / PDF</b>.`,
      `The whole ward list is fitted onto one A4 landscape sheet, with the ward-block shading and the legend (DL = discharge letter, S5 = Schedule 5 permit).`
    ])}
    ${manNote('auto','⚙️','A patient who is <b>+ve with anything</b> (CRE, VRE, OXA 48 +ve …) prints with the marker <b>bold, red and underlined</b> and a red bar on the cell, so the infection shows on the ward copy — even on a black-and-white printer.')}
    ${manNote('auto','⚙️','Open <b>complications also print</b> with the appliance line, in bold, labelled "Complication:". The flange-due and rod-due notes are bolded too.')}
  `}
]},

{id:'letter',title:'Discharge Letter',icon:'✉️',color:'#4338ca',blurb:'Generate the stoma discharge letter, pre-filled from the record.',pages:[
  {id:'generate',title:'Create a discharge letter',keywords:'discharge letter print pdf appliance one piece two piece pre filled care plan consultant multiple stomas ileostomy colostomy urostomy powder complications rod removal teaching',html:`
    ${manWhen('A patient is going home and needs their stoma discharge letter.')}
    ${manSteps([
      `Open the patient and press <b>Discharge letter</b> (available for inpatients).`,
      `Review the saved details. <b>Every current stoma</b> has its own heading, operation and date, latest appliance and accessories, open complications and care plan. Closed or superseded stomas remain in the patient history.`,
      `On <b>Discharge assessment</b>, use the stoma buttons to complete each stoma’s colour, function and peristomal skin. Confirm urostomy stents if applicable. Missing observations remain clearly marked until completed.`,
      `Complete <b>Teaching session</b>, press <b>Finish</b>, then check the letter and <b>Save / Print</b> or export to Word. The recorded-patient wizard has three pages: review, discharge assessment and teaching.`
    ])}
    ${manNote('auto','⚙️','The letter uses the <b>latest saved selection for each stoma</b>, even when different stomas were last updated on different days. Stoma powder and other accessories are carried across automatically. Open complications include their latest recorded note; complications not linked to a particular stoma appear separately. A cleared selection stays cleared.')}
    ${manNote('auto','⚙️','Rod status and dates come from the saved handover record. While in situ, its removal-due date is included; once marked removed, its removal date is included and in-situ care instructions stop. There is <b>no rod, complication, accessory or appliance selection page</b> to repeat when opening a recorded patient’s letter. If a current appliance is missing, update the stoma record and reopen the letter.')}
    ${manNote('tip','ℹ️','The general Discharge letters tab still offers the manual wizard for a standalone letter. Letters opened from a patient use a fresh snapshot; reopen after changing that patient’s recorded details.')}
  `}
]},

{id:'calendar',title:'Roster & Attendance',icon:'📅',color:'#7c3aed',blurb:'Monthly roster, daily attendance and change of duty.',pages:[
  {id:'roster',title:'Monthly Roster & Change of Duty',keywords:'roster monthly rota shift change of duty cod staff schedule',html:`
    ${manMap('calendar')}
    <ul class="man-ul">
      <li>${manBtn('🗓 Monthly Roster','#efe7fb','#5b3aa8')} — the staff rota for the month.</li>
      <li>${manBtn('🔄 Change of Duty','#fbe6d8','#a4610f')} — record a swap of duty between staff.</li>
    </ul>
  `},
  {id:'attendance',title:'Daily Attendance & Records',keywords:'daily attendance sign in present records history',html:`
    ${manMap('calendar')}
    <ul class="man-ul">
      <li>${manBtn('✅ Daily Attendance','#e0f2f0','#0b6b6b')} — mark who is in today.</li>
      <li>${manBtn('📚 Attendance Records','#e2eefb','#155e9c')} — look back over attendance.</li>
    </ul>
  `}
]},

{id:'audit',title:'Audit & Reports',icon:'📊',color:'#dc2626',blurb:'The numbers: charts, annual report, map, audits, DNTU policy.',pages:[
  {id:'reports',title:'Reports, Charts & Annual Report',keywords:'reports charts annual report metrics numbers statistics compare formation reversals month closure dates report year cohort deaths gozo sitings admissions totals',html:`
    ${manMap('audit')}
    <ul class="man-ul">
      <li>${manBtn('📊 Reports & Charts','#e3e8f1','#1a2e4a')} — headline charts (follow-up due months, booked vs available, and more).</li>
      <li>${manBtn('📄 Annual Report','#e2eefb','#155e9c')} — the yearly figures: stoma formations &amp; reversals by month, discharges, deaths. Tap a number to see the exact patients behind it.</li>
      <li>${manBtn('📈 Data Analysis','#efe7fb','#5b3aa8')} — deeper breakdowns.</li>
    </ul>
    ${manNote('tip','ℹ️','The <b>Reversals</b> tile under <b>Sitings &amp; surgery</b> counts stomas formed during the selected report year and reversed during the selected period. For example, a stoma formed in July and reversed in September counts in September. The tile, comparison chart and patient list use the same dates. The <b>Stoma formation and reversals by month</b> table also includes reversals of stomas formed in earlier years, so it can have a larger total.')}
    ${manNote('tip','ℹ️','The <b>Deaths</b> and <b>Discharged to Gozo</b> tiles use patients operated on during the selected <b>year</b>, then count the death or discharge in the selected <b>month</b>. Surgery can have taken place earlier in that year. <b>Stoma Performed</b> uses the recorded surgery date; older sitings without that date use the siting date. The patient list identifies that fallback.')}
    ${manNote('tip','ℹ️','<b>Data Analysis</b> includes dated outcomes from all operation years. It counts every recorded reversal date across the patient’s stomas, once per patient per date, and counts deaths only when a death outcome is recorded. Refashioning itself is not a formation or reversal; a later recorded closure of that stoma is a reversal. Events without dates cannot be placed in a year. <b>New Cases</b> counts patients by their first surgery date; <b>Stomas Formed</b> counts individual new stomas, so these totals may differ.')}
    ${manNote('auto','⚙️','Opening an activity total starts on the <b>selected year and month</b>. Sitings and operations with no stoma formed stay in the record list even before registry entry. Clinic activity excludes old appliance-only administrative placeholders. Failed reads show unavailable figures or an error, rather than a false zero. <b>Total Patients</b> is the current registry size, not a historical monthly total; unique patients are counted once across the whole selected period.')}
  `},
  {id:'more',title:'Map, Clinic Audit, OT Audit, DNTU',keywords:'map locality clinic audit ot audit overtime dntu policy did not turn up',html:`
    ${manMap('audit')}
    <ul class="man-ul">
      <li>${manBtn('🗺 Map','#e0f2f0','#0b6b6b')} — where patients live, by locality.</li>
      <li>${manBtn('🧾 Clinic Audit','#fdeceb','#c0392b')} / ${manBtn('⏱ OT Audit','#fcf3d7','#8a6a1a')} — clinic and theatre audits.</li>
      <li>${manBtn('🚫 DNTU','#efe6fb','#5b21a8')} — the did-not-turn-up policy and paused patients.</li>
    </ul>
  `}
]},

{id:'auto',title:'⚙️ Automations — what the app does for you',icon:'⚙️',color:'#e6a817',blurb:'Everything that happens automatically, in one place.',pages:[
  {id:'catalogue',title:'Full automations catalogue',keywords:'automation automatic auto does for you refashion supersede appliance discharge letter rod present removed removal date wizard dntu pause reversal reminder snapshot 4pm follow up due booking worklist infection',html:`
    ${manWhen('To understand what the app handles on its own — so staff can trust it and not double-enter.')}
    <p class="man-lede">These run without anyone pressing a special button. Each card says where you will see it.</p>
    <div class="man-auto-grid">
      ${[
        ['🏥','Handover archived at 4 pm','A read-only snapshot of the ward sheet is saved automatically every day and kept for reference.','Handover › Archived'],
        ['📤','Post-op discharge date','Discharging from the handover writes today onto the operation’s discharge date on the patient form.','Handover'],
        ['↻','Refashioning supersedes the old stoma','Recording a refashioning closes the stoma it replaced ("Superseded") and makes the new one current.','Registry › Stomas'],
        ['🧷','Refashioned stoma needs an appliance','A refashioning has a new stoma ID. Select the appliance for that ID in handover; the old appliance stays with the old stoma history.','Registry / Handover'],
        ['🔄','Latest handover appliance','All nurses see the saved appliance per present stoma. Other open handovers update automatically, with a check every 30 seconds and on returning to the page. Refreshes wait while you edit. Closed stomas and earlier selections remain in history.','Handover'],
        ['🆕','Unassigned appliance is kept','An appliance set before the stoma is on the registry still shows on the handover, and attaches to the stoma once it is recorded.','Handover'],
        ['🌍','Overseas / Gozo discharge dates','These buttons set the follow-up status and stamp today as the outcome date and effective date.','Handover'],
        ['🔪','Upcoming surgery shows up','An existing patient’s surgery date makes them appear (highlighted) at the top of the handover on the day; it clears when they are admitted.','Handover'],
        ['📍','Awaiting surgery / reversal','A sited patient (surgery day) or a planned reversal (reversal day) appears at the top of the handover automatically.','Handover'],
        ['↩','Closure keeps the stoma history','Saving reversal / closure closes only the selected stoma, retains its history and clears the planned reversal date. Other present stomas remain open; follow-up is updated from the remaining stomas.','Registry › Outcome'],
        ['↺','Outcome recalculated after reversion','After Yes, revert, the outcome is recalculated from the remaining record. Reverting Reversed reopens the latest closure and keeps earlier stoma history; other recorded outcome dates are retained.','Registry › Outcome'],
        ['🩹','Handover self-heal','A deceased or fully-reversed patient drops off the ward sheet on their own; someone with an open episode is pulled back if their flag drifts.','Handover'],
        ['🚫','3 DNTUs pause follow-up','Three did-not-turn-ups in a row automatically pause the patient’s follow-up; the streak shows as "N of 3".','Appointments'],
        ['📆','Follow-up due month','The next due month is worked out from the visit and the patient is placed on the booking worklist.','Appointments'],
        ['🔤','Alphabetical, scrollable due-month list','Due this month lists patients A–Z by the displayed name (first name, then surname), ignoring capitalisation and accents. The column has its own scrollbar and keeps your place when selecting a patient or opening a calendar day. The printed patient list keeps the same order.','Appointments › Follow-up Planning'],
        ['🪪','Matching names are distinguished','The booking lists show ID card numbers in a bold badge. Patients sharing both a first name and surname with different ID card numbers receive subtle background differences and a Same name — check ID card label. Capitalisation and extra spaces are ignored when matching; missing names or ID numbers are not treated as a match.','Appointments › Follow-up Planning'],
        ['✅','Booked patients leave the booking workspace','Due this month and Flexible & DNTU omit patients who already have an upcoming booked appointment, in any month or nurse column. Due-date reminders continue to check whether the booking covers the due month or following grace month.','Appointments'],
        ['⚠️','Infection alert','A note with CRE / VRE / "+ve" turns the whole appliance cell red.','Handover'],
        ['🔔','Dated reminders','Rod-removal-due and other dated reminders are raised on their day in the bell.','Everywhere'],
        ['📋','Schedule V waiting in the ward','From the saved Left in ward date, the handover colour changes daily from green through yellow and orange to red on day six, then dark red from day seven. The bell starts on day six. Signed or Collected clears it; missing dates are never guessed.','Bell › Handover'],
        ['🩹','Flange change due','Saving a two-piece appliance updates its next-change date on the handover and in the bell together. The bell shows it when due or overdue. Later handover date edits remain authoritative.','Bell › Handover'],
        ['✉️','Discharge letter for every stoma','Each current ileostomy, colostomy, urostomy or mucus fistula has its own section and care plan, with its latest appliance and accessories. Different update dates do not drop another stoma’s selection.','Discharge letter'],
        ['🩹','Discharge powder and complications','Recorded stoma powder and open complications, with their latest notes, enter the correct stoma’s discharge section automatically. Unassigned complications appear once in a separate section.','Discharge letter'],
        ['📅','Discharge rod details','Rod due-removal and removed dates come from handover. A removed rod stops in-situ care instructions; recorded-patient letters omit the rod questions.','Discharge letter'],
        ['🔍','Duplicate detection','Likely duplicate patients are flagged, including name-order-swapped ones.','Registry › Needs Checking'],
        ['🧮','Reconciled numbers','Activity totals, charts and record lists use the same dates; opening a total preserves its selected month, and incomplete reads are not shown as zero.','Audit & Reports'],
        ['🔖','Auto codes','Stoma codes (STO-…) and admission references (EP-…) are generated for you.','Registry']
      ].map(a=>`<div class="man-auto"><h4>${a[0]} ${a[1]}</h4><p>${a[2]}</p><span class="man-auto-where">${a[3]}</span></div>`).join('')}
    </div>
  `}
]},

{id:'glossary',title:'Glossary & Abbreviations',icon:'🔤',color:'#0369a1',blurb:'What the short codes on the screens and printouts mean.',pages:[
  {id:'terms',title:'Abbreviations used in the app',keywords:'glossary abbreviation meaning colo ileo uro mf dntu dl s5 rod flange sto ep quadrant rif lif',html:`
    <ul class="man-ul">
      <li><b>Colo / Ileo / Uro / MF</b> — Colostomy / Ileostomy / Urostomy / Mucus fistula (the ward shorthand).</li>
      <li><b>RIF / LIF / RUQ / LUQ / RLQ / LLQ</b> — abdominal quadrants, used to tell two stomas of the same type apart.</li>
      <li><b>DNTU</b> — Did Not Turn Up. Three in a row pause follow-up.</li>
      <li><b>DL</b> — Discharge letter. <b>S5</b> — Schedule 5 permit (the two mark columns on the printed handover).</li>
      <li><b>ROD</b> — the rod/bridge that supports a loop stoma; it has a removal-due date.</li>
      <li><b>Flange due</b> — when a two-piece flange is next due to be changed.</li>
      <li><b>STO-…</b> — a stoma’s unique code. <b>EP-…</b> — an inpatient admission reference.</li>
      <li><b>Superseded</b> — a stoma that was replaced by a refashioning; kept as history, no longer current.</li>
    </ul>
  `}
]}
];

/* ---- render + search ----------------------------------------------------- */
let manualState={sec:null,pg:null};

function manualAllPages(){
  const out=[];
  MANUAL_SECTIONS.forEach(s=>s.pages.forEach(p=>out.push({sec:s,pg:p})));
  return out;
}
function manualFindColor(secId){const s=MANUAL_SECTIONS.find(x=>x.id===secId);return s?s.color:'#0d7377';}

let MANUAL_HOST='manual-dock-body';
function renderManual(hostId){
  if(hostId)MANUAL_HOST=hostId;
  const host=document.getElementById(MANUAL_HOST);
  if(!host)return;
  const side=MANUAL_SECTIONS.map(s=>{
    const open=manualState.sec===s.id;
    const pages=s.pages.map(p=>{
      const active=open&&manualState.pg===p.id;
      return `<button class="man-pg-link${active?' active':''}" style="--sec:${s.color};"
        onclick="manualGo('${s.id}','${p.id}')">${htmlSafe(p.title)}</button>`;
    }).join('');
    return `<div class="man-sec${open?' open':''}" style="--sec:${s.color};--secbg:${manHexA(s.color,.12)};">
      <button class="man-sec-head" onclick="manualToggle('${s.id}')">
        <span class="man-sec-ic">${s.icon}</span><span>${htmlSafe(s.title)}</span>
        <span class="man-sec-cnt">${s.pages.length}</span>
      </button>
      <div class="man-sec-pages">${pages}</div></div>`;
  }).join('');
  host.innerHTML=`<div class="man-shell">
    <div class="man-searchbar">
      <input type="search" id="man-search" placeholder="Search the manual — e.g. add a patient, discharge to Gozo, flange due…"
        autocomplete="off" oninput="manualSearch(this.value)" onkeydown="manualSearchKey(event)"/>
      <div id="man-results" class="man-results" hidden></div>
    </div>
    <div class="man-wrap">
      <nav class="man-side" id="man-side">${side}</nav>
      <section class="man-main" id="man-main"></section>
    </div></div>`;
  manualRenderMain();
}
function manHexA(hex,a){const m=String(hex||'').match(/^#?([0-9a-fA-F]{6})$/);if(!m)return `rgba(13,115,119,${a})`;
  const n=parseInt(m[1],16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;}

function manualToggle(secId){
  const s=MANUAL_SECTIONS.find(x=>x.id===secId);
  if(manualState.sec===secId){manualState.sec=null;manualState.pg=null;}   // collapse
  else{manualState.sec=secId;manualState.pg=s&&s.pages[0]?s.pages[0].id:null;} // open + first page
  renderManual();
}
function manualGo(secId,pgId){manualState.sec=secId;manualState.pg=pgId;renderManual();
  const m=document.getElementById('man-main');if(m)m.scrollIntoView({block:'nearest'});}

function manualRenderMain(){
  const main=document.getElementById('man-main');
  if(!main)return;
  if(!manualState.sec||!manualState.pg){main.innerHTML=manualHome();return;}
  const s=MANUAL_SECTIONS.find(x=>x.id===manualState.sec);
  const p=s&&s.pages.find(x=>x.id===manualState.pg);
  if(!s||!p){main.innerHTML=manualHome();return;}
  main.style.setProperty('--man-accent',s.color);
  main.innerHTML=`<div class="man-crumb" style="color:${s.color};">${s.icon} ${htmlSafe(s.title)}</div>
    <h1 class="man-h1">${htmlSafe(p.title)}</h1>
    ${p.html}
    <div class="man-foot">MDH Stoma Care Clinic · User manual · updated ${htmlSafe(MANUAL_META.updated)}</div>`;
}
function manualHome(){
  const cards=MANUAL_SECTIONS.filter(s=>s.id!=='start').map(s=>`
    <div class="man-home-card" style="--sec:${s.color};" onclick="manualGo('${s.id}','${s.pages[0].id}')">
      <h3>${s.icon} ${htmlSafe(s.title)}</h3><p>${htmlSafe(s.blurb)}</p></div>`).join('');
  return `<div class="man-crumb">Welcome</div>
    <h1 class="man-h1">MDH Stoma Care — User Manual</h1>
    <p class="man-lede">Everything the app does, in plain steps. Use the <b>search box</b> above, or pick a section. Each page shows <b>where it lives</b> in the app, <b>when to use it</b>, the <b>steps</b>, and any <b>automation</b> done for you.</p>
    ${manNote('tip','👋','New here? Start with <b>Getting Started → Finding your way around</b> on the left.')}
    <div class="man-home-grid">${cards}</div>
    <div class="man-foot">This manual is part of the app (no Supabase space used) and updates with every change · updated ${htmlSafe(MANUAL_META.updated)}</div>`;
}

/* ---- docked split-screen: read the manual beside the live app ------------ */
function openManualDock(){
  document.body.classList.add('manual-docked');
  renderManual('manual-dock-body');
  setTimeout(()=>{const i=document.getElementById('man-search');if(i)try{i.focus();}catch(e){}},60);
}
function closeManualDock(){document.body.classList.remove('manual-docked');}
function toggleManualDock(){document.body.classList.contains('manual-docked')?closeManualDock():openManualDock();}
function manualDockHome(){manualState.sec=null;manualState.pg=null;renderManual('manual-dock-body');}
/* Cycle the panel width so a nurse can give the manual more or less room. */
function manualDockWiden(){
  const cur=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mdock-w'),10)||440;
  const next=cur<400?460:cur<560?640:cur<760?340:460;
  document.documentElement.style.setProperty('--mdock-w',next+'px');
}
let manualHiIndex=-1;
function manualSearch(q){
  const box=document.getElementById('man-results');
  if(!box)return;
  q=String(q||'').trim().toLowerCase();
  manualHiIndex=-1;
  if(q.length<2){box.hidden=true;box.innerHTML='';return;}
  const hits=manualAllPages().map(({sec,pg})=>{
    const hay=(pg.title+' '+(pg.keywords||'')+' '+sec.title).toLowerCase();
    let score=0;
    if(pg.title.toLowerCase().includes(q))score+=3;
    if(hay.includes(q))score+=1;
    q.split(/\s+/).forEach(w=>{if(w&&hay.includes(w))score+=1;});
    return {sec,pg,score};
  }).filter(h=>h.score>0).sort((a,b)=>b.score-a.score).slice(0,10);
  if(!hits.length){box.hidden=false;box.innerHTML='<div class="man-none">No page matches that. Try another word, or browse the sections on the left.</div>';return;}
  box.hidden=false;
  box.innerHTML=hits.map((h,i)=>`<button data-i="${i}" onclick="manualGo('${h.sec.id}','${h.pg.id}');manualCloseSearch()">
    <span class="man-r-sec" style="background:${h.sec.color};">${h.sec.icon} ${htmlSafe(h.sec.title)}</span>
    <span class="man-r-t">${htmlSafe(h.pg.title)}</span></button>`).join('');
}
function manualCloseSearch(){const box=document.getElementById('man-results');if(box){box.hidden=true;box.innerHTML='';}
  const inp=document.getElementById('man-search');if(inp)inp.value='';}
function manualSearchKey(e){
  const box=document.getElementById('man-results');
  if(!box||box.hidden)return;
  const btns=[...box.querySelectorAll('button')];
  if(!btns.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();manualHiIndex=Math.min(btns.length-1,manualHiIndex+1);}
  else if(e.key==='ArrowUp'){e.preventDefault();manualHiIndex=Math.max(0,manualHiIndex-1);}
  else if(e.key==='Enter'){e.preventDefault();(btns[manualHiIndex]||btns[0]).click();return;}
  else if(e.key==='Escape'){manualCloseSearch();return;}
  btns.forEach((b,i)=>b.classList.toggle('man-hi',i===manualHiIndex));
}
