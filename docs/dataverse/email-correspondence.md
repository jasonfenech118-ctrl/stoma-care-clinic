# Email correspondence: plan for the move to Dataverse

Status: **working for testing by the administrators only**, before the move to
Dataverse. The code is in `assets/email-correspondence.js` and pictures and files
in `assets/patient-images.js`. Both have `FOR_EVERYONE=false`, so only Jason and
Jacqueline see them.

How the testing version works (Supabase):
- An email (a dropped .eml or a pasted email) is saved as a contact of a Patient
  correspondence issue, through the existing `save_patient_communication`
  function. It therefore gets its DC/CC/PC encounter code like any contact.
- Its email details go in `public.patient_emails` (`sql/add-patient-emails.sql`):
  From, To, CC, when it was sent, text, original email, attachment names, and the
  Message-ID or a fingerprint, used to skip an email already saved.
- Pictures and documents go to the private `patient-images` store
  (`sql/add-patient-images.sql`), linked to that contact.
- A reply is saved as the next contact, then opens in Outlook through a mailto
  link. Outlook cannot take attachments that way, so they are downloaded for the
  nurse to attach.

Moving to Dataverse means:
- copying `patient_emails`, the correspondence contacts and the stored files into
  the tables below;
- replacing the mailto step with the Power Automate reply flow, which sends the
  attachments too.

## What the clinic wants

1. **Link emails to the patient.** Emails come from doctors, community nurses and
   patients/relatives. Each one is linked to the patient and kept in the patient
   record.
2. **One communication episode per conversation.** Every message in it, sent or
   received, is its own **encounter** with its own code:
   - `EP03-123456M-02-DC`: Doctors correspondence
   - `EP03-123456M-02-CC`: Community correspondence
   - `EP03-123456M-02-PC`: Patient correspondence

   The numbering follows `assets/episode-codes.js`:
   - Correspondence outside an admission opens an episode, or joins one that is still open.
   - While the patient is admitted, correspondence joins that admission.
   - The encounter number restarts at 01 in each episode.
3. **Keep the original email** word for word, so it can be printed from the app
   without going back to Outlook.
4. **Save who sent it and who was copied in.** Record From, To and CC automatically.
   BCC is never visible to the clinic, so it is not recorded.
5. **Replies are written in the app.**
   - The email subject is **always the patient's name, surname and ID card number,
     nothing else**, e.g. `Jane Testpatient 123456M`.
   - **stomacare.mdh@gov.mt is always copied in**, so every reply comes back to the
     clinic mailbox.
6. **Full control of the other CCs:** the nurse can remove any CC address, or
   add one, before sending.
   **Locked:** nobody using the app can change the subject or take
   stomacare.mdh@gov.mt out of CC. The app never offers them as editable; the
   reply flow sets them itself.
7. **One continuous conversation.** A reply written in the app is sent as
   **Reply all** to the latest email of that conversation, using its stored
   message ID. The doctor's first email and every reply stay underneath it, in one
   Outlook conversation. Each email, sent or received, is saved as the next
   encounter of the same episode: 01, 02, 03 …
8. **Attachments** (pictures and files) are **saved automatically** with their message.
   A **reply can carry attachments too**:
   - photos (camera or gallery on a phone) and files;
   - any picture received in the conversation, sent back as it is;
   - a received picture marked up **with one click**: its **✏️ Mark up & reply**
     button, or a tap on the picture, in the email itself opens it in the marker;
     the marked-up copy goes straight onto the reply;
   - a received picture **marked up in the app**: a marker in seven colours,
     thin / medium / thick, with Undo and Start over. It is saved as
     "marked-up <name>.jpg", with the longest side at most 1600 px.

   The total per email is kept under 20 MB. Reply attachments are sent with the
   reply and saved with that message like any other attachment.
9. **Report:** every message of a conversation, or all of a patient's
   correspondence, **one by one**, printable or saved as PDF.

## Data model (Dataverse)

| Table | Column | Notes |
|---|---|---|
| **Correspondence episode** | Patient (lookup) | |
| | Kind | Doctors / Community / Patient |
| | Episode code | `EP03-123456M` |
| | Status | Open / Awaiting response / Follow-up required / Resolved |
| | Opened on, Resolved on | |
| | Reminder (date, action) | as in the current Patient correspondence |
| **Email message** | Episode (lookup) | |
| | Encounter code | `EP03-123456M-02-DC`, given on save, never changes |
| | Direction | Sent by the clinic / Received |
| | Sender type | Doctor / Community nurse / Patient-relative / Stoma care clinic |
| | From (name, address) | |
| | To, CC | text, `Name <address>; …` |
| | Sent on | date and time, Malta time |
| | Subject | |
| | Message text | the new text only, without the quoted history |
| | Original email | the whole email as received, for reference and printing |
| | Internet message ID | from the email header, used to skip duplicates |
| | Conversation ID | Outlook's conversation ID |
| | Saved by, saved on | |
| **Email attachment** | Message (lookup) | |
| | File | Dataverse File / Image column |
| | Name, type, size | |

## Power Automate flows

All the flows run inside the hospital's Microsoft 365 tenant, with no outside service.
They need hospital IT and data-protection approval.

1. **Incoming / sent mail → patient record**
   - **Trigger:** "When a new email arrives in a shared mailbox (V2)" on
     stomacare.mdh@gov.mt, including Sent Items.
   - **Match the conversation first:** if the email's Conversation ID belongs to a
     saved episode, file it there, even if someone outside changed the subject or
     dropped the clinic from CC. Their reply still reaches the clinic when it is
     sent to it.
   - **Otherwise match the patient:** take the ID card from the subject. Strip `RE:` and `FW:`,
     ignore leading zeros, spaces and letter case (the app's `normaliseIdCard`),
     then check the name.
   - **No match, or a different name:** put the email in an "Unfiled emails" list
     for a nurse to file.
   - **Find or open the episode:**
     - the open episode of that kind;
     - else the current admission;
     - else a new one.
   - **Create the Email message** with direction, sender type, From/To/CC, sent
     time, text, original email and message ID. Skip it if the message ID is
     already saved.
   - **Save each attachment** to the Email attachment table.
2. **Reply from the app**
   - "Reply to email (V3)" with Reply all, from the shared mailbox, on the latest
     message of the conversation. Its message ID is stored when it is filed.
   - **To:** the last sender.
   - **CC:** everyone else on the email, plus stomacare.mdh@gov.mt.
   - **Subject:** the patient's name, surname and ID card. Outlook puts "RE:" in
     front of a reply; the name and ID part never change.
   - The reply is saved straight away as the next encounter.
   - People outside the clinic can still edit a subject or CC in their own
     Outlook. The Conversation ID match above keeps those emails filed.
3. **Reminders:** an open episode with a reminder date shows in the bell, as today.

## Idea: paste the Outlook link of an email

The nurse opens an email in Outlook on the web, copies the page address and pastes
it into the patient's correspondence. The app saves that email with its pictures
and files, with no download.

- Needs: the app registered in the hospital's Microsoft 365 (Entra ID / Azure),
  with Microsoft Graph mail permission approved by hospital IT and the data
  protection officer. That is either `Mail.Read` on the nurse's own mailbox,
  signing in with the hospital account, or `Mail.Read.Shared` on
  stomacare.mdh@gov.mt.
- How: the link holds the message ID, after `/id/` in
  `outlook.office.com/mail/.../id/AAMk...`. The app reads the message with Graph,
  `GET /me/messages/{id}?$expand=attachments` or the shared-mailbox equivalent.
  It then files the message like a dropped email file: From, To, CC, date,
  subject, text, original email, attachments, the patient check and the encounter
  code.
- Use: the manual fallback for an email the automatic flow did not file, e.g. one
  sent to a nurse's own mailbox without the clinic in CC.
- Until then, the nearest thing is Outlook ⋯ › Download (.eml), then drop the file
  in the app. That brings the email, pictures and files in one go.

## What the app preview already does

- Reads the email file downloaded from Outlook (`.eml`):
  - exact headers
  - the plain or HTML text
  - the earlier replies inside it
  - the attachments, with small picture previews
- Reads a pasted email. The Forward trick carries From, Sent, To, CC and Subject.
- Splits the thread into one message each, oldest first. For each message it marks
  sent or received and the sender type, and reads From, To and CC.
- Shows the encounter code each message would get, from the patient's real
  episodes (`EpisodeCodes.preview`).
- Checks the ID card or name against the open patient.
- Prints one email laid out like Outlook, or the whole conversation as a report.
- Lets you add photos and files to a reply, re-attach received pictures, and mark
  them up with the coloured marker. The send preview lists them.
- Builds the reply with the agreed To, CC and subject rule:
  - the clinic CC and the subject are locked;
  - the reply is shown as Reply all to the latest email, with the earlier
    conversation underneath.

## To switch it on

1. Create the three tables above in Dataverse.
2. Build the two flows and get the shared-mailbox permission from hospital IT.
3. Replace the preview's Save and "Open in Outlook" buttons with calls to Dataverse
   and the reply flow. In `assets/email-correspondence.js`, set `ENABLED=true`.
4. Show the saved messages in Patient correspondence, the correspondence report and
   the patient's episode history.
5. Update the User Manual page "Linking emails" and its Automations card.
