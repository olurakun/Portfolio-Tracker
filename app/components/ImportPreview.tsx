"use client";

import type { ParsedRow } from "../../lib/importParse";
import { normalizeBroker, UNASSIGNED } from "../../lib/brokers";

export type ImportMeta = { skipped: string[]; sourceTransactionCount: number | null };
export type DupePolicy = 'skip' | 'include';

const TYPE_LABEL: Record<string, string> = { buy: 'Alım', sell: 'Satım', dividend: 'Temettü' };

/**
 * İçe aktarma önizlemesi. Hiçbir şey buradan doğrudan kaydedilmez — bu ekranın
 * tek işi, kaydetmeden önce dosyada ne olduğunu ve neyin atlanacağını
 * göstermek. Uyarıların üçü de sessizce yanlış hesaplanan bir maliyeti
 * önlemek için var: yinelenen işlemler, eksik geçmiş alımlar ve para birimi.
 */
export default function ImportPreview({
  rows, duplicateFlags, dupePolicy, onDupePolicyChange, meta, negatives,
  newSymbolChoices, onNewSymbolChoice, newSymbolTypes, onNewSymbolType,
  currencies, onCurrencyChange, knownBrokers, brokerOverride, onBrokerOverrideChange,
  busy, onCancel, onConfirm,
}: {
  rows: ParsedRow[];
  duplicateFlags: boolean[];
  dupePolicy: DupePolicy;
  onDupePolicyChange: (policy: DupePolicy) => void;
  meta: ImportMeta | null;
  negatives: { symbol: string; net: number }[];
  newSymbolChoices: Record<string, 'create' | 'skip'>;
  onNewSymbolChoice: (symbol: string, choice: 'create' | 'skip') => void;
  newSymbolTypes: Record<string, string>;
  onNewSymbolType: (symbol: string, type: string) => void;
  currencies: Record<string, string>;
  onCurrencyChange: (symbol: string, currency: string) => void;
  /** Portföyde daha önce geçen kurumlar; öneri olarak sunulur. */
  knownBrokers: string[];
  /** null = dosyadaki değerler kullanılsın. Aksi hâlde TÜM satırlara bu yazılır. */
  brokerOverride: string | null;
  onBrokerOverrideChange: (broker: string | null) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isSkipped = (r: ParsedRow, i: number) =>
    !!r.error || (dupePolicy === 'skip' && duplicateFlags[i]);
  const willImport = rows.filter((r, i) => !isSkipped(r, i)).length;
  const errorCount = rows.filter(r => r.error).length;
  const duplicateCount = duplicateFlags.filter(Boolean).length;

  const fileHasBrokers = rows.some(r => normalizeBroker(r.broker));
  const brokerFor = (r: ParsedRow) => (brokerOverride === null ? normalizeBroker(r.broker) : brokerOverride);
  // Dosyada kurum yoksa ve kullanıcı da seçmediyse uyarı: aktarma engellenmiyor
  // ama kırılım sonradan elle doldurulmak zorunda kalır.
  const brokerMissing = !fileHasBrokers && !brokerOverride;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-bold text-lg text-orange-400">İçe Aktarma Önizlemesi</h2>
          <p className="text-sm text-gray-400 mt-1">
            {willImport} satır aktarılacak
            {errorCount > 0 && `, ${errorCount} hatalı (atlanacak)`}
            {dupePolicy === 'skip' && duplicateCount > 0 && `, ${duplicateCount} yinelenen (atlanacak)`}
          </p>

          {duplicateCount > 0 && (
            <div className="mt-3 bg-gray-900/60 border border-gray-700 rounded p-3">
              <div className="font-bold text-sm text-gray-200">
                {duplicateCount} satır portföyünde zaten var
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Sembol, işlem, tarih, adet, fiyat ve para birimi birebir aynı. Ekstre
                aralıkları örtüştüğünde bu normaldir; ikinci kez eklenirse maliyet
                ve kâr/zarar bozulur.
              </p>
              {/* Kesinlik değil sinyal: aynı gün aynı fiyattan iki ayrı alım
                  gerçekten olabilir (kısmi gerçekleşen emir). Karar kullanıcının. */}
              <label className="flex items-center gap-2 mt-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dupePolicy === 'include'}
                  onChange={(e) => onDupePolicyChange(e.target.checked ? 'include' : 'skip')}
                  className="accent-orange-600"
                />
                Bunlar ayrı işlemler, yine de aktar
              </label>
            </div>
          )}

          {meta && (
            <div className="mt-3 bg-gray-900/60 border border-gray-700 rounded p-3 space-y-2">
              <div className="text-sm font-bold text-orange-400">
                Bu satırlar dosyadan çevrildi — göndermeden önce kontrol et
              </div>
              {/* Bir dönüştürücünün en tehlikeli hatası satır atlamaktır: sayılar
                  tutmuyorsa kullanıcı bunu onaydan ÖNCE görmeli. */}
              {meta.sourceTransactionCount !== null && (
                <div className={`text-xs ${
                  meta.sourceTransactionCount === rows.length ? 'text-gray-400' : 'text-amber-400'
                }`}>
                  Dosyada {meta.sourceTransactionCount} işlem sayıldı, {rows.length} satır çıkarıldı
                  {meta.sourceTransactionCount !== rows.length && ' — sayılar tutmuyor, dosyayla karşılaştır.'}
                </div>
              )}
              {meta.skipped.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-300">
                    {meta.skipped.length} hareket atlandı
                  </summary>
                  <ul className="mt-2 space-y-1 text-gray-400 max-h-40 overflow-y-auto">
                    {meta.skipped.map((reason, i) => <li key={i}>• {reason}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {negatives.length > 0 && (
            <div className="mt-3 bg-amber-950/50 border border-amber-700/60 rounded p-3">
              <div className="font-bold text-sm text-amber-400">
                Bu dosyada geçmiş alımlar eksik görünüyor
              </div>
              <p className="text-xs text-gray-300 mt-1">
                Aşağıdaki sembollerde satış, elindeki ve dosyadaki alımların toplamından fazla.
                Bu hâliyle aktarırsan maliyet ve kâr/zarar yanlış hesaplanır.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {negatives.map(n => (
                  <span key={n.symbol} className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1">
                    <span className="font-bold">{n.symbol}</span>
                    <span className="text-amber-400 ml-1">
                      {n.net.toLocaleString('tr-TR', { maximumFractionDigits: 6 })} adet açık
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Dosyayı tamamlayıp yeniden yüklemen önerilir. Yine de devam edebilirsin.
              </p>
            </div>
          )}
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {Object.keys(newSymbolChoices).length > 0 && (
            <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
              <div className="font-bold text-sm mb-2">Portföyünde olmayan semboller</div>
              <div className="space-y-2">
                {Object.keys(newSymbolChoices).map(sym => (
                  <div key={sym} className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold w-24">{sym}</span>
                    <select
                      value={newSymbolChoices[sym]}
                      onChange={(e) => onNewSymbolChoice(sym, e.target.value as 'create' | 'skip')}
                      aria-label={`${sym} için karar`}
                      className="p-1 rounded bg-gray-700 border border-gray-600 text-sm"
                    >
                      <option value="create">Yeni varlık oluştur</option>
                      <option value="skip">Atla</option>
                    </select>
                    {newSymbolChoices[sym] === 'create' && (
                      <select
                        value={newSymbolTypes[sym] || 'stock'}
                        onChange={(e) => onNewSymbolType(sym, e.target.value)}
                        aria-label={`${sym} varlık tipi`}
                        className="p-1 rounded bg-gray-700 border border-gray-600 text-sm"
                      >
                        <option value="stock">Hisse</option>
                        <option value="fund">Fon</option>
                        <option value="currency">Döviz</option>
                        <option value="metal">Değerli Maden</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`border rounded p-3 ${
            brokerMissing ? 'bg-amber-950/30 border-amber-700/50' : 'bg-gray-900/50 border-gray-700'
          }`}>
            <div className="font-bold text-sm mb-1">Aracı kurum</div>
            <p className="text-xs text-gray-400 mb-2">
              {fileHasBrokers
                ? 'Dosyada kurum bilgisi var. İstersen tümünü tek bir kuruma çevirebilirsin.'
                : 'Ekstre genelde tek bir kuruma aittir; buradan tüm satırlara birden atayabilirsin.'}
            </p>
            <select
              value={brokerOverride === null ? '__file__' : (brokerOverride || UNASSIGNED)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__file__') { onBrokerOverrideChange(null); return; }
                if (v === '__new__') {
                  const typed = normalizeBroker(prompt('Aracı kurum adı:') ?? '');
                  if (typed) onBrokerOverrideChange(typed);
                  return;
                }
                onBrokerOverrideChange(v);
              }}
              aria-label="Aracı kurum"
              className="p-2 rounded bg-gray-700 border border-gray-600 text-sm"
            >
              {fileHasBrokers && <option value="__file__">Dosyadaki değerler</option>}
              <option value={UNASSIGNED}>— Belirtilmemiş</option>
              {knownBrokers.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
              <option value="__new__">+ Yeni kurum…</option>
            </select>
          </div>

          {Object.keys(currencies).length > 0 && (
            <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
              <div className="font-bold text-sm mb-1">Para birimleri</div>
              <p className="text-xs text-gray-400 mb-2">
                Fiyatların hangi para biriminde olduğunu kontrol et. Yanlış seçim maliyeti tamamen bozar
                (ör. ABD hisseleri genelde USD, BIST hisseleri TRY).
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(currencies).sort().map(sym => (
                  <div key={sym} className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-1">
                    <span className="font-bold text-sm">{sym}</span>
                    <select
                      value={currencies[sym]}
                      onChange={(e) => onCurrencyChange(sym, e.target.value)}
                      aria-label={`${sym} para birimi`}
                      className="p-1 rounded bg-gray-700 border border-gray-600 text-xs"
                    >
                      <option value="TRY">TRY ₺</option>
                      <option value="USD">USD $</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[560px]">
              <thead className="bg-gray-900/50 text-gray-400">
                <tr>
                  <th className="p-2">Satır</th>
                  <th className="p-2">Sembol</th>
                  <th className="p-2">İşlem</th>
                  <th className="p-2 text-right">Adet</th>
                  <th className="p-2 text-right">Fiyat</th>
                  <th className="p-2">Tarih</th>
                  <th className="p-2">Aracı</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const skipped = isSkipped(r, i);
                  return (
                    <tr key={i} className={`border-b border-gray-700 ${
                      r.error ? 'text-red-400' : skipped ? 'text-gray-500' : ''
                    }`}>
                      <td className="p-2 tabular-nums">{r.row}</td>
                      <td className="p-2 font-bold">{r.symbol}</td>
                      <td className="p-2">{TYPE_LABEL[r.type] ?? r.type}</td>
                      <td className="p-2 text-right tabular-nums">{r.quantity}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">
                        {r.price}
                        <span className="text-gray-500 ml-1">
                          {(currencies[r.symbol] || r.currency) === 'USD' ? '$' : '₺'}
                        </span>
                      </td>
                      <td className="p-2">{r.error ? r.error : r.date}</td>
                      <td className="p-2 text-xs text-gray-400 whitespace-nowrap">
                        {brokerFor(r) || <span className="text-gray-600">—</span>}
                      </td>
                      <td className="p-2">
                        {duplicateFlags[i] && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-900/70 border border-gray-700 text-amber-300/90 whitespace-nowrap">
                            Yinelenen
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600">İptal</button>
          <button onClick={onConfirm} disabled={busy || willImport === 0}
            className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 font-bold disabled:opacity-50">
            {busy ? 'Aktarılıyor...' : `${willImport} işlemi aktar`}
          </button>
        </div>
      </div>
    </div>
  );
}
