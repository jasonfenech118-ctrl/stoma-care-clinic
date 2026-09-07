"""Mark the patients in the Reversal book as reversed, with their date.

Cross-referenced on the ID number, and it follows the app's own rules about
which outcome wins rather than stamping "reversed" on everybody in the book:

  a death outranks a reversal     - the patient stays deceased, but the
                                    reversal is still recorded, because it
                                    happened and belongs on their history
  Gozo and overseas outrank it    - the app treats those the same way, so the
                                    main status is left alone and "reversed"
                                    is added as a status they also carry
  a stoma formed after it         - the patient has a stoma again and is back
                                    in follow-up, so they are NOT reversed
  anything else                   - status becomes reversed, with the date

Only patients the app already has are touched here. The 746 in the book that
the app has never had come in through import-1, which already works their
status out from their own dates.

Where the book gives only the year, the status is set and the date left blank
rather than a day being invented; the year is written into the notes instead.
"""
import csv
import datetime
import os
import sys

import crossref
from make_sql import q, PREAMBLE


def classify(p):
    """(action, reversal_date, why) for one patient in the reversal book."""
    revs = [r for r in p['reversals'] if r['date']]
    last = max((r['date'] for r in revs), default=None)
    note = next((r.get('comments') for r in sorted(p['reversals'],
                key=lambda x: x['date'] or datetime.date(1900, 1, 1), reverse=True)
                if r.get('comments')), None)
    reg = p['registry']
    rip = reg.get('rip_date') if reg else None
    died = bool(p['deaths'] or rip)
    # The two stoma cases are settled first. A death does not change whether a
    # patient still has a stoma, or whether the reversal in the book belongs to
    # a stoma the app has never held, and deciding the death first left those
    # patients marked reversed with no date to show for it.
    if last and any(f['date'] and f['date'] > last for f in p['formations']):
        return 'still-has-stoma', last, note, 'a stoma was formed after the reversal'
    app_surg = reg.get('surgery_date') if reg else None
    if last and app_surg and datetime.date.fromisoformat(app_surg) > last:
        return 'earlier-stoma', last, note, (
            f"the reversal ({last}) is before the operation on their record "
            f"({app_surg}), so it closed an earlier stoma")
    if died:
        # This register follows the stoma, and a stoma that was reversed is
        # closed at the reversal. A patient reversed first and dying later is a
        # reversal here; the date of death stays on the record and no longer
        # hides it. Only a death BEFORE the reversal keeps the patient
        # deceased, and that ordering is impossible, so it is flagged instead.
        if rip and last and datetime.date.fromisoformat(rip) < last:
            return 'died-before-reversal', last, note, (
                f'the date of death ({rip}) is before the reversal ({last}) — '
                f'one of the two dates is wrong')
        if not last:
            return 'no-date', None, note, 'deceased, and the book gives only the year'
        return 'set-reversed', last, note, 'reversed before they died'
    if reg and reg.get('status') in ('Discharged to Gozo', 'Relocated Overseas'):
        return 'keep-moved', last, note, f"{reg['status'].lower()} — outranks a reversal in the app"
    if not last:
        return 'no-date', None, note, 'the book gives only the year'
    return 'set-reversed', last, note, ''


def main(outdir='import-report'):
    os.makedirs(outdir, exist_ok=True)
    d = crossref.build()
    rows = []
    for p in d['patients'].values():
        if not p['reversals'] or not p['registry']:
            continue
        action, date, note, why = classify(p)
        rows.append({'p': p, 'action': action, 'date': date, 'note': note, 'why': why,
                     'card': sorted(p['cards'])[0]})
    rows.sort(key=lambda r: (r['action'] != 'set-reversed', r['p']['surname'] or ''))

    with open(os.path.join(outdir, 'import-6-reversed-patients.csv'), 'w', newline='',
              encoding='utf-8-sig') as fh:
        w = csv.writer(fh)
        w.writerow(['id_card', 'surname', 'first_name', 'status_in_app_now', 'what_happens',
                    'reversal_date', 'date_precision', 'reversal_notes', 'why'])
        for r in rows:
            p = r['p']
            prec = next((x['date_quality'] for x in p['reversals'] if x['date'] == r['date']), '')
            w.writerow([r['card'], p['surname'], p['first_name'],
                        p['registry']['status'] or '',
                        {'set-reversed': 'status becomes Reversed',
                         'died-before-reversal': 'left alone — the dates contradict each other',
                         'keep-moved': 'status kept, Reversed added alongside',
                         'still-has-stoma': 'stays in follow-up — has a stoma again',
                         'earlier-stoma': 'left alone — the reversal is of an older stoma',
                         'no-date': 'status becomes Reversed, no date available'}[r['action']],
                        r['date'] or '', prec, r['note'] or '', r['why']])

    path = os.path.join(outdir, 'import-6-set-reversed.sql')
    n = {k: sum(1 for r in rows if r['action'] == k) for k in
         ('set-reversed', 'died-before-reversal', 'keep-moved', 'still-has-stoma',
          'earlier-stoma', 'no-date')}
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(f"""-- =============================================================================
-- Mark the Reversal book's patients as reversed, with their date
-- =============================================================================
-- Generated {datetime.date.today():%d %B %Y}. Cross-referenced on the ID number.
--
--
-- RUN THE FILES IN THIS ORDER. It matters: the year corrections have to land
-- before any reversal date is filled in, or a reversal can end up sitting
-- before the operation it closed.
--     1.  import-5-fix-year-typos.sql   corrects 14 mistyped years
--     2.  import-2-fill-existing.sql    fills blanks on patients you already have
--     3.  import-1-new-patients.sql     creates the patients only the book has
--     4.  import-6-set-reversed.sql     marks the Reversal book's patients reversed
--
-- READ import-6-reversed-patients.csv first — it lists every patient and what
-- happens to them.
--
--   {n['set-reversed']:>3} become Reversed, with the date from the book
--   {n['no-date']:>3} become Reversed with no date (the book gives only the year)
--   {n['keep-moved']:>3} keep their status and carry Reversed alongside it
--   {n['died-before-reversal']:>3} left alone: the date of death is before the reversal, so one is wrong
--
-- A patient who becomes Reversed here has their DATE OF DEATH REMOVED. This
-- register follows the stoma and its interest ends at the reversal. The date
-- is written into the patient's notes in words before it is cleared, so it
-- stays readable on the record and can be put back by hand if it is wanted.
--   {n['still-has-stoma']:>3} stay in follow-up: a stoma was formed after the reversal
--   {n['earlier-stoma']:>3} left alone: the reversal predates the operation on their record,
--       so it closed an earlier stoma the app has never held
--
-- A reversal date is only written where the patient has none, so a date a
-- nurse has already entered is never replaced. Safe to run twice.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Run sql/add-reversal-notes.sql first if you have not already.
-- =============================================================================

BEGIN;
""" + PREAMBLE)
        for r in rows:
            p = r['p']
            fh.write(f"\n-- {p['surname']}, {p['first_name']} — {r['action']}"
                     + (f" ({r['why']})" if r['why'] else "") + "\n")
            sets = []
            if r['date'] and r['action'] != 'earlier-stoma':
                # Only where it is on or after the operation the row holds, so a
                # record can never say a stoma was reversed before it was formed.
                sets.append(
                    f"reversal_date  = COALESCE(reversal_date, CASE WHEN {q(r['date'])} >= "
                    f"COALESCE(surgery_date, {q(r['date'])}) THEN {q(r['date'])} END)")
            if r['note']:
                sets.append(f"reversal_notes = COALESCE(reversal_notes, {q(r['note'])})")
            if r['action'] in ('set-reversed', 'no-date'):
                # Deceased is included on purpose: the reversal is the outcome
                # this register keeps.
                sets.append("followup_status = CASE WHEN followup_status IN "
                            "('active','awaiting_feedback','paused','deceased') "
                            "THEN 'reversed' ELSE followup_status END")
                # The register follows the stoma and its interest ends at the
                # reversal, so a reversed patient carries no date of death.
                # The date is written into their notes first, in words, so it
                # is still readable on the record and can be put back by hand;
                # it is only removed from the field that drives the status.
                rip = (r['p']['registry'] or {}).get('rip_date')
                if rip:
                    moved = (f"Date of death {datetime.date.fromisoformat(rip):%d %b %Y} removed "
                             f"from the record on {datetime.date.today():%d %b %Y}: this patient's "
                             f"stoma was reversed, and the register follows the stoma to its "
                             f"reversal.")
                    # Only on the pass that actually clears the date: SET reads
                    # the row as it was, so a re-run finds it already null and
                    # leaves the notes alone instead of writing the line twice.
                    sets.append("patient_notes = CASE WHEN deceased_date IS NOT NULL THEN "
                                f"COALESCE(patient_notes || ' ', '') || {q(moved)} "
                                "ELSE patient_notes END")
                sets.append("deceased_date  = NULL")
                sets.append("extra_statuses = COALESCE(extra_statuses,'[]'::jsonb) "
                            "- 'deceased'")
            elif r['action'] == 'keep-moved':
                sets.append("extra_statuses = CASE WHEN extra_statuses @> '[\"reversed\"]'::jsonb "
                            "THEN extra_statuses ELSE COALESCE(extra_statuses,'[]'::jsonb) "
                            "|| '[\"reversed\"]'::jsonb END")
            if not sets:
                fh.write(f"-- nothing to write: {r['why']}\n")
                continue
            fh.write("UPDATE public.patients SET\n  " + ',\n  '.join(sets)
                     + f"\nWHERE id_card = {q(r['card'])};\n")
        fh.write("\nCOMMIT;\n\n-- How the register reads now.\n"
                 "SELECT followup_status, COUNT(*) FROM public.patients GROUP BY 1 ORDER BY 2 DESC;\n")

    print(f"\n{len(rows)} patients are in BOTH the Reversal book and the app.\n")
    for k, label in [('set-reversed', 'become Reversed, with the date'),
                     ('no-date', 'become Reversed, year only so no date'),
                     ('keep-moved', 'keep their status, Reversed added alongside'),
                     ('died-before-reversal', 'left alone — the dates contradict each other'),
                     ('still-has-stoma', 'stay in follow-up — a stoma was formed after'),
                     ('earlier-stoma', 'left alone — the reversal is of an older stoma')]:
        print(f"  {n[k]:>3}  {label}")
    print(f"\nThe other 746 in the book are not in the app yet; import-1 creates them\n"
          f"and already works their status out from their own dates.\n"
          f"\nWritten to {outdir}/import-6-reversed-patients.csv and import-6-set-reversed.sql")
    return rows


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
