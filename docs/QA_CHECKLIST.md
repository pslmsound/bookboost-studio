# Manual QA checklist for Windows

Run this once on a Windows 10 or 11 PC after building the installer. It takes about 25 minutes. Use a clean Windows user account if possible, so the test is a true first run.

Record the result of each line as pass or fail. Anything marked **(Windows only)** could not be tested in the build environment and matters most.

## 1. Install

- [ ] **(Windows only)** `BookBoost-Studio-Setup-1.0.0.exe` runs. SmartScreen shows the expected warning; **More info**, **Run anyway** proceeds.
- [ ] **(Windows only)** Install completes without asking for an administrator password.
- [ ] **(Windows only)** Desktop and Start menu shortcuts named "BookBoost Studio" exist and show the app icon (ivory B on charcoal).
- [ ] **(Windows only)** The app opens automatically after install, and again from each shortcut.
- [ ] Opening the app a second time while it is running focuses the existing window instead of opening another.

## 2. First run and onboarding

- [ ] The welcome screen appears with "Set up my book" and "Explore with a sample book".
- [ ] "Continue" on the book step with an empty title shows "Add the book title", and the message clears when you type.
- [ ] A website that does not start with `https://` is rejected with a clear message.
- [ ] **(Windows only)** "Add cover" opens a file picker. Choosing a PNG or JPG shows the cover. A file over 10 MB is refused with a message.
- [ ] Finishing onboarding opens the Overview with the book title, author and cover.

## 3. Persistence

- [ ] Close the app completely and reopen it. The book, cover and author name are still there.
- [ ] `%APPDATA%\BookBoost Studio\data\bookboost.sqlite` exists.
- [ ] `%APPDATA%\BookBoost Studio\backups` contains a file named `auto-` followed by today's date.

## 4. Books

- [ ] Add a second book. Switch between books with the switcher at the bottom of the sidebar. Each book shows its own data.
- [ ] Edit a book and replace its cover. The new cover appears everywhere.
- [ ] Archive a book. It moves to the Archived view and can be restored.
- [ ] Delete a book. The confirmation names the book, and after confirming its data is gone.

## 5. Campaigns

- [ ] Create a campaign with dates, channels and a budget. An end date before the start date is rejected.
- [ ] Add tasks and a milestone. Checking a task updates the progress bar here and on the Overview.
- [ ] Spending more than the budget shows the amount over in red.
- [ ] Deleting a campaign asks for confirmation.

## 6. Content Studio (without AI)

- [ ] Create a draft, type in it, and wait two seconds. The status reads "All changes saved".
- [ ] Press Ctrl+S while typing. It saves immediately.
- [ ] Switch to another draft and back. The text is intact.
- [ ] Type, then close the app within one second and reopen. The text is intact. **(Windows only)**
- [ ] Preview shows headings, bold text and lists.
- [ ] **(Windows only)** Export as .txt and .md. The files open in Notepad with the right content.
- [ ] Copy puts the text on the clipboard.
- [ ] "Draft with AI" with no provider set up shows the setup notice, not an error.
- [ ] Right click in the editor offers cut, copy, paste and spelling suggestions.

## 7. AI assistant

- [ ] **(Windows only)** In Settings, save an API key. The badge reads "Key saved securely". Restart the app: the key is still saved.
- [ ] `%APPDATA%\BookBoost Studio\secrets.json` does not contain the key in readable form.
- [ ] "Load available models" lists models. "Test connection" reports success.
- [ ] The first Generate shows the privacy notice. "Not now" sends nothing.
- [ ] After accepting, a suggested draft appears for review. Nothing in the editor changes until "Use this draft" or "Replace my draft" is pressed.
- [ ] After replacing, Version history contains the previous text and can restore it.
- [ ] "Revise with AI" with an instruction returns a revised draft for review.
- [ ] AI Assistant page: generate a marketing plan. It is saved in the list below and can be edited and exported.
- [ ] Enter a wrong key: the message says the key was rejected. Disconnect from the internet: the message says the provider could not be reached. The rest of the app still works.
- [ ] "Remove" deletes the saved key.

## 8. Calendar

- [ ] Schedule an item on a date. It appears in the month grid and on the Overview week strip.
- [ ] "Approve" moves it from waiting to approved. "Mark posted" marks it posted. Nothing is published anywhere.
- [ ] Link a draft to an item. The item shows the draft text and "Copy text" works.
- [ ] **(Windows only)** Export CSV opens correctly in Excel, including accented characters.

## 9. Outreach

- [ ] Add a contact. An invalid email is rejected.
- [ ] With consent "Not recorded", the send icon shows a message asking you to record consent first.
- [ ] With consent "Do not contact", the pitch and send actions are disabled.
- [ ] With consent "Opted in", logging contact sets today's date, moves the stage forward and sets a follow up in seven days. The follow up appears in Next actions on the Overview.
- [ ] Write a pitch for a contact. It opens in an editor and is kept with the contact.
- [ ] **(Windows only)** Download the CSV template, add two rows in Excel, save, and import. The summary reports two imported. Importing the same file again reports them as skipped duplicates.
- [ ] The mail icon opens the default mail app addressed to the contact. **(Windows only)**

## 10. Email

- [ ] Create an email with a subject and preview text.
- [ ] **(Windows only)** Export as HTML and open the file in a browser. It shows a clean, readable email with the subject as the page title.

## 11. Analytics

- [ ] Add an entry. Text in the value field is rejected.
- [ ] A verified entry dated in the future is rejected with a message.
- [ ] Tiles, chart and the source breakdown update. The Overview performance chart shows the same metric.
- [ ] **(Windows only)** Download the CSV template, import it, and check the entries appear with the "CSV" marker. A file missing the `date` column is refused with a clear message.

## 12. Backup and restore

- [ ] **(Windows only)** Settings, Back up now, save to the Desktop. A `.bbbackup` file is created.
- [ ] Open the backup in Notepad and confirm the API key does not appear in it.
- [ ] Delete a draft, then Restore from the backup. A confirmation appears first. After restoring, the draft is back.
- [ ] `backups` now contains a `before-restore-` file.
- [ ] Trying to restore a file that is not a backup (rename any text file to `.bbbackup`) shows a clear message and changes nothing.
- [ ] Export everything as JSON creates a readable file.
- [ ] "Open folder" opens the data folder in File Explorer.

## 13. Sample data

- [ ] Settings, Add sample book. A banner reading "Sample data" appears on every page while that book is active.
- [ ] All sample figures in Analytics are labeled "Estimate".
- [ ] Remove sample data. The sample book and all of its records are gone, and your own books are untouched.

## 14. Keyboard and accessibility

- [ ] Tab moves through the sidebar and page controls in a sensible order with a visible gold focus ring.
- [ ] Enter or Space activates buttons. Escape closes any dialog and returns focus to the control that opened it.
- [ ] Tab stays inside an open dialog.
- [ ] With Narrator on, buttons, fields and dialogs are announced with meaningful names.
- [ ] Text is readable at Windows display scaling of 100%, 125% and 150%. **(Windows only)**

## 15. Window behavior

- [ ] Resize the window to its minimum size. No page needs sideways scrolling (wide tables scroll inside their own panel).
- [ ] Maximize and restore. Layouts adapt cleanly.

## 16. Offline

- [ ] Disconnect from the internet and restart the app. Everything except AI generation works, and fonts and icons display correctly.

## 17. Uninstall

- [ ] **(Windows only)** Uninstall from Windows Settings. The shortcuts are removed.
- [ ] **(Windows only)** `%APPDATA%\BookBoost Studio` still exists with the data. Reinstalling brings everything back.
