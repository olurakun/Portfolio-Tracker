"use client";

export type SummaryMode = 'live' | 'historical' | 'virtual';

const tl = (n: number, digits = 2) =>
  `${n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₺`;
const usd = (n: number) =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const signed = (n: number) => (n >= 0 ? '+' : '') + tl(n);
const plColor = (n: number) => (n >= 0 ? 'text-green-400' : 'text-red-400');

/**
 * Üst özet şeridi.
 *
 * Önceki hâlde uygulamanın en önemli rakamı (toplam değer + K/Z) sağ üstte
 * sıkışık bir kutuda beş satır küçük metin hâlinde duruyordu; solundaki
 * genişliğin ~%60'ı boştu. Artık tam genişlikte, tek bir tipografik hiyerarşi
 * içinde: baskın toplam değer, yanında eşit ağırlıklı K/Z hücreleri.
 *
 * Renk kuralı: yeşil/kırmızı YALNIZCA kâr/zarar demek. Mod göstergeleri
 * (geçmiş tarih = amber, sanal = camgöbeği) çerçeveden okunuyor, rakam
 * renginden değil.
 */
export default function SummaryBar({
  totalValue, totalValueUSD, totalUnrealizedPL, totalRealizedPL, totalPLUSD,
  mode, modeLabel, loading = false,
}: {
  totalValue: number;
  totalValueUSD: number;
  totalUnrealizedPL: number;
  totalRealizedPL: number;
  totalPLUSD: number;
  mode: SummaryMode;
  /** Geçmiş tarih ya da senaryo adı — 'live' modda kullanılmaz. */
  modeLabel?: string;
  loading?: boolean;
}) {
  const totalPL = totalUnrealizedPL + totalRealizedPL;

  // Anlık getiri oranı, açık pozisyonların maliyetine göre. Maliyet sıfır ya da
  // negatifse (her şey satılmış, yalnızca realize K/Z var) oran anlamsız olur.
  const costBasis = totalValue - totalUnrealizedPL;
  const returnPct = costBasis > 0 ? (totalUnrealizedPL / costBasis) * 100 : null;

  const frame =
    mode === 'virtual' ? 'bg-cyan-950/25 border-dashed border-cyan-700/50'
    : mode === 'historical' ? 'bg-amber-950/25 border-amber-700/50'
    : 'bg-gray-800/60 border-gray-700';

  const heading =
    mode === 'virtual' ? `${modeLabel} · senaryo değeri`
    : mode === 'historical' ? `${modeLabel} tarihindeki değer`
    : 'Toplam değer';

  return (
    <div className={`rounded-xl border ${frame} px-5 py-4 sm:px-6 sm:py-5`}>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">{heading}</div>
          <div className="text-3xl sm:text-4xl font-bold tabular-nums leading-none">
            {loading ? <span className="text-gray-600">…</span> : tl(totalValue)}
          </div>
          <div className="text-sm text-gray-500 tabular-nums mt-1.5">≈ {usd(totalValueUSD)}</div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Toplam K/Z</div>
          <div className={`text-xl font-semibold tabular-nums ${plColor(totalPL)}`}>{signed(totalPL)}</div>
          {returnPct !== null && (
            <div className="text-xs text-gray-500 tabular-nums mt-1">
              maliyete göre{' '}
              <span className={plColor(returnPct)}>
                {returnPct >= 0 ? '+' : ''}%{Math.abs(returnPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] uppercase tracking-widest text-gray-500">Anlık</span>
            <span className={`text-sm font-semibold tabular-nums ${plColor(totalUnrealizedPL)}`}>
              {signed(totalUnrealizedPL)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] uppercase tracking-widest text-gray-500">Realize</span>
            <span className={`text-sm font-semibold tabular-nums ${plColor(totalRealizedPL)}`}>
              {signed(totalRealizedPL)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-gray-700/70">
            <span className="text-[11px] uppercase tracking-widest text-gray-500" title="Kur etkisi hariç">
              USD bazlı
            </span>
            <span className={`text-sm font-semibold tabular-nums ${plColor(totalPLUSD)}`}>
              {totalPLUSD >= 0 ? '+' : ''}{usd(totalPLUSD)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
