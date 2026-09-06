"""Correct operation dates whose YEAR was typed wrong in the app.

These are the one kind of disagreement between the app and the book that is
unambiguous: the day and the month match exactly and only the year is out, so
it is a slip at the keyboard rather than two different operations. Anna Pace's
operation is on file as 26 November 2026 - a date that has not happened yet -
where the book has 27 November 2020.

This is the only script here that CHANGES a value the app already holds, so
it is kept separate, it lists every row for you to read first, and it writes
the old value into the patient's notes before replacing it. Nothing is lost:
if a correction turns out to be wrong, the original date is still on the
record in words.
"""
import csv
import datetime
import os
import sys

import crossref
from make_sql import q


def find(d):
    book = {}
    for f in d['formations']:
        if f['id_card'] and f['date']:
            book.setdefault(f['id_card'], []).append(f)
    today = datetime.date.today()
    out = []
    for r in d['registry']:
        if not r['surgery_date']:
            continue
        app = datetime.date.fromisoformat(r['surgery_date'])
        for f in book.get(r['id_card'], []):
            # Same day and month, different year: a mistyped year. An operation
            # dated in the future cannot have happened, so there the day is
            # allowed to be a couple out as well — Anna Pace is on file as
            # 26 Nov 2026 where the book has 27 Nov 2020, and both the year and
            # the day were typed wrong.
            same_month = f['date'].month == app.month and f['date'].year != app.year
            near_day = abs(f['date'].day - app.day) <= (2 if app > today else 0)
            if same_month and near_day:
                out.append({'id_card': r['id_card'], 'surname': r['surname'],
                            'first_name': r['first_name'], 'app_date': app,
                            'book_date': f['date'], 'operation': f.get('operation'),
                            'in_future': app > today, 'src_row': f['src_row']})
                break
    # A date in the future first: those are the ones that are certainly wrong.
    out.sort(key=lambda x: (not x['in_future'], x['surname'] or ''))
    return out


def main(outdir='import-report'):
    os.makedirs(outdir, exist_ok=True)
    rows = find(crossref.build())

    with open(os.path.join(outdir, 'import-5-year-typos.csv'), 'w', newline='',
              encoding='utf-8-sig') as fh:
        w = csv.writer(fh)
        w.writerow(['id_card', 'surname', 'first_name', 'date_in_app_now',
                    'date_in_the_book', 'in_the_future', 'operation', 'book_row'])
        for r in rows:
            w.writerow([r['id_card'], r['surname'], r['first_name'], r['app_date'],
                        r['book_date'], 'YES' if r['in_future'] else '',
                        r['operation'] or '', r['src_row']])

    path = os.path.join(outdir, 'import-5-fix-year-typos.sql')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(f"""-- =============================================================================
-- Correct {len(rows)} operation dates whose year was typed wrong
-- =============================================================================
-- Generated {datetime.date.today():%d %B %Y}.
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
-- READ import-5-year-typos.csv FIRST. This is the only import file that
-- changes a value the app already holds, so nothing here should be run until
-- the list has been read against the book.
--
-- In every row the day and the month already match the book and only the year
-- is out. The old date is written into the patient's notes before it is
-- replaced, so the original is never lost.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

BEGIN;
""")
        for r in rows:
            note = (f"Date of surgery corrected from {r['app_date']:%d %b %Y} to "
                    f"{r['book_date']:%d %b %Y} on {datetime.date.today():%d %b %Y}, to match the "
                    f"register book"
                    + (" (the date on file had not happened yet)." if r['in_future'] else "."))
            fh.write(f"\n-- {r['surname']}, {r['first_name']} — app {r['app_date']} → book {r['book_date']}"
                     + ("   *** dated in the future ***" if r['in_future'] else "") + "\n")
            fh.write("UPDATE public.patients SET\n"
                     f"  patient_notes = COALESCE(patient_notes || ' ', '') || {q(note)},\n"
                     f"  surgery_date  = {q(r['book_date'])}\n"
                     f"WHERE id_card = {q(r['id_card'])}\n"
                     f"  AND surgery_date = {q(r['app_date'])};\n")
        fh.write("\nCOMMIT;\n\n-- Anything still dated in the future?\n"
                 "SELECT id_card, surname, first_name, surgery_date\n"
                 "FROM public.patients WHERE surgery_date > CURRENT_DATE;\n")

    fut = sum(1 for r in rows if r['in_future'])
    print(f"\n{len(rows)} operation dates have the day and month right but the year wrong.")
    print(f"{fut} of them is dated in the future, which is how it was spotted.\n")
    for r in rows:
        print("  %-9s %-24s app %s  ->  book %s%s" % (
            r['id_card'], ((r['surname'] or '') + ' ' + (r['first_name'] or '')).strip(),
            r['app_date'], r['book_date'], '   <- in the future' if r['in_future'] else ''))
    print(f"\nWritten to {outdir}/import-5-year-typos.csv and import-5-fix-year-typos.sql")
    return rows


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
