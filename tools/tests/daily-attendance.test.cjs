'use strict';
(function attendanceTests() {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(__dirname + '/../../assets/daily-attendance.js', 'utf8');

  function app() {
    const elements = {};
    for (const id of [
      'da-date','da-results','da-date-label','da-holiday','da-summary','da-autosave',
      'ar-results','ar-summary','ar-date'
    ]) {
      elements[id] = {
        value: '', innerHTML: '', textContent: '', className: '', hidden: false,
        dataset: {}, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        querySelector() { return null; }
      };
    }
    const root = {
      document: {
        getElementById: id => elements[id] || null,
        querySelectorAll: () => []
      },
      loadDailyAttendance() {},
      loadAttendanceRecords() {},
      setTimeout,
      clearTimeout
    };
    vm.runInNewContext(source, root);
    return {api: root.DailyAttendance, elements, root};
  }

  const day = '2026-09-17';
  const nurse = (id, full_name = id) => ({id, full_name, role: 'Nurse', is_active: true});
  const regular = person => person.id === 'off' ? 'off' : 'working';

  function planned(data, defaults = regular) {
    return app().api.buildPlannedRows({
      date: day, staff: [], roster: [], leave: [], bank: [], ...data
    }, defaults);
  }

  function leave(staff_id, leave_type, notes = '', start_date = day, end_date = day) {
    return {staff_id, staff: nurse(staff_id), leave_type, notes, start_date, end_date};
  }

  function bank(id, name, notes = '', status = 'active') {
    return {
      bank_staff_id: id,
      bank_staff: {id, full_name: name, role: 'Nurse'},
      work_date: day,
      shift_start: '07:00:00',
      shift_end: '13:00:00',
      notes,
      status
    };
  }

  test('roster overrides the usual rota and explains a change of duty', () => {
    const result = planned({
      staff: [nurse('day'), nurse('off'), nurse('swap')],
      roster: [{
        staff_id: 'swap', staff: nurse('swap'), roster_date: day, status: 'off',
        notes: 'COD-normal [2026-09-17 ↔ 2026-09-19] [Day Off]'
      }]
    });
    assert.equal(result.find(row => row.person_key === 'staff:day').working, true);
    assert.equal(result.find(row => row.person_key === 'staff:off').working, false);
    const swap = result.find(row => row.person_key === 'staff:swap');
    assert.equal(swap.working, false);
    assert.match(swap.planned_source, /working on 2026-09-19 instead/);
  });

  test('multi-day leave applies on both boundaries', () => {
    const data = {
      staff: [nurse('a')],
      leave: [leave('a', 'annual_leave', '', '2026-09-16', '2026-09-18')]
    };
    for (const date of ['2026-09-16', '2026-09-17', '2026-09-18']) {
      const result = app().api.buildPlannedRows({...data, date, roster: [], bank: []}, regular);
      assert.equal(result[0].planned_code, 'annual_leave');
      assert.equal(result[0].attendance_status, 'off_leave');
    }
  });

  test('TIL Off wins over ordinary duty and overtime', () => {
    const result = planned({
      staff: [nurse('a')],
      leave: [
        leave('a', 'overtime', 'TIL-Off: 6h [07:00–13:00]'),
        leave('a', 'overtime', 'Core OT: [07:00–13:00]')
      ]
    })[0];
    assert.equal(result.planned_code, 'til_off');
    assert.equal(result.working, false);
    assert.equal(result.planned_hours, '07:00–13:00');
  });

  test('leave and incoming overtime are flagged instead of counting staff present', () => {
    const result = planned({
      staff: [nurse('a')],
      leave: [
        leave('a', 'sick_leave'),
        leave('a', 'overtime', 'Core OT: [07:00–13:00]')
      ]
    })[0];
    assert.equal(result.planned_code, 'check');
    assert.equal(result.working, null);
    assert.equal(result.attendance_status, 'not_recorded');
  });

  test('bank assignments deduplicate an identifiable core nurse and ignore cancelled entries', () => {
    const result = planned({
      staff: [nurse('j', 'Jason')],
      bank: [
        bank('j-bank', 'Jason Fenech'),
        bank('extra', 'Extra Nurse'),
        bank('cancelled', 'Cancelled Nurse', '', 'cancelled')
      ]
    });
    assert.equal(result.length, 2);
    assert.equal(result.filter(row => row.name === 'Cancelled Nurse').length, 0);
    assert.equal(result.find(row => row.person_key === 'staff:j').planned_code, 'overtime');
  });

  test('ambiguous names are retained as separate bank attendance rows', () => {
    const result = planned({
      staff: [nurse('a', 'Sam A'), nurse('b', 'Sam B')],
      bank: [bank('c', 'Sam C')]
    });
    assert.equal(result.length, 3);
    assert.ok(result.some(row => row.person_key === 'bank:c'));
  });

  test('saved actual attendance overrides defaults while preserving archived staff', () => {
    const api = app().api;
    const current = planned({staff: [nurse('a', 'Alice')]});
    const saved = [{
      id: 'saved-1', attendance_date: day, person_key: 'staff:a',
      staff_name: 'Alice Archived', staff_role: 'Senior Nurse',
      planned_code: 'working', planned_duty: 'Day duty',
      attendance_status: 'late', time_in: '07:15:00', time_out: '13:00:00',
      remarks: 'Traffic'
    }, {
      id: 'saved-2', attendance_date: day, person_key: 'staff:old',
      staff_name: 'Previous Nurse', staff_role: 'Nurse',
      planned_code: 'working', planned_duty: 'Day duty',
      attendance_status: 'present', time_in: '07:00:00', time_out: '13:00:00'
    }];
    const merged = api.mergeSavedRows(current, saved);
    assert.equal(merged.length, 2);
    const alice = merged.find(row => row.person_key === 'staff:a');
    assert.equal(alice.name, 'Alice Archived');
    assert.equal(alice.attendance_status, 'late');
    assert.equal(alice.time_in, '07:15');
    assert.equal(alice.is_new, false);
    assert.ok(merged.some(row => row.name === 'Previous Nurse'));
  });

  test('attendance counts keep incomplete records visible', () => {
    const counts = app().api.countsFromRows([
      {attendance_status: 'present'},
      {attendance_status: 'late'},
      {attendance_status: 'left_early'},
      {attendance_status: 'absent'},
      {attendance_status: 'off_leave'},
      {attendance_status: 'not_recorded'}
    ]);
    assert.deepEqual(counts, {total: 6, present: 1, late: 1, early: 1, absent: 1, off: 1, pending: 1});
  });

  test('record archive aggregates dates independently and newest first', () => {
    const groups = app().api.aggregateRecords([
      {attendance_date: '2026-09-16', attendance_status: 'present', updated_at: '2026-09-16T09:00:00Z'},
      {attendance_date: day, attendance_status: 'late', updated_at: '2026-09-17T08:00:00Z'},
      {attendance_date: day, attendance_status: 'not_recorded', updated_at: '2026-09-17T09:00:00Z'}
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].date, day);
    assert.equal(groups[0].attention, 1);
    assert.equal(groups[0].pending, 1);
    assert.equal(groups[0].last_saved, '2026-09-17T09:00:00Z');
  });

  test('sheet and archive escape stored names and remarks', () => {
    const api = app().api;
    const sheet = api.renderSheet([{
      person_key: 'staff:a', name: '<img src=x>', role: '<b>Nurse</b>',
      planned_code: 'working', planned_duty: 'Day duty', planned_source: 'Roster',
      planned_hours: '', attendance_status: 'present', time_in: '', time_out: '',
      remarks: '" onfocus="bad()', is_new: false
    }]);
    assert.ok(!sheet.includes('<img '));
    assert.ok(!sheet.includes('<b>'));
    assert.match(sheet, /&lt;img/);
    assert.match(sheet, /&quot; onfocus=&quot;bad/);
    const records = api.renderRecords([{
      date: "2026-09-17<script>", rows: 1, present: 1, attention: 0,
      absent: 0, off: 0, pending: 0, last_saved: ''
    }]);
    assert.ok(!records.includes('<script>'));
  });

  test('date validation accepts leap day and rejects impossible dates', () => {
    const api = app().api;
    assert.equal(api.validDate('2028-02-29'), true);
    for (const value of ['2026-02-29', '2026-13-01', '', '2026-09-17<script>']) {
      assert.equal(api.validDate(value), false);
    }
  });

  function database(fixtures = {}) {
    const upserts = [];
    return {
      upserts,
      from(table) {
        const query = {
          table,
          select() { return query; },
          eq() { return query; },
          gte() { return query; },
          lte() { return query; },
          order() { return query; },
          async upsert(payload) {
            upserts.push({table, payload});
            return {error: fixtures.upsertError || null};
          }
        };
        return query;
      }
    };
  }

  function options(db, fixtures = {}) {
    return {
      db,
      defaultCode: regular,
      holiday: () => null,
      formatDate: value => value,
      actor: async () => ({email: 'nurse@example.test'}),
      fetchRows: async build => {
        const table = build().table;
        return {rows: fixtures[table] || [], error: fixtures.errors?.[table] || null};
      }
    };
  }

  test('opening an unsaved day creates its attendance sheet automatically', async () => {
    const {api, elements} = app();
    elements['da-date'].value = day;
    elements['da-date'].dataset.initialized = 'true';
    const db = database();
    await api.load(options(db, {staff: [nurse('a', 'Alice')]}));
    assert.equal(db.upserts.length, 1);
    assert.equal(db.upserts[0].table, 'daily_attendance');
    assert.equal(db.upserts[0].payload[0].attendance_date, day);
    assert.equal(db.upserts[0].payload[0].staff_name, 'Alice');
    assert.equal(db.upserts[0].payload[0].updated_by, 'nurse@example.test');
    assert.match(elements['da-results'].innerHTML, /Alice/);
  });

  test('an already-saved sheet is loaded without overwriting actual attendance', async () => {
    const {api, elements} = app();
    elements['da-date'].value = day;
    elements['da-date'].dataset.initialized = 'true';
    const db = database();
    await api.load(options(db, {
      staff: [nurse('a', 'Alice')],
      daily_attendance: [{
        person_key: 'staff:a', attendance_date: day, staff_name: 'Alice',
        staff_role: 'Nurse', planned_code: 'working', planned_duty: 'Day duty',
        attendance_status: 'present', time_in: '07:00:00', time_out: '13:00:00'
      }]
    }));
    assert.equal(db.upserts.length, 0);
    assert.match(elements['da-results'].innerHTML, /value="present" selected/);
  });

  test('database setup errors produce a clear action instead of an empty register', async () => {
    const {api, elements} = app();
    elements['da-date'].value = day;
    elements['da-date'].dataset.initialized = 'true';
    const db = database();
    await api.load(options(db, {
      staff: [nurse('a')],
      errors: {daily_attendance: {message: "relation 'daily_attendance' does not exist"}}
    }));
    assert.match(elements['da-results'].innerHTML, /add-daily-attendance\.sql/);
    assert.match(elements['da-autosave'].textContent, /Database setup required/);
  });
})();
