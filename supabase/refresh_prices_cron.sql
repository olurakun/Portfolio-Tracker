-- ============================================================
-- ADIM 3 — DÜZELTİLMİŞ SÜRÜM
-- Önce Database > Extensions panelinden pg_cron ve pg_net'i AÇ,
-- sonra bu dosyayı çalıştır. Bu sürüm ilk denemede olan hatayı
-- düzeltiyor: pg_cron'u pg_catalog'a kurmaya zorlayan satır kaldırıldı
-- (uzantı zaten panelden kendi doğru şemasına kuruluyor).
-- ============================================================

-- 1) Kontrol: uzantılar gerçekten açık mı.
select extname, extnamespace::regnamespace as schema
from pg_extension
where extname in ('pg_cron', 'pg_net');
-- Bu sorgu 2 satır dönmüyorsa DURUN, önce panelden açın.

-- 2) Proje URL'i ve service_role anahtarı. Zaten oluşturduysan bu iki satır
--    hata verir ("secret already exists") — SORUN DEĞİL, atlayıp devam edin.
select vault.create_secret('BURAYA_PROJE_URLINI_YAZ', 'refresh_prices_project_url');
select vault.create_secret('BURAYA_SERVICE_ROLE_ANAHTARINI_YAZ', 'refresh_prices_service_key');

-- 3) Zamanlanmış iş. Saat UTC: 22:00 UTC = 01:00 İstanbul.
select cron.unschedule('refresh-prices-daily')
where exists (select 1 from cron.job where jobname = 'refresh-prices-daily');

select cron.schedule(
  'refresh-prices-daily',
  '0 22 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_prices_project_url')
           || '/functions/v1/refresh-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_prices_service_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 4) Kontrol.
select jobname, schedule, active from cron.job where jobname = 'refresh-prices-daily';
