"use client";

import { useState } from "react";
import PortfolioTable from "../components/PortfolioTable";
import ImportPreview, { type DupePolicy } from "../components/ImportPreview";
import ApiKeySettings from "../components/ApiKeySettings";
import AssetPicker, { type AssetChoice } from "../components/AssetPicker";
import BrokerBar from "../components/BrokerBar";
import type { SortKey, SortDir } from "../../lib/sortPositions";
import * as fx from "./fixtures";

type TableCase = 'normal' | 'loading' | 'empty' | 'historical';
type ImportCase = null | 'normal' | 'duplicates' | 'converted' | 'negatives';

const TABLE_CASES: [TableCase, string][] = [
  ['normal', 'Normal'], ['loading', 'Yükleniyor'], ['empty', 'Boş'], ['historical', 'Geçmiş tarih'],
];
const IMPORT_CASES: [Exclude<ImportCase, null>, string][] = [
  ['normal', 'Normal'], ['duplicates', 'Yinelenen işlemler'],
  ['converted', 'Yapay zekâ ile çevrilmiş'], ['negatives', 'Eksik geçmiş alım'],
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
      active ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
    }`}>{children}</button>
  );
}

export default function DevPreviewClient() {
  const [tableCase, setTableCase] = useState<TableCase>('normal');
  const [importCase, setImportCase] = useState<ImportCase>(null);
  const [dupePolicy, setDupePolicy] = useState<DupePolicy>('skip');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [currencies, setCurrencies] = useState<Record<string, string>>({
    THYAO: 'TRY', AAPL: 'USD', TLY: 'TRY', SASA: 'TRY',
  });
  const [choices, setChoices] = useState<Record<string, 'create' | 'skip'>>({ TLY: 'create' });
  const [types, setTypes] = useState<Record<string, string>>({ TLY: 'fund' });
  const [choice, setChoice] = useState<AssetChoice>({ symbol: '', name: '', type: 'stock' });
  const [broker, setBroker] = useState<string | null>(null);
  const [importBroker, setImportBroker] = useState<string | null>(null);

  const isEmptyCase = tableCase === 'empty' || tableCase === 'loading';
  // Yinelenen bayrakları senaryoya göre: 1. ve 3. satır zaten portföyde varmış gibi.
  const dupFlags = importCase === 'duplicates'
    ? fx.importRows.map((_, i) => i === 0 || i === 2)
    : fx.importRows.map(() => false);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 sm:p-8 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-10">
        <header>
          <h1 className="text-xl font-bold">Bileşen önizlemesi</h1>
          <p className="text-sm text-gray-400 mt-1">
            Gerçek bileşenler, sahte veriyle. Yalnızca geliştirme ortamında açılır;
            oturum ve veritabanı gerektirmez.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mr-2">Portföy tablosu</h2>
            {TABLE_CASES.map(([key, label]) => (
              <Chip key={key} active={tableCase === key} onClick={() => setTableCase(key)}>{label}</Chip>
            ))}
          </div>
          <PortfolioTable
            openPositions={isEmptyCase ? [] : fx.positions}
            closedPositions={isEmptyCase ? [] : fx.closedPositions}
            totals={isEmptyCase ? fx.emptyTotals : fx.totals}
            isHistorical={tableCase === 'historical'}
            asOfDate={tableCase === 'historical' ? '2026-03-14' : ''}
            loading={tableCase === 'loading'}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(k) => { setSortDir(d => (k === sortKey && d === 'desc' ? 'asc' : 'desc')); setSortKey(k); }}
            editingPriceIds={editing}
            onToggleEditPrice={(id) => setEditing(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            onPriceChange={() => {}}
            onOpenTx={() => {}}
            showClosed={showClosed}
            onToggleClosed={() => setShowClosed(s => !s)}
            onRefresh={() => {}}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Aracı kurum kırılımı</h2>
          <BrokerBar totals={fx.brokerTotals} selected={broker} onSelect={setBroker}
            grandTotal={fx.brokerTotals.reduce((a, b) => a + b.value, 0)} />
          <div className="text-xs text-gray-500">Seçili: <code className="text-gray-300">{String(broker)}</code></div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Varlık seçici</h2>
          <div className="max-w-sm bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-3">
            {/* Gerçek /api/search'e gider — "INFO" yazıp Info Yatırım'ın çıktığı görülebilir. */}
            <AssetPicker value={choice} onChange={setChoice} />
            <div className="text-xs text-gray-500">
              Seçilen: <code className="text-gray-300">{JSON.stringify(choice)}</code>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">API anahtarı ayarı</h2>
          <div className="max-w-sm bg-gray-800 p-6 rounded-xl border border-gray-700">
            <ApiKeySettings />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mr-2">İçe aktarma önizlemesi</h2>
            {IMPORT_CASES.map(([key, label]) => (
              <Chip key={key} active={importCase === key} onClick={() => { setImportCase(key); setDupePolicy('skip'); }}>
                {label}
              </Chip>
            ))}
          </div>
          <p className="text-sm text-gray-500">Modal olduğu için seçince ekranı kaplar; İptal ile kapanır.</p>
        </section>
      </div>

      {importCase && (
        <ImportPreview
          rows={fx.importRows}
          duplicateFlags={dupFlags}
          dupePolicy={dupePolicy}
          onDupePolicyChange={setDupePolicy}
          meta={importCase === 'converted' ? fx.importMeta : null}
          negatives={importCase === 'negatives' ? fx.negatives : []}
          newSymbolChoices={choices}
          onNewSymbolChoice={(sym, choice) => setChoices(prev => ({ ...prev, [sym]: choice }))}
          newSymbolTypes={types}
          onNewSymbolType={(sym, type) => setTypes(prev => ({ ...prev, [sym]: type }))}
          currencies={currencies}
          onCurrencyChange={(sym, cur) => setCurrencies(prev => ({ ...prev, [sym]: cur }))}
          knownBrokers={['Midas', 'Yapı Kredi']}
          brokerOverride={importBroker}
          onBrokerOverrideChange={setImportBroker}
          busy={false}
          onCancel={() => setImportCase(null)}
          onConfirm={() => setImportCase(null)}
        />
      )}
    </div>
  );
}
