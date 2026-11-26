# Email correspondence: plan for the move to Dataverse

Status: **designed and built as a preview, not switched on.** The preview is in
`assets/email-correspondence.js` (button **📧 Add an email · Preview**, administrators
only). Nothing is saved and no email is sent until this plan is carried out.

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
6. **Attachments** (pictures and files) are **saved automatically** with their message.
7. **Report:** every message of a conversation, or all of a patient's
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
   - **Match the patient:** take the ID card from the subject. Strip `RE:` and `FW:`,
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
   - "Send an email (V2)" from the shared mailbox.
   - **To:** the last sender.
   - **CC:** everyone else on the email, plus stomacare.mdh@gov.mt.
   - **Subject:** the patient's name, surname and ID card.
   - The reply is saved straight away as the next encounter.
3. **Reminders:** an open episode with a reminder date shows in the bell, as today.

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
- Builds the reply with the agreed To, CC and subject rule.

## To switch it on

1. Create the three tables above in Dataverse.
2. Build the two flows and get the shared-mailbox permission from hospital IT.
3. Replace the preview's Save and "Open in Outlook" buttons with calls to Dataverse
   and the reply flow. In `assets/email-correspondence.js`, set `ENABLED=true`.
4. Show the saved messages in Patient correspondence, the correspondence report and
   the patient's episode history.
5. Update the User Manual page "Linking emails" and its Automations card.
