create table if not exists openai_request_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  estimated_cost_usd numeric(10, 6) not null default 0,
  status text not null,
  error_text text,
  openai_response_id text,
  tags jsonb not null default '{}'::jsonb
);

create index if not exists idx_openai_request_log_created_at
  on openai_request_log (created_at desc);

create index if not exists idx_openai_request_log_model
  on openai_request_log (model);

create index if not exists idx_openai_request_log_status
  on openai_request_log (status);

create index if not exists idx_openai_request_log_tags_gin
  on openai_request_log using gin (tags);

