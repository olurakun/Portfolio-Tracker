-- ============================================================
-- Zamanlanmış fiyat yenileme — pg_cron + pg_net kurulumu
--
-- Bu SQL, her gece Supabase Edge Function'ı (supabase/functions/refresh-prices)
-- tetikleyen bir cron işi kurar. Fonksiyon tracked_symbols görünümündeki her
-- sembolü çekip price_quotes'a yazıyor; app/api/price bu tablodan okuyor.
--
-- Uygulama henüz hiçbir yerde (Vercel dahil) deploy edilmediği için hedef
-- Supabase Edge Function — kendi kendine yeten, Vercel'e bağımlı değil.
-- ============================================================

-- 1) Uzantıları AÇ: Database > Extensions panelinden pg_cron ve pg_net.
--    NOT: pg_cron'un extnamespace'i her zaman "pg_catalog" görünür — bu
--    NORMAL, extension'ın kendi control dosyası öyle sabitliyor. Asıl
--    kontrol edilmesi gereken cron.job TABLOSUNUN var olup olmadığı,
--    extnamespace değil (bkz. 2. adım).
select extname, extnamespace::regnamespace as schema
from pg_extension
where extname in ('pg_cron', 'pg_net');

-- 2) cron şeması gerçekten kurulmuş mu. Bu 0 satır dönerse (uzantı panelden
--    açık görünse bile "appears active but not properly configured" durumu
--    olabilir) Database > Extensions'ta pg_cron'u kapatıp tekrar açın.
select 1 from information_schema.tables where table_schema = 'cron' and table_name = 'job';

-- 3) Proje URL'i ve service_role anahtarı Vault'a. Zaten oluşturduysanız bu
--    iki satır "already exists" hatası verir — SORUN DEĞİL, atlayıp devam edin.
select vault.create_secret('BURAYA_PROJE_URLINI_YAZ', 'refresh_prices_project_url');
select vault.create_secret('BURAYA_SERVICE_ROLE_ANAHTARINI_YAZ', 'refresh_prices_service_key');

-- 4) Zamanlanmış iş. Saat UTC: 08:00 UTC = 11:00 İstanbul.
--
--    ÖNCEDEN 22:00 UTC (01:00 İstanbul) İDİ, DEĞİŞTİRİLDİ (2026-08-24).
--    İki sebep:
--    (a) TEFAS gün sonu NAV'ını gece geç yayımlıyor; 01:00'de bazı fonların
--        fiyatı henüz düşmemiş oluyordu (kullanıcı gözlemi).
--    (b) ÖLÇÜLDÜ: 23 Ağustos 22:00 çalışmasında 83 kaydın YALNIZCA 2'si
--        yazıldı (sadece kripto). Hisse/fon/maden/döviz toptan başarısız.
--        Kripto tek başına başarılı çünkü CoinGecko TL fiyatını doğrudan
--        veriyor; diğer kaynaklar (TEFAS, Yahoo, Frankfurter) o saatte
--        cevap vermemiş. Aynı fonksiyon gündüz elle çalıştırıldığında
--        81/82 başarılı olmuştu.
--
--    Gündüze almak tazelikten ÖDÜN VERDİRMİYOR: BIST 15:10 UTC'de, ABD
--    ~21:00 UTC'de kapanıyor; 08:00 UTC'de çalışan iş her ikisinin de BİR
--    ÖNCEKİ kapanışını alıyor — 22:00'de çalışan iş de aynısını alıyordu,
--    çünkü kullanıcı zaten ertesi gün bakıyor. Kazanç TEFAS tarafında net.
--
--    unschedule+schedule tekrar çalıştırılabilir kılıyor.
select cron.unschedule('refresh-prices-daily')
where exists (select 1 from cron.job where jobname = 'refresh-prices-daily');

select cron.schedule(
  'refresh-prices-daily',
  '0 8 * * *',
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

-- 5) Kontrol: bir satır dönmeli, active = true.
select jobname, schedule, active from cron.job where jobname = 'refresh-prices-daily';

-- ============================================================
-- DOĞRULANDI (2026-08-23): fonksiyon elle tetiklendi, 82 semboldün 81'i
-- price_quotes'a yazıldı (tek başarısız: OFSYM.HE, Yahoo'da delisted —
-- kullanıcının varlık listesindeki geçersiz bir sembol, kurulumla ilgisiz).
-- cron.job.active = true. Bir sonraki otomatik çalışma 22:00 UTC'de.
--
-- Vercel'e deploy edildiğinde: pg_cron'un hedefini bu Edge Function'dan
-- Next.js'in /api/cron/refresh-prices rotasına çevirin (aynı mantık orada
-- da var, iki paralel zamanlayıcıya gerek yok) — url'i ve apikey header'ını
-- CRON_SECRET tabanlı Authorization: Bearer'a çevirmek yeterli.
-- ============================================================
