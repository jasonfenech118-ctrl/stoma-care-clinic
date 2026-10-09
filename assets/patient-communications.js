/* Patient correspondence and communication records, independent of admissions.
   Data stays in Supabase; this module keeps only the open patient's history. */
(function (global) {
  'use strict';
  const kinds = {
    community: {label: 'Community correspondence', icon: 'mail', contact: 'Contact person', service: true},
    patient: {label: 'Patient communication', icon: 'message', contact: 'Patient / relative / carer', service: false}
  };
  const methods = ['Telephone', 'Email', 'In person', 'Letter', 'Other'];
  const statuses = ['Recorded', 'Awaiting response', 'Follow-up required', 'Completed'];
  const fields = ['communication_date', 'communication_time', 'method', 'direction', 'contact_name', 'service', 'subject', 'notes', 'status', 'followup_action', 'followup_date'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const icon = name => typeof global.psmIc === 'function' ? global.psmIc(name) : '';
  const date = value => value && typeof global.fmtShortDate === 'function' ? global.fmtShortDate(value) : value || '';
  const savedTime = value => value ? new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Malta', dateStyle: 'short', timeStyle: 'short'}).format(new Date(value)) : '';
  let state = {patientId: null, patient: null, rows: [], error: '', config: null};
  let generation = 0, editor = null;

  function localNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Malta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
    return {communication_date: p.year + '-' + p.month + '-' + p.day, communication_time: p.hour + ':' + p.minute};
  }
  function snapshot(record) {
    return Object.fromEntries(fields.map(f => [f, record[f] || '']));
  }
  function sorted(rows) {
    return rows.slice().sort((a, b) => (b.communication_date + (b.communication_time || '') + b.created_at + b.id).localeCompare(a.communication_date + (a.communication_time || '') + a.created_at + a.id));
  }
  async function load(patientId, config) {
    const request = ++generation;
    state = {patientId: String(patientId), patient: config.patient, rows: [], error: '', config};
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
  function recordHTML(record) {
    const versions = Array.isArray(record.versions) ? record.versions : [];
    const previous = versions.filter(v => v.version < record.version);
    const subject = record.subject || record.contact_name;
    return `<details class="pc-record">
      <summary><span class="pc-record-title"><strong>${esc(subject)}</strong><span>${esc(date(record.communication_date))}${record.communication_time ? ' · ' + esc(record.communication_time.slice(0, 5)) : ''} · ${esc(record.method)} · ${esc(record.direction)}</span></span><span class="pc-status${record.status === 'Completed' ? ' done' : record.status !== 'Recorded' ? ' pending' : ''}">${esc(record.status)}</span><span class="pc-version">V${record.version}</span></summary>
      ${detailHTML(record)}
      <div class="pc-record-foot"><span class="psm-audit">Recorded by ${esc(record.created_by_name)} · ${esc(savedTime(record.created_at))}${record.version > 1 ? '<br>Updated by ' + esc(record.updated_by_name) + ' · ' + esc(savedTime(record.updated_at)) : ''}</span><button type="button" class="psm-btn" onclick="PatientCommunications.open('${record.kind}','${record.id}')">${icon('pencil')} Edit record</button></div>
      ${previous.length ? `<details class="pc-versions"><summary>Previous versions (${previous.length})</summary>${previous.slice().reverse().map(v => `<div class="pc-old-version"><strong>V${v.version} · ${esc(v.author_name)} · ${esc(savedTime(v.saved_at))}</strong><div>${esc(date(v.snapshot.communication_date))} · ${esc(v.snapshot.method)} · ${esc(v.snapshot.direction)} · ${esc(v.snapshot.status)}</div>${detailHTML(v.snapshot)}</div>`).join('')}</details>` : ''}
    </details>`;
  }
  function historyHTML() {
    if (state.error) return `<div class="psm-card pc-error" role="alert"><strong>Could not load communication history.</strong><p>${esc(state.error)}</p><button type="button" class="psm-btn" onclick="PatientCommunications.retry()">${icon('refresh')} Retry</button></div>`;
    return Object.entries(kinds).map(([kind, meta]) => {
      const rows = state.rows.filter(r => r.kind === kind);
      return `<section class="pc-history"><div class="psm-sec-head"><h3>${icon(meta.icon)} ${meta.label}</h3><span class="psm-badge">${rows.length}</span></div><div class="psm-card">${rows.length ? rows.map(recordHTML).join('') : '<p class="pc-empty">No records yet.</p>'}</div></section>`;
    }).join('');
  }
  function optionHTML(values, selected) {
    return values.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }
  function formValues() {
    const form = global.document.getElementById('pc-form');
    return form ? Object.fromEntries(fields.map(f => [f, String(form.elements.namedItem(f)?.value || '').trim()])) : null;
  }
  function guard() {
    if (!editor) return true;
    if (editor.saving) return false;
    const values = formValues();
    return !values || JSON.stringify(values) === editor.baseline || global.confirm('Discard the changes to this communication record?');
  }
  function open(kind, recordId) {
    if (!kinds[kind] || !state.patientId || state.error) return;
    const record = recordId ? state.rows.find(r => r.id === recordId && r.kind === kind) : null;
    if (recordId && !record) return;
    const meta = kinds[kind], patient = state.patient || {};
    const values = record ? snapshot(record) : {...Object.fromEntries(fields.map(f => [f, ''])), ...localNow(), method: 'Telephone', direction: 'Outgoing', status: 'Recorded', contact_name: kind === 'patient' ? [patient.first_name, patient.surname].filter(Boolean).join(' ') : ''};
    editor = {patientId: state.patientId, kind, recordId: record ? record.id : null, requestId: record ? record.id : global.crypto.randomUUID(), version: record ? record.version : 0, config: state.config, saving: false, baseline: ''};
    const mb = global.document.getElementById('mb');
    mb.className = 'mb mb-wide';
    mb.innerHTML = `<h2>${record ? 'Edit ' : ''}${meta.label}</h2><div class="msub"><strong>${esc([patient.first_name, patient.surname].filter(Boolean).join(' '))}</strong>${patient.id_card ? ' · ' + esc(patient.id_card) : ''}${record ? ' · V' + record.version : ''}</div>
      <form id="pc-form" class="clr-form pc-form" onsubmit="PatientCommunications.save();return false;">
        <div class="row2"><label>Date<input type="date" name="communication_date" value="${esc(values.communication_date)}" required></label><label>Time (Malta)<input type="time" name="communication_time" value="${esc(values.communication_time.slice(0, 5))}"></label></div>
        <div class="row2"><label>Contact method<select name="method">${optionHTML(methods, values.method)}</select></label><label>Direction<select name="direction">${optionHTML(['Outgoing', 'Incoming'], values.direction)}</select></label></div>
        <div class="row2"><label>${meta.contact}<input name="contact_name" value="${esc(values.contact_name)}" maxlength="200" required></label>${meta.service ? `<label>Community service / organisation<input name="service" value="${esc(values.service)}" placeholder="e.g. Community nursing, GP, care home" maxlength="200" required></label>` : '<input type="hidden" name="service" value="">'}</div>
        <label>Subject<input name="subject" value="${esc(values.subject)}" maxlength="200" required></label>
        <label>Communication / advice / outcome<textarea name="notes" rows="5" maxlength="20000" required>${esc(values.notes)}</textarea></label>
        <label>Status<select name="status">${optionHTML(statuses, values.status)}</select></label>
        <label>Follow-up action<textarea name="followup_action" rows="2" maxlength="2000" placeholder="Optional">${esc(values.followup_action)}</textarea></label>
        <label>Follow-up date<input type="date" name="followup_date" value="${esc(values.followup_date)}"></label>
        ${record ? '<p class="pc-hint">Saving a correction adds a new version and keeps the previous wording.</p>' : ''}
        <div id="pc-form-error" class="pc-error" role="alert" aria-live="polite"></div>
        <div class="mact"><button type="button" class="btn-cancel" onclick="PatientCommunications.cancel()">Cancel</button><button type="submit" class="btn-save" id="pc-save">${record ? 'Save new version' : 'Save record'}</button></div>
      </form>`;
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
  async function save() {
    const current = editor, form = global.document.getElementById('pc-form');
    if (!current || current.saving || !form || !form.reportValidity()) return;
    const payload = formValues();
    const errorHost = global.document.getElementById('pc-form-error');
    if (!payload.contact_name || !payload.subject || !payload.notes || current.kind === 'community' && !payload.service) {
      errorHost.textContent = 'Please complete the contact, subject, notes and community service where shown.';
      return;
    }
    if (payload.followup_date && payload.followup_date < payload.communication_date) {
      errorHost.textContent = 'The follow-up date cannot be before the communication date.';
      return;
    }
    current.saving = true;
    errorHost.textContent = '';
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(b => b.disabled = true);
    global.document.getElementById('pc-save').textContent = 'Saving…';
    try {
      const {data, error} = await current.config.db.rpc('save_patient_communication', {p_patient_id: current.patientId, p_record_id: current.requestId, p_expected_version: current.version, p_kind: current.kind, p_payload: payload});
      if (error) throw error;
      if (!data || !data.id || String(data.patient_id) !== current.patientId) throw new Error('The saved record could not be confirmed. Please try again.');
      if (state.patientId === current.patientId) {
        state.rows = sorted([data, ...state.rows.filter(r => r.id !== data.id)]);
        current.config.onChange();
      }
      current.config.setGuard(null);
      editor = null;
      current.config.closeModal();
    } catch (error) {
      if (error.code === '40001' && state.patientId === current.patientId) {
        await load(current.patientId, current.config);
        if (state.patientId === current.patientId) current.config.onChange();
      }
      if (editor === current) {
        errorHost.textContent = error.message || 'The record could not be saved. Your wording is still here.';
        buttons.forEach(b => b.disabled = false);
        global.document.getElementById('pc-save').textContent = current.recordId ? 'Save new version' : 'Save record';
      }
    } finally {current.saving = false;}
  }
  global.PatientCommunications = {load, retry, actionsHTML, historyHTML, open, cancel, save};
})(window);
