# BookBoost Studio

A private Windows desktop app for planning and managing the marketing of a book. It runs entirely on the author's computer: books, campaigns, drafts, contacts and numbers are stored locally, and nothing is sent anywhere unless the author chooses to use the optional AI assistant with their own provider key.

Version 1.0.0. Target: Windows 10 and 11, 64 bit.

## What is in this package

This is the complete source code, tests and build configuration. It is **not** an installer yet. The installer has to be produced on Windows (or in the included GitHub Actions workflow, which runs on Windows for you). See "What has and has not been verified" at the end for exactly what was tested.

## What the app does

| Area | What it covers |
| --- | --- |
| Onboarding | Six short steps: author details, book basics and cover, readers and voice, goals, channels and purchase links. Or explore with a labeled sample book. |
| Overview | Active book, next actions, pending approvals, campaign progress, the week ahead, outreach pipeline and a performance chart built only from numbers the author entered. |
| My Books | Multiple books with covers, edit, archive, restore, delete, and switching the active book. |
| Campaigns | Objective, audience, channels, dates, budget and spend, tasks and milestones, progress. |
| Content Studio | Captions, launch announcements, newsletters, ad drafts, press releases, book descriptions, podcast pitches and video scripts. Autosave, version history, Markdown preview, export to .txt and .md. |
| Calendar | Month view of planned posts with draft, approved and posted states, linked drafts, and CSV export. |
| Outreach | Contacts for reviewers, podcasts, media and bookstores with stage, consent, follow up dates and notes. Personal pitch drafts per contact. CSV import and export. |
| Email | Newsletter and campaign emails with subject line, preview text and clean HTML export. |
| Analytics | Manual entry and CSV import of sales, revenue, traffic, clicks, engagement, subscribers and reviews. Every figure is labeled verified, entered by you, or estimate. |
| AI Assistant | Marketing plans, brand voice guides, campaign recommendations and questions, plus "Draft with AI" and "Revise with AI" inside every editor. |
| Settings | Author profile, AI provider and key, backup and restore, full JSON export, sample data, privacy summary. |

### Things the app deliberately does not do

- It does not post to social platforms, send email, or contact anyone. The calendar and outreach tools are for planning and tracking. The author publishes and sends everything personally.
- It does not show live sales. It has no connection to any store. The dashboard never invents numbers; sample figures appear only with the sample book and are labeled.
- It does not bulk pitch. Pitches are written one contact at a time, contacts marked "do not contact" cannot be pitched, and a pitch cannot be logged until consent is recorded.
- It does not write fake reviews or endorsements. The assistant is instructed to use bracketed placeholders for any fact it does not have.
- It has no telemetry, no account, and no auto update.

## Build the installer

You need the installer built once. Pick whichever route suits you.

### Route A: on a Windows PC (about 10 minutes)

1. Install **Node.js 22 LTS** from https://nodejs.org (the default options are fine).
2. Unzip this project to a simple path such as `C:\bookboost-studio`.
3. Double-click **`build-windows.bat`**.

It installs dependencies, runs the tests, builds the app and creates the installer, then opens the `release` folder. The file to give the author is:

```
release\BookBoost-Studio-Setup-1.0.0.exe
```

The same steps by hand, in PowerShell:

```powershell
cd C:\bookboost-studio
npm ci
npm test
npm run build
npm run e2e          # optional: drives the real app through the critical path
npm run dist         # creates release\BookBoost-Studio-Setup-1.0.0.exe
npm run dist:portable  # optional: a single .exe that runs without installing
```

### Route B: no Windows PC (GitHub Actions)

1. Create a **private** repository on GitHub and push this folder to it.
2. Open the repository's **Actions** tab, choose **Build Windows installer**, and press **Run workflow**.
3. When it finishes (roughly 10 minutes), download the **BookBoost-Studio-Windows** artifact. It contains the installer and a portable build.

The workflow in `.github/workflows/build-windows.yml` runs the type check, the unit tests and the end to end smoke test on a real Windows machine before it packages anything, so a green run is meaningful evidence that the app works on Windows.

Building the Windows installer directly on macOS or Linux is not supported by this setup, because the installer step requires Wine.

## Installing (for the author)

1. Double-click `BookBoost-Studio-Setup-1.0.0.exe`.
2. Windows will show a blue **"Windows protected your PC"** screen because the installer is not code signed. Click **More info**, then **Run anyway**. This is expected for private software. See "Code signing" below.
3. The app installs for the current user (no administrator password needed), adds Desktop and Start menu shortcuts, and opens.

To uninstall: Windows Settings, Apps, Installed apps, BookBoost Studio, Uninstall. The author's data folder is intentionally left in place so nothing is lost by accident. To remove the data too, delete `%APPDATA%\BookBoost Studio`.

### Code signing

An unsigned installer always triggers the SmartScreen warning above. Removing it requires a code signing certificate from a certificate authority (an OV or EV certificate, or Azure Trusted Signing), which costs money and requires identity verification. For a private gift to one person, the "More info, Run anyway" step is the practical choice. If you later buy a certificate, electron-builder picks it up from the `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables with no code changes.

## Setting up the AI assistant (optional)

Everything works without AI. To enable drafting and planning:

1. Create an API key with a provider. Anthropic (Claude) and OpenAI are built in, and any OpenAI compatible endpoint can be used through "Custom endpoint", including local apps.
2. In the app open **Settings**, **AI assistant**. Choose the provider, paste the key and press **Save key**.
3. Press **Load available models** and choose one, then **Test connection**.

The provider bills the author directly for usage. Typical drafting costs a few cents per request.

### AI privacy

- Requests are made only when the author presses Generate or Revise. The first time, the app explains what will be sent and asks for confirmation. Nothing is sent before that.
- A request contains the selected book's details (title, summary, audience, voice, goals, links), the author bio, the brief, and the draft being revised. Notes about a contact are included only when drafting a pitch for that contact.
- The provider processes that content under its own terms and privacy policy. Do not include anything confidential that should not be shared with that provider.
- The API key is encrypted with Windows account protection (DPAPI, through Electron safeStorage), stored in a separate file, never included in backups or exports, and can never be read back by the interface. No key is bundled with the app.

## Where the data lives

```
%APPDATA%\BookBoost Studio\
  data\bookboost.sqlite    the database
  covers\                  cover images
  backups\                 automatic daily copies (last 10) and pre-restore safety copies
  secrets.json             the encrypted API key, if one was saved
```

- **Back up:** Settings, Your data, Back up now. This writes one `.bbbackup` file containing the database and covers.
- **Restore or move to a new PC:** install the app, then Settings, Your data, Restore. The API key must be entered again on the new PC because it is tied to the Windows account.
- **Automatic copies:** each day the app is opened it saves a copy of the database in `backups`. To recover from one by hand, close the app and copy the file over `data\bookboost.sqlite`.

## Security design

- The interface runs with `contextIsolation` on, `nodeIntegration` off and the Chromium sandbox on. It has no file system or network access of its own.
- One preload bridge exposes a single `invoke` function. Calls are checked against an allow list in the preload and again in the main process, the sender is verified to be the app window, and every payload is validated with Zod before use.
- All database access is parameterized. Table and column names come only from fixed definitions in code.
- A strict Content Security Policy blocks remote scripts, styles, images and connections in the interface. AI requests are made by the main process, not the interface.
- Navigation away from the app and new windows are blocked. External links open in the default browser and only for `http`, `https` and `mailto`.
- Cover images are copied into the app's own folder and served through a private scheme that accepts only generated file names.
- Restoring a backup validates the file, checks the database integrity and refuses unexpected file names before changing anything.
- CSV exports neutralize cells that begin with a formula character.

## Development

```powershell
npm ci
npm run dev        # Vite dev server plus Electron with hot reload
npm run typecheck
npm test           # unit, persistence and workflow tests (Vitest)
npm run build      # type check, then production build into dist\
npm start          # run the production build
npm run e2e        # end to end smoke test against the production build
npm run verify     # build, test and e2e in one go
```

### Architecture

```
src/
  shared/      Pure TypeScript shared by both processes. No Electron, no DOM.
    schema.ts    Zod schemas and types for every record and for settings
    domain.ts    Dates, money, progress, next actions, analytics maths
    csv.ts       CSV parser, writer and import mapping
    prompts.ts   Prompt templates for the AI assistant
    markdown.ts  Safe Markdown subset for previews and email HTML
    api.ts       The IPC contract
  main/        Electron main process
    index.ts     Window, security policy, startup
    ipc.ts       Validated IPC handlers
    database.ts  SQLite (sql.js) with migrations and atomic saves
    repository.ts  Data access for all entities and settings
    ai.ts        Provider adapter (Anthropic, OpenAI, custom)
    secrets.ts   Encrypted key storage
    backup.ts    Backup, restore, daily snapshots
    demo.ts      Sample data
  preload/     The bridge exposed to the interface
  renderer/    React interface (components, pages, lib)
tests/         Vitest suites and the Playwright smoke test
```

### Technology choices and tradeoffs

- **Electron, React, TypeScript, Tailwind CSS.** As specified. Electron 45, React 19, TypeScript 7, Tailwind 3.4, Vite 8. Tailwind 3 was chosen over 4 for its stable configuration file, which holds the design tokens.
- **SQLite through sql.js instead of a native module.** The database is real SQLite, compiled to WebAssembly. The usual alternative, `better-sqlite3`, is a native module that must be compiled against Electron on the build machine, which requires Visual Studio Build Tools and Python and is the most common reason Electron builds fail on Windows. sql.js needs no compilation, so the build is two commands on a clean PC. The tradeoff is that the database is held in memory and written to disk as a whole after each change. For one author's data (typically well under 5 MB) a save takes a few milliseconds. Saves are atomic: the file is written to a temporary name and swapped in.
- **Vite and esbuild directly** rather than a wrapper framework, so there are fewer moving parts to break when dependencies update.
- **No router, no state library, no charting library.** Navigation is a single piece of state, data is loaded per page through one hook, and the chart is a small SVG component. This keeps the app small and the code easy to follow.
- **Fonts are bundled** (Inter and Cormorant Garamond) so the app makes no font requests.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `build-windows.bat` says Node.js is not installed | Install Node.js 22 LTS, then open a new window and run it again. |
| `npm ci` fails with network or certificate errors | You may be behind a proxy or firewall that blocks the npm registry or GitHub (Electron downloads from GitHub). Try another network. |
| `npm ci` fails with EPERM or "operation not permitted" | Close editors or antivirus scans touching the folder, delete `node_modules`, and run it again. Avoid building inside OneDrive or Dropbox folders. |
| electron-builder fails with "cannot create symbolic link" | Enable Windows Developer Mode (Settings, System, For developers) or run the terminal as administrator once. |
| The path is too long | Move the project to a short path such as `C:\bb`. |
| SmartScreen blocks the installer | Click **More info**, then **Run anyway**. See "Code signing". |
| The app opens to "could not start" | The database file could not be read. Your data folder is untouched. Copy the newest file from `backups` over `data\bookboost.sqlite` and reopen. |
| AI says the key was rejected | Re-enter the key in Settings. Check that billing is active with the provider. |
| AI says it could not process the request | The model name is probably wrong for the account. Press **Load available models** and pick one. |
| AI says it could not reach the provider | Check the internet connection, VPN or firewall. Everything else in the app keeps working offline. |
| CSV import says a column is missing | Download the template from the Outreach or Analytics page and match its header row. |
| "Key held for this session only" | Windows secure storage was unavailable, so the key was not written to disk. It will need to be entered again next time. |

## What has and has not been verified

Stated plainly, so nobody relies on something that was not tested.

**Verified in the build environment (Linux, Node 22.23, Electron 45.3.1):**

- Type check passes with strict TypeScript.
- 70 automated tests pass: domain logic, CSV, prompts, Markdown and HTML escaping, input validation, the AI adapter against a simulated provider, database persistence across reopen, damaged file handling, transactions, cascade deletes, draft history, backup and restore including tampered files, automatic snapshots, sample data, and a full first-run workflow.
- The production build completes.
- The end to end smoke test passes against the real app in a real Electron window: security posture of the interface, onboarding with validation, persistence across a restart, cover image loading, autosave, AI setup against a local stand-in provider, the consent gate (nothing sent before consent), reviewing and applying an AI draft with history kept, all ten screens with sample data, the minimum window size, campaign tasks, calendar approval, the outreach consent guard, analytics entry validation, and removal of sample data.
- The Windows application folder was packaged with electron-builder, and the smoke test also passes when run against that packaged application archive (`app.asar`).

**Not verified, because it needs Windows:**

- The NSIS installer and portable `.exe` have not been built. That step requires Windows or Wine, and neither was available.
- The app has not been run on Windows. Windows specific behavior that the tests could not exercise here: the installer and uninstaller, Desktop and Start menu shortcuts, encrypted key storage through DPAPI, native file dialogs for cover, CSV, export and backup files, and display scaling.
- No request was made to a real AI provider. The adapter was tested against simulated responses that follow the Anthropic and OpenAI API formats.

Route B above runs the same automated checks on Windows. After building, please work through `docs/QA_CHECKLIST.md` once on a Windows PC before handing the app over.
