const SYNC_WEBHOOK_URL_PROPERTY = "SUPABASE_SYNC_WEBHOOK_URL";
const SYNC_WEBHOOK_SECRET_PROPERTY = "SUPABASE_SYNC_WEBHOOK_SECRET";

function runManualSync() {
  callSyncWebhook_("manual");
}

function onAccountingSheetEdit(e) {
  callSyncWebhook_("edit");
}

function onAccountingSheetChange(e) {
  callSyncWebhook_("change");
}

function callSyncWebhook_(reason) {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty(SYNC_WEBHOOK_URL_PROPERTY);
  const secret = properties.getProperty(SYNC_WEBHOOK_SECRET_PROPERTY);

  if (!url) {
    throw new Error("Missing SUPABASE_SYNC_WEBHOOK_URL script property.");
  }

  const payload = {
    reason,
    spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
    sheetName: SpreadsheetApp.getActiveSheet().getName(),
    triggeredAt: new Date().toISOString(),
  };

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: secret ? { "x-sync-secret": secret } : {},
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Sync webhook failed with status ${status}: ${response.getContentText()}`);
  }
}

function createInstallableTriggers() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("onAccountingSheetEdit").forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger("onAccountingSheetChange").forSpreadsheet(spreadsheet).onChange().create();
}
