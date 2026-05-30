# Mobile App Build Spec — "Script Distribution" (iOS SwiftUI + Android Kotlin/XML/Ktor)

**Goal:** Build two production-quality native mobile apps (iOS and Android) that match the existing web application **feature-for-feature**, against the same Render-hosted Node/Express/MongoDB backend. No backend changes.

The single source of truth for behavior, look, and constraints is this document.

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

**Single uploader** used by Script versions, Pages, Call sheets, Schedules.

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
    - **View** (primary, only when `status == "ready"`): fetch signed URL from `sides/:id/download`, open in in-app WebView/WKWebView with native PDF controls (`#toolbar=1&navpanes=0&view=FitH`).
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
  3. **Rearrange scene order** — checkbox; when on, show `Scene order  (Write the scene no. to arrange the order)` text field. Live preview line `Sides will be ordered as: 5, 7, 9` underneath.
  4. **Unselected scenes** — radio options:
     - `Hide unselected scenes` (default) — only selected scenes appear.
     - `Cross out unselected scenes` — see §10.
  5. **Title** — optional input.
- **Submit**: validates (see §11), then POST `/sides` with `publish: false` and enters review stage.
- **Review stage** (inside same sheet, replacing form):
  - Spinner + "Generating sides…" while polling `GET /sides/:id` every 2 s up to 90 attempts. Stop on `ready` or `error`.
  - On error: red header "Generation failed" + envelope/error message.
  - On ready: green card "✅ Sides generated successfully" + buttons:
    - **View** (toggles to "View again" after first click).
    - **Publish** (`POST /sides/:id/publish`).
    - **Move to Doc Distribution** (`POST /sides/:id/doc-distribution`).

#### GenerateSidesScreen (full screen, **not** a modal)
- Back button (← Back to Sides) navigates back.
- Sections, in order:
  1. **Script picker** (dropdown / Picker). Lists every script the user owns, newest first. Each entry shows `<title>` + ` (no file — pages only)` suffix if no current version. Default selection = active script.
     Switching script clears all version/page picks and resets rearrange order.
  2. **Pick scenes (versions)** — for the selected script only:
     - Lists versions inside an expandable group.
     - Each version is a collapsible card showing scene chips. Multi-select toggles each scene.
     - "Select all" / "Clear" links.
  3. **Pages** (scene folders) — for the selected script only:
     - Lists scene folders as collapsible cards. Each shows colored swatch + sceneNumber + page count.
     - On expand: chips of scenes detected in that Page's PDF, multi-select. If no scenes detected, show a single "Include whole PDF" checkbox instead.
  4. **Summary row** — all selected scenes (union of version picks + page picks, deduped), shown as chips with the live count.
  5. **Rearrange scene order** — **hidden when `sceneDisplayMode == "crossout"`.** When shown: checkbox + text field with live preview, same as Autogenerate.
  6. **Unselected scenes** — same radio options as Autogenerate.
  7. **Title** — optional.
  8. **Submit** → review stage (identical to Autogenerate).

**Client-side cross-source dedup (mandatory):**
- Compute `claimedScenes = { scene numbers picked from ANY version OR any page }` (case-normalized, strip trailing `PT`).
- In every picker (each version + each page folder), any scene chip whose number is in `claimedScenes` but not picked in the current source is shown **disabled**, 35% opacity, with tooltip / accessible label `"Already picked from another source"`. Tapping does nothing.
- "Select all" silently skips scenes claimed elsewhere and toasts `"Skipped scenes already picked from another source."`
- A user CAN toggle off a scene they already picked here.

**Important:** No "Include call sheet in sides" / "Include schedule in sides" sections appear here. Those exist only in Autogenerate.

#### SidesPdfViewer (presented modally / pushed)
- Header bar: title, version label, `Open in browser` button (system handoff), `Close`.
- WebView loading the signed PDF download URL with native PDF rendering (`#toolbar=1&navpanes=0&view=FitH`).

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

## 10. Cross-out rendering contract (server-side; clients only display)

When the user picks `sceneDisplayMode: "crossout"`, the server produces a sides PDF that:
- Keeps **only pages containing selected-scene content** (drops fully-unselected gap pages).
- On each kept page: full page rendered (page number + margins preserved).
- Each contiguous run of unselected scenes on the page is shaded light grey (≈45 % opacity) and crossed with one big X drawn corner-to-corner, stopping well above the next selected heading.
- Selected scenes stay clean and unshaded.
- No "SIDES" running header; no per-Page "Scene X" header.

Mobile clients do nothing here — just send `sceneDisplayMode` correctly and render whatever PDF the server returns.

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

1. **Fresh install**: app launches, Sides tab opens, list loads from prod backend (envelope unwrap successful).
2. **Tabs**: bottom bar shows exactly Sides + Script; tapping switches; back button doesn't cross tabs.
3. **Add Script**: upload an `.fdx`. Within seconds the card shows `<n> pages > 0` and version "v1".
4. **Replace script**: choose a new PDF; card updates to `v2`.
5. **Add Page** under a script: upload PDF; page count populates; tap to expand and see detected scene chips.
6. **Generate Sides**:
   - Pick scene from version A.
   - Open Page X — the same scene number is dimmed and untappable; tooltip says "Already picked from another source".
   - Select **Cross out unselected scenes** — Rearrange section disappears.
   - Submit → review → View renders only pages with selected content (no "SIDES" header, no per-Page header).
7. **Autogenerate Sides**:
   - Upload a new call sheet inside the sheet; the prior uploaded call sheet is replaced server-side.
   - Submit → review → Publish → side appears in the main list with status `ready`.
8. **View Sides**: tap View → raw PDF opens in-app with native controls; tap Open in browser → system browser opens it.
9. **View Script**: tap View on a script card → raw PDF opens in-app.
10. **Theme**: dark mode matches §2 dark tokens; light mode matches §2 light tokens; system toggle updates instantly.
11. **Validation**: try submitting blank Add Script — error toast `"Script name is required"`. Try Generate Sides with no picks — error toast `"Select at least one scene or page"`.
12. **Server error**: simulate (or force) `status: 0` from any endpoint — UI shows the envelope `message`, never crashes.
13. **Force-quit and relaunch**: state restored; same `deviceId` is sent (auth still works).

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
