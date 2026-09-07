"""Turn the register books into SQL you can paste into Supabase.

Three rules hold everywhere in this file, because the registry is live and the
books are being copied INTO it, not over it:

  1. A patient already in the app is never overwritten. Their row is only ever
     filled where it is currently blank (COALESCE), so anything a nurse has
     typed wins over anything the book says.
  2. A patient not in the app is inserted, and re-running does nothing the
     second time (ON CONFLICT DO NOTHING on the ID card).
  3. Nothing is ever deleted, and no JSON array that already has something in
     it is replaced.

So the script is safe to run twice, and safe to run after people have kept
working in the app.
"""
import datetime
import os
import sys
from collections import defaultdict

import crossref
import stoma_types

# The locality list the app offers. An address usually ends with its locality,
# so the town is read off the end of the address rather than left blank —
# locality is a required field on the patient form.
LOCALITIES = ['Attard', 'Balzan', 'Birgu (Vittoriosa)', 'Birkirkara', 'Birżebbuġa',
    'Bormla (Cospicua)', 'Dingli', 'Fgura', 'Floriana', 'Fontana', 'Għajnsielem',
    'Għarb', 'Għargħur', 'Għasri', 'Għaxaq', 'Gudja', 'Gżira', 'Ħamrun', 'Iklin',
    'Isla (Senglea)', 'Kalkara', 'Kerċem', 'Kirkop', 'Lija', 'Luqa', 'Marsa',
    'Marsaskala', 'Marsaxlokk', 'Mdina', 'Mellieħa', 'Mġarr', 'Mosta', 'Mqabba',
    'Msida', 'Mtarfa', 'Munxar', 'Nadur', 'Naxxar', 'Paola', 'Pembroke', 'Pietà',
    'Qala', 'Qormi', 'Qrendi', 'Rabat', 'Safi', "San Ġiljan (St Julian's)",
    'San Ġwann', 'San Lawrenz', "San Pawl il-Baħar (St Paul's Bay)", 'Sannat',
    'Santa Luċija', 'Santa Venera', 'Siġġiewi', 'Sliema', 'Swieqi', 'Tarxien',
    "Ta' Xbiex", 'Valletta', 'Victoria (Rabat, Gozo)', 'Xagħra', 'Xewkija',
    'Xgħajra', 'Żabbar', 'Żebbuġ (Malta)', 'Żebbuġ (Gozo)', 'Żejtun', 'Żurrieq']

# The book writes towns without their Maltese diacritics as often as with them.
def _fold(s):
    tr = str.maketrans('àèìòùáéíóúâêîôûäëïöüċġħżṀĊĠĦŻ', 'aeiouaeiouaeiouaeioucghzMCGHZ')
    return ''.join(str(s or '').lower().translate(tr).split())

_LOC_INDEX = {}
for _l in LOCALITIES:
    _LOC_INDEX[_fold(_l)] = _l
    # "Bormla (Cospicua)" is written either way round in the book.
    if '(' in _l:
        a, b = _l.split('(', 1)
        _LOC_INDEX.setdefault(_fold(a), _l)
        _LOC_INDEX.setdefault(_fold(b.rstrip(')')), _l)


def locality_from(address):
    """Read the town off the end of an address, or None if it is not there."""
    if not address:
        return None
    parts = [p.strip() for p in str(address).replace(';', ',').split(',') if p.strip()]
    # Work backwards: the town is at the end, sometimes with a postcode after it.
    for part in reversed(parts):
        words = part.split()
        for n in (4, 3, 2, 1):
            for i in range(len(words) - n + 1):
                hit = _LOC_INDEX.get(_fold(' '.join(words[i:i + n])))
                if hit:
                    return hit
    return None


def q(v):
    """A SQL literal. None becomes NULL; everything else is quoted text."""
    if v is None or v == '':
        return 'NULL'
    if isinstance(v, (datetime.date, datetime.datetime)):
        return f"DATE '{v:%Y-%m-%d}'"
    return "'" + str(v).replace("'", "''") + "'"


def jsonq(obj):
    """A jsonb literal, with the empty keys left out.

    Every stoma carries the same dozen fields whether or not it has them, and
    on 2,500 of them the nulls alone ran to pages of a file that has to be
    pasted into a browser. Dropping them changes nothing the app reads: it
    already treats a missing key and a null key the same way.
    """
    import json
    if not obj:
        return "'[]'::jsonb"
    if isinstance(obj, list):
        obj = [{k: v for k, v in o.items() if v not in (None, '', [], False)} | {'uid': o['uid']}
               if isinstance(o, dict) and 'uid' in o else o for o in obj]
    return "'" + json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace("'", "''") + "'::jsonb"


# How far apart the app and the book may write the same operation and still be
# taken to mean one operation rather than two.
SAME_OP_DAYS = 14

# How the app's date and the book's were reconciled, in words a nurse can act on.
_MATCHED = {
    1: 'a day or two apart',
    2: 'the day and the month swapped over',
    3: 'the year typed wrong',
    4: 'the month typed wrong',
    5: 'the same month, different day (the book often gives only the month)',
    99: 'the dates do not agree at all; matched because the book names the same stoma',
}


def _types_agree(book_type, app_type):
    """Whether the book and the app can be naming the same stoma.

    Only a positive contradiction counts against a match. Where either side
    names no stoma at all — "Other", an unmapped spelling, a blank — there is
    nothing to disagree with, so it agrees.
    """
    book, app = stoma_types.bases(book_type), stoma_types.bases(app_type)
    return not book or not app or bool(book & app)


# The book and the app were both typed by hand from the same page, so where they
# disagree about the date of one operation they disagree in a few very regular
# ways. Each of these is one operation written twice, not two operations, and
# treating them as two is what put a stoma on a patient who never had one.
def _date_agreement(book, app):
    """How the two dates can be reconciled. Lower is better; None means they
    cannot be, and the two really are different operations."""
    if book == app:
        return 0                                    # the same day
    if abs((book - app).days) <= SAME_OP_DAYS:
        return 1                                    # a day or two either side
    try:
        if abs((datetime.date(book.year, book.day, book.month) - app).days) <= 3:
            return 2                                # day and month swapped:
    except ValueError:                              # 01/09 read as 09/01
        pass
    if (book.month, book.day) == (app.month, app.day):
        return 3                                    # the year mistyped
    if (book.year, book.day) == (app.year, app.day):
        return 4                                    # the month mistyped
    if (book.year, book.month) == (app.year, app.month):
        return 5                                    # the day: often the book
    return None                                     # gives only the month, so 1st


def _row_extras(rec, patient_address, patient_phone, patient_consultant):
    """The register row's own address / phone / firm, but ONLY where they differ
    from the patient's. On most patients every row repeats the same details, and
    storing them again on every stoma was 73 KB of the import saying nothing."""
    out = {}
    if rec.get('address') and rec['address'] != patient_address:
        out['row_address'] = rec['address']
    if rec.get('phone') and rec['phone'] != patient_phone:
        out['row_phone'] = rec['phone']
    if rec.get('consultant') and rec['consultant'] != patient_consultant:
        out['row_consultant'] = rec['consultant']
    return out


def stoma_entry(rec, uid):
    """One later-stoma JSON entry, in the shape the app already reads."""
    e = {'uid': uid,
         'type': rec.get('stoma_type'),
         'formed_date': rec['date'].isoformat() if rec.get('date') else None,
         'findings': rec.get('operation') or rec.get('comments'),
         'location': None, 'discharge_date': None,
         'reversal_date': None, 'reversal_notes': None,
         'operation': rec.get('operation'), 'comments': rec.get('comments')}
    return e


def build_patient(p):
    """Everything the books know about one patient, ready for SQL.

    Stomas are ordered oldest first. The first one becomes the patient's own
    surgery_date / stoma_type / findings, exactly as the form's "Stoma 1"
    does; the rest become extra_stomas. Reversals are matched to the stoma
    they closed — the newest one open at the time — which is the same rule the
    reversal button uses in the app.
    """
    far = datetime.date(9999, 1, 1)
    forms = sorted(p['formations'], key=lambda r: r['date'] or far)
    # The book writes some operations down twice — the same patient, the same
    # day, the same words, once when it happened and again a few pages later,
    # sometimes with the stoma type corrected the second time. That is one
    # operation, so the repeat is dropped rather than becoming a second stoma.
    seen, unique = set(), []
    for f in forms:
        key = (f['date'], ' '.join((f.get('operation') or '').lower().split()))
        if key[1] and key in seen:
            continue
        seen.add(key)
        unique.append(f)
    forms = unique
    revs = sorted(p['reversals'], key=lambda r: r['date'] or far)
    if not forms:
        return None

    # A patient already in the app has ONE stoma on their record, and it is
    # usually their most recent one — the app has never been able to hold the
    # earlier ones. So for them the app's stoma stays as Stoma 1 and every
    # stoma the book knows about becomes a later stoma, rather than the book's
    # oldest overwriting the app's newest. Getting this wrong is what put a
    # 2021 reversal against a 2026 operation.
    reg = p.get('registry')
    app_date = None
    if reg and reg.get('surgery_date'):
        try:
            app_date = datetime.date.fromisoformat(reg['surgery_date'][:10])
        except ValueError:
            app_date = None
    if app_date:
        # Which book row IS the stoma the app already holds. Matching it on the
        # exact day alone turned one operation into two for hundreds of
        # patients, so every way the two records are known to disagree about a
        # date is tried, best explanation first, and the type is used to
        # corroborate the further-apart ones. A row picked here is the app's own
        # stoma and is never also written as a later one.
        best = None
        for f in forms:
            if not f['date']:
                continue
            r = _date_agreement(f['date'], app_date)
            if r is None:
                continue
            # Within a fortnight the dates speak for themselves: two stoma
            # operations that close together are rarer than a mistyped type.
            # Further out the type is the only corroboration there is.
            if r >= 2 and not _types_agree(f.get('stoma_type'), reg.get('stoma_type_raw')):
                continue
            score = (r, abs((f['date'] - app_date).days))
            if best is None or score < best[0]:
                best = (score, f)
        # Still nothing. The app has only ever been able to hold ONE stoma per
        # patient and the book is the complete record of every stoma formed, so
        # the stoma the app holds is one of the book's rows — it is the date
        # that is wrong, not the count. The nearest row naming the same stoma is
        # taken, and the disagreement is written into the notes for checking.
        # Only where the book names no stoma of that kind at all is the app's
        # stoma left standing as one of its own.
        if best is None:
            fits = [f for f in forms if f['date']
                    and _types_agree(f.get('stoma_type'), reg.get('stoma_type_raw'))]
            if fits:
                f = min(fits, key=lambda x: abs((x['date'] - app_date).days))
                best = ((99, abs((f['date'] - app_date).days)), f)
        base_form = best[1] if best else None
        base_rank = best[0][0] if best else None
        later = [f for f in forms if f is not base_form]
        # Contact details are the patient's, not the stoma's, so they can still
        # come from the book even when none of its rows is the app's stoma.
        first = base_form or forms[0]
    else:
        first, later = forms[0], forms[1:]
        base_form, base_rank = first, 0
    # The stoma the patient's own columns describe. None means the app is
    # holding a stoma the book does not have a row for: it keeps the one it has,
    # every book row is a later stoma, and nothing from the book is copied onto
    # it — that would be describing a different operation.
    base_stoma = base_form
    extra = [stoma_entry(r, f'imp{p["id_key"]}s{i + 2}')
             | _row_extras(r, first.get('address'), first.get('phone'), first.get('consultant'))
             for i, r in enumerate(later)]

    # A mucus fistula named alongside a stoma is a second output at the same
    # operation, which is what initial_stomas is for.
    initial = []
    if base_stoma and base_stoma.get('mucus_fistula'):
        initial.append({'uid': f'imp{p["id_key"]}mf', 'type': 'Mucus Fistula',
                        'location': None, 'mucus_fistula': True,
                        'discharge_date': None, 'reversal_date': None,
                        'reversal_notes': None,
                        'findings': 'Formed alongside the stoma at the same operation'})

    # Close stomas in turn. Which stoma a reversal closed is decided by what the
    # reversal note actually says before it is decided by date: the book writes
    # "Reversal of Jejunostomy" and "Reversal of ileostomy", and on a patient
    # carrying both at once the dates alone put them on the wrong stoma. The
    # type named in the note wins; only when the note names no type, or names
    # one this patient does not have open, does it fall back to the newest
    # stoma still open - the same rule the reversal button uses in the app.
    base = {'reversal_date': None, 'reversal_notes': None,
            'type': (reg.get('stoma_type_raw') if app_date else None)
                    or (base_stoma.get('stoma_type') if base_stoma else None)}
    base_date = app_date or (base_stoma['date'] if base_stoma else None)
    slots = [(base_date, base)] + [(r['date'], e) for r, e in zip(later, extra)]
    oldest = datetime.date(1900, 1, 1)

    def base_word(t):
        # The stoma word alone, so "Loop - Ileostomy" matches "Ileostomy".
        mapped, _mf, _c, _n = stoma_types.map_type(t or '')
        return (mapped or '').split('-')[-1].strip().lower() or None

    for rev in revs:
        open_slots = [(d, s) for d, s in slots
                      if not s['reversal_date'] and (not d or not rev['date'] or d <= rev['date'])]
        if not open_slots:
            continue
        named = base_word(rev.get('comments'))
        matching = [(d, s) for d, s in open_slots if named and base_word(s.get('type')) == named]
        pick = sorted(matching or open_slots, key=lambda x: x[0] or oldest)
        # Among stomas of the type the note names, the oldest open one is the
        # one being closed; with no type to go on, the newest is.
        _, slot = pick[0] if matching else pick[-1]
        slot['reversal_date'] = rev['date'].isoformat() if rev['date'] else None
        slot['reversal_notes'] = rev.get('comments')

    # The register follows the stoma, so a patient whose every stoma was closed
    # is a reversal here even if the Deceased book also names them. Their death
    # is recorded in the notes rather than as a status or a date, exactly as it
    # is for the patients the app already holds.
    deceased = bool(p['deaths'])
    reversed_all = bool(slots) and all(s['reversal_date'] for _, s in slots)
    status = 'reversed' if reversed_all else ('deceased' if deceased else 'active')

    # Provenance, so anyone reading the record later knows where it came from
    # and how exact the dates are.
    # Provenance, kept terse. The same long sentence on 2,300 patients was 193 KB
    # of a file that has to be pasted into a browser, and said the same thing
    # every time. The caveats — which are per-patient and worth reading — stay.
    notes = [f'Register book import {datetime.date.today():%d/%m/%Y}.']
    if base_stoma is None:
        notes.append('The stoma already on this record is not in the register book '
                     'under this ID card, so it was left exactly as it was and every '
                     'stoma the book does have was added after it. Check whether the '
                     'two are really the same operation.')
    elif app_date and base_rank and base_stoma['date'] and base_stoma['date'] != app_date:
        notes.append(f'The app had this operation as {app_date:%d/%m/%Y} and the book '
                     f'writes it as {base_stoma["date"]:%d/%m/%Y}. Taken as one operation, '
                     f'not two. Check which of the two dates is right.')
    if base_stoma and base_stoma['date_quality'] == 'month':
        notes.append('Surgery date: month only, day not in the book.')
    if any(r['date_quality'] == 'month' for r in revs):
        notes.append('Reversal date: month only, day not in the book.')
    if any(r['date_quality'] == 'year-only' for r in revs):
        notes.append('A reversal has only a year in the book, so no date is on file.')
    if p['deaths']:
        yrs = ', '.join(str(x['year']) for x in p['deaths'] if x['year'])
        notes.append(f'In the Deceased book for {yrs} (year only).'
                     + (' Reversed, so kept as a reversal with no date of death.'
                        if reversed_all else ''))
    if base_stoma and base_stoma['date'] and base_stoma['date'] > datetime.date.today():
        notes.append(f'Book gives surgery as {base_stoma["date"]:%d/%m/%Y}, in the future — left blank.')
    if base_stoma and base_stoma['type_confidence'] in ('unmapped', 'ambiguous', 'blank'):
        notes.append(f'Stoma type reads "{base_stoma["stoma_type_raw"] or "(blank)"}" — set it by hand.')
    if first.get('name_confidence') == 'low':
        notes.append(f'Name in the book: "{first["name_raw"]}" — check which half is the surname.')

    return {
        # The card the row is found by. For a patient already in the app it has
        # to be THEIR card, not whichever of the two the book writes: every
        # statement here joins on it, and joining on the book's spelling quietly
        # updated nothing at all.
        'id_card': (reg or {}).get('id_card') or sorted(p['cards'])[0],
        'first_name': p['first_name'] or '(not recorded)',
        'surname': p['surname'] or '(not recorded)',
        'phone_number': first.get('phone'),
        'address': first.get('address'),
        'locality': locality_from(first.get('address')),
        'consultant': first.get('consultant'),
        # A date past today is a slip of the pen in the book, not an operation
        # that has happened, so it is left out and called out in the notes.
        'surgery_date': (base_stoma['date'] if (base_stoma and base_stoma['date']
                         and base_stoma['date'] <= datetime.date.today()) else None),
        'stoma_type': base_stoma.get('stoma_type') if base_stoma else None,
        'procedure_performed': base_stoma.get('operation') if base_stoma else None,
        'findings': base_stoma.get('comments') if base_stoma else None,
        'reversal_date': base['reversal_date'],
        'reversal_notes': base['reversal_notes'],
        'initial_stomas': initial,
        'extra_stomas': extra,
        'followup_status': status,
        'patient_notes': ' '.join(notes),
        # Not a column: how the app's own stoma was matched to the book, for
        # the worklist of dates a nurse still has to settle.
        'date_check': ({'app_date': app_date, 'book_date': base_stoma['date'] if base_stoma else None,
                        'app_type': reg.get('stoma_type_raw') if reg else None,
                        'book_type': base_stoma.get('stoma_type') if base_stoma else None,
                        'how': _MATCHED[base_rank] if base_rank in _MATCHED else None}
                       if app_date and base_rank not in (0, None) else
                       ({'app_date': app_date, 'book_date': None,
                         'app_type': reg.get('stoma_type_raw') if reg else None,
                         'book_type': None,
                         'how': 'no row in the book could be this stoma - it was left as a stoma of its own'}
                        if app_date and base_stoma is None else None)),
    }


# Every column the import writes to, created only if it is missing. This has to
# come FIRST in every file and every part: a step that fills in patient_notes is
# no use after the step that would have created it, and a part that never
# creates it at all fails outright. That is exactly how the first run failed.
PREAMBLE = """-- ---------------------------------------------------------------------------
-- Columns this import writes to, created only where they are missing.
-- Safe to re-run; nothing is dropped and nothing already there is altered.
-- ---------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS date_of_birth   date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS surgery_date    date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_date  date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reversal_date   date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS deceased_date   date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS stoma_type      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS stoma_location  text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sex             text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS procedure_performed text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS findings        text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS locality        text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS address         text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS consultant      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reversal_notes  text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_notes   text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS complications   text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS proposed_reversal_date  date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharged_gozo_date    date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS relocated_overseas_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS initial_stomas  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_stomas    jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_refashionings jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_statuses  jsonb DEFAULT '[]'::jsonb;
"""

HEADER = """-- =============================================================================
-- {title}
-- =============================================================================
-- Generated {when} from the register books.
-- {subtitle}
--
--
-- RUN THE FILES IN THIS ORDER. It matters: the year corrections have to land
-- before any reversal date is filled in, or a reversal can end up sitting
-- before the operation it closed.
--     1.  import-0-tidy-operations.sql  moves operations out of Comments
--     2.  import-5-fix-year-typos.sql   corrects 14 mistyped years
--     3.  import-2-fill-existing.sql    fills blanks on patients you already have
--     4.  import-1-new-patients.sql     creates the patients only the book has
--     5.  import-6-set-reversed.sql     marks the Reversal book's patients reversed
--     6.  import-7-stoma-list.sql       puts the stoma list right — LAST
--
-- SAFE TO RUN, AND SAFE TO RUN TWICE:
--   * no patient is ever deleted
--   * a patient already in the app is only filled in where they are BLANK —
--     anything a nurse has already typed is kept
--   * a patient already inserted by an earlier run is skipped
--
-- THE ONE THING STEP 6 TAKES AWAY
--   An earlier version of this import wrote the book's row onto the patient's
--   own stoma AND again as a second stoma, so patients who have only ever had
--   one are carrying one that never existed. Step 6 is the authority on that
--   list: it removes every stoma this import created, keeps every stoma
--   entered by hand, and puts back only the ones the book supports.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Nothing needs to be run first: every column this file writes to is created
--   below if it is not already there.
-- =============================================================================

BEGIN;

{preamble}
"""

FOOTER = """
COMMIT;

-- What landed.
SELECT followup_status, COUNT(*) AS patients
FROM public.patients GROUP BY 1 ORDER BY 2 DESC;
"""


def emit(outdir='import-report'):
    import csv as _csv
    os.makedirs(outdir, exist_ok=True)
    d = crossref.build()
    P = d['patients']
    when = datetime.date.today().strftime('%d %B %Y')

    # Cards that look like a mistyped version of one already in the app. These
    # are NOT inserted: creating them would put the same patient on file twice,
    # which is the thing the registry is trying to get rid of.
    risky = set()
    for g in d['duplicate_groups']:
        if all(r == 'same name, unrelated cards' for r in g['reasons']):
            continue
        if any(x['registry'] for x in g['patients']):
            for x in g['patients']:
                if not x['registry']:
                    risky.add(x['id_key'])

    new_rows, upd_rows, skipped = [], [], []
    far = datetime.date(1900, 1, 1)
    for p in sorted(P.values(),
                    key=lambda x: (x['formations'][0]['date']
                                   if x['formations'] and x['formations'][0]['date'] else far),
                    reverse=True):
        rec = build_patient(p)
        if not rec:
            continue
        if p['registry']:
            upd_rows.append((p, rec))
        elif p['id_key'] in risky:
            skipped.append((p, rec))
        else:
            new_rows.append(rec)

    # ---- 1. new patients -------------------------------------------------
    COLS = ['id_card', 'first_name', 'surname', 'phone_number', 'address', 'locality',
            'consultant', 'surgery_date', 'stoma_type', 'procedure_performed', 'findings',
            'reversal_date', 'reversal_notes', 'followup_status', 'patient_notes']
    path = os.path.join(outdir, 'import-1-new-patients.sql')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(HEADER.format(preamble=PREAMBLE, title=f'Register book import - {len(new_rows)} new patients',
                 when=when,
                 subtitle='Patients the book has and the app does not, newest surgery first.'))
        # 50 at a time so the file can be cut into evenly sized pieces later.
        for i in range(0, len(new_rows), 50):
            chunk = new_rows[i:i + 50]
            fh.write(f"\n-- rows {i + 1}-{i + len(chunk)}\n")
            fh.write('INSERT INTO public.patients (\n  ' + ', '.join(COLS)
                     + ', initial_stomas, extra_stomas, followup_owner, followup_type\n) VALUES\n')
            vals = []
            for r in chunk:
                v = ', '.join(q(r[c]) for c in COLS)
                vals.append(f"  ({v}, {jsonq(r['initial_stomas'])}, {jsonq(r['extra_stomas'])}, "
                            f"'Common', 'new_case')")
            fh.write(',\n'.join(vals) + '\nON CONFLICT (id_card) DO NOTHING;\n')
        fh.write(FOOTER)

    # ---- 2. fill blanks on patients already in the app -------------------
    # One statement rather than 687. Each patient used to get a multi-line
    # UPDATE naming every column, which came to half a megabyte of a file that
    # has to be pasted into a browser. The values are a table joined on the ID
    # card instead; COALESCE still means only blanks are filled.
    FILL = ['address', 'locality', 'consultant', 'phone_number', 'stoma_type',
            'procedure_performed', 'findings', 'reversal_notes', 'patient_notes']
    path2 = os.path.join(outdir, 'import-2-fill-existing.sql')
    rows2 = []
    for p_, rec in upd_rows:
        # The provenance sentence on its own tells a nurse nothing they cannot
        # see; it is the caveats after it that are worth carrying over, so a
        # note with nothing but the sentence is left off.
        note = rec.get('patient_notes') or ''
        if len(note.split('. ')) < 2:
            note = None
        rows2.append('  (' + ', '.join([
            q(rec['id_card']),
            *[q(note if c == 'patient_notes' else rec.get(c)) for c in FILL],
            q(rec.get('surgery_date')), q(rec.get('reversal_date')),
            jsonq(rec['extra_stomas']) if rec['extra_stomas'] else "NULL",
            jsonq(rec['initial_stomas']) if rec['initial_stomas'] else "NULL",
            'true' if p_['deaths'] else 'false',
        ]) + ')')
    wrote = len(rows2)
    with open(path2, 'w', encoding='utf-8') as fh:
        fh.write(HEADER.format(preamble=PREAMBLE, 
            title=f'Register book import - filling gaps on {len(upd_rows)} existing patients',
            when=when,
            subtitle='Only blank fields are filled. Nothing already in the app is changed.'))
        # Written in batches rather than as one enormous statement: the file has
        # to be split into pieces small enough to paste into a browser, and a
        # split can only fall between statements.
        for i in range(0, len(rows2), 80):
            batch = rows2[i:i + 80]
            fh.write(f"\n-- patients {i + 1}-{i + len(batch)} of {len(rows2)}\n")
            fh.write("""UPDATE public.patients AS t SET
  address             = COALESCE(t.address, v.address),
  locality            = COALESCE(t.locality, v.locality),
  consultant          = COALESCE(t.consultant, v.consultant),
  phone_number        = COALESCE(t.phone_number, v.phone_number),
  stoma_type          = COALESCE(t.stoma_type, v.stoma_type),
  procedure_performed = COALESCE(t.procedure_performed, v.procedure_performed),
  findings            = COALESCE(t.findings, v.findings),
  reversal_notes      = COALESCE(t.reversal_notes, v.reversal_notes),
  patient_notes       = COALESCE(t.patient_notes, v.patient_notes),
  surgery_date        = COALESCE(t.surgery_date, v.surgery_date::date),
  -- Only on or after whatever surgery date the row ends up with, so a record
  -- can never say a stoma was reversed before it was formed.
  reversal_date       = COALESCE(t.reversal_date,
                          CASE WHEN v.reversal_date::date
                                    >= COALESCE(t.surgery_date, v.surgery_date::date)
                               THEN v.reversal_date::date END),
  -- A later stoma is only added where the patient has none recorded.
  extra_stomas        = CASE WHEN v.extra_stomas IS NOT NULL
                              AND (t.extra_stomas IS NULL
                                   OR jsonb_array_length(t.extra_stomas) = 0)
                             THEN v.extra_stomas::jsonb ELSE t.extra_stomas END,
  initial_stomas      = CASE WHEN v.initial_stomas IS NOT NULL
                              AND (t.initial_stomas IS NULL
                                   OR jsonb_array_length(t.initial_stomas) = 0)
                             THEN v.initial_stomas::jsonb ELSE t.initial_stomas END,
  -- A death is the one status the import sets, and only where the app has none.
  followup_status     = CASE WHEN v.deceased
                              AND t.followup_status IS DISTINCT FROM 'deceased'
                              AND t.deceased_date IS NULL
                             THEN 'deceased' ELSE t.followup_status END
FROM (VALUES
""")
            fh.write(',\n'.join(batch))
            fh.write("""
) AS v(id_card, address, locality, consultant, phone_number, stoma_type,
       procedure_performed, findings, reversal_notes, patient_notes,
       surgery_date, reversal_date, extra_stomas, initial_stomas, deceased)
WHERE t.id_card = v.id_card;
""")
        fh.write(FOOTER)

    # ---- 7. the stoma list, put right ------------------------------------
    # Step 3 only ever ADDS later stomas, and only to a patient who has none —
    # which is right for a first run and useless for putting an earlier one
    # right. An earlier version of this import wrote the book's row onto the
    # patient's own stoma AND again as a later one, so patients who have only
    # ever had a single stoma are carrying a second that never existed.
    #
    # This step is the authority on that list. It throws away every later stoma
    # the import itself created — they all carry a uid beginning "imp" — keeps
    # every one a nurse entered, and puts back exactly the ones the book
    # actually supports. It is therefore safe to run on a database that has had
    # the earlier import, a database that has had none, or the same database
    # twice.
    #
    # It covers every patient the import knows about, not only the ones the app
    # already had: step 4 inserts with ON CONFLICT DO NOTHING, so a patient an
    # earlier run created keeps whatever that run gave them and would otherwise
    # never be put right.
    path7 = os.path.join(outdir, 'import-7-stoma-list.sql')
    rows7 = [f"  ({q(rec['id_card'])}, {jsonq(rec['extra_stomas'])})"
             for rec in [r for _p, r in upd_rows] + new_rows]
    with open(path7, 'w', encoding='utf-8') as fh:
        fh.write(HEADER.format(preamble=PREAMBLE,
                 title=f'Register book import - the stoma list, put right on {len(rows7)} patients',
                 when=when,
                 subtitle='Removes stomas an earlier run of this import invented. '
                          'Stomas entered by hand are kept.'))
        for i in range(0, len(rows7), 120):
            batch = rows7[i:i + 120]
            fh.write(f"\n-- patients {i + 1}-{i + len(batch)} of {len(rows7)}\n")
            fh.write("""UPDATE public.patients AS t SET
  extra_stomas = (
      -- everything a nurse added, kept exactly as it is …
      SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(t.extra_stomas, '[]'::jsonb)) AS e
       WHERE COALESCE(e->>'uid', '') NOT LIKE 'imp%'
    ) || v.stomas::jsonb   -- … and the ones the book actually supports
FROM (VALUES
""")
            fh.write(',\n'.join(batch))
            fh.write("""
) AS v(id_card, stomas)
WHERE t.id_card = v.id_card
  AND t.extra_stomas IS DISTINCT FROM (
      SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(t.extra_stomas, '[]'::jsonb)) AS e
       WHERE COALESCE(e->>'uid', '') NOT LIKE 'imp%'
    ) || v.stomas::jsonb;
""")
        fh.write(FOOTER)

    # ---- 8. the dates the two records disagree about ----------------------
    # Every patient where the book and the app write the same operation under
    # different dates. The import treats them as one operation and leaves the
    # date on file alone, so this is the list to work through by hand.
    path8 = os.path.join(outdir, 'import-8-dates-to-check.csv')
    checks = 0
    with open(path8, 'w', newline='', encoding='utf-8-sig') as fh:
        w = _csv.writer(fh)
        w.writerow(['id_card', 'surname', 'first_name', 'date_in_the_app',
                    'date_in_the_book', 'stoma_type_in_the_app',
                    'stoma_type_in_the_book', 'why_they_were_taken_as_one'])
        for _p, rec in upd_rows:
            c = rec.get('date_check')
            if not c:
                continue
            checks += 1
            w.writerow([rec['id_card'], rec['surname'], rec['first_name'],
                        c['app_date'] or '', c['book_date'] or '',
                        c['app_type'] or '', c['book_type'] or '', c['how'] or ''])

    # ---- 9. the patients still without a firm -----------------------------
    # The firm is only ever written in the register book, so a patient the book
    # has no row for cannot have one filled in. Most of them are recent
    # patients entered straight into the app; some are in the book under a
    # mistyped ID card, and for those the book's own row is offered alongside so
    # a nurse can see at a glance whether it is the same person.
    path9 = os.path.join(outdir, 'import-9-firm-missing.csv')
    by_name = {}
    for pat in d['patients'].values():
        for f in pat['formations']:
            if not f.get('consultant'):
                continue
            nm = ' '.join(sorted((f.get('name_raw') or '').lower().split()))
            if nm:
                by_name.setdefault(nm, []).append((pat, f))
    firmless = 0
    with open(path9, 'w', newline='', encoding='utf-8-sig') as fh:
        w = _csv.writer(fh)
        w.writerow(['id_card', 'surname', 'first_name', 'surgery_date',
                    'why_there_is_no_firm', 'same_name_in_the_book_under',
                    'book_date', 'book_firm'])
        for pat in sorted(d['patients'].values(),
                          key=lambda x: ((x['registry'] or {}).get('surname') or '',
                                         (x['registry'] or {}).get('first_name') or '')):
            reg = pat.get('registry')
            if not reg or pat['formations']:
                continue                    # the book has a row: the firm is filled in
            firmless += 1
            nm = ' '.join(sorted(((reg.get('first_name') or '') + ' '
                                  + (reg.get('surname') or '')).lower().split()))
            hit = by_name.get(nm) or []
            # Only offer it where the book puts the same name on the same day —
            # Joseph Borg appears in the book a dozen times and is a dozen
            # different people.
            same_day = [(q_, f) for q_, f in hit
                        if f['date'] and reg.get('surgery_date')
                        and f['date'].isoformat() == reg['surgery_date'][:10]]
            best = (same_day or [(None, None)])[0]
            w.writerow([sorted(pat['cards'])[0], reg.get('surname'), reg.get('first_name'),
                        (reg.get('surgery_date') or '')[:10],
                        'the register book has no row for this ID card',
                        sorted(best[0]['cards'])[0] if best[0] else '',
                        best[1]['date'].isoformat() if best[1] and best[1]['date'] else '',
                        best[1].get('consultant') if best[1] else ''])

    # ---- 3. what was deliberately left out --------------------------------
    import csv
    path3 = os.path.join(outdir, 'import-3-held-back.csv')
    with open(path3, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh)
        w.writerow(['id_card_in_book', 'surname', 'first_name', 'surgery_date',
                    'why_held_back', 'card_already_in_app'])
        for p, rec in skipped:
            inapp = ''
            for g in d['duplicate_groups']:
                if any(y['id_key'] == p['id_key'] for y in g['patients']):
                    inapp = ' / '.join(sorted(c for x in g['patients'] if x['registry']
                                              for c in x['cards']))
                    break
            w.writerow([rec['id_card'], rec['surname'], rec['first_name'],
                        rec['surgery_date'] or '',
                        'the ID card looks like a mistyped version of one already in the app - '
                        'inserting it would file this patient twice', inapp])
        # The same patient under two cards, joined onto the app's file rather
        # than filed again. An EARLIER run of this import did not join them, so
        # if one was run these cards are sitting in the app as second files for
        # a patient who already has one.
        for book_card, app_card in d.get('merged_cards', []):
            reg_row = next((r for r in d['registry'] if r['id_card'] == app_card), None)
            w.writerow([book_card, (reg_row or {}).get('surname', ''),
                        (reg_row or {}).get('first_name', ''),
                        ((reg_row or {}).get('surgery_date') or '')[:10],
                        'same name and same operation date as a patient already in the app, so '
                        'the book\'s rows were put on that patient instead of filing them again. '
                        'If an earlier run of this import created a file under this card, it is a '
                        'duplicate and can be deleted once you have checked it', app_card])

    print(f"""
Written to {outdir}/

  import-1-new-patients.sql   {len(new_rows):>5} patients to create   (run this second)
  import-2-fill-existing.sql  {wrote:>5} patients to fill in    (run this first)
  import-3-held-back.csv      {len(skipped):>5} cards to look at by hand
  import-7-stoma-list.sql     {len(rows7):>5} patients' stoma lists put right
  import-8-dates-to-check.csv {checks:>5} operations the two records date differently
  import-9-firm-missing.csv   {firmless:>5} patients the book has no row for, so no firm

No patient is ever deleted and nothing a nurse has typed is overwritten;
running any of these twice changes nothing the second time. The one thing
import-7 takes away is a stoma this import itself invented — see its header.
""")
    return {'new': len(new_rows), 'updated': wrote, 'held': len(skipped)}


if __name__ == '__main__':
    emit(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
