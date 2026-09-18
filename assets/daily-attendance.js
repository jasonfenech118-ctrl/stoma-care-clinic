/* Staff attendance sheet with automatic Supabase saving and a dated archive. */
(function dailyAttendanceModule(root) {
  'use strict';

  const TABLE = 'daily_attendance';
  const DUTY_LABELS = {
    working: 'Day duty',
    off: 'Rest / off',
    sick_leave: 'Sick leave',
    maternity_leave: 'Maternity leave',
    study_leave: 'Study leave',
    annual_leave: 'Annual leave',
    public_holiday: 'Public holiday',
    overtime: 'Overtime',
    til_in: 'Working time in lieu',
    til_off: 'Time off in lieu',
    check: 'Needs checking'
  };
  // Attendance is only marked for people on duty: tap Present (or Absent if a
  // rostered person did not come in). Anyone who is off or on leave is left with
  // no selection — their status already comes from the roster.
  const STATUS_OPTIONS = [
    {value: 'not_recorded', label: '—'},
    {value: 'present', label: 'Present'},
    {value: 'absent', label: 'Absent'}
  ];
  const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(option => [option.value, option.label]));
  const LEAVE_CODES = new Set(['sick_leave', 'maternity_leave', 'study_leave', 'annual_leave', 'public_holiday']);
  // A person the roster shows as not working today (off, or on any leave).
  function isPlannedOff(row) {
    return row.working === false || row.planned_code === 'off' ||
      row.planned_code === 'til_off' || LEAVE_CODES.has(row.planned_code);
  }
  let loadRequest = 0;
  let recordRequest = 0;
  let rowsByKey = new Map();
  const saveTimers = new Map();
  const saveVersions = new Map();

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  // The ward's own name order (defined in the page as attOrder). Falls back to
  // alphabetical when it is not available, so the sheet always reads the same way
  // as the roster / attendance PDF rather than plain A–Z.
  function nameOrder(name) {
    return typeof root.attOrder === 'function' ? root.attOrder(name) : 99;
  }
  function byWardOrder(left, right) {
    return (nameOrder(left.name) - nameOrder(right.name)) || left.name.localeCompare(right.name);
  }

  function localDate(date = new Date()) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') +
      '-' + String(date.getDate()).padStart(2, '0');
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(value + 'T12:00:00');
    return !Number.isNaN(date.getTime()) && localDate(date) === value;
  }

  function normaliseName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function activityCode(record) {
    if (String(record.notes || '').startsWith('TIL-Off')) return 'til_off';
    if (String(record.notes || '').startsWith('TIL-In')) return 'til_in';
    return 'overtime';
  }

  function timeRange(record) {
    const match = String(record.notes || '').match(/\[\s*(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\s*\]/);
    const start = String(record.shift_start || match?.[1] || '').slice(0, 5);
    const end = String(record.shift_end || match?.[2] || '').slice(0, 5);
    return start && end ? start + '–' + end : '';
  }

  function dutySwap(notes, date) {
    if (!String(notes || '').startsWith('COD-')) return '';
    const pair = String(notes).match(/\[\s*(\d{4}-\d{2}-\d{2})\s*↔\s*(\d{4}-\d{2}-\d{2})\s*\]/);
    if (!pair) return 'Change of duty';
    if (date === pair[1]) return 'Change of duty: working on ' + pair[2] + ' instead';
    if (date === pair[2]) return 'Change of duty: working instead of ' + pair[1];
    return 'Change of duty';
  }

  function safeKey(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function buildPlannedRows(data, defaultCode) {
    const {date, staff = [], roster = [], leave = [], bank = []} = data;
    const people = new Map();

    function ensureCore(id, person = {}) {
      const key = 'staff:' + String(id);
      if (!people.has(key)) {
        people.set(key, {
          person_key: key,
          staff_id: String(id),
          bank_staff_id: null,
          person,
          name: person.full_name || 'Unknown staff member',
          role: person.role || 'Staff',
          regular: person.is_active !== false,
          roster: null,
          leave: [],
          activities: []
        });
      } else if (person.full_name) {
        const existing = people.get(key);
        existing.person = {...existing.person, ...person};
        existing.name = person.full_name;
        existing.role = person.role || existing.role;
      }
      return people.get(key);
    }

    staff.filter(person => person.is_active !== false).forEach(person => ensureCore(person.id, person));

    roster.filter(record => record.roster_date === date).forEach(record => {
      const person = ensureCore(record.staff_id, record.staff || {});
      person.roster = record;
    });

    leave.filter(record =>
      record.start_date <= date && (record.end_date || record.start_date) >= date
    ).forEach(record => {
      const person = ensureCore(record.staff_id, record.staff || {});
      if (record.leave_type === 'overtime') {
        person.activities.push({...record, code: activityCode(record)});
      } else {
        person.leave.push(record);
      }
    });

    bank.filter(record =>
      record.work_date === date && (record.status || 'active') !== 'cancelled'
    ).forEach(record => {
      const name = record.bank_staff?.full_name || '';
      const normal = normaliseName(name);
      const core = [...people.values()].filter(person => person.staff_id);
      let matches = normal ? core.filter(person => normaliseName(person.name) === normal) : [];

      if (!matches.length && normal) {
        matches = core.filter(person => {
          const candidate = normaliseName(person.name);
          return candidate && !candidate.includes(' ') && normal.startsWith(candidate + ' ');
        });
      }

      let person = matches.length === 1 ? matches[0] : null;
      if (!person) {
        const key = 'bank:' + String(record.bank_staff_id);
        if (!people.has(key)) {
          people.set(key, {
            person_key: key,
            staff_id: null,
            bank_staff_id: String(record.bank_staff_id),
            person: record.bank_staff || {},
            name: name || 'Unknown bank staff member',
            role: record.bank_staff?.role || 'Bank / overtime staff',
            regular: false,
            roster: null,
            leave: [],
            activities: []
          });
        }
        person = people.get(key);
      }
      person.activities.push({...record, code: activityCode(record)});
    });

    return [...people.values()].map(person => {
      const base = person.roster?.status ||
        (person.regular ? defaultCode(person.person, date) : null);
      const tilOff = person.activities.filter(activity => activity.code === 'til_off');
      const incoming = person.activities.filter(activity => activity.code !== 'til_off');
      const absences = [...new Set([
        ...(LEAVE_CODES.has(base) ? [base] : []),
        ...person.leave.map(record => record.leave_type)
      ])];

      let plannedCode;
      let working;
      let source;

      if (tilOff.length) {
        plannedCode = 'til_off';
        working = false;
        source = 'Recorded time off in lieu';
      } else if (
        absences.length > 1 ||
        absences.some(code => !LEAVE_CODES.has(code)) ||
        (absences.length && (incoming.length || base === 'overtime'))
      ) {
        plannedCode = 'check';
        working = null;
        source = 'Conflicting duty or leave records';
      } else if (absences.length) {
        plannedCode = absences[0];
        working = false;
        source = person.leave.length ? 'Recorded leave' : 'Roster entry';
      } else if (incoming.length) {
        plannedCode = incoming.some(activity => activity.code === 'til_in') ? 'til_in' : 'overtime';
        working = true;
        source = plannedCode === 'til_in' ? 'Recorded time in lieu' : 'Recorded overtime';
      } else if (base && DUTY_LABELS[base]) {
        plannedCode = base;
        working = base === 'working' || base === 'overtime';
        source = person.roster ? 'Roster entry' : 'Usual rota';
      } else {
        plannedCode = 'check';
        working = null;
        source = 'Duty not recognised';
      }

      const swap = dutySwap(person.roster?.notes, date);
      if (swap) source += ' · ' + swap;

      const records = [
        ...(person.roster ? [person.roster] : []),
        ...person.leave,
        ...person.activities
      ];
      const hours = [...new Set(person.activities.map(timeRange).filter(Boolean))].join(', ');
      const notes = [...new Set(records.map(record =>
        String(record.notes || '').trim()
      ).filter(Boolean))].join(' · ');

      return {
        person_key: person.person_key,
        staff_id: person.staff_id,
        bank_staff_id: person.bank_staff_id,
        name: person.name,
        role: person.role,
        planned_code: plannedCode,
        planned_duty: DUTY_LABELS[plannedCode] || plannedCode,
        planned_source: source,
        planned_hours: hours,
        roster_notes: notes,
        working,
        attendance_status: 'not_recorded',
        time_in: '',
        time_out: '',
        remarks: '',
        is_new: true
      };
    }).sort(byWardOrder);
  }

  function mergeSavedRows(plannedRows, savedRows) {
    const saved = new Map((savedRows || []).map(row => [row.person_key, row]));
    const merged = plannedRows.map(planned => {
      const stored = saved.get(planned.person_key);
      if (!stored) return planned;
      saved.delete(planned.person_key);
      return {
        ...planned,
        id: stored.id,
        staff_id: stored.staff_id || planned.staff_id,
        bank_staff_id: stored.bank_staff_id || planned.bank_staff_id,
        name: stored.staff_name || planned.name,
        role: stored.staff_role || planned.role,
        planned_code: stored.planned_code || planned.planned_code,
        planned_duty: stored.planned_duty || planned.planned_duty,
        planned_source: stored.planned_source || planned.planned_source,
        planned_hours: stored.planned_hours || planned.planned_hours,
        roster_notes: stored.roster_notes || planned.roster_notes,
        attendance_status: STATUS_LABELS[stored.attendance_status] ? stored.attendance_status : 'not_recorded',
        time_in: String(stored.time_in || '').slice(0, 5),
        time_out: String(stored.time_out || '').slice(0, 5),
        remarks: stored.remarks || '',
        updated_at: stored.updated_at,
        is_new: false
      };
    });

    saved.forEach(stored => {
      merged.push({
        id: stored.id,
        person_key: stored.person_key,
        staff_id: stored.staff_id,
        bank_staff_id: stored.bank_staff_id,
        name: stored.staff_name || 'Unknown staff member',
        role: stored.staff_role || 'Staff',
        planned_code: stored.planned_code || 'check',
        planned_duty: stored.planned_duty || DUTY_LABELS.check,
        planned_source: stored.planned_source || 'Saved attendance record',
        planned_hours: stored.planned_hours || '',
        roster_notes: stored.roster_notes || '',
        working: null,
        attendance_status: STATUS_LABELS[stored.attendance_status] ? stored.attendance_status : 'not_recorded',
        time_in: String(stored.time_in || '').slice(0, 5),
        time_out: String(stored.time_out || '').slice(0, 5),
        remarks: stored.remarks || '',
        updated_at: stored.updated_at,
        is_new: false
      });
    });

    return merged.sort(byWardOrder);
  }

  function statusOptions(selected) {
    return STATUS_OPTIONS.map(option =>
      '<option value="' + option.value + '"' +
      (option.value === selected ? ' selected' : '') + '>' +
      escape(option.label) + '</option>'
    ).join('');
  }

  function renderSheet(rows) {
    if (!rows.length) {
      return '<div class="da-message" role="status">No staff or duties are recorded for this day.</div>';
    }

    return '<div class="da-sheet-wrap"><table class="da-sheet">' +
      '<thead><tr><th>Staff member</th><th>Role</th><th>Planned duty</th>' +
      '<th>Attendance</th><th>Time in</th><th>Time out</th><th>Remarks</th><th>Save</th></tr></thead>' +
      '<tbody>' + rows.map(row => {
        const plannedDetail = [row.planned_source, row.planned_hours].filter(Boolean).join(' · ');
        return '<tr id="da-row-' + safeKey(row.person_key) + '" data-attendance-key="' +
          escape(row.person_key) + '">' +
          '<td data-label="Staff member"><strong>' + escape(row.name) + '</strong></td>' +
          '<td data-label="Role">' + escape(row.role) + '</td>' +
          '<td data-label="Planned duty"><span class="da-duty da-duty-' +
          escape(row.planned_code) + '">' + escape(row.planned_duty) + '</span>' +
          '<small>' + escape(plannedDetail) + '</small></td>' +
          '<td data-label="Attendance"><select data-field="attendance_status" ' +
          'onchange="DailyAttendance.queueSave(this)">' +
          statusOptions(row.attendance_status) + '</select></td>' +
          '<td data-label="Time in"><input type="time" data-field="time_in" value="' +
          escape(row.time_in) + '" onchange="DailyAttendance.queueSave(this)"></td>' +
          '<td data-label="Time out"><input type="time" data-field="time_out" value="' +
          escape(row.time_out) + '" onchange="DailyAttendance.queueSave(this)"></td>' +
          '<td data-label="Remarks"><input type="text" maxlength="500" data-field="remarks" value="' +
          escape(row.remarks) + '" placeholder="Optional" oninput="DailyAttendance.queueSave(this)"></td>' +
          '<td data-label="Save"><span class="da-row-save" data-save-state>' +
          (row.is_new ? 'Preparing…' : 'Saved') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function countsFromRows(rows) {
    const counts = {total: rows.length, present: 0, absent: 0, off: 0, pending: 0};
    rows.forEach(row => {
      if (row.attendance_status === 'present') counts.present++;
      else if (row.attendance_status === 'absent') counts.absent++;
      else if (isPlannedOff(row)) counts.off++;   // rostered off / on leave — no mark needed
      else counts.pending++;                       // rostered on duty, not yet marked
    });
    return counts;
  }

  function renderSummary(rows) {
    const counts = countsFromRows(rows);
    return '<div class="da-stat da-stat-total"><strong>' + counts.total +
      '</strong><span>Staff listed</span></div>' +
      '<div class="da-stat da-stat-present"><strong>' + counts.present +
      '</strong><span>Present</span></div>' +
      '<div class="da-stat da-stat-absent"><strong>' + counts.absent +
      '</strong><span>Absent</span></div>' +
      '<div class="da-stat"><strong>' + counts.off +
      '</strong><span>Off / leave</span></div>' +
      '<div class="da-stat"><strong>' + counts.pending +
      '</strong><span>Not recorded</span></div>';
  }

  function rowPayload(row, date, actor) {
    return {
      attendance_date: date,
      person_key: row.person_key,
      staff_id: row.staff_id || null,
      bank_staff_id: row.bank_staff_id || null,
      staff_name: row.name,
      staff_role: row.role || null,
      planned_code: row.planned_code || null,
      planned_duty: row.planned_duty || null,
      planned_source: row.planned_source || null,
      planned_hours: row.planned_hours || null,
      roster_notes: row.roster_notes || null,
      attendance_status: row.attendance_status || 'not_recorded',
      time_in: row.time_in || null,
      time_out: row.time_out || null,
      remarks: row.remarks || null,
      updated_by: actor?.email || actor?.name || 'Logged-in user'
    };
  }

  function setGlobalSave(message, tone = '') {
    const host = root.document.getElementById('da-autosave');
    if (!host) return;
    host.textContent = message;
    host.className = 'da-autosave' + (tone ? ' ' + tone : '');
  }

  function setRowSave(personKey, message, tone = '') {
    const row = root.document.getElementById('da-row-' + safeKey(personKey));
    const host = row?.querySelector('[data-save-state]');
    if (!host) return;
    host.textContent = message;
    host.className = 'da-row-save' + (tone ? ' ' + tone : '');
  }

  function readRowElement(rowElement) {
    const key = rowElement.dataset.attendanceKey;
    const base = rowsByKey.get(key);
    if (!base) return null;
    const read = field => rowElement.querySelector('[data-field="' + field + '"]')?.value || '';
    return {
      ...base,
      attendance_status: read('attendance_status') || 'not_recorded',
      time_in: read('time_in'),
      time_out: read('time_out'),
      remarks: read('remarks').trim()
    };
  }

  function refreshVisibleSummary() {
    const visible = [...root.document.querySelectorAll('#da-results tr[data-attendance-key]')]
      .map(readRowElement).filter(Boolean);
    const summary = root.document.getElementById('da-summary');
    if (summary) summary.innerHTML = renderSummary(visible);
  }

  async function actorFrom(options) {
    try {
      return typeof options.actor === 'function' ? await options.actor() : {};
    } catch (_) {
      return {};
    }
  }

  async function persistInitialRows(rows, date, options, request) {
    const fresh = rows.filter(row => row.is_new);
    if (!fresh.length) {
      setGlobalSave('All changes saved', 'saved');
      return true;
    }

    setGlobalSave('Creating today’s attendance sheet…', 'saving');
    fresh.forEach(row => setRowSave(row.person_key, 'Saving…', 'saving'));
    const actor = await actorFrom(options);
    const {error} = await options.db.from(TABLE).upsert(
      fresh.map(row => rowPayload(row, date, actor)),
      {onConflict: 'attendance_date,person_key'}
    );

    if (request !== loadRequest) return false;
    if (error) {
      setGlobalSave('Could not auto-save. Run the attendance Supabase SQL, then refresh.', 'error');
      fresh.forEach(row => setRowSave(row.person_key, 'Not saved', 'error'));
      return false;
    }

    fresh.forEach(row => {
      row.is_new = false;
      setRowSave(row.person_key, 'Saved', 'saved');
    });
    setGlobalSave('All changes saved', 'saved');
    return true;
  }

  async function load(options) {
    const dateInput = root.document.getElementById('da-date');
    const host = root.document.getElementById('da-results');
    if (!dateInput || !host) return;

    const request = ++loadRequest;
    if (!dateInput.dataset.initialized) {
      dateInput.value = localDate();
      dateInput.dataset.initialized = 'true';
    }
    const date = dateInput.value;
    const heading = root.document.getElementById('da-date-label');
    const holidayHost = root.document.getElementById('da-holiday');

    heading.textContent = validDate(date) ? options.formatDate(date) : '';
    const holiday = validDate(date) ? options.holiday(date) : '';
    holidayHost.textContent = holiday ? 'Public holiday: ' + holiday : '';
    holidayHost.hidden = !holiday;

    if (!validDate(date)) {
      host.removeAttribute('aria-busy');
      host.innerHTML = '<div class="da-message" role="status">Choose a date to open the attendance sheet.</div>';
      return;
    }

    host.setAttribute('aria-busy', 'true');
    host.innerHTML = '<div class="da-message" role="status">Opening attendance sheet…</div>';
    setGlobalSave('Loading…', 'saving');

    try {
      const results = await Promise.all([
        options.fetchRows(() => options.db.from('staff').select('*').eq('is_active', true).order('full_name')),
        options.fetchRows(() => options.db.from('roster').select('*, staff(id,full_name,role)').eq('roster_date', date).order('id')),
        options.fetchRows(() => options.db.from('leave_records').select('*, staff(id,full_name,role)').lte('start_date', date).gte('end_date', date).order('id')),
        options.fetchRows(() => options.db.from('bank_staff_assignments').select('*, bank_staff(id,full_name,role)').eq('work_date', date).order('id')),
        options.fetchRows(() => options.db.from(TABLE).select('*').eq('attendance_date', date).order('staff_name'))
      ]);

      if (request !== loadRequest) return;
      const failed = results.find(result => result.error);
      if (failed) throw failed.error;

      const planned = buildPlannedRows({
        date,
        staff: results[0].rows,
        roster: results[1].rows,
        leave: results[2].rows,
        bank: results[3].rows
      }, options.defaultCode);
      const rows = mergeSavedRows(planned, results[4].rows);
      rowsByKey = new Map(rows.map(row => [row.person_key, row]));

      const summary = root.document.getElementById('da-summary');
      if (summary) summary.innerHTML = renderSummary(rows);
      host.innerHTML = renderSheet(rows);
      await persistInitialRows(rows, date, options, request);
    } catch (error) {
      if (request !== loadRequest) return;
      const message = String(error?.message || error || '');
      const setup = /daily_attendance|schema cache|relation/i.test(message);
      setGlobalSave(setup ? 'Database setup required' : 'Could not load attendance', 'error');
      host.innerHTML = '<div class="da-message da-error" role="alert">' +
        (setup
          ? 'Daily Attendance needs its Supabase table. Run <strong>sql/add-daily-attendance.sql</strong>, then refresh this page.'
          : 'Could not load the attendance sheet. Refresh to try again.') +
        '</div>';
    } finally {
      if (request === loadRequest) host.removeAttribute('aria-busy');
    }
  }

  async function saveElement(element, version, options) {
    const rowElement = element.closest('tr[data-attendance-key]');
    if (!rowElement) return;
    const row = readRowElement(rowElement);
    const date = root.document.getElementById('da-date')?.value;
    if (!row || !validDate(date)) return;

    rowsByKey.set(row.person_key, row);
    refreshVisibleSummary();
    setRowSave(row.person_key, 'Saving…', 'saving');
    setGlobalSave('Saving changes…', 'saving');

    const actor = await actorFrom(options);
    const {error} = await options.db.from(TABLE).upsert(
      rowPayload(row, date, actor),
      {onConflict: 'attendance_date,person_key'}
    );

    if (saveVersions.get(row.person_key) !== version) return;
    if (error) {
      setRowSave(row.person_key, 'Not saved', 'error');
      setGlobalSave('A change could not be saved', 'error');
      return;
    }

    setRowSave(row.person_key, 'Saved', 'saved');
    const anySaving = [...root.document.querySelectorAll('[data-save-state]')]
      .some(node => node.textContent === 'Saving…');
    if (!anySaving) setGlobalSave('All changes saved', 'saved');
  }

  function queueSave(element) {
    const rowElement = element.closest('tr[data-attendance-key]');
    const key = rowElement?.dataset.attendanceKey;
    if (!key || typeof root.dailyAttendanceSaveOptions !== 'function') return;
    refreshVisibleSummary();
    const version = (saveVersions.get(key) || 0) + 1;
    saveVersions.set(key, version);
    clearTimeout(saveTimers.get(key));
    setRowSave(key, 'Waiting…', 'saving');
    setGlobalSave('Unsaved changes…', 'saving');
    saveTimers.set(key, setTimeout(() => {
      saveTimers.delete(key);
      saveElement(element, version, root.dailyAttendanceSaveOptions());
    }, 600));
  }

  function changeDay(amount) {
    const input = root.document.getElementById('da-date');
    if (!input) return;
    const date = new Date((validDate(input.value) ? input.value : localDate()) + 'T12:00:00');
    date.setDate(date.getDate() + amount);
    input.value = localDate(date);
    input.dataset.initialized = 'true';
    root.loadDailyAttendance();
  }

  function today() {
    const input = root.document.getElementById('da-date');
    if (!input) return;
    input.value = localDate();
    input.dataset.initialized = 'true';
    root.loadDailyAttendance();
  }

  function aggregateRecords(rows) {
    const groups = new Map();
    (rows || []).forEach(row => {
      if (!groups.has(row.attendance_date)) {
        groups.set(row.attendance_date, {
          date: row.attendance_date,
          rows: 0,
          present: 0,
          absent: 0,
          off: 0,
          pending: 0,
          last_saved: row.updated_at || row.created_at || ''
        });
      }
      const group = groups.get(row.attendance_date);
      group.rows++;
      if (row.attendance_status === 'present') group.present++;
      else if (row.attendance_status === 'absent') group.absent++;
      else if (isPlannedOff(row)) group.off++;
      else group.pending++;
      const stamp = row.updated_at || row.created_at || '';
      if (stamp > group.last_saved) group.last_saved = stamp;
    });
    return [...groups.values()].sort((left, right) => right.date.localeCompare(left.date));
  }

  function formatStamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-MT', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function renderRecords(groups) {
    if (!groups.length) {
      return '<div class="da-message" role="status">No saved attendance sheets match this date.</div>';
    }
    return '<div class="da-records-wrap"><table class="da-records">' +
      '<thead><tr><th>Date</th><th>Staff</th><th>Present</th>' +
      '<th>Absent</th><th>Off / leave</th><th>Not recorded</th><th>Last saved</th><th></th></tr></thead>' +
      '<tbody>' + groups.map(group =>
        '<tr><td data-label="Date"><strong>' + escape(group.date) + '</strong></td>' +
        '<td data-label="Staff">' + group.rows + '</td>' +
        '<td data-label="Present">' + group.present + '</td>' +
        '<td data-label="Absent">' + group.absent + '</td>' +
        '<td data-label="Off / leave">' + group.off + '</td>' +
        '<td data-label="Not recorded">' + group.pending + '</td>' +
        '<td data-label="Last saved">' + escape(formatStamp(group.last_saved)) + '</td>' +
        '<td data-label="Open"><button class="da-open-record" onclick="downloadAttendanceRecordPdf(\'' +
        escape(group.date) + '\')">⤓ Open PDF</button> ' +
        '<button class="da-open-record da-open-edit" onclick="openDailyAttendanceRecord(\'' +
        escape(group.date) + '\')">Edit</button></td></tr>'
      ).join('') + '</tbody></table></div>';
  }

  async function loadRecords(options) {
    const host = root.document.getElementById('ar-results');
    const summary = root.document.getElementById('ar-summary');
    if (!host) return;
    const request = ++recordRequest;
    const date = root.document.getElementById('ar-date')?.value || '';

    host.setAttribute('aria-busy', 'true');
    host.innerHTML = '<div class="da-message" role="status">Loading saved attendance sheets…</div>';

    try {
      const result = await options.fetchRows(() => {
        let query = options.db.from(TABLE).select('*').order('attendance_date', {ascending: false});
        if (validDate(date)) query = query.eq('attendance_date', date);
        return query;
      });
      if (request !== recordRequest) return;
      if (result.error) throw result.error;
      const groups = aggregateRecords(result.rows);
      if (summary) {
        const pending = groups.reduce((total, group) => total + group.pending, 0);
        summary.innerHTML =
          '<div class="da-stat da-stat-total"><strong>' + groups.length +
          '</strong><span>Saved days</span></div>' +
          '<div class="da-stat"><strong>' + result.rows.length +
          '</strong><span>Staff records</span></div>' +
          '<div class="da-stat da-stat-attention"><strong>' + pending +
          '</strong><span>Not recorded</span></div>';
      }
      host.innerHTML = renderRecords(groups);
    } catch (error) {
      if (request !== recordRequest) return;
      const setup = /daily_attendance|schema cache|relation/i.test(String(error?.message || error || ''));
      host.innerHTML = '<div class="da-message da-error" role="alert">' +
        (setup
          ? 'Attendance Records needs its Supabase table. Run <strong>sql/add-daily-attendance.sql</strong>, then refresh.'
          : 'Could not load saved attendance sheets. Refresh to try again.') +
        '</div>';
    } finally {
      if (request === recordRequest) host.removeAttribute('aria-busy');
    }
  }

  function clearRecordFilter() {
    const input = root.document.getElementById('ar-date');
    if (input) input.value = '';
    root.loadAttendanceRecords();
  }

  const api = {
    buildPlannedRows,
    mergeSavedRows,
    aggregateRecords,
    countsFromRows,
    renderSheet,
    renderRecords,
    validDate,
    load,
    loadRecords,
    queueSave,
    changeDay,
    today,
    clearRecordFilter
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DailyAttendance = api;
})(globalThis);
