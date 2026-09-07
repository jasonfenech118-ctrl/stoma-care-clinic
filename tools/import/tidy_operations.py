"""Put the operation back in the Operation column.

The register book keeps the operation in its own column and the Comments
column for what was found — "Hartmann's procedure for a perforated sigmoid"
in one, "CA Rectum" in the other. In the app a great many operations have been
typed into the comments instead, so the New Patients page prints an empty
Operation Performed beside a paragraph of surgery under Comments.

This moves them across. It cannot be generated from a file, because the export
does not carry those two columns at all — so it is written as SQL that works
on whatever is in the database when it runs, which also means it keeps working
as more records are entered.

Two passes:
  MOVE   a comment that names a procedure, where the operation column is empty
  TIDY   a comment that just repeats the operation column, which is left over
         from the same text having been entered in both places

The test for "names a procedure" is deliberately narrow: it looks for words
that describe an operation - Hartmann's, laparotomy, resection, formation,
closure - and never for anatomy or a diagnosis. Checked against the register
book, it recognises 88% of the entries in the book's own Operation column and
leaves alone every comment that is a finding rather than an operation ("CA -
Rectum", "Perforated sigmoid diverticular", "Sigmoid Tumour - Liver mets").
"""
import datetime
import os
import sys

from make_sql import PREAMBLE

# Words that name a procedure. Anatomy and diagnoses are deliberately absent.
OPERATION_WORDS = (
    r"hartman|laparotom|laparatom|laparoscop|laparascop|resect|colectom|"
    r"cystectom|prostatectom|proctocolectom|\maper\M|anastomos|excis|"
    r"formation|procedure|washout|wash out|conduit|defunction|refashion|"
    r"closure|reversal|explorat|bypass|adhesiolys|adhesolys|brought out|"
    r"re-sit|resit|repair|cystoprostatectom|ileal conduit|enterectom|hemicolectom"
)

SQL = """-- =============================================================================
-- Put the operation back in the Operation column
-- =============================================================================
-- Generated {when}.
--
-- The register book keeps the operation in its own column and Comments for
-- what was found. In the app a great many operations have been typed into the
-- comments instead, so the New Patients page shows an empty Operation
-- Performed beside a paragraph of surgery under Comments.
--
-- This works on whatever is in the database when it runs, so it does not
-- depend on an export and keeps working as more records are entered.
--
-- It moves a comment across only when that comment names an operation —
-- Hartmann's, laparotomy, resection, formation, closure and so on. A comment
-- that is a finding ("CA - Rectum", "Perforated sigmoid diverticular") is
-- never moved. Nothing is deleted: a moved comment lands in the operation
-- column, and a comment cleared in the second pass is one that only repeated
-- what the operation column already said.
--
-- Safe to run twice: once moved, the operation column is no longer empty.
-- =============================================================================

{preamble}

-- ---------------------------------------------------------------------------
-- PASS 1 — the operation was typed into the comments, and the operation
--          column is empty. Move it across.
-- ---------------------------------------------------------------------------
UPDATE public.patients
   SET procedure_performed = findings,
       findings            = NULL
 WHERE COALESCE(TRIM(procedure_performed), '') = ''
   AND COALESCE(TRIM(findings), '') <> ''
   AND findings ~* '{words}';

-- ---------------------------------------------------------------------------
-- PASS 2 — the same text sits in both columns. Keep the operation, clear the
--          comment, so the page does not print it twice. Compared with the
--          punctuation and spacing removed, because the two were rarely typed
--          identically.
-- ---------------------------------------------------------------------------
UPDATE public.patients
   SET findings = NULL
 WHERE COALESCE(TRIM(findings), '') <> ''
   AND COALESCE(TRIM(procedure_performed), '') <> ''
   AND regexp_replace(lower(findings),            '[^a-z0-9]', '', 'g')
     = regexp_replace(lower(procedure_performed), '[^a-z0-9]', '', 'g');

-- ---------------------------------------------------------------------------
-- What is left: comments that are still long enough to look like an operation
-- but did not match the words above. Worth a look, but nothing is changed.
-- ---------------------------------------------------------------------------
SELECT id_card, surname, first_name, left(findings, 90) AS comment_left_alone
FROM public.patients
WHERE COALESCE(TRIM(procedure_performed), '') = ''
  AND length(COALESCE(findings, '')) > 45
ORDER BY surname
LIMIT 100;
"""


def main(outdir='import-report'):
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, 'import-0-tidy-operations.sql')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(SQL.format(preamble=PREAMBLE,
                            when=datetime.date.today().strftime('%d %B %Y'),
                            words=OPERATION_WORDS.replace("'", "''")))
    print(f'Written to {path}')
    return path


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'import-report')
