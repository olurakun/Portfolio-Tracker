"use client";

import { useEffect, useRef, useState } from "react";

export type AssetChoice = { symbol: string; name: string; type: string };

const TYPE_LABEL: Record<string, string> = {
  stock: 'Hisse', fund: 'Fon', currency: 'Döviz', metal: 'Maden',
};

/**
 * Varlık seçici: arama, sonuç listesi, elle sembol yazma ve tip seçimi.
 *
 * Tek bir bileşen çünkü aynı iş iki yerde (sol "Yeni Varlık Ekle" formu ve
 * işlem modalı) ayrı ayrı yazılmıştı ve ikisi ayrışmıştı: modaldeki elle yazma
 * alanı `symbol` boşken gösteriliyordu, ilk harf yazılır yazılmaz alan
 * ekrandan kalkıp tek harfi sembol olarak seçiyordu. Elle yazma artık AYRI bir
 * kip — açıkken açık kalır.
 */
export default function AssetPicker({
  value, onChange, autoFocus = false, searchPlaceholder = 'Ara: THYAO, Info Yatırım, Apple, Altın...',
}: {
  value: AssetChoice;
  onChange: (next: AssetChoice) => void;
  autoFocus?: boolean;
  searchPlaceholder?: string;
}) {
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  // Sonuçlar geldikleri sorguyla birlikte tutuluyor; ekranda yalnızca GÜNCEL
  // sorgunun sonuçları gösteriliyor. Böylece kutu değişince eski sonuçlar
  // anında kayboluyor ve efekt içinde state temizlemek gerekmiyor.
  const [answer, setAnswer] = useState<{ query: string; rows: AssetChoice[] }>({ query: '', rows: [] });
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);
  const trimmed = query.trim();
  const results = answer.query === trimmed ? answer.rows : [];

  useEffect(() => {
    const id = ++requestId.current;
    const handle = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) return;
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        // Geç dönen eski istek yeni sonuçların üstüne yazmasın.
        if (id === requestId.current) setAnswer({ query: q, rows: data.results || [] });
      } catch {
        if (id === requestId.current) setAnswer({ query: q, rows: [] });
      }
      if (id === requestId.current) setSearching(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  const clear = () => { onChange({ symbol: '', name: '', type: value.type }); setQuery(""); };

  return (
    <div className="space-y-2">
      {manual ? (
        <>
          <input
            type="text"
            placeholder="Sembol — BIST için INFO.IS, ABD için AAPL"
            value={value.symbol}
            onChange={(e) => onChange({ ...value, symbol: e.target.value.toUpperCase() })}
            className="w-full p-2 rounded bg-gray-700 border border-gray-600"
            autoFocus={autoFocus}
          />
          <input
            type="text"
            placeholder="Varlık adı (opsiyonel)"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
          />
          <button type="button" onClick={() => { setManual(false); clear(); }}
            className="text-xs text-gray-400 underline">Aramaya dön</button>
        </>
      ) : value.symbol ? (
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="font-bold truncate">{value.symbol}</div>
            <div className="text-xs text-gray-400 truncate">{value.name}</div>
          </div>
          <button type="button" onClick={clear} className="text-xs text-gray-400 underline shrink-0">Değiştir</button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full p-2 rounded bg-gray-700 border border-gray-600"
            autoFocus={autoFocus}
          />
          {searching && <div className="text-xs text-gray-400 mt-1">Aranıyor...</div>}
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded max-h-60 overflow-y-auto shadow-xl">
              {results.map((r, i) => (
                <button
                  type="button"
                  key={`${r.symbol}-${i}`}
                  onClick={() => { onChange({ symbol: r.symbol, name: r.name, type: r.type }); setQuery(""); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-600 flex justify-between items-center gap-2"
                >
                  <span className="truncate">
                    <span className="font-bold">{r.symbol}</span>{' '}
                    <span className="text-gray-400 text-sm">{r.name}</span>
                  </span>
                  <span className="text-xs uppercase text-gray-400 shrink-0">{TYPE_LABEL[r.type] ?? r.type}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setManual(true); setQuery(""); }}
            className="text-xs text-gray-400 underline mt-1">Bulamadım, sembolü elle yazayım</button>
        </div>
      )}

      <select
        value={value.type}
        onChange={(e) => onChange({ ...value, type: e.target.value })}
        aria-label="Varlık tipi"
        className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
      >
        <option value="stock">Hisse</option>
        <option value="fund">Fon</option>
        <option value="currency">Döviz</option>
        <option value="metal">Değerli Maden</option>
      </select>
    </div>
  );
}
