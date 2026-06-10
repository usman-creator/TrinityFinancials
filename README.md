# Trinity Financial Dashboard

This is the first working UI/UX prototype for the Google Sheet to Supabase financial dashboard.

## What is included

- `index.html` - static app shell
- `styles.css` - dashboard layout and responsive styling
- `app.js` - sample financial model, filters, charts, table, and sync simulation
- `supabase/schema.sql` - database tables and reporting view
- `supabase/migrations/20260609100000_initial_financial_schema.sql` - Supabase CLI migration copy of the schema
- `supabase/config.toml` - Supabase project/function configuration
- `supabase/functions/sync-google-sheet/index.ts` - starter Supabase Edge Function for Google Sheet sync
- `google-apps-script/Code.gs` - optional Google Sheet edit/change trigger starter
- `config.example.js` - browser-side Supabase read configuration template
- `SUPABASE_SETUP.md` - live sync setup steps
- `GITHUB_SETUP.md` - GitHub repository setup steps

## Current prototype behavior

The dashboard uses sample rows extracted from `Example data set.xlsx` until a local `config.js` file is added. With `config.js`, it reads live dashboard rows from Supabase `v_financial_actuals`. It calculates gross profit, net profit, margins, payroll totals, and bank variance inside the app instead of trusting cached spreadsheet formula cells.

Open `index.html` directly in a browser to view the prototype.

## Next implementation steps

1. Create or identify the Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create Google Cloud credentials for the Google Sheets API.
4. Deploy the Edge Function with these secrets:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SHEET_URL`
   - `GOOGLE_SHEET_NAME`
   - `GOOGLE_SHEET_RANGE`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_API_KEY` for public sheets
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SYNC_WEBHOOK_SECRET` if using the Apps Script webhook
5. Copy `config.example.js` to `config.js` and fill in the Supabase URL and anon key.
6. Add the Apps Script starter to the Google Sheet if you want near-live webhook sync on edit/change.
