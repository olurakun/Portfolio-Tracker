"use client";

import ApiKeySettings from "./ApiKeySettings";

/**
 * İşlem içe aktarma paneli — eskiden sol kolonda kalıcı bir kutuydu.
 *
 * AssetFormModal ile aynı gerekçeyle modala taşındı. İçerik aynen korundu:
 * şablon indirme, kendi API anahtarı, dosya seçimi ve şablona uymayan dosyalar
 * için dönüştürme teklifi.
 */
export default function ImportModal({
  open, onClose, onFile, busy, error,
  pendingFile, convertReason, onConvert, onCancelConvert, needsApiKey,
}: {
  open: boolean;
  onClose: () => void;
  onFile: (file: File) => void;
  busy: boolean;
  error: string;
  pendingFile: File | null;
  convertReason: string;
  onConvert: () => void;
  onCancelConvert: () => void;
  needsApiKey: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-3"
      >
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">İşlem İçe Aktar</h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-gray-400">
          Excel, CSV veya PDF. Şablon formatındaki dosyalar doğrudan okunur; aracı
          kurum ekstresi gibi başka formatlar şablona çevrilerek aktarılır.
        </p>

        <a href="/api/template" className="inline-block text-xs text-gray-300 underline hover:text-white">
          ⬇ Excel şablonunu indir
        </a>

        <ApiKeySettings forceOpen={needsApiKey} />

        <input
          type="file"
          accept=".csv,.xlsx,.xlsm,.txt,.pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
          className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-white file:font-semibold hover:file:bg-gray-600"
        />

        {pendingFile && (
          <div className="bg-gray-900/60 border border-gray-700 rounded p-3 space-y-2">
            <div className="text-xs text-gray-300">
              <span className="font-bold">{pendingFile.name}</span> şablon formatında değil.
              {convertReason && <span className="text-gray-500"> {convertReason}</span>}
            </div>
            <p className="text-xs text-gray-400">
              Dosyayı şablona çevirebilirim. Sonuç doğrudan kaydedilmez; her satırı
              onaylamadan önce göreceksin.
            </p>
            <div className="flex gap-2">
              <button onClick={onConvert} disabled={busy}
                className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 font-bold disabled:opacity-50">
                {busy ? 'Çevriliyor...' : 'Şablona çevir'}
              </button>
              <button onClick={onCancelConvert} disabled={busy}
                className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50">
                Vazgeç
              </button>
            </div>
          </div>
        )}

        {busy && (
          <div className="text-xs text-gray-400">
            {pendingFile ? 'Dosya okunuyor, uzun ekstrelerde bir dakikayı bulabilir...' : 'İşleniyor...'}
          </div>
        )}
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
}
