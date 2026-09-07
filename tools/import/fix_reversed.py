"""Corrective: mark every Reversal-book patient reversed, by ID card.

A full import already sets this — import-1 creates the book-only patients as
Reversed and set_reversed marks the ones the app already had. But a patient
created by an EARLIER run is skipped when import-1 is run again (ON CONFLICT DO
NOTHING), so their status can be left un-reversed even though the book says
otherwise. That is what leaves the Reversal Register showing far fewer patients
than the book holds.

This writes one idempotent UPDATE keyed on the ID card, for exactly the patients
build_patient judges reversed (a stoma closed and none formed since — the same
rule the rest of the import uses). It fills a blank reversal date, sets the
status, and clears a date of death that falls on or after the reversal, which is
what the register wants: it follows the stoma and ends at the reversal. A patient
not in the list is never touched, and no patient is ever deleted.

Run it once in the Supabase SQL Editor; it is safe to re-run. If the reversed
count is still well short afterwards, the missing patients are simply not in the
database yet — run the import parts that create them (import-1 / the split
parts) first, then this.
"""
import datetime
import os
import sys

import crossref
import make_sql


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


HEADER = """-- =============================================================================
-- FIX REVERSED STATUS — mark every Reversal-book patient as Reversed
-- =============================================================================
-- Generated {when}. Run ONCE in the Supabase SQL Editor; safe to re-run.
--
-- WHY: the Reversal book names ~793 patients. A full import marks them, but a
-- patient created by an earlier run is skipped on a re-run (ON CONFLICT DO
-- NOTHING), so their status can be left un-reversed. This corrects them by ID
-- card, whatever run created them, so the Reversal Register reads true.
--
-- WHAT IT DOES, only for the {n} patients listed below (those the import judges
-- reversed — a stoma closed and none formed since):
--   * sets followup_status = 'reversed'
--   * fills reversal_date where it is blank (a date already there is kept)
--   * clears a date of death on or after the reversal (this register follows
--     the stoma and ends at the reversal); a death BEFORE it is left alone
--   * never touches a patient not in the list, and never deletes a patient.
--
-- If the reversed count is still well short of {n} afterwards, those patients
-- are not in the database yet — run the import parts that create them first.
-- =============================================================================
BEGIN;
"""

STATEMENT = """UPDATE public.patients AS t SET
  followup_status = 'reversed',
  reversal_date   = COALESCE(t.reversal_date, v.rev::date),
  deceased_date   = CASE
      WHEN t.deceased_date IS NOT NULL AND v.rev IS NOT NULL
           AND t.deceased_date >= v.rev::date THEN NULL
      ELSE t.deceased_date END
FROM (VALUES
"""

TAIL = """
) AS v(id_card, rev)
WHERE t.id_card = v.id_card;
"""


def build(d=None):
    d = d or crossref.build()
    rows = set()
    for p in d['patients'].values():
        rec = make_sql.build_patient(p)
        if rec and rec['followup_status'] == 'reversed':
            rows.add((rec['id_card'], rec.get('reversal_date') or ''))
    rows = sorted(rows)
    vals = [f"  ({q(card)}, {q(rev) if rev else 'NULL'})" for card, rev in rows]

    out = [HEADER.format(when=datetime.date.today().strftime('%d %B %Y'), n=len(rows))]
    # Batches so the file pastes into a browser editor a piece at a time.
    for i in range(0, len(vals), 400):
        batch = vals[i:i + 400]
        out.append(f"\n-- patients {i + 1}-{i + len(batch)} of {len(rows)}")
        out.append(STATEMENT + ',\n'.join(batch) + TAIL)
    out.append("\nCOMMIT;\n")
    return len(rows), '\n'.join(out)


def main(outdir='import-report'):
    os.makedirs(outdir, exist_ok=True)
    n, sql = build()
    path = os.path.join(outdir, 'fix-reversed-status.sql')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(sql)
    print(f'Written to {path}  ({n} patients marked reversed)')
    return path


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
