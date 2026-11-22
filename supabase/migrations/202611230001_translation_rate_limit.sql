begin;

create table if not exists public.n5_translation_usage_v1 (
  account uuid not null,
  usage_day date not null,
  used integer not null default 0,
  last_at timestamptz,
  recent jsonb not null default '{}'::jsonb,
  primary key (account, usage_day)
);

alter table public.n5_translation_usage_v1 enable row level security;
revoke all on public.n5_translation_usage_v1 from public, anon, authenticated;

create or replace function public.n5_claim_translation_v1(account uuid, signature text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_utc date := (pg_catalog.now() at time zone 'UTC')::date;
  moment timestamptz;
  current_row public.n5_translation_usage_v1%rowtype;
begin
  if account is null or signature is null or signature !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  insert into public.n5_translation_usage_v1(account, usage_day)
    values (n5_claim_translation_v1.account, day_utc) on conflict on constraint n5_translation_usage_v1_pkey do nothing;
  select * into strict current_row from public.n5_translation_usage_v1 as usage
    where usage.account = n5_claim_translation_v1.account and usage.usage_day = day_utc for update;
  moment := pg_catalog.clock_timestamp();
  if (current_row.recent ->> signature)::timestamptz > moment - interval '45 seconds' then
    return 'duplicate';
  end if;
  if current_row.used >= 30 or current_row.last_at > moment - interval '5 seconds' then
    return 'limited';
  end if;
  update public.n5_translation_usage_v1 as usage
    set used = usage.used + 1, last_at = moment,
        recent = usage.recent || pg_catalog.jsonb_build_object(signature, moment)
    where usage.account = n5_claim_translation_v1.account and usage.usage_day = day_utc;
  return 'accepted';
end;
$$;

revoke all on function public.n5_claim_translation_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.n5_claim_translation_v1(uuid,text) to service_role;

commit;
