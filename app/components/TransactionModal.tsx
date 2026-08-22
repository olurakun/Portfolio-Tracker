"use client";

import AssetPicker, { type AssetChoice } from "./AssetPicker";

export type TxType = 'buy' | 'sell' | 'dividend';

export type TransactionForm = {
  txType: TxType;
  quantity: string;
  price: string;
  date: string;
  currency: string;
  broker: string;
  /** Listeden seçilen varlık (yeni varlık kipinde kullanılmaz). */
  assetId: string;
  /** Yeni varlık kipi: listede olmayan bir varlık oluşturuluyor. */
  newAsset: boolean;
  /** Yeni varlık kipindeki sembol/ad/tip. */
  choice: AssetChoice;
};

/**
 * İşlem girme ve düzenleme modalı.
 *
 * page.tsx içinde satır içi duran son arayüz parçasıydı; ~20 state'e bağlı
 * olduğu için en son çıkarıldı. Saf bileşen: hiçbir I/O yapmaz, formun tamamı
 * tek bir `value` nesnesi + `onChange` ile yönetiliyor (ImportPreview ve
 * ShareModal ile aynı kalıp). Kaydetme ve fiyat çekme dışarıya devredilmiş.
 */
export default function TransactionModal({
  open, onClose, editing, assets, value, onChange, onSubmit,
  heldQuantity, onFetchHistoricalPrice, priceLookup, brokers,
}: {
  open: boolean;
  onClose: () => void;
  /** Düzenleme kipinde başlık ve buton metni değişir. */
  editing: boolean;
  assets: { id: string | number; symbol: string }[];
  value: TransactionForm;
  onChange: (next: TransactionForm) => void;
  onSubmit: () => void;
  /** Satışta uyarı için: seçili varlıktan elde tutulan adet. */
  heldQuantity: number;
  /** "O günkü fiyat" butonu. Fiyat elle değiştirilince `priceLookup`'ı
   *  'idle'a çekmek çağıranın işi — hata mesajı orada tutuluyor. */
  onFetchHistoricalPrice: () => void;
  priceLookup: 'idle' | 'loading' | 'error';
  /** Daha önce kullanılmış aracı kurumlar — serbest metin alanına öneri. */
  brokers: string[];
}) {
  if (!open) return null;

  const set = <K extends keyof TransactionForm>(key: K, v: TransactionForm[K]) =>
    onChange({ ...value, [key]: v });

  const selectedSymbol = assets.find(a => String(a.id) === String(value.assetId))?.symbol;
  const title = editing
    ? 'İşlemi Düzenle'
    : `${value.newAsset ? (value.choice.symbol || 'Yeni varlık') : (selectedSymbol ?? 'İşlem')} — İşlem Gir`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-3"
      >
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">{title}</h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {value.newAsset ? (
          <div className="bg-gray-700/50 border border-gray-600 rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">Yeni varlık</span>
              <button type="button"
                onClick={() => onChange({ ...value, newAsset: false, choice: { symbol: '', name: '', type: 'stock' } })}
                className="text-xs text-gray-400 underline">Listeden seç</button>
            </div>
            <AssetPicker value={value.choice} onChange={(c) => set('choice', c)} autoFocus />
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={value.assetId}
              onChange={(e) => set('assetId', e.target.value)}
              aria-label="Varlık"
              className="flex-1 p-2 rounded bg-gray-700 border border-gray-600"
            >
              {assets.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
            </select>
            {!editing && (
              <button type="button"
                onClick={() => onChange({ ...value, newAsset: true, choice: { symbol: '', name: '', type: 'stock' } })}
                title="Portföyde olmayan bir varlık ekle"
                className="px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm">+ Yeni</button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {([['buy', 'Alım'], ['sell', 'Satım'], ['dividend', 'Temettü']] as const).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => set('txType', kind)}
              aria-pressed={value.txType === kind}
              className={`flex-1 py-1.5 rounded text-sm transition-colors ${
                value.txType === kind ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >{label}</button>
          ))}
        </div>

        {value.txType === 'sell' && (
          <div className="text-xs text-gray-400">
            Elinizdeki adet: {heldQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}
          </div>
        )}

        {value.txType === 'dividend' ? (
          <input type="number" step="any" placeholder="Net temettü tutarı (toplam)"
            value={value.price} onChange={(e) => set('price', e.target.value)}
            className="w-full p-2 rounded bg-gray-700 border border-gray-600" required autoFocus />
        ) : (
          <>
            <input type="number" step="any" placeholder="Adet"
              value={value.quantity} onChange={(e) => set('quantity', e.target.value)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600" required autoFocus />
            <div className="flex gap-2">
              {/* min-w-0: input'un varsayılan taban genişliği flex satırını dar
                  ekranda modalın dışına taşırıyordu. */}
              <input type="number" step="any" placeholder="Fiyat"
                value={value.price} onChange={(e) => set('price', e.target.value)}
                className="flex-1 min-w-0 p-2 rounded bg-gray-700 border border-gray-600" required />
              <button
                type="button"
                onClick={onFetchHistoricalPrice}
                disabled={priceLookup === 'loading'}
                title="Seçili tarihteki fiyatı getir"
                className="shrink-0 px-3 rounded bg-gray-700 hover:bg-gray-600 text-xs whitespace-nowrap disabled:opacity-50"
              >
                {priceLookup === 'loading' ? '...' : 'O günkü fiyat'}
              </button>
            </div>
            {priceLookup === 'error' && (
              <div className="text-xs text-red-400">O tarihin fiyatı bulunamadı, elle gir.</div>
            )}
          </>
        )}

        <div className="flex gap-2">
          <input type="date" value={value.date} onChange={(e) => set('date', e.target.value)}
            aria-label="İşlem tarihi"
            className="flex-1 p-2 rounded bg-gray-700 border border-gray-600" required />
          {/* Fiyatın para birimi: ABD hisseleri USD işlem görür, TL varsayılırsa
              maliyet tamamen yanlış çıkar. */}
          <select value={value.currency} onChange={(e) => set('currency', e.target.value)}
            title="Girdiğin fiyatın para birimi" aria-label="Para birimi"
            className="p-2 rounded bg-gray-700 border border-gray-600">
            <option value="TRY">₺ TRY</option>
            <option value="USD">$ USD</option>
          </select>
        </div>

        {/* Aracı kurum serbest metin: kurum listesi sabit değil, daha önce
            yazdıkların öneri olarak geliyor. */}
        <input
          type="text"
          list="broker-suggestions"
          placeholder="Aracı kurum (Midas, Yapı Kredi...)"
          value={value.broker}
          onChange={(e) => set('broker', e.target.value)}
          aria-label="Aracı kurum"
          className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
        />
        <datalist id="broker-suggestions">
          {brokers.map(b => <option key={b} value={b} />)}
        </datalist>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600">İptal</button>
          {/* Kaydet butonu işlem tipine göre renk değiştirmiyordu: yeşil/kırmızı
              bu uygulamada yalnızca kâr/zarar demek (bkz. Faz 6 kapanışı). */}
          <button type="submit" className="flex-1 py-2 rounded font-bold bg-purple-600 hover:bg-purple-700">
            {editing ? 'Güncelle' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
