# Mobile App Build Spec — "Script Distribution" (iOS SwiftUI + Android Kotlin/XML/Ktor)

**Goal:** Build two production-quality native mobile apps (iOS and Android) that match the existing web application **feature-for-feature**, against the same Render-hosted Node/Express/MongoDB backend. No backend changes.

The single source of truth for behavior, look, and constraints is this document.

---

## 0. Recent enhancements — focus areas for the generating agent

If this spec is being used to **extend an existing implementation**, every item below was added or revised after the initial build. The agent should treat these as the **priority work** and verify each one end-to-end. Every item has a numbered cross-reference into the body of this document.

| # | Enhancement | Where in spec |
|---|---|---|
| E1 | API response envelope `{ status, message, messageElements, data }` — wrap/unwrap in client networking | §7 |
| E2 | Generate Sides is a **full page**, not a modal — back navigation, dedicated route `/sides/generate` | §9.1 |
| E3 | **Single-script selector** in Generate Sides — switching the script resets all version/page picks | §9.1 |
| E4 | **Client-side cross-source dedup** — a scene number can only be picked from one source; chips dim 35 % opacity elsewhere | §9.1 |
| E5 | **Server-side cross-source dedup** (defense-in-depth) — page folders win over versions, first-occurrence within each | §7 / §9.1 |
| E6 | Generate Sides **no longer shows** "Include call sheet" / "Include schedule" sections (those are Autogenerate-only) | §9.1 |
| E7 | **Drag-and-drop chip reordering** for scene order — chips can be dragged, removed, and a "+ Add" strip surfaces unused selected scenes; the text input stays as a fallback | §9.1 |
| E8 | Rearrange order is **visible in both modes** — in Cross-out it reorders the page chunks per selected scene | §9.1 / §10 |
| E9 | Cross-out **renders only pages containing selected scene content** (gap pages dropped) | §10 |
| E10 | Cross-out leaves **a generous clearance above the next selected heading** (no X or grey on the heading line) | §10 |
| E11 | Cross-out **rearrange-aware chunks** — per-scene page groups; scenes in `allSelectedScenes` other than the chunk's focus stay clean | §10 |
| E12 | **No page-folder "Scene X" header** in the output PDF | §10 |
| E13 | **No "*** END OF SIDES ***"** trailer | §10 |
| E14 | **No blank pages between units** — inter-unit separator skips when it doesn't fit, omitted after the last unit | §10 |
| E15 | **Download button** added to the review stage (now four buttons: View again · Download · Move to Doc Distribution · Publish) | §9.1 |
| E16 | **Inline PDF viewer modal** — raw signed PDF via `…/download` opened in WebKit/WebView with native PDF UI (`#toolbar=1&navpanes=0&view=FitH`), NOT the `/view` HTML page | §9 |
| E17 | **FDX support for Pages**, not only scripts — same `.fdx` → PDF conversion pipeline | §6 |
| E18 | **`SCENE`-keyword headings detected** (e.g. "33 SCENE 33") in addition to `INT./EXT./I/E` slugs | §10 / Appendix B |
| E19 | **FDX parser promotions** — paragraphs typed as Action whose text starts with `INT./EXT./SCENE` are treated as Scene Headings; inline leading numbers ("18 EXT. JUNGLE — DAY") are stripped and used as the scene number; `<DualDialogue>` wrappers are flattened so nested paragraphs aren't lost; empty scene headings still emit (numbering doesn't shift) | Appendix B |
| E20 | **Margin-pair heading admission** — a line counts as a scene heading if it carries the **same scene number in both left and right margins**, even without an INT/EXT/SCENE keyword. Catches stylized headings like `INTERCUT: TV INSERT.`, `"TEN YEARS AGO"`, `- UNIVERSITY LECTURE HALL...` | Appendix B |
| E21 | **Two debug endpoints** for scene-detection diagnostics: `/api/debug/versions/:id/scenes` and `/api/debug/pages/:id/scenes` — return the per-page line dump, detection strategy used, dropped/auto-numbered counts | Appendix C |

The mobile apps **do not need to re-implement the PDF rendering** — every cross-out / rearrange / blank-page / header behavior is handled server-side and emitted as a single PDF. The mobile work is to **send the right payload** (correct `sceneDisplayMode`, `sceneOrder`, `versionScenes`, `pageSelections`) and **display the result** correctly.

For each enhancement, the agent's acceptance check is: build it, then run the acceptance scenario in §15 that calls it out by number (e.g. "E7 / E11 — drag chips in Cross-out mode and confirm the page chunks reorder in the output PDF").

---

## 1. Tech stack and project layout

### iOS
- **Swift 5.9+, SwiftUI**, deployment target **iOS 16.0+**
- Networking via `URLSession`, JSON via `Codable`
- AES via `CommonCrypto`, SHA-256 via `CryptoKit`
- `WKWebView` only for embedded PDF viewing
- Xcode 15+, single SwiftUI target

### Android
- **Kotlin 1.9+, XML layouts** (NOT Compose), View Binding
- **Ktor client** + `kotlinx.serialization` for JSON
- `androidx.navigation` + `BottomNavigationView` for tabs
- AndroidX, Material 3
- **minSdk 24, targetSdk 34**
- PDFs displayed with an in-app `WebView` pointing at signed download URLs

### Base URL (hard-coded)
```
https://script-distribution-api.onrender.com
```

### Folder structure (mandatory — keeps networking + upload swappable)

**iOS** (`ios/ScriptDistribution/ScriptDistribution/`)
```
ScriptDistributionApp.swift
Secrets.swift.template          ← checked in
Networking/                     ← drop-in replaceable
  APIClient.swift               ← request<T>(...)
  APIService.swift              ← typed endpoint wrappers
  AuthHeaders.swift             ← moduledata / bodyhash / Timezone / deviceInfo
  EncryptionUtil.swift          ← AES-CBC + SHA-256
  ResponseEnvelope.swift        ← { status, message, messageElements, data }
  TokenManager.swift            ← deviceId / userId in UserDefaults
Upload/                         ← drop-in replaceable
  Uploader.swift                ← single multipart uploader
  FilePicker.swift              ← UIDocumentPicker wrapper (PDF + FDX)
Models/Models.swift             ← all Codable structs
Theme/
  Colors.swift                  ← semantic color tokens
  Spacing.swift, Typography.swift
ViewModels/                     ← one per screen
Views/
  ContentView.swift             ← TabView root (2 tabs)
  Sides/...                     ← SidesList, GenerateSidesScreen, AutogenerateSheet, SidesReviewView, SidesPdfViewer
  Scripts/...                   ← ScriptsList, ScriptCardView, AddScriptModal, PagesSection, AddPageModal, ScriptPdfViewer
```

**Android** (`android/app/src/main/java/com/zillit/scriptdistribution/`)
```
ScriptDistributionApp.kt        ← Application class
data/
  network/                      ← drop-in replaceable
    ApiClient.kt                ← Ktor HttpClient + ResponseEnvelope unwrap
    ApiService.kt               ← suspend fun per endpoint
    AuthInterceptor.kt          ← moduledata / bodyhash / Timezone / deviceInfo
    EncryptionUtil.kt           ← AES-CBC + SHA-256
    ResponseEnvelope.kt
    TokenManager.kt
  upload/                       ← drop-in replaceable
    Uploader.kt                 ← single multipart uploader
    FilePickers.kt              ← OpenDocument launcher (PDF + FDX)
  models/Models.kt
ui/
  theme/
    Colors.kt                   ← @Color and material attrs
    res/values/colors.xml, styles.xml, themes.xml
  sides/...                     ← SidesFragment, GenerateSidesFragment, AutogenerateBottomSheet
  scripts/...                   ← ScriptsFragment, ScriptCardView, AddScriptDialog, PagesSection, AddPageDialog
  MainActivity.kt               ← BottomNavigationView host (2 tabs)
res/layout/...                  ← XML for every screen and item
res/menu/bottom_nav.xml         ← 2 items: sides, scripts
```

**Hard rule:** All HTTP and all file uploads MUST go through the modules in `Networking/` & `Upload/` (iOS) or `data/network/` & `data/upload/` (Android). UI code must never call `URLSession` / `HttpClient` directly. Replacing those folders with a different implementation must not affect any other file.

---

## 2. Design tokens (theming, both light + dark)

Implement both themes; follow system default and offer a toggle. Use the exact values below for visual parity with the web app.

### Color tokens
| Token | Dark | Light |
|---|---|---|
| bgPrimary | `#0D0D0D` | `#FAF7F4` |
| bgSecondary | `#1A1A1A` | `#FFFFFF` |
| bgCard | `#242424` | `#FFFFFF` |
| bgCardHover | `#2E2E2E` | `#FFF5EC` |
| bgGlass | `rgba(26,26,26,0.80)` | `rgba(255,255,255,0.88)` |
| textPrimary | `#F5F0EB` | `#1A1209` |
| textSecondary | `#9A918A` | `#7A6E62` |
| textMuted | `#5C5650` | `#B0A59A` |
| accent | `#FF8C00` | `#E07800` |
| accentHover | `#E07800` | `#CC6D00` |
| accentGlow | `rgba(255,140,0,0.25)` | `rgba(224,120,0,0.15)` |
| accentSecondary | `#FF5722` | `#E64A19` |
| border | `rgba(255,140,0,0.12)` | `rgba(255,140,0,0.12)` |
| borderHover | `rgba(255,140,0,0.35)` | `rgba(255,140,0,0.30)` |
| success | `#4CAF50` | `#2E7D32` |
| warning | `#FFCA28` | `#F57F17` |
| error | `#EF5350` | `#C62828` |

### Gradients
- `gradientAccent`: `linear 135° #FF8C00 → #FF5722`
- `gradientCard` (dark): `linear 145° #242424 → #1E1E1E`
- `gradientCard` (light): `linear 145° #FFFFFF → #FFFAF5`

### Radii
- small `8 dp`, default `12 dp`, large `16 dp`, xl `20 dp`, pill `999 dp`

### Shadows
- small `0 2 8 rgba(0,0,0,0.30)`
- medium `0 4 24 rgba(0,0,0,0.40)`
- large `0 8 40 rgba(0,0,0,0.50)`

### Typography
- **Font family**: Inter (regular 400, medium 500, semibold 600, bold 700, extrabold 800). Bundle TTFs or use Google Fonts on Android.
- **Page title**: 24sp/28pt, weight 800, color textPrimary.
- **Section label**: 11sp/11pt, weight 600, uppercase, letter-spacing 0.5, color textSecondary.
- **Body**: 14sp/14pt, weight 400-500, color textPrimary.
- **Caption / chip / muted meta**: 11sp/11pt, color textMuted.
- **Button label**: 13sp/13pt, weight 600.

### Spacing scale
- `xs 4`, `s 8`, `m 12`, `l 16`, `xl 20`, `xxl 24`, `xxxl 32` (dp/pt).

### Buttons
| Style | Background | Text | Border |
|---|---|---|---|
| Primary | accent | white | none |
| Secondary | bgCardHover | textSecondary | border |
| Danger | none | `#E53935` | border |
| Ghost / link | none | accent | none |

Disabled state: opacity 0.5, cursor/touch disabled.

### Status badge colors (sides list)
| Status | Background | Text |
|---|---|---|
| ready | `rgba(76,175,80,0.18)` | success |
| generating | `rgba(255,202,40,0.20)` | warning |
| archived / error | `rgba(239,83,80,0.18)` | error |

### Icons (use Material Symbols / SF Symbols)
- Sides tab: `description` / `doc.text`
- Scripts tab: `movie` / `film`
- Add: `add` / `plus`
- View: `visibility` / `eye`
- Download: `download` / `arrow.down.circle`
- Delete: `delete` / `trash`
- Replace: `swap_horiz` / `arrow.triangle.2.circlepath`

---

## 3. App shell — two bottom tabs (no sidebar)

The web sidebar has two items: Sides and Script. The mobile apps **replace it with a bottom tab bar of exactly 2 tabs**: **Sides** and **Script**. No drawer, no hamburger menu.

| Tab | Default route | Initially selected when |
|---|---|---|
| Sides | `SidesListScreen` | App launch |
| Script | `ScriptsListScreen` | User taps tab |

Tab switching preserves each stack's scroll position. Deep links can navigate within a tab without losing the other.

A simple header bar above content shows the screen title and any screen-level actions (Add Script, Generate Sides, etc.).

---

## 4. Authentication (must match web byte-for-byte)

Every request to `/api/*` carries **four headers**. The server validates each.

| Header | Value |
|---|---|
| `moduledata` | AES-128-CBC encrypt of `{"device_id":"<uuid>","user_id":null,"time_stamp":<unix-ms>}` → hex string |
| `bodyhash` | `SHA-256(body + moduledata + salt)` → hex string. `body` is the **exact request body string** sent on the wire; empty string for GET / no-body requests. |
| `Timezone` | OS identifier, e.g. `Asia/Kolkata` |
| `deviceInfo` | `"<device-model>\|<os-version>\|<iOS|Android>"` |

### Crypto specifics
- **AES-128-CBC**, **manual PKCS5 padding** (do not let a crypto library re-pad).
- **Key**: last 32 bytes of `ENCRYPTION_KEY` constant.
- **IV**: first 16 bytes of `IV_KEY` constant.
- Output is **lowercase hex**.
- `device_id` is a UUID generated on first launch and stored in `UserDefaults` / `EncryptedSharedPreferences`. Reused for the install's lifetime.

### Secrets handling
- Ship `Secrets.swift.template` / `Secrets.kt.template` with placeholders:
  ```
  ENCRYPTION_KEY = "<32+ char key>"
  IV_KEY         = "<16+ char iv>"
  SALT           = "<salt>"
  ```
- The real `Secrets.swift` / `Secrets.kt` is **gitignored**. The user copies the template and pastes the exact same values used by the Android `BuildConfig` in this repo.

---

## 5. Network layer (common, drop-in replaceable)

### Single generic request function
**iOS** (`APIClient.swift`):
```swift
func request<T: Decodable>(
    _ method: String,
    _ path: String,
    query: [String: String] = [:],
    body: Encodable? = nil,
    decode: T.Type
) async throws -> T
```

**Android** (`ApiClient.kt`):
```kotlin
suspend inline fun <reified T> request(
    method: HttpMethod,
    path: String,
    query: Map<String, String> = emptyMap(),
    body: Any? = null,
): T
```

Both implementations MUST:
1. Build URL `BASE_URL + "/api" + path`.
2. Encode `body` as JSON string (or use empty string for GET/DELETE without body).
3. Compute `moduledata` (encrypt) and `bodyhash` (SHA-256) from that string + secrets.
4. Set the four auth headers, `Content-Type: application/json`, `Accept: application/json`.
5. Send and read the response.
6. **Decode the envelope**:
   ```json
   { "status": 1, "message": "...", "messageElements": [], "data": <payload> }
   ```
   - On `status: 1`: decode `data` into `T` and return.
   - On `status: 0`: throw an error of type `APIError(message: envelope.message)`.
   - On non-2xx HTTP with no envelope: throw `APIError(message: "HTTP <code>")`.
7. Cancel-aware (iOS structured concurrency, Android suspending coroutines).

### Typed endpoints (`APIService` / `ApiService`)

```
// Scripts
listScripts(limit: Int = 100) -> { scripts: [Script] }
createScript(title: String) -> { script: Script }
deleteScript(id: String) -> { success: Bool }

// Script versions
uploadVersion(scriptId: String, file: FilePart, versionLabel: String) -> { version: ScriptVersion }
listVersions(scriptId: String) -> { versions: [ScriptVersion] }
versionDownloadUrl(versionId: String) -> { downloadUrl: String }
versionScenes(versionId: String) -> { scenes: [SceneInfo] }

// Pages (scene folders)
listPages(scriptId: String) -> { scenePages: [ScenePage] }
createPage(scriptId: String, file: FilePart, sceneNumber: String, color: String, description: String?) -> { scenePage: ScenePage }
updatePage(id: String, file: FilePart?, sceneNumber: String?, color: String?, description: String?) -> { scenePage: ScenePage }
deletePage(id: String) -> { ok: true }
pageDownloadUrl(id: String) -> { downloadUrl: String }
pageScenes(id: String) -> { scenes: [SceneInfo] }

// Sides
listSides(limit: Int = 50, history: Bool = false) -> { sides: [Sides] }
generateSides(req: GenerateSidesRequest) -> { sides: Sides, mode: String }
getSides(id: String) -> { sides: Sides }
publishSides(id: String) -> { sides: Sides }
moveSidesToDocDistribution(id: String) -> { sides: Sides }
sidesDownloadUrl(id: String) -> { downloadUrl: String }
deleteSides(id: String) -> { success: true }

// Autogenerate-only
listCallSheets() -> { callSheets: [CallSheet] }
uploadCallSheet(file: FilePart, source: "uploaded") -> { callSheet: CallSheet }
deleteCallSheet(id: String) -> { ok: true }
listSchedules() -> { schedules: [Schedule] }
uploadSchedule(file: FilePart, source: "uploaded") -> { schedule: Schedule }
deleteSchedule(id: String) -> { ok: true }
```

### Realtime (optional but recommended)
- Connect a WebSocket to `wss://<host>/ws`. Same auth headers on the upgrade request.
- On message `{ event: "sides:updated", data: {...} }`, refresh the Sides list. Toast on `status: "ready"` / `"error"`.

---

## 6. Upload layer (common, drop-in replaceable)

**Single uploader** used by Script versions, **Pages (E17)**, Call sheets, Schedules. The server accepts `.fdx` for **every** upload path that accepts a PDF — the mobile clients don't need to differentiate; they just hand the byte stream and filename to the uploader.

### API
**iOS**:
```swift
func upload(
    method: String,                  // POST / PUT
    path: String,
    file: FilePart,                  // { data, filename, mimeType }
    fileField: String = "pdf",
    fields: [String: String] = [:]
) async throws -> Data
```

**Android**:
```kotlin
suspend fun upload(
    method: HttpMethod,
    path: String,
    file: FilePart,                  // ByteArray + filename + mimeType
    fileField: String = "pdf",
    fields: Map<String, String> = emptyMap(),
): JsonObject
```

### Requirements
- `multipart/form-data`, file field name **`pdf`** unless overridden.
- Accepts both **PDF** (`application/pdf`) and **Final Draft `.fdx`** (`application/xml`, `text/xml`, `application/octet-stream`). Server detects FDX by filename; client must pass filename + mimeType verbatim.
- Body is built once; **`bodyhash` is computed over the raw boundary-encoded body bytes** (not over the form fields object). For `multipart` POSTs you can simplify by passing an empty string for the body-hash input — but match the web behavior used by other endpoints; if the web does empty for multipart, the mobile clients also use empty. Verify with the existing Android `AuthInterceptor` in this repo.
- Show progress (indeterminate spinner is acceptable).
- On 4xx, surface envelope's `message` to the caller; on network failure, retry once before failing.
- The same uploader is used for create (POST) and replace (PUT) — only the method/path change.
- File picker contract:
  - **iOS**: `UIDocumentPickerViewController` with UTIs `public.pdf` and `com.finaldraft.fdx`. Fallback `public.xml` and `public.data`.
  - **Android**: `ActivityResultContracts.OpenDocument()` with `arrayOf("application/pdf","application/xml","text/xml","*/*")`. Show a hint "PDF or .fdx" near the picker.

---

## 7. API response envelope (all `/api/*`)

Every `/api/*` JSON response is wrapped:
```json
{
  "status": 1,
  "message": "success",
  "messageElements": [],
  "data": <payload>
}
```
Errors:
```json
{
  "status": 0,
  "message": "Script not found",
  "messageElements": [],
  "data": null
}
```

Mobile clients MUST decode the envelope and either return `data` or throw `APIError(message)`. Binary endpoints (file downloads) return raw bytes / streamed responses — the envelope only applies to JSON.

---

## 8. Models

Match field-for-field. `_id` decodes to `id`. Anything nullable is optional.

### Script
```
id, title, status, currentVersion?: ScriptVersion, updatedAt: ISO8601
```

### ScriptVersion
```
id, versionNumber: Int, versionLabel: String, pageCount: Int?, status: String, pdfUrl: String?
```

### ScenePage (Page)
```
id, sceneNumber: String, color: String (hex), description: String?,
pageCount: Int?, pdfUrl: String?, createdAt: ISO8601
```

### SceneInfo (returned by versionScenes / pageScenes)
```
sceneNumber: String, heading: String, pageStart: Int?
```

### Sides
```
id, title, status: "generating"|"ready"|"error"|"archived",
published: Bool, totalScenes: Int?,
sceneNumbers: [String], downloadCount: Int?,
createdAt: ISO8601, error: String?
```

### GenerateSidesRequest
```
scriptId: String,
title: String?,
mode: String = "manual",
publish: Bool = false,
sceneDisplayMode: "hide" | "crossout",
versionScenes: [ { versionId: String, sceneNumbers: [String] } ],
pageSelections: [ { pageId: String, sceneNumbers: [String] } ],
orderedScenes: Bool?,
sceneOrder: [String]?,
callSheetId: String? // Autogenerate flow only
scheduleId: String? // Autogenerate flow only
```

---

## 9. Screens & flow

### 9.1 SIDES tab

#### SidesListScreen

**Top bar**
- Title "Sides" (page-title style).
- Two action buttons (admin/editor only):
  - **Autogenerate Sides** (primary).
  - **Generate Sides** (secondary).

**Gate logic** (replicate the web messages exactly):
- Autogenerate: if there's no active published script, toast `"No published script available. Please upload script to generate sides"` and do nothing.
- Generate: if there's no active script AND no scripts in history with usable pages, toast `"No active script or pages found. Please upload script to pages to generate sides"`.

**Content**
- List of sides cards. Each card:
  - Title (semibold 14).
  - Status badge (right of title) with color per §2.
  - Meta row (caption): `Scenes: 5, 6, 18 · 3 scene(s) · 0 downloads · MMM D, h:mm A`.
  - Buttons (right-aligned):
    - **View** (primary, only when `status == "ready"`) **(E16)**: fetch the signed URL from `GET /sides/:id/download` (not `/view`), open the **raw PDF** in an in-app WebView/WKWebView with native PDF controls (`#toolbar=1&navpanes=0&view=FitH`).
    - **Download**: fetch the signed URL, hand off to system browser/Files (iOS: `UIApplication.shared.open`; Android: `ACTION_VIEW` Intent).
    - **Delete** (admin/editor): confirm dialog "Delete?" → `DELETE /sides/:id`.
- Pull-to-refresh.
- Collapsible **History** section ("History ▼") at bottom that lazy-loads archived sides with View / Download.
- Empty state: icon, "No sides yet", "Generate sides from your script using a call sheet or scene selection", Generate Sides CTA.

**Realtime hooks**
- On `sides:updated` event, refresh list; on `status: "ready"` toast `"Sides ready: <title>"`; on `error` toast `"Sides failed: <error>"`.

#### AutogenerateSheet (bottom sheet)
- Auto-loads active script + latest call sheet + latest schedule.
- Sections (in order):
  1. **Call sheet** — grouped **Published** / **Uploaded** radio lists. Each item: title + scene count + **View PDF** button. **+ Upload new** triggers FilePicker → `uploadCallSheet(file, source:"uploaded")` (server replaces any prior uploaded item). Uploaded items show a delete icon.
  2. **Schedule** — same structure as Call sheet.
  3. **Rearrange scene order (E7, E8)** — checkbox; when on, show a **draggable chip row** (each chip = a scene number with a numbered prefix and a remove × button). The user can drag any chip onto another to reorder; the chip currently held shows reduced opacity, the drop target shows a dashed accent border. A muted **"Add: +N +N …"** strip beneath the chip row surfaces selected scenes that aren't in the order yet — tapping one appends it. Underneath the chips, a plain text input `(drag chips to reorder, or type below)` stays as a fallback (both edit the same source-of-truth string). Live preview line `Sides will be ordered as: 5, 7, 9` underneath. **Visible in both Hide and Cross-out modes.**
  4. **Unselected scenes** — radio options:
     - `Hide unselected scenes` (default) — only selected scenes appear.
     - `Cross out unselected scenes` — see §10.
  5. **Title** — optional input.
- **Submit**: validates (see §11), then POST `/sides` with `publish: false` and enters review stage.
- **Review stage** (inside same sheet, replacing form):
  - Spinner + "Generating sides…" while polling `GET /sides/:id` every 2 s up to 90 attempts. Stop on `ready` or `error`.
  - On error: red header "Generation failed" + envelope/error message.
  - On ready: green card "✅ Sides generated successfully" + **four buttons (E15)**:
    - **View** (toggles to "View again" after first click) — opens the **raw PDF** (`GET /sides/:id/download` → signed URL) inside the inline PDF viewer (E16), not the `/view` HTML page.
    - **Download** — same `download` endpoint; hand off to the system browser / Files (iOS `UIApplication.shared.open`; Android `ACTION_VIEW`).
    - **Move to Doc Distribution** (`POST /sides/:id/doc-distribution`).
    - **Publish** (`POST /sides/:id/publish`).

#### GenerateSidesScreen (full screen, **not** a modal, E2)
- Mounted at its own route — on web `/sides/generate`; on mobile, a pushed destination on the Sides tab's nav stack. Back button (← Back to Sides) navigates back.
- Sections, in order:
  1. **Single-script picker (E3)** (dropdown / Picker). Lists every script the user owns, newest first. Each entry shows `<title>` + ` (no file — pages only)` suffix if no current version. Default selection = active script. **Only ONE script can be selected at a time**; switching the picker **clears all version picks, all page picks, the rearrange flag and the order input**.
  2. **Pick scenes (versions)** — for the selected script only:
     - Lists versions inside an expandable group.
     - Each version is a collapsible card showing scene chips. Multi-select toggles each scene.
     - "Select all" / "Clear" links.
  3. **Pages** (scene folders) — for the selected script only:
     - Lists scene folders as collapsible cards. Each shows colored swatch + sceneNumber + page count.
     - On expand: chips of scenes detected in that Page's PDF, multi-select. If no scenes detected, show a single "Include whole PDF" checkbox instead.
  4. **Summary row** — all selected scenes (union of version picks + page picks, deduped), shown as chips with the live count.
  5. **Rearrange scene order (E7, E8)** — visible in **both** Hide and Cross-out modes. Uses the same draggable chip row as Autogenerate: drag to reorder, × to remove, "Add: +N" strip for unused selected scenes, text-input fallback. In Cross-out mode the order rearranges the **page chunks** for each selected scene (see §10).
  6. **Unselected scenes** — same radio options as Autogenerate.
  7. **Title** — optional.
  8. **Submit** → review stage (identical four-button stage as Autogenerate, §9.1).

**Client-side cross-source dedup (E4, mandatory):**
- Compute `claimedScenes = { scene numbers picked from ANY version OR any page }` (case-normalized, strip trailing `PT`).
- In every picker (each version + each page folder), any scene chip whose number is in `claimedScenes` but not picked in the current source is shown **disabled**, 35 % opacity, with tooltip / accessible label `"Already picked from another source"`. Tapping does nothing.
- "Select all" silently skips scenes claimed elsewhere and toasts `"Skipped scenes already picked from another source."`
- A user CAN toggle off a scene they already picked here.

**Server-side cross-source dedup (E5)** runs again before extraction. Even if a duplicate slips through (e.g. legacy state), the server enforces "one scene number → one source", with **page folders winning** and **first-occurrence within each kind** winning on ties. Mobile clients can rely on this and don't need to deduplicate the request payload, but they should still apply the client-side dedup in the UI for feedback.

**Important (E6):** **No** "Include call sheet in sides" / "Include schedule in sides" sections appear here. Those exist only in Autogenerate.

#### SidesPdfViewer (presented modally / pushed, E16)
- Header bar: title, version label, `Open in browser` button (system handoff), `Close`.
- WebView loading the **raw, signed PDF download URL** (`GET /sides/:id/download` → `downloadUrl`) with native PDF rendering (`#toolbar=1&navpanes=0&view=FitH`).
- Same component is reused by the Script tab as **ScriptPdfViewer** using `GET /versions/:id/download`. **Never** point this WebView at `/api/sides/:id/view` or `/api/highlight/:versionId` — those are the HTML page viewers used historically by the web app and don't render as a native PDF inside the mobile WebView.

### 9.2 SCRIPT tab

#### ScriptsListScreen
- Title "Scripts" + (admin/editor) **Add Script** button.
- List of script cards, each:
  - Title (bold 16).
  - Meta row: `<n> pages` · `<versionLabel>` · `MMM D, YYYY`. If no version yet, show `No script file yet — add pages or upload a file` in warning color.
  - Action buttons (admin/editor only):
    - **View** (only with `currentVersion`): opens **ScriptPdfViewer** with raw signed PDF.
    - **Replace** / **Upload Script** (label changes based on whether version exists): file picker → `POST /scripts/:id/versions`.
    - **Delete**: confirm `"Deleting this script will also delete the pages uploaded under it. Continue?"` → `DELETE /scripts/:id`.
  - **Embedded Pages section** under the card (PagesSection):
    - Lists each scene folder as a row with colored swatch + scene label + page count.
    - **+ Add Page** action — opens **AddPageModal**.
    - Per row: **View** (PDF), **Edit** (re-opens modal), **Delete** (confirm).
- Empty state: "No scripts yet", "Add a script (PDF/FDX) — or create one by name and add pages first.", Add Script CTA.

#### AddScriptModal
Form (Modal / FullScreenDialog / BottomSheet):
- **Script name** (required input). Validation: trimmed length ≥ 1, ≤ 200.
- **Script file (optional — PDF or .fdx)** — file picker; show selected filename.
- Cancel / **Add Script** buttons.
- Submit flow:
  1. `POST /scripts { title }` → `{ script }`.
  2. If file: `POST /scripts/:id/versions` with multipart `pdf` + `versionLabel: "v1"`.
- Toast on success: "Script added".

#### AddPageModal (also handles Edit)
- **Scene number** (required, trimmed length ≥ 1).
- **Color** swatch picker. Default `#9E9E9E`.
- **Description** (optional, ≤ 500 chars).
- **PDF or Final Draft (.fdx)** file picker. Required on create, optional on edit (label shows "leave empty to keep current").
- Cancel / **Save** buttons.
- Submit:
  - Create: `POST /scripts/:scriptId/pages` (multipart with sceneNumber, color, description, pdf).
  - Edit: `PUT /pages/:id` (same).

#### ScriptPdfViewer
- Same component pattern as SidesPdfViewer; opens signed `/api/versions/:id/download` URL in WebView, with toolbar/page-fit. Header has script title + version label + Open in browser + Close.

---

## 10. Sides PDF rendering contract (server-side; clients only display)

When the user submits **Generate Sides** or **Autogenerate Sides**, the server produces a single PDF. The mobile apps do **not** render the PDF themselves — they only send the right payload and display whatever the server returns. The contract below documents what the agent should expect to see so it can write meaningful UI tests.

### 10.1 Hide mode (`sceneDisplayMode: "hide"`)
- Only the selected scenes appear, each cropped to its own region with the heading at the top.
- Script scenes and Page-folder scenes are interleaved in the user's `sceneOrder` if `orderedScenes: true`; otherwise script-then-pages in natural order.
- No "SIDES" running header (E13 trailer also removed — see below).

### 10.2 Cross-out mode (`sceneDisplayMode: "crossout"`)
- Keeps **only pages containing selected-scene content (E9)** — gap pages (fully unselected scenes between two far-apart picks) are **dropped entirely**, not rendered fully crossed out.
- On each kept page: the **full page** is rendered (page number + margins preserved).
- Each contiguous run of unselected scenes on the page is shaded light grey (≈ 45 % opacity) and crossed with **one big X drawn corner-to-corner** across the run.
- **Generous clearance above the next selected heading (E10)** — the grey rectangle and X stop ~22 px above the next heading's top edge, so the kept scene's heading text is never overlaid.
- **Selected scenes stay clean** and unshaded.

### 10.3 Cross-out + rearrange (E11)
When the user has both `sceneDisplayMode: "crossout"` and a non-empty `sceneOrder`, the server emits **one page-chunk per scene** in `sceneOrder` instead of a single contiguous run:
- For each scene `N` in `sceneOrder`, only the pages where scene `N` has content are rendered.
- Inside each chunk, **all user-picked scenes** (the full `versionScenes + pageSelections` union) are left clean — only scenes that are NOT in the user's selection are greyed/X'd. So if another picked scene happens to share a page with `N`, it stays readable inside `N`'s chunk.
- The same scene may legitimately appear in multiple chunks if `sceneOrder` mentions it more than once (or if two ordered scenes overlap on a page).

### 10.4 Trim rules (applied to every generated sides PDF)
- **No "SIDES" / title running header** on any page.
- **No per-Page-folder "Scene X" header (E12)** before page-folder images.
- **No "*** END OF SIDES ***" trailer (E13)**.
- **No blank pages between units (E14)** — the inter-unit separator is skipped whenever it doesn't fit on the current page, and is omitted entirely after the last unit. PDFs end exactly on the last unit's last page.

Mobile clients do nothing for any of the above — just send the correct payload and render the returned PDF.

---

## 11. Validation rules (all forms)

### AddScriptModal
- `title.trim().length >= 1` else toast `"Script name is required"`.
- File optional. If chosen, must be PDF or `.fdx` (filter via picker UTIs; reject otherwise).

### AddPageModal
- `sceneNumber.trim().length >= 1` else toast `"Scene number (title) is required."`.
- `color` must match `/^#[0-9a-fA-F]{3,8}$/`; if absent default `#9E9E9E`.
- File required on create. On edit, file optional.

### GenerateSidesScreen submit
- A script must be selected (`primaryScriptId` truthy) else toast `"No script found"`.
- At least one scene OR one page selection must exist (`readyToSubmit`) else toast `"Select at least one scene or page"`.
- If rearrange is on: parse `orderInput` by `/[,;\s]+/`, dedupe, filter empties. Order must contain at least one valid scene number.
- Cross-source dedup enforced (§9.1).

### AutogenerateSheet submit
- A call sheet must be selected else toast `"Select or upload a call sheet first"`.
- Computed ordered scene list (from Rearrange + Schedule + Call sheet matched scenes) must be non-empty else toast `"No scenes to generate"`.

### Upload (file picker)
- Reject any file whose extension isn't `.pdf` or `.fdx` (also check mime type when available).
- Maximum size 25 MB (configurable). Toast `"File too large (max 25 MB)"`.
- On upload failure: surface envelope `message`; auto-retry once before showing the toast.

---

## 12. Error & toast handling

- All success and failure messages go through a single Toaster service (`Toast.show(.success|.error|.info, message)`).
- Network errors → `Could not reach the server. Check your connection.`
- Envelope error → use `envelope.message` verbatim.
- Auth header construction errors → `Authentication failed locally. Please reinstall the app.`
- Empty server response → `Server returned no data.`
- PDF viewer failures → `Could not open the PDF.` with retry.

---

## 13. State / persistence

- `deviceId` (UUID, generated once) — `UserDefaults` / `EncryptedSharedPreferences`. **Never** regenerate.
- Last selected tab — persist for next launch.
- Last theme override (system / light / dark) — persist.
- No request caching of list data beyond in-memory ViewModel. Always refetch on tab focus.

---

## 14. Realtime (optional)

WebSocket at `wss://<host>/ws`:
- Connect on app foreground (with auth headers in the upgrade request).
- Reconnect with backoff on failure.
- On message `{ event: "sides:updated", data: {...} }`, the Sides ViewModel invalidates its list and toasts on `ready`/`error`.

---

## 15. Acceptance checklist (must all pass)

The bracketed `[Ex]` tags map each scenario back to the enhancements in §0 — when one fails, jump to the matching section.

1. **Fresh install**: app launches, Sides tab opens, list loads from prod backend (envelope unwrap successful). **[E1]**
2. **Tabs**: bottom bar shows exactly Sides + Script; tapping switches; back button doesn't cross tabs.
3. **Add Script**: upload an `.fdx`. Within seconds the card shows `<n> pages > 0` and version "v1". **[E19]**
4. **Replace script**: choose a new PDF; card updates to `v2`.
5. **Add Page** under a script: upload an `.fdx`. Page count populates; tap to expand and see detected scene chips. **[E17, E19]**
6. **Generate Sides — full screen + single script picker**:
   - Tapping Generate Sides pushes a dedicated screen (not a sheet). **[E2]**
   - Script picker dropdown lists every owned script; switching it clears all picks & order. **[E3]**
7. **Generate Sides — cross-source dedup**:
   - Pick scene from version A.
   - Open Page X — the same scene number is dimmed and untappable; tooltip says "Already picked from another source".
   - "Select all" on Page X silently skips that scene and toasts "Skipped scenes already picked from another source." **[E4]**
8. **Generate Sides — no call sheet / schedule sections** on this screen. **[E6]**
9. **Generate Sides — drag-and-drop reorder (Hide)**:
   - Select 3+ scenes, enable Rearrange — chips appear.
   - Drag the third chip onto the first → order updates live; preview line reflects it.
   - Tap × on a chip → it disappears; an `Add: +N` button appears for it; tapping appends it again.
   - Text input still edits the same order. **[E7]**
10. **Generate Sides — cross-out, no rearrange**:
    - Pick scenes from version A; choose `Cross out unselected scenes`; rearrange is still visible. **[E8]**
    - Submit → review → View shows only pages containing picked content (gap pages are missing); selected scene headings are uncovered (no grey/X over them); no SIDES header; no `*** END OF SIDES ***` trailer; no blank pages. **[E9, E10, E12, E13, E14]**
11. **Generate Sides — cross-out + rearrange (E11)**:
    - Pick scenes 5, 18, 19 from a version; enable Rearrange; drag chips into order `19, 5, 18`.
    - Submit → review → View. The PDF has three chunks in `19 → 5 → 18` order, each a full-page render of the pages containing that scene's content; non-selected scenes are greyed/X'd; if two of `{5, 18, 19}` share a page, both stay clean inside whichever chunk renders it.
12. **Generate Sides — cross-out + rearrange across versions + pages**:
    - Pick scene 19 from a Page and 5, 18 from a version; order `19, 5, 18`; cross-out.
    - Output interleaves the Page's chunk and the script chunks in that order.
13. **Autogenerate Sides**:
    - Upload a new call sheet inside the sheet; the prior uploaded call sheet is replaced server-side.
    - Submit → review → Publish → side appears in the main list with status `ready`.
14. **Review stage — four buttons (E15)**: View again, **Download**, Move to Doc Distribution, Publish — all present and functional.
15. **View Sides / View Script (E16)**: tap View → raw PDF opens **inside** the WebView with native PDF controls (toolbar, page-fit), NOT an HTML page; tap Open in browser → system browser opens it.
16. **FDX heading detection — slug variants**:
    - Upload an FDX whose author typed scene-like lines as **Action** ("EXT. JUNGLE - DAY") or used "SCENE 33" / "33 SCENE 33" — they appear in the version's scene list. **[E18, E19]**
17. **PDF heading detection — margin pair (E20)**:
    - Upload a PDF containing scenes like `2A  INTERCUT: TV INSERT.  2A`, `4  "TEN YEARS AGO"  4`, `7  - UNIVERSITY LECTURE HALL...  7` — all three appear in the version's scene list even without INT/EXT/SCENE keywords.
18. **Theme**: dark mode matches §2 dark tokens; light mode matches §2 light tokens; system toggle updates instantly.
19. **Validation**: try submitting blank Add Script — error toast `"Script name is required"`. Try Generate Sides with no picks — error toast `"Select at least one scene or page"`.
20. **Server error (envelope)**: simulate (or force) `status: 0` from any endpoint — UI shows the envelope `message` verbatim, never crashes. **[E1]**
21. **Debug endpoints (E21)** are wired up only as developer affordances; they shouldn't be exposed in the UI but the agent should hit `GET /api/debug/versions/:id/scenes` and `GET /api/debug/pages/:id/scenes` during development to verify the detection-strategy distribution before shipping any heading-related claims.
22. **Force-quit and relaunch**: state restored; same `deviceId` is sent (auth still works).

---

## 16. Non-goals / constraints

- Do **not** introduce additional screens (Analytics, Breakdown, etc.).
- Do **not** modify the backend.
- Do **not** invent endpoints — use only those in §5.
- Do **not** add a sidebar or hamburger drawer.
- Do **not** ship `Secrets.*` to source control.
- Match copy strings exactly where shown in quotes.
- Match cross-source dedup precedence (pages win over versions) exactly.

---

## 17. Deliverables per platform

- A buildable Xcode project (iOS) and Gradle KTS project (Android) with all dependencies pinned.
- `Secrets.swift.template` / `Secrets.kt.template` (gitignored real file).
- README with: clone steps, secrets paste-in instructions, how to switch base URL, simulator/device run steps.
- Self-contained `Networking/` & `Upload/` folders (per §1). All other modules import them and never touch URLSession/Ktor directly.
- All §9 screens, §11 validation, §12 errors, §13 persistence implemented.

---

**Coding rules for the generating agent**
- Stay 1:1 with the web behavior described here. If something isn't specified, copy what the existing web app does — read the React source under `web/src/` for reference, but do **not** translate React idioms; write idiomatic SwiftUI / Kotlin.
- Keep the `Networking/` and `Upload/` folders independently replaceable: no UI code inside, no app-specific knowledge except endpoint paths.
- Prefer code that surfaces problems early: validate at the form layer, not deep inside the network layer.
- Every text string the user sees should be a single named constant in a `Strings.swift` / `strings.xml` resource — no in-line copy.

---

## Appendix A — App constants (copy strings, magic numbers)

These string literals appear in the web app and must be matched exactly by the mobile clients:

| Use | String |
|---|---|
| Autogenerate gate | `No published script available. Please upload script to generate sides` |
| Generate gate | `No active script or pages found. Please upload script to pages to generate sides` |
| Add Script — name required | `Script name is required` |
| Add Page — number required | `Scene number (title) is required.` |
| Add Page — file required | `A PDF or Final Draft (.fdx) file is required.` |
| Generate Sides — script | `No script found` |
| Generate Sides — picks | `Select at least one scene or page` |
| Cross-source dedup blocked tap | `Already picked from another source` |
| Cross-source dedup "Select all" | `Skipped scenes already picked from another source.` |
| Autogenerate submit gate | `Select or upload a call sheet first` |
| Autogenerate submit gate | `No scenes to generate` |
| Script delete confirm | `Deleting this script will also delete the pages uploaded under it. Continue?` |
| Realtime ready toast | `Sides ready: <title>` |
| Realtime error toast | `Sides failed: <error>` |
| Review stage card | `Sides generated successfully` |
| Empty scripts list desc | `Add a script (PDF/FDX) — or create one by name and add pages first.` |
| Section labels | `Pick scenes (versions)`, `Pages`, `Unselected scenes`, `Scene order  (drag chips to reorder, or type below)` |
| Rearrange live preview | `Sides will be ordered as: <list>` |

| Magic number | Value |
|---|---|
| Poll interval after generation submit | 2 s |
| Max poll attempts | 90 |
| Max upload size | 25 MB |
| List default limit | 50 sides, 100 scripts |
| Scene-pick chip disabled opacity | 0.35 |
| Cross-out grey opacity | 0.45 |
| Cross-out clearance above next heading | 22 px (canvas) |

---

## Appendix B — Server-side heading detection (read-only reference for the agent, E18 / E19 / E20)

The agent does **not** re-implement this — it's documented so the agent can write meaningful tests against the version/page scene lists.

A line on a PDF page is treated as a scene heading if **either**:

1. Its text matches the slug regex: `\b(?:INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s+|\bSCENE\b` **(E18)**, **OR**
2. It carries the **same scene number in BOTH the left and right margin** (left < 15 % page width, right > 70 % page width) **(E20)**.

For each admitted heading, the scene number is resolved by the first hit of:
1. Left-margin digit token (matches `^(\d+[A-Za-z]{0,3})\.?$`)
2. Right-margin digit token (same regex)
3. Inline leading number: `^(\d+[A-Za-z]{0,3})\s+(?:INT|EXT|INT\/EXT|I\/E|SCENE)`
4. Trailing digit-only item at the end of the line

After scanning the whole PDF: if any scene has a real number, **unnumbered scene-like lines are dropped**. If none have numbers, every detected heading is auto-numbered sequentially `1, 2, 3, …`.

**FDX-specific parser fixes (E19):**
- `<DualDialogue>` wrappers are flattened so nested paragraphs aren't lost.
- Paragraphs typed `Action` whose text starts with `INT./EXT./INT/EXT/I/E/SCENE` are promoted to `Scene Heading`.
- Inline leading numbers ("18 EXT. JUNGLE — DAY", "33 SCENE 33") are stripped from heading text and used as the scene number when `<SceneProperties Number="…"/>` is missing.
- Scene Heading paragraphs are emitted even when their `<Text>` block is empty — numbering doesn't shift.

---

## Appendix C — Debug endpoints (developer-only, E21)

Two diagnostic endpoints expose the raw scene-map detection for any PDF the user owns. They are **not** part of the public mobile UI; use them during development to investigate why a specific scene isn't being picked.

| Endpoint | Use |
|---|---|
| `GET /api/debug/versions/:versionId/scenes` | Diagnose a script version PDF |
| `GET /api/debug/pages/:id/scenes` | Diagnose a Page (scene folder) PDF |

Both require the standard auth headers. Response shape:

```jsonc
{
  "summary": {
    "totalPages": 42,
    "headingsDetected": 38,
    "numbered": 36,
    "droppedAsUnnumbered": 2,
    "autoNumberedFallback": false,
    "finalSceneCount": 36,
    "detectionStrategies": { "leftMargin": 34, "rightMargin": 1, "inlineLead": 1, "none": 2 }
  },
  "survivors": [ { "page": 1, "sceneNumber": "5", "heading": "5 INT. CORRIDOR – DAY 5", "detectedBy": "leftMargin" } ],
  "dropped":   [ { "page": 3, "sceneNumber": null, "heading": "EXT. HOUSE - DAY", "detectedBy": "none" } ],
  "headings":  [ /* every detected heading (numbered + unnumbered) */ ],
  "pages": [
    {
      "page": 1, "pageWidth": 612, "leftMarginCutoff": 91.8, "rightMarginCutoff": 428.4,
      "lines": [
        {
          "text": "5  INT. CORRIDOR - DAY  5", "pdfY": 720.3,
          "items": [{"str":"5","pdfX":54.0},{"str":"INT. CORRIDOR - DAY","pdfX":90.0},{"str":"5","pdfX":560.0}],
          "matchesSlug": true, "marginPair": true, "matchesHeading": true,
          "sceneNumber": "5", "detectedBy": "leftMargin"
        }
      ]
    }
  ]
}
```

The agent should hit one of these whenever heading detection seems off, and gate any code change against the `summary.detectionStrategies` distribution.
