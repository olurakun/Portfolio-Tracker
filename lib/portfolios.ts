// Gerçek portföy ve sanal (senaryo) portföyler.
//
// "Şunu almış olsaydım ne kazanırdım" sorusunu cevaplamak için işlemler bir
// portföy adıyla etiketleniyor. Boş/`null` olanlar GERÇEK portföydür — mevcut
// tüm kayıtlar böyle, dolayısıyla migration'da hiçbir satıra dokunulmadı.
//
// Ad metin olarak tutuluyor (boolean değil) ki ileride birden fazla senaryo
// (ör. "NVDA senaryosu", "altın yerine hisse") ikinci bir şema değişikliği
// gerektirmesin.

import { fold } from './turkish';

export const REAL = '';
export const REAL_LABEL = 'Gerçek';
/** Tek senaryoyla başlıyoruz; adı sabit ama şema birden fazlasına açık. */
export const DEFAULT_SCENARIO = 'Sanal';

type HasPortfolio = { portfolio?: string | null };

export function normalizePortfolio(value: unknown): string {
  if (typeof value !== 'string') return REAL;
  return value.trim().replace(/\s+/g, ' ');
}

/** Eşleştirme anahtarı — Türkçe küçültme yerine ASCII katlama (bkz. lib/turkish.ts). */
export function portfolioKey(value: unknown): string {
  return fold(normalizePortfolio(value));
}

export function isReal(value: unknown): boolean {
  return normalizePortfolio(value) === REAL;
}

/**
 * Bir portföye ait işlemler.
 *
 * GERÇEK portföy istendiğinde sanal işlemler KESİNLİKLE dışarıda kalmalı:
 * sızarlarsa kullanıcının asıl kâr/zararı sessizce yanlış olur ve bu, sanal
 * portföy özelliğinin tek gerçek riski.
 */
export function filterByPortfolio<T extends HasPortfolio>(rows: T[], portfolio: string): T[] {
  const wanted = portfolioKey(portfolio);
  return rows.filter(row => portfolioKey(row.portfolio) === wanted);
}

/** İşlemlerde geçen senaryo adları (gerçek portföy hariç), Türkçe sıralı. */
export function scenariosOf(rows: HasPortfolio[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const name = normalizePortfolio(row.portfolio);
    if (!name) continue;
    const key = portfolioKey(name);
    if (!byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'tr'));
}

export function portfolioLabel(portfolio: string): string {
  return normalizePortfolio(portfolio) || REAL_LABEL;
}

type TxLike = {
  asset_id: string | number;
  type: string;
  quantity: number | string;
  price: number | string;
  date: string;
  currency?: string | null;
  broker?: string | null;
  portfolio?: string | null;
};

/**
 * Gerçek portföyün bir senaryoya kopyalanacak hâli — id/user_id hariç, DB
 * bunları kendisi atıyor. Girdi gerçek olmayan bir satır içerse (çağıran
 * yanlışlıkla filtrelenmemiş tüm işlemleri verirse) o satır SESSİZCE
 * ATLANIYOR: bu fonksiyonun tek görevi gerçek portföyü kopyalamak, sanal
 * bir senaryonun başka bir senaryoya sızmasına asla izin vermemeli — bkz.
 * dosya başındaki "tek gerçek risk" notu.
 */
export function buildScenarioCopy(realTransactions: TxLike[], targetPortfolio: string) {
  const portfolio = normalizePortfolio(targetPortfolio);
  return realTransactions
    .filter(tx => isReal(tx.portfolio))
    .map(tx => ({
      asset_id: tx.asset_id,
      type: tx.type,
      quantity: tx.quantity,
      price: tx.price,
      date: tx.date,
      currency: tx.currency ?? null,
      broker: tx.broker ?? null,
      portfolio,
    }));
}
