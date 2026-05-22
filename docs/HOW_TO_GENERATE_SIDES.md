# How to Generate Sides — Step-by-Step Guide

A simple walkthrough for creating a sides booklet. Works the same on **Web**, **Android**, and **iOS**.

> **Before you start:** make sure your production has (1) an active script uploaded, and (2) at least one call sheet uploaded. If you also want the shooting schedule in your sides, upload that too. You need an **Admin** or **Editor** account — Viewers can open sides but can't create them (the "+" button won't appear).

---

## The quick version

1. Open the app → **Sides** screen.
2. Tap the **+** button.
3. Check the pre-filled details (script, call sheet, scenes).
4. Choose your options (scenes source, attach call sheet, include schedule).
5. Tap **Generate / Submit**.
6. Wait ~1 minute for the status to turn **Ready**.
7. Tap **View** to read it, or **Download** to save/share it.

---

## Step-by-step (with the new options)

### Step 1 — Open the Sides screen
Launch the app and go to the **Sides** tab. You'll see a list of existing sides (if any) with status badges, and a **Call Sheets** tab next to it.

### Step 2 — Tap the "+" button
The floating **+** button (bottom-right) opens the **Customize Sides** panel. It slides up and is mostly pre-filled for you.

### Step 3 — Review what's auto-selected
The panel automatically loads:
- **Active script** — the live version of your screenplay (read-only here).
- **Latest call sheet** — the call sheet whose scenes will be used.
- **Latest shooting schedule** — if one exists.

> Behind the scenes the app also figures out which schedule day matches today's scenes — you don't need to pick it. It's used automatically when you include the schedule (Step 6), so it's no longer shown in the panel.

### Step 4 — Decide where the scenes come from
Use the **"Use scenes from call sheet"** toggle:

- **ON (default)** — sides are built from the call sheet's scenes. You can still add extras in the manual field.
- **OFF (custom only)** — the call sheet's scenes are ignored. Sides are built **only** from the scene numbers you type yourself. The manual field then becomes required.

> Use **OFF** when you want sides for specific scenes that aren't on the call sheet — e.g. a pickup, a rehearsal, or a one-off scene request.

### Step 5 — Add or adjust scene numbers
In the **scenes** field, type any scenes you want, separated by commas. Examples:
- `12, 14, 15`
- `5-8` (a range → 5, 6, 7, 8)
- `107A, 110, 112pt` (suffixes and "pt" are handled automatically)

The **live summary** at the bottom shows exactly which scenes will be included.

### Step 6 — Choose whether to attach the call sheet
Use the **"Attach call sheet to sides PDF"** toggle:

- **ON (default)** — the call sheet is placed at the front of the sides booklet (in both View and Download).
- **OFF** — the booklet contains only the script scenes (and schedule, if selected) — no call sheet page.

### Step 7 — Optionally include the schedule
Turn on **"Include Schedule in sides"** to append the matched shoot day's schedule to the back of the booklet. The matching day is detected automatically — no extra selection needed.

### Step 8 — Name it (optional)
Type a **Title** if you want, e.g. "Day 12 — Warehouse". If left blank, a title is generated automatically.

### Step 9 — Generate
Tap **Generate / Submit**. The panel closes and a new row appears at the top of the list marked **Generating…**.

### Step 10 — Wait for "Ready"
After roughly **30–60 seconds** the status flips to **Ready**. The list updates on its own — no need to refresh. (If anyone else is logged in on another device, their list updates live too.)

### Step 11 — View or Download
- **View** — opens the booklet inside the app: call sheet → script scenes → schedule, page by page.
- **Download** — saves the PDF (with the call sheet merged in, if you attached it) so you can email or AirDrop it to the crew.

---

## Choosing the right combination

| You want… | "Use call sheet scenes" | "Attach call sheet" | Manual field |
|---|---|---|---|
| Standard daily sides | ON | ON | optional extras |
| Daily sides, no call sheet page | ON | OFF | optional extras |
| Sides for specific custom scenes only | OFF | OFF (or ON) | **required** |
| Custom scenes but still show the call sheet | OFF | ON | **required** |

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| Status: **Failed** | A scene number wasn't found in the script | Fix the scene number (check for typos) and generate again |
| Stuck on **Generating** > 5 min | Server is slow or restarting | Refresh; if it persists, try again or contact support |
| **+** button missing | Your account is a Viewer | Ask an Admin/Editor to grant posting access |
| "Enter at least one custom scene number" | Custom-only mode with an empty manual field | Type the scene numbers you want |

---

*Tip: the call sheet's scene numbers must match the scene numbers in your script. Most "scene not found" errors come from a mismatch between the two.*
