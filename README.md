# PSI GPS Tracker

**IMG Academy · PlayerData Inventory Management**

A web-based internal tool for tracking all PlayerData GPS and IMU units across every sport at IMG Academy. Built on React + Supabase, hosted on GitHub Pages.

**Live URL:** https://salinglima28.github.io/psi-gps-inventory-tool

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Local Development](#local-development)
4. [Making Edits in GitHub](#making-edits-in-github)
5. [Database Administration](#database-administration)
   - [Changing Contracted Unit Amounts](#changing-contracted-unit-amounts)
   - [Deleting Specific Data](#deleting-specific-data)
   - [Full Data Reset](#full-data-reset)
6. [Database Schema](#database-schema)
7. [Deployment](#deployment)
8. [Supabase Notes](#supabase-notes)

---

## Overview

The PSI GPS Tracker gives the PSI department lead and sport practitioners a single, real-time view of every unit's location, status, and history. It replaces manual spreadsheets and enforces clean data transitions — broken units can only move to at_playerdata, spare units can only be assigned to athletes, and unaccounted-for units are computed automatically as the gap between contracted and on-record.

**The five tabs:**

| Tab | Purpose |
|---|---|
| Dashboard | Real-time unit counts scoped by sport selector |
| Bulk Unit Upload | CSV upload for athlete assignments and spare units |
| Replace a Unit | Receive PlayerData shipments, log broken/lost units, assign replacements |
| Generate Report | Export unit and status data as CSV with date range filters |
| Exceptions | Auto-generated flags for unaccounted units, low spare pools, and stale broken units |

---

## Tech Stack

- **Frontend:** React 18, Tailwind CSS, React Router v6
- **Backend:** Supabase (PostgreSQL + PostgREST API)
- **Hosting:** GitHub Pages (via `gh-pages` branch)
- **CSV parsing:** PapaParse
- **Build:** Vite

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/salinglima28/psi-gps-inventory-tool.git
cd psi-gps-inventory-tool

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will run at `http://localhost:5173`. It connects to the live Supabase database, so any changes you make locally affect the real data.

**Environment variables** are in `src/supabaseClient.js`. The Supabase URL and anon key are stored directly in the file — this is fine for a public-read-only anon key but worth revisiting if row-level security is added later.

---

## Making Edits in GitHub

You can edit files directly in the browser without cloning the repo:

1. Go to `github.com/salinglima28/psi-gps-inventory-tool`
2. Press the `.` key to open github.dev (VS Code in the browser)
3. Make your changes in the editor
4. Click the **Source Control** icon in the left sidebar
5. Type a commit message and click **Commit & Push**
6. GitHub Actions will rebuild and redeploy automatically — takes 2–3 minutes

To check deployment status, go to the **Actions** tab on the repo page. A green checkmark means the live site is updated.

---

## Database Administration

All data administration is done through the **Supabase SQL Editor**:

1. Go to [supabase.com](https://supabase.com) and open your project
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Paste the SQL, review it, and click **Run**

> ⚠️ Always read the SQL carefully before running. Supabase will warn you about destructive operations — this is expected for DELETE and TRUNCATE statements.

---

### Changing Contracted Unit Amounts

When PlayerData updates the contract (more units added, sport allocation changes), update the `contracted_units` column in the `sports` table.

**Update one sport:**
```sql
UPDATE sports
SET contracted_units = 245
WHERE name = 'Basketball';
```

**Update multiple sports at once:**
```sql
UPDATE sports SET contracted_units = 175 WHERE name = 'Football';
UPDATE sports SET contracted_units = 195 WHERE name = 'Soccer';
UPDATE sports SET contracted_units = 245 WHERE name = 'Basketball';
UPDATE sports SET contracted_units = 110 WHERE name = 'Tennis';
UPDATE sports SET contracted_units = 215 WHERE name = 'Baseball';
```

**View current contracted amounts:**
```sql
SELECT name, practitioner, contracted_units
FROM sports
ORDER BY name;
```

> The `unaccounted_for` count on the dashboard recalculates automatically based on `contracted_units` — no other changes needed after updating this value.

---

### Deleting Specific Data

#### Scenario 1 — Remove a single unit and all its history

Use this when a unit was entered with the wrong serial number, or a test unit needs to be removed.

```sql
-- Replace 'PD-001234' with the actual serial number
DELETE FROM events
WHERE unit_id = (SELECT id FROM units WHERE serial_number = 'PD-001234');

DELETE FROM assignments
WHERE unit_id = (SELECT id FROM units WHERE serial_number = 'PD-001234');

DELETE FROM units
WHERE serial_number = 'PD-001234';
```

#### Scenario 2 — Remove all units for a specific sport

Use this when a sport's entire roster needs to be re-uploaded from scratch (e.g. wrong sport assigned to a batch of units, or a fresh start mid-season).

```sql
-- Replace 'Basketball' with the sport name
-- Events first (foreign key dependency)
DELETE FROM events
WHERE unit_id IN (
  SELECT id FROM units WHERE sport_id = (SELECT id FROM sports WHERE name = 'Basketball')
);

DELETE FROM assignments
WHERE unit_id IN (
  SELECT id FROM units WHERE sport_id = (SELECT id FROM sports WHERE name = 'Basketball')
);

DELETE FROM units
WHERE sport_id = (SELECT id FROM sports WHERE name = 'Basketball');
```

#### Scenario 3 — Remove a specific athlete's assignment without deleting the unit

Use this when an athlete left the program and their unit should return to the spare pool.

```sql
-- Step 1: Close the active assignment
UPDATE assignments
SET end_date = CURRENT_DATE, end_reason = 'athlete_departed'
WHERE athlete_name = 'Smith, John'
  AND end_date IS NULL;

-- Step 2: Return the unit to spare
UPDATE units
SET status = 'spare'
WHERE id = (
  SELECT unit_id FROM assignments
  WHERE athlete_name = 'Smith, John'
  ORDER BY start_date DESC
  LIMIT 1
);
```

#### Scenario 4 — Remove all events for a sport (keep units, clear history)

Use this when you want to preserve the unit records but wipe the event log — for example, after testing or a data correction exercise.

```sql
DELETE FROM events
WHERE unit_id IN (
  SELECT id FROM units WHERE sport_id = (SELECT id FROM sports WHERE name = 'Soccer')
);
```

#### Scenario 5 — Remove units that were uploaded with the wrong status

Use this to find and fix units that have an invalid or legacy status after a migration.

```sql
-- View units with unexpected statuses first
SELECT serial_number, status, sports.name as sport
FROM units
JOIN sports ON sports.id = units.sport_id
WHERE status NOT IN ('spare', 'assigned', 'broken_with_sport', 'broken_with_dept', 'at_playerdata', 'lost')
ORDER BY sport, serial_number;

-- Then update them individually once you know what they should be
UPDATE units SET status = 'spare' WHERE serial_number = 'PD-001234';
```

---

### Full Data Reset

Use this to wipe all unit data and start fresh. Sports and contracted amounts are preserved.

```sql
-- Run these in order
TRUNCATE events RESTART IDENTITY CASCADE;
TRUNCATE assignments RESTART IDENTITY CASCADE;
TRUNCATE units RESTART IDENTITY CASCADE;
```

> After running this, the dashboard will show all sports at zero. You can then re-upload your season CSV files from scratch.

---

## Database Schema

### `sports`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| name | text | Sport name |
| practitioner | text | Practitioner name |
| contracted_units | integer | Units contracted from PlayerData |

### `units`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| serial_number | text | PlayerData serial number (unique) |
| status | text | Current status (see valid statuses below) |
| sport_id | uuid | FK → sports |
| unit_type | text | GPS or IMU |
| acquired_date | date | Date unit entered inventory |
| acquired_source | text | How it entered (csv_import, playerdata_shipment, etc.) |
| notes | text | Optional notes |

**Valid unit statuses and transitions:**

```
spare → assigned → broken_with_sport → broken_with_dept → at_playerdata
spare → assigned → lost
spare → broken_with_sport (if a spare is found faulty)
broken_with_sport → at_playerdata (skip dept step if needed)
```

`unaccounted_for` is never stored — it is computed in the `sport_allocation` view as `contracted_units - COUNT(all units)`.

### `assignments`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| unit_id | uuid | FK → units |
| athlete_name | text | Athlete's name |
| sport_id | uuid | FK → sports |
| practitioner | text | Practitioner who made the assignment |
| start_date | date | Date assigned |
| end_date | date | Date unassigned (null if active) |
| end_reason | text | Why it ended (reassigned, lost, broken, etc.) |

### `events`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| unit_id | uuid | FK → units |
| event_type | text | Type of event (status_changed, csv_import, etc.) |
| event_date | date | When it actually happened (practitioner-supplied) |
| created_at | timestamptz | When it was logged (automatic) |
| from_status | text | Previous status |
| to_status | text | New status |
| athlete_name | text | Athlete involved (if applicable) |
| replaced_by_unit_id | uuid | Replacement unit FK (if applicable) |
| replacement_source | text | spare_own, spare_apd, or spare_other_sport |
| source_sport_id | uuid | For cross-sport transfers |
| notes | text | Optional notes |

### Views
| View | Description |
|---|---|
| `sport_allocation` | Per-sport unit counts including computed `unaccounted_for` and `health` flag |
| `available_spare_units` | All units with status = spare — used exclusively by the replacement picker |

---

## Deployment

The app deploys automatically on every push to `main` via GitHub Actions. The workflow is defined in `.github/workflows/deploy.yml`.

**Manual redeploy** (if needed):
```bash
npm run build
npm run deploy
```

This builds to the `dist/` folder and pushes to the `gh-pages` branch, which GitHub Pages serves.

---

## Supabase Notes

**Free tier limitations:**
- Database pauses after **7 days of inactivity** — the first request after a pause takes 10–15 seconds to wake up
- 500MB storage limit
- 2GB bandwidth per month

**If the app stops working entirely**, check:
1. The Supabase project is not paused (log in to supabase.com and check the dashboard)
2. The GitHub Pages deployment is current (check the Actions tab)
3. The browser console for specific error messages (F12 → Console)

**Row Level Security (RLS)** is currently disabled on all tables. The anon key allows full read/write access. If the tool is ever made public-facing or sensitive data is added, RLS policies should be configured in Supabase under Authentication → Policies.

---

*Last updated: June 2026 · Maintained by PSI Department · IMG Academy*