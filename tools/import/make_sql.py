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
    import json
    if not obj:
        return "'[]'::jsonb"
    return "'" + json.dumps(obj, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def stoma_entry(rec, uid):
    """One later-stoma JSON entry, in the shape the app already reads."""
    e = {'uid': uid,
         'type': rec.get('stoma_type'),
         'formed_date': rec['date'].isoformat() if rec.get('date') else None,
         'findings': rec.get('operation') or rec.get('comments'),
         'location': None, 'discharge_date': None,
         'reversal_date': None, 'reversal_notes': None}
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
        # The book row for the app's own stoma, if the book has it, is not
        # repeated as a later stoma.
        base_form = next((f for f in forms if f['date'] == app_date), None)
        later = [f for f in forms if f is not base_form]
        first = base_form or forms[0]
    else:
        first, later = forms[0], forms[1:]
    extra = [stoma_entry(r, f'imp{p["id_key"]}s{i + 2}') for i, r in enumerate(later)]

    # A mucus fistula named alongside a stoma is a second output at the same
    # operation, which is what initial_stomas is for.
    initial = []
    if first.get('mucus_fistula'):
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
            'type': (reg.get('stoma_type_raw') if app_date else None) or first.get('stoma_type')}
    base_date = app_date or first['date']
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

    # Provenance, so anyone reading the record later knows where it came from
    # and how exact the dates are.
    notes = [f'Imported from the register book on {datetime.date.today():%d %b %Y}.']
    if first['date_quality'] == 'month':
        notes.append('Date of surgery is the month only — the day is not written in the book.')
    for r in revs:
        if r['date_quality'] == 'month':
            notes.append('A reversal date is the month only — the day is not written in the book.')
            break
    if any(r['date_quality'] == 'year-only' for r in revs):
        notes.append('A reversal is recorded with the year only, so it has no date on file.')
    if p['deaths']:
        yrs = ', '.join(str(x['year']) for x in p['deaths'] if x['year'])
        notes.append(f'Recorded in the Deceased book for {yrs}; the book gives the year only.')
    if first['date'] and first['date'] > datetime.date.today():
        notes.append(f'The book gives the date of surgery as {first["date"]:%d %b %Y}, which is in '
                     f'the future — it has been left blank. Please check the book.')
    if first['type_confidence'] in ('unmapped', 'ambiguous', 'blank'):
        notes.append(f'Stoma type in the book reads "{first["stoma_type_raw"] or "(blank)"}" '
                     f'— {first["type_note"]}. Please set it by hand.')
    if first.get('name_confidence') == 'low':
        notes.append(f'Name written in the book as "{first["name_raw"]}" — '
                     f'which half is the surname was not certain. Please check.')

    deceased = bool(p['deaths'])
    reversed_all = bool(slots) and all(s['reversal_date'] for _, s in slots)
    status = 'deceased' if deceased else ('reversed' if reversed_all else 'active')

    return {
        'id_card': sorted(p['cards'])[0],
        'first_name': p['first_name'] or '(not recorded)',
        'surname': p['surname'] or '(not recorded)',
        'phone_number': first.get('phone'),
        'address': first.get('address'),
        'locality': locality_from(first.get('address')),
        'consultant': first.get('consultant'),
        # A date past today is a slip of the pen in the book, not an operation
        # that has happened, so it is left out and called out in the notes.
        'surgery_date': first['date'] if (first['date'] and first['date'] <= datetime.date.today()) else None,
        'stoma_type': first.get('stoma_type'),
        'procedure_performed': first.get('operation'),
        'findings': first.get('comments'),
        'reversal_date': base['reversal_date'],
        'reversal_notes': base['reversal_notes'],
        'initial_stomas': initial,
        'extra_stomas': extra,
        'followup_status': status,
        'patient_notes': ' '.join(notes),
    }


HEADER = """-- =============================================================================
-- {title}
-- =============================================================================
-- Generated {when} from the register books.
-- {subtitle}
--
-- SAFE TO RUN, AND SAFE TO RUN TWICE:
--   * nothing is ever deleted
--   * a patient already in the app is only filled in where they are BLANK —
--     anything a nurse has already typed is kept
--   * a patient already inserted by an earlier run is skipped
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Nothing needs to be run first: every column this file writes to is created
--   below if it is not already there.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Every column this import writes to, created only if it is missing. These are
-- the same statements the files in sql/ carry, repeated here so this one file
-- is enough on its own and cannot fail halfway through on a missing column.
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
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharged_gozo_date    date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS relocated_overseas_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS initial_stomas  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_stomas    jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_refashionings jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_statuses  jsonb DEFAULT '[]'::jsonb;
"""

FOOTER = """
COMMIT;

-- What landed.
SELECT followup_status, COUNT(*) AS patients
FROM public.patients GROUP BY 1 ORDER BY 2 DESC;
"""


def emit(outdir='import-report'):
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
        fh.write(HEADER.format(title=f'Register book import - {len(new_rows)} new patients',
                 when=when,
                 subtitle='Patients the book has and the app does not, newest surgery first.'))
        for i in range(0, len(new_rows), 100):
            chunk = new_rows[i:i + 100]
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
    FILL = ['address', 'locality', 'consultant', 'phone_number', 'surgery_date', 'stoma_type',
            'procedure_performed', 'findings', 'reversal_date', 'reversal_notes']
    path2 = os.path.join(outdir, 'import-2-fill-existing.sql')
    wrote = 0
    with open(path2, 'w', encoding='utf-8') as fh:
        fh.write(HEADER.format(
            title=f'Register book import - filling gaps on {len(upd_rows)} existing patients',
            when=when,
            subtitle='Only blank fields are filled. Nothing already in the app is changed.'))
        for p, rec in upd_rows:
            sets = [f'{c} = COALESCE({c}, {q(rec[c])})'
                    for c in FILL if rec.get(c) is not None and c != 'reversal_date']
            # The reversal is the one field that can contradict what the app
            # already holds: the app keeps the patient's newest stoma, and a
            # reversal from the book may belong to an older one. It is only
            # filled in when it is on or after whatever surgery date the row
            # ends up with, so a record can never say a stoma was reversed
            # before it was formed.
            if rec.get('reversal_date') is not None:
                # The reversal is carried as an ISO string (it also lives inside
                # the stoma JSON), so it is cast before being compared with a
                # date column.
                rev = f"{q(rec['reversal_date'])}::date"
                sets.append(
                    f"reversal_date = COALESCE(reversal_date, CASE WHEN "
                    f"{rev} >= COALESCE(surgery_date, {q(rec['surgery_date'])}) "
                    f"THEN {rev} END)")
            # A later stoma is only added where the patient has none recorded.
            if rec['extra_stomas']:
                sets.append("extra_stomas = CASE WHEN extra_stomas IS NULL "
                            "OR jsonb_array_length(extra_stomas) = 0 "
                            f"THEN {jsonq(rec['extra_stomas'])} ELSE extra_stomas END")
            if rec['initial_stomas']:
                sets.append("initial_stomas = CASE WHEN initial_stomas IS NULL "
                            "OR jsonb_array_length(initial_stomas) = 0 "
                            f"THEN {jsonq(rec['initial_stomas'])} ELSE initial_stomas END")
            # A death outranks everything, so it is the one status the import
            # will set on an existing record - and only when the app has none.
            if p['deaths']:
                sets.append("followup_status = CASE WHEN followup_status IS DISTINCT FROM 'deceased' "
                            "AND deceased_date IS NULL THEN 'deceased' ELSE followup_status END")
            if not sets:
                continue
            wrote += 1
            fh.write(f"\n-- {rec['surname']}, {rec['first_name']}\nUPDATE public.patients SET\n  "
                     + ',\n  '.join(sets) + f"\nWHERE id_card = {q(rec['id_card'])};\n")
        fh.write(FOOTER)

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

    print(f"""
Written to {outdir}/

  import-1-new-patients.sql   {len(new_rows):>5} patients to create   (run this second)
  import-2-fill-existing.sql  {wrote:>5} patients to fill in    (run this first)
  import-3-held-back.csv      {len(skipped):>5} held back for you to look at

Both SQL files only ever add. Nothing already in the app is overwritten or
deleted, and running either of them twice changes nothing the second time.
""")
    return {'new': len(new_rows), 'updated': wrote, 'held': len(skipped)}


if __name__ == '__main__':
    emit(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
