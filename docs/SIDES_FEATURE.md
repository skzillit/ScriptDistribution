# Sides Feature — Plain-English Guide

> A guide anyone on the team can read — producer, AD, PM, designer, or engineer — to understand how "Sides" work end to end. The technical deep-dive lives at the bottom in **Appendix: For Engineers**.

---

## 1. What are "Sides"?

On a film/TV set, **sides** are the small printed (or digital) booklets handed out each shoot day. They contain:

1. **The Call Sheet** — who needs to be where, when, wearing what, with which equipment.
2. **Only the script pages being shot that day** — not the whole 120-page screenplay, just the relevant scenes.
3. **The day's shooting schedule** — the order scenes will be filmed, locations, cast needed.

Instead of carrying the entire script around, every crew member gets a tidy ~10-page PDF with exactly what they need for **today**.

Our app automates the creation of that booklet.

---

## 2. Who uses it, and what can they do?

There are three kinds of users:

| Role | Can view sides? | Can create new sides? |
|---|---|---|
| **Admin** | Yes | Yes |
| **Editor** | Yes | Yes |
| **Viewer** | Yes | No (the "+" button is hidden) |

The same user account works on **Web**, **Android**, and **iOS** — all three apps talk to the same server.

---

## 3. The five-minute tour

Imagine a producer's morning:

1. She opens the app (web, phone, or tablet).
2. She sees a list called **"Sides"** — each row is one day's sides booklet, with a status badge: *Ready*, *Generating…*, or *Failed*.
3. She also sees a tab labeled **"Call Sheets"** — every call sheet the production has uploaded so far.
4. To make a new sides booklet, she taps the **"+"** button. A panel slides up titled **"Customize Sides"**.
5. The panel is mostly pre-filled — the app already knows:
   - which script is the "active" script for the production,
   - the most recent call sheet,
   - the most recent shooting schedule,
   - and which scenes from the script the call sheet says they're shooting today.
6. She can tweak: add/remove scenes, change the title, decide whether to include the schedule.
7. She taps **"Generate"**. The panel closes; a new row appears at the top of the list with status *Generating…*.
8. About 30–60 seconds later, the row flips to *Ready*.
9. She taps **"View"** — the PDF opens inside the app, page-flipping through call sheet → scenes → schedule.
10. She taps **"Download"** — the same PDF saves to her device, ready to email or AirDrop to the crew.

That's the whole user experience.

---

## 4. What the app is doing behind the scenes

When the producer taps "Generate", here is the conceptual pipeline. (No code — just the story.)

```
┌────────────────────────────────────────────────────────────────────────┐
│  1. The app collects three ingredients:                                │
│       • The original script PDF (already uploaded earlier)             │
│       • Today's call sheet (uploaded by the AD)                        │
│       • Today's shooting schedule (uploaded by the AD)                 │
│                                                                        │
│  2. It reads the call sheet and figures out which scene numbers        │
│     are being shot today (e.g. 9, 107, 108, 110, 112, 113…)            │
│                                                                        │
│  3. For each of those scene numbers, it goes into the script PDF       │
│     and finds the exact pages where that scene lives.                  │
│                                                                        │
│  4. It takes a *picture* (a high-resolution image) of just that        │
│     scene from the script — cropping out the header, page numbers,     │
│     and anything irrelevant.                                           │
│                                                                        │
│  5. It does the same trick for the shooting schedule — finds the       │
│     part of the schedule for today and screenshots it.                 │
│                                                                        │
│  6. It assembles a brand-new PDF:                                      │
│       Page 1: the call sheet                                           │
│       Pages 2..N: one scene per page or two, as cropped images         │
│       Last pages: the day's shooting schedule (cropped)                │
│                                                                        │
│  7. It uploads the finished PDF to cloud storage and marks the         │
│     status as "Ready". A signed link is what the user clicks on to     │
│     view or download.                                                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Why "screenshot the scene" instead of "retype the scene"?

The very first version of this feature tried to *extract text* from the script and re-typeset it. This broke a lot:

- Formatting (centered dialogue, indentation, character names) is hard to perfectly re-create.
- Scripts use proprietary fonts and spacing — re-typing always looked off.
- Italics, underlines, scene revisions, and revision-color marks were lost.

So we switched to the **image** approach: just take a picture of the original page (or part of a page) and stick it into the new PDF. What the producer sees in sides looks **exactly** like what was in the original script — because it literally is the original page.

---

## 5. Where things live (mental map)

```
                       ┌──────────────────┐
                       │   The Server     │
                       │ (Render cloud)   │
                       │                  │
                       │  • PDF logic     │
                       │  • Database      │
                       │  • File storage  │
                       └────────▲─────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
      ┌─────┴─────┐       ┌─────┴─────┐       ┌─────┴─────┐
      │   Web     │       │  Android  │       │    iOS    │
      │  (React)  │       │  (Kotlin) │       │ (SwiftUI) │
      └───────────┘       └───────────┘       └───────────┘
```

- **The Server** is the brain — it does all the heavy PDF work, holds the data, and stores the finished files.
- **The Three Apps** are just windows into the server. They look different (each follows its platform's design language) but feature-wise they are identical.

You upload a script once. Anyone, on any device, can generate sides from it.

---

## 6. Statuses a sides booklet can be in

When you look at the list, each row shows one of these:

| Status | Meaning |
|---|---|
| **Generating** | The server is still building the PDF. Wait ~1 minute. |
| **Ready** | Done. You can view or download. |
| **Failed** | Something went wrong. Usually means a scene number in the call sheet didn't match anything in the script. |
| **Archived** | Hidden from the main view (kept for record). |

If a sides job fails, the team can simply edit the call sheet (fix typos in scene numbers) and re-generate.

---

## 7. The "Customize Sides" panel — what each control does

When the producer hits "+", she sees a panel with these sections, top to bottom:

1. **Script card** — shows which script is currently active. Not editable here.
2. **Call sheet card** — the latest one uploaded. Not editable here.
3. **"Use scenes from call sheet" toggle** — ON (default) builds sides from the call sheet's scenes; OFF ignores them and uses only the scenes you type manually ("custom scenes only" mode).
4. **"Attach call sheet to sides PDF" toggle** — ON (default) places the call sheet at the front of the booklet (in both View and Download); OFF leaves it out.
5. **Schedule card** — the latest schedule, with an **"Include Schedule in sides"** toggle. The matching shoot day is detected automatically — there's nothing to pick.
6. **Manual scenes** — a text box to add extra scenes (e.g. "5A, 12B"). In custom-only mode this is the required scene source.
7. **Live summary** — at the bottom, a one-liner: "10 scenes: 9, 107, 108… + 1 shoot day."
8. **Title** — what to call this sides booklet (optional; defaults to "Sides for Day X").
9. **Generate button** — submits.

> **Note:** the call-sheet **page selector**, the **scene chips**, and the **"Matched Shoot Day" / "extra scenes"** display were removed from the panel to keep it simple. The call sheet is always included in full ("all" pages), and the matched shoot day is still computed under the hood — it's just no longer shown.

---

## 8. Some smart things the app handles for you

These are the rules quietly baked in. They came from real production headaches.

| Situation | What the app does |
|---|---|
| Call sheet says **"107pt"** | Strips the "pt" and just shoots scene 107 (pt means "part two"). |
| Call sheet says **"60-66"** | Expands to scenes 60, 61, 62, 63, 64, 65, 66 (max range: 20). |
| Script has scenes **107** and **107A** | Treats them as separate scenes. |
| Script's scene header is split across two lines | Detects it anyway using fuzzy line matching. |
| Header reads "EXT. WAREHOUSE" vs "EXT  WAREHOUSE" | Both forms accepted. |
| Schedule has **"End Day # 27"** banners between days | Banner is detected and not bled into the scene crop. |
| Script title or page number is in the page header | Cropped out, not included in the scene image. |
| Two crew members generate sides for the same day | Both succeed; both end up in the list. |
| User is a **viewer** | "+" button is hidden, list is read-only. |

---

## 9. Where things are stored

- **Original PDFs (scripts, call sheets, schedules)** — uploaded by users, stored in cloud file storage.
- **Sides metadata** (title, status, which scenes, who created it, when) — in our database.
- **Finished sides PDFs** — in cloud file storage, accessed via short-lived signed links so they're not publicly indexable.
- **Your login** — managed by the app; on phones, the deviceId is remembered so you don't sign in every time.

Nothing is stored locally that can't be re-downloaded from the server.

---

## 10. Security in plain words

- Every request from the app to the server is signed with three things: a device fingerprint, a time stamp, and a content hash. The server checks all three. Even if someone intercepted a request, they couldn't replay it later or modify it.
- The signing keys live only on the server and inside the app builds — never in the source code people can read on GitHub.
- The sides PDFs are kept behind authentication; the only way to view one is to be logged in with the right role.

---

## 11. What can go wrong (and what we do about it)

| Problem | What you'll see | Fix |
|---|---|---|
| Server is slow / restarting | "Generating" stuck for several minutes | Wait, then refresh. If it stays stuck >5min, try again. |
| Call sheet has a scene number not in the script | Status: Failed, with a note like "Scene 999 not found" | Fix the call sheet (correct the scene number) and re-generate. |
| Internet drops during generate | Spinner times out | Try again — no half-baked sides are saved. |
| Two sides on the same day | Two rows in the list | This is fine; each is independent. |
| Old sides format | Tap View — should already be the new PDF | If still old, hard-refresh the browser or kill/relaunch the app. |

---

## 12. Where to make common changes (for whoever is updating it next)

This is the only "where in the codebase" section in the non-technical part — it's a one-stop pointer for the most-asked questions:

| "I want to change…" | Open this folder |
|---|---|
| How sides look on the iPhone | `ios/ScriptDistribution/.../Views/` |
| How sides look on Android | `app/src/main/java/.../ui/sides/` |
| How sides look on the web | `web/src/pages/sides/` |
| How the PDF is built | `backend/src/services/sides.service.js` |
| How a call sheet is parsed | `backend/src/utils/callSheetParser.js` |
| How a schedule is parsed | `backend/src/utils/scheduleParser.js` |
| Who can do what (roles) | `backend/src/middleware/auth.js` |
| The server URL the apps point at | Android `build.gradle.kts`, iOS `APIClient.swift`, Web `.env` |

---

## 13. Glossary

- **Active script** — the one script in the production that's currently the "live" version. Older versions stay but are not used for new sides.
- **Call sheet** — the daily logistics document the AD distributes.
- **Crop** — taking just a rectangle out of a larger PDF page.
- **Editor / Admin / Viewer** — the three permission levels.
- **PDF merge** — combining several PDFs into one.
- **Render** — both: (a) the verb "to draw"; (b) Render.com, the company hosting our server.
- **Schedule** — the multi-day plan of what's shot when. Usually a Movie Magic export.
- **Sides** — the daily booklet the crew carries.
- **Shoot day** — one day of filming. The schedule is divided into shoot days (Day 1, Day 2, …).
- **Signed URL** — a temporary link to a private file. Stops working after a few minutes.

---

# Appendix: For Engineers

Everything below is implementation detail. Skip this if you're not editing code.

## A. Repo layout

```
/backend                  Node + Express + MongoDB
/web                      React + Vite + React Query
/app                      Android — Kotlin + Retrofit + ViewModel
/ios/ScriptDistribution   iOS — SwiftUI + URLSession + WKWebView
/docs                     This document and others
```

## B. Generation pipeline (file-by-file)

1. `POST /api/sides` → `backend/src/controllers/sides.controller.js#generateSides`
2. → `backend/src/services/sides.service.js#extractSides`
3. → `buildPdfSceneMap(scriptPdfBuffer)` — uses **pdfjs-dist v4 legacy** to walk text items, group by Y, find scene headings (INT/EXT) + scene numbers at left/right margins.
4. → `buildSchedulePdfSceneMap(schedulePdfBuffer)` — Movie Magic; injects synthetic `__DAYBREAK__` entries for "End Day # X" / "Shoot Day # Y".
5. → `buildRenderSpecs(map, requestedScenes, totalPages)` — dedupe by sceneNumber, find next-different-scene boundary, skip pages where the crop ends within 30px of top.
6. → `renderSceneImages(pdfBuffer, specs, { topZoneRatio, bottomZoneRatio })` — pdfjs page render at 2× scale onto a `@napi-rs/canvas`, then `detectPageContentBounds` (two-pass: 3% unconditional + 8% pattern-based) crops headers/footers.
7. → `generateSidesPdf(sides)` — PDFKit assembles call sheet → image-per-scene → schedule images.
8. → uploads to storage, sets `status='ready'`, returns signed URL.

Zone ratios live in `sides.service.js`: script `top=3% bottom=4%`, schedule `top=10% bottom=5%`.

## C. Auth

- Headers on every request: `moduledata`, `bodyhash`, `Timezone`, `deviceInfo`.
- `moduledata` = AES/CBC NoPadding (last 32 chars of key, first 16 of IV, manual PKCS5) of `{device_id, user_id, time_stamp}`, hex-encoded.
- `bodyhash` = `SHA-256(body + moduledata + salt)`, hex.
- Three identical implementations:
  - Backend verifier: `backend/src/middleware/auth.js`
  - Android: `app/src/main/java/com/zillit/scriptdistribution/util/EncryptionUtil.kt` + `data/api/AuthInterceptor.kt`
  - iOS: `ios/ScriptDistribution/ScriptDistribution/Networking/EncryptionUtil.swift` + `APIClient.swift`

## D. Key endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/me` | Current user + role (for FAB gating) |
| GET | `/api/scripts/active` | Active script for the production |
| GET | `/api/callsheets?limit=N` | Recent call sheets |
| GET | `/api/callsheets/:id` | Call sheet detail (parsed scenes) |
| GET | `/api/schedules?limit=N` | Recent schedules |
| GET | `/api/schedules/:id` | Schedule detail (shoot days) |
| GET | `/api/sides?limit=N` | Sides list |
| POST | `/api/sides` | Generate sides |
| GET | `/api/sides/:id/view` | HTML page with embedded pdf.js viewer |
| GET | `/api/sides/:id/download` | Signed URL for the merged PDF (call sheet + sides) |

**`POST /api/sides` — key request flags:**

| Field | Meaning |
|---|---|
| `callSheetId`, `scriptId`, `scheduleId` | Source documents |
| `sceneNumbers` | Manually entered scenes (comma string or array) |
| `includeCallSheetScenes` | Default `true`. When `false`, the call sheet's scenes are **not** seeded — only `sceneNumbers` are used ("custom scenes only"). Handled in `sides.controller.js#generateSides`. |
| `includeCallSheet` | Default `true`. When `false`, the call sheet PDF is **not** attached in view/download. |
| `callSheetPages` | Always `"all"` from the clients now (the selector UI was removed). |
| `primaryDay`, `matchedDays` | Schedule shoot-day info, still computed client-side even though the "Matched Shoot Day" panel was removed. |

## E. Role gating

- Backend enforces in `auth.js` middleware (`requireRole('admin', 'editor')` on `POST /api/sides`).
- Android: `SidesViewModel.canPost: LiveData<Boolean>` from `/auth/me` → observed in `SidesFragment` → controls `fabGenerate.visibility`.
- iOS: `SidesViewModel.canPost: Bool` (computed from `currentUser.role`) → conditional view in `SidesListView`.
- Web: same check in `SidesPage.tsx`.
- Permissive default (`true` when role unknown) avoids UI flash before `/auth/me` resolves.

## F. Deployment

- **Backend**: Render auto-deploys on push to `main` → `https://script-distribution-api.onrender.com`.
- **Web**: Vercel — currently `https://web-two-tan-24.vercel.app`. Auto-deploys but historically can lag; manual fallback: `cd web && vercel --prod`.
- **Android**: standard Gradle build; `BASE_URL` in `app/build.gradle.kts`.
- **iOS**: open `ios/ScriptDistribution/ScriptDistribution.xcodeproj`; copy `Secrets.swift.template` → `Secrets.swift` with the same AES key/IV/salt as Android `BuildConfig`.

## G. Known limitations

- Sides generation is synchronous to the API request; long scripts (200+ pages) can push it past Render's 60s timeout — a background job queue is the natural next step.
- Image-based rendering means sides PDFs are larger (~3–8 MB) than text-based would be. Trade-off accepted for fidelity.
- Scene detection assumes English INT./EXT. — non-English scripts will need a locale-aware detector.
- pdf.js worker resolution is pinned to the legacy build path; upgrading pdf.js requires re-checking `loadPdfjs()`.

---

*For questions, ping the engineering channel or read the file paths in section 12.*
