# 🔧 Field Tracker — Zampell

AI-powered field work order tracker for Dylan Boutin, Zampell Facilities.

## Deploy to Vercel (no terminal needed)

1. Go to **vercel.com** and sign up / log in
2. Click **"Add New Project"**
3. Drag this entire `fieldtracker-fixed` folder into the import / upload area
4. Vercel auto-detects it as a Create React App — leave the defaults and click **Deploy**
5. Wait ~2 minutes — you'll get a live URL like `field-tracker-abc.vercel.app`

> You do **not** need to set any environment variables. The OpenAI key is entered
> inside the app (Settings) and stays on your device — nothing secret ships in the build.

## Add to Home Screen (Android / Z Fold 7)

1. Open your Vercel URL in **Chrome** on your phone
2. Tap the **3-dot menu** → "Add to Home screen"
3. Name it "Field Tracker" → tap Add
4. It opens full-screen like a native app, with the wrench icon

## First-time setup

1. Open the app
2. Tap the **⚙️ gear icon** (top right) → Settings
3. Paste your **OpenAI API key** (from platform.openai.com → API Keys)
4. Optionally set a default location
5. Start logging jobs

## Why the key lives in Settings (not the build)

Anything baked into a React build at compile time is visible in the shipped
JavaScript — anyone who opened your public URL could read the key and spend your
credits. Storing it in Settings keeps it in this device's local storage only; it
is sent directly to OpenAI and nowhere else. If you ever want to lock this down
further, put a tiny serverless function in front of OpenAI so the key never
touches the browser.

## Features

- Per-job AI chat powered by GPT-4o (text + photos)
- **Job titles** plus separate Building / Floor / Room fields
- **Equipment tracking** — brand, model #, serial # per job
- Five statuses: Open, In Progress, Waiting on Parts, Follow-Up Needed, Complete
- Priority: Normal / High / Urgent
- Photo uploads with auto-compression, stored in IndexedDB (hundreds of MB, not the old 5 MB cap)
- **Photo categories** (Before / After / Damage / Part / Equipment / Other) + gallery view
- Direct camera capture on phone
- Voice-to-text input (Chrome on Android)
- AI work-order notes — choose **Found / Fixed / Parts Used / Follow-Up** format or paragraph, with one-tap Regenerate
- **Parts Used** (with cost totals), **Parts Needed / To Order** (checkable), and a **Material Checklist**
- Start/finish time + total time on job, mileage, follow-up date
- Search across WO #, title, location, building, room, tags
- Filter by status / date / tag; completion-rate dashboard
- Swipe to complete / archive / delete; bulk select actions
- Export: **printable PDF report** (with photos), plain text, and CSV
- Share button (native share sheet)
- Two-pane layout on the Z Fold 7 inner screen; single view on the cover screen
- Offline shell via service worker (AI needs a connection)
- Installable PWA — adds to home screen


## Data & storage

- **Text** (jobs, notes, parts, settings) -> localStorage
- **Photos** -> IndexedDB, referenced by ID from each message
- Deleting a job also removes its photos; orphaned photos are pruned automatically
- Everything stays on the device — there is no server and no account

## API cost

Add ~$20 of credits at platform.openai.com — that's months of heavy use at
GPT-4o pricing, even with photos.
