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
const MANUAL_META={updated:'10 October 2026 (Daily Attendance clears a Present mark when the TIL In / overtime behind it is cancelled and removes cancelled bank / extra staff from the sheet; App-wide Review & restore from protected audit recovery, selected previous fields, later-change checks, related deleted records and signed correction versions; Seen / Complete visit appointments no longer ask about rods or require a rod removal date; rod management stays in Handover and previously saved visit rod details remain in history; Audit Trail automatically expires entries older than 90 days in a daily database cleanup, without deleting patient data or saved report versions; Deceased Registry groups by month or year of death, with month/year filters, individual/group/select-all checkboxes across pages, Save selected as HTML for selected records and photographs, and Minimise stored data in the registry, with summaries saved before photograph removal and retryable failures; Handover patient-row Edit / Save buttons removed — ward, bed and notes continue saving on change, rows stay editable and the phone Profile shortcut stays available; archive saving restored after the earlier mistaken removal; deceased patients can now be minimised to save space — the deceased Patient Registry has a Minimise stored data button that permanently removes only their stoma-siting photograph(s) to free Supabase space while keeping every other record (details, stomas, visits, encounters, appointments), saving a compact HTML summary of the whole profile first that stays openable with View saved summary, confirmed and written to the Audit Trail, needs sql/add-deceased-minimise.sql; a ready-made storage breakdown query, sql/storage-breakdown.sql, lists every table’s size and share of the database and how much of the 500 MB free tier is used; the daily Archived Handover is now saved as lightweight data — the sheet as its own HTML (a few KB), not a ~½ MB picture — so the archive barely uses Supabase space; it still opens and downloads as the full sheet, old picture days still open, needs sql/add-handover-snapshot-html.sql; the Patient Registry’s Surgery Date and Stoma Type columns now fall back to a patient’s stoma history when the top-level fields are blank, so a later / new stoma no longer reads “—”; the encounter’s Function/output and Peristomal skin pickers now close as soon as you choose one (reopen to add another); Community correspondence and Patient communication now save separate issue lists with linked updates/contacts, a Reminder section, separate Community and Patient bell categories, due/overdue alerts, Resolve and Reopen actions, and preserved signed contact and correction histories; Readmission keeps the latest saved appliance and accessories for each current stoma with a simple Admit button; no repeat appliance selection or first-review reset for an existing setup; Cancelled Stoma Appointments now has a Delete button per row with patient name, ID card, date and time confirmation; removes only the selected cancelled siting and its assessment/photo, keeps the patient and other records, checks deletion succeeded, updates the list and records the removal in the Audit Trail; Community correspondence and Patient communication added beside Open inpatient visit, with dated contact records, separate histories, follow-up actions and signed correction versions; Siting now has a Cancelled Stoma Appointments tab: all cancelled siting bookings, patient and hospital reasons, notes and cancellation signatures, with patient/ID search and reason filters, including patients not on the registry; Operated Outside MDH is now a separate Registry tab beside Fistulas & Bagging, with its own search, year and stoma filters, Print / PDF, Refresh and quick-add; New Patients shows MDH operations; encounter saves recover from server timeouts, restore editable controls, confirm interrupted saves and retry without duplicate encounters or versions; confirmed saves display before background refreshes; an encounter’s peristomal skin now offers Not assessed — flange in situ, for a two-piece appliance whose flange was left on (not due) so the skin could not be seen — it stands alone, records no finding and leaves any existing skin complication untouched, with a reminder shown for two-piece appliances; fixed the encounter clinical-notes box showing doubled / blurred text after a recent theme change; a siting session can now be cancelled with a reason — Due to the patient or a Hospital complication, plus an optional note — the same split used on a cancelled appointment; the cancelled session and its reason are kept in the patient’s Siting sessions history (needs sql/add-siting-cancellation.sql to store the reason); a ‹ Back button now sits at the top-left of the bar once you have navigated — it returns you to the page you came from (the list, the clinic day, the handover…) and steps back further on each press, disappearing when there is nowhere left to go; the encounter’s Infection status now has just two choices — Infection (pick the organism) or Resolved — instead of the old six; it stays on “— choose —” when there is nothing to note, and older notes that used the wider wording fold into Infection when the encounter is re-opened; navigation and toolbar icons aligned; page headings, action buttons and patient tiles tidied; compact phone header and responsive spacing; the clinical workspace upgrade has been fully rolled back; original roster, navigation, patient records, encounters, reminders and printing restored; the Audit Trail can now be permanently deleted at three sizes to free Supabase space — a single entry (🗑 on its row), a whole month, or a whole year (listed above its months) — every delete erasing those lines from the database for good while leaving the patient records and roster untouched (re-run sql/add-audit-log.sql to allow deleting); the Audit Trail now also logs roster changes (duty, overtime, TIL, leave, change of duty), is viewable a month at a time, and a whole month can be deleted to free space (re-run sql/add-audit-log.sql to allow clearing); new Audit Trail tab (Audit & Reports) logs every change to a patient record — who, when and what changed — with Added / Edited / Deleted filters and search (needs sql/add-audit-log.sql); the Patient details card now carries a signature — who entered the patient and when, and who last edited the details — filled in automatically from the signed-in nurse (needs sql/add-patient-signature.sql); removed the Clinic Audit and OT Audit tabs from Audit & Reports; Data Analysis › Incomplete records by year now shows only the years that actually have incomplete records, gap-free — the From / to / Year pickers list just those years, so a lone very old record no longer stretches the chart back to 1966; each Fistulas & Bagging row now has a 🗑 Delete button that removes a mistaken patient with all their episodes and encounters (Close case is still there to keep a finished record); the Fistula Registry is now Fistulas & Bagging Advice — Add patient opens a two-pathway chooser (Fistula present or Bagging advice (a drain or wound we were asked to assess and advise a bag for, e.g. a PCA drain); operation performed and findings are now one field; a kind filter and BAGGING tag/stripe (blue) sit alongside the FISTULA ones; needs sql/add-fistula-patients.sql re-run; Fistula Registry: open and closed cases with each patient’s episodes and encounters, Close / Reopen case, and Discharge patient on the handover asks whether the fistula resolved (closes the case) or is long-term (stays open); fistula patients have no nurse owner and no due month — a clinic visit plans nothing for them; fistula patients: new Registry › 🩹 Fistulas tab to add a patient with a fistula and no stoma — name, ID card, firm, operation date, operation performed and findings — and admit them to the handover, where the row is marked with a purple FISTULA tag and stripe (printed too); the appliance picker lists Fistula / wound manager products first for them, encounters show one Fistula column, discharge closes the admission without the Postop Discharges list, and they are kept out of every stoma list and count (needs sql/add-fistula-patients.sql); encounter appliances: no more dropdowns — each stoma shows its setup with ✓ Keep same appliance and ✏️ Modify appliance, which opens the same picker pages as an appointment; the handover keeps its editable appliance, notes and Complications for every nurse, with 📝 Encounter beside them; Support / referrals is no longer in Complete visit — referrals are kept in encounters; fixes: options added on a computer survive a reload and are signed by the nurse who added them, correcting today’s encounter no longer undoes a referral ticked Seen elsewhere, and a handover patient without an admission record gets one opened for the encounter; LAUNCH: encounters, the visit stoma assessment and reviews, support referrals and added options are now for every nurse, not just Jason — each encounter, version and review is signed automatically with the signed-in nurse’s name (needs sql/open-encounters-to-all-nurses.sql); Complete visit › Appliances now opens the picker automatically for every user, with “Keep same appliance” offered first when the stoma has one on record (not for a first appliance); Jason’s typed stoma assessment and referrals now survive the appliance picker; support referrals are now kept on the patient — add a referral (date and name automatic, no status), tick Seen with its date later, shown as chips at the top of encounters, Complete visit and the patient record, and carried to every later episode and visit (needs sql/add-support-referrals.sql); peristomal skin list now also offers Varices and Bluish discolouration; Patient Registry owner filter now shows that nurse’s live caseload only (no reversed, deceased, Gozo or overseas patients) with the top numbers following it, new Colostomies / Ileostomies / Urostomies boxes, and Tracey in the owner list; visit reviews and encounters are now edit-on-the-day only — each save is a new signed version (V1, V2 …) with changes in red, and from the next day they are locked; the patient record’s Appointments tab has 📝 Open review for each visit with a stoma assessment (Jason’s profile); peristomal skin is now one list — Healthy skin, Irritation, Excoriation, Fungal infection, Psoriasis, Eczema, Dermatitis, Metaplasia, Ulcerated — and colour, function/output and skin lists take ＋ Add other… (kept for good; shared once sql/add-assessment-options.sql runs); the rod question appears only at a loop stoma’s first encounter or visit; Follow-up Planning now carries unbooked patients over at month end, for every user — anyone due in a month that has ended without a booking appears first in the current month’s Due this month list in a red card saying which month they were carried over from; encounters and the visit stoma assessment now record peristomal skin per stoma — Healthy / Not healthy with the skin problem, which becomes a complication of that stoma (Healthy resolves it); the Rod present tick now appears only on loop stomas — never on an end colostomy, end ileostomy or urostomy; Complete visit › Clinical review now starts, on Jason’s profile, with a per-stoma Stoma assessment — a column per stoma named by type with colour, function/output, Rod present + removal date and clinical notes — saved on the visit, shown on Review and in visit history (needs sql/add-visit-stoma-assessment.sql); encounter stoma columns now have a single “Rod present” tick on every stoma — ticking it shows the planned removal date, unticking an in-place rod records its removal; encounters now show one column per stoma named by its type (e.g. End Ileostomy) for stoma review, appliances and clinical notes — no S1/S2 tabs and no notes dropdown; each encounter is coded ENC-patient ID-date, there is one per patient per day; saved encounters reopen read only and Edit report as V2/V3 starts a revision, with a separate General notes box in every encounter; the patient record’s Episodes tab lists each episode’s encounters underneath, newest first; encounter function/output now lists Nil, Flatus present, Bilious effluent, Liquid stools, Semi-formed stools, Blood and Hemoserous fluid — Gas renamed Flatus present, Liquid renamed Liquid stools, Hemorrhagic fluid and Serous fluid removed; follow-up and siting booking pickers now show the same nurses as the Daily Clinic, including overtime and TIL-In nurses with an OT/TIL tag; a core nurse’s OT entered under a one-letter spelling difference (Tracy / Tracey) folds into their own column instead of a duplicate; cancelled OT entries no longer add a column, and patients already booked under a cancelled or misspelt OT entry stay in that nurse’s own column; encounters stay open through automatic ward updates, pauses in typing and app reconnections; encounters now follow numbered sections: stoma review, appliances/accessories, written report, infection status and support/referrals; Siting assessments and printed forms now use the cropped black-and-white torso diagram; older marked assessments retain their original diagram to preserve recorded site positions; the Encounters page no longer has a separate New encounter button — reopen Encounter from the handover for a fresh form; DNTU saves now lock before availability reads and retain follow-up patches for retry; attendance retains legacy statuses; patient switching keeps the correct scheduling details; encounter referrals now offer Psychologist, Dietitian, Doctor / surgeon and Social worker — Stoma nurse and Physiotherapist removed; Jason-only encounter workspace now has per-stoma dropdown assessments, collapsible appliances/accessories, infection (resolved status retained correctly) and episode referrals, writable notes and automatic reports/signatures; correcting a saved encounter creates V2/V3 with changes in red and preserves the original. The handover stays a full-width table; handover rows have a Jason-only "📝 Encounter" button for a stoma assessment + nursing report tied to the current inpatient episode — saving one today turns the Appliance+notes cell green; the Handover and Postop Discharges list patients without avatars, for a compact ward sheet; patient avatars are now coherent throughout the rest of the platform: active patients keep the illustrated male/female/neutral portrait, outside-MDH active patients keep green, and each non-active outcome uses one complete colour-coded clinical avatar — including a recognisable side-profile white dove with swept wing, tail feathers and a leafy olive branch for deceased; Registry outcome rows now use soft tints, dark readable wording and a strong status stripe; locality flags are unchanged; patient records use five illustrated section tiles — one desktop row and a 3 + 2 phone grid — with a clean abdomen/stoma symbol and no scalpel; patient-page wording is larger and darker, with key clinical labels bold for faster scanning; the patient record shows a collapsible "Surgery snapshot" just under the patient name (above the tabs) — tap to open the list of every surgery newest-first, each tappable to a read-only page of the operation and its appliances; Registry has a separate "Operated Outside MDH" tab and a quick-add — type an ID card, the patient is found, add the date operated, and they are flagged operated-outside-MDH; a single "Operated Outside MDH" tick on the Add Patient AND Edit forms routes the patient to the right list (unticked = Mater Dei) — ticking it on an existing patient MOVES them, never duplicates; outside-MDH stomas have their own tab and are kept out of New Patients and the MDH operative count, with an optional hospital and country shown on the patient page. Also keeps a stoma and its refashionings on ONE row in the month it was first formed — the refashioning folded into the same row, stacked above the first operation with the latest on top, and one operation that remade several stomas shown as a single line rather than a duplicate — instead of listing each as a separate line, so a patient whose only recent op was a refashioning no longer shows as a fresh line; removed the ghost shift-planning rows from the roster; Tracey Galea now runs Shift A — 2 days on, 1 day off — from 8 October; the ENT ward is in the admit dropdown and ward colours; patient record header shows the outcome for every status with a coloured bar and icon)'};

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
  {id:'layout',title:'Page layout and icons',keywords:'icons alignment layout spacing phone mobile page headings buttons navigation tabs patient tiles back return button previous page go back',html:`<p>Navigation pictures sit in matching icon boxes. Page headings and action buttons align consistently, and patient record tiles keep their illustrations and section counts. On a phone, the clinic name and help, task and reminder buttons fit in the compact top bar; use the menu to change work area and the sub-tabs to change page. Controls wrap onto the next row when needed, so their labels remain readable.</p>
    <p><b>‹ Back</b> — once you move off the first screen, a <b>‹ Back</b> button appears at the top-left of the bar. It takes you to the page you were just on — the list you opened a patient from, the clinic day you drilled into, and so on — so you never have to hunt back through the menu. Press it again to keep stepping back; it disappears when there is nowhere left to return to. (A patient record also keeps its own <b>‹ Registry</b> button.)</p>`},
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
  {id:'record',title:'Open a patient record',keywords:'deceased minimise stored data save selected HTML export month year death checkbox select all group open patient record registry search find overview name surname prominent identity ID card number badge mobile stomas outcome reversal closure button appointments episodes edit input missing stoma details patient demographics unlock save single card golden title appliance history discharge current closed colours purple black blue teal missing date sex gender male female pink tint background colour coded locality flag surgery snapshot read only operation appliances accessories newest first tap',html:`
    ${manMap('patients')}
    ${manWhen('To view or change anything about one patient.')}
    ${manSteps([
      `Open ${manBtn('👥 Registry','#e0f2f5','#0b6b7a')} → ${manBtn('👥 Patient Registry','#e0f2f5','#0b6b7a')} and search by name or ID card.`,
      `Tap the patient to open their record. It has five illustrated section tiles: <b>Overview</b>, <b>Stomas</b>, <b>Outcome</b>, <b>Appointments</b> and <b>Episodes</b>. Inside the Stomas section, the full heading remains <b>Stomas &amp; operations</b>.`,
      `The top of every record tab shows the patient's <b>name and surname beside their ID card number</b> in one row. The ID has a compact dark badge with consistent text and spacing. These appear once in the header; <b>Patient details</b> starts with date of birth and telephone. There is no separate <b>Sex</b> field — the whole record is tinted by sex instead (see below). Long names wrap within their space, and an absent ID is shown as <b>Not recorded</b>.`,
      `Use <b>Edit patient</b> to open patient details. Press ${manBtn('Input / edit stoma details','#fff6d8','#7a4b00')} to open the present stoma, or start the new-stoma form when none is present. When no stoma type has been recorded, this is the main action; you can go straight to the stoma without re-entering demographics. <b>Anything you have typed into the patient details is saved first</b>, so a new date of birth, firm, locality or address is never lost on the way to the stoma (a still-blank required field does not stop you — you can fill the stoma in first).`,
      `In <b>Stomas</b>, each stoma appears once, on its own card with a bold golden title, stoma code, surgery date, discharge date and operation and findings. Select the card heading to edit that stoma. Tabs inside the stoma form take you directly to another stoma.`,
      `The latest recorded appliances and accessories sit underneath that stoma's details. Expand <b>Appliance history</b> for its dated ward and clinic changes. Use <b>Current</b> or <b>Closed</b> to view the relevant stomas when there is more than one.`,
      `Directly under the patient's <b>name</b> (above the tabs) is a <b>collapsible Surgery snapshot</b> — tap its header to open the list of every surgery the patient has had, <b>newest first</b> (date, stoma type and operation). Tap any surgery for a <b>read-only</b> page showing the <b>type of surgery performed</b> and every <b>appliance &amp; accessory</b> recorded for that stoma (from clinic visits and ward episodes). It only shows — press ${manBtn('✏️ Edit this surgery','#e6f4f1','#0d7377')} on it to open that stoma's form and make changes.`
    ])}
    ${manNote('tip','👤','<b>Owner filter (Patient Registry).</b> <b>All owners</b> is the master list of every registered patient. Choosing an owner — Common, Jacqueline, Jason, Lorraine or Tracey — shows that nurse’s <b>live caseload</b>: reversed, deceased, discharged-to-Gozo and relocated-overseas patients are hidden (pick that status on purpose to see them). The number boxes at the top follow the owner: total, active and paused for that nurse, plus <b>Colostomies</b>, <b>Ileostomies</b> and <b>Urostomies</b> (shown for All owners too, across all statuses). A patient with two kinds of stoma counts in both.')}
    <p class="man-lede">When stoma details are missing, <b>Save patient details</b> appears only after you change a demographic field or press <b>Unlock to correct</b>. Saving from an appointment still offers <b>Save &amp; return to appointment</b>.</p>
    ${manH2('🗂','What each tab holds')}
    ${manNote('tip','🖥️','On a PC, the five illustrated section tiles sit in <b>one clear row</b>. On a phone they wrap into a <b>3 + 2 grid</b>, so none is hidden off-screen. The active section has a stronger outline, and Stomas and Episodes show their totals in separate number bubbles. The <b>Stomas</b> tile uses an abdomen-and-stoma symbol only — <b>no scalpel</b>.')}
    ${manNote('auto','✍️','<b>Signature.</b> At the foot of the <b>Patient details</b> card a line records <b>who entered the patient</b> and <b>when</b>, and — if someone else changed the details later — <b>who last edited</b> them. The name is the signed-in nurse’s, filled in automatically the moment the record is saved. Patients added before this was switched on read <b>Author not recorded</b>. (Needs <b>sql/add-patient-signature.sql</b> run once in Supabase.)')}
    ${manNote('tip','💾','<b>Deceased patients — select, save and minimise.</b> Open <b>Patient Registry → Deceased</b>. Records are grouped by the <b>date of death</b>, newest month first. Use <b>Year of death</b> and <b>Month of death</b> to filter, and <b>Group by</b> to switch between month and year. Undated deaths have their own group. The checkboxes on the far left select individual patients; the checkbox on a group selects its whole filtered month or year, including patients on other pages. <b>Select all filtered patients</b> covers every page. <b>Save selected as HTML</b> downloads one standalone file containing only the selected patient details, stoma history, appointments, clinical records, encounters, communications, siting assessments and available photographs. Changing filters clears selections that are no longer included. <b>Minimise stored data</b> works on the selection, or one patient using their row button. After confirmation, it saves a <b>compact HTML summary</b> for each patient and <b>permanently removes only their stored siting photographs</b>. Other clinical records remain. Save the HTML first to keep a copy of photographs. A failed removal is not marked complete and can be retried. <b>View saved summary</b> opens the saved summary; the patient Overview keeps a completion note. The action is recorded in the <b>Audit Trail</b>. (Needs <b>sql/add-deceased-minimise.sql</b> run once in Supabase.)')}
    <ul class="man-ul">
      <li><b>Overview</b> — demographics, follow-up status and owner, contact. (A collapsible <b>Surgery snapshot</b> sits just under the name, above the tabs, on every tab.)</li>
      <li><b>Stomas</b> — one card per stoma under the <b>Stomas &amp; operations</b> heading, with its code, operation and dates, and its own appliances &amp; accessories and history. Older appliance entries whose stoma cannot be identified are kept under <b>Other appliance history</b>. Also the upcoming-surgery date for existing patients.</li>
      <li><b>Outcome</b> — the follow-up outcome (active, reversed, deceased, relocated overseas, discharged to Gozo …). Under <b>Change the outcome</b>, press <b>Reversal / closure</b> to record the operation on the affected stoma. The buttons match the table: <b>purple</b> for reversal / closure, <b>black</b> for deceased, <b>blue</b> for Gozo and <b>teal</b> for overseas. The current outcome keeps its colour; an amber outline and <b>add date</b> label show a missing date.</li>
      <li><b>Appointments</b> — this patient's clinic appointments.</li>
      <li><b>Episodes</b> — their inpatient admissions, community correspondence and patient communication history.</li>
    </ul>
    ${manH2('🎨','Colour tells you the sex at a glance')}
    <p class="man-lede">The whole patient record is <b>colour-coded by sex</b> so you can tell it apart at a glance without reading a field:</p>
    <ul class="man-ul">
      <li>${manBtn('Male','#dbeafe','#1d4ed8')} — a <b>blue</b> wash across the page and cards, with a matching <b>blue illustrated male avatar</b>.</li>
      <li>${manBtn('Female','#fbcfe8','#be185d')} — a <b>pink</b> wash across the page and cards, with a matching <b>pink illustrated female avatar</b>.</li>
    </ul>
    ${manNote('tip','👤','Every patient record automatically shows the illustrated male or female avatar from the saved Sex field. Mater Dei patients use the normal <b>blue or pink</b> portrait. A patient marked <b>Operated Outside MDH</b> uses the matching <b>green</b> portrait together with the green page outline and status badge. If Sex is not recorded, the neutral patient icon remains visible.')}
    ${manH2('👤','One patient avatar across the platform')}
    <p class="man-lede">The same avatar follows the patient through <b>Registry</b>, <b>New Patients</b>, <b>Quick Look</b>, <b>Appointments</b>, <b>Appointment Outcomes</b>, <b>DNTU</b>, <b>Handover</b>, <b>Siting</b>, <b>Postop Discharges</b> and patient pop-ups. Active patients keep the illustrated portrait. Every non-active outcome uses one complete colour-coded clinical avatar instead of mixing portraits with tiny badges.</p>
    <ul class="man-ul">
      <li><b>White dove with swept wing, tail feathers and a leafy olive branch</b> — deceased.</li><li><b>Violet reversal arrow</b> — reversed / closed.</li>
      <li><b>Blue ferry</b> — discharged to Gozo.</li><li><b>Teal plane</b> — relocated overseas.</li>
      <li><b>Amber pause</b> — follow-up paused.</li><li><b>Slate clock</b> — awaiting feedback.</li>
    </ul>
    ${manNote('tip','🎨','A patient who is <b>still in follow-up</b> keeps the correct male, female or neutral portrait; active outside-MDH patients keep the green portrait. Reversed, deceased, Gozo, overseas, paused and awaiting-feedback records each use their own full clinical avatar. <b>Locality flags are separate and remain untouched.</b>')}
    ${manNote('tip','🔎','Patient-page wording uses larger, darker text. Key clinical labels such as <b>Surgery</b>, <b>Location</b>, <b>Discharged</b>, <b>Operation &amp; findings</b> and <b>Appliances &amp; accessories</b> are bold so the record is easier to scan.')}
    ${manH2('🎗','The top bar also shows the outcome')}
    <p class="man-lede">When a patient is no longer in plain follow-up, the <b>header bar turns the outcome colour</b> and shows the same symbol used by the full status avatar, while the rest of the page keeps the sex wash:</p>
    <ul class="man-ul">
      <li>${manBtn('✝ Deceased','#1a1a1a','#ffffff')} — <b>black</b> bar with a cross.</li>
      <li>${manBtn('↩ Reversed','#6d28d9','#ffffff')} — <b>violet</b> bar with a reversal arrow.</li>
      <li>${manBtn('⛴ Discharged to Gozo','#1d4ed8','#ffffff')} — <b>blue</b> bar with a ferry.</li>
      <li>${manBtn('✈ Relocated overseas','#0f766e','#ffffff')} — <b>teal</b> bar with a plane.</li>
      <li>${manBtn('⏸ Paused','#b45309','#ffffff')} — <b>amber</b> bar with a pause mark.</li>
      <li>${manBtn('🕗 Awaiting feedback','#475569','#ffffff')} — <b>slate</b> bar with a clock.</li>
    </ul>
    ${manNote('tip','📍','The <b>Locality</b> sits in its own prominent green row in Patient details, with the local council flag (or a neat initials marker when a town has no flag on file).')}
    ${manNote('tip','🗂','In the <b>Registry list</b>, outcome rows use a <b>soft background tint, dark readable wording and a strong coloured stripe</b> — charcoal for deceased, violet for reversed, blue for Gozo and teal for overseas. An <b>amber left stripe</b> marks a non-finalised record still missing a required field. Finalised deceased and reversed records keep their own outcome stripe.')}
  `},
  {id:'communications',title:'Community correspondence & patient communication',keywords:'community correspondence communication contact telephone phone email letter patient relative carer GP nursing care home service organisation incoming outgoing advice follow-up action date status awaiting response completed resolved reopen issues contact updates reminder bell date overdue episodes version edit correction history',html:`
    ${manMap('patients')}
    ${manWhen('You need to record an exchange with a community service, the patient, a relative or a carer.')}
    ${manSteps([
      `Open the patient record → <b>Episodes</b>. Next to <b>Open inpatient visit</b>, choose <b>Community correspondence</b> or <b>Patient communication</b>. Both buttons are also available while an inpatient visit is open.`,
      `Check the <b>Date</b> and <b>Time (Malta)</b>. Select the <b>Contact method</b> (Telephone, Email, In person, Letter or Other) and whether the exchange is <b>Outgoing</b> or <b>Incoming</b>.`,
      `Record the <b>contact person</b> and, for community correspondence, the <b>community service / organisation</b>. For patient communication, the patient's name is prefilled; change it when speaking with a relative or carer.`,
      `Enter a <b>Subject</b> and the <b>Communication / advice / outcome</b>. Choose <b>Open</b>, <b>Awaiting response</b>, <b>Follow-up required</b> or <b>Resolved</b>. Under <b>Reminder</b>, tick <b>Set a reminder for this issue</b> and enter the action and date when follow-up is needed.`,
      `Press <b>Save record</b>. Two separate issue lists underneath the inpatient episodes keep community correspondence and patient communication. Open issues remain listed until resolved, with a separate expandable resolved history. No inpatient admission is needed.`,
      `For another contact about the same subject, open the issue and press <b>Add update / contact</b>. Each dated and signed contact is kept underneath that issue. Use <b>Edit issue / reminder</b> for its current status or reminder and <b>Edit record</b> to correct an individual contact; corrections retain <b>Previous versions</b>. Press <b>Resolve issue</b> when finished: its active reminder clears and the history stays available. <b>Reopen issue</b> allows further contacts; set a new reminder if needed.`
    ])}
    ${manNote('auto','✍️','Every record and correction is signed automatically with the logged-in nurse’s name and saving time. A correction keeps the original version. If another nurse or device saves first, your text remains in the form and the app asks you to reopen the latest record before saving over it.')}
    ${manNote('tip','💾','An unsuccessful save keeps the form open with your wording. Cancel asks before discarding changes. The reminder date must be on or after the communication date. Due and overdue reminders appear in the bell under <b>Community</b> or <b>Patient</b>; <b>Open issue</b> takes you directly to that patient’s saved issue. Future reminders remain visible in the patient record.')}
  `},
  {id:'operation',title:'Record a new stoma, refashioning or reversal',keywords:'operation new stoma refashioning refashion reversal closure outcome revert status undo deceased gozo overseas undated button supersede record surgery confirm yes no cancel date unknown comments replacement',html:`
    ${manMap('patients')}
    ${manWhen('The patient had a stoma operation — a new stoma, a refashioning, or a reversal/closure.')}
    ${manSteps([
      `Open the patient → <b>Stomas</b>.`,
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
      `Open the patient → <b>Stomas</b>. Under <b>Upcoming surgery</b> press ${manBtn('＋ Add surgery date','#e7f7ef','#1c8f5f')}.`,
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
  {id:'fistulas',title:'Fistulas & Bagging Advice (no stoma)',keywords:'fistula fistulas bagging advice drain wound pcd percutaneous drain registry open cases closed cases close case reopen ecf enterocutaneous wound manager no stoma add patient handover admit discharge patient long-term episodes encounters purple tag blue tag no nurse owner no due month convert stoma',html:`
    ${manMap('patients')}
    ${manWhen('A patient has no stoma but needs the stoma nurses: a fistula, or a drain or wound we were asked to assess and advise a bag for (bagging advice). They are managed on the ward but not followed up like a stoma patient.')}
    ${manH2('➕','Add a patient — fistula or bagging advice')}
    ${manSteps([
      `Open ${manBtn('👥 Registry','#e0f2f5','#0b6b7a')} → ${manBtn('🩹 Fistulas & Bagging','#f3e8ff','#6b21a8')} and press ${manBtn('＋ Add patient','#7c3aed','#fff')}.`,
      `A small window asks <b>which pathway</b> — tap <b>🩹 Fistula present</b> or <b>👜 Bagging advice</b> (for example a PCA / percutaneous drain the ward called us to assess and advise a bag for). The form opens for that choice, with a chip at the top showing which one; <b>change</b> on the chip (or <b>Back</b>) returns to the two buttons. The field labels match the pathway.`,
      `Fill in the <b>first name</b>, <b>surname</b> and <b>ID card</b> (required), the <b>firm</b> (consultant), the <b>date</b>, and <b>operation performed &amp; findings</b> (one box — for bagging advice it reads <b>drain / wound &amp; reason</b>). An ID card already in the registry is not added twice — the form offers to open that patient instead.`,
      `Leave <b>Admit to the handover now</b> ticked to put them on the ward straight away: the usual <b>Open inpatient visit</b> window asks for the ward, bed and admission date. Each admission is its own <b>episode</b>, and every 📝 Encounter saved on the ward belongs to it.`
    ])}
    ${manH2('🗂','Open and closed cases')}
    <ul class="man-ul">
      <li>The registry opens on <b>Open cases</b>. The boxes at the top switch to <b>On the ward</b>, <b>Closed cases</b> or <b>All</b>, each with its count, and a dropdown filters to <b>fistulas only</b> or <b>bagging advice only</b>; search finds a name, ID card, firm, operation, finding or closing reason.</li>
      <li>Each row shows the operation and findings, the <b>episodes &amp; encounters</b> (how many, and the latest episode — on the ward since…, or discharged…), and the <b>case</b>: on the ward, open (at home with a long-term fistula, or not admitted yet), or closed with its date and reason.</li>
      <li><b>📂 Episodes &amp; encounters</b> opens the patient record on its <b>Episodes</b> tab — every admission, newest first, with its encounters underneath.</li>
      <li>An open case not on the ward has <b>🏥 Admit to handover</b> and <b>✓ Close case</b> (choose the date and the reason: Healed / resolved, Drain removed, Surgically repaired, Deceased or Other). A closed case has <b>↺ Reopen case</b>; admitting a closed case from the record asks to reopen it first.</li>
      <li><b>🗑 Delete</b> (on every row) removes a patient entered by mistake, <b>with all their episodes and encounters</b> — it asks to confirm and cannot be undone. If a case is simply finished, use <b>Close case</b> instead so the record is kept.</li>
      <li>The patient record shows the same: a purple fistula card with the operation, findings, firm and the case status, and buttons to edit, admit, close or reopen.</li>
    </ul>
    ${manH2('🏥','On the handover')}
    <ul class="man-ul">
      <li>The row carries a <span class="fistula-tag">FISTULA</span> (purple) or <span class="fistula-tag bagging-tag">BAGGING</span> (blue) tag beside the surname and a matching stripe down its edge; the printed sheet prints the tag beside the name.</li>
      <li>Set the appliance by tapping the appliance cell as for anyone — the fistula takes the place of the stoma, and the <b>Fistula / wound manager</b> products are listed first under One-piece. Notes, Complications and 📝 Encounter work as usual.</li>
      <li>There is one button: <b>Discharge patient</b> — no postop, Gozo or overseas choices. It asks one question: <b>resolved — close the case</b> (the usual answer; for bagging advice this reads <b>drain removed</b>) or <b>going home still needing the bag / a long-term fistula — keep the case open</b>. Either way the patient leaves the handover, the admission closes with today’s date, and they do <b>not</b> go on the Postop Discharges list.</li>
    </ul>
    ${manH2('📅','Clinic visits — no nurse owner, no due month')}
    <p>These patients are <b>not allocated to a nurse</b> and have <b>no due month</b>. One who goes home still needing the bag is booked from the clinic when needed (Schedule on their record, or a normal booking). When the visit is completed, the <b>Nurse owner</b> is replaced by a note and the Follow-up step simply says there is no due month — nothing is planned or allocated.</p>
    ${manSteps([
      `If a fistula patient later has a <b>stoma formed</b>, open <b>Edit</b> and press <b>Move to the Patient Registry as a stoma patient</b>, then record the stoma in Edit patient. Their appliance history, episodes and encounters stay on the record.`
    ])}
    ${manNote('auto','⚙️','Fistula patients are kept <b>out of every stoma list and count</b> — the Patient Registry and its boxes, Follow-up Planning and the bell’s follow-up lists, New Patients, Reports (including admissions), the Annual Report, Data Analysis, the reversal register and the Map. They still appear in Quick Look and Needs Checking (with the FISTULA tag), so the same person is never added twice.')}
    ${manNote('tip','🗄️','Run <b>sql/add-fistula-patients.sql</b> once in Supabase (on a computer) — again if you ran an earlier copy, as it now also adds the bagging-advice and open/closed case columns. It is safe to re-run.')}
  `},
  {id:'quicklook',title:'Quick Look, New Patients & Operated Outside MDH',keywords:'quick look phone lookup new patients recent register refashioning refashioned nested first stoma month abroad operated outside mdh overseas another hospital tab add print pdf year search',html:`
    ${manMap('patients')}
    ${manSteps([
      `${manBtn('📱 Quick Look','#e7e6fb','#3a34a0')} — a fast phone-friendly lookup to check a patient at the bedside.`,
      `${manBtn('🆕 New Patients','#e7f7ef','#1c8f5f')} — the register of stomas formed <b>at MDH</b>, grouped by month (newest first). Every <i>new</i> stoma is a line of its own, in the month it was formed.`
    ])}
    ${manNote('auto','⚙️','A <b>refashioning is not a new stoma</b>, so it is never a line of its own. Each stoma keeps a <b>single register row</b>, in the month it was <i>first</i> formed, and any refashioning is <b>folded into that same row</b>: the refashioning’s operation, date and type stack <b>above</b> the first-performed ones (latest at the very top, the original “first stoma” at the foot). When <b>one operation remade more than one stoma</b> (e.g. an ileostomy and its mucus fistula together) it shows as a <b>single line</b>, naming the stoma types it produced — not a duplicate. A patient whose only recent operation was a refashioning of an older stoma therefore does <b>not</b> appear as a fresh entry — the refashioning shows on the one row of their first formation.')}
    ${manH2('🌍','Stomas formed outside MDH')}
    <p class="man-lede">The <b>Operated Outside MDH</b> tab sits under <b>Registry</b>, immediately beside <b>Fistulas &amp; Bagging</b>. It lists stomas formed at another hospital, separately from the MDH register and its operative count.</p>
    ${manSteps([
      `Open ${manBtn('🌍 Operated Outside MDH','#faf5ff','#6b21a8')} from the Registry tabs to see <b>only</b> the patients operated outside MDH, each tagged ${manBtn('🌍 outside MDH','#f3e8ff','#6b21a8')}. The same tab is available from the phone menu.`,
      `Use <b>Search</b>, <b>Year</b> and <b>Show</b> to narrow this list. These filters are independent of New Patients. <b>Print / PDF</b> prints the displayed outside-MDH list with its own heading; <b>Refresh</b> reloads it.`,
      `${manBtn('➕ Operated Outside MDH','#f3e8ff','#6b21a8')} (top of this tab) — the quick way to add one: type the <b>ID card</b>, the patient’s details are found from the registry, add the <b>date they were operated (outside MDH)</b> — and optionally the <b>hospital</b> and <b>country</b> — then Save. The outside-MDH tab opens and refreshes, showing the saved patient when they match its filters.`,
      `If the ID card is <b>not</b> in the registry, it asks <i>“add this patient?”</i> — Yes opens ${manBtn('➕ Add Patient','#e7f7ef','#1c8f5f')} pre-filled with the ID card and the <b>“Operated Outside MDH”</b> tick already on.`
    ])}
    ${manNote('tip','💡','The <b>“🌍 Operated Outside MDH”</b> tick appears on both the <b>Add Patient</b> form and a patient’s <b>Edit</b> form: leave it <b>unticked</b> for Mater Dei (lists in New Patients), <b>tick</b> it for one done outside MDH (lists under Operated Outside MDH, out of the MDH count). Ticking it reveals two <b>optional</b> boxes — <b>hospital</b> and <b>country</b> — for where the operation was performed. It is <b>one flag</b>, so ticking it on an existing Mater-Dei patient <b>moves</b> them to the Operated-Outside-MDH list and off the MDH register — never a duplicate. On the <b>patient page</b> such a patient keeps the sex tint (pink / blue) and gains a <b>green ring</b> around the page and a green <b>“🌍 Operated Outside MDH”</b> badge in the header, with the hospital / country shown beside it. The flag needs <code>sql/add-operated-abroad.sql</code>, and the hospital / country need <code>sql/add-operated-abroad-location.sql</code> — both run once in Supabase; until then those fields will not save and the app says so.')}
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
    ${manH2('🚫','Record a DNTU')}
    ${manSteps([
      `Open <b>Did not turn up</b> on the missed appointment. Check its date, time and nurse owner. Future appointments cannot be marked as missed.`,
      `The consecutive count is calculated from saved outcomes. To add an earlier missed appointment that was never entered, press <b>Add a previous DNTU event</b> and enter its date. Add dates oldest first; every added row needs a date. Remove a row if it was added by mistake.`,
      `An existing appointment on that date must be corrected through its own record. A Seen appointment breaks the run; cancellations do not count as misses.`,
      `Press <b>Save</b> once. The form locks while saving. If only some changes save, the form shows those saved records and allows a retry without adding them again. A failed follow-up update retains the due month for retry.`
    ])}
    ${manNote('auto','⚙️','For a new missed appointment, the follow-up due month is selected from clinic availability. <b>Three did-not-turn-ups in a row pause</b> follow-up instead. Recording an older miss does not replace follow-up after a later saved outcome. Deceased and reversed follow-up statuses stay closed.')}
  `},
  {id:'complete',title:'Complete a visit (Seen)',keywords:'complete visit seen stepper attendance complications appliances follow up review nurse owner stoma assessment colour function output clinical notes rod handover',html:`
    ${manMap('appointments')}
    ${manWhen('The patient attended and you are writing the visit up.')}
    ${manFlow(['Attendance','→','Clinical','→','Appliances','→','Follow-up','→','Review'])}
    ${manSteps([
      `Choose <b>Seen</b> on the appointment. The visit opens as a step-by-step form.`,
      `<b>Attendance</b> — confirm date, time and outcome, and set the <b>Nurse owner</b> (shown as a gold badge).`,
      `<b>Clinical</b> — record complications if any. For <b>every nurse</b>, a <b>Stoma assessment</b> comes first: one column per stoma, named by type (e.g. <b>End Colostomy</b>, <b>Loop Ileostomy</b>), each with colour / appearance, function / output, <b>Peristomal skin</b> (Healthy skin, or findings such as Irritation, Excoriation, Ulcerated — a finding is saved as a complication of that stoma and sets “A complication is identified”), <b>＋ Add other…</b> on colour, function/output and skin, and its own <b>clinical notes</b>. It shows on the Review step and in the patient’s visit history.`,
      `<b>Visit reviews.</b> In the patient record’s <b>Appointments</b> tab (and in follow-up history) a visit with a stoma assessment has <b>📝 Open review</b>. It shows the assessment per stoma with its versions (<b>V1, V2 …</b>), each <b>signed automatically</b> with the nurse’s name and time; <b>Show changes</b> marks what changed from the previous version in <b>red</b> (removed items struck through). <b>Edit review</b> saves the next version — and is available <b>only on the day the review was recorded</b>; after that it is locked (🔒). While editing, changed values and added notes show in red.`,
      `<b>Appliances &amp; accessories</b> — the appliance picker <b>opens by itself</b> on this step (for every user). When the stoma already has an appliance on record, the first choice is <b>Keep same appliance</b> (it shows what is on record): press it when nothing changed and the visit records it as continued unchanged. Otherwise pick <b>One-piece</b>, <b>Two-piece</b> or <b>Dressing only</b> and set the new appliance and accessories. For a first appliance there is nothing to keep, so only the three systems are offered. If you step back out of the picker it does not reopen by itself — use the button.`,
      `<b>Follow-up</b> — choose the next follow-up owner and due month.`,
      `<b>Review</b> — check the summary (it shows the last follow-up date and outcome) and save.`
    ])}
    ${manNote('auto','🩹','The Review’s <b>Appliance &amp; accessories</b> card shows the patient’s <b>current appliance</b> — never "None recorded" when one is on file. If you changed it during the visit it reads <b>Before …</b> / <b>Modified to …</b> so the change is clear at a glance.')}
    ${manNote('tip','🧷','Manage <b>ROD</b> status and removal dates in <b>Handover</b>. The Seen / Complete visit form has no rod option or removal-date question. Rod details saved on older visits remain in their review and history.')}
    ${manNote('auto','⚙️','The next <b>follow-up due month is worked out for you</b>, and the patient is added to the booking worklist. Booking an appointment on/after their due date takes them off it automatically.')}
    ${manNote('tip','🩹','For a <b>fistula</b> or <b>bagging-advice</b> patient the visit has a single column (output and the skin around the fistula / drain — no colour or rod), no <b>Nurse owner</b>, and a Follow-up step with no due month: nothing is planned or allocated, and they are booked from the clinic when needed.')}
  `},
  {id:'planning',title:'Follow-up Planning',keywords:'follow up planning carry over carried over next month unbooked priority red due months booking worklist owner overdue awaiting booking my patients add patient saved appliances details assignment selected nurse month appointment alphabetical first name surname print scroll scrollbar keyboard last follow up history see follow-up history previous follow-ups booked appointments rebook add patient my patients all users duplicate already on list ID card prominent same name matching names colour color',html:`
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
      `Saving a patient in <b>My patients</b> assigns the selected nurse and due month. The patient appears in <b>Due this month</b> when they have no upcoming booked appointment. If you switch patients while details are loading, the saved appliances and scheduling notice stay with the patient now selected.`
    ])}
    ${manNote('tip','ℹ️','Adding a patient to this list uses their existing record and creates no appointment or new clinical entry. Their saved appliances, accessories, complications and clinical status stay on record. To change clinical details, press <b>Patient record</b> beside the patient on your list.')}
    ${manNote('auto','🔤','The <b>Due this month</b> patient list is sorted A–Z by the displayed name (first name, then surname), ignoring capitalisation and accents. <b>Print patient list</b> uses the same order.')}
    ${manNote('auto','🔴','<b>Month-end carry-over (all users).</b> A patient who was due in a month that has now ended and was <b>not booked</b> (e.g. no free slots) is carried into the <b>current month</b> automatically. They are listed <b>first</b>, in a <b>red card</b> marked “Carried over from October 2026 — not yet booked” (with how many months, if longer), so they get priority. They keep carrying over each month until booked. Their recorded due month is not changed, so the delay stays visible. Printed lists mark them in red too.')}
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
  {id:'book',title:'Book a siting session',keywords:'siting session pre operative mark site book new patient before surgery abdomen diagram black white grid print clear markers',html:`
    ${manMap('siting')}
    ${manWhen('A patient (often not yet on the registry) needs their stoma site marked before surgery.')}
    ${manSteps([
      `Open ${manBtn('📍 Siting','#efe7fb','#5b3aa8')} → ${manBtn('📍 Siting Session','#efe7fb','#5b3aa8')} → ${manBtn('＋ Book siting session','#e7f7ef','#1c8f5f')}.`,
      `Enter the patient, the firm/consultant, what they are sited for and the planned surgery date.`,
      `On the day, mark the site and complete the assessment (you can add a photograph).`
    ])}
    ${manNote('tip','📍','The assessment and printed form use a <b>black-and-white, unlabelled abdomen diagram</b> with the abdominal grid and the lower genital area cropped off. Tap the diagram to add sites, drag a marker to move it, or tap a marker to remove it. Older saved sites keep their original diagram so their positions remain accurate; <b>Clear all</b> removes those sites and starts a fresh map on the current diagram.')}
    ${manNote('auto','⚙️','When the planned <b>surgery day arrives</b>, the sited patient appears at the top of the Handover as <b>"Awaiting surgery"</b> automatically — nobody has to add them.')}
    ${manNote('tip','🚫','To <b>cancel</b> a siting session, press <b>Cancel</b> on its row and choose <b>why</b> — <b>Due to the patient</b> or a <b>Hospital complication</b> — with an optional note. It is the same patient / hospital split the clinic records on a cancelled appointment. The cancelled session, with its reason, is kept in the patient’s <b>Siting sessions</b> history (greyed out) so nothing is lost. Needs <b>sql/add-siting-cancellation.sql</b> run once in Supabase to store the reason; until then the session still cancels and the app says the reason could not be saved yet.')}
  `},
  {id:'cancelled',title:'Cancelled Stoma Appointments',keywords:'cancelled stoma appointments siting cancellation patient hospital reason history note nurse search id card delete remove mistake duplicate',html:`
    ${manMap('siting')}
    ${manSteps([
      `Open <b>Siting → Cancelled Stoma Appointments</b> to see cancelled siting bookings, including people who never had a stoma formed or a registry record.`,
      `Search by patient name or ID card, or filter by <b>Due to the patient</b>, <b>Hospital complication</b> or <b>Not recorded</b>.`,
      `Each row shows the original appointment, patient and firm, what they were sited for, the cancellation reason and note, and the date and nurse who cancelled it. Older records without those details say <b>Not recorded</b>.`,
      `For an entry made by mistake, press <b>🗑 Delete</b> in that row. Check the patient name, ID card, appointment date and time in the confirmation, then press <b>Yes, delete entry</b> or <b>Keep entry</b>.`
    ])}
    ${manNote('tip','🚫','Cancelling a session keeps its history here and in the patient’s <b>Siting sessions</b> history. <b>DNTU</b> and <b>No Stomas Performed</b> retain their own records. This tab uses the existing siting cancellation fields; it needs no additional SQL.')}
    ${manNote('tip','🗑','Delete permanently removes only that cancelled siting appointment, its saved assessment and photograph. The patient’s registry record, other appointments and surgical records remain. The list and patient’s siting history update after deletion, and the removal is recorded in the Audit Trail. Deletion cannot be undone.')}
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
  {id:'sheet',title:'Reading the handover sheet',keywords:'handover ward inpatient sheet phone mobile editable automatic save profile appliance notes encounter keep same appliance modify appliance set appliance picker latest Lentell duplicate closed stoma legacy links flange due rod loop stoma end ileostomy end colostomy urostomy removal date removed discharge letter complications button infection cre vre chip urgency reminders schedule 5 permit bell green yellow orange red daily colour foyer block level floor walking order samoc oncology mamo hospital sort',html:`
    ${manMap('handover')}
    ${manWhen('Walking the ward, or preparing the printed sheet.')}
    ${manNote('auto','📝','Ward, bed and notes save when you change a field and leave it. The handover rows stay editable on a computer and phone; there is no row <b>Edit / Save</b> button. On a phone, <b>Profile</b> opens the patient’s read-only details.')}
    <p class="man-lede">Patients are listed by <b>ward, ID number, surname and first name</b> only — no patient pictures, so the sheet stays compact and prints cleanly. (The patient record itself still shows the avatar.) The same applies to <b>Postop Discharges</b>.</p>
    ${manH2('🎨','Ward colours and the walking order')}
    <p class="man-lede">Type the <b>ward</b> (it is forced to CAPITALS) and the cell takes the <b>colour of that ward's foyer / block</b> — Orange, Red, Brown, Yellow, Green and Blue foyers, Blocks A, B and C each their own colour, so the sheet reads like the colour plan on the wall. The rows then <b>sort in walking order</b>: across the foyers left-to-right, then each foyer's <b>floors from the top down</b>, then by bed number.</p>
    ${manNote('auto','🏥','<b>SAMOC — the Sir Anthony Mamo Oncology Centre</b> (across the road from Mater Dei) is included as its own hospital, in its own violet colour, listed <b>after all the Mater Dei wards</b>, with the full centre name shown beneath the ward. Its wards — <b>ONC 1</b>, <b>ONC 2</b>, <b>HEMA</b>, <b>RAINBOW</b> (paediatric) and <b>PALLIATIVE</b> — are a <b>SAMOC group in the ward dropdown</b> when you admit a patient, and show in <b>SAMOC violet</b> on the handover. Longer spellings (Oncology 1 / 2, Haematology, Palliative Care) and anything starting SAMOC / SAMOK are recognised too.')}
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
    ${manH2('📝','Encounter')}
    <p class="man-lede">Every nurse has one <b>Encounter</b> care button in each inpatient row, and each encounter and version is <b>signed automatically</b> with the signed-in nurse’s name (e.g. Jacqueline Sammut, Lorraine Marie Stivala, Tracey Galea, Jason Fenech). The 📝 Encounter button sits <b>beside</b> the usual handover controls: the appliance can still be set by tapping it on the handover, and the notes and <b>Complications</b> button work as before. The cell turns green once an encounter is saved that day.</p>
    ${manSteps([
      `Press <b>Encounter</b>. A separate page opens for the patient's current inpatient episode. Follow the numbered sections from top to bottom. The encounter stays open while ward updates arrive, when you pause typing or when you return to the app. Background refreshes wait until you leave; only your own navigation can close the form, with confirmation for unsaved changes.`,
      `<b>1. Stoma review</b> — every stoma has its own column, side by side, headed by its type (e.g. <b>End Ileostomy</b>, <b>End Colostomy</b>) — no S1/S2 numbers and no tabs to switch, so no stoma can be missed. Two stomas of the same type show as (1) and (2). In each column set colour/appearance, function/output and <b>Peristomal skin</b>: <b>Healthy skin</b>, or the findings — Irritation, Excoriation, Fungal infection, Psoriasis, Eczema, Dermatitis, Metaplasia, Ulcerated, Varices, Bluish discolouration (several can be ticked; Healthy skin stands alone). There is also <b>Not assessed — flange in situ</b> for a <b>two-piece appliance whose flange was left on</b> (not due to be changed) so the skin could not be seen: it stands alone, records no finding, and <b>leaves any skin complication already on record untouched</b> (it does not resolve it, since the skin was not seen). A short reminder about it appears under the skin list whenever the appliance is two-piece. Each finding is <b>added to that stoma’s complications automatically</b>, and ticking Healthy skin again resolves them. Each list (colour, function/output, skin) ends with <b>＋ Add other…</b> — type a new option and it is chosen and stays in the list from then on. At a <b>loop</b> stoma’s <b>first</b> encounter there is a <b>Rod present</b> tick (the <b>planned removal date</b> then appears and must be filled in); a rod is only placed at surgery, so later encounters do not ask again, and end stomas and urostomies never have a rod. Unticking a rod that was in place records it as <b>removed</b> today — the date can be adjusted. Then review the stoma’s complications. Function/output offers <b>Nil</b>, <b>Flatus present</b>, <b>Bilious effluent</b>, <b>Liquid stools</b>, <b>Semi-formed stools</b>, <b>Blood</b> and <b>Hemoserous fluid</b>. Several can be ticked together; <b>Nil</b> excludes the others. Older encounters keep whatever was recorded at the time (e.g. Gas, Serous fluid).`,
      `<b>2. Appliances &amp; accessories</b> — the same columns, one per stoma, each showing the stoma’s <b>appliance</b>, <b>accessories</b> and (two-piece) <b>flange due</b> date as they stand — there are no dropdowns. Two buttons sit underneath:<ul><li><b>✓ Keep same appliance</b> — highlighted while nothing has changed; leave it as it is and the setup is kept. If you changed it, pressing it puts the recorded setup back. It only appears when the stoma has an appliance on record.</li><li><b>✏️ Modify appliance</b> — opens the <b>same picker pages as an appointment</b>: choose <b>One-piece</b>, <b>Two-piece</b> or <b>Dressing only</b>, tick the appliance (for a two-piece: the flange with its <b>flange due</b> date, then the bag that fits it), then the accessories (tick <b>None</b> if none), and press <b>Use in encounter</b>. It opens on what the stoma has now, already ticked — change only what changed. <b>Back to encounter</b> leaves everything as it was. A stoma with no appliance yet shows <b>Set appliance</b> instead.</li></ul>A changed setup is outlined in red, the new items are red and the old setup shows as “Previously: …”. Nothing is saved until you press <b>Save encounter</b>, which then updates the handover and the episode for that stoma only.`,
      `<b>3. Written report</b> — each stoma has its own <b>clinical notes</b> box (e.g. “End Ileostomy — clinical notes”, “End Colostomy — clinical notes”); there is no dropdown to choose stomas. The report preview and automatic signature sit underneath and always cover every stoma, each followed by its own notes. A separate <b>General notes</b> box is always available below the stoma-specific notes for patient-wide observations. It is saved with the encounter, included in the report and kept in every version. Earlier episode-wide notes still appear here.`,
      `<b>4. Infection status</b> — record a patient-wide infection after the report. <b>Status</b> has just two choices — <b>Infection</b> (then pick the <b>Organism</b>) or <b>Resolved</b> — and is left on <b>— choose —</b> when there is nothing to note. <b>5. Support / referrals</b> — referrals belong to the <b>patient</b>, so they carry over to every later encounter, episode and clinic visit. Press <b>+ Add referral</b> and choose who to refer to (<b>Psychologist</b>, <b>Dietitian</b>, <b>Doctor / surgeon</b> or <b>Social worker</b>); the date and your name are recorded automatically — there is no status to pick. When the patient has been seen, tick <b>Seen</b> (the date defaults to today and can be changed). Each referral shows as a chip at the top — near the patient’s name and History — e.g. “↗ Referred to Psychologist · 6 Oct 2026” or “✅ Seen by Dietitian · 8 Oct 2026”; the same chips show on the patient record and at the top of Complete visit (for information — referrals are added and ticked Seen only in an encounter). Changes also update the report preview.`,
      `Press <b>Save encounter</b>. Author, signature, date and time come automatically from the signed-in user; no nurse assignment is required. The encounter gets a code: <b>ENC-</b>patient ID<b>-</b>date (e.g. <b>ENC-404261M-061026</b> for 6 Oct 2026).`,
      `<b>One encounter per patient per day.</b> Tapping <b>Encounter</b> again the same day opens the saved encounter <b>read only</b>. The saved view and encounter history use colour-coded stoma headings, separate labelled findings with bold values, Notes, Appliances and Accessories, and a separate General notes section. Empty notes say “No written notes recorded.” The document has a signature and minimal borders instead of form controls. Press <b>Edit report as V2</b> beside the version number to make a correction, then <b>Save as V2</b>. The next correction uses <b>V3</b>, and so on, under the same code. A new day starts a new encounter.`,
      `Use <b>History</b> to open saved encounters from the current admission or all episodes. To return to today’s form after looking at History, press <b>Back to handover</b> and tap <b>Encounter</b> again. After discharge, the <b>Encounters</b> button on the patient record still opens saved history. <b>Edit report as V2/V3</b> corrects the same ID — <b>only on the day it was recorded</b>; from the next day it is locked (🔒) and read-only. <b>Save as V2/V3</b> preserves every earlier version; Show changes marks only modified words/values red, with deleted wording struck through. Every version is signed automatically with the signed-in nurse’s name.`,
      `Correcting today’s encounter updates its history without replacing today's care setup. Encounters from earlier days cannot be changed.`
    ])}
    ${manNote('tip','📂','On the patient record, the <b>Episodes</b> tab lists each episode (newest first) with its <b>📝 Encounters</b> grouped underneath and counted — newest first, each with its code, latest version (V1, V2 …), date and author. Tap one to open it.')}
    ${manNote('tip','🔄','If the server times out, your entered findings and report stay on screen and the controls become available again. The app checks whether the encounter was saved before showing an error. If saving is still unconfirmed, press <b>Save</b> again to retry the same submission. Any wording you changed after the interruption remains editable for the next revision. A confirmed save is shown immediately; it does not wait for a background refresh. Copy your report before refreshing or closing the browser if the save has not been confirmed.') }
    ${manNote('auto','⚙️','Encounter versions and current clinical changes save together. A note-only encounter leaves appliances intact. The latest relevant encounter updates handover; an encounter saved today marks its cell green. Old encounters remain available, including their original free-text assessment/report.')}
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
  {id:'admission',title:'Admit a patient and keep saved appliances',keywords:'admit admission readmission inpatient visit previous episode saved appliance keep same accessories ward bed first review multiple stomas refashioned',html:`
    ${manMap('patients')}
    ${manWhen('A patient comes onto the ward, including a patient who has been admitted before.')}
    ${manSteps([
      `Open the patient record → <b>Episodes</b> → <b>Open inpatient visit</b>. Enter the <b>Ward</b>, <b>Bed number</b> and the <b>Date of admission</b> — the date they came in, even when you are entering it later.`,
      `When an appliance is already saved for a current stoma, the form shows the <b>latest saved appliance and accessories</b> and a simple <b>Admit</b> button. Press it to keep the setup on the new episode and Handover. You do not need to select it again or admit the patient as Awaiting first review.`,
      `Each current stoma keeps its own setup. The latest record may come from a previous inpatient episode or an attended clinic visit. A newer cleared selection is respected; an older appliance is not brought back.`,
      `A <b>new or refashioned stoma</b> has its own identity and does not inherit the old stoma's appliance. If another stoma already has a saved setup, it is kept and the form names the stoma that still needs one. Set the missing setup from Handover when reviewed.`,
      `When no current stoma has a saved appliance, use <b>Admit — awaiting first review</b> or <b>Set appliance now</b>. With several stomas and no saved setups, admission opens the per-stoma picker. You can change a retained setup later from the Handover appliance cell or in an encounter.`
    ])}
    ${manNote('auto','⚙️','The app checks the saved history again before admission. If another nurse changes it, the latest setup is shown for checking before saving. An already open episode cannot be admitted again. A failed history read leaves the admission unconfirmed, rather than guessing that there is no appliance.')}
    ${manNote('tip','📅','The admission and confirmation use the date you entered. Saved two-piece flange dates remain attached to the appropriate stoma; the shared Handover date uses the earliest current flange due date. A one-piece setup does not retain an old flange date.')}
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
    ${manNote('tip','🩹','A <b>fistula</b> (purple FISTULA) or <b>bagging-advice</b> (blue BAGGING) patient has one <b>Discharge patient</b> button instead. It asks whether it has resolved / the drain was removed (the case closes) or they are going home still needing it (the case stays open). Either way they come off the handover, the admission closes with today’s date, and they never join the Postop Discharges list.')}
    ${manNote('auto','⚙️','Every discharge <b>fills the date automatically</b> (today): Postop stamps the post-op discharge date on the operation; Overseas/Gozo stamp today as the outcome date and the status effective date. All of them close the inpatient episode and take the patient off the handover.')}
  `},
  {id:'postop',title:'Postop Discharges & Archived Handover',keywords:'postop discharges worklist booking book follow-up appointment nurse column overtime ot til archived snapshot 4pm print pdf',html:`
    ${manMap('handover')}
    <ul class="man-ul">
      <li>${manBtn('📤 Postop Discharges','#fdf0e1','#b45309')} — everyone discharged post-op who still needs a follow-up booked. A patient leaves this list once you book them, or once they are recorded as overseas / Gozo / deceased.</li>
      <li>Tap a postop row to open <b>Book Follow-up Appointment</b>: it lays out the day with one column per nurse — the <b>same nurses as the Daily Clinic</b>, including anyone on <b>overtime</b> (OT tag) or <b>TIL-In</b> (TIL tag). Pick a free slot under the nurse who will follow the patient up.</li>
      <li>${manBtn('💾 Archived Handover','#fdf0e1','#b45309')} — a read-only copy of each day's handover, saved automatically at 4 pm. It is now stored as <b>lightweight data</b> (the handover sheet as HTML, a few KB) rather than a picture, so the archive barely uses space; each day still opens or downloads as the full sheet. Needs <b>sql/add-handover-snapshot-html.sql</b> run once in Supabase; days saved by the old build stay openable as their picture.</li>
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
  {id:'roster',title:'Monthly Roster & Change of Duty',keywords:'roster monthly rota shift change of duty cod staff schedule tracey galea shift a 2 on 1 off overtime ot column duplicate default pattern',html:`
    ${manMap('calendar')}
    <ul class="man-ul">
      <li>${manBtn('🗓 Monthly Roster','#efe7fb','#5b3aa8')} — the staff rota for the month.</li>
      <li>${manBtn('🔄 Change of Duty','#fbe6d8','#a4610f')} — record a swap of duty between staff.</li>
    </ul>
    ${manNote('tip','🗓️','Each nurse has a default rotation that fills the roster automatically; clicking a day cell records an exception over it. <b>Tracey Galea</b> is on <b>Shift A — 2 days on, 1 day off — from 8 October 2026</b>. To bring a nurse in on an off day, use <b>⏰ Add OT Nurse</b> (enter the name, date and the start/finish time) — the overtime shows as <b>OT</b> on that day and in the Overtime list.')}
    ${manNote('auto','⚙️','A nurse on overtime gets a booking column on that day in the <b>Daily Clinic</b>, the <b>postop follow-up booking</b> and the <b>siting</b> picker alike. A core nurse is always <b>one column</b>, even if their OT was also entered on the Overtime list under a slightly different spelling (e.g. “Tracy” / “Tracey” with the same surname). A <b>cancelled</b> OT entry stays in the OT audit but no longer adds a column; any patient already booked under it stays in that nurse’s own column (so the slot is still shown as taken).')}
  `},
  {id:'attendance',title:'Daily Attendance & Records',keywords:'daily attendance sign in present records history til cancelled overtime cancelled removed',html:`
    ${manMap('calendar')}
    <ul class="man-ul">
      <li>${manBtn('✅ Daily Attendance','#e0f2f0','#0b6b6b')} — mark who is in today.</li>
      <li>${manBtn('📚 Attendance Records','#e2eefb','#155e9c')} — look back over attendance.</li>
    </ul>
    ${manSteps([
      `Choose the date. Planned duty follows the current roster, including leave, overtime and duty changes. A person off or on leave needs no attendance mark; the summary counts them under <b>Off / leave</b>.`,
      `For someone on duty, choose <b>Present</b> or <b>Absent</b>; a blank selection means not recorded. Enter times and remarks as needed.`,
      `Older sheets retain a recorded <b>late</b>, <b>early departure</b> or <b>off / leave</b> selection. It appears only on that existing row. Late and early departure count as Present; recorded off / leave counts as Off / leave. You can correct the selection using the usual choices.`,
      `Roster refreshes update planned duty while retaining the attendance, times and remarks already recorded.`,
      `If a TIL In or overtime shift is <b>cancelled or deleted</b> after the person was marked Present, the sheet corrects itself next time it opens: a core nurse now off has the Present mark and times cleared (remarks stay), and bank / extra staff who were only listed for that shift are removed from the sheet and the saved record.`
    ])}
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
    ${manNote('tip','📉','In <b>Data Analysis</b>, the <b>Incomplete records by year</b> chart shows <b>only the years that actually have incomplete records</b> — gap-free, so a lone very old record no longer stretches it across empty decades, and the <b>From / to</b> pickers list just those years (never an empty one). Records with no surgery date sit in the <b>Unknown</b> column. If a stray ancient year appears, click its bar to open that record and fix or delete it.')}
  `},
  {id:'more',title:'Map, DNTU & Audit Trail',keywords:'map locality dntu policy did not turn up paused audit trail change log history who edited when changed tracking restore undo recovery previous values 90 days',html:`
    ${manMap('audit')}
    <ul class="man-ul">
      <li>${manBtn('🗺 Map','#e0f2f0','#0b6b6b')} — where patients live, by locality.</li>
      <li>${manBtn('🚫 DNTU','#efe6fb','#5b21a8')} — the did-not-turn-up policy and paused patients.</li>
      <li>${manBtn('🧾 Audit Trail','#eef2f6','#334155')} — a running log of <b>every change to a patient record and the roster</b> (duty, overtime, TIL, leave, change of duty): who made it, when, and exactly what changed. Pick a <b>Month / year</b> to view it, filter by <b>Added / Edited / Deleted</b>, and search by patient, nurse or field. Roster entries carry a purple <b>Roster</b> tag; tap a patient row to open the record. <b>Review &amp; restore:</b> new database changes have protected previous values. Choose the button on an audit entry, select the fields, enter a reason and confirm. Later changes are blocked; restore the most recent relevant entry first. Deleted parents and related records restore together, or nothing is applied. Encounter and communication corrections preserve signed history. Photograph, archived-export and oversized backups are excluded; a deletion missing required backup data cannot be restored. Older entries recorded before recovery was enabled have no previous values. After a successful restoration the app reloads; restored values remain in normal use. Deleting an audit entry permanently deletes its recovery information too. <b>90-day automatic retention:</b> the database permanently deletes audit entries older than 90 days every day at 02:15 UTC, even while the app is closed. Only the audit entries are removed; patient records, restored values, encounters and saved report versions remain. Any recovery information held in an expired audit entry is lost with it. You can also <b>permanently delete</b> the log at three sizes, to free Supabase space: the <b>🗑</b> on any row removes that <b>one entry</b>; choosing a <b>month</b> then <b>🗑 Delete this month’s log</b> clears that month; choosing a <b>whole year</b> (listed above its months) then <b>🗑 Delete this year’s log</b> clears the year. Every delete is final — the lines are erased from the database for good (there is no recycle bin), but the patient records and roster themselves are never touched. Needs <b>sql/add-audit-log.sql</b> run once in Supabase — re-run it if you installed an earlier version, as it now allows deleting.</li>
    </ul>
  `}
]},

{id:'auto',title:'⚙️ Automations — what the app does for you',icon:'⚙️',color:'#e6a817',blurb:'Everything that happens automatically, in one place.',pages:[
  {id:'catalogue',title:'Full automations catalogue',keywords:'automation automatic auto does for you refashion supersede appliance discharge letter rod present removed removal date wizard dntu pause reversal reminder snapshot 4pm follow up due booking worklist infection',html:`
    ${manWhen('To understand what the app handles on its own — so staff can trust it and not double-enter.')}
    <p class="man-lede">These run without anyone pressing a special button. Each card says where you will see it.</p>
    <div class="man-auto-grid">
      ${[
        ['📝','Encounter records and revisions','Interrupted saves are checked before showing a failure; retrying the same submission keeps one encounter/revision, and controls unlock after a timeout. Confirmed saves display immediately. The screen follows stoma review, appliances, written report, infection and referrals. Each stoma has its own column (named by type, e.g. End Ileostomy) for review, appliances and notes; the report and automatic author/signature cover every stoma. One encounter per patient per day, coded ENC-ID-date; saved encounters reopen read only, with Edit report as V2/V3 starting a deliberate revision. Every encounter has a separate General notes box, saved with each version and included in the report. The patient record’s Episodes tab lists each episode’s encounters underneath, newest first. Background ward updates wait while the encounter is open, including loading, saving and history, then resume when it closes. Corrections append a version to the same encounter; current care updates together, while older records remain in history.','Handover › Encounter'],
        ['📝','Handover fields save on change','Ward, bed and notes save when you change a field and leave it. Rows remain editable on a computer and phone, without a row Edit / Save button.','Handover'],
        ['🏥','Handover archived at 4 pm','The ward sheet is saved automatically every day — now as lightweight data (the sheet as HTML, a few KB), not a picture — and kept for reference.','Handover › Archived'],
        ['📤','Post-op discharge date','Discharging from the handover writes today onto the operation’s discharge date on the patient form.','Handover'],
        ['↻','Refashioning supersedes the old stoma','Recording a refashioning closes the stoma it replaced ("Superseded") and makes the new one current.','Registry › Stomas'],
        ['🧷','Refashioned stoma needs an appliance','A refashioning has a new stoma ID. Select the appliance for that ID in handover; the old appliance stays with the old stoma history.','Registry / Handover'],
        ['↻','Refashioning folds into its stoma’s row','In New Patients a refashioning is not a new register line. Each stoma keeps one row in the month it was first formed, with any refashioning folded into that same row — stacked above the first operation, latest on top — so a patient whose only recent op was a refashioning does not appear as a fresh entry.','Registry › New Patients'],
        ['🌍','Stomas formed outside MDH kept out of the count','A patient marked “operated outside MDH” appears in Registry’s Operated Outside MDH tab, beside Fistulas & Bagging, and stays out of New Patients and the MDH operative count. Each register has its own search and filters.','Registry › Operated Outside MDH'],
        ['🔄','Latest handover appliance','All nurses see the saved appliance per present stoma. Other open handovers update automatically, with a check every 30 seconds and on returning to the page. Refreshes wait while you edit. Closed stomas and earlier selections remain in history.','Handover'],
        ['🆕','Unassigned appliance is kept','An appliance set before the stoma is on the registry still shows on the handover, and attaches to the stoma once it is recorded.','Handover'],
        ['🌍','Overseas / Gozo discharge dates','These buttons set the follow-up status and stamp today as the outcome date and effective date.','Handover'],
        ['🔪','Upcoming surgery shows up','An existing patient’s surgery date makes them appear (highlighted) at the top of the handover on the day; it clears when they are admitted.','Handover'],
        ['📍','Awaiting surgery / reversal','A sited patient (surgery day) or a planned reversal (reversal day) appears at the top of the handover automatically.','Handover'],
        ['📍','Siting diagram stays with its sites','New assessments and printed forms use the cropped black-and-white abdomen. Saved sites retain the diagram on which they were marked, so their positions do not shift. Clear all starts a fresh map on the current diagram.','Siting › Pre-operative Assessment'],
        ['↩','Closure keeps the stoma history','Saving reversal / closure closes only the selected stoma, retains its history and clears the planned reversal date. Other present stomas remain open; follow-up is updated from the remaining stomas.','Registry › Outcome'],
        ['↺','Outcome recalculated after reversion','After Yes, revert, the outcome is recalculated from the remaining record. Reverting Reversed reopens the latest closure and keeps earlier stoma history; other recorded outcome dates are retained.','Registry › Outcome'],
        ['🩹','Handover self-heal','A deceased or fully-reversed patient drops off the ward sheet on their own; someone with an open episode is pulled back if their flag drifts.','Handover'],
        ['👥','Same nurse columns everywhere','The Daily Clinic, the postop follow-up booking and the siting picker all list the same nurses for a day — rostered, TIL-In and overtime. A core nurse’s OT folds into their own column (one-letter name spelling differences included), and cancelled OT adds no column — bookings made under it stay in that nurse’s column.','Appointments / Postop / Siting'],
        ['🩺','Visit stoma assessment','Complete visit › Clinical review has one column per stoma (colour, function/output, peristomal skin and notes; lists take ＋ Add other…). Skin problems are saved as complications of that stoma; a stoma assessed Healthy resolves its open skin complications. It is saved on the visit and shown on the Review step and in visit history. Rod status and removal dates are managed in Handover; appointments leave those fields unchanged.','Appointments › Complete visit'],
        ['🚫','3 DNTUs pause follow-up','Three did-not-turn-ups in a row automatically pause the patient’s follow-up; the streak shows as "N of 3".','Appointments'],
        ['💾','DNTU save and retry protection','Save locks before availability is read. Every added past date is checked against existing appointments. Partial-save retries retain saved history and a pending due-month update without recording the same miss twice.','Appointments › DNTU'],
        ['✅','Attendance survives roster updates','Current planned duty refreshes while recorded attendance, times and remarks stay intact, including legacy late, early-departure and off/leave selections.','Clinic Calendar › Daily Attendance'],
        ['✅','Cancelled TIL / overtime clears Present','When a TIL In or overtime shift is cancelled or deleted, the person is no longer counted as Present: a core nurse now off has the mark and times cleared, and bank / extra staff listed only for that shift are removed from the saved sheet.','Clinic Calendar › Daily Attendance'],
        ['🩹','Fistulas &amp; bagging advice kept apart','A patient in the Fistulas &amp; Bagging Advice registry (a fistula, or a drain/wound needing bagging advice) is marked FISTULA or BAGGING on the handover (tag and stripe, printed too), sees the Fistula / wound manager products first in the appliance picker, gets its own column in encounters and visits (no colour or rod questions), has no nurse owner or due month, and is kept out of every stoma list and count. Each admission is an episode with its encounters.','Registry › Fistulas & Bagging / Handover'],
        ['✓','Fistula case closes at discharge','Discharge patient on a fistula row closes the admission and, unless “long-term fistula” is chosen, closes the case with today’s date (Healed / resolved). It never adds them to Postop Discharges. Admitting a closed case asks to reopen it.','Handover › Discharge patient'],
        ['🧷','Encounter appliance kept unless modified','In an encounter each stoma’s appliance is kept as it is (Keep same appliance) unless you press Modify appliance, which opens the appointment picker pages on what the stoma has now. The pick only joins the encounter; saving the encounter publishes it to the handover and episode for that stoma alone.','Handover › Encounter'],
        ['🧷','Appliance picker opens itself','On Complete visit › Appliances the picker opens automatically; “Keep same appliance” is offered first when the stoma has one on record (records it as continued unchanged), and never for a first appliance.','Appointments › Complete visit'],
        ['📆','Follow-up due month','The next due month is worked out from the visit and the patient is placed on the booking worklist.','Appointments'],
        ['🔴','Unbooked patients carry over','When a month ends, every active patient who was due and not booked moves into the current month’s Due this month list — first, in a red card saying which month they were carried over from — and keeps moving on each month until booked. For every user.','Appointments › Follow-up Planning'],
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
        ['✍️','Communication signatures and versions','Community correspondence and patient communication records are signed with the logged-in nurse and saving time. Corrections keep the earlier wording as previous versions; a stale save cannot overwrite another nurse’s newer version. Shared communication changes refresh the history after an open form closes.','Registry › Patient record › Episodes'],
        ['↩','Audit Trail — recovery capture','New database changes automatically retain compact previous and resulting field values. Related deletions can be recovered together. Restoration checks current values, keeps signed report history and records the restoration. Photograph and large-file backups are excluded. Recovery expires with its audit entry after 90 days.','Audit & Reports › Audit Trail'],
        ['🧾','Audit Trail — 90-day retention','A scheduled database cleanup permanently deletes audit entries older than 90 days each day, even if nobody opens the app. It keeps patient records, restored values, photographs and saved encounter versions. Expired audit entries and any recovery information within them cannot be retrieved. Only seven days of this cleanup job’s operational history are retained.','Audit & Reports › Audit Trail'],
        ['🧾','Cancelled siting deletion logged','After a confirmed Delete removes a cancelled siting appointment, the list and patient’s siting history update and the Audit Trail records the removal with the nurse’s signature. Other appointments and the patient’s registry and surgical records remain.','Siting › Cancelled Stoma Appointments / Audit & Reports › Audit Trail'],
        ['🏥','Saved appliances kept on readmission','A current stoma’s newest saved ward or attended-clinic appliance and accessories are kept when pressing Admit, including separate setups for multiple stomas. Cleared selections, closed stomas and new/refashioned identities are respected. The saved history is checked again before admission.','Registry › Patient record › Episodes'],
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
