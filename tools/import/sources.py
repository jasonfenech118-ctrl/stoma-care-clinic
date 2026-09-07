"""Read the four register sources into plain records.

Each reader walks its sheet keeping track of the year/month band it is under,
because the book writes the date of an operation in the section heading as
often as in a column. Bands are written a different way almost every year —
a bare month, a bare year, a real date, or a sentence like "January of the
Year 2014" — so every form the files actually contain is handled, and a row
that matches none of them is left alone rather than guessed at.
"""
import csv
import io
import re
import openpyxl
from normalise import (norm_id, id_key, clean, clean_phone, as_date,
                       month_number, year_in_text, date_from_text)

UPLOADS = '/root/.claude/uploads/97da9839-b698-545b-8157-4c6dc869ccad/'
F_NEW = UPLOADS + 'b0e3b3ed-New_Patients.xlsx'
F_REV = UPLOADS + 'b63be950-Reversal_of_Patients_2012.xlsx'
F_DEC = UPLOADS + '67b7d4d3-Deceased_Patients.xlsx'
F_REG = UPLOADS + '4aad5a5d-Patients.csv'


def _sheet(path, name):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = [list(r) for r in wb[name].iter_rows(values_only=True)]
    wb.close()
    return rows


def _nonempty(row):
    return [c for c in row if c is not None and str(c).strip() != '']


def _is_year(c):
    return (isinstance(c, (int, float)) and not isinstance(c, bool)
            and float(c).is_integer() and 1950 < float(c) < 2050)


def _read_band(row, state):
    """Update (year, month) from a section heading. True if this was a band.

    A band is a short row with no ID card in it. Only such rows are examined,
    so an operation note that happens to contain a month name cannot move the
    section on.
    """
    vals = _nonempty(row)
    if not vals or len(vals) > 2:
        return False
    hit = False
    for c in vals:
        d = as_date(c)
        if d:                                   # a real date stands for its month
            state['year'], state['month'] = d.year, d.month
            hit = True
            continue
        if _is_year(c):                         # a bare year opens a new year
            state['year'] = int(c)
            state['month'] = None
            hit = True
            continue
        y, m = year_in_text(c), month_number(c)
        if y:
            state['year'] = y
            hit = True
        if m:
            state['month'] = m
            hit = True
    return hit


def read_new_patients():
    """New_Patients.xlsx — one row per stoma formed.

    Columns: ID, Name, Address, Tel No, Consultant, Operation Date,
    Operation Performed, Stoma Type, Comments.
    """
    out, state = [], {'year': None, 'month': None}
    for i, row in enumerate(_sheet(F_NEW, 'Sheet1')):
        row = row + [None] * (9 - len(row))
        card = norm_id(row[0])
        if not card:
            if not _read_band(row, state):
                # Not a band and not a patient: a stray fragment. Kept so the
                # report can show exactly what was skipped and why.
                vals = _nonempty(row)
                if vals and not str(row[0] or '').strip().lower().startswith('id'):
                    out.append({'kind': 'orphan', 'src_row': i + 1,
                                'raw': ' | '.join(str(v)[:60] for v in vals),
                                'band_year': state['year'], 'band_month': state['month']})
            continue
        out.append({
            'kind': 'formation', 'src_row': i + 1,
            'id_raw': clean(row[0]), 'id_card': card, 'id_key': id_key(card),
            'name_raw': clean(row[1]), 'address': clean(row[2]),
            'phone': clean_phone(row[3]), 'consultant': clean(row[4]),
            'op_date': as_date(row[5]),
            'operation': clean(row[6]), 'stoma_type_raw': clean(row[7]),
            'comments': clean(row[8]),
            'band_year': state['year'], 'band_month': state['month'],
        })
    return out


def read_reversals():
    """Reversal_of_Patients_2012.xlsx — one row per reversal, 2012 onwards.

    Columns: ID, Name, Address, Tel No, Consultant, Comments. There is no date
    column at all: the date is either written into the comment or implied by
    the section, so both are captured and the explicit one wins.
    """
    out, state = [], {'year': None, 'month': None}
    for i, row in enumerate(_sheet(F_REV, 'Sheet1')):
        row = row + [None] * (6 - len(row))
        card = norm_id(row[0])
        if not card:
            if _read_band(row, state):
                continue
            # A reversal with the card left blank still names a patient, so it
            # is kept and matched on the name instead.
            if not clean(row[1]) or str(row[0] or '').strip().lower().startswith('id'):
                continue
            card = None
        out.append({
            'kind': 'reversal', 'src_row': i + 1,
            'id_raw': clean(row[0]), 'id_card': card,
            'id_key': id_key(card) if card else None,
            'name_raw': clean(row[1]), 'address': clean(row[2]),
            'phone': clean_phone(row[3]), 'consultant': clean(row[4]),
            'comments': clean(row[5]),
            'band_year': state['year'], 'band_month': state['month'],
            'exact_date': date_from_text(row[5], state['year']),
        })
    return out


def read_deceased():
    """Deceased_Patients.xlsx — Name, Surname, ID under a year heading.

    Sheet1 stacks one year block after another. Sheet2 puts two years side by
    side, so a year is tracked per column and each entry takes the nearest year
    at or to the left of its own block.
    """
    out = []
    for sheet in ('Sheet1', 'Sheet2'):
        year_by_col = {}
        for i, row in enumerate(_sheet(F_DEC, sheet)):
            for j, c in enumerate(row):
                if _is_year(c):
                    year_by_col[j] = int(c)
            for j, c in enumerate(row):
                if not isinstance(c, str) or not c.strip():
                    continue
                if c.strip().lower() in ('name', 'surname', 'id', 'deceased patients'):
                    continue
                card = norm_id(row[j + 2]) if j + 2 < len(row) else None
                if not card:
                    continue
                yr = None
                for col in sorted(year_by_col, reverse=True):
                    if col <= j + 2:
                        yr = year_by_col[col]
                        break
                out.append({'kind': 'deceased', 'sheet': sheet, 'src_row': i + 1,
                            'first_name': clean(c),
                            'surname': clean(row[j + 1]) if j + 1 < len(row) else None,
                            'id_raw': clean(row[j + 2]), 'id_card': card,
                            'id_key': id_key(card), 'year': yr})
    return out


# The app stores a date as local midnight and the export writes it in UTC, so
# every date in it reads 22:00Z (summer) or 23:00Z (winter) on the DAY BEFORE
# the date the nurse actually typed. Taking the first ten characters is
# therefore wrong by one day for every single row — which made the book and the
# app disagree about the date of the same operation, and turned one stoma into
# two. The timestamp is converted back to Malta time before the date is read.
try:
    from zoneinfo import ZoneInfo
    _MALTA = ZoneInfo('Europe/Malta')
except Exception:                                  # pragma: no cover
    _MALTA = None


def export_date(value):
    """The calendar date a UTC timestamp from the export actually means."""
    v = clean(value)
    if not v:
        return None
    import datetime as _dt
    m = re.match(r'^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})Z?$', v)
    if not m:
        return v[:10] or None
    stamp = _dt.datetime.fromisoformat(m.group(1)).replace(
        hour=int(m.group(2)), minute=int(m.group(3)), second=int(m.group(4)),
        tzinfo=_dt.timezone.utc)
    if _MALTA is not None:
        return stamp.astimezone(_MALTA).date().isoformat()
    # No timezone database: 22:00 and 23:00 are local midnight the next day.
    if stamp.hour >= 22:
        return (stamp + _dt.timedelta(hours=2)).date().isoformat()
    return stamp.date().isoformat()


def read_registry():
    """The live registry, as exported from the app (schema line, then CSV)."""
    raw = open(F_REG, encoding='utf-8-sig').read()
    out = []
    for r in csv.DictReader(io.StringIO(raw.split('\n', 1)[1])):
        card = norm_id(r.get('HospitalNumber'))
        if not card:
            continue
        d = lambda k: export_date(r.get(k))
        out.append({'id_card': card, 'id_key': id_key(card),
                    'id_raw': clean(r.get('HospitalNumber')),
                    'first_name': clean(r.get('FirstName')),
                    'surname': clean(r.get('Surname')),
                    'sex': clean(r.get('Sex')), 'locality': clean(r.get('Locality')),
                    'surgery_date': d('SurgeryDate'),
                    'stoma_type_raw': clean(r.get('StomaTypeSummary')),
                    'status': clean(r.get('PatientStatus')), 'dob': d('DOB'),
                    'rip_date': d('RIPDate'), 'reversal_date': d('ReversalDate'),
                    'discharged_date': d('DischargedDate'),
                    'phone': clean_phone(r.get('ContactNumber'))})
    return out
