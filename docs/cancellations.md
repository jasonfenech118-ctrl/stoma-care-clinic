# Appointment cancellations

Cancellation is a separate appointment outcome from DNTU. Nurses record who
requested it (patient or clinic) and a reason. Clinic reasons cover availability,
staff absence, closure and scheduling; patient reasons also allow “Reason not
provided”. “Other” requires a note. There is no default cancellation source.

The actual cancellation date defaults to today for new cancellations. Existing
unclassified records can retain an unknown date; the date of data entry is not
substituted for the cancellation date. The database records the signed-in
account and entry time separately.

## Deploy

1. Run `sql/add-appointment-cancellations.sql` in Supabase SQL Editor before
   deploying this version. It is repeatable and preserves existing records and
   appointment access policies. Older cancellations remain unclassified.
2. Deploy the HTML and both workflow assets together.
3. In a staging clinic, verify patient and clinic cancellation, correction of an
   older record, rebooking, report filtering/export and the mobile form.

Coordinate the migration and deployment as one release, then reload open clinic
tabs. Once the database rules are installed, older versions of the app cannot
save a cancellation without the new required details.

The form refuses to save if the cancellation schema is missing. It never retries
a write by dropping the source or reason. There is no production database
connection in the repository test harness; the migration must be applied to the
target Supabase project by someone with database access.

## Saved records and counting

- An atomic appointment update records the cancellation details and appends an
  audit entry. Date/time, patient and clinical details remain on the original
  appointment. It no longer occupies a booking slot.
- Corrections append to the audit. A revision check prevents stale edits from
  overwriting another nurse's changes. Cancellation history cannot be deleted
  through ordinary appointment deletion.
- “Rebook patient” from cancellation details creates a new appointment linked to
  the original cancellation. Only one active replacement is allowed. General
  patient booking actions do not infer links to an older cancellation.
- “Undo cancellation” corrects an error by returning the original appointment
  to Booked, retaining its audit. It is refused if the slot is occupied or an
  active linked replacement exists. Completed Seen/DNTU outcomes must be
  corrected explicitly before they can be cancelled.
- Cancellations, including older unclassified records, neither increase nor
  reset the consecutive DNTU count. Seen still resets it. No patient follow-up
  fields are written by the cancellation form.
- Reports count **currently cancelled appointments**, by the original scheduled
  appointment month/year. Rebooking preserves that count. Undoing an erroneous
  cancellation removes it from cancellation totals but retains the audit.
  Repeated corrections are not additional cancellations.
- Patient, clinic and source-not-recorded counts add up to the total. The
  Reports page provides source/reason/search filters, reason totals and CSV
  export. The Annual Report includes a monthly cancellation breakdown.

## Checks

```sh
npm ci --prefix tools/tests --ignore-scripts
npm test --prefix tools/tests
```

Tests use synthetic records, jsdom for form behaviour and PGlite's PostgreSQL
engine for the actual migration, trigger, constraints and transaction failures.
They also exercise DNTU counting, old records, report totals and safe CSV output.
DOM tests do not verify visual layout. The cloud browser blocked the local
preview in this environment, so mobile visual review is still required.
