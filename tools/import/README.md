# Register book import

Reads the four register sources, joins them on the ID card, and reports what
an import would do — **without writing anything**.

```
python3 tools/import/dry_run.py [output-dir]      # default: ./import-report
```

## The sources

| File | What it holds | Dates |
|---|---|---|
| `New_Patients.xlsx` | one row per stoma formed | 2012 → 2026 |
| `Reversal_of_Patients_2012.xlsx` | one row per reversal | 2012 → 2022 |
| `Deceased_Patients.xlsx` | Name / Surname / ID under a year | 2002 → 2026 |
| `Patients.csv` | the live registry, exported from the app | — |

The paths are at the top of `sources.py`. Point them at a fresh export to
re-run against newer data.

## What the code has to cope with

The books are written by hand and the conventions change from year to year,
so each of these is handled explicitly rather than assumed away:

- **Section headings** appear as a bare month (`January`), a bare year
  (`2015`), a real date cell, or a sentence (`January of the Year 2014`) —
  and in different columns depending on the year. `sources._read_band` reads
  all of them, and only ever looks at short rows with no ID card, so an
  operation note mentioning a month cannot move the section on.
- **Misspelled months** — `Janauary`, `Febuary` — are in a small alias list.
- **ID cards** carry stray spaces and leading zeros. `norm_id` gives the
  storable form; `id_key` drops leading zeros so `0970249M` and `970249M`
  match as one patient.
- **Name order flips.** Early rows read `Zammit Carmel` (surname first),
  later ones `Domenica Belizzi` (given first), with no marker for which. The
  registry and the Deceased book keep the halves in separate columns, so they
  are used to build a dictionary of Maltese surnames and given names, and the
  dictionary decides the order. Rows it cannot decide are still split, on the
  dominant surname-first convention, but flagged for checking.
- **Stoma types** have 105 spellings of about a dozen things. Words are
  matched by closeness rather than by an alias list, so `ileosotmy`,
  `ilestomy` and `Ilesosotomy` all reach `Ileostomy`. A mucus fistula named
  alongside the stoma is returned separately, because it is a second output
  formed at the same operation and the registry models it that way.
- **Reversal dates** are mostly not written down. Where the comment carries
  one (`Reversal of Ileostomy 20/3/15`) it is used; otherwise the date falls
  back to the section's month, marked `month`, and sits on the 1st. A date
  more than a year from its own section is refused as a misread.

Nothing is guessed silently. Every fallback is recorded in a `*_quality` or
`*_confidence` field and every unresolved row reaches
`5-needs-a-decision.csv`.

## Output — and why it is not committed

The worklists carry patient names, ID cards, addresses and clinical findings.
`import-report/` is in `.gitignore` and must stay there. Do not commit the
generated CSVs, and do not paste them into anything that leaves the hospital.

| File | What to do with it |
|---|---|
| `1-patients-to-create.csv` | patients the book has and the app does not |
| `2-reversals-missing-from-app.csv` | reversals to add to patients already in the app |
| `3-deaths-missing-from-app.csv` | dates of death the app is missing |
| `4-duplicate-files-likely.csv` | ID card looks mistyped — very likely one patient twice |
| `4b-same-name-different-card.csv` | same name, unrelated cards — usually different people |
| `5-needs-a-decision.csv` | everything the import refuses to guess at |
| `6-full-stoma-timeline.csv` | every stoma and reversal, per patient, in order |
| `7-in-app-not-in-book.csv` | in the app, not in the book |

## Files

- `normalise.py` — ID cards, dates, months, text
- `sources.py` — the four readers, band-aware
- `names.py` — the surname / given-name dictionary and the splitter
- `stoma_types.py` — free text → the dropdown, plus the mucus-fistula flag
- `crossref.py` — joins everything, builds the timelines, raises the flags
- `dry_run.py` — the report
