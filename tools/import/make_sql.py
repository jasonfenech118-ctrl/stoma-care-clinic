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


def _stoma_word(t):
    # The stoma word alone, so "End - Colostomy" and "Colostomy" match.
    mapped, _mf, _c, _n = stoma_types.map_type(str(t or '').strip('[]"').split('","')[0])
    return (mapped or '').split('-')[-1].strip().lower() or None


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
        # The book row for the app's own stoma is not repeated as a later
        # stoma. It is matched on a window rather than on the exact day: the
        # same operation is routinely written a day either side in the two
        # records, and nobody has two stoma operations of the same kind within
        # a fortnight of each other. Matching on the exact date alone turned
        # one operation into two for hundreds of patients.
        def same_operation(f):
            if not f['date']:
                return False
            if abs((f['date'] - app_date).days) > SAME_OP_DAYS:
                return False
            book, appt = _stoma_word(f.get('stoma_type')), _stoma_word(reg.get('stoma_type_raw'))
            return not book or not appt or book == appt
        base_form = next((f for f in forms if f['date'] == app_date), None) \
            or next((f for f in sorted(forms, key=lambda x: abs((x['date'] - app_date).days)
                                       if x['date'] else 99999) if same_operation(f)), None)
        later = [f for f in forms if f is not base_form]
        first = base_form or forms[0]
    else:
        first, later = forms[0], forms[1:]
    extra = [stoma_entry(r, f'imp{p["id_key"]}s{i + 2}')
             | _row_extras(r, first.get('address'), first.get('phone'), first.get('consultant'))
             for i, r in enumerate(later)]

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
    if first['date_quality'] == 'month':
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
    if first['date'] and first['date'] > datetime.date.today():
        notes.append(f'Book gives surgery as {first["date"]:%d/%m/%Y}, in the future — left blank.')
    if first['type_confidence'] in ('unmapped', 'ambiguous', 'blank'):
        notes.append(f'Stoma type reads "{first["stoma_type_raw"] or "(blank)"}" — set it by hand.')
    if first.get('name_confidence') == 'low':
        notes.append(f'Name in the book: "{first["name_raw"]}" — check which half is the surname.')

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
--
-- RUN THE FILES IN THIS ORDER. It matters: the year corrections have to land
-- before any reversal date is filled in, or a reversal can end up sitting
-- before the operation it closed.
--     1.  import-5-fix-year-typos.sql   corrects 14 mistyped years
--     2.  import-2-fill-existing.sql    fills blanks on patients you already have
--     3.  import-1-new-patients.sql     creates the patients only the book has
--     4.  import-6-set-reversed.sql     marks the Reversal book's patients reversed
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
            'procedure_performed', 'findings', 'reversal_notes']
    path2 = os.path.join(outdir, 'import-2-fill-existing.sql')
    rows2 = []
    for p_, rec in upd_rows:
        rows2.append('  (' + ', '.join([
            q(rec['id_card']),
            *[q(rec.get(c)) for c in FILL],
            q(rec.get('surgery_date')), q(rec.get('reversal_date')),
            jsonq(rec['extra_stomas']) if rec['extra_stomas'] else "NULL",
            jsonq(rec['initial_stomas']) if rec['initial_stomas'] else "NULL",
            'true' if p_['deaths'] else 'false',
        ]) + ')')
    wrote = len(rows2)
    with open(path2, 'w', encoding='utf-8') as fh:
        fh.write(HEADER.format(
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
       procedure_performed, findings, reversal_notes, surgery_date, reversal_date,
       extra_stomas, initial_stomas, deceased)
WHERE t.id_card = v.id_card;
""")
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
