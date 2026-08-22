"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Series = { currency: string; prices: Record<string, number> };
type Point = { date: string; tl: number; usd: number };

// Tek seri olduğu için lejant yok — başlık seriyi zaten adlandırıyor.
// Renk kâr/zarar anlamı taşıyan yeşil/kırmızıdan kasten uzak tutuldu.
const SERIES_COLOR = "#9085e9";

const RANGES = [
  { key: '1m', label: '1 Ay', days: 30 },
  { key: '3m', label: '3 Ay', days: 90 },
  { key: '6m', label: '6 Ay', days: 180 },
  { key: '1y', label: '1 Yıl', days: 365 },
  { key: 'all', label: 'Tümü', days: 0 },
];

// Fiyat serileri her günü içermez (hafta sonu, tatil, işlem görmeyen gün).
// Her tarih için o güne kadarki son bilinen fiyatı kullanırız.
function buildForwardFill(prices: Record<string, number>) {
  const dates = Object.keys(prices).sort();
  return (target: string): number => {
    let lo = 0, hi = dates.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= target) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return best >= 0 ? prices[dates[best]] : 0;
  };
}

export default function PortfolioChart({
  assets, transactions, fxRates,
}: {
  assets: any[];
  transactions: any[];
  fxRates: Record<string, number>;
}) {
  const [histories, setHistories] = useState<Record<string, Series>>({});
  const [loading, setLoading] = useState(false);
  const [rangeKey, setRangeKey] = useState('3m');
  const [unit, setUnit] = useState<'tl' | 'usd'>('tl');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const firstTxDate = useMemo(
    () => transactions.map(t => t.date).filter(Boolean).sort()[0] ?? '',
    [transactions]
  );
  const today = new Date().toISOString().slice(0, 10);
  const assetKey = assets.map(a => a.id).join(',');

  // Tüm aralık bir kez çekilir, ön tanımlı aralıklar istemcide dilimlenir —
  // aralık değiştirmek yeni istek gerektirmez.
  useEffect(() => {
    if (!firstTxDate || assets.length === 0) return;
    let cancelled = false;
    setLoading(true);
    const spec = assets.map(a => `${a.symbol}:${a.type}`).join(',');
    fetch(`/api/history?symbols=${encodeURIComponent(spec)}&start=${firstTxDate}&end=${today}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const map: Record<string, Series> = {};
        for (const a of assets) {
          map[a.id] = (data.series?.[a.symbol.toUpperCase()] ?? { currency: 'TRY', prices: {} }) as Series;
        }
        setHistories(map);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setHistories({}); setLoading(false); } });
    return () => { cancelled = true; };
  }, [firstTxDate, assetKey, today, assets]);

  const points: Point[] = useMemo(() => {
    if (!firstTxDate || Object.keys(histories).length === 0) return [];

    const rate = (() => {
      const dates = Object.keys(fxRates).sort();
      return (d: string) => {
        let lo = 0, hi = dates.length - 1, best = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (dates[mid] <= d) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        return best >= 0 ? fxRates[dates[best]] : 0;
      };
    })();

    const lookups: Record<string, (d: string) => number> = {};
    for (const [id, s] of Object.entries(histories)) lookups[id] = buildForwardFill(s.prices);

    const range = RANGES.find(r => r.key === rangeKey)!;
    let start = firstTxDate;
    if (range.days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - range.days);
      const candidate = d.toISOString().slice(0, 10);
      if (candidate > start) start = candidate;
    }

    // Gün gün ilerleyip her gün için pozisyon × fiyat topluyoruz.
    const out: Point[] = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${today}T00:00:00Z`);
    while (cursor <= endDate) {
      const d = cursor.toISOString().slice(0, 10);
      const dow = cursor.getUTCDay();
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (dow === 0 || dow === 6) continue; // hafta sonu piyasa kapalı

      const r = rate(d);
      let tl = 0, usd = 0;
      for (const asset of assets) {
        let qty = 0;
        for (const tx of transactions) {
          if (tx.asset_id !== asset.id || tx.date > d) continue;
          if (tx.type === 'buy') qty += Number(tx.quantity);
          else if (tx.type === 'sell') qty -= Number(tx.quantity);
        }
        if (qty <= 0) continue;
        const series = histories[asset.id];
        const native = lookups[asset.id]?.(d) ?? 0;
        if (!native) continue;
        const isUsd = series?.currency === 'USD';
        tl += qty * (isUsd ? native * r : native);
        usd += qty * (isUsd ? native : (r ? native / r : 0));
      }
      if (tl > 0) out.push({ date: d, tl, usd });
    }
    return out;
  }, [histories, transactions, assets, fxRates, rangeKey, firstTxDate, today]);

  const values = points.map(p => unit === 'tl' ? p.tl : p.usd);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const pad = (maxV - minV) * 0.08 || maxV * 0.1 || 1;
  const lo = Math.max(0, minV - pad);
  const hi = maxV + pad;

  const W = 820, H = 280, ML = 72, MR = 16, MT = 16, MB = 30;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const x = (i: number) => points.length <= 1 ? ML : ML + (i / (points.length - 1)) * plotW;
  const y = (v: number) => MT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(unit === 'tl' ? p.tl : p.usd).toFixed(1)}`).join(' ');
  const areaPath = points.length
    ? `${linePath} L${x(points.length - 1).toFixed(1)},${MT + plotH} L${ML},${MT + plotH} Z`
    : '';

  const fmt = (v: number) => unit === 'tl'
    ? `${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`
    : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(t => lo + t * (hi - lo));
  const spansYears = points.length > 0 && points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4);

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = (px - ML) / plotW;
    const idx = Math.round(t * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const first = points[0], last = points[points.length - 1];
  const change = first && last
    ? (unit === 'tl' ? last.tl - first.tl : last.usd - first.usd)
    : 0;

  // Değer artışının ne kadarı yeni para koymaktan, ne kadarı kazançtan geldiğini ayırıyoruz.
  // Bu ayrım olmadan "değer %154 arttı" ifadesi getiri sanılır — oysa çoğu yeni alım olabilir.
  const netFlow = useMemo(() => {
    if (!first || !last) return 0;
    const dates = Object.keys(fxRates).sort();
    const rateOn = (d: string) => {
      let lo = 0, hi = dates.length - 1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] <= d) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best >= 0 ? fxRates[dates[best]] : 0;
    };
    let flow = 0;
    for (const tx of transactions) {
      if (!tx.date || tx.date <= first.date || tx.date > last.date) continue;
      if (tx.type !== 'buy' && tx.type !== 'sell') continue;
      const r = rateOn(tx.date);
      const isUsd = (tx.currency || 'TRY').toUpperCase() === 'USD';
      const priceTL = isUsd ? Number(tx.price) * r : Number(tx.price);
      const priceUSD = isUsd ? Number(tx.price) : (r ? Number(tx.price) / r : 0);
      const amount = Number(tx.quantity) * (unit === 'tl' ? priceTL : priceUSD);
      flow += tx.type === 'buy' ? amount : -amount;
    }
    return flow;
  }, [transactions, fxRates, first, last, unit]);

  const gain = change - netFlow;
  // Getiri oranı, dönem başı değer + dönem içi net yatırım üzerinden hesaplanır.
  const gainBase = (first ? (unit === 'tl' ? first.tl : first.usd) : 0) + Math.max(0, netFlow);
  const gainPct = gainBase > 0 ? (gain / gainBase) * 100 : 0;

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-8">
      <div className="p-4 border-b border-gray-700 flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-lg">Portföy Değeri</h2>

        <div className="flex gap-1 ml-auto">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => { setRangeKey(r.key); setHoverIdx(null); }}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${rangeKey === r.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >{r.label}</button>
          ))}
        </div>

        <div className="flex gap-1 border-l border-gray-700 pl-3">
          {(['tl', 'usd'] as const).map(u => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${unit === u ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >{u === 'tl' ? '₺' : '$'}</button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading && points.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">Geçmiş fiyatlar çekiliyor…</div>
        ) : points.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">Bu aralıkta veri yok.</div>
        ) : (
          <>
            <div className="mb-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold">{fmt(hovered ? (unit === 'tl' ? hovered.tl : hovered.usd) : (unit === 'tl' ? last.tl : last.usd))}</span>
                <span className={`text-sm font-semibold ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%) kazanç
                </span>
                <span className="text-xs text-gray-500">{hovered ? hovered.date : `${first.date} → ${last.date}`}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Değer değişimi {change >= 0 ? '+' : ''}{fmt(change)}
                {netFlow !== 0 && <> · bunun {netFlow >= 0 ? '+' : ''}{fmt(netFlow)} kadarı {netFlow >= 0 ? 'yeni alımdan' : 'satıştan'}</>}
              </div>
            </div>

            <div className={`relative transition-opacity ${loading ? 'opacity-50' : ''}`}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                className="block overflow-visible"
                onPointerMove={handleMove}
                onPointerLeave={() => setHoverIdx(null)}
                role="img"
                aria-label={`Portföy değerinin ${first.date} ile ${last.date} arasındaki değişimi`}
              >
                <defs>
                  <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {gridVals.map((v, i) => (
                  <g key={i}>
                    <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#374151" strokeWidth="1" />
                    <text x={ML - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{fmt(v)}</text>
                  </g>
                ))}

                <path d={areaPath} fill="url(#pfFill)" />
                <path d={linePath} fill="none" stroke={SERIES_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

                {[0, Math.floor(points.length / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
                  <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#9ca3af">
                    {/* Aralık birden fazla yıla yayılıyorsa yıl da yazılır; yoksa 04-07 ile
                        bir sonraki yılın 04-07'si ayırt edilemiyor. */}
                    {spansYears ? points[i].date.slice(2) : points[i].date.slice(5)}
                  </text>
                ))}

                {hovered && hoverIdx !== null && (
                  <g>
                    <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={MT} y2={MT + plotH} stroke="#6b7280" strokeWidth="1" strokeDasharray="3 3" />
                    <circle cx={x(hoverIdx)} cy={y(unit === 'tl' ? hovered.tl : hovered.usd)} r="5" fill={SERIES_COLOR} stroke="#1f2937" strokeWidth="2" />
                  </g>
                )}
              </svg>
            </div>

            <button
              onClick={() => setShowTable(s => !s)}
              className="mt-3 text-xs text-gray-400 hover:text-white underline"
            >
              {showTable ? 'Tabloyu gizle' : 'Veriyi tablo olarak gör'}
            </button>

            {showTable && (
              <div className="mt-3 max-h-64 overflow-y-auto border border-gray-700 rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50 text-gray-400 sticky top-0">
                    <tr><th className="p-2 text-left">Tarih</th><th className="p-2 text-right">Değer (₺)</th><th className="p-2 text-right">Değer ($)</th></tr>
                  </thead>
                  <tbody>
                    {points.slice().reverse().map(p => (
                      <tr key={p.date} className="border-t border-gray-700">
                        <td className="p-2">{p.date}</td>
                        <td className="p-2 text-right">{p.tl.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</td>
                        <td className="p-2 text-right">{p.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
