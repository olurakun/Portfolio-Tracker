"use client";

/**
 * Tablo öncesi araç çubuğu.
 *
 * Önceden tarih seçici ve dönem K/Z hesaplayıcı, her biri kendi tam genişlik
 * kartında duruyordu; ikisi birlikte tabloya inmeden önce ekranlarca dikey
 * alan yiyordu. İkisi de ara sıra kullanılan araçlar, veri değil — tek satırda
 * ve dönem hesaplayıcı katlanmış olarak duruyorlar.
 */
export default function PortfolioToolbar({
  asOfDate, onAsOfDateChange, asOfLoading,
  rangeStart, rangeEnd, onRangeStartChange, onRangeEndChange,
  onCalculateRange, rangeLoading, rangeResult,
  rangeOpen, onToggleRange,
}: {
  asOfDate: string;
  onAsOfDateChange: (date: string) => void;
  asOfLoading: boolean;
  rangeStart: string;
  rangeEnd: string;
  onRangeStartChange: (date: string) => void;
  onRangeEndChange: (date: string) => void;
  onCalculateRange: () => void;
  rangeLoading: boolean;
  rangeResult: number | null;
  rangeOpen: boolean;
  onToggleRange: () => void;
}) {
  const isHistorical = asOfDate !== '';
  const today = new Date().toISOString().slice(0, 10);

  const field = "p-1.5 rounded bg-gray-900/60 border border-gray-700 text-sm text-gray-200";

  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700 px-4 py-3 mb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] uppercase tracking-widest text-gray-500">Tarih</span>
          <input
            type="date"
            value={asOfDate}
            max={today}
            onChange={(e) => onAsOfDateChange(e.target.value)}
            aria-label="Portföyü şu tarihe göre göster"
            className={field}
          />
        </label>

        {isHistorical ? (
          <>
            <button
              onClick={() => onAsOfDateChange('')}
              className="text-xs px-2.5 py-1.5 rounded bg-amber-700/80 hover:bg-amber-600 font-semibold"
            >Bugüne dön</button>
            <span className="text-xs text-amber-400">
              {asOfLoading ? 'O tarihin fiyatları çekiliyor…' : 'Geçmiş görünüm'}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-600">bugün</span>
        )}

        <button
          onClick={onToggleRange}
          aria-expanded={rangeOpen}
          className="ml-auto text-xs text-gray-400 hover:text-white transition-colors"
        >
          {rangeOpen ? '▾' : '▸'} Dönem K/Z
        </button>

        {rangeResult !== null && !rangeLoading && !rangeOpen && (
          <span className={`text-sm font-semibold tabular-nums ${rangeResult >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {rangeResult >= 0 ? '+' : ''}{rangeResult.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
          </span>
        )}
      </div>

      {rangeOpen && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-gray-700/70">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[11px] uppercase tracking-widest text-gray-500">Başlangıç</span>
            <input type="date" value={rangeStart} onChange={(e) => onRangeStartChange(e.target.value)}
              aria-label="Başlangıç" className={field} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[11px] uppercase tracking-widest text-gray-500">Bitiş</span>
            <input type="date" value={rangeEnd} onChange={(e) => onRangeEndChange(e.target.value)}
              aria-label="Bitiş" className={field} />
          </label>
          <button
            onClick={onCalculateRange}
            disabled={rangeLoading}
            className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 font-semibold disabled:opacity-50"
          >
            {rangeLoading ? 'Hesaplanıyor…' : 'Hesapla'}
          </button>
          {rangeResult !== null && !rangeLoading && (
            <span className={`ml-auto text-base font-bold tabular-nums ${rangeResult >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {rangeStart} → {rangeEnd}:{' '}
              {rangeResult >= 0 ? '+' : ''}{rangeResult.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
            </span>
          )}
        </div>
      )}
    </div>
  );
}
