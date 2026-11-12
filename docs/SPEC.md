# BookBoost Studio: product and design specification

This document records what was built and why. It covers the product scope, the interface design system, each screen, and the decisions made along the way.

## A. Product

**Who it is for.** One author promoting their own book, on a Windows PC, with no technical background. It was built as a private gift, not for resale.

**What it is.** A calm, private workspace that holds everything about a book's marketing in one place: the plan, the words, the schedule, the people and the results.

**Principles.**

1. **Local first.** All data stays on the computer. The only network traffic is an AI request the author starts.
2. **Honest numbers.** The app never invents results. Figures come from the author, and each one carries a label saying how reliable it is.
3. **The author approves everything.** Nothing is published, sent or overwritten automatically. AI output is always a suggestion to review.
4. **Works without AI.** Every feature is usable by hand. AI speeds up drafting when a key is configured and steps aside gracefully when it is not.
5. **Respectful outreach.** Consent is recorded per contact, pitches are written one at a time, and "do not contact" is enforced.

**Build order followed.**

1. Vertical slice: launch, onboarding, add and edit a book, local persistence, dashboard state from real data, one AI assisted draft with a configured provider, save, edit and export.
2. Campaigns, calendar, outreach, email, analytics, assistant library, settings, backup and restore, sample data.
3. Tests, end to end run in Electron, packaging configuration, documentation.

## B. Interface

### Design direction

Premium editorial publishing software. Matte near-black surfaces, ivory type, restrained champagne gold for emphasis, olive gray as a quiet secondary. Serif headlines used sparingly over a highly readable sans-serif interface. Thin borders instead of shadows, generous spacing, and one short entrance animation. No gradients as decoration, no glow, no glass effects, no emoji, no robots.

### Design tokens

Defined in `tailwind.config.cjs`.

| Token | Value | Use |
| --- | --- | --- |
| `ink-950` | `#0D0D0C` | App background |
| `ink-900` | `#131312` | Sidebar, inputs |
| `ink-850` | `#181817` | Cards |
| `ink-800` | `#1E1E1C` | Raised surfaces, hover |
| `ink-750`, `ink-700` | `#252523`, `#2D2D2A` | Selected rows, tracks |
| `line`, `line-strong` | `#2B2A27`, `#3A3935` | Borders |
| `ivory` | `#EFEAE0` | Primary text (14.8:1 on cards) |
| `ivory-dim` | `#BDB7AA` | Secondary text (8.9:1) |
| `ivory-mute` | `#8F8A7E` | Tertiary text and labels (5.2:1) |
| `gold`, `gold-pale`, `gold-deep` | `#C9AE80`, `#E2D0AC`, `#A68E62` | Primary actions, active state, accents |
| `olive`, `olive-pale` | `#8E937B`, `#B4B8A2` | Secondary accents, neutral notices |
| `ok`, `warn`, `danger` | `#9DB08A`, `#D3AC6C`, `#CF8273` | Status, always paired with a text label |

Typography: Inter Variable for the interface at 13.5px, Cormorant Garamond 500 and 600 for page titles, book titles and large numerals (with lining figures so digits are unambiguous). Small uppercase labels at 11px with 0.08em tracking.

Shape and motion: 10px card radius, 6px controls, 1px borders. One 220ms rise animation for new content, disabled when Windows "reduce motion" is on. Focus is a 2px gold outline on every interactive element.

### Component inventory

`src/renderer/src/components/ui.tsx`: Button (primary, secondary, ghost, danger), IconButton, Field, Input, Textarea, Select, Chips, Card, CardHeader, PageHeader, Badge, EmptyState, Spinner, ErrorNote, Notice, ProgressBar, Segmented, Modal (focus trap, Escape, focus return), ConfirmDialog.

`common.tsx`: Cover (image or typographic placeholder), Markdown preview, LineChart (line for dense series, bars for sparse ones, with hover values and a text summary for screen readers).

`BookFields.tsx`: the book form shared by onboarding and the library. `DraftEditor.tsx`: the writing surface shared by Content Studio, Email, the Assistant and outreach pitches.

### Screens

| Screen | Contents | Empty state | Key rules |
| --- | --- | --- | --- |
| Onboarding | Welcome, About you, Your book, Readers and voice, Goals and channels, Finish | Not applicable | Only title and author are required. Sample book is one click. |
| Overview | Featured book panel, Next actions, four KPI tiles, Campaign progress, Content calendar for 7 days, Outreach overview, Performance chart | Each panel has its own, with a direct action | KPI tiles count studio activity, never sales. The chart shows only entered numbers and states their provenance. |
| My Books | Card grid with cover, status badges and actions | "Your library is empty" | Delete requires confirmation and explains what is removed. Archive keeps data. |
| Campaigns | Campaign list and detail: objective, audience, channels, budget, tasks and milestones | "Plan your first campaign" | End date cannot precede start date. Overspend is shown in red. |
| Content Studio | Draft list with search and type filter, editor with Write and Preview | "Your first draft starts here" | Autosave, Ctrl+S, version history, AI output reviewed before use. |
| Calendar | Month grid, approval queue, due to post queue | Queues show "All caught up" | A notice states that nothing is auto published. Status changes only by explicit action. |
| Outreach | Stage tiles as filters, searchable table, contact form, pitch editor | "Start your outreach list" | Consent recorded per contact. Do not contact blocks pitching. Logging contact requires consent. |
| Email | Same workspace with subject and preview text and HTML export | "No emails yet" | A notice states the app does not send email. |
| Analytics | Range selector, metric tiles, chart with source breakdown, entries table | "No numbers yet" | A notice states there is no live data. Every entry is labeled verified, entered by you or estimate. |
| AI Assistant | Four templates, direction field, saved library | Setup notice when AI is not configured | Results are saved as editable documents. |
| Settings | Author profile, AI provider, data tools, sample data, about | Not applicable | Key is write only. Restore asks for confirmation and keeps a safety copy. |

### Error and edge states handled

No provider configured, consent not yet given, wrong key, rate limit or no credit, wrong model name, network offline, provider timeout, empty AI response, invalid form input (inline, per field), failed save (toast, editor shows "Could not save"), record deleted elsewhere, file too large, wrong file type, CSV with missing columns or bad rows (row by row report), damaged or foreign backup file, damaged database at startup, disk full or file locked.

## C. Project structure

```
bookboost-studio/
  README.md                   Setup, build, install, privacy, troubleshooting
  LICENSE.txt                 Private use license
  THIRD_PARTY_NOTICES.md
  build-windows.bat           One step build for Windows
  package.json, package-lock.json
  electron-builder.yml        Installer configuration (NSIS, per user, x64)
  vite.config.mts, vitest.config.mts, tsconfig.json
  tailwind.config.cjs, postcss.config.cjs
  build/icon.ico, icon.png    App icon
  scripts/build.mjs, dev.mjs
  .github/workflows/build-windows.yml
  docs/SPEC.md, QA_CHECKLIST.md, screenshots/
  src/
    shared/   schema.ts, domain.ts, csv.ts, prompts.ts, markdown.ts, api.ts
    main/     index.ts, ipc.ts, database.ts, repository.ts, ai.ts, secrets.ts, backup.ts, demo.ts
    preload/  index.ts
    renderer/ index.html
      src/    main.tsx, App.tsx, styles.css
        lib/         api.ts, store.tsx, ai.tsx
        components/  ui.tsx, common.tsx, BookFields.tsx, DraftEditor.tsx
        pages/       Onboarding, Overview, Books, Campaigns, Writing, Calendar, Outreach, Analytics, Settings
  tests/
    domain.test.ts, csv.test.ts, content.test.ts, ai.test.ts, persistence.test.ts
    e2e/smoke.mjs
```

### Data model

SQLite tables: `settings`, `books`, `campaigns`, `tasks`, `drafts`, `draft_revisions`, `calendar_items`, `contacts`, `metrics`. Every record belongs to a book and is deleted with it. Drafts and calendar items keep working if the campaign or contact they point to is deleted. The schema is versioned with `PRAGMA user_version` and upgraded by ordered migrations in `database.ts`.

All written content is one `drafts` table distinguished by `kind`, which is why Content Studio, Email, the Assistant library and outreach pitches share one editor and one history mechanism.

## D. Decisions

None of these blocked progress, so sensible defaults were chosen. Each is easy to change.

| Decision | Choice | Reason | Where to change |
| --- | --- | --- | --- |
| SQLite engine | sql.js (WebAssembly) rather than a native module | No compiler toolchain needed on the build PC; far fewer build failures | `src/main/database.ts` |
| AI providers | Anthropic, OpenAI, and any OpenAI compatible endpoint | Covers the common choices and local models | `src/main/ai.ts` |
| Default model | None preselected; chosen from the provider's live list | Model names change often, so a hard coded default would go stale | Settings screen |
| Installer type | One click, per user, no administrator rights | Simplest for a non-technical user | `electron-builder.yml` (`oneClick`, `perMachine`) |
| Data on uninstall | Kept | Prevents accidental loss | `deleteAppDataOnUninstall` |
| Auto update | None | Private app with no update server; avoids background network calls | Not included |
| Code signing | None | Requires a paid certificate; documented in the README | Environment variables at build time |
| Publishing integrations | None | The brief forbids implying auto publishing without a tested integration | Not included |
| Email sending | None; HTML export instead | Same reason, and keeps consent with the author's email service | Not included |
| Sample data | Opt in, one fictional book, all figures marked as estimates | Lets a new user explore without polluting real data | `src/main/demo.ts` |
| Currencies | USD, GBP, EUR, CAD, AUD | Display only; no conversion | `settingsSchema` in `schema.ts` |
| Language | English | Single recipient | Interface strings are inline |
| Backup format | One `.bbbackup` file (JSON holding the database and covers) | No extra dependency, easy to validate before restore | `src/main/backup.ts` |
| Draft history | Up to 25 versions per draft; routine saves at most every 3 minutes, always before an AI change or restore | Useful history without noise from autosave | `src/main/repository.ts` |

### Reasonable next steps, not included

- A signed installer, if a certificate is purchased.
- Direct integrations (for example a newsletter service) only if a specific one is wanted and can be tested with a real account.
- Importing retailer sales reports in their native formats.
- A light theme.
