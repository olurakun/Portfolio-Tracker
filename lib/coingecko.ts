import { cached } from "./ttlCache";

/**
 * CoinGecko — kripto fiyatları için hazırlanan ama HENÜZ BAĞLANMAMIŞ kaynak.
 *
 * Şu an kripto fiyatları Yahoo Finance'ten geliyor (app/api/price/route.ts,
 * "BTC-USD" gibi Yahoo pariteleri). Yahoo'nun burada da bilinen sorunu
 * geçerli: resmî API'si ve ticari lisansı yok. CoinGecko amaca özel ve
 * lisansı açık — resmi kullanım şartlarına (coingecko.com/en/api_terms) göre:
 *
 *   - Ticari ürüne entegre etmek SERBEST (API erişimini yeniden satmak değil).
 *   - Atıf ZORUNLU: "Powered by CoinGecko", en az 10 punto, marka kılavuzuna
 *     uygun — bağlanınca DataSources.tsx'e eklenmeli.
 *   - Önbellekleme öneriliyor, 24 saatte bir yenileme yeterli kabul ediliyor.
 *
 * Ücretsiz Demo plan (100 istek/dk, 10.000/ay) bir API anahtarı istiyor;
 * anahtar hesap açmayı gerektirdiği için kullanıcı tarafından alınmalı.
 * BAĞLANMADAN ÖNCE: TL fiyatı CoinGecko'dan `vs_currencies=try` ile doğrudan
 * geliyor — USD/TRY çevrimine gerek kalmıyor, bkz. coinGeckoQuote.
 *
 * Anahtar `.env.local`de COINGECKO_API_KEY olarak bekleniyor. Gelince bu
 * modül price/route.ts'e Yahoo'nun YANINA (üstüne değil) bağlanmalı — aynı
 * lib/twelvedata.ts'teki yedek deseni.
 */

const BASE_URL = 'https://api.coingecko.com/api/v3';
const QUOTE_TTL_MS = 15 * 60 * 1000;

export type CoinGeckoQuote = { priceTRY: number; priceUSD: number };

// Uygulamanın sembollerini (BTC, ETH...) CoinGecko'nun "coin id"lerine
// (bitcoin, ethereum...) çevirir. CoinGecko sembolle değil id'yle sorgulanıyor
// çünkü sembol tekil değil (birden fazla coin aynı sembolü paylaşabiliyor).
// Yalnızca uygulamanın arama sonuçlarında (Yahoo CRYPTOCURRENCY) fiilen
// çıkabilecek başlıca coin'ler listelendi; kapsam genişledikçe büyütülmeli.
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin',
  BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche-2',
  DOT: 'polkadot', LTC: 'litecoin', LINK: 'chainlink', MATIC: 'matic-network',
};

function apiKey(): string | null {
  const key = process.env.COINGECKO_API_KEY?.trim();
  return key ? key : null;
}

export function coinGeckoConfigured(): boolean {
  return apiKey() !== null;
}

function readQuote(payload: unknown, coinId: string): CoinGeckoQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const entry = (payload as Record<string, unknown>)[coinId];
  if (!entry || typeof entry !== 'object') return null;
  const priceTRY = Number((entry as Record<string, unknown>).try);
  const priceUSD = Number((entry as Record<string, unknown>).usd);
  if (!Number.isFinite(priceTRY) || !Number.isFinite(priceUSD) || priceTRY <= 0 || priceUSD <= 0) return null;
  return { priceTRY, priceUSD };
}

/** Güncel fiyat, TL ve USD birlikte (kur çevrimi gerekmiyor). Bulunamazsa `null`. */
export async function coinGeckoQuote(symbol: string): Promise<CoinGeckoQuote | null> {
  const key = apiKey();
  const coinId = COIN_IDS[symbol.toUpperCase()];
  if (!key || !coinId) return null;
  return cached(
    `cg:quote:${coinId}`,
    QUOTE_TTL_MS,
    async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/simple/price?ids=${coinId}&vs_currencies=try,usd&x_cg_demo_api_key=${encodeURIComponent(key)}`,
          { cache: 'no-store' },
        );
        return readQuote(await res.json(), coinId);
      } catch {
        return null;
      }
    },
    q => q !== null,
  );
}
