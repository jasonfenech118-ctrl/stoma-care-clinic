# MDH Stoma Care Clinic — working notes for Claude

Single-page clinical web app. `index.html` is the app (one big inline `<script>`);
helper modules live in `assets/` and are included from `index.html`.

## Deploy
- The live site is **GitHub Pages served from the `main` branch**
  (`jasonfenech118-ctrl.github.io/stoma-care-clinic/`). There is no build
  workflow — Pages serves the branch files directly.
- Develop on the designated feature branch, then **fast-forward `main`** to it so
  the change actually goes live: `git push origin HEAD:main`. A change that is
  only on the feature branch is NOT live.
- Bump `APP_BUILD` in `index.html` (search `const APP_BUILD=`) on every change and
  tell the user the new build number. The number shows in the top-bar version pill.
- Verify inline scripts parse before pushing (extract each inline `<script>` and
  `new Function(...)` it), and run any relevant scratchpad harness.

## ⚠️ ALWAYS keep the in-app User Manual in sync
There is a built-in **User Manual** (the ❓ tab). It lives in
`assets/manual.js` (+ `assets/manual.css`) — NOT in Supabase, on purpose
(Supabase space is for patient data only).

**Whenever you add or change any user-facing feature, button, page, workflow or
automation anywhere in the app, update the manual in the SAME commit:**
1. Edit/add the matching page in `MANUAL_SECTIONS` in `assets/manual.js`
   (its `title`, `keywords` for search, and the step-by-step `html`).
2. If it is something the app does automatically, add/update a card in the
   **Automations catalogue** page (`auto` section).
3. Bump `MANUAL_META.updated` to today's date.
4. Bump the `?v=` query on the `assets/manual.js` / `manual.css` includes in
   `index.html` so browsers pick up the new file.
The manual must always describe the *current* build. Treat "manual not updated"
as an incomplete change.

## Supabase
- Patient data lives in Supabase; schema changes are one-off SQL files in `sql/`.
  Writes go through `updatePatientTolerant`, which drops columns the DB does not
  have yet (so a missing migration degrades gracefully with a message).
- Never put help text, static content or app assets in Supabase.
