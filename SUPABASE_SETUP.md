# Supabase + Google Sheet Setup

## 1. Supabase project

Create or open your Supabase project, then run:

```sql
-- Paste and run supabase/schema.sql in the Supabase SQL editor.
```

If using the Supabase CLI, the same schema is available as a migration:

```text
supabase/migrations/20260609100000_initial_financial_schema.sql
```

The dashboard reads from:

```text
v_financial_actuals
```

The sync function writes to:

```text
locations
financial_actuals
sheet_row_staging
sheet_sync_runs
```

## 2. Google Sheet access

Current Sheet:

```text
https://docs.google.com/spreadsheets/d/1SiPaJEatVuSnI0IBzmagaERb6Lyf1HRnUKDynGQU-uk/edit?gid=1398563362#gid=1398563362
```

Because this Sheet is public, the sync function can read from the public CSV export with:

```text
GOOGLE_SHEET_ID=1SiPaJEatVuSnI0IBzmagaERb6Lyf1HRnUKDynGQU-uk
GOOGLE_SHEET_GID=1398563362
```

No Google API key or service account is required while it stays public.

For a private Sheet, use the service account method.

1. Create a Google Cloud service account.
2. Enable the Google Sheets API for that Google Cloud project.
3. Create a JSON key for the service account.
4. Share the Google Sheet with the service account `client_email`.
5. Add the JSON key to Supabase as `GOOGLE_SERVICE_ACCOUNT_JSON`.

For a public/readable Sheet, `GOOGLE_API_KEY` can work, but private Sheets should use the service account path.

## 3. Supabase Edge Function secrets

Set these Supabase function secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_SHEET_URL
GOOGLE_SHEET_ID
GOOGLE_SHEET_GID
GOOGLE_SHEET_NAME
GOOGLE_SHEET_RANGE
SYNC_WEBHOOK_SECRET
```

`GOOGLE_SERVICE_ACCOUNT_JSON` is required only if the Sheet becomes private.

## 4. Dashboard config

Copy:

```text
config.example.js
```

to:

```text
config.js
```

Then set:

```js
export const dashboardConfig = {
  supabaseUrl: "https://jjssynorofmeplhhezoz.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  refreshIntervalMs: 60000,
};
```

`config.js` is ignored by Git so keys are not committed.

## 5. Optional Google Apps Script trigger

Paste `google-apps-script/Code.gs` into the Google Sheet Apps Script project.

Set script properties:

```text
SUPABASE_SYNC_WEBHOOK_URL=https://jjssynorofmeplhhezoz.supabase.co/functions/v1/sync-google-sheet
SUPABASE_SYNC_WEBHOOK_SECRET=the same SYNC_WEBHOOK_SECRET value
```

Run `createInstallableTriggers()` once from Apps Script.
