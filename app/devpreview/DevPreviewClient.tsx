"use client";

import { useState } from "react";
import PortfolioTable from "../components/PortfolioTable";
import ImportPreview, { type DupePolicy } from "../components/ImportPreview";
import ApiKeySettings from "../components/ApiKeySettings";
import AssetPicker, { type AssetChoice } from "../components/AssetPicker";
import BrokerBar from "../components/BrokerBar";
import PortfolioSwitch from "../components/PortfolioSwitch";
import DataSources from "../components/DataSources";
import SummaryBar from "../components/SummaryBar";
import PortfolioToolbar from "../components/PortfolioToolbar";
import ShareModal, { type ShareRecord } from "../components/ShareModal";
import TransactionModal, { type TransactionForm } from "../components/TransactionModal";
import ShareView from "../components/ShareView";
import { buildShareSnapshot, DEFAULT_SHARE_COLUMNS, type ShareConfig } from "../../lib/shares";
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

// NOT: Tailwind'in xl:/md: gibi sınıfları GERÇEK tarayıcı penceresine bakar,
// bir div'in max-width'ine değil. Mobili doğru görmek için Browser'ın kendi
// penceresini küçültmek gerekiyor (mcp Claude_Browser resize_window ile) —
// bu bileşeni bir kutuya sıkıştırmak yanıltıcı sonuç verir (grid xl:
// kırılımında kalıp içeriği ezer). Bu yüzden burada tek bir "width" seçeneği
// var; mobil kontrolü pencereyi küçülterek yap.
function FullPageMock() {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showClosed, setShowClosed] = useState(false);
  const [broker, setBroker] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState('');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txEditing, setTxEditing] = useState(false);
  const [txForm, setTxForm] = useState<TransactionForm>({
    txType: 'buy', quantity: '', price: '', date: '2026-08-20',
    currency: 'TRY', broker: '', assetId: '1', newAsset: false,
    choice: { symbol: '', name: '', type: 'stock' },
  });
  const [rangeOpen, setRangeOpen] = useState(false);
  const brokerTotals = [
    { broker: 'Midas', value: 1414508.61 },
    { broker: 'Yapı Kredi', value: 2186275.2 },
    { broker: '', value: 170700 },
  ];

  return (
    <div className="bg-gray-900 text-white p-8 font-sans border border-gray-800 rounded-2xl overflow-hidden">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Portföy Takip</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>ornek@eposta.com</span><span>·</span>
              <button className="underline hover:text-white">Çıkış yap</button>
            </div>
          </div>
          <SummaryBar
            totalValue={fx.totals.value} totalValueUSD={fx.totals.valueUSD}
            totalUnrealizedPL={fx.totals.unrealizedPL} totalRealizedPL={fx.totals.realizedPL}
            totalPLUSD={12475.1} mode="live"
          />
        </header>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <PortfolioSwitch scenarios={['Sanal']} active={portfolio} onChange={setPortfolio} />
        </div>

        <nav className="flex gap-1 border-b border-gray-700 mb-6">
          {(['Portföy', 'İşlemler', 'Karşılaştırma']).map((label, i) => (
            <button key={label} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              i === 0 ? 'border-purple-400 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}>{label}</button>
          ))}
        </nav>

        <PortfolioToolbar
          asOfDate="" onAsOfDateChange={() => {}} asOfLoading={false}
          rangeStart="" rangeEnd="" onRangeStartChange={() => {}} onRangeEndChange={() => {}}
          onCalculateRange={() => {}} rangeLoading={false} rangeResult={null}
          rangeOpen={rangeOpen} onToggleRange={() => setRangeOpen(o => !o)}
        />

        <BrokerBar totals={brokerTotals} selected={broker} onSelect={setBroker}
          grandTotal={brokerTotals.reduce((a, b) => a + b.value, 0)} />

        <div className="bg-gray-800 rounded-xl border border-gray-700 mb-8 flex items-center justify-center text-gray-600 text-sm h-64">
          [ Portföy değeri grafiği — canlı veri çektiği için burada yer tutucu ]
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors font-semibold">+ Yeni varlık</button>
          <button className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors font-semibold">⬆ İşlem içe aktar</button>
        </div>

        <div>
            <PortfolioTable
              openPositions={fx.positions} closedPositions={fx.closedPositions} totals={fx.totals}
              isHistorical={false} asOfDate="" loading={false}
              sortKey={sortKey} sortDir={sortDir}
              onSort={(k) => { setSortDir(d => (k === sortKey && d === 'desc' ? 'asc' : 'desc')); setSortKey(k); }}
              editingPriceIds={new Set()} onToggleEditPrice={() => {}} onPriceChange={() => {}}
              onOpenTx={() => {}} showClosed={showClosed} onToggleClosed={() => setShowClosed(s => !s)}
              onRefresh={() => {}} onShare={() => {}}
            />
        </div>

        <DataSources />
      </div>
    </div>
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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [demoShares, setDemoShares] = useState<ShareRecord[]>([
    {
      id: 'demo-1', title: 'Hisse portföyüm',
      config: { assetTypes: ['stock'], columns: DEFAULT_SHARE_COLUMNS },
      created_at: '2026-08-20T10:00:00Z', refreshed_at: '2026-08-22T09:00:00Z',
    },
  ]);
  const [broker, setBroker] = useState<string | null>(null);
  const [importBroker, setImportBroker] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState('');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txEditing, setTxEditing] = useState(false);
  const [txForm, setTxForm] = useState<TransactionForm>({
    txType: 'buy', quantity: '', price: '', date: '2026-08-20',
    currency: 'TRY', broker: '', assetId: '1', newAsset: false,
    choice: { symbol: '', name: '', type: 'stock' },
  });

  const isEmptyCase = tableCase === 'empty' || tableCase === 'loading';
  // Yinelenen bayrakları senaryoya göre: 1. ve 3. satır zaten portföyde varmış gibi.
  const dupFlags = importCase === 'duplicates'
    ? fx.importRows.map((_, i) => i === 0 || i === 2)
    : fx.importRows.map(() => false);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 sm:p-8 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-10">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Tam sayfa kompozisyonu</h2>
          <p className="text-xs text-gray-500">
            Mobili görmek için tarayıcı penceresini küçült (Tailwind kırılımları pencere genişliğine bakar).
          </p>
          <div className="overflow-x-auto"><FullPageMock /></div>
        </section>

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
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">İşlem modalı</h2>
          <div className="flex gap-2">
            <button onClick={() => { setTxEditing(false); setTxModalOpen(true); }}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700">
              Yeni işlem
            </button>
            <button onClick={() => { setTxEditing(true); setTxModalOpen(true); }}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-gray-700 hover:bg-gray-600">
              Düzenleme kipi
            </button>
          </div>
          <TransactionModal
            open={txModalOpen}
            onClose={() => setTxModalOpen(false)}
            editing={txEditing}
            assets={[{ id: '1', symbol: 'THYAO' }, { id: '2', symbol: 'AAPL' }, { id: '3', symbol: 'SASA' }]}
            value={txForm}
            onChange={setTxForm}
            onSubmit={() => setTxModalOpen(false)}
            heldQuantity={137.5}
            onFetchHistoricalPrice={() => setTxForm(f => ({ ...f, price: '305.25' }))}
            priceLookup="idle"
            brokers={['Midas', 'Yapı Kredi', 'İş Yatırım']}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Paylaşım modalı</h2>
          <button onClick={() => setShareModalOpen(true)} className="px-3 py-1.5 rounded text-xs font-semibold bg-orange-600 hover:bg-orange-700">
            Paylaşım modalını aç
          </button>
          <ShareModal
            open={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            assetCounts={{ stock: 3, fund: 1, currency: 1, metal: 1, crypto: 1 }}
            busy={false}
            error=""
            shares={demoShares}
            sharesLoading={false}
            onCreate={(title, config) => setDemoShares(prev => [
              { id: `demo-${prev.length + 2}`, title: title || null, config, created_at: new Date().toISOString(), refreshed_at: new Date().toISOString() },
              ...prev,
            ])}
            onRefresh={(id) => setDemoShares(prev => prev.map(s => s.id === id ? { ...s, refreshed_at: new Date().toISOString() } : s))}
            onDelete={(id) => setDemoShares(prev => prev.filter(s => s.id !== id))}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Paylaşım görünümü (genel sayfa)</h2>
          <p className="text-xs text-gray-500">/paylasim/[id] rotasının gerçekte çizdiği bileşen — sadece hisseler, K/Z açık, Değer KAPALI (dip toplam hatasının yaşandığı ayar).</p>
          <div className="border border-gray-700 rounded-xl overflow-hidden">
            <ShareView
              title="Hisse portföyüm"
              updatedAt="2026-08-22T09:00:00Z"
              snapshot={buildShareSnapshot(
                fx.positions,
                { assetTypes: ['stock'], columns: { ...DEFAULT_SHARE_COLUMNS, value: false } } as ShareConfig,
              )}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Veri kaynağı künyesi</h2>
          <DataSources />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Portföy anahtarı</h2>
          <PortfolioSwitch scenarios={['Sanal', 'NVDA senaryosu']} active={portfolio} onChange={setPortfolio} />
          <div className="text-xs text-gray-500">Aktif: <code className="text-gray-300">{portfolio || '(gerçek)'}</code></div>
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
