# ScriptDistribution — iOS App

SwiftUI app that mirrors the Android Sides app at `../app/`. Targets the same production backend
on Render (`https://script-distribution-api.onrender.com`) with the same auth flow
(`moduledata` + `bodyhash` + `Timezone` + `deviceInfo` headers, AES/CBC encryption).

## Requirements

- Xcode 15+
- iOS 16.0 deployment target
- Swift 5.9+

## Setup (90 seconds)

1. **Open the project**
   - Open `ios/ScriptDistribution/ScriptDistribution.xcodeproj` in Xcode.
   - If Xcode complains about the bundled `project.pbxproj`, use the **fallback path** below.

2. **Add the encryption secrets**
   - In Finder, copy `ScriptDistribution/Secrets.swift.template` → `ScriptDistribution/Secrets.swift`
   - Paste the same values that the Android app uses for `ENCRYPTION_KEY`, `IV_KEY`, and
     `IV_ENCRYPTION_SALT` in `app/build.gradle.kts` / `local.properties`.
   - `Secrets.swift` is gitignored.

3. **Run**
   - Select target → iPhone 15 (iOS 17) simulator → Cmd-R.
   - The Sides list loads from production immediately (no login flow — the app
     auto-generates a device ID on first launch and stores it in `UserDefaults`).

## Fallback: create a fresh Xcode project

If the bundled `.xcodeproj` doesn't open cleanly on your Xcode version:

1. File → New → Project → iOS → App → SwiftUI → Bundle ID `com.zillit.scriptdistribution.ios`,
   minimum iOS 16.0. Name it `ScriptDistribution` and save anywhere outside this folder.
2. Delete the default `ContentView.swift` from the new project.
3. In Finder, drag the entire `ScriptDistribution/` source folder from this repo
   (the inner one with `ScriptDistributionApp.swift`, `Models/`, `Networking/`, etc.)
   into the Xcode project navigator. Choose "Copy items if needed" = **off**,
   "Create groups", and tick the `ScriptDistribution` target.
4. Add `Secrets.swift` as described above and run.

## What's in here

| Folder | Purpose |
|---|---|
| `ScriptDistribution/ScriptDistributionApp.swift` | `@main` SwiftUI app entry |
| `ScriptDistribution/Models/Models.swift` | All Codable structs — Sides, CallSheet, Schedule, Script |
| `ScriptDistribution/Networking/` | URLSession + AES/CBC encryption + auth headers |
| `ScriptDistribution/ViewModels/SidesViewModel.swift` | `@MainActor ObservableObject` for the Sides list |
| `ScriptDistribution/Views/` | All SwiftUI views |
| `ScriptDistribution/Views/SidesWebView.swift` | `WKWebView` wrapper that loads `/api/sides/{id}/view` with auth headers — same as Android's `SidesWebViewActivity` |
| `ScriptDistribution/Views/GenerateSidesSheet.swift` | Customize Sides bottom sheet (`.presentationDetents`) — mirrors Android's `GenerateSidesDialog` |

## Architecture

- **Single screen**: Sides list (Sides / Call Sheets tabs). No bottom navigation —
  matches the current Android nav after Scripts and Analytics were removed.
- **WKWebView with auth headers**: `URLRequest` is built with the same encrypted
  `moduledata` + `bodyhash` headers that `APIClient` sends, then handed to
  `WKWebView.load(_:)`. The backend's `moduleAuth` middleware authenticates the
  request identically to a Retrofit call.
- **Download flow**: `GET /api/sides/{id}/download` returns a signed URL → opened
  via `UIApplication.shared.open(url)` (Safari / Files preview).
- **Generate Sides**: Auto-loads active script, latest call sheet (draft preferred),
  latest schedule. Computes matched shoot day (highest scene-number overlap), shows
  extra scenes from other days. Submit POSTs `GenerateSidesRequest` to `/api/sides`.

## Backend dependencies

This iOS app makes zero new server requests — all endpoints already exist:

- `GET  /api/sides`, `GET /api/sides/{id}/view`, `GET /api/sides/{id}/download`, `POST /api/sides`
- `GET  /api/scripts/active`
- `GET  /api/callsheets`, `GET /api/callsheets/{id}`
- `GET  /api/schedules`, `GET /api/schedules/{id}`

Verified against the Android client and the React web client.
