-- ============================================================
-- Zamanlanmış iş çalışma kaydı.
--
-- NEDEN: 23 Ağustos 22:00 çalışmasında 83 sembolden yalnızca 2'si
-- yazıldı ve BUNU KİMSE GÖRMEDİ — kullanıcı fiyatlar bayat görününce
-- fark etti, sebebi ancak price_quotes'taki zaman damgalarını elle
-- karşılaştırarak bulabildik. İş zaten {symbols, written, failed}
-- döndürüyordu ama cevap hiçbir yere yazılmıyordu.
--
-- Bu tablo o cevabı kalıcı hale getiriyor: her çalışma bir satır.
-- ============================================================

create table if not exists cron_runs (
  id          bigint generated always as identity primary key,
  job         text        not null,
  ran_at      timestamptz not null default now(),
  duration_ms integer,
  symbols     integer     not null default 0,
  written     integer     not null default 0,
  failed      text[]      not null default '{}',
  error       text
);

-- En son çalışmaları hızlı sorgulamak için.
create index if not exists cron_runs_job_ran_at_idx on cron_runs (job, ran_at desc);

alter table cron_runs enable row level security;

-- Okuma açık: içerik sembol adları ve sayaçlardan ibaret; sembol listesi
-- zaten tracked_symbols görünümüyle herkese açık, yeni bir bilgi sızmıyor.
-- Kimin hangi varlığa sahip olduğu BURADA DA YOK.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cron_runs' and policyname = 'cron_runs okuma'
  ) then
    create policy "cron_runs okuma" on cron_runs
      for select to anon, authenticated using (true);
  end if;
end $$;

-- Yazma politikası bilerek YOK: yalnızca service_role yazar (RLS'i atlar),
-- tıpkı price_quotes gibi. Anon'a yazma açılsaydı sahte kayıt eklenebilirdi.

-- Kontrol.
select 'cron_runs' as tablo, count(*)::text as satir from cron_runs;
