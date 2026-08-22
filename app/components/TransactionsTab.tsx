"use client";

import { useMemo, useState } from "react";
import { convertTxPrice, type FxRates, type Transaction } from "../../lib/portfolio";
import { brokersOf, brokerKey, brokerLabel, normalizeBroker, UNASSIGNED } from "../../lib/brokers";

type Asset = { id: string | number; symbol: string; type: string };
type Tx = Transaction & { id: number | string; created_at?: string; broker?: string | null };

const TYPE_LABEL: Record<string, string> = { buy: 'Alım', sell: 'Satım', dividend: 'Temettü' };
// İşlem tipi RENKLE değil kelimeyle ayrışıyor: yeşil/kırmızı bu uygulamada
// yalnızca kâr/zarar demek (bkz. Faz 6 kapanışı). "Alım"/"Satım" zaten
// tek başına anlaşılır; renk vermek kullanıcıya portföy sekmesinde öğrendiği
// anlamı burada yanlış okutma riski taşıyordu.
const TYPE_CLASS: Record<string, string> = {
  buy: 'text-gray-300', sell: 'text-gray-300', dividend: 'text-gray-300',
};

/**
 * Bir içe aktarma partisi, birbirine yakın zamanda oluşturulmuş kayıtlar demek.
 * Yanlış bir dosya aktarıldığında tek tek silmek yerine partiyi topluca silmek
 * gerekiyor — kullanıcı bunu daha önce veritabanında elle yapmak zorunda kalmıştı.
 */
export function groupIntoBatches(rows: Tx[], gapSeconds = 120) {
  const withTime = rows.filter(r => r.created_at).slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const batches: { key: string; createdAt: string; rows: Tx[] }[] = [];
  for (const row of withTime) {
    const t = new Date(row.created_at!).getTime();
    const last = batches[batches.length - 1];
    const lastT = last ? new Date(last.rows[last.rows.length - 1].created_at!).getTime() : null;
    if (last && lastT !== null && t - lastT <= gapSeconds * 1000) {
      last.rows.push(row);
    } else {
      batches.push({ key: String(row.created_at), createdAt: String(row.created_at), rows: [row] });
    }
  }
  // Tek tek girilmiş kayıtlar parti sayılmaz.
  return batches.filter(b => b.rows.length > 1).reverse();
}

export default function TransactionsTab({
  assets, transactions, fxRates, onEdit, onDelete, onDeleteMany, onDeleteAsset, onAdd,
  onSetAssetBroker,
}: {
  assets: Asset[];
  transactions: Tx[];
  fxRates: FxRates;
  onEdit: (tx: Tx) => void;
  onDelete: (tx: Tx) => void;
  onDeleteMany: (rows: Tx[], label: string) => void;
  onDeleteAsset: (asset: Asset) => void;
  onAdd: () => void;
  onSetAssetBroker: (asset: Asset, broker: string) => void;
}) {
  const [assetFilter, setAssetFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [brokerFilter, setBrokerFilter] = useState('all');
  const brokers = useMemo(() => brokersOf(transactions), [transactions]);

  const assetById = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets) m.set(String(a.id), a);
    return m;
  }, [assets]);

  const rows = useMemo(() => {
    return transactions
      .filter(tx => assetFilter === 'all' || String(tx.asset_id) === assetFilter)
      .filter(tx => typeFilter === 'all' || tx.type === typeFilter)
      .filter(tx => brokerFilter === 'all' || brokerKey(tx.broker) === brokerKey(brokerFilter))
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
                      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  }, [transactions, assetFilter, typeFilter, brokerFilter]);

  const batches = useMemo(() => groupIntoBatches(transactions), [transactions]);

  const amountTL = (tx: Tx) => {
    const p = convertTxPrice(tx, fxRates);
    if (!p) return null;
    return Number(tx.quantity) * p.tl;
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Varlık</label>
          <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)}
            className="p-2 rounded bg-gray-700 border border-gray-600 text-sm">
            <option value="all">Hepsi</option>
            {assets.slice().sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'))
              .map(a => <option key={a.id} value={String(a.id)}>{a.symbol}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">İşlem tipi</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="p-2 rounded bg-gray-700 border border-gray-600 text-sm">
            <option value="all">Hepsi</option>
            <option value="buy">Alım</option>
            <option value="sell">Satım</option>
            <option value="dividend">Temettü</option>
          </select>
        </div>
        {brokers.length > 1 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Aracı kurum</label>
            <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)}
              className="p-2 rounded bg-gray-700 border border-gray-600 text-sm">
              <option value="all">Hepsi</option>
              {brokers.map(b => (
                <option key={b || UNASSIGNED} value={b}>{brokerLabel(b)}</option>
              ))}
            </select>
          </div>
        )}
        <button onClick={onAdd} className="ml-auto bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-bold text-sm">
          + İşlem ekle
        </button>
      </div>

      {batches.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="font-bold text-sm mb-1">Toplu aktarmalar</div>
          <p className="text-xs text-gray-400 mb-3">
            Bir dosya yanlış aktarıldıysa partinin tamamını tek seferde geri alabilirsin.
          </p>
          <div className="space-y-2">
            {batches.map(b => {
              const symbols = Array.from(new Set(b.rows.map(r => assetById.get(String(r.asset_id))?.symbol ?? '?')));
              return (
                <div key={b.key} className="flex items-center gap-3 flex-wrap bg-gray-900/40 border border-gray-700 rounded px-3 py-2">
                  <span className="text-sm font-bold">{b.rows.length} işlem</span>
                  <span className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString('tr-TR')}</span>
                  <span className="text-xs text-gray-500 truncate max-w-md">
                    {symbols.slice(0, 6).join(', ')}{symbols.length > 6 ? ` +${symbols.length - 6}` : ''}
                  </span>
                  <button
                    onClick={() => onDeleteMany(b.rows, `${new Date(b.createdAt).toLocaleString('tr-TR')} tarihli aktarma (${b.rows.length} işlem)`)}
                    className="ml-auto text-xs px-2.5 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                  >Partiyi sil</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="font-bold text-lg">İşlemler</h2>
          <span className="text-sm text-gray-400">{rows.length} kayıt</span>
        </div>

        {/* DAR EKRAN: sekiz sütunlu tablo 375px'e sığmıyor (portföy tablosunda
            çözdüğümüz sorunun aynısı). Kartta hiyerarşi: varlık + tutar üstte,
            tarih/adet/fiyat ikincil, eylemler altta. */}
        <div className="md:hidden">
          {rows.map(tx => {
            const asset = assetById.get(String(tx.asset_id));
            const cur = (tx.currency || 'TRY').toUpperCase();
            const total = amountTL(tx);
            const broker = normalizeBroker(tx.broker);
            return (
              <div key={String(tx.id)} className="border-b border-gray-700/60 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold">{asset?.symbol ?? '—'}</span>
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-gray-900/70 border border-gray-700 ${TYPE_CLASS[tx.type] ?? ''}`}>
                      {TYPE_LABEL[tx.type] ?? tx.type}
                    </span>
                  </div>
                  <div className="font-bold tabular-nums whitespace-nowrap shrink-0">
                    {total === null ? '—' : `${total.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-3 mt-1.5 text-xs text-gray-500">
                  <span className="tabular-nums">{tx.date}</span>
                  <span className="tabular-nums whitespace-nowrap">
                    {tx.type === 'dividend'
                      ? `${Number(tx.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${cur === 'USD' ? '$' : '₺'}`
                      : `${Number(tx.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 6 })} × ${Number(tx.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${cur === 'USD' ? '$' : '₺'}`}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 mt-2.5">
                  <span className="text-xs text-gray-600 truncate">{broker || '—'}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => onEdit(tx)}
                      className="px-2.5 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600">Düzenle</button>
                    <button onClick={() => onDelete(tx)}
                      className="px-2.5 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors">Sil</button>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-10 text-center text-gray-500 text-sm">
              {transactions.length === 0 ? 'Henüz işlem yok.' : 'Bu filtreye uyan işlem yok.'}
            </div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900/50 text-gray-400">
              <tr>
                <th className="px-3 py-2.5">Tarih</th>
                <th className="px-3 py-2.5">Varlık</th>
                <th className="px-3 py-2.5">İşlem</th>
                <th className="px-3 py-2.5 text-right">Adet</th>
                <th className="px-3 py-2.5 text-right">Fiyat</th>
                <th className="px-3 py-2.5 text-right">Tutar (₺)</th>
                <th className="px-3 py-2.5">Aracı</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => {
                const asset = assetById.get(String(tx.asset_id));
                const cur = (tx.currency || 'TRY').toUpperCase();
                const total = amountTL(tx);
                return (
                  <tr key={String(tx.id)} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="px-3 py-2.5 tabular-nums text-gray-300">{tx.date}</td>
                    <td className="px-3 py-2.5 font-bold">{asset?.symbol ?? '—'}</td>
                    <td className={`px-3 py-2.5 ${TYPE_CLASS[tx.type] ?? ''}`}>{TYPE_LABEL[tx.type] ?? tx.type}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {tx.type === 'dividend' ? '—' : Number(tx.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 6 })}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {Number(tx.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      <span className="text-gray-500 ml-1">{cur === 'USD' ? '$' : '₺'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">
                      {total === null ? '—' : total.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">
                      {normalizeBroker(tx.broker) || <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => onEdit(tx)} title="Düzenle"
                          className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600">Düzenle</button>
                        <button onClick={() => onDelete(tx)} title="Sil"
                          className="px-2 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors">Sil</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">
                  {transactions.length === 0 ? 'Henüz işlem yok.' : 'Bu filtreye uyan işlem yok.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <div className="font-bold text-sm mb-1">Varlıklar</div>
        <p className="text-xs text-gray-400 mb-3">
          Aracı kurumu buradan varlığın TÜM işlemlerine birden atayabilirsin.
          Bir varlığı silmek, ona ait tüm işlemleri de siler.
        </p>
        <div className="space-y-1.5">
          {assets.slice().sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr')).map(a => {
            const rows = transactions.filter(t => String(t.asset_id) === String(a.id));
            // Bir varlığın işlemleri farklı kurumlarda olabilir; o durumda toplu
            // atama teklif etmek yanlış olur, "karışık" deyip elden düzenlemeye bırakırız.
            const distinct = brokersOf(rows);
            const current = distinct.length === 1 ? distinct[0] : null;
            return (
              <div key={a.id} className="flex items-center gap-2 flex-wrap bg-gray-900/40 border border-gray-700 rounded px-2.5 py-1.5">
                <span className="text-sm font-bold w-20">{a.symbol}</span>
                <span className="text-xs text-gray-500 w-16">{rows.length} işlem</span>

                {distinct.length > 1 ? (
                  <span className="text-xs text-amber-400/80">karışık ({distinct.map(brokerLabel).join(', ')})</span>
                ) : (
                  <select
                    value={current ?? UNASSIGNED}
                    onChange={(e) => {
                      const picked = e.target.value === '__new__'
                        ? normalizeBroker(prompt('Aracı kurum adı:') ?? '')
                        : e.target.value;
                      if (e.target.value === '__new__' && !picked) return;
                      onSetAssetBroker(a, picked);
                    }}
                    aria-label={`${a.symbol} aracı kurumu`}
                    className="p-1 rounded bg-gray-700 border border-gray-600 text-xs max-w-[180px]"
                  >
                    <option value={UNASSIGNED}>— Belirtilmemiş</option>
                    {brokers.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
                    <option value="__new__">+ Yeni kurum…</option>
                  </select>
                )}

                <button
                  onClick={() => onDeleteAsset(a)}
                  title={`${a.symbol} sil`}
                  className="ml-auto text-gray-500 hover:text-red-400 text-xs"
                >✕</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
