"""Write the dry-run report: what an import would do, before it does it.

Nothing is written to the database. The output is a summary on screen and a
set of CSV worklists, so the gaps and the disagreements can be worked through
on paper — or in the app's own New Patients page — before a single record is
created or changed.

The CSVs carry patient names, ID cards and addresses, so they are written to
a directory you choose (default ./import-report) and are deliberately not
committed: see tools/import/README.md.
"""
import csv
import os
import sys
from collections import Counter

import crossref


def _w(path, header, rows):
    with open(path, 'w', newline='', encoding='utf-8-sig') as fh:
        wr = csv.writer(fh)
        wr.writerow(header)
        wr.writerows(rows)
    return len(rows)


def name_of(p):
    return f'{p["surname"] or ""}, {p["first_name"] or ""}'.strip(' ,') or '(no name)'


def main(outdir='import-report'):
    os.makedirs(outdir, exist_ok=True)
    d = crossref.build()
    P = d['patients']
    forms, revs, decs, reg = d['formations'], d['reversals'], d['deceased'], d['registry']
    out = lambda n: os.path.join(outdir, n)
    counts = {}

    # ---- 1. patients the book has and the app does not -------------------
    rows = []
    for p in sorted(P.values(), key=lambda x: (x['surname'] or '', x['first_name'] or '')):
        if p['registry'] or not p['formations']:
            continue
        first = min(p['formations'], key=lambda r: (r['date'] or __import__('datetime').date(9999, 1, 1)))
        rows.append([sorted(p['cards'])[0], p['surname'], p['first_name'],
                     first['date'] or '', first['date_quality'], first['stoma_type'] or '',
                     first['stoma_type_raw'] or '', first['operation'] or '',
                     first['comments'] or '', first['consultant'] or '', first['address'] or '',
                     first['phone'] or '', len(p['formations']), len(p['reversals']),
                     'yes' if p['deaths'] else '', first['name_confidence'], first['src_row']])
    counts['to-create'] = _w(out('1-patients-to-create.csv'),
        ['id_card', 'surname', 'first_name', 'first_surgery_date', 'date_quality', 'stoma_type',
         'stoma_type_as_written', 'operation', 'findings', 'consultant', 'address', 'phone',
         'stomas_in_book', 'reversals_in_book', 'deceased', 'name_confidence', 'source_row'], rows)

    # ---- 2. reversals the app is missing ---------------------------------
    rows = []
    for p in P.values():
        if not any(f[0] == 'reversal-not-in-app' for f in p['flags']):
            continue
        for r in sorted(p['reversals'], key=lambda x: (x['date'] or __import__('datetime').date(9999, 1, 1))):
            rows.append([sorted(p['cards'])[0], p['surname'], p['first_name'],
                         r['date'] or '', r['date_quality'], r['comments'] or '',
                         r['consultant'] or '', p['registry']['status'] if p['registry'] else '',
                         r['src_row']])
    # The book's Comments column IS the reversal note — "Reversal of Hartmann's",
    # "Closure of Ileostomy" — so it is named for the field it lands in rather
    # than left as an anonymous column.
    counts['reversals-missing'] = _w(out('2-reversals-missing-from-app.csv'),
        ['id_card', 'surname', 'first_name', 'reversal_date', 'date_quality', 'reversal_notes',
         'consultant', 'app_status_now', 'source_row'], rows)

    # ---- 3. deaths the app is missing ------------------------------------
    rows = []
    for p in P.values():
        if not any(f[0] == 'death-not-in-app' for f in p['flags']):
            continue
        for x in p['deaths']:
            rows.append([sorted(p['cards'])[0], p['surname'], p['first_name'], x['year'],
                         p['registry']['status'] if p['registry'] else '', x['sheet'], x['src_row']])
    counts['deaths-missing'] = _w(out('3-deaths-missing-from-app.csv'),
        ['id_card', 'surname', 'first_name', 'died_year', 'app_status_now', 'sheet', 'source_row'], rows)

    # ---- 4. possible duplicate files -------------------------------------
    # Two tiers, because they need different amounts of attention. A card that
    # looks mistyped — one digit out, or the wrong checking letter — on the
    # same name is almost certainly one patient filed twice. Two unrelated
    # cards on a common Maltese surname usually is not, so those are listed
    # separately rather than burying the handful that matter.
    HDR = ['why', 'patient', 'id_cards', 'where', 'formations', 'reversals', 'deceased']
    strong, weak = [], []
    for g in sorted(d['duplicate_groups'], key=lambda x: x['name']):
        mistyped = [r for r in g['reasons'] if r != 'same name, unrelated cards']
        for p in g['patients']:
            row = ['; '.join(g['reasons']), name_of(p), ' / '.join(sorted(p['cards'])),
                   'in app' if p['registry'] else 'book only',
                   len(p['formations']), len(p['reversals']), 'yes' if p['deaths'] else '']
            (strong if mistyped else weak).append(row)
    counts['duplicates'] = _w(out('4-duplicate-files-likely.csv'), HDR, strong)
    counts['same-name'] = _w(out('4b-same-name-different-card.csv'), HDR, weak)
    counts['dup-groups'] = len({tuple(r[1:3]) for r in strong})

    # ---- 5. rows needing a human decision --------------------------------
    rows = []
    for r in forms:
        if r['type_confidence'] in ('unmapped', 'ambiguous', 'blank'):
            rows.append(['stoma type', r['id_card'], r['name_raw'], r['date'] or '',
                         r['stoma_type_raw'] or '(blank)', r['type_note'], 'New_Patients', r['src_row']])
    for r in forms + revs:
        if r['name_confidence'] == 'low':
            rows.append(['name order', r['id_card'] or '(no card)', r['name_raw'], r['date'] or '',
                         f'read as {r["surname"]} / {r["first_name"]}', r['name_order'],
                         'New_Patients' if r['kind'] == 'formation' else 'Reversals', r['src_row']])
    for r in revs:
        if r['date_quality'] == 'year-only':
            rows.append(['reversal date', r['id_card'] or '(no card)', r['name_raw'], '',
                         r['comments'] or '', f'only the year {r["band_year"]} is known',
                         'Reversals', r['src_row']])
        if not r['id_card']:
            rows.append(['missing ID card', '(none)', r['name_raw'], r['date'] or '',
                         r['comments'] or '', 'no card written in the book', 'Reversals', r['src_row']])
    for r in d['orphans']:
        rows.append(['stray row', '(none)', '', '', r['raw'], 'no ID card and no name',
                     'New_Patients', r['src_row']])
    for p_ in P.values():
        for kind, detail in p_['flags']:
            if kind == 'stoma-formed-before-the-book':
                rows.append(['stoma missing from both books', sorted(p_['cards'])[0],
                             name_of(p_), '', detail,
                             'the reversal has no formation to attach to', 'Reversals', ''])
            elif kind == 'reversal-day-unknown':
                rows.append(['reversal day unknown', sorted(p_['cards'])[0],
                             name_of(p_), '', detail,
                             'month is known, day is not', 'Reversals', ''])
    counts['needs-decision'] = _w(out('5-needs-a-decision.csv'),
        ['what', 'id_card', 'name_as_written', 'date', 'value', 'why', 'file', 'source_row'], rows)

    # ---- 6. every stoma, per patient, as it would be imported -------------
    rows = []
    for p in sorted(P.values(), key=lambda x: (x['surname'] or '', x['first_name'] or '')):
        events = ([('formation', r) for r in p['formations']]
                  + [('reversal', r) for r in p['reversals']])
        events.sort(key=lambda e: (e[1]['date'] or __import__('datetime').date(9999, 1, 1)))
        for n, (kind, r) in enumerate(events, 1):
            rows.append([sorted(p['cards'])[0], p['surname'], p['first_name'], n, kind,
                         r['date'] or '', r['date_quality'],
                         r.get('stoma_type') or '', r.get('operation') or r.get('comments') or '',
                         'yes' if r.get('mucus_fistula') else '',
                         'in app' if p['registry'] else 'book only', r['src_row']])
    counts['timeline'] = _w(out('6-full-stoma-timeline.csv'),
        ['id_card', 'surname', 'first_name', 'seq', 'event', 'date', 'date_quality',
         'stoma_type', 'operation_or_note', 'mucus_fistula', 'where', 'source_row'], rows)

    # ---- 7. in the app, not in the book ----------------------------------
    rows = [[p['registry']['id_card'], p['surname'], p['first_name'],
             p['registry']['surgery_date'] or '', p['registry']['stoma_type_raw'] or '',
             p['registry']['status'] or '']
            for p in sorted(P.values(), key=lambda x: (x['surname'] or '', x['first_name'] or ''))
            if any(f[0] == 'registry-only' for f in p['flags'])]
    counts['registry-only'] = _w(out('7-in-app-not-in-book.csv'),
        ['id_card', 'surname', 'first_name', 'surgery_date', 'stoma_type', 'status'], rows)

    # ---- summary ---------------------------------------------------------
    tc = Counter(r['type_confidence'] for r in forms)
    nc = Counter(r['name_confidence'] for r in forms + revs)
    dq = Counter(r['date_quality'] for r in revs)
    print(f"""
DRY RUN — nothing has been written to the database.

READ
  New_Patients.xlsx        {len(forms):>6} stoma formations   ({len(d['orphans'])} stray rows skipped)
  Reversal_of_Patients.xlsx{len(revs):>6} reversals          (2012-2022)
  Deceased_Patients.xlsx   {len(decs):>6} deaths             (2002-2026)
  Patients.csv (live app)  {len(reg):>6} patients

JOINED ON THE ID CARD  (the ID number is the identity — names are only ever
                        used to check it, never to decide who someone is)
  {len(P):>6} distinct patients in total
  {sum(1 for p in P.values() if p['registry']):>6} of them are already in the app
  {sum(1 for p in P.values() if not p['registry']):>6} are in the books only
  {sum(1 for p in P.values() if len(p['formations']) > 1):>6} have had more than one stoma

WHAT AN IMPORT WOULD DO
  create   {counts['to-create']:>6} patients that have a stoma formation in the book but no app record
  add      {counts['reversals-missing']:>6} reversals to patients the app already has
  add      {counts['deaths-missing']:>6} dates of death the app is missing
  build    {counts['timeline']:>6} stoma/reversal events across every patient

NEEDS A PERSON TO LOOK
  {counts['duplicates']:>6} records whose ID card looks mistyped — very likely one patient filed twice
  {counts['same-name']:>6} records sharing a name but with unrelated cards (usually different people)
  {counts['needs-decision']:>6} rows I will not guess at (stoma type, name order, missing date or card)
  {counts['registry-only']:>6} patients in the app that the book does not mention

CONFIDENCE
  stoma type   {tc['exact']} read exactly, {tc['fuzzy']} through a misspelling, {tc['blank']} blank, {tc['ambiguous'] + tc['unmapped']} unresolved
  name order   {nc['high']} certain, {nc['medium']} probable, {nc['low']} guessed (all {nc['low']} are listed for checking)
  reversal date{dq['exact']:>4} exact, {dq['month']} month-only, {dq['year-only']} year-only

WORKLISTS written to {outdir}/
  1-patients-to-create.csv          4b-same-name-different-card.csv
  2-reversals-missing-from-app.csv  5-needs-a-decision.csv
  3-deaths-missing-from-app.csv     6-full-stoma-timeline.csv
  4-duplicate-files-likely.csv      7-in-app-not-in-book.csv
""")
    return counts


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
