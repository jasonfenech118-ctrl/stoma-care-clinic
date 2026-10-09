/* Communication issues and their contacts are separate from inpatient episodes.
   Supabase owns the history, signatures, current issue state and reminders. */
(function (global) {
  'use strict';
  const kinds = {
    community: {label: 'Community correspondence', icon: 'mail', contact: 'Contact person', service: true},
    patient: {label: 'Patient communication', icon: 'message', contact: 'Patient / relative / carer', service: false}
  };
  const methods = ['Telephone', 'Email', 'In person', 'Letter', 'Other'];
  const statuses = ['Recorded', 'Awaiting response', 'Follow-up required', 'Completed'];
  const statusLabel = value => value === 'Recorded' ? 'Open' : value === 'Completed' ? 'Resolved' : value;
  const fields = ['communication_date', 'communication_time', 'method', 'direction', 'contact_name', 'service', 'subject', 'notes', 'status', 'followup_action', 'followup_date', 'reminder_enabled'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const icon = name => typeof global.psmIc === 'function' ? global.psmIc(name) : '';
  const date = value => value && typeof global.fmtShortDate === 'function' ? global.fmtShortDate(value) : value || '';
  const savedTime = value => value ? new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Malta', dateStyle: 'short', timeStyle: 'short'}).format(new Date(value)) : '';
  let state = {patientId: null, patient: null, rows: [], error: '', actionError: '', config: null};
  let generation = 0, editor = null;
  const expanded = new Set(), busy = new Set();

  function localNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Malta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
    return {communication_date: p.year + '-' + p.month + '-' + p.day, communication_time: p.hour + ':' + p.minute};
  }
  function snapshot(record) {
    return Object.fromEntries(fields.map(f => [f, f === 'reminder_enabled' ? record[f] === true : record[f] || '']));
  }
  function sorted(rows) {
    const key = r => [r.communication_date, r.communication_time, r.created_at, r.id].map(v => v || '').join('');
    return rows.slice().sort((a, b) => key(b).localeCompare(key(a)));
  }
  const roots = () => state.rows.filter(r => !r.parent_id);
  const isActiveReminder = row => !row.parent_id && row.status !== 'Completed' && row.reminder_enabled === true && !!row.followup_date;
  async function load(patientId, config) {
    const request = ++generation;
    if (state.patientId !== String(patientId)) expanded.clear();
    state = {patientId: String(patientId), patient: config.patient, rows: [], error: '', actionError: '', config};
    try {
      const result = await config.fetchRows(() => config.db.from('patient_communications').select('*').eq('patient_id', patientId)
        .order('communication_date', {ascending: false}).order('communication_time', {ascending: false, nullsFirst: false}).order('created_at', {ascending: false}));
      if (request !== generation) return;
      if (result.error) throw result.error;
      state.rows = sorted((result.rows || []).filter(r => String(r.patient_id) === String(patientId)));
    } catch (error) {
      if (request === generation) state.error = error.message || 'Please try again.';
    }
  }
  async function retry() {
    const {patientId, config} = state;
    await load(patientId, config);
    if (state.patientId === patientId) config.onChange();
  }
  function actionsHTML() {
    return Object.entries(kinds).map(([kind, meta]) => `<button type="button" class="psm-btn pc-add" onclick="PatientCommunications.open('${kind}')"${state.error ? ' disabled' : ''}>${icon(meta.icon)} ${meta.label}</button>`).join('');
  }
  function detailHTML(record) {
    return `<div class="pc-detail">
      ${record.service ? `<div><strong>Community service:</strong> ${esc(record.service)}</div>` : ''}
      <div><strong>Contact:</strong> ${esc(record.contact_name)}</div>
      <div><strong>Subject:</strong> ${esc(record.subject)}</div>
      <div class="pc-notes">${esc(record.notes)}</div>
      ${record.followup_action || record.followup_date ? `<div class="pc-followup"><strong>Follow-up:</strong> ${esc(record.followup_action)}${record.followup_date ? ' · ' + esc(date(record.followup_date)) : ''}</div>` : ''}
    </div>`;
  }
  function recordHTML(record, first) {
    const previous = (Array.isArray(record.versions) ? record.versions : []).filter(v => v.version < record.version);
    return `<details class="pc-record">
      <summary><span class="pc-record-title"><strong>${first ? 'Initial communication' : esc(record.subject)}</strong><span>${esc(date(record.communication_date))}${record.communication_time ? ' · ' + esc(record.communication_time.slice(0, 5)) : ''} · ${esc(record.method)} · ${esc(record.direction)}</span></span><span class="pc-version">V${record.version}</span></summary>
      ${detailHTML(record)}
      <div class="pc-record-foot"><span class="psm-audit">Recorded by ${esc(record.created_by_name)} · ${esc(savedTime(record.created_at))}${record.version > 1 ? '<br>Updated by ' + esc(record.updated_by_name) + ' · ' + esc(savedTime(record.updated_at)) : ''}</span><button type="button" class="psm-btn" onclick="PatientCommunications.open('${esc(record.kind)}','${esc(record.id)}')">${icon('pencil')} Edit record</button></div>
      ${previous.length ? `<details class="pc-versions"><summary>Previous versions (${previous.length})</summary>${previous.slice().reverse().map(v => `<div class="pc-old-version"><strong>V${v.version} · ${esc(v.author_name)} · ${esc(savedTime(v.saved_at))}</strong><div>${esc(date(v.snapshot.communication_date))} · ${esc(v.snapshot.method)} · ${esc(v.snapshot.direction)} · ${esc(statusLabel(v.snapshot.status))}</div>${detailHTML(v.snapshot)}</div>`).join('')}</details>` : ''}
    </details>`;
  }
  function dueLabel(value) {
    const today = localNow().communication_date;
    return value < today ? 'Overdue' : value === today ? 'Due today' : 'Scheduled';
  }
  function issueHTML(issue) {
    const done = issue.status === 'Completed', contacts = state.rows.filter(r => r.parent_id === issue.id);
    const disabled = busy.has(issue.id) ? ' disabled' : '';
    return `<details class="pc-issue${done ? ' pc-issue-done' : ''}" id="pc-issue-${esc(issue.id)}"${expanded.has(issue.id) ? ' open' : ''} ontoggle="PatientCommunications.toggleIssue('${esc(issue.id)}',this.open)">
      <summary><span class="pc-record-title"><strong>${esc(issue.subject)}</strong><span>Opened ${esc(date(issue.communication_date))} · ${esc(issue.service || issue.contact_name)} · ${contacts.length + 1} contact${contacts.length ? 's' : ''}</span></span><span class="pc-status${done ? ' done' : ' pending'}">${esc(statusLabel(issue.status))}</span></summary>
      <div class="pc-issue-body">
        ${done ? `<div class="pc-hint">Resolved${issue.resolved_by_name ? ' by ' + esc(issue.resolved_by_name) : ''}${issue.resolved_at ? ' · ' + esc(savedTime(issue.resolved_at)) : ''}</div>` : ''}
        ${isActiveReminder(issue) ? `<div class="pc-followup pc-issue-reminder${dueLabel(issue.followup_date) === 'Overdue' ? ' overdue' : ''}"><strong>Reminder · ${esc(dueLabel(issue.followup_date))} · ${esc(date(issue.followup_date))}</strong><div>${esc(issue.followup_action)}</div></div>` : ''}
        <div class="pc-issue-actions">${done ? '' : `<button type="button" class="psm-btn psm-btn-primary" onclick="PatientCommunications.open('${esc(issue.kind)}',null,'${esc(issue.id)}')"${disabled}>${icon('plus')} Add update / contact</button>`}<button type="button" class="psm-btn" onclick="PatientCommunications.open('${esc(issue.kind)}','${esc(issue.id)}')"${disabled}>${icon('pencil')} Edit issue / reminder</button><button type="button" class="psm-btn ${done ? '' : 'pc-resolve'}" onclick="PatientCommunications.setResolved('${esc(issue.id)}',${!done})"${disabled}>${done ? 'Reopen issue' : '✓ Resolve issue'}</button></div>
        <div class="pc-contact-heading">Communication history</div>${sorted(contacts).map(r => recordHTML(r, false)).join('')}${recordHTML(issue, true)}
      </div></details>`;
  }
  function patientRemindersHTML() {
    const rows = roots().filter(isActiveReminder).sort((a, b) => a.followup_date.localeCompare(b.followup_date));
    return `<section class="pc-reminder-section" aria-label="Communication reminders"><div class="psm-sec-head"><h3>${icon('clock')} Communication reminders</h3><span class="psm-badge">${rows.length}</span></div><div class="psm-card">${rows.length ? rows.map(r => `<button type="button" class="pc-reminder-link${dueLabel(r.followup_date) === 'Overdue' ? ' overdue' : ''}" onclick="PatientCommunications.focus('${esc(r.id)}')"><strong>${esc(r.subject)}</strong><span>${esc(kinds[r.kind].label)} · ${esc(dueLabel(r.followup_date))} · ${esc(date(r.followup_date))}</span><span>${esc(r.followup_action)}</span></button>`).join('') : '<p class="pc-empty">No active communication reminders. Set one when adding or editing an issue.</p>'}</div></section>`;
  }
  function historyHTML() {
    if (state.error) return `<div class="psm-card pc-error" role="alert"><strong>Could not load communication history.</strong><p>${esc(state.error)}</p><button type="button" class="psm-btn" onclick="PatientCommunications.retry()">${icon('refresh')} Retry</button></div>`;
    return (state.actionError ? `<div class="pc-error" role="alert">${esc(state.actionError)}</div>` : '') + patientRemindersHTML() + Object.entries(kinds).map(([kind, meta]) => {
      const rows = roots().filter(r => r.kind === kind).sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
      const openRows = rows.filter(r => r.status !== 'Completed'), done = rows.filter(r => r.status === 'Completed');
      return `<section class="pc-history"><div class="psm-sec-head"><h3>${icon(meta.icon)} ${meta.label}</h3><span class="psm-badge">${openRows.length} open · ${done.length} resolved</span></div><div class="psm-card"><div class="pc-contact-heading">Open issues (${openRows.length})</div>${openRows.length ? openRows.map(issueHTML).join('') : '<p class="pc-empty">No open issues.</p>'}${done.length ? `<details class="pc-resolved"><summary>Resolved issues (${done.length})</summary>${done.map(issueHTML).join('')}</details>` : ''}</div></section>`;
    }).join('');
  }
  function toggleIssue(id, open) { if (open) expanded.add(id); else expanded.delete(id); }
  function focus(id) {
    const el = global.document.getElementById('pc-issue-' + id);
    if (!el) return;
    expanded.add(id);
    const resolved = el.closest('.pc-resolved');
    if (resolved) resolved.open = true;
    el.open = true;
    if (el.scrollIntoView) el.scrollIntoView({block: 'center', behavior: 'smooth'});
  }
  function optionHTML(values, selected, labels) {
    return values.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(labels ? labels(v) : v)}</option>`).join('');
  }
  function formValues() {
    const form = global.document.getElementById('pc-form');
    return form ? Object.fromEntries(fields.map(f => [f, f === 'reminder_enabled' ? form.elements.namedItem(f).checked : String(form.elements.namedItem(f)?.value || '').trim()])) : null;
  }
  function guard() {
    if (!editor) return true;
    if (editor.saving) return false;
    const values = formValues();
    return !values || JSON.stringify(values) === editor.baseline || global.confirm('Discard the changes to this communication record?');
  }
  function syncReminder() {
    const form = global.document.getElementById('pc-form');
    if (!form || !editor) return;
    const check = form.elements.namedItem('reminder_enabled'), done = form.elements.namedItem('status').value === 'Completed';
    if (done) check.checked = false;
    check.disabled = done || editor.correction;
    ['followup_action', 'followup_date'].forEach(name => { const el = form.elements.namedItem(name); el.disabled = editor.correction || !check.checked; el.required = check.checked; });
  }
  function open(kind, recordId, parentId) {
    if (!kinds[kind] || !state.patientId || state.error || editor && !guard()) return;
    const record = recordId ? state.rows.find(r => r.id === recordId && r.kind === kind) : null;
    const issue = parentId ? state.rows.find(r => r.id === parentId && r.kind === kind && !r.parent_id) : record && record.parent_id ? state.rows.find(r => r.id === record.parent_id) : record;
    if (recordId && !record || parentId && (!issue || issue.status === 'Completed')) return;
    const meta = kinds[kind], patient = state.patient || {}, correction = !!(record && record.parent_id);
    const values = record ? snapshot(record) : {...Object.fromEntries(fields.map(f => [f, ''])), ...(issue ? snapshot(issue) : {}), ...localNow(), method: 'Telephone', direction: 'Outgoing', status: issue ? issue.status : 'Recorded', contact_name: issue ? issue.contact_name : kind === 'patient' ? [patient.first_name, patient.surname].filter(Boolean).join(' ') : '', notes: '', reminder_enabled: !!(issue && issue.reminder_enabled)};
    editor = {patientId: state.patientId, kind, recordId: record ? record.id : null, parentId: record ? record.parent_id || null : parentId || null, parentVersion: issue ? issue.version : null, correction, requestId: record ? record.id : global.crypto.randomUUID(), version: record ? record.version : 0, config: state.config, saving: false, baseline: ''};
    const mb = global.document.getElementById('mb');
    mb.className = 'mb mb-wide';
    mb.innerHTML = `<h2>${parentId ? 'Add update · ' : record ? 'Edit ' : ''}${meta.label}</h2><div class="msub"><strong>${esc([patient.first_name, patient.surname].filter(Boolean).join(' '))}</strong>${patient.id_card ? ' · ' + esc(patient.id_card) : ''}${record ? ' · V' + record.version : ''}</div>
      ${parentId || correction ? `<p class="pc-issue-context"><strong>Issue:</strong> ${esc(issue.subject)}</p>` : ''}
      <form id="pc-form" class="clr-form pc-form" onsubmit="PatientCommunications.save();return false;">
        <div class="row2"><label>Date<input type="date" name="communication_date" value="${esc(values.communication_date)}" required></label><label>Time (Malta)<input type="time" name="communication_time" value="${esc(values.communication_time.slice(0, 5))}"></label></div>
        <div class="row2"><label>Contact method<select name="method">${optionHTML(methods, values.method)}</select></label><label>Direction<select name="direction">${optionHTML(['Outgoing', 'Incoming'], values.direction)}</select></label></div>
        <div class="row2"><label>${meta.contact}<input name="contact_name" value="${esc(values.contact_name)}" maxlength="200" required></label>${meta.service ? `<label>Community service / organisation<input name="service" value="${esc(values.service)}" placeholder="e.g. Community nursing, GP, care home" maxlength="200" required></label>` : '<input type="hidden" name="service" value="">'}</div>
        <label>Subject<input name="subject" value="${esc(values.subject)}" maxlength="200" required></label>
        <label>Communication / advice / outcome<textarea name="notes" rows="4" maxlength="20000" required>${esc(values.notes)}</textarea></label>
        <label>Issue status<select name="status" onchange="PatientCommunications.syncReminder()"${correction ? ' disabled' : ''}>${optionHTML(statuses, values.status, statusLabel)}</select></label>
        <fieldset class="pc-reminder-fields"><legend>${icon('clock')} Reminder</legend><label class="pc-check"><input type="checkbox" name="reminder_enabled"${values.reminder_enabled ? ' checked' : ''} onchange="PatientCommunications.syncReminder()"> Set a reminder for this issue</label>
        <label>Action / reminder<textarea name="followup_action" rows="2" maxlength="2000" placeholder="What needs following up?">${esc(values.followup_action)}</textarea></label>
        <label>Reminder date<input type="date" name="followup_date" value="${esc(values.followup_date)}"></label>
        <p class="pc-hint">Due and overdue reminders appear in the clinic bell until the issue is resolved. Resolving keeps the history.</p></fieldset>
        ${record ? `<p class="pc-hint">Saving a correction adds a new version and keeps the previous wording.${correction ? ' Change the current status or reminder from Edit issue / reminder.' : ''}</p>` : '<p class="pc-hint">This is a communication issue; saving does not open an inpatient admission.</p>'}
        <div id="pc-form-error" class="pc-error" role="alert" aria-live="polite"></div>
        <div class="mact"><button type="button" class="btn-cancel" onclick="PatientCommunications.cancel()">Cancel</button><button type="submit" class="btn-save" id="pc-save">${record ? 'Save new version' : parentId ? 'Save update' : 'Save record'}</button></div>
      </form>`;
    syncReminder();
    editor.baseline = JSON.stringify(formValues());
    state.config.setGuard(guard);
    state.config.openModal();
  }
  function cancel() {
    if (!guard()) return;
    const config = editor && editor.config;
    editor = null;
    if (config) {config.setGuard(null); config.closeModal();}
  }
  function accept(data, patientId, kind) {
    if (!data || !data.id || String(data.patient_id) !== patientId || data.kind !== kind) throw new Error('The saved record could not be confirmed. Please try again.');
    if (state.patientId !== patientId) return;
    const {issue, ...record} = data;
    if (issue && (String(issue.patient_id) !== patientId || issue.kind !== kind || issue.id !== record.parent_id || issue.parent_id)) throw new Error('The saved issue could not be confirmed. Please try again.');
    const incoming = issue ? [record, issue] : [record];
    state.rows = sorted([...incoming, ...state.rows.filter(r => !incoming.some(v => v.id === r.id))]);
    state.actionError = '';
    expanded.add(record.parent_id || record.id);
  }
  function afterSaved(config) {
    config.onChange();
    if (config.onSaved) Promise.resolve(config.onSaved()).catch(() => {});
  }
  async function save() {
    const current = editor, form = global.document.getElementById('pc-form');
    if (!current || current.saving || !form || !form.reportValidity()) return;
    const payload = formValues();
    const errorHost = global.document.getElementById('pc-form-error');
    if (!payload.contact_name || !payload.subject || !payload.notes || current.kind === 'community' && !payload.service) {
      errorHost.textContent = 'Please complete the contact, subject, notes and community service where shown.';return;
    }
    if (payload.followup_date && payload.followup_date < payload.communication_date && !current.correction) {
      errorHost.textContent = 'The reminder / follow-up date cannot be before the communication date.';return;
    }
    if (payload.reminder_enabled && (!payload.followup_date || !payload.followup_action)) {
      errorHost.textContent = 'Enter a reminder action and date, or untick Set a reminder.';return;
    }
    payload.parent_id = current.parentId || '';
    if (current.parentId && !current.recordId) payload.parent_version = current.parentVersion;
    current.saving = true;
    errorHost.textContent = '';
    const buttons = [...form.querySelectorAll('button')];buttons.forEach(b => b.disabled = true);
    global.document.getElementById('pc-save').textContent = 'Saving…';
    try {
      const {data, error} = await current.config.db.rpc('save_patient_communication', {p_patient_id: current.patientId, p_record_id: current.requestId, p_expected_version: current.version, p_kind: current.kind, p_payload: payload});
      if (error) throw error;
      accept(data, current.patientId, current.kind);
      if (state.patientId === current.patientId) afterSaved(current.config);
      current.config.setGuard(null);editor = null;current.config.closeModal();
    } catch (error) {
      if (error.code === '40001' && state.patientId === current.patientId) {
        await load(current.patientId, current.config);
        if (state.patientId === current.patientId) current.config.onChange();
      }
      if (editor === current) {
        errorHost.textContent = error.message || 'The record could not be saved. Your wording is still here.';
        buttons.forEach(b => b.disabled = false);
        global.document.getElementById('pc-save').textContent = current.recordId ? 'Save new version' : current.parentId ? 'Save update' : 'Save record';
      }
    } finally {current.saving = false;}
  }
  async function setResolved(id, done) {
    const issue = roots().find(r => r.id === id);
    if (!issue || busy.has(id) || editor || !global.confirm(done ? 'Resolve this issue and clear its active reminder? The history will be kept.' : 'Reopen this issue? Set a new reminder if follow-up is needed.')) return;
    const {patientId, config} = state;
    busy.add(id);state.actionError = '';config.onChange();
    try {
      const payload = {...snapshot(issue), status: done ? 'Completed' : 'Recorded', reminder_enabled: false, parent_id: ''};
      const {data, error} = await config.db.rpc('save_patient_communication', {p_patient_id: patientId, p_record_id: id, p_expected_version: issue.version, p_kind: issue.kind, p_payload: payload});
      if (error) throw error;
      accept(data, patientId, issue.kind);
      if (state.patientId === patientId) afterSaved(config);
    } catch (error) {
      if (error.code === '40001' && state.patientId === patientId) await load(patientId, config);
      if (state.patientId === patientId) state.actionError = error.message || 'The issue status could not be saved. Please try again.';
    } finally {busy.delete(id);if (state.patientId === patientId) config.onChange();}
  }
  async function loadReminders(config) {
    try {
      const result = await config.fetchRows(() => config.db.from('patient_communications')
        .select('id,patient_id,kind,subject,followup_action,followup_date,status,reminder_enabled,parent_id,patient:patients(first_name,surname,id_card)')
        .is('parent_id', null).eq('reminder_enabled', true).neq('status', 'Completed').lte('followup_date', config.today).order('followup_date', {ascending: true}));
      if (result.error) throw result.error;
      return {items: (result.rows || []).filter(r => kinds[r.kind] && isActiveReminder(r) && r.followup_date <= config.today), error: null};
    } catch (error) {return {items: [], error};}
  }
  function remindersHTML(result, kind) {
    if (result.error) return '<div class="rem-empty pc-error" role="alert">Communication reminders could not be checked. Reopen the bell to retry.</div>';
    const rows = (result.items || []).filter(r => !kind || r.kind === kind);
    return rows.length ? rows.map(r => `<div class="rem-row clinical-reminder-row pc-bell-reminder"><div class="clinical-reminder-copy"><div class="clinical-reminder-heading">${esc([r.patient?.first_name, r.patient?.surname].filter(Boolean).join(' ') || 'Patient')} · ${esc(r.patient?.id_card)}</div><div class="clinical-reminder-meta">${esc(kinds[r.kind].label)} · ${esc(r.followup_date < (result.today || localNow().communication_date) ? 'Overdue' : 'Due today')} · ${esc(date(r.followup_date))}</div><strong>${esc(r.subject)}</strong><div class="pc-notes">${esc(r.followup_action)}</div></div><div class="clinical-reminder-actions"><button type="button" class="ncb-btn" onclick="openCommunicationReminder('${esc(r.patient_id)}','${esc(r.id)}')">Open issue</button></div></div>`).join('') : '<div class="rem-empty">No due communication reminders.</div>';
  }
  global.PatientCommunications = {load, retry, actionsHTML, historyHTML, open, cancel, save, syncReminder, setResolved, focus, toggleIssue, loadReminders, remindersHTML};
})(window);
