"""Generate everything, then stitch it into ONE file to paste into Supabase.

The four steps have to run in a particular order — correcting a mistyped year
after a reversal date has been filled in leaves the reversal sitting before the
operation it closed — and asking someone to remember that while pasting four
files into a SQL editor is a good way to get it wrong. So they are also written
out as a single import.sql that runs them in the right order inside one
transaction: it either all lands or none of it does.
"""
import datetime
import os
import re
import sys

import dry_run
import make_sql
import fix_year_typos
import set_reversed
import tidy_operations

# The tidy runs first so that the operation column is already occupied by the
# text a nurse typed before the book is used to fill what is still blank -
# otherwise the same operation ends up printed in both columns.
STEPS = [
    ('import-0-tidy-operations.sql', 'STEP 1 - move operations out of the Comments column'),
    ('import-5-fix-year-typos.sql', 'STEP 2 - correct operation dates whose year was typed wrong'),
    ('import-2-fill-existing.sql', 'STEP 3 - fill the gaps on patients you already have'),
    ('import-1-new-patients.sql', 'STEP 4 - create the patients only the register book has'),
    ('import-6-set-reversed.sql', 'STEP 5 - mark the Reversal book\'s patients reversed'),
    # Last, because it is the authority on the stoma list and has to overrule
    # anything the earlier steps put there — including an earlier run of this
    # same import, which invented a second stoma for patients who only ever
    # had one.
    ('import-7-stoma-list.sql', 'STEP 6 - put the stoma list right'),
]


def combine(outdir):
    """One file, one transaction, the four steps in the order they must run."""
    body = []
    for name, title in STEPS:
        raw = open(os.path.join(outdir, name), encoding='utf-8').read()
        # Each part is written to stand alone, so it opens its own transaction
        # and prints its own summary. Inside the combined file there is one
        # transaction around the lot and one summary at the end.
        raw = re.sub(r'^BEGIN;\s*$', '', raw, flags=re.M)
        raw = re.sub(r'^COMMIT;\s*$', '', raw, flags=re.M)
        raw = re.sub(r'\n-- (What landed|How the register reads now|Anything still dated in the future)\.'
                     r'\n(SELECT|WITH)[\s\S]*?;\s*$', '', raw)
        # A trailing read-only SELECT belongs at the end of the run, not in the
        # middle of the transaction where its output would be lost.
        raw = re.sub(r'\nSELECT id_card, surname, first_name, left\(findings[\s\S]*?;\s*$', '', raw)
        body.append(f"\n\n-- {'=' * 75}\n-- {title}\n-- {'=' * 75}\n{raw.strip()}\n")

    out = os.path.join(outdir, 'import.sql')
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(f"""-- =============================================================================
-- THE WHOLE IMPORT, IN ONE FILE
-- =============================================================================
-- Generated {datetime.date.today():%d %B %Y} from the register books.
--
-- Paste this into the Supabase SQL Editor and press Run. That is all - there
-- is nothing to run first and nothing to run afterwards. The five steps are
-- in the order they have to happen and the whole thing is one transaction, so
-- it either all lands or none of it does.
--
-- WHAT IT DOES
--   1. moves operations out of the Comments column, where many were typed,
--      and back into Operation Performed where they belong
--   2. corrects 14 operation dates whose year was typed wrong
--   3. fills blanks on the patients you already have - never overwrites
--   4. creates the patients only the book has
--   5. marks the Reversal book's patients reversed, with their date
--   6. puts the stoma list right - takes out the second stoma an earlier run
--      of this import invented for patients who only ever had one, and keeps
--      every stoma entered by hand
--
-- WHAT IT WILL NOT DO
--   * it never deletes a patient
--   * it never overwrites a name, a date of birth, a stoma type or a date
--     already on a record - only blanks are filled
--   * running it twice changes nothing the second time
--
-- THE ONE THING IT DOES REMOVE
--   A patient whose stoma was reversed has their date of death cleared, on
--   purpose: this register follows the stoma and its interest ends at the
--   reversal. The date is written into that patient's notes in words first,
--   so it stays readable on the record and can be put back by hand.
--
-- Read import-4-final-registry.xlsx first if you want to see the result
-- before running anything.
-- =============================================================================

BEGIN;
{''.join(body)}

COMMIT;

-- ---------------------------------------------------------------------------
-- How the register reads now.
-- ---------------------------------------------------------------------------
SELECT followup_status AS status, COUNT(*) AS patients
FROM public.patients GROUP BY 1 ORDER BY 2 DESC;

-- Nothing here should return a row.
SELECT 'operation dated in the future' AS problem, id_card, surname, surgery_date
FROM public.patients WHERE surgery_date > CURRENT_DATE
UNION ALL
SELECT 'reversed before it was formed', id_card, surname, reversal_date
FROM public.patients WHERE reversal_date < surgery_date;
""")
    return out


def main(outdir='import-report'):
    os.makedirs(outdir, exist_ok=True)
    print('Reading the books…')
    dry_run.main(outdir)
    make_sql.emit(outdir)
    fix_year_typos.main(outdir)
    set_reversed.main(outdir)
    tidy_operations.main(outdir)
    out = combine(outdir)
    parts = split(out, outdir)
    kb = os.path.getsize(out) // 1024
    print(f"\n{'=' * 68}")
    print(f"IF YOUR SQL EDITOR TAKES A BIG FILE:  {os.path.basename(out)}  ({kb} KB)")
    print(f"OTHERWISE RUN THESE {len(parts)} IN ORDER, ONE AT A TIME:")
    for f in parts:
        print(f"   {os.path.basename(f):<28} {os.path.getsize(f) // 1024:>4} KB")
    print('=' * 68)
    return out


def split(path, outdir, target_kb=190):
    """Cut the combined file into pieces small enough to paste into a browser.

    The Supabase SQL editor is a text box in a web page, and a megabyte of SQL
    pasted into one is slow at best. The cut only ever falls between statements
    — never inside one — so each piece runs on its own, and each is wrapped in
    its own transaction. Run them in order: they are the same statements in the
    same sequence, just handed over a few at a time.
    """
    text = open(path, encoding='utf-8').read()
    body = text.split('BEGIN;', 1)[1].rsplit('COMMIT;', 1)[0]
    # Statement boundaries: a semicolon that is not inside a string literal.
    # Counting quotes per line is not good enough — the values are full of
    # doubled quotes ("Hartmann''s") and one miscount merges every INSERT in
    # the file into a single 700 KB lump that cannot be split at all.
    # It must also skip -- comments. The prose in these files is full of
    # apostrophes ("the Reversal book's patients"), and one of those read as
    # the start of a string literal puts the scanner out of step for the rest
    # of the file — which is how a cut landed in the middle of an operation.
    stmts, start, i, n, in_str = [], 0, 0, len(body), False
    while i < n:
        c = body[i]
        if in_str:
            if c == "'":
                if i + 1 < n and body[i + 1] == "'":
                    i += 2          # an escaped quote inside the literal
                    continue
                in_str = False
        elif c == '-' and i + 1 < n and body[i + 1] == '-':
            nl = body.find('\n', i)
            i = n if nl == -1 else nl
            continue
        elif c == '/' and i + 1 < n and body[i + 1] == '*':
            close = body.find('*/', i + 2)
            i = n if close == -1 else close + 2
            continue
        elif c == "'":
            in_str = True
        elif c == ';':
            stmts.append(body[start:i + 1])
            start = i + 1
        i += 1
    tail = body[start:]
    if tail.strip():
        stmts.append(tail)

    limit, parts, cur, size = target_kb * 1024, [], [], 0
    for st in stmts:
        if cur and size + len(st) > limit:
            parts.append(''.join(cur))
            cur, size = [], 0
        cur.append(st)
        size += len(st)
    if cur:
        parts.append(''.join(cur))

    written = []
    for i, chunk in enumerate(parts, 1):
        f = os.path.join(outdir, f'import-part-{i:02d}-of-{len(parts):02d}.sql')
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(f"""-- =============================================================================
-- REGISTER BOOK IMPORT — PART {i} OF {len(parts)}
-- =============================================================================
-- Generated {datetime.date.today():%d %B %Y}.
--
-- The whole import was one file of about a megabyte, which a SQL editor in a
-- browser will not take comfortably. It is the same import, handed over a few
-- statements at a time.
--
--   * RUN THEM IN ORDER, 1 to {len(parts)}. The order matters.
--   * Wait for each to finish before pasting the next.
--   * Each part is one transaction: it either lands or it does not.
--   * Running a part twice changes nothing the second time, so if you lose
--     your place it is safe to run one again.
--
-- No patient is ever deleted, and nothing already on a patient is overwritten —
-- only blanks are filled. There are two exceptions, both deliberate:
--
--   * a patient whose stoma was reversed has their date of death cleared, with
--     the date written into their notes first;
--   * the last part puts the stoma list right. An earlier version of this
--     import gave patients who have only ever had one stoma a second one that
--     never existed. It takes those out, keeps every stoma entered by hand,
--     and puts back only the ones the register book supports. If you have
--     already run the earlier import, this is the part that repairs it.
-- =============================================================================

BEGIN;
{make_sql.PREAMBLE}
{chunk}
COMMIT;
""")
            if i == len(parts):
                fh.write("""
-- ---------------------------------------------------------------------------
-- All parts are in. How the register reads now.
-- ---------------------------------------------------------------------------
SELECT followup_status AS status, COUNT(*) AS patients
FROM public.patients GROUP BY 1 ORDER BY 2 DESC;

-- Nothing here should return a row.
SELECT 'operation dated in the future' AS problem, id_card, surname, surgery_date
FROM public.patients WHERE surgery_date > CURRENT_DATE
UNION ALL
SELECT 'reversed before it was formed', id_card, surname, reversal_date
FROM public.patients WHERE reversal_date < surgery_date;
""")
        written.append(f)
    return written


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
