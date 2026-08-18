"use client";

import { useEffect, useMemo, useState } from "react";
import { indexSeries, totalReturnPct, businessDays, type PriceSeries, type IndexedPoint } from "../../lib/compare";

type Asset = { id: string | number; symbol: string; name?: string; type: string };
type Item = { key: string; symbol: string; label: string; type: string };

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

export default function Comparison({ assets }: { assets: Asset[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rangeKey, setRangeKey] = useState('3m');
  const [series, setSeries] = useState<Record<string, PriceSeries>>({});
  const [loading, setLoading] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const portfolioItems: Item[] = useMemo(
    () => assets.map(a => ({ key: `pf:${a.id}`, symbol: a.symbol, label: a.symbol, type: a.type })),
    [assets]
  );
  const allItems = useMemo(() => [...portfolioItems, ...BENCHMARKS], [portfolioItems]);

  const presets = useMemo(() => {
    const byType = (t: string) => portfolioItems.filter(i => i.type === t).slice(0, MAX_SERIES).map(i => i.key);
    return [
      { label: 'Değerli madenler', keys: portfolioItems.filter(i => i.type === 'metal').map(i => i.key) },
      { label: 'Hisselerim', keys: byType('stock') },
      { label: 'Fonlarım', keys: byType('fund') },
      { label: 'Kıyas ölçütleri', keys: BENCHMARKS.map(b => b.key) },
    ].filter(p => p.keys.length > 0);
  }, [portfolioItems]);

  // İlk açılışta anlamlı bir seçim yap: madenler varsa onlar, yoksa kıyas ölçütleri.
  useEffect(() => {
    if (selected.length > 0 || portfolioItems.length === 0) return;
    const metals = portfolioItems.filter(i => i.type === 'metal').map(i => i.key);
    setSelected(metals.length > 0
      ? [...metals, 'bm:XU100.IS'].slice(0, MAX_SERIES)
      : BENCHMARKS.map(b => b.key));
  }, [portfolioItems, selected.length]);

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

  // Seçilen her varlığın fiyat serisi bir kez çekilir; aynı sembol tekrar
  // seçilirse yeniden istenmez.
  useEffect(() => {
    const missing = selectedItems.filter(i => !series[i.key]);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(missing.map(async (item) => {
      try {
        const res = await fetch(`/api/history?symbol=${encodeURIComponent(item.symbol)}&type=${item.type}&start=${start}&end=${end}`);
        const data = await res.json();
        return { key: item.key, prices: (data.prices ?? {}) as PriceSeries };
      } catch {
        return { key: item.key, prices: {} as PriceSeries };
      }
    })).then(rows => {
      if (cancelled) return;
      setSeries(prev => {
        const next = { ...prev };
        for (const r of rows) next[r.key] = r.prices;
        return next;
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedItems, series, start, end]);

  // Aralık değişince seriler yeniden çekilmeli (endeks tabanı değişiyor).
  useEffect(() => { setSeries({}); setHoverIdx(null); }, [rangeKey]);

  const dates = useMemo(() => businessDays(start, end), [start, end]);

  const lines = useMemo(() => {
    return selectedItems.map((item, i) => ({
      item,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: indexSeries(series[item.key] ?? {}, dates),
    })).filter(l => l.points.length > 1);
  }, [selectedItems, series, dates]);

  const toggle = (key: string) => {
    setSelected(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= MAX_SERIES) return prev;
      return [...prev, key];
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
    .map(l => ({ label: l.item.label, color: l.color, ret: totalReturnPct(l.points) }))
    .sort((a, b) => b.ret - a.ret);

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 w-full sm:w-auto">Hazır gruplar</span>
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => setSelected(p.keys.slice(0, MAX_SERIES))}
              className="px-3 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 transition-colors"
            >{p.label}</button>
          ))}
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs text-gray-400">Varlıklar</span>
            <span className="text-xs text-gray-600">{selected.length}/{MAX_SERIES} seçili</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allItems.map(item => {
              const on = selected.includes(item.key);
              const full = !on && selected.length >= MAX_SERIES;
              const color = on ? SERIES_COLORS[selected.indexOf(item.key) % SERIES_COLORS.length] : undefined;
              return (
                <button
                  key={item.key}
                  onClick={() => toggle(item.key)}
                  disabled={full}
                  title={full ? `En fazla ${MAX_SERIES} varlık karşılaştırılabilir` : undefined}
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
          <h2 className="font-bold text-lg text-purple-400">Getiri Karşılaştırması</h2>
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
                      key={l.item.key}
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
                          <circle key={l.item.key} cx={xOf(hoverDate)} cy={yOf(v)} r="4" fill={l.color} stroke="#1f2937" strokeWidth="2" />
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
                        <div key={l.item.key} className="flex items-center gap-1.5 text-xs">
                          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                          <span className="font-bold tabular-nums">
                            {v === null ? '—' : `${(v - 100) >= 0 ? '+' : ''}${(v - 100).toFixed(1)}%`}
                          </span>
                          <span className="text-gray-400">{l.item.label}</span>
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
                          <tr key={l.item.key} className="border-t border-gray-700">
                            <td className="p-2">{l.item.label}</td>
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
