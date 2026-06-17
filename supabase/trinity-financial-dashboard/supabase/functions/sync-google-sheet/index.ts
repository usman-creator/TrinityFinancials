import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SheetRow = Record<string, string | number | null>;
type SyncPayload = {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetName?: string;
  gid?: string;
};
type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const defaultSpreadsheetId = Deno.env.get("GOOGLE_SHEET_ID") ?? "";
const defaultSpreadsheetUrl = Deno.env.get("GOOGLE_SHEET_URL") ?? "";
const defaultSpreadsheetGid = Deno.env.get("GOOGLE_SHEET_GID") ?? parseSpreadsheetGid(defaultSpreadsheetUrl);
const defaultSheetName = Deno.env.get("GOOGLE_SHEET_NAME") ?? "New one";
const configuredRange = Deno.env.get("GOOGLE_SHEET_RANGE");
const googleApiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";
const googleServiceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";
const supabaseUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const syncWebhookSecret = (Deno.env.get("SYNC_WEBHOOK_SECRET") ?? "").trim();

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  const requestSecret = (request.headers.get("x-sync-secret") ?? "").trim();

  if (syncWebhookSecret && requestSecret !== syncWebhookSecret) {
    return json({ ok: false, error: "Unauthorized sync request." }, 401);
  }

  let run: { id: string } | null = null;
  let effectiveSpreadsheetId = "";
  let effectiveSheetName = defaultSheetName;
  let effectiveGid = defaultSpreadsheetGid;

  try {
    const payload = await readPayload(request);
    effectiveSpreadsheetId = resolveSpreadsheetId(payload);
    effectiveSheetName = payload.sheetName || defaultSheetName;
    effectiveGid = payload.gid || parseSpreadsheetGid(payload.spreadsheetUrl || "") || defaultSpreadsheetGid;
    const effectiveRange = configuredRange ?? `${effectiveSheetName}!A1:T1000`;

    if (!effectiveSpreadsheetId) {
      throw new Error("Missing Google Sheet ID. Set GOOGLE_SHEET_ID, GOOGLE_SHEET_URL, or send spreadsheetId.");
    }

    run = await createSyncRun(effectiveSpreadsheetId, effectiveSheetName);

    const values = await readSheetValues(effectiveSpreadsheetId, effectiveRange, effectiveGid);
    const [headers, ...body] = values;
    if (!headers?.length) {
      throw new Error("Google Sheet range returned no header row.");
    }

    const rows = body
      .map((row, index) => normalizeRow(headers, row, index + 2))
      .filter((row) => row.location && row.period_month);

    let changed = 0;
    for (const row of rows) {
      const locationId = await upsertLocation(String(row.location));
      const rowHash = await hashRow(row.raw);

      await supabase.from("sheet_row_staging").insert({
        sync_run_id: run.id,
        source_row_number: row.source_row_number,
        row_hash: rowHash,
        raw_row: row.raw,
      });

      const { error } = await supabase.from("financial_actuals").upsert(
        {
          location_id: locationId,
          period_month: row.period_month,
          revenue: row.revenue,
          cost_of_service: row.cost_of_service,
          total_expense: row.total_expense,
          supplies: row.supplies,
          lab_fee: row.lab_fee,
          utilities: row.utilities,
          rent: row.rent,
          employee_payroll: row.employee_payroll,
          doctor_payroll: row.doctor_payroll,
          staff_head_count: row.staff_head_count,
          bank_deposits: row.bank_deposits,
          bank_debits: row.bank_debits,
          source_spreadsheet_id: effectiveSpreadsheetId,
          source_sheet_name: effectiveSheetName,
          source_row_number: row.source_row_number,
          row_hash: rowHash,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "location_id,period_month" },
      );

      if (error) throw error;
      changed += 1;
    }

    const skipped = Math.max(0, body.length - rows.length);
    await finishSyncRun(run.id, "success", body.length, changed, skipped);
    return json({ ok: true, rowsSeen: body.length, rowsChanged: changed, rowsSkipped: skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
    if (run?.id) {
      await finishSyncRun(run.id, "failed", 0, 0, 0, message);
    }
    return json({ ok: false, error: message }, 500);
  }
});

async function readPayload(request: Request): Promise<SyncPayload> {
  if (request.method === "GET") return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function resolveSpreadsheetId(payload: SyncPayload) {
  return (
    payload.spreadsheetId ||
    parseSpreadsheetId(payload.spreadsheetUrl || "") ||
    defaultSpreadsheetId ||
    parseSpreadsheetId(defaultSpreadsheetUrl)
  );
}

function parseSpreadsheetId(value: string) {
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? "";
}

function parseSpreadsheetGid(value: string) {
  const match = value.match(/[?&#]gid=([0-9]+)/);
  return match?.[1] ?? "";
}

async function createSyncRun(spreadsheetId: string, sheetName: string) {
  const { data, error } = await supabase
    .from("sheet_sync_runs")
    .insert({ spreadsheet_id: spreadsheetId, sheet_name: sheetName })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function finishSyncRun(
  id: string,
  status: "success" | "failed",
  rowsSeen: number,
  rowsChanged: number,
  rowsSkipped: number,
  errorMessage?: string,
) {
  await supabase
    .from("sheet_sync_runs")
    .update({
      status,
      rows_seen: rowsSeen,
      rows_changed: rowsChanged,
      rows_skipped: rowsSkipped,
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function readSheetValues(
  spreadsheetId: string,
  range: string,
  gid: string,
): Promise<Array<Array<string | number | null>>> {
  if (!googleServiceAccountJson && !googleApiKey && gid) {
    return readPublicCsvExport(spreadsheetId, gid);
  }

  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  const headers = new Headers();

  if (googleServiceAccountJson) {
    headers.set("Authorization", `Bearer ${await getGoogleAccessToken()}`);
  } else if (googleApiKey) {
    url.searchParams.set("key", googleApiKey);
  } else {
    throw new Error("Missing Google auth. Set GOOGLE_SERVICE_ACCOUNT_JSON for private sheets or GOOGLE_API_KEY for public sheets.");
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets read failed: ${response.status} ${detail}`);
  }
  const payload = await response.json();
  return payload.values ?? [];
}

async function readPublicCsvExport(spreadsheetId: string, gid: string) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google public CSV export failed: ${response.status} ${await response.text()}`);
  }
  return parseCsv(await response.text());
}

function parseCsv(csv: string): Array<Array<string | number | null>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((value) => value.trim() !== ""));
}

async function getGoogleAccessToken() {
  const serviceAccount = JSON.parse(googleServiceAccountJson) as GoogleServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = { alg: "RS256", typ: "JWT" };
  const assertionPayload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(assertionHeader))}.${base64Url(JSON.stringify(assertionPayload))}`;
  const signature = await signJwt(unsignedJwt, serviceAccount.private_key);
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.access_token as string;
}

async function signJwt(unsignedJwt: string, privateKeyPem: string) {
  const normalizedPem = privateKeyPem.replace(/\\n/g, "\n");
  const keyData = pemToArrayBuffer(normalizedPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedJwt)));
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function normalizeRow(headers: unknown[], row: unknown[], sourceRowNumber: number) {
  const raw: SheetRow = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(String(header ?? ""));
    if (!key) return;
    raw[key] = row[index] == null ? null : String(row[index]);
  });

  return {
    source_row_number: sourceRowNumber,
    raw,
    location: raw.companies_name,
    period_month: toDate(raw.month),
    revenue: money(raw.revenue),
    cost_of_service: money(raw.cost_of_service),
    total_expense: money(raw.total_expense),
    supplies: money(raw.supplies),
    lab_fee: money(raw.lab_fee),
    utilities: money(raw.utilities),
    rent: money(raw.rent),
    employee_payroll: money(raw.employee_payroll),
    doctor_payroll: money(raw.doctor_payroll),
    staff_head_count: integer(raw.staff_head_count),
    bank_deposits: money(raw.bank_deposits),
    bank_debits: money(raw.bank_debits),
  };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function money(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown) {
  const parsed = money(value);
  return parsed == null ? null : Math.round(parsed);
}

function toDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function upsertLocation(name: string) {
  const { data, error } = await supabase
    .from("locations")
    .upsert({ name }, { onConflict: "name" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function hashRow(row: SheetRow) {
  const encoded = new TextEncoder().encode(JSON.stringify(row));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    },
  });
}
