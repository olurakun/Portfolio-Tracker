"use client";

import { useEffect, useMemo, useState } from "react";
import { indexSeries, totalReturnPct, businessDays, timeWeightedIndex, priceAsOf, type PriceSeries, type IndexedPoint, type DailyValue } from "../../lib/compare";
import { convertTxPrice, type FxRates, type Transaction } from "../../lib/portfolio";

type Asset = { id: string | number; symbol: string; name?: string; type: string };
type Item = { key: string; symbol: string; label: string; type: string };

// Varlık tipine göre gruplar. Her grup tek bir çizgi olur ve o gruptaki
// pozisyonların TOPLAM performansını gösterir.
const GROUPS: { type: string; label: string }[] = [
  { type: 'metal',    label: 'Madenler' },
  { type: 'stock',    label: 'Hisseler' },
  { type: 'fund',     label: 'Fonlar' },
  { type: 'currency', label: 'Döviz' },
];

// dataviz referans paletinin koyu zemin sütunundan 6 slot. Yeşil ve kırmızı
// kasten dışarıda: bu uygulamada kâr/zarar anlamı taşıyorlar ve getiri
// grafiğinde kimlik rengi olarak kullanılmaları yanlış okunmaya yol açar.
// Palet validator'dan uyarısız geçti (koyu zemin #1f2937).
const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
const MAX_SERIES = SERIES_COLORS.length;

// Portföyde olmayan ama kıyas için gereken semboller.
const BENCHMARKS: Item[] = [
  { key: 'bm:XU100.IS', symbol: 'XU100.IS', label: 'BIST 100', type: 'stock' },
  { key: 'bm:XU030.IS', symbol: 'XU030.IS', label: 'BIST 30', type: 'stock' },
  { key: 'bm:USDTRY=X', symbol: 'USDTRY=X', label: 'Dolar/TL', type: 'stock' },
  { key: 'bm:XAU', symbol: 'XAU', label: 'Altın (gram)', type: 'metal' },
];

const RANGES = [
  { key: '1m', label: '1 Ay', days: 30 },
  { key: '3m', label: '3 Ay', days: 90 },
  { key: '6m', label: '6 Ay', days: 180 },
  { key: '1y', label: '1 Yıl', days: 365 },
];

export default function Comparison({
  assets, transactions, fxRates,
}: {
  assets: Asset[];
  transactions: Transaction[];
  fxRates: FxRates;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [rangeKey, setRangeKey] = useState('3m');
  const [series, setSeries] = useState<Record<string, { currency: string; prices: PriceSeries }>>({});
  const [loading, setLoading] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const portfolioItems: Item[] = useMemo(
    () => assets.map(a => ({ key: `pf:${a.id}`, symbol: a.symbol, label: a.symbol, type: a.type })),
    [assets]
  );
  const allItems = useMemo(() => [...portfolioItems, ...BENCHMARKS], [portfolioItems]);

  // Yalnızca portföyde varlığı olan gruplar gösterilir.
  const availableGroups = useMemo(
    () => GROUPS.filter(g => assets.some(a => a.type === g.type)),
    [assets]
  );

  // İlk açılışta anlamlı bir seçim: portföydeki grupları karşılaştır.
  useEffect(() => {
    if (selected.length > 0 || selectedGroups.length > 0 || assets.length === 0) return;
    setSelectedGroups(availableGroups.slice(0, MAX_SERIES).map(g => g.type));
  }, [assets.length, availableGroups, selected.length, selectedGroups.length]);

  const range = RANGES.find(r => r.key === rangeKey)!;
  const end = new Date().toISOString().slice(0, 10);
  const start = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - range.days);
    return d.toISOString().slice(0, 10);
  }, [range.days]);

  const selectedItems = useMemo(
    () => selected.map(k => allItems.find(i => i.key === k)).filter(Boolean) as Item[],
    [selected, allItems]
  );

  // Grup çizgisi için o gruptaki TÜM varlıkların serisi gerekir.
  const groupMemberItems = useMemo(
    () => portfolioItems.filter(i => selectedGroups.includes(i.type)),
    [portfolioItems, selectedGroups]
  );

  const neededItems = useMemo(() => {
    const seen = new Set<string>();
    return [...selectedItems, ...groupMemberItems].filter(i => {
      if (seen.has(i.key)) return false;
      seen.add(i.key);
      return true;
    });
  }, [selectedItems, groupMemberItems]);

  // Seçilen her varlığın fiyat serisi bir kez çekilir; aynı sembol tekrar
  // seçilirse yeniden istenmez.
  useEffect(() => {
    const missing = neededItems.filter(i => !series[i.key]);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    const spec = missing.map(i => `${i.symbol}:${i.type}`).join(',');
    fetch(`/api/history?symbols=${encodeURIComponent(spec)}&start=${start}&end=${end}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setSeries(prev => {
          const next = { ...prev };
          for (const i of missing) {
            const row = data.series?.[i.symbol.toUpperCase()];
            next[i.key] = { currency: row?.currency ?? 'TRY', prices: (row?.prices ?? {}) as PriceSeries };
          }
          return next;
        });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [neededItems, series, start, end]);

  // Aralık değişince seriler yeniden çekilmeli (endeks tabanı değişiyor).
  useEffect(() => { setSeries({}); setHoverIdx(null); }, [rangeKey]);

  const dates = useMemo(() => businessDays(start, end), [start, end]);

  // Bir varlığın belirli bir tarihteki TL fiyatı. Yabancı borsadaki hisseler ve
  // madenler kendi para biriminde geliyor; grup toplamı alabilmek için hepsi
  // o günün kuruyla TL'ye çevrilir.
  const priceInTRY = useMemo(() => {
    const fxDates = Object.keys(fxRates).sort();
    const rateOn = (d: string) => {
      let lo = 0, hi = fxDates.length - 1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (fxDates[mid] <= d) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best >= 0 ? fxRates[fxDates[best]] : 0;
    };
    return (key: string, date: string): number => {
      const s = series[key];
      if (!s) return 0;
      const native = priceAsOf(s.prices, date);
      if (native === null) return 0;
      return s.currency === 'USD' ? native * rateOn(date) : native;
    };
  }, [series, fxRates]);

  // Grup çizgisi: gruptaki tüm pozisyonların günlük toplam TL değeri ve o gün
  // gruba giren net para. İkisi birlikte zaman ağırlıklı getiriyi veriyor.
  const groupLines = useMemo(() => {
    return selectedGroups.map(type => {
      const members = assets.filter(a => a.type === type);
      const memberIds = new Set(members.map(a => String(a.id)));

      const flowByDate: Record<string, number> = {};
      for (const tx of transactions) {
        if (!memberIds.has(String(tx.asset_id))) continue;
        if (tx.type !== 'buy' && tx.type !== 'sell') continue;
        const p = convertTxPrice(tx, fxRates);
        if (!p) continue;
        const amount = Number(tx.quantity) * p.tl;
        flowByDate[tx.date] = (flowByDate[tx.date] ?? 0) + (tx.type === 'buy' ? amount : -amount);
      }

      const days: DailyValue[] = dates.map(date => {
        let value = 0;
        for (const asset of members) {
          let qty = 0;
          for (const tx of transactions) {
            if (String(tx.asset_id) !== String(asset.id) || tx.date > date) continue;
            if (tx.type === 'buy') qty += Number(tx.quantity);
            else if (tx.type === 'sell') qty -= Number(tx.quantity);
          }
          if (qty > 0) value += qty * priceInTRY(`pf:${asset.id}`, date);
        }
        return { date, value, flow: flowByDate[date] ?? 0 };
      });

      return {
        key: `grp:${type}`,
        label: GROUPS.find(g => g.type === type)?.label ?? type,
        points: timeWeightedIndex(days),
      };
    });
  }, [selectedGroups, assets, transactions, dates, fxRates, priceInTRY]);

  const lines = useMemo(() => {
    const individual = selectedItems.map(item => ({
      key: item.key,
      label: item.label,
      points: indexSeries(series[item.key]?.prices ?? {}, dates),
    }));
    return [...groupLines, ...individual]
      .filter(l => l.points.length > 1)
      .slice(0, MAX_SERIES)
      .map((l, i) => ({ ...l, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }, [groupLines, selectedItems, series, dates]);

  const totalSeries = selectedGroups.length + selected.length;

  const toggle = (key: string) => {
    setSelected(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (totalSeries >= MAX_SERIES) return prev;
      return [...prev, key];
    });
  };

  const toggleGroup = (type: string) => {
    setSelectedGroups(prev => {
      if (prev.includes(type)) return prev.filter(t => t !== type);
      if (totalSeries >= MAX_SERIES) return prev;
      return [...prev, type];
    });
  };

  // Çizim
  const W = 820, H = 300, ML = 52, MR = 16, MT = 16, MB = 30;
  const plotW = W - ML - MR, plotH = H - MT - MB;

  const allValues = lines.flatMap(l => l.points.map(p => p.value));
  const minV = allValues.length ? Math.min(...allValues, 100) : 90;
  const maxV = allValues.length ? Math.max(...allValues, 100) : 110;
  const pad = (maxV - minV) * 0.1 || 5;
  const lo = minV - pad, hi = maxV + pad;

  const xOf = (d: string) => {
    const i = dates.indexOf(d);
    return dates.length <= 1 ? ML : ML + (i / (dates.length - 1)) * plotW;
  };
  const yOf = (v: number) => MT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(t => lo + t * (hi - lo));

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = (px - ML) / plotW;
    const idx = Math.round(t * (dates.length - 1));
    setHoverIdx(Math.max(0, Math.min(dates.length - 1, idx)));
  };

  const hoverDate = hoverIdx !== null ? dates[hoverIdx] : null;
  const valueAt = (points: IndexedPoint[], date: string): number | null => {
    let best: IndexedPoint | null = null;
    for (const p of points) {
      if (p.date <= date && (best === null || p.date > best.date)) best = p;
    }
    return best?.value ?? null;
  };

  const ranked = lines
    .map(l => ({ label: l.label, color: l.color, ret: totalReturnPct(l.points) }))
    .sort((a, b) => b.ret - a.ret);

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full">
            <span className="text-xs text-gray-400">Gruplar</span>
            <p className="text-xs text-gray-600 mt-0.5">
              Her grup, o gruptaki tüm pozisyonlarının toplam performansını tek çizgide gösterir.
            </p>
          </div>
          {availableGroups.map(g => {
            const on = selectedGroups.includes(g.type);
            const full = !on && totalSeries >= MAX_SERIES;
            const color = on ? SERIES_COLORS[selectedGroups.indexOf(g.type) % SERIES_COLORS.length] : undefined;
            const count = assets.filter(a => a.type === g.type).length;
            return (
              <button
                key={g.type}
                onClick={() => toggleGroup(g.type)}
                disabled={full}
                title={full ? `En fazla ${MAX_SERIES} çizgi gösterilebilir` : undefined}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  on ? 'border-transparent text-white' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                } ${full ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={on ? { backgroundColor: color } : undefined}
              >
                {g.label} <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs text-gray-400">Tek tek varlıklar</span>
            <span className="text-xs text-gray-600">{totalSeries}/{MAX_SERIES} çizgi</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allItems.map(item => {
              const on = selected.includes(item.key);
              const full = !on && totalSeries >= MAX_SERIES;
              const color = on ? SERIES_COLORS[(selectedGroups.length + selected.indexOf(item.key)) % SERIES_COLORS.length] : undefined;
              return (
                <button
                  key={item.key}
                  onClick={() => toggle(item.key)}
                  disabled={full}
                  title={full ? `En fazla ${MAX_SERIES} çizgi gösterilebilir` : undefined}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    on ? 'border-transparent text-white' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                  } ${full ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={on ? { backgroundColor: color } : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-1 border-t border-gray-700 pt-3">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${rangeKey === r.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >{r.label}</button>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-bold text-lg">Getiri Karşılaştırması</h2>
          <p className="text-xs text-gray-400 mt-1">
            Tüm varlıklar {start} tarihinde 100 kabul edildi; çizgiler o günden bu yana yüzde getiriyi gösterir.
          </p>
        </div>

        <div className="p-4">
          {lines.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">
              {loading ? 'Fiyatlar çekiliyor…' : selected.length === 0 ? 'Karşılaştırmak için varlık seç.' : 'Seçilen varlıklar için bu aralıkta veri yok.'}
            </div>
          ) : (
            <>
              {/* Lejant her zaman var: kimlik hiçbir zaman yalnız renkle taşınmaz. */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {ranked.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5 text-xs">
                    <span className="w-4 h-0.5 rounded" style={{ backgroundColor: r.color }} />
                    <span className="text-gray-300">{r.label}</span>
                    <span className={r.ret >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {r.ret >= 0 ? '+' : ''}{r.ret.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>

              <div className={`relative transition-opacity ${loading ? 'opacity-50' : ''}`}>
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  width="100%"
                  className="block overflow-visible"
                  onPointerMove={handleMove}
                  onPointerLeave={() => setHoverIdx(null)}
                  role="img"
                  aria-label={`${selectedItems.map(i => i.label).join(', ')} varlıklarının ${start} ile ${end} arasındaki endekslenmiş getirisi`}
                >
                  {gridVals.map((v, i) => (
                    <g key={i}>
                      <line x1={ML} x2={W - MR} y1={yOf(v)} y2={yOf(v)} stroke="#374151" strokeWidth="1" />
                      <text x={ML - 8} y={yOf(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
                        {v.toFixed(0)}
                      </text>
                    </g>
                  ))}

                  {/* 100 çizgisi başlangıç seviyesi: üstü kâr, altı zarar. */}
                  {lo < 100 && hi > 100 && (
                    <line x1={ML} x2={W - MR} y1={yOf(100)} y2={yOf(100)} stroke="#6b7280" strokeWidth="1" />
                  )}

                  {lines.map(l => (
                    <path
                      key={l.key}
                      d={l.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.date).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ')}
                      fill="none"
                      stroke={l.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}

                  {[0, Math.floor(dates.length / 2), dates.length - 1]
                    .filter((v, i, a) => a.indexOf(v) === i && dates[v])
                    .map(i => (
                      <text key={i} x={xOf(dates[i])} y={H - 8}
                        textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}
                        fontSize="11" fill="#9ca3af">
                        {dates[i].slice(5)}
                      </text>
                    ))}

                  {hoverDate && (
                    <>
                      <line x1={xOf(hoverDate)} x2={xOf(hoverDate)} y1={MT} y2={MT + plotH} stroke="#6b7280" strokeWidth="1" strokeDasharray="3 3" />
                      {lines.map(l => {
                        const v = valueAt(l.points, hoverDate);
                        return v === null ? null : (
                          <circle key={l.key} cx={xOf(hoverDate)} cy={yOf(v)} r="4" fill={l.color} stroke="#1f2937" strokeWidth="2" />
                        );
                      })}
                    </>
                  )}
                </svg>
              </div>

              {/* Tek tooltip, bütün seriler — imlecin bir çizgiye denk gelmesi gerekmiyor. */}
              {hoverDate && (
                <div className="mt-3 bg-gray-900/60 border border-gray-700 rounded p-2 inline-block">
                  <div className="text-xs text-gray-400 mb-1">{hoverDate}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {lines.map(l => {
                      const v = valueAt(l.points, hoverDate);
                      return (
                        <div key={l.key} className="flex items-center gap-1.5 text-xs">
                          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                          <span className="font-bold tabular-nums">
                            {v === null ? '—' : `${(v - 100) >= 0 ? '+' : ''}${(v - 100).toFixed(1)}%`}
                          </span>
                          <span className="text-gray-400">{l.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <button onClick={() => setShowTable(s => !s)} className="mt-3 text-xs text-gray-400 hover:text-white underline">
                  {showTable ? 'Tabloyu gizle' : 'Veriyi tablo olarak gör'}
                </button>
                {showTable && (
                  <div className="mt-3 border border-gray-700 rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-900/50 text-gray-400">
                        <tr>
                          <th className="p-2 text-left">Varlık</th>
                          <th className="p-2 text-right">Başlangıç</th>
                          <th className="p-2 text-right">Bitiş</th>
                          <th className="p-2 text-right">Getiri</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map(l => (
                          <tr key={l.key} className="border-t border-gray-700">
                            <td className="p-2">{l.label}</td>
                            <td className="p-2 text-right tabular-nums text-gray-400">{l.points[0].date}</td>
                            <td className="p-2 text-right tabular-nums text-gray-400">{l.points[l.points.length - 1].date}</td>
                            <td className={`p-2 text-right tabular-nums font-bold ${totalReturnPct(l.points) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {totalReturnPct(l.points) >= 0 ? '+' : ''}{totalReturnPct(l.points).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
