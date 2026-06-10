create extension if not exists pgcrypto;

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  sheet_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  rows_seen int not null default 0,
  rows_changed int not null default 0,
  rows_skipped int not null default 0,
  error_message text
);

create table if not exists sheet_row_staging (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references sheet_sync_runs(id) on delete set null,
  source_row_number int not null,
  row_hash text not null,
  raw_row jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists financial_actuals (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  period_month date not null,
  revenue numeric(14,2),
  cost_of_service numeric(14,2),
  total_expense numeric(14,2),
  supplies numeric(14,2),
  lab_fee numeric(14,2),
  utilities numeric(14,2),
  rent numeric(14,2),
  employee_payroll numeric(14,2),
  doctor_payroll numeric(14,2),
  staff_head_count int,
  bank_deposits numeric(14,2),
  bank_debits numeric(14,2),
  source_spreadsheet_id text not null,
  source_sheet_name text not null,
  source_row_number int,
  row_hash text not null,
  synced_at timestamptz not null default now(),
  unique (location_id, period_month)
);

create or replace view v_financial_actuals as
select
  fa.id,
  fa.period_month,
  l.name as location_name,
  fa.revenue,
  fa.cost_of_service,
  fa.total_expense,
  fa.supplies,
  fa.lab_fee,
  fa.utilities,
  fa.rent,
  fa.employee_payroll,
  fa.doctor_payroll,
  fa.staff_head_count,
  fa.bank_deposits,
  fa.bank_debits,
  fa.source_spreadsheet_id,
  fa.source_sheet_name,
  fa.source_row_number,
  fa.synced_at,
  coalesce(fa.revenue, 0) - coalesce(fa.cost_of_service, 0) as gross_profit,
  coalesce(fa.revenue, 0) - coalesce(fa.cost_of_service, 0) - coalesce(fa.total_expense, 0) as net_profit,
  coalesce(fa.employee_payroll, 0) + coalesce(fa.doctor_payroll, 0) as payroll_total,
  coalesce(fa.bank_deposits, 0) - coalesce(fa.revenue, 0) as bank_variance,
  case when fa.revenue = 0 then null else (fa.revenue - coalesce(fa.cost_of_service, 0)) / fa.revenue end as gross_profit_pct,
  case when fa.revenue = 0 then null else (fa.revenue - coalesce(fa.cost_of_service, 0) - coalesce(fa.total_expense, 0)) / fa.revenue end as net_profit_pct,
  case when fa.revenue = 0 then null else fa.total_expense / fa.revenue end as total_expense_pct,
  case when fa.revenue = 0 then null else fa.cost_of_service / fa.revenue end as cos_pct
from financial_actuals fa
join locations l on l.id = fa.location_id;

create index if not exists financial_actuals_period_month_idx on financial_actuals (period_month);
create index if not exists financial_actuals_location_period_idx on financial_actuals (location_id, period_month);
create index if not exists sheet_sync_runs_started_at_idx on sheet_sync_runs (started_at desc);

grant usage on schema public to anon, authenticated;
grant select on v_financial_actuals to anon, authenticated;
