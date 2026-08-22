"use client";

import { useState } from "react";
import { DEFAULT_SHARE_COLUMNS, type AssetType, type ShareColumns, type ShareConfig } from "../../lib/shares";

export type ShareRecord = {
  id: string;
  title: string | null;
  config: ShareConfig;
  created_at: string;
  refreshed_at: string;
};

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Hisse' },
  { value: 'fund', label: 'Fon' },
  { value: 'currency', label: 'Döviz' },
  { value: 'metal', label: 'Değerli Maden' },
];

const COLUMN_OPTIONS: { key: keyof ShareColumns; label: string }[] = [
  { key: 'quantity', label: 'Adet' },
  { key: 'price', label: 'Güncel fiyat' },
  { key: 'value', label: 'Değer (₺/$)' },
  { key: 'share', label: 'Pay (%)' },
  { key: 'unrealizedPL', label: 'Anlık K/Z' },
  { key: 'realizedPL', label: 'Realize K/Z' },
];

/**
 * Portföy paylaşımı: oluşturma + yönetim tek modalde.
 *
 * Saf bir bileşen — hiçbir I/O yapmaz, hepsi callback prop'larla dışarıya
 * devredilir (bkz. ImportPreview ile aynı kalıp). Gerçek Supabase çağrıları
 * page.tsx'te; bu bileşen yalnızca formu ve listeyi çizer.
 */
export default function ShareModal({
  open, onClose, assetCounts, busy, error, shares, sharesLoading,
  onCreate, onRefresh, onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** Her varlık tipinden kaç açık pozisyon var — önizleme için ("3 hisse paylaşılacak"). */
  assetCounts: Record<AssetType, number>;
  busy: boolean;
  error: string;
  shares: ShareRecord[];
  sharesLoading: boolean;
  onCreate: (title: string, config: ShareConfig) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [types, setTypes] = useState<Set<AssetType>>(new Set(TYPE_OPTIONS.map(t => t.value)));
  const [columns, setColumns] = useState<ShareColumns>(DEFAULT_SHARE_COLUMNS);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!open) return null;

  const toggleType = (t: AssetType) => setTypes(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  const includedCount = TYPE_OPTIONS
    .filter(t => types.has(t.value))
    .reduce((acc, t) => acc + (assetCounts[t.value] ?? 0), 0);

  const submit = () => {
    if (types.size === 0) return;
    const allTypesSelected = types.size === TYPE_OPTIONS.length;
    onCreate(title.trim(), {
      assetTypes: allTypesSelected ? null : Array.from(types),
      columns,
    });
    setTitle("");
  };

  const shareUrl = (id: string) =>
    typeof window === 'undefined' ? `/paylasim/${id}` : `${window.location.origin}/paylasim/${id}`;

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
    } catch {
      // Panoya erişim engelliyse kullanıcı bağlantıyı elle seçip kopyalayabilir.
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="font-bold text-lg text-orange-400">Portföyü Paylaş</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
            <p className="text-xs text-gray-400 mb-3">
              Paylaşım bir <strong className="text-gray-300">anlık görüntüdür</strong> — canlı değildir, kimlik
              doğrulaması gerektirmez. Bağlantıyı açan kişi paylaştığın andaki durumu görür; fiyatlar güncellenince
              &ldquo;Yenile&rdquo; ile tazeleyebilirsin. Sanal senaryolar ve geçmiş tarih görünümü paylaşılamaz.
            </p>

            <input
              type="text"
              placeholder="Paylaşım adı (opsiyonel, ör. Hisse portföyüm)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm mb-3"
            />

            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1.5">Hangi varlık tipleri dahil olsun?</div>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleType(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      types.has(t.value)
                        ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                        : 'bg-gray-900/40 border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {t.label} <span className="text-gray-500">({assetCounts[t.value] ?? 0})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-1">
              <div className="text-xs text-gray-400 mb-1.5">
                Hangi sütunlar görünsün? Kapattığın bir sütun paylaşılan sayfada hiç yer almaz.
              </div>
              <div className="flex flex-wrap gap-2">
                {COLUMN_OPTIONS.map(c => (
                  <label
                    key={c.key}
                    className="flex items-center gap-1.5 text-xs bg-gray-900/40 border border-gray-700 rounded px-2.5 py-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={columns[c.key]}
                      onChange={(e) => setColumns(prev => ({ ...prev, [c.key]: e.target.checked }))}
                      className="accent-orange-600"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Sembol ve varlık tipi her zaman görünür. Pay (%), yalnızca gösterilen varlıklar arasındaki
              dağılımı yansıtır — paylaşmadığın varlıkların büyüklüğü hiçbir şekilde sızmaz.
            </p>

            {error && <div className="text-xs text-red-400 mt-2">{error}</div>}

            <button
              onClick={submit}
              disabled={busy || types.size === 0 || includedCount === 0}
              className="w-full mt-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 py-2 rounded font-bold text-sm"
            >
              {busy ? 'Oluşturuluyor...' : `Paylaşım linki oluştur (${includedCount} varlık)`}
            </button>
          </div>

          <div>
            <div className="font-bold text-sm mb-2">Paylaşımların</div>
            {sharesLoading && <div className="text-xs text-gray-500">Yükleniyor...</div>}
            {!sharesLoading && shares.length === 0 && (
              <div className="text-xs text-gray-500">Henüz bir paylaşım oluşturmadın.</div>
            )}
            <div className="space-y-2">
              {shares.map(s => (
                <div key={s.id} className="bg-gray-900/40 border border-gray-700 rounded p-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{s.title || 'Adsız paylaşım'}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(s.refreshed_at).toLocaleString('tr-TR')} tarihinde güncellendi
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => copyLink(s.id)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
                        {copiedId === s.id ? 'Kopyalandı ✓' : 'Linki kopyala'}
                      </button>
                      <button onClick={() => onRefresh(s.id)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">Yenile</button>
                      <button onClick={() => onDelete(s.id)}
                        className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors">Kaldır</button>
                    </div>
                  </div>
                  <a href={shareUrl(s.id)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-orange-400 underline hover:text-orange-300 break-all mt-1 block">
                    {shareUrl(s.id)}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
