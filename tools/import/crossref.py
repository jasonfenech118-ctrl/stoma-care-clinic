"""Tie the four sources together into one timeline per patient.

The register keeps a patient in three places at once — the month they were
given a stoma, the month it was reversed, and the year they died — and the
live registry holds a fourth version of them. This joins all four on the ID
card, works out which rows are the same person written twice, and produces
one record per patient carrying every stoma they have ever had.

Nothing here writes anything. It produces the picture the dry-run report is
built from, so the decisions are visible before any of it reaches the app.
"""
import datetime
import re
from collections import defaultdict

import sources
import names as namesmod
import stoma_types


# --------------------------------------------------------------------------
# duplicate ID cards — the same rule the app's "Needs Checking" page uses
# --------------------------------------------------------------------------
def duplicate_id_reason(a, b):
    """Why two cards look like one card mistyped, or '' if they are different."""
    dig = lambda s: re.sub(r'\D', '', str(s or ''))
    let = lambda s: re.sub(r'[^A-Z]', '', str(s or '').upper())
    da, db = dig(a), dig(b)
    if not da or not db:
        return ''
    if da == db and let(a) != let(b):
        return 'same number, different letter'
    if int(da) == int(db) and da != db:
        return 'leading zero'
    if abs(len(da) - len(db)) == 1 and (da in db or db in da):
        return 'one extra digit'
    return ''


def name_key(first, surname):
    """A loose name key, for spotting one patient filed under two cards."""
    t = lambda s: re.sub(r'[^a-z]', '', str(s or '').lower())
    return f'{t(surname)}|{t(first)}' if (first or surname) else ''


def approx_date(exact, band_year, band_month):
    """The best date available, and how good it is.

    An exact date wins. A year and month give the first of that month, marked
    approximate — that is what the book actually says, and inventing a day
    would be dressing a guess up as a fact. A year alone is not turned into a
    date at all.
    """
    if exact:
        return exact, 'exact'
    if band_year and band_month:
        return datetime.date(band_year, band_month, 1), 'month'
    if band_year:
        return None, 'year-only'
    return None, 'none'


def build():
    reg = sources.read_registry()
    new_rows = sources.read_new_patients()
    revs = sources.read_reversals()
    decs = sources.read_deceased()

    forms = [r for r in new_rows if r['kind'] == 'formation']
    orphans = [r for r in new_rows if r['kind'] == 'orphan']

    surnames, givens = namesmod.build_dictionary(reg, decs)

    # Split every name blob, and map every stoma type.
    for r in forms + revs:
        f, s, conf, order = namesmod.split_name(r.get('name_raw'), surnames, givens)
        r['first_name'], r['surname'] = f, s
        r['name_confidence'], r['name_order'] = conf, order
    for r in forms:
        t, mf, tconf, tnote = stoma_types.map_type(r.get('stoma_type_raw'))
        r['stoma_type'], r['mucus_fistula'] = t, mf
        r['type_confidence'], r['type_note'] = tconf, tnote
        r['date'], r['date_quality'] = approx_date(r['op_date'], r['band_year'], r['band_month'])
    for r in revs:
        r['date'], r['date_quality'] = approx_date(r['exact_date'], r['band_year'], r['band_month'])

    # ---- index the live registry ----
    by_key = {r['id_key']: r for r in reg}
    reg_by_name = defaultdict(list)
    for r in reg:
        reg_by_name[name_key(r['first_name'], r['surname'])].append(r)

    # ---- patients, keyed on the card with leading zeros dropped ----
    patients = {}

    def patient(key, card, first, surname):
        p = patients.get(key)
        if not p:
            p = patients[key] = {
                'id_key': key, 'cards': set(), 'first_name': first,
                'surname': surname, 'formations': [], 'reversals': [],
                'deaths': [], 'registry': by_key.get(key), 'flags': [],
            }
        p['cards'].add(card)
        # The live registry is authoritative for the name where it has one.
        if p['registry']:
            p['first_name'] = p['registry']['first_name']
            p['surname'] = p['registry']['surname']
        elif not p['first_name'] and first:
            p['first_name'], p['surname'] = first, surname
        return p

    for r in forms:
        patient(r['id_key'], r['id_card'], r['first_name'], r['surname'])['formations'].append(r)
    for r in revs:
        if not r['id_key']:
            continue
        patient(r['id_key'], r['id_card'], r['first_name'], r['surname'])['reversals'].append(r)
    for r in decs:
        patient(r['id_key'], r['id_card'], r['first_name'], r['surname'])['deaths'].append(r)

    # Registry patients that no source row mentions still belong in the picture.
    for r in reg:
        if r['id_key'] not in patients:
            patients[r['id_key']] = {
                'id_key': r['id_key'], 'cards': {r['id_card']},
                'first_name': r['first_name'], 'surname': r['surname'],
                'formations': [], 'reversals': [], 'deaths': [],
                'registry': r, 'flags': [],
            }

    # ---- one patient, two ID cards ----
    # A patient whose card was typed wrong in one of the two records appears
    # here as two people: the app's file and a book-only file that would be
    # created alongside it. Where the name AND the date of the operation are
    # the same and only the card differs, it is one patient — two people of the
    # same name do not have stoma surgery on the same day — so the book's rows
    # are moved onto the app's file. Without this the register book's row is
    # either filed twice or held back, and the patient in the app keeps no firm,
    # no address and no operation, because everything the book knows is sitting
    # on the other file.
    merged = []
    for key, p in list(patients.items()):
        if p['registry'] or not p['formations']:
            continue
        nk = name_key(p['first_name'], p['surname'])
        if not nk:
            continue
        dates = {f['date'] for f in p['formations'] if f['date']}
        for r in reg_by_name.get(nk, []):
            if not r.get('surgery_date') or r['id_key'] == key:
                continue
            try:
                app_day = datetime.date.fromisoformat(r['surgery_date'][:10])
            except ValueError:
                continue
            if app_day not in dates:
                continue
            host = patients.get(r['id_key'])
            if host is None or host is p:
                continue
            host['formations'].extend(p['formations'])
            host['reversals'].extend(p['reversals'])
            host['deaths'].extend(p['deaths'])
            host['cards'] |= p['cards']
            host['flags'].append(
                ('one-patient-two-cards',
                 f"the book files them under {sorted(p['cards'])[0]} and the app under "
                 f"{r['id_card']}; same name, same operation date, so they are one patient"))
            merged.append((sorted(p['cards'])[0], r['id_card']))
            del patients[key]
            break

    # ---- flags a nurse has to see ----
    for p in patients.values():
        f = p['flags']
        if len(p['cards']) > 1:
            f.append(('card-written-two-ways', ' / '.join(sorted(p['cards']))))
        # The same operation entered twice: one card, one date, two rows.
        seen = defaultdict(list)
        for r in p['formations']:
            if r['date']:
                seen[r['date']].append(r)
        for d, rows in seen.items():
            if len(rows) > 1:
                f.append(('same-operation-twice',
                          f'{d} appears {len(rows)}× (rows {", ".join(str(x["src_row"]) for x in rows)})'))
        if not p['registry'] and p['formations']:
            f.append(('not-in-registry', 'the book has them, the app does not'))
        if p['registry'] and not p['formations'] and not p['reversals'] and not p['deaths']:
            f.append(('registry-only', 'the app has them, the book does not'))
        if p['deaths'] and p['registry'] and not p['registry']['rip_date']:
            f.append(('death-not-in-app',
                      f'died {p["deaths"][0]["year"]}, app has no date of death'))
        if p['reversals'] and p['registry'] and not p['registry']['reversal_date'] \
                and p['registry']['status'] != 'Reversed':
            f.append(('reversal-not-in-app',
                      f'{len(p["reversals"])} reversal(s) in the book, none in the app'))
        # A reversal with no formation to attach it to.
        if p['reversals'] and not p['formations'] and not (p['registry'] and p['registry']['surgery_date']):
            f.append(('reversal-without-formation', 'reversed, but no stoma formation on file'))
        low = [r for r in p['formations'] + p['reversals'] if r.get('name_confidence') == 'low']
        if low and not p['registry']:
            f.append(('name-order-uncertain', '; '.join(sorted({r['name_raw'] for r in low}))))
        # A stoma cannot be reversed before it is formed. Where the book puts a
        # reversal first it is either filed under the wrong month, or it closes
        # a stoma formed before the New Patients book starts. Month-only dates
        # sit on the 1st, so a reversal in the same month as the formation is
        # counted as out of order too — the day is unknown, not later.
        firsts = [r['date'] for r in p['formations'] if r['date']]
        if firsts:
            earliest = min(firsts)
            for r in p['reversals']:
                if not r['date'] or r['date'] >= earliest:
                    continue
                same_month = (r['date'].year, r['date'].month) == (earliest.year, earliest.month)
                if same_month and r['date_quality'] == 'month':
                    # Harmless: the book gives the month but not the day, so the
                    # date sits on the 1st. The order is still formation first.
                    f.append(('reversal-day-unknown',
                              f'reversed in {r["date"]:%B %Y}, the same month the stoma was '
                              f'formed ({earliest}); the day is not written down '
                              f'(source row {r["src_row"]})'))
                else:
                    # Real: this reversal closes a stoma formed before the New
                    # Patients book begins, so that stoma is in neither file.
                    f.append(('stoma-formed-before-the-book',
                              f'reversed {r["date"]} ({r["date_quality"]}) but the earliest stoma '
                              f'on file is {earliest} — the stoma it closed is in neither book '
                              f'(source row {r["src_row"]})'))

    # ---- one patient filed under two different cards ----
    dup_groups = []
    by_name = defaultdict(list)
    for p in patients.values():
        k = name_key(p['first_name'], p['surname'])
        if k and k != '|':
            by_name[k].append(p)
    for k, group in by_name.items():
        if len(group) < 2:
            continue
        reasons = set()
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                for a in group[i]['cards']:
                    for b in group[j]['cards']:
                        why = duplicate_id_reason(a, b)
                        if why:
                            reasons.add(why)
        dup_groups.append({'name': k, 'patients': group,
                           'reasons': sorted(reasons) or ['same name, unrelated cards']})

    return {'registry': reg, 'formations': forms, 'orphans': orphans,
            'reversals': revs, 'deceased': decs, 'patients': patients,
            'duplicate_groups': dup_groups, 'merged_cards': merged}
