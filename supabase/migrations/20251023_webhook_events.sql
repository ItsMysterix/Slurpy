-- 20251023_webhook_events.sql
-- Storage for webhook idempotency and customer mapping

create table if not exists webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table if not exists billing_customers (
  user_id text primary key,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_customer_by_stripe on billing_customers(stripe_customer_id);
