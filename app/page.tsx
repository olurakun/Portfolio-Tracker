"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import PortfolioChart from "./components/PortfolioChart";
import { computePosition, convertTxPrice, heldQuantity, findNegativePositions } from "../lib/portfolio";
import { findDuplicateRows } from "../lib/importParse";
import { brokersOf, filterByBroker, normalizeBroker } from "../lib/brokers";
import { REAL, DEFAULT_SCENARIO, filterByPortfolio, normalizePortfolio, scenariosOf } from "../lib/portfolios";
import AuthGate from "./components/AuthGate";
import Comparison from "./components/Comparison";
import TransactionsTab from "./components/TransactionsTab";
import ApiKeySettings from "./components/ApiKeySettings";
import PortfolioTable from "./components/PortfolioTable";
import ImportPreview from "./components/ImportPreview";
import AssetPicker, { type AssetChoice } from "./components/AssetPicker";
import BrokerBar from "./components/BrokerBar";
import PortfolioSwitch from "./components/PortfolioSwitch";
import DataSources from "./components/DataSources";
import ShareModal, { type ShareRecord } from "./components/ShareModal";
import SummaryBar from "./components/SummaryBar";
import PortfolioToolbar from "./components/PortfolioToolbar";
import AssetFormModal from "./components/AssetFormModal";
import ImportModal from "./components/ImportModal";
import { buildShareSnapshot, type AssetType, type ShareConfig } from "../lib/shares";
import { readUserApiKey } from "../lib/apiKey";
import { sortPositions, nextSortState, type SortKey, type SortDir } from "../lib/sortPositions";
import type { Session } from "@supabase/supabase-js";

export default function Page() {
  return <AuthGate>{(session) => <Home session={session} />}</AuthGate>;
}

function Home({ session }: { session: Session }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [currentPricesUSD, setCurrentPricesUSD] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [editingPriceIds, setEditingPriceIds] = useState<Set<string>>(new Set());
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  // Portföyü geçmiş bir tarihe göre görüntüleme. Boşsa "bugün" demektir.
  const [asOfDate, setAsOfDate] = useState("");
  const [asOfPrices, setAsOfPrices] = useState<Record<string, number>>({});
  const [asOfPricesUSD, setAsOfPricesUSD] = useState<Record<string, number>>({});
  const [asOfLoading, setAsOfLoading] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [tab, setTab] = useState<'portfolio' | 'compare' | 'transactions'>('portfolio');
  // Varsayılan sıralama: değere göre büyükten küçüğe.
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    const next = nextSortState({ key: sortKey, dir: sortDir }, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };
  // İşlem girme modalı — portföy satırlarındaki Al/Sat butonlarıyla önceden doldurulmuş açılır.
  const [txModalOpen, setTxModalOpen] = useState(false);

  const openTxModal = (assetId: string, kind: 'buy' | 'sell' | 'dividend') => {
    setEditingTx(null);
    setTxNewAsset(false);
    setSelectedAssetId(assetId);
    setTxType(kind);
    setQuantity("");
    setPrice("");
    setTxCurrency('TRY');
    // Aracıyı elle her seferinde yazdırmamak için o varlığın son işleminden,
    // yoksa seçili filtreden tahmin ediyoruz.
    const lastForAsset = [...scopedTransactions].reverse()
      .find(tx => String(tx.asset_id) === String(assetId) && normalizeBroker(tx.broker));
    setTxBroker(normalizeBroker(lastForAsset?.broker) || (brokerFilter ?? ""));
    setSymbol(""); setName("");
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxModalOpen(true);
  };

  const openEditTx = (tx: any) => {
    setEditingTx(tx);
    setTxNewAsset(false);
    setSelectedAssetId(String(tx.asset_id));
    setTxType(tx.type);
    setQuantity(tx.type === 'dividend' ? "" : String(tx.quantity));
    setPrice(String(tx.price));
    setTxCurrency((tx.currency || 'TRY').toUpperCase());
    setTxBroker(normalizeBroker(tx.broker));
    setTxDate(tx.date);
    setTxModalOpen(true);
  };

  // Mevcut kayıtların aracısını toplu doldurmak için: bir varlığın TÜM
  // işlemlerine tek seferde aracı atar. 92+ işlemi elle düzenlemek gerçekçi değil.
  // "Şunu 2023'te almış olsaydım" senaryosunun işe yarar olması için fiyatı
  // elle bulmak gerekmemeli; seçilen tarihin fiyatı doğrudan çekiliyor.
  const [priceLookup, setPriceLookup] = useState<'idle' | 'loading' | 'error'>('idle');

  const fillHistoricalPrice = async () => {
    const asset = assets.find(a => String(a.id) === String(selectedAssetId));
    const lookupSymbol = txNewAsset ? symbol.trim() : (asset?.symbol ?? '');
    const lookupType = txNewAsset ? type : (asset?.type ?? 'stock');
    if (!lookupSymbol || !txDate) { setPriceLookup('error'); return; }

    setPriceLookup('loading');
    try {
      const res = await fetch(
        `/api/price?symbol=${encodeURIComponent(lookupSymbol)}&type=${lookupType}&date=${txDate}`);
      const data = await res.json();
      const value = txCurrency === 'USD' ? data.priceUSD : data.price;
      if (!value) { setPriceLookup('error'); return; }
      setPrice(String(Number(value.toFixed(6))));
      setPriceLookup('idle');
    } catch {
      setPriceLookup('error');
    }
  };

  const setAssetBroker = async (asset: { id: string | number }, broker: string) => {
    const value = normalizeBroker(broker) || null;
    const { error } = await supabase
      .from("transactions")
      .update({ broker: value })
      .eq('asset_id', asset.id);
    if (error) { alert("Aracı kurum kaydedilemedi: " + error.message); return; }
    fetchData();
  };

  const deleteTransaction = async (tx: any) => {
    const asset = assets.find(a => String(a.id) === String(tx.asset_id));
    const label = `${asset?.symbol ?? ''} · ${tx.date} · ${tx.type === 'buy' ? 'Alım' : tx.type === 'sell' ? 'Satım' : 'Temettü'}`;
    if (!confirm(`Bu işlem silinsin mi?\n\n${label}\n\nBu geri alınamaz.`)) return;
    await supabase.from("transactions").delete().eq('id', tx.id);
    fetchData();
  };

  const deleteManyTransactions = async (rows: any[], label: string) => {
    if (rows.length === 0) return;
    if (!confirm(`${label} silinsin mi?\n\n${rows.length} işlem kalıcı olarak silinecek. Bu geri alınamaz.`)) return;
    const { error } = await supabase.from("transactions").delete().in('id', rows.map(r => r.id));
    if (error) { alert("Silinemedi: " + error.message); return; }
    fetchData();
  };

  const deleteAsset = async (asset: any) => {
    const count = transactions.filter(t => String(t.asset_id) === String(asset.id)).length;
    const warning = count > 0
      ? `${asset.symbol} varlığına ait ${count} işlem de silinecek.`
      : `${asset.symbol} varlığının hiç işlemi yok.`;
    if (!confirm(`${asset.symbol} silinsin mi?\n\n${warning}\n\nBu geri alınamaz.`)) return;
    await supabase.from("transactions").delete().eq('asset_id', asset.id);
    await supabase.from("assets").delete().eq('id', asset.id);
    fetchData();
  };

  // Form State'leri
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("stock");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [txType, setTxType] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txCurrency, setTxCurrency] = useState('TRY');
  // Aracı kurum işlemde tutuluyor: aynı sembol birden fazla kurumda olabilir.
  const [txBroker, setTxBroker] = useState("");
  // Portföy görünümünde seçili aracı; null "hepsi" demek.
  const [brokerFilter, setBrokerFilter] = useState<string | null>(null);
  // Aktif portföy: '' gerçek, aksi hâlde senaryo adı. Sanal işlemler gerçek
  // portföye SIZMAMALI — sızarsa kullanıcının asıl K/Z'si sessizce yanlış olur.
  const [activePortfolio, setActivePortfolio] = useState<string>(REAL);
  const isVirtual = activePortfolio !== REAL;

  // Aktif portföyün işlemleri. Aşağıdaki HER hesap bunun üzerinden yapılır;
  // ham `transactions` yalnızca portföy listesini çıkarmak için kullanılır.
  const scopedTransactions = filterByPortfolio(transactions, activePortfolio);
  // Varsayılan senaryo, hiç sanal işlem yokken de seçilebilsin diye listede durur.
  const scenarioList = Array.from(new Set([...scenariosOf(transactions), DEFAULT_SCENARIO]));

  // Modal içinden yeni varlık açma: portföyde olmayan bir şeye işlem girmek için
  // önce ayrı bir formdan varlık oluşturmak gerekiyordu.
  const [txNewAsset, setTxNewAsset] = useState(false);
  // Düzenlenen işlem (null ise yeni kayıt).
  const [editingTx, setEditingTx] = useState<any | null>(null);

  // İçe aktarma state'leri
  const [importRows, setImportRows] = useState<any[] | null>(null);
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  // Portföyde bulunmayan semboller için karar: 'create' (yeni varlık aç) veya 'skip' (atla)
  const [newSymbolChoices, setNewSymbolChoices] = useState<Record<string, 'create' | 'skip'>>({});
  const [newSymbolTypes, setNewSymbolTypes] = useState<Record<string, string>>({});
  // Dosyadaki her sembol için para birimi — dosyada sütun varsa oradan gelir,
  // yoksa TRY varsayılır ve kullanıcı buradan düzeltebilir.
  const [importCurrencies, setImportCurrencies] = useState<Record<string, string>>({});
  // Şablona uymayan dosyalar (PDF, aracı kurum ekstresi) yapay zekâ ile şablona
  // çevriliyor. Dönüştürme ücretli bir dış çağrı olduğu için otomatik başlamaz;
  // dosya beklemede tutulur ve kullanıcı isterse başlatır.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [convertReason, setConvertReason] = useState("");
  // Dönüştürülmüş dosyalarda modelin neyi atladığı ve kaç hareket saydığı;
  // önizlemede gösterilir ki sessizce düşen satır fark edilebilsin.
  const [importMeta, setImportMeta] = useState<
    { skipped: string[]; sourceTransactionCount: number | null } | null
  >(null);
  // Sunucu anahtar bulamazsa anahtar alanını kendiliğinden açar.
  const [needsApiKey, setNeedsApiKey] = useState(false);

  // Paylaşım: anlık görüntü, yalnızca GERÇEK ve GÜNCEL portföyden üretilir.
  // Sanal senaryolar ve geçmiş tarih görünümü kasıtlı olarak dışında tutulur
  // (bkz. ShareModal — buton isVirtual || isHistorical iken kapalı).
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");

  // Sol kolondaki kalıcı formlar modala taşındı: nadiren kullanılan işlemler
  // tablodan kalıcı olarak çeyrek genişlik alıyordu ve dar ekranda portföye
  // inmeden önce ~600px'lik bir engel oluşturuyordu.
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  // Dönem K/Z hesaplayıcısı varsayılan olarak katlı.
  const [rangeOpen, setRangeOpen] = useState(false);
  // Yinelenen satırlar varsayılan olarak atlanır ama karar kullanıcınındır:
  // aynı gün aynı fiyattan iki ayrı alım gerçekten olabilir.
  const [importDupes, setImportDupes] = useState<'skip' | 'include'>('skip');
  // null = dosyadaki değerler; aksi hâlde tüm satırlara bu kurum yazılır.
  const [importBroker, setImportBroker] = useState<string | null>(null);

  // Dönem (tarih aralığı) K/Z state'leri
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeResult, setRangeResult] = useState<number | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);


  useEffect(() => { fetchData(); }, []);

  // İşlemlerin kapsadığı tüm tarih aralığının USD/TRY kurunu tek çağrıda alır.
  // Maliyetin USD karşılığı bu kurlarla hesaplanıyor (bkz. lib/portfolio.ts).
  const txDateSpan = transactions.length > 0
    ? `${transactions[0]?.date ?? ''}|${transactions[transactions.length - 1]?.date ?? ''}`
    : '';
  useEffect(() => {
    if (!txDateSpan) return;
    const dates = transactions.map(t => t.date).filter(Boolean).sort();
    if (dates.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/fxrates?start=${dates[0]}&end=${today}`)
      .then(r => r.json())
      .then(d => setFxRates(d.rates || {}))
      .catch(() => setFxRates({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txDateSpan]);

  // Varlık listesi geldiğinde (ve yeni varlık eklendiğinde) fiyatları kendiliğinden çeker;
  // böylece sayfa yenilendiğinde kullanıcının butona basması gerekmiyor. Bağımlılık
  // id listesi olduğu için sadece işlem eklemek yeniden çekmeyi tetiklemez.
  const assetIdsKey = assets.map(a => a.id).join(',');
  useEffect(() => {
    if (assetIdsKey) fetchPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIdsKey]);

  // AssetPicker'ın beklediği tek nesne; alttaki üç state'in görünümü.
  const assetChoice: AssetChoice = { symbol, name, type };
  const setAssetChoice = (next: AssetChoice) => {
    setSymbol(next.symbol); setName(next.name); setType(next.type);
  };

  const fetchData = async () => {
    const { data: assetsData } = await supabase.from("assets").select("*");
    const { data: txData } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });
    if (assetsData) {
        setAssets(assetsData);
        if (assetsData.length > 0) setSelectedAssetId(assetsData[0].id);
    }
    if (txData) setTransactions(txData);
  };

  const addAsset = async () => {
    if (!symbol.trim()) return;
    // Ad boş bırakılabiliyor (AssetPicker'da opsiyonel); sembolü ad olarak kullan.
    await supabase.from("assets").insert([{ symbol: symbol.trim(), name: name.trim() || symbol.trim(), type }]);
    setSymbol(""); setName(""); setType("stock"); fetchData();
  };

  const getHeldQty = (assetId: string) =>
    heldQuantity(scopedTransactions.filter(tx => tx.asset_id === assetId));

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();

    // Modal içinden yeni varlık açılabiliyor; işlemden önce varlık oluşturulur.
    let assetId = selectedAssetId;
    if (txNewAsset) {
      if (!symbol.trim()) { alert("Önce bir varlık seç veya sembol gir."); return; }
      const { data, error } = await supabase
        .from("assets")
        .insert([{ symbol: symbol.trim().toUpperCase(), name: name.trim() || symbol.trim().toUpperCase(), type }])
        .select();
      if (error || !data?.[0]) { alert("Varlık oluşturulamadı: " + (error?.message ?? "bilinmeyen hata")); return; }
      assetId = data[0].id;
    }

    if (!assetId) { alert("Bir varlık seç."); return; }

    if (txType === 'sell') {
      // Düzenlemede kendi eski adedi hariç tutulmalı, yoksa kendi kaydı sınırı düşürür.
      const others = scopedTransactions.filter(tx => String(tx.asset_id) === String(assetId) && tx.id !== editingTx?.id);
      const held = heldQuantity(others);
      if (Number(quantity) > held) {
        alert(`Elinizde bu varlıktan sadece ${held} adet var, ${quantity} adet satamazsınız.`);
        return;
      }
    }

    // Temettüde adet kavramı yok; tutarın tamamı fiyat alanında tutulur (adet = 1).
    const row = {
      asset_id: assetId,
      type: txType,
      quantity: txType === 'dividend' ? 1 : Number(quantity),
      price: Number(price),
      date: txDate,
      currency: txCurrency,
      broker: normalizeBroker(txBroker) || null,
      // Düzenlemede işlemin kendi portföyü korunur; yeni kayıt aktif portföye gider.
      portfolio: (editingTx ? normalizePortfolio(editingTx.portfolio) : activePortfolio) || null,
    };

    const { error } = editingTx
      ? await supabase.from("transactions").update(row).eq('id', editingTx.id)
      : await supabase.from("transactions").insert([row]);

    if (error) { alert("Kaydedilemedi: " + error.message); return; }

    setQuantity(""); setPrice(""); setTxDate(new Date().toISOString().slice(0, 10));
    setSymbol(""); setName("");
    setTxNewAsset(false); setEditingTx(null);
    setTxModalOpen(false);
    fetchData();
  };

  // Belirli bir tarih aralığındaki portföy değer değişimini hesaplar:
  // (bitiş tarihindeki elde tutulan miktarın bitiş fiyatı) - (başlangıçtaki miktarın başlangıç fiyatı)
  // - dönem içi alımlar + dönem içi satımlar. Böylece hem anlık değer değişimi hem de
  // dönem içindeki alım/satım nakit akışları tek bir K/Z rakamında birleşiyor.
  const calculateRangePL = async () => {
    if (!rangeStart || !rangeEnd) { alert("Başlangıç ve bitiş tarihi seçmelisin."); return; }
    setRangeLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    // Önce her varlığın adet ve nakit akışı hesaplanır; fiyat isteği sonra
    // TEK seferde toplu atılır. Önceden döngü içinde varlık başına iki ayrı
    // istek sırayla bekleniyordu.
    const rows = assets.map(asset => {
      // Aktif portföyün işlemleri — ham liste kullanılırsa sanal kipte gerçek
      // portföyün rakamı çıkar (ve tersi).
      const assetTx = scopedTransactions.filter(tx => tx.asset_id === asset.id);
      let qtyBeforeStart = 0, qtyAtEnd = 0, buysInRange = 0, sellsInRange = 0;

      for (const tx of assetTx) {
        const qty = Number(tx.quantity);
        const prices = convertTxPrice(tx, fxRates);
        if (!prices) continue;
        const txPrice = prices.tl;
        // Temettü adedi değiştirmez ama dönem içindeyse nakit girişi sayılır.
        const signedQty = tx.type === 'buy' ? qty : tx.type === 'sell' ? -qty : 0;
        if (tx.date < rangeStart) qtyBeforeStart += signedQty;
        if (tx.date <= rangeEnd) qtyAtEnd += signedQty;
        if (tx.date >= rangeStart && tx.date <= rangeEnd) {
          if (tx.type === 'buy') buysInRange += qty * txPrice;
          else sellsInRange += qty * txPrice; // satış ve temettü: nakit girişi
        }
      }
      return { asset, qtyBeforeStart, qtyAtEnd, buysInRange, sellsInRange };
    });

    const fetchBatch = async (date: string, needed: typeof rows) => {
      if (needed.length === 0) return {} as Record<string, { price: number }>;
      const spec = needed.map(r => `${r.asset.symbol}:${r.asset.type}`).join(',');
      try {
        const res = await fetch(`/api/price?symbols=${encodeURIComponent(spec)}&date=${date}`);
        return (await res.json()).prices ?? {};
      } catch {
        return {};
      }
    };

    const needEnd = rangeEnd < today ? rows.filter(r => r.qtyAtEnd !== 0) : [];
    const [startPrices, endPrices] = await Promise.all([
      fetchBatch(rangeStart, rows.filter(r => r.qtyBeforeStart !== 0)),
      fetchBatch(rangeEnd, needEnd),
    ]);

    let total = 0;
    for (const r of rows) {
      const priceStart = r.qtyBeforeStart !== 0
        ? (startPrices[r.asset.symbol.toUpperCase()]?.price ?? 0) : 0;
      const priceEnd = r.qtyAtEnd === 0 ? 0
        : rangeEnd >= today
          ? (currentPrices[r.asset.id] || 0)
          : (endPrices[r.asset.symbol.toUpperCase()]?.price ?? 0);
      total += (r.qtyAtEnd * priceEnd - r.qtyBeforeStart * priceStart) - r.buysInRange + r.sellsInRange;
    }

    setRangeResult(total);
    setRangeLoading(false);
  };

  // Tüm varlıkların fiyatı paralel çekilir — sıralı beklemek varlık sayısıyla
  // doğru orantılı yavaşlıyordu ve sayfa açılışındaki otomatik yüklemeyi kullanılamaz kılıyordu.
  const fetchPrices = async () => {
    if (assets.length === 0) return;
    setLoading(true);
    const newPrices: Record<string, number> = {};
    const newPricesUSD: Record<string, number> = {};
    try {
      const spec = assets.map(a => `${a.symbol}:${a.type}`).join(',');
      const res = await fetch(`/api/price?symbols=${encodeURIComponent(spec)}&_=${Date.now()}`);
      const data = await res.json();
      for (const asset of assets) {
        const p = data.prices?.[asset.symbol.toUpperCase()];
        newPrices[asset.id] = p?.price || 0;
        newPricesUSD[asset.id] = p?.priceUSD || 0;
      }
    } catch {
      for (const asset of assets) { newPrices[asset.id] = 0; newPricesUSD[asset.id] = 0; }
    }
    setCurrentPrices(newPrices);
    setCurrentPricesUSD(newPricesUSD);
    setEditingPriceIds(new Set());
    setLoading(false);
  };

  // Doğrudan okunan ve dönüştürülen dosyalar aynı önizleme modalına düşer.
  const openImportPreview = (
    rows: any[],
    meta: { skipped: string[]; sourceTransactionCount: number | null } | null,
  ) => {
    setImportRows(rows);
    setImportMeta(meta);
    // Dosyada kurum yoksa ve portföyde tek kurum varsa onu öneriyoruz.
    const fileHasBroker = rows.some(r => normalizeBroker(r.broker));
    const knownBrokerNames = brokersOf(scopedTransactions).filter(Boolean);
    setImportBroker(fileHasBroker ? null : (knownBrokerNames.length === 1 ? knownBrokerNames[0] : null));

    const known = new Set(assets.map(a => a.symbol.toUpperCase()));
    const choices: Record<string, 'create' | 'skip'> = {};
    const types: Record<string, string> = {};
    const currencies: Record<string, string> = {};
    for (const r of rows) {
      if (r.error) continue;
      if (!known.has(r.symbol) && !(r.symbol in choices)) {
        choices[r.symbol] = 'create';
        types[r.symbol] = 'stock';
      }
      if (!(r.symbol in currencies)) currencies[r.symbol] = r.currency || 'TRY';
    }
    setNewSymbolChoices(choices);
    setNewSymbolTypes(types);
    setImportCurrencies(currencies);
  };

  const handleImportFile = async (file: File) => {
    setImportBusy(true);
    setImportError("");
    setImportRows(null);
    setImportMeta(null);
    setPendingFile(null);
    setConvertReason("");
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || 'Dosya okunamadı.');
      } else if (data.needsConversion) {
        // Şablona uymuyor: dosyayı tutup dönüştürmeyi teklif ediyoruz.
        setPendingFile(file);
        setConvertReason(data.reason || '');
      } else {
        openImportPreview(data.rows, null);
      }
    } catch {
      setImportError('Dosya yüklenemedi.');
    }
    setImportBusy(false);
  };

  const convertPendingFile = async () => {
    if (!pendingFile) return;
    setImportBusy(true);
    setImportError("");
    setNeedsApiKey(false);
    try {
      const body = new FormData();
      body.append('file', pendingFile);
      // Kullanıcının kendi anahtarı varsa istekle birlikte gider; yoksa sunucu
      // anahtarı denenir. Anahtar hiçbir yerde saklanmaz, istek başına okunur.
      const userKey = readUserApiKey();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${session.access_token}`,
      };
      if (userKey) headers['x-anthropic-key'] = userKey;

      const res = await fetch('/api/convert', { method: 'POST', body, headers });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsKey) setNeedsApiKey(true);
        setImportError(data.error || 'Dönüştürme başarısız oldu.');
      } else if (!data.rows || data.rows.length === 0) {
        setImportError('Dosyada içe aktarılabilir bir işlem bulunamadı.');
      } else {
        setPendingFile(null);
        setConvertReason("");
        openImportPreview(data.rows, {
          skipped: data.skipped ?? [],
          sourceTransactionCount: data.sourceTransactionCount ?? null,
        });
      }
    } catch {
      setImportError('Dönüştürme başarısız oldu.');
    }
    setImportBusy(false);
  };

  const confirmImport = async () => {
    if (!importRows) return;
    setImportBusy(true);

    const symbolToAssetId = new Map<string, string>(
      assets.map(a => [a.symbol.toUpperCase(), a.id])
    );

    for (const [symbol, choice] of Object.entries(newSymbolChoices)) {
      if (choice !== 'create') continue;
      const { data } = await supabase
        .from("assets")
        .insert([{ symbol, name: symbol, type: newSymbolTypes[symbol] || 'stock' }])
        .select();
      if (data && data[0]) symbolToAssetId.set(symbol, data[0].id);
    }

    const toInsert = importRows
      .filter((r, i) => !r.error && symbolToAssetId.has(r.symbol)
        && !(importDupes === 'skip' && importDuplicateFlags[i]))
      .map(r => ({
        asset_id: symbolToAssetId.get(r.symbol),
        type: r.type,
        quantity: r.quantity,
        price: r.price,
        date: r.date,
        currency: importCurrencies[r.symbol] || r.currency || 'TRY',
        // Seçim yapılmadıysa dosyadaki değer kullanılır.
        broker: (importBroker === null ? normalizeBroker(r.broker) : importBroker) || null,
        portfolio: activePortfolio || null,
      }));

    if (toInsert.length > 0) await supabase.from("transactions").insert(toInsert);

    setImportRows(null);
    setImportMeta(null);
    setImportDupes('skip');
    setImportBroker(null);
    setNewSymbolChoices({});
    setNewSymbolTypes({});
    setImportCurrencies({});
    setImportBusy(false);
    fetchData();
    alert(`${toInsert.length} işlem içe aktarıldı.`);
  };

  // Dosyadaki satışlar mevcut pozisyonla birleştiğinde adedi negatife düşürüyorsa,
  // o sembolün geçmiş alımları dosyada eksik demektir. Onaydan önce uyarılır —
  // fark edilmezse maliyet ve kâr/zarar sessizce yanlış hesaplanır.
  const importNegatives = (() => {
    if (!importRows) return [];
    const existing: Record<string, number> = {};
    for (const asset of assets) {
      existing[asset.symbol.toUpperCase()] = heldQuantity(
        scopedTransactions.filter(tx => tx.asset_id === asset.id)
      );
    }
    return findNegativePositions(existing, importRows.filter(r => !r.error));
  })();

  // Aracı kurumlar ekstreyi tarih aralığına göre veriyor ve aralıklar sık sık
  // örtüşüyor. İkinci kez eklenen bir işlem maliyeti sessizce bozar.
  const importDuplicateFlags = (() => {
    if (!importRows) return [];
    const symbolById = new Map(assets.map(a => [String(a.id), String(a.symbol).toUpperCase()]));
    const existing = scopedTransactions
      .map(tx => ({
        symbol: symbolById.get(String(tx.asset_id)) ?? '',
        type: tx.type, date: tx.date, quantity: tx.quantity, price: tx.price, currency: tx.currency,
      }))
      .filter(tx => tx.symbol);
    return findDuplicateRows(existing, importRows);
  })();

  const cancelImport = () => {
    setImportRows(null);
    setImportMeta(null);
    setImportDupes('skip');
    setImportBroker(null);
    setImportError("");
    setNewSymbolChoices({});
    setNewSymbolTypes({});
  };

  // Geçmiş bir tarih seçildiğinde o tarihteki fiyatları paralel olarak çeker.
  useEffect(() => {
    if (!asOfDate || assets.length === 0) { setAsOfPrices({}); setAsOfPricesUSD({}); return; }
    let cancelled = false;
    setAsOfLoading(true);
    const spec = assets.map(a => `${a.symbol}:${a.type}`).join(',');
    fetch(`/api/price?symbols=${encodeURIComponent(spec)}&date=${asOfDate}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const p: Record<string, number> = {}, u: Record<string, number> = {};
        for (const asset of assets) {
          const row = data.prices?.[asset.symbol.toUpperCase()];
          p[asset.id] = row?.price || 0;
          u[asset.id] = row?.priceUSD || 0;
        }
        setAsOfPrices(p); setAsOfPricesUSD(u); setAsOfLoading(false);
      })
      .catch(() => { if (!cancelled) { setAsOfPrices({}); setAsOfPricesUSD({}); setAsOfLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate, assetIdsKey]);

  const toggleEditPrice = (assetId: string) => {
    setEditingPriceIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  };

  // Ağırlıklı ortalama maliyet (weighted average cost) yöntemiyle hesaplama.
  // Her satışta, o ana kadarki ortalama maliyet üzerinden satılan kısım
  // totalCost'tan düşülür ve realize edilmiş K/Z ayrıca biriktirilir.
  // NOT: transactions kronolojik sırada gelmeli (bkz. fetchData'daki .order()).
  // İşlem fiyatı kendi para biriminde saklanıyor (Midas ABD hisselerini USD kaydediyor).
  // Maliyeti hem TL hem USD bazında hesaplayabilmek için her işlemi, o günün
  // USD/TRY kuruyla iki para birimine de çeviriyoruz. Hafta sonu/tatil günlerinde
  // kur yayınlanmadığı için en yakın önceki güne düşülür.
  // Finansal matematik lib/portfolio.ts'te ve testleri var (lib/portfolio.test.ts).
  // Burada tekrar yazılmamalı — kopyalanan mantık testlerin koruması dışında kalır.
  // Geçmiş tarih seçiliyse hem işlemler o tarihe kadar kesilir hem de o günün
  // fiyatları kullanılır; böylece tablo o tarihteki portföyün fotoğrafını gösterir.
  const isHistorical = asOfDate !== "";
  const viewPrices = isHistorical ? asOfPrices : currentPrices;
  const viewPricesUSD = isHistorical ? asOfPricesUSD : currentPricesUSD;

  // Aracı kırılımı: seçili aracı varsa portföy YALNIZCA o kurumun işlemlerinden
  // hesaplanır, böylece adet, maliyet ve K/Z o kurumun ekstresiyle karşılaştırılabilir.
  const brokerList = brokersOf(scopedTransactions);
  const visibleTransactions = filterByBroker(scopedTransactions, brokerFilter);

  const portfolio = assets.map(asset => {
    const assetTx = visibleTransactions.filter(tx =>
      tx.asset_id === asset.id && (!isHistorical || tx.date <= asOfDate));

    const { totalQty, totalCost, totalCostUSD, avgCost, realizedPL, realizedPLUSD } =
      computePosition(assetTx, fxRates);

    const currentPrice = viewPrices[asset.id] || 0;
    const currentPriceUSD = viewPricesUSD[asset.id] || 0;
    const unrealizedPL = (totalQty * currentPrice) - totalCost;
    const unrealizedPLUSD = (totalQty * currentPriceUSD) - totalCostUSD;
    return {
      ...asset, totalQty, avgCost, currentPrice, currentPriceUSD,
      value: totalQty * currentPrice,
      valueUSD: totalQty * currentPriceUSD,
      unrealizedPL, realizedPL, unrealizedPLUSD, realizedPLUSD,
    };
  }).filter(item => item.totalQty > 0 || item.realizedPL !== 0);

  const openPositions = sortPositions(portfolio.filter(i => i.totalQty > 0), sortKey, sortDir);
  const closedPositions = sortPositions(portfolio.filter(i => i.totalQty <= 0), sortKey, sortDir);

  const totalValue = portfolio.reduce((acc, i) => acc + i.value, 0);
  const totalValueUSD = portfolio.reduce((acc, i) => acc + i.valueUSD, 0);
  const totalUnrealizedPL = portfolio.reduce((acc, i) => acc + i.unrealizedPL, 0);
  const totalRealizedPL = portfolio.reduce((acc, i) => acc + i.realizedPL, 0);
  const totalPL = totalUnrealizedPL + totalRealizedPL;
  const totalPLUSD = portfolio.reduce((acc, i) => acc + i.unrealizedPLUSD + i.realizedPLUSD, 0);

  const assetTypeCounts = (['stock', 'fund', 'currency', 'metal'] as AssetType[]).reduce((acc, t) => {
    acc[t] = openPositions.filter(p => p.type === t).length;
    return acc;
  }, {} as Record<AssetType, number>);

  const loadShares = async () => {
    setSharesLoading(true);
    const { data, error } = await supabase
      .from('portfolio_shares')
      .select('id, title, config, created_at, refreshed_at')
      .order('created_at', { ascending: false });
    if (!error && data) setShares(data as ShareRecord[]);
    setSharesLoading(false);
  };

  const openShareModal = () => {
    setShareError("");
    setShareModalOpen(true);
    loadShares();
  };

  const createShare = async (title: string, config: ShareConfig) => {
    setShareBusy(true);
    setShareError("");
    const snapshot = buildShareSnapshot(openPositions, config);
    const { error } = await supabase.from('portfolio_shares').insert([{
      title: title || null,
      config,
      snapshot,
    }]);
    if (error) setShareError("Paylaşım oluşturulamadı: " + error.message);
    else await loadShares();
    setShareBusy(false);
  };

  const refreshShare = async (id: string) => {
    const share = shares.find(s => s.id === id);
    if (!share) return;
    const snapshot = buildShareSnapshot(openPositions, share.config);
    const { error } = await supabase
      .from('portfolio_shares')
      .update({ snapshot, refreshed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) setShareError("Yenilenemedi: " + error.message);
    else await loadShares();
  };

  const deleteShare = async (id: string) => {
    if (!confirm('Bu paylaşım linki kalıcı olarak silinsin mi? Linki daha önce paylaştığın kişiler artık erişemez.')) return;
    const { error } = await supabase.from('portfolio_shares').delete().eq('id', id);
    if (error) setShareError("Kaldırılamadı: " + error.message);
    else await loadShares();
  };

  // Her kurumun toplam değeri. Kurum sayısı az olduğu için doğrudan hesaplanıyor.
  const brokerTotals = brokerList.map(broker => {
    const txs = filterByBroker(scopedTransactions, broker);
    const value = assets.reduce((acc, asset) => {
      const assetTx = txs.filter(tx =>
        tx.asset_id === asset.id && (!isHistorical || tx.date <= asOfDate));
      return acc + computePosition(assetTx, fxRates).totalQty * (viewPrices[asset.id] || 0);
    }, 0);
    return { broker, value };
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Portföy Takip</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{session.user.email}</span>
              <span>·</span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="underline hover:text-white"
              >Çıkış yap</button>
            </div>
          </div>

          <SummaryBar
            totalValue={totalValue}
            totalValueUSD={totalValueUSD}
            totalUnrealizedPL={totalUnrealizedPL}
            totalRealizedPL={totalRealizedPL}
            totalPLUSD={totalPLUSD}
            mode={isVirtual ? 'virtual' : isHistorical ? 'historical' : 'live'}
            modeLabel={isVirtual ? activePortfolio : asOfDate}
            loading={asOfLoading}
          />
        </header>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <PortfolioSwitch scenarios={scenarioList} active={activePortfolio} onChange={setActivePortfolio} />
          {isVirtual && (
            <span className="text-xs text-cyan-300/90">
              Sanal senaryo — buradaki işlemler gerçek portföyüne dahil edilmez.
            </span>
          )}
        </div>

        <nav className="flex gap-1 border-b border-gray-700 mb-6">
          {([['portfolio', 'Portföy'], ['transactions', 'İşlemler'], ['compare', 'Karşılaştırma']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-purple-400 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >{label}</button>
          ))}
        </nav>

        {tab === 'compare' && <Comparison assets={assets} transactions={scopedTransactions} fxRates={fxRates} />}

        {tab === 'transactions' && (
          <TransactionsTab
            assets={assets}
            transactions={scopedTransactions}
            fxRates={fxRates}
            onEdit={openEditTx}
            onDelete={deleteTransaction}
            onDeleteMany={deleteManyTransactions}
            onDeleteAsset={deleteAsset}
            onAdd={() => openTxModal(selectedAssetId || String(assets[0]?.id ?? ''), 'buy')}
            onSetAssetBroker={setAssetBroker}
          />
        )}

        {tab === 'portfolio' && <>
        <PortfolioToolbar
          asOfDate={asOfDate}
          onAsOfDateChange={setAsOfDate}
          asOfLoading={asOfLoading}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onRangeStartChange={setRangeStart}
          onRangeEndChange={setRangeEnd}
          onCalculateRange={calculateRangePL}
          rangeLoading={rangeLoading}
          rangeResult={rangeResult}
          rangeOpen={rangeOpen}
          onToggleRange={() => setRangeOpen(o => !o)}
        />

        <BrokerBar
          totals={brokerTotals}
          selected={brokerFilter}
          onSelect={setBrokerFilter}
          grandTotal={brokerTotals.reduce((acc, b) => acc + b.value, 0)}
        />

        {!isHistorical && (
          <PortfolioChart assets={assets} transactions={scopedTransactions} fxRates={fxRates} />
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => setAssetModalOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors font-semibold"
          >+ Yeni varlık</button>
          <button
            onClick={() => setImportModalOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors font-semibold"
          >⬆ İşlem içe aktar</button>
          {importError && !importModalOpen && (
            <span className="text-xs text-red-400">{importError}</span>
          )}
        </div>

        <div>
            <PortfolioTable
              openPositions={openPositions}
              closedPositions={closedPositions}
              totals={{
                value: totalValue, valueUSD: totalValueUSD,
                unrealizedPL: totalUnrealizedPL, realizedPL: totalRealizedPL,
              }}
              isHistorical={isHistorical}
              asOfDate={asOfDate}
              loading={loading || asOfLoading}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              editingPriceIds={editingPriceIds}
              onToggleEditPrice={toggleEditPrice}
              onPriceChange={(id, price) => setCurrentPrices(prev => ({ ...prev, [id]: price }))}
              onOpenTx={openTxModal}
              showClosed={showClosed}
              onToggleClosed={() => setShowClosed(s => !s)}
              onRefresh={fetchPrices}
              onShare={openShareModal}
              shareDisabledReason={
                isVirtual ? 'Sanal senaryolar paylaşılamaz — önce gerçek portföye dön'
                : isHistorical ? 'Yalnızca güncel portföy paylaşılabilir — önce bugüne dön'
                : undefined
              }
            />
        </div>
        </>}

        <DataSources />
      </div>

      <AssetFormModal
        open={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        value={assetChoice}
        onChange={setAssetChoice}
        onSubmit={() => { addAsset(); setAssetModalOpen(false); }}
      />

      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onFile={handleImportFile}
        busy={importBusy}
        error={importError}
        pendingFile={pendingFile}
        convertReason={convertReason}
        onConvert={convertPendingFile}
        onCancelConvert={() => { setPendingFile(null); setConvertReason(''); }}
        needsApiKey={needsApiKey}
      />

      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        assetCounts={assetTypeCounts}
        busy={shareBusy}
        error={shareError}
        shares={shares}
        sharesLoading={sharesLoading}
        onCreate={createShare}
        onRefresh={refreshShare}
        onDelete={deleteShare}
      />

      {txModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50" onClick={() => setTxModalOpen(false)}>
          <form
            onSubmit={addTransaction}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-3"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg">
                {editingTx
                  ? 'İşlemi Düzenle'
                  : `${txNewAsset ? (symbol || 'Yeni varlık') : (assets.find(a => String(a.id) === String(selectedAssetId))?.symbol ?? 'İşlem')} — İşlem Gir`}
              </h2>
              <button type="button" onClick={() => setTxModalOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>

            {txNewAsset ? (
              <div className="bg-gray-700/50 border border-gray-600 rounded p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Yeni varlık</span>
                  <button type="button" onClick={() => { setTxNewAsset(false); setSymbol(""); setName(""); }} className="text-xs text-gray-400 underline">Listeden seç</button>
                </div>
                <AssetPicker value={assetChoice} onChange={setAssetChoice} autoFocus />
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="flex-1 p-2 rounded bg-gray-700 border border-gray-600"
                >
                  {assets.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                </select>
                {!editingTx && (
                  <button type="button" onClick={() => { setTxNewAsset(true); setSymbol(""); setName(""); }}
                    title="Portföyde olmayan bir varlık ekle"
                    className="px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm">+ Yeni</button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setTxType('buy')} className={`flex-1 py-1.5 rounded text-sm ${txType==='buy' ? 'bg-green-600' : 'bg-gray-700'}`}>Alım</button>
              <button type="button" onClick={() => setTxType('sell')} className={`flex-1 py-1.5 rounded text-sm ${txType==='sell' ? 'bg-red-600' : 'bg-gray-700'}`}>Satım</button>
              <button type="button" onClick={() => setTxType('dividend')} className={`flex-1 py-1.5 rounded text-sm ${txType==='dividend' ? 'bg-blue-600' : 'bg-gray-700'}`}>Temettü</button>
            </div>

            {txType === 'sell' && (
              <div className="text-xs text-gray-400">Elinizdeki adet: {heldQuantity(scopedTransactions.filter(tx => String(tx.asset_id) === String(selectedAssetId) && tx.id !== editingTx?.id)).toLocaleString('tr-TR', { maximumFractionDigits: 6 })}</div>
            )}

            {txType === 'dividend' ? (
              <input type="number" step="any" placeholder="Net temettü tutarı (toplam)" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required autoFocus />
            ) : (
              <>
                <input type="number" step="any" placeholder="Adet" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required autoFocus />
                <div className="flex gap-2">
                  <input type="number" step="any" placeholder="Fiyat" value={price} onChange={(e) => { setPrice(e.target.value); setPriceLookup('idle'); }} className="flex-1 p-2 rounded bg-gray-700 border border-gray-600" required />
                  <button
                    type="button"
                    onClick={fillHistoricalPrice}
                    disabled={priceLookup === 'loading'}
                    title="Seçili tarihteki fiyatı getir"
                    className="px-3 rounded bg-gray-700 hover:bg-gray-600 text-xs whitespace-nowrap disabled:opacity-50"
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
              <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="flex-1 p-2 rounded bg-gray-700 border border-gray-600" required />
              {/* Fiyatın para birimi: ABD hisseleri USD işlem görür, TL varsayılırsa maliyet tamamen yanlış çıkar. */}
              <select value={txCurrency} onChange={(e) => setTxCurrency(e.target.value)}
                title="Girdiğin fiyatın para birimi"
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
              value={txBroker}
              onChange={(e) => setTxBroker(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
            />
            <datalist id="broker-suggestions">
              {brokerList.filter(Boolean).map(b => <option key={b} value={b} />)}
            </datalist>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setTxModalOpen(false)} className="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600">İptal</button>
              <button type="submit" className={`flex-1 py-2 rounded font-bold ${txType==='sell' ? 'bg-red-600 hover:bg-red-700' : txType==='dividend' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {editingTx ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {importRows && (
        <ImportPreview
          rows={importRows}
          duplicateFlags={importDuplicateFlags}
          dupePolicy={importDupes}
          onDupePolicyChange={setImportDupes}
          meta={importMeta}
          negatives={importNegatives}
          newSymbolChoices={newSymbolChoices}
          onNewSymbolChoice={(sym, choice) => setNewSymbolChoices(prev => ({ ...prev, [sym]: choice }))}
          newSymbolTypes={newSymbolTypes}
          onNewSymbolType={(sym, type) => setNewSymbolTypes(prev => ({ ...prev, [sym]: type }))}
          currencies={importCurrencies}
          onCurrencyChange={(sym, cur) => setImportCurrencies(prev => ({ ...prev, [sym]: cur }))}
          knownBrokers={brokerList}
          brokerOverride={importBroker}
          onBrokerOverrideChange={setImportBroker}
          busy={importBusy}
          onCancel={cancelImport}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}
