"use client";

import type { ShareRow, ShareSnapshot } from "../../lib/shares";

const TYPE_LABEL: Record<string, string> = {
  stock: 'Hisse', fund: 'Fon', currency: 'Döviz', metal: 'Maden',
};
const TYPE_BADGE_CLASS: Record<string, string> = {
  stock: 'text-sky-300/90', fund: 'text-indigo-300/90', currency: 'text-teal-300/90', metal: 'text-amber-300/90',
};

const tl = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const usd = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const plColor = (n: number) => (n >= 0 ? 'text-green-400' : 'text-red-400');

/** Bu satırın hangi sütunlarla oluşturulduğu — snapshot'taki İLK satırdan çıkarılır. */
function visibleColumns(rows: ShareRow[]) {
  const sample = rows[0] ?? {};
  return {
    quantity: 'quantity' in sample,
    price: 'price' in sample,
    value: 'value' in sample,
    share: 'share' in sample,
    unrealizedPL: 'unrealizedPL' in sample,
    realizedPL: 'realizedPL' in sample,
  };
}

/**
 * Paylaşılan portföyün salt-okunur görünümü. Girdi zaten filtrelenmiş ve
 * sütunları budanmış bir ANLIK GÖRÜNTÜdür (lib/shares.ts) — bu bileşen ek
 * bir gizleme mantığı uygulamaz, yalnızca gelen veriyi çizer.
 */
export default function ShareView({ title, snapshot, updatedAt }: {
  title: string | null;
  snapshot: ShareSnapshot;
  updatedAt: string;
}) {
  const cols = visibleColumns(snapshot.rows);
  const colCount = 2 + Object.values(cols).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 sm:p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="text-xs text-orange-400 uppercase tracking-wide font-semibold mb-1">
            Paylaşılan Portföy
          </div>
          <h1 className="text-2xl font-bold">{title || 'Adsız paylaşım'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(updatedAt).toLocaleString('tr-TR')} tarihinde paylaşıldı — canlı değil, anlık görüntüdür.
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[560px]">
              <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2.5">Sembol</th>
                  {cols.quantity && <th className="px-3 py-2.5 text-right">Adet</th>}
                  {cols.price && <th className="px-3 py-2.5 text-right">Fiyat</th>}
                  {cols.value && <th className="px-3 py-2.5 text-right">Değer</th>}
                  {cols.share && <th className="px-3 py-2.5 text-right">Pay</th>}
                  {cols.unrealizedPL && <th className="px-3 py-2.5 text-right">Anlık K/Z</th>}
                  {cols.realizedPL && <th className="px-3 py-2.5 text-right">Realize K/Z</th>}
                </tr>
              </thead>
              <tbody className="text-sm">
                {snapshot.rows.map((r, i) => (
                  <tr key={`${r.symbol}-${i}`} className="border-b border-gray-700/60">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{r.symbol}</span>
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-gray-900/70 border border-gray-700 ${TYPE_BADGE_CLASS[r.type] ?? ''}`}>
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                      </div>
                    </td>
                    {cols.quantity && (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.quantity!.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}
                      </td>
                    )}
                    {cols.price && (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div>{tl(r.price!)}</div>
                        <div className="text-[11px] text-gray-500">{usd(r.priceUSD!)}</div>
                      </td>
                    )}
                    {cols.value && (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div className="font-bold">{tl(r.value!)}</div>
                        <div className="text-[11px] text-gray-500">{usd(r.valueUSD!)}</div>
                      </td>
                    )}
                    {cols.share && (
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">%{r.share!.toFixed(1)}</td>
                    )}
                    {cols.unrealizedPL && (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div className={`font-bold ${plColor(r.unrealizedPL!)}`}>{tl(r.unrealizedPL!)}</div>
                        <div className="text-[11px] text-gray-500">{usd(r.unrealizedPLUSD!)}</div>
                      </td>
                    )}
                    {cols.realizedPL && (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div className={`font-bold ${plColor(r.realizedPL!)}`}>{tl(r.realizedPL!)}</div>
                        <div className="text-[11px] text-gray-500">{usd(r.realizedPLUSD!)}</div>
                      </td>
                    )}
                  </tr>
                ))}
                {snapshot.rows.length === 0 && (
                  <tr><td colSpan={colCount} className="px-3 py-10 text-center text-gray-500">
                    Bu paylaşımda gösterilecek varlık yok.
                  </td></tr>
                )}
                {snapshot.rows.length > 0 && cols.value && (
                  <tr className="bg-gray-900/40 border-t-2 border-gray-600">
                    <td className="px-3 py-3 font-bold" colSpan={1 + (cols.quantity ? 1 : 0) + (cols.price ? 1 : 0)}>
                      TOPLAM
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold tabular-nums">{tl(snapshot.totals.value!)}</div>
                      <div className="text-[11px] text-gray-500 tabular-nums">{usd(snapshot.totals.valueUSD!)}</div>
                    </td>
                    {cols.share && <td className="px-3 py-3 text-right text-gray-400 tabular-nums">%100</td>}
                    {cols.unrealizedPL && (
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${plColor(snapshot.totals.unrealizedPL!)}`}>
                        {tl(snapshot.totals.unrealizedPL!)}
                      </td>
                    )}
                    {cols.realizedPL && (
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${plColor(snapshot.totals.realizedPL!)}`}>
                        {tl(snapshot.totals.realizedPL!)}
                      </td>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-600 mt-6 text-center">Portföy Takip ile paylaşıldı.</p>
      </div>
    </div>
  );
}
