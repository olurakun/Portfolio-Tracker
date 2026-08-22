"use client";

import type { SortKey, SortDir } from "../../lib/sortPositions";

export type PortfolioRow = {
  id: string;
  symbol: string;
  type: string;
  totalQty: number;
  currentPrice: number;
  currentPriceUSD: number;
  value: number;
  valueUSD: number;
  unrealizedPL: number;
  realizedPL: number;
  unrealizedPLUSD: number;
  realizedPLUSD: number;
};

// Varlık tipi rozetleri: THYAO ile TLY ile XAU aynı satırda ayırt edilemiyordu.
// Renkler kasten düşük doygunlukta — yeşil/kırmızı kâr-zarar anlamı taşıdığı,
// mor da vurgu rengi olduğu için tabloda onlarla yarışmamalı.
const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  stock:    { label: 'Hisse', className: 'text-sky-300/90' },
  fund:     { label: 'Fon',   className: 'text-indigo-300/90' },
  currency: { label: 'Döviz', className: 'text-teal-300/90' },
  metal:    { label: 'Maden', className: 'text-amber-300/90' },
};

const tl = (n: number, digits = 2) =>
  `${n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₺`;
const usd = (n: number) =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const plColor = (n: number) => (n >= 0 ? 'text-green-400' : 'text-red-400');

function TypeBadge({ type }: { type: string }) {
  const badge = TYPE_BADGE[type];
  if (!badge) return null;
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-gray-900/70 border border-gray-700 ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function SortHeader({
  label, sortKey, active, dir, onSort, align = 'right',
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = active === sortKey;
  return (
    <th className="p-0 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`w-full px-3 py-2.5 flex items-center gap-1 whitespace-nowrap transition-colors hover:text-white ${
          align === 'right' ? 'justify-end' : ''
        } ${isActive ? 'text-white' : ''}`}
      >
        {label}
        {/* Sıralanmayan sütunlarda ok soluk duruyor: tıklanabilir olduğu belli
            olsun ama aktif sütunla karışmasın. */}
        <span className={isActive ? 'text-purple-400' : 'text-gray-600'}>
          {isActive ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map(i => (
        <tr key={i} className="border-b border-gray-700/60">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(c => (
            <td key={c} className="px-3 py-3">
              <div className={`h-3 rounded bg-gray-700/60 animate-pulse ${c === 0 ? 'w-20' : 'w-14 ml-auto'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Dar ekranda tek bir pozisyon. Tablo 375px'de yalnızca ilk iki sütununu
 * gösterebiliyor; değer ve K/Z yatay kaydırmanın arkasında kalıyordu, yani
 * telefonda portföye bakmanın asıl sebebi görünmüyordu. Kartta hiyerarşi
 * yeniden kuruluyor: sembol, değer ve K/Z birlikte; adet ve fiyat ikincil.
 */
function PositionCard({
  item, share, isHistorical, onOpenTx,
}: {
  item: PortfolioRow;
  share: number;
  isHistorical: boolean;
  onOpenTx: (id: string, type: 'buy' | 'sell' | 'dividend') => void;
}) {
  return (
    <div className="border-b border-gray-700/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold">{item.symbol}</span>
          <TypeBadge type={item.type} />
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold tabular-nums whitespace-nowrap">{tl(item.value)}</div>
          <div className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">{usd(item.valueUSD)}</div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 mt-2">
        <div className="text-xs text-gray-500 tabular-nums min-w-0">
          {item.totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 6 })} × {tl(item.currentPrice)}
          <span className="text-gray-600"> · %{share.toFixed(1)}</span>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ${plColor(item.unrealizedPL)}`}>
            {item.unrealizedPL >= 0 ? '+' : ''}{tl(item.unrealizedPL)}
          </div>
          {item.realizedPL !== 0 && (
            <div className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
              realize <span className={plColor(item.realizedPL)}>
                {item.realizedPL >= 0 ? '+' : ''}{tl(item.realizedPL)}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isHistorical && (
        <div className="flex gap-1.5 mt-3">
          {([['buy', 'Al'], ['sell', 'Sat'], ['dividend', 'Temettü']] as const).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => onOpenTx(item.id, kind)}
              className="flex-1 py-1.5 rounded text-xs font-semibold bg-gray-700/70 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortfolioTable({
  openPositions, closedPositions, totals, isHistorical, asOfDate, loading,
  sortKey, sortDir, onSort, editingPriceIds, onToggleEditPrice, onPriceChange,
  onOpenTx, showClosed, onToggleClosed, onRefresh,
  onShare, shareDisabledReason,
}: {
  openPositions: PortfolioRow[];
  closedPositions: PortfolioRow[];
  totals: { value: number; valueUSD: number; unrealizedPL: number; realizedPL: number };
  isHistorical: boolean;
  asOfDate: string;
  loading: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  editingPriceIds: Set<string>;
  onToggleEditPrice: (id: string) => void;
  onPriceChange: (id: string, price: number) => void;
  onOpenTx: (id: string, type: 'buy' | 'sell' | 'dividend') => void;
  showClosed: boolean;
  onToggleClosed: () => void;
  onRefresh: () => void;
  /** Verilmezse paylaşım düğmesi hiç render edilmez. */
  onShare?: () => void;
  /** Doluysa düğme kapalıdır ve sebep title/aria-label olarak gösterilir
      (ör. sanal senaryo veya geçmiş tarih görünümündeyken paylaşım anlamsız). */
  shareDisabledReason?: string;
}) {
  // İlk yüklemede sıfırlarla dolu bir tablo göstermek yanlış bilgi vermek olur;
  // fiyatlar gelene kadar iskelet gösteriliyor.
  const showSkeleton = loading && openPositions.length === 0 && closedPositions.length === 0;
  const isEmpty = !showSkeleton && openPositions.length === 0 && closedPositions.length === 0;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="font-bold text-lg">Portföy</h2>
        <div className="flex items-center gap-1">
        {onShare && (
          <button
            onClick={onShare}
            disabled={!!shareDisabledReason}
            title={shareDisabledReason || "Portföyü paylaş"}
            aria-label={shareDisabledReason || "Portföyü paylaş"}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Fiyatları yenile"
          aria-label="Fiyatları yenile"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:hover:bg-transparent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
        </div>
      </div>

      {/* Boş durum tablonun DIŞINDA: tablo min-w-[900px] olduğu için dar
          ekranda ortalanan mesaj görüntünün dışında kalıyordu. */}
      {isEmpty && (
        <div className="px-6 py-14 text-center">
          <div className="text-gray-400">
            {isHistorical ? `${asOfDate} tarihinde açık pozisyon yok.` : 'Henüz açık pozisyon yok.'}
          </div>
          {!isHistorical && (
            <div className="text-sm text-gray-500 mt-1">
              Varlık ekleyerek ya da bir işlem dosyası aktararak başlayabilirsin.
            </div>
          )}
        </div>
      )}

      {/* DAR EKRAN: tablo yerine kart listesi. Tablo 375px'de sekiz sütunu
          taşıyamıyor; yatay kaydırma teknik olarak çalışsa da değer ve K/Z
          görünmediği için portföye bakmanın anlamı kalmıyordu. */}
      {!isEmpty && !showSkeleton && (
        <div className="md:hidden">
          {openPositions.map(item => (
            <PositionCard
              key={item.id}
              item={item}
              share={totals.value > 0 ? (item.value / totals.value) * 100 : 0}
              isHistorical={isHistorical}
              onOpenTx={onOpenTx}
            />
          ))}

          {openPositions.length > 0 && (
            <div className="flex items-baseline justify-between px-4 py-3 bg-gray-900/40 border-t-2 border-gray-600">
              <span className="font-bold">TOPLAM</span>
              <div className="text-right shrink-0">
                <div className="font-bold tabular-nums whitespace-nowrap">{tl(totals.value)}</div>
                <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ${plColor(totals.unrealizedPL)}`}>
                  {totals.unrealizedPL >= 0 ? '+' : ''}{tl(totals.unrealizedPL)}
                </div>
              </div>
            </div>
          )}

          {closedPositions.length > 0 && (
            <button
              onClick={onToggleClosed}
              className="w-full text-left px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-gray-700/30 transition-colors"
            >
              {showClosed ? '▾' : '▸'} Geçmiş pozisyonlar ({closedPositions.length})
            </button>
          )}
          {showClosed && closedPositions.map(item => (
            <div key={item.id} className="border-b border-gray-700/60 px-4 py-3 flex items-center justify-between gap-3 text-gray-400">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold">{item.symbol}</span>
                <TypeBadge type={item.type} />
              </div>
              <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ${plColor(item.realizedPL)}`}>
                {item.realizedPL >= 0 ? '+' : ''}{tl(item.realizedPL)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GENİŞ EKRAN: tam tablo. Yine de yatay kaydırılabilir (tablet ve dar
          pencerelerde sekiz sütun sığmayabiliyor), başlık satırı yapışkan. */}
      <div className={`hidden md:block overflow-x-auto rounded-b-xl ${isEmpty ? 'md:hidden' : ''}`}>
        <table className="w-full text-left min-w-[900px]">
          <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <SortHeader label="Sembol" sortKey="symbol" active={sortKey} dir={sortDir} onSort={onSort} align="left" />
              <SortHeader label="Adet" sortKey="totalQty" active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label={isHistorical ? 'O Günkü Fiyat' : 'Güncel Fiyat'} sortKey="currentPrice" active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Değer" sortKey="value" active={sortKey} dir={sortDir} onSort={onSort} />
              {/* Pay, Değer'in portföye oranı — ayrı bir sıralama anahtarı olmaz. */}
              <th className="px-3 py-2.5 text-right font-medium">Pay</th>
              <SortHeader label="Anlık K/Z" sortKey="unrealizedPL" active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Realize K/Z" sortKey="realizedPL" active={sortKey} dir={sortDir} onSort={onSort} />
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {showSkeleton && <SkeletonRows />}

            {!showSkeleton && openPositions.map((item) => {
              const share = totals.value > 0 ? (item.value / totals.value) * 100 : 0;
              return (
                <tr key={item.id} className="border-b border-gray-700/60 hover:bg-gray-700/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{item.symbol}</span>
                      <TypeBadge type={item.type} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {item.totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {editingPriceIds.has(item.id) ? (
                      <input
                        type="number"
                        autoFocus
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-28 text-right tabular-nums"
                        value={item.currentPrice}
                        onChange={(e) => onPriceChange(item.id, parseFloat(e.target.value) || 0)}
                        onBlur={() => onToggleEditPrice(item.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onToggleEditPrice(item.id); }}
                      />
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="tabular-nums">{tl(item.currentPrice)}</span>
                        {!isHistorical && (
                          <button type="button" onClick={() => onToggleEditPrice(item.id)}
                            title="Elle düzenle"
                            className="text-gray-600 hover:text-white text-xs">✎</button>
                        )}
                      </div>
                    )}
                    <div className="text-[11px] text-gray-500 tabular-nums">{usd(item.currentPriceUSD)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="font-bold tabular-nums">{tl(item.value)}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums">{usd(item.valueUSD)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="tabular-nums text-gray-300">
                      {totals.value > 0 ? `%${share.toFixed(1)}` : '—'}
                    </div>
                    <div className="mt-1 h-1 w-14 ml-auto bg-gray-700 rounded overflow-hidden">
                      <div className="h-full bg-purple-500/80" style={{ width: `${share}%` }} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className={`font-bold tabular-nums ${plColor(item.unrealizedPL)}`}>{tl(item.unrealizedPL)}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums">{usd(item.unrealizedPLUSD)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className={`font-bold tabular-nums ${plColor(item.realizedPL)}`}>{tl(item.realizedPL)}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums">{usd(item.realizedPLUSD)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {!isHistorical && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => onOpenTx(item.id, 'buy')} title={`${item.symbol} al`}
                          className="px-2 py-1 rounded text-xs font-semibold bg-gray-700/70 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Al</button>
                        <button onClick={() => onOpenTx(item.id, 'sell')} title={`${item.symbol} sat`}
                          className="px-2 py-1 rounded text-xs font-semibold bg-gray-700/70 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Sat</button>
                        <button onClick={() => onOpenTx(item.id, 'dividend')} title={`${item.symbol} temettü gir`}
                          className="px-2 py-1 rounded text-xs font-semibold bg-gray-700/70 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">₺</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Kapanmış pozisyon varken açık pozisyon yoksa tablo yine çizilir. */}
            {!showSkeleton && !isEmpty && openPositions.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                {isHistorical ? `${asOfDate} tarihinde açık pozisyon yok.` : 'Açık pozisyon yok.'}
              </td></tr>
            )}

            {/* Hiç pozisyon yokken "%100" yazan bir toplam satırı gürültüden ibaret. */}
            {!showSkeleton && (openPositions.length > 0 || closedPositions.length > 0) && (
              <tr className="bg-gray-900/40 border-t-2 border-gray-600">
                <td className="px-3 py-3 font-bold" colSpan={3}>TOPLAM</td>
                <td className="px-3 py-3 text-right">
                  <div className="font-bold tabular-nums">{tl(totals.value)}</div>
                  <div className="text-[11px] text-gray-500 tabular-nums">{usd(totals.valueUSD)}</div>
                </td>
                <td className="px-3 py-3 text-right text-gray-400 tabular-nums">%100</td>
                <td className={`px-3 py-3 text-right font-bold tabular-nums ${plColor(totals.unrealizedPL)}`}>
                  {tl(totals.unrealizedPL)}
                </td>
                <td className={`px-3 py-3 text-right font-bold tabular-nums ${plColor(totals.realizedPL)}`}>
                  {tl(totals.realizedPL)}
                </td>
                <td className="px-3 py-3"></td>
              </tr>
            )}

            {closedPositions.length > 0 && (
              <tr>
                <td colSpan={8} className="p-0">
                  <button
                    onClick={onToggleClosed}
                    className="w-full text-left px-3 py-3 text-sm text-gray-400 hover:text-white hover:bg-gray-700/30 transition-colors"
                  >
                    {showClosed ? '▾' : '▸'} Geçmiş pozisyonlar ({closedPositions.length})
                  </button>
                </td>
              </tr>
            )}

            {showClosed && closedPositions.map((item) => (
              <tr key={item.id} className="border-b border-gray-700/60 text-gray-400 hover:bg-gray-700/30 transition-colors">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{item.symbol}</span>
                    <TypeBadge type={item.type} />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">—</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{tl(item.currentPrice)}</td>
                <td className="px-3 py-2.5 text-right">—</td>
                <td className="px-3 py-2.5 text-right">—</td>
                <td className="px-3 py-2.5 text-right">—</td>
                <td className="px-3 py-2.5 text-right">
                  <div className={`font-bold tabular-nums ${plColor(item.realizedPL)}`}>{tl(item.realizedPL)}</div>
                  <div className="text-[11px] text-gray-500 tabular-nums">{usd(item.realizedPLUSD)}</div>
                </td>
                <td className="px-3 py-2.5">
                  {!isHistorical && (
                    <div className="flex justify-end">
                      <button onClick={() => onOpenTx(item.id, 'buy')} title={`${item.symbol} al`}
                        className="px-2 py-1 rounded text-xs font-semibold bg-gray-700/70 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Al</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
