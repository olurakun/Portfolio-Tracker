"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import PortfolioChart from "./components/PortfolioChart";
import { computePosition, convertTxPrice, heldQuantity, findNegativePositions } from "../lib/portfolio";
import AuthGate from "./components/AuthGate";
import Comparison from "./components/Comparison";
import TransactionsTab from "./components/TransactionsTab";
import ApiKeySettings from "./components/ApiKeySettings";
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
    setSymbol(""); setName(""); setSearchQuery(""); setSearchResults([]);
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
    setTxDate(tx.date);
    setTxModalOpen(true);
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

  // Dönem (tarih aralığı) K/Z state'leri
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeResult, setRangeResult] = useState<number | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  // Varlık arama state'leri
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);

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

  // Arama kutusuna yazıldıkça (debounce'lu) /api/search'ü çağırır
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const typeLabel = (t: string) => t === 'stock' ? 'Hisse' : t === 'fund' ? 'Fon' : t === 'currency' ? 'Döviz' : t === 'metal' ? 'Maden' : t;

  const selectSearchResult = (r: any) => {
    setSymbol(r.symbol);
    setName(r.name);
    setType(r.type);
    setSearchResults([]);
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

  const addAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("assets").insert([{ symbol, name, type }]);
    setSymbol(""); setName(""); setType("stock"); setSearchQuery(""); setSearchResults([]); fetchData();
  };

  const getHeldQty = (assetId: string) =>
    heldQuantity(transactions.filter(tx => tx.asset_id === assetId));

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
      const others = transactions.filter(tx => String(tx.asset_id) === String(assetId) && tx.id !== editingTx?.id);
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
    };

    const { error } = editingTx
      ? await supabase.from("transactions").update(row).eq('id', editingTx.id)
      : await supabase.from("transactions").insert([row]);

    if (error) { alert("Kaydedilemedi: " + error.message); return; }

    setQuantity(""); setPrice(""); setTxDate(new Date().toISOString().slice(0, 10));
    setSymbol(""); setName(""); setSearchQuery(""); setSearchResults([]);
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
      const assetTx = transactions.filter(tx => tx.asset_id === asset.id);
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
      .filter(r => !r.error && symbolToAssetId.has(r.symbol))
      .map(r => ({
        asset_id: symbolToAssetId.get(r.symbol),
        type: r.type,
        quantity: r.quantity,
        price: r.price,
        date: r.date,
        currency: importCurrencies[r.symbol] || r.currency || 'TRY',
      }));

    if (toInsert.length > 0) await supabase.from("transactions").insert(toInsert);

    setImportRows(null);
    setImportMeta(null);
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
        transactions.filter(tx => tx.asset_id === asset.id)
      );
    }
    return findNegativePositions(existing, importRows.filter(r => !r.error));
  })();

  const cancelImport = () => {
    setImportRows(null);
    setImportMeta(null);
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

  const portfolio = assets.map(asset => {
    const assetTx = transactions.filter(tx =>
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-[1400px] mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold">Portföy Takip</h1>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
              <span>{session.user.email}</span>
              <span>·</span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="underline hover:text-white"
              >Çıkış yap</button>
            </div>
          </div>
          <div className={`p-4 rounded-xl border shadow-xl text-right ${isHistorical ? 'bg-amber-950/40 border-amber-700/60' : 'bg-gray-800 border-gray-700'}`}>
            <div className="text-gray-400 text-sm uppercase">
              {isHistorical ? `${asOfDate} Tarihindeki Değer` : 'Toplam Değer'}
            </div>
            <div className="text-3xl font-bold">
              {asOfLoading ? '…' : totalValue.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
            </div>
            <div className="text-sm text-gray-400">≈ {totalValueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $</div>
            <div className={`font-semibold ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺ Toplam K/Z</div>
            <div className="text-xs text-gray-400 mt-1">
              Anlık: <span className={totalUnrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}>{totalUnrealizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</span>
              {'  ·  '}Realize: <span className={totalRealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}>{totalRealizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</span>
            </div>
            <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-700">
              USD bazlı K/Z: <span className={totalPLUSD >= 0 ? 'text-green-400' : 'text-red-400'}>{totalPLUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $</span>
              <span className="text-gray-500"> (kur etkisi hariç)</span>
            </div>
          </div>
        </header>

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

        {tab === 'compare' && <Comparison assets={assets} transactions={transactions} fxRates={fxRates} />}

        {tab === 'transactions' && (
          <TransactionsTab
            assets={assets}
            transactions={transactions}
            fxRates={fxRates}
            onEdit={openEditTx}
            onDelete={deleteTransaction}
            onDeleteMany={deleteManyTransactions}
            onDeleteAsset={deleteAsset}
            onAdd={() => openTxModal(selectedAssetId || String(assets[0]?.id ?? ''), 'buy')}
          />
        )}

        {tab === 'portfolio' && <>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Portföyü şu tarihe göre göster</label>
            <input
              type="date"
              value={asOfDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="p-2 rounded bg-gray-700 border border-gray-600"
            />
          </div>
          {isHistorical ? (
            <button onClick={() => setAsOfDate("")} className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 font-bold">
              Bugüne dön
            </button>
          ) : (
            <span className="text-sm text-gray-500 pb-2">Boş bırakılırsa bugünü gösterir</span>
          )}
          {isHistorical && (
            <div className="ml-auto text-sm text-amber-400 pb-2">
              {asOfLoading ? 'O tarihin fiyatları çekiliyor…' : `${asOfDate} tarihindeki portföy görüntüleniyor`}
            </div>
          )}
        </div>

        {!isHistorical && (
          <PortfolioChart assets={assets} transactions={transactions} fxRates={fxRates} />
        )}

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-8 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Başlangıç</label>
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="p-2 rounded bg-gray-700 border border-gray-600" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bitiş</label>
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="p-2 rounded bg-gray-700 border border-gray-600" />
          </div>
          <button onClick={calculateRangePL} className="bg-purple-600 px-4 py-2 rounded font-bold hover:bg-purple-700">
            {rangeLoading ? "Hesaplanıyor..." : "Dönem K/Z Hesapla"}
          </button>
          {rangeResult !== null && !rangeLoading && (
            <div className={`ml-auto text-lg font-bold ${rangeResult >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {rangeStart} → {rangeEnd}: {rangeResult.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-1 space-y-6">
             <form onSubmit={addAsset} className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="font-bold text-lg text-blue-400">Yeni Varlık Ekle</h2>
                  <button
                    type="button"
                    onClick={() => { setManualMode(m => !m); setSymbol(""); setName(""); setSearchQuery(""); setSearchResults([]); }}
                    className="text-xs text-gray-400 underline"
                  >
                    {manualMode ? "Aramaya dön" : "Bulamadım, manuel ekle"}
                  </button>
                </div>

                {manualMode ? (
                  <>
                    <input type="text" placeholder="Sembol (THYAO, USD, XAU, AFT...)" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                    <input type="text" placeholder="Varlık Adı" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                    <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600">
                        <option value="stock">Hisse</option><option value="fund">Fon</option><option value="currency">Döviz</option><option value="metal">Değerli Maden</option>
                    </select>
                    <button type="submit" className="w-full bg-blue-600 py-2 rounded font-bold">Ekle</button>
                  </>
                ) : !symbol ? (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ara: THYAO, Apple, USD, Altın..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                    />
                    {searching && <div className="text-xs text-gray-400 mt-1">Aranıyor...</div>}
                    {searchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded max-h-60 overflow-y-auto shadow-xl">
                        {searchResults.map((r, i) => (
                          <button
                            type="button"
                            key={i}
                            onClick={() => selectSearchResult(r)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-600 flex justify-between items-center gap-2"
                          >
                            <span className="truncate"><span className="font-bold">{r.symbol}</span> <span className="text-gray-400 text-sm">{r.name}</span></span>
                            <span className="text-xs uppercase text-gray-400 shrink-0">{typeLabel(r.type)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-700/60 border border-gray-600 rounded p-3 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-bold truncate">{symbol}</div>
                        <div className="text-sm text-gray-400 truncate">{name}</div>
                      </div>
                      <button type="button" onClick={() => { setSymbol(""); setName(""); setSearchQuery(""); }} className="text-xs text-gray-400 underline shrink-0">Temizle</button>
                    </div>
                    <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600">
                        <option value="stock">Hisse</option><option value="fund">Fon</option><option value="currency">Döviz</option><option value="metal">Değerli Maden</option>
                    </select>
                    <button type="submit" className="w-full bg-blue-600 py-2 rounded font-bold">Ekle</button>
                  </div>
                )}
             </form>

             <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-3">
                <h2 className="font-bold text-lg text-orange-400">İşlem İçe Aktar</h2>
                <p className="text-xs text-gray-400">
                  Excel, CSV veya PDF. Şablon formatındaki dosyalar doğrudan okunur; aracı
                  kurum ekstresi gibi başka formatlar şablona çevrilerek aktarılır.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href="/api/template"
                    className="text-xs text-orange-400 underline hover:text-orange-300"
                  >
                    ⬇ Excel şablonunu indir
                  </a>
                </div>
                <ApiKeySettings forceOpen={needsApiKey} />
                <input
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.txt,.pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-orange-600 file:text-white file:font-bold"
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
                      <button
                        onClick={convertPendingFile}
                        disabled={importBusy}
                        className="text-xs px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 font-bold disabled:opacity-50"
                      >
                        {importBusy ? 'Çevriliyor...' : 'Şablona çevir'}
                      </button>
                      <button
                        onClick={() => { setPendingFile(null); setConvertReason(''); }}
                        disabled={importBusy}
                        className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}

                {importBusy && (
                  <div className="text-xs text-gray-400">
                    {pendingFile ? 'Dosya okunuyor, uzun ekstrelerde bir dakikayı bulabilir...' : 'İşleniyor...'}
                  </div>
                )}
                {importError && <div className="text-xs text-red-400">{importError}</div>}
             </div>
          </div>

          <div className="xl:col-span-3 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="font-bold text-lg text-purple-400">Portföy</h2>
                <button
                  onClick={fetchPrices}
                  disabled={loading}
                  title="Fiyatları yenile"
                  aria-label="Fiyatları yenile"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:hover:bg-transparent"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                </button>
            </div>
            <table className="w-full text-left">
              <thead className="bg-gray-900/50 text-gray-400 text-sm">
                <tr>
                  <SortHeader label="Sembol" sortKey="symbol" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Adet" sortKey="totalQty" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label={isHistorical ? 'O Günkü Fiyat' : 'Güncel Fiyat'} sortKey="currentPrice" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Değer" sortKey="value" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  {/* Pay, Değer'in portföye oranı — ayrı bir sıralama anahtarı olmaz. */}
                  <th className="p-4">Pay</th>
                  <SortHeader label="Anlık K/Z" sortKey="unrealizedPL" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Realize K/Z" sortKey="realizedPL" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((item) => (
                  <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="p-4 font-bold">{item.symbol}</td>
                    <td className="p-4">{item.totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}</td>
                    <td className="p-4">
                      {editingPriceIds.has(item.id) ? (
                        <input
                          type="number"
                          autoFocus
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-32"
                          value={item.currentPrice}
                          onChange={(e) => setCurrentPrices(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                          onBlur={() => toggleEditPrice(item.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') toggleEditPrice(item.id); }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{item.currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          {!isHistorical && (
                            <button type="button" onClick={() => toggleEditPrice(item.id)} title="Elle düzenle" className="text-gray-400 hover:text-white text-xs">✎</button>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">≈ ${item.currentPriceUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold">{item.value.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</div>
                      <div className="text-xs text-gray-400 mt-1">{item.valueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-gray-300">
                        {totalValue > 0 ? `%${(item.value / totalValue * 100).toFixed(1)}` : '—'}
                      </div>
                      <div className="mt-1 h-1.5 w-16 bg-gray-700 rounded overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${totalValue > 0 ? (item.value / totalValue * 100) : 0}%` }} />
                      </div>
                    </td>
                    <td className="p-4">
                      <div className={`font-bold ${item.unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.unrealizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {item.unrealizedPLUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $
                      </div>
                    </td>
                    <td className="p-4">
                      <div className={`font-bold ${item.realizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.realizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {item.realizedPLUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $
                      </div>
                    </td>
                    <td className="p-4">
                      {!isHistorical && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => openTxModal(item.id, 'buy')}
                            title={`${item.symbol} al`}
                            className="px-2.5 py-1 rounded text-xs font-bold bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white transition-colors"
                          >Al</button>
                          <button
                            onClick={() => openTxModal(item.id, 'sell')}
                            title={`${item.symbol} sat`}
                            className="px-2.5 py-1 rounded text-xs font-bold bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                          >Sat</button>
                          <button
                            onClick={() => openTxModal(item.id, 'dividend')}
                            title={`${item.symbol} temettü gir`}
                            className="px-2.5 py-1 rounded text-xs font-bold bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors"
                          >₺</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {openPositions.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">
                    {isHistorical ? `${asOfDate} tarihinde açık pozisyon yok.` : 'Açık pozisyon yok.'}
                  </td></tr>
                )}

                <tr className="bg-gray-900/40 border-t-2 border-gray-600">
                  <td className="p-4 font-bold" colSpan={3}>TOPLAM</td>
                  <td className="p-4">
                    <div className="font-bold">{totalValue.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</div>
                    <div className="text-xs text-gray-400 mt-1">{totalValueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $</div>
                  </td>
                  <td className="p-4 text-sm text-gray-400">%100</td>
                  <td className="p-4">
                    <div className={`font-bold ${totalUnrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {totalUnrealizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </div>
                  </td>
                  <td className="p-4">
                    <div className={`font-bold ${totalRealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {totalRealizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </div>
                  </td>
                  <td className="p-4"></td>
                </tr>

                {closedPositions.length > 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <button
                        onClick={() => setShowClosed(s => !s)}
                        className="w-full text-left px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-gray-700/40 transition-colors"
                      >
                        {showClosed ? '▾' : '▸'} Geçmiş pozisyonlar ({closedPositions.length})
                      </button>
                    </td>
                  </tr>
                )}

                {showClosed && closedPositions.map((item) => (
                  <tr key={item.id} className="border-b border-gray-700 text-gray-400 hover:bg-gray-750">
                    <td className="p-4 font-bold">{item.symbol}</td>
                    <td className="p-4">—</td>
                    <td className="p-4">{item.currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                    <td className="p-4">—</td>
                    <td className="p-4">—</td>
                    <td className="p-4">—</td>
                    <td className="p-4">
                      <div className={`font-bold ${item.realizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.realizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.realizedPLUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} $
                      </div>
                    </td>
                    <td className="p-4">
                      {!isHistorical && (
                        <button
                          onClick={() => openTxModal(item.id, 'buy')}
                          title={`${item.symbol} al`}
                          className="px-2.5 py-1 rounded text-xs font-bold bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white transition-colors"
                        >Al</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>}
      </div>

      {txModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50" onClick={() => setTxModalOpen(false)}>
          <form
            onSubmit={addTransaction}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-3"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg text-green-400">
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
                  <button type="button" onClick={() => { setTxNewAsset(false); setSymbol(""); setName(""); setSearchQuery(""); setSearchResults([]); }} className="text-xs text-gray-400 underline">Listeden seç</button>
                </div>

                {symbol ? (
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{symbol}</div>
                      <div className="text-xs text-gray-400 truncate">{name}</div>
                    </div>
                    <button type="button" onClick={() => { setSymbol(""); setName(""); setSearchQuery(""); }} className="text-xs text-gray-400 underline shrink-0">Değiştir</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ara: THYAO, Apple, USD, Altın..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                      autoFocus
                    />
                    {searching && <div className="text-xs text-gray-400 mt-1">Aranıyor...</div>}
                    {searchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded max-h-52 overflow-y-auto shadow-xl">
                        {searchResults.map((r, i) => (
                          <button type="button" key={i} onClick={() => selectSearchResult(r)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-600 flex justify-between items-center gap-2">
                            <span className="truncate"><span className="font-bold">{r.symbol}</span> <span className="text-gray-400 text-sm">{r.name}</span></span>
                            <span className="text-xs uppercase text-gray-400 shrink-0">{typeLabel(r.type)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Bulamazsan sembolü doğrudan yazıp tipini aşağıdan seçebilirsin.</p>
                    <input type="text" placeholder="veya sembolü elle yaz (THYAO)" value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      className="w-full p-2 mt-1 rounded bg-gray-700 border border-gray-600 text-sm" />
                  </div>
                )}

                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm">
                  <option value="stock">Hisse</option><option value="fund">Fon</option>
                  <option value="currency">Döviz</option><option value="metal">Değerli Maden</option>
                </select>
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
                  <button type="button" onClick={() => { setTxNewAsset(true); setSymbol(""); setName(""); setSearchQuery(""); }}
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
              <div className="text-xs text-gray-400">Elinizdeki adet: {heldQuantity(transactions.filter(tx => String(tx.asset_id) === String(selectedAssetId) && tx.id !== editingTx?.id)).toLocaleString('tr-TR', { maximumFractionDigits: 6 })}</div>
            )}

            {txType === 'dividend' ? (
              <input type="number" step="any" placeholder="Net temettü tutarı (toplam)" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required autoFocus />
            ) : (
              <>
                <input type="number" step="any" placeholder="Adet" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required autoFocus />
                <input type="number" step="any" placeholder="Fiyat" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-bold text-lg text-orange-400">İçe Aktarma Önizlemesi</h2>
              <p className="text-sm text-gray-400 mt-1">
                {importRows.filter(r => !r.error).length} geçerli satır
                {importRows.some(r => r.error) && `, ${importRows.filter(r => r.error).length} hatalı satır (atlanacak)`}
              </p>

              {importMeta && (
                <div className="mt-3 bg-gray-900/60 border border-gray-700 rounded p-3 space-y-2">
                  <div className="text-sm font-bold text-orange-400">
                    Bu satırlar dosyadan çevrildi — göndermeden önce kontrol et
                  </div>
                  {/* Bir dönüştürücünün en tehlikeli hatası satır atlamaktır: sayılar
                      tutmuyorsa kullanıcı bunu onaydan ÖNCE görmeli. */}
                  {importMeta.sourceTransactionCount !== null && (
                    <div className={`text-xs ${
                      importMeta.sourceTransactionCount === importRows.length
                        ? 'text-gray-400' : 'text-amber-400'
                    }`}>
                      Dosyada {importMeta.sourceTransactionCount} işlem sayıldı, {importRows.length} satır çıkarıldı
                      {importMeta.sourceTransactionCount !== importRows.length &&
                        ' — sayılar tutmuyor, dosyayla karşılaştır.'}
                    </div>
                  )}
                  {importMeta.skipped.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-300">
                        {importMeta.skipped.length} hareket atlandı
                      </summary>
                      <ul className="mt-2 space-y-1 text-gray-400 max-h-40 overflow-y-auto">
                        {importMeta.skipped.map((reason, i) => (
                          <li key={i}>• {reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {importNegatives.length > 0 && (
                <div className="mt-3 bg-amber-950/50 border border-amber-700/60 rounded p-3">
                  <div className="font-bold text-sm text-amber-400">
                    Bu dosyada geçmiş alımlar eksik görünüyor
                  </div>
                  <p className="text-xs text-gray-300 mt-1">
                    Aşağıdaki sembollerde satış, elindeki ve dosyadaki alımların toplamından fazla.
                    Bu hâliyle aktarırsan maliyet ve kâr/zarar yanlış hesaplanır.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {importNegatives.map(n => (
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
                          onChange={(e) => setNewSymbolChoices(prev => ({ ...prev, [sym]: e.target.value as 'create' | 'skip' }))}
                          className="p-1 rounded bg-gray-700 border border-gray-600 text-sm"
                        >
                          <option value="create">Yeni varlık oluştur</option>
                          <option value="skip">Atla</option>
                        </select>
                        {newSymbolChoices[sym] === 'create' && (
                          <select
                            value={newSymbolTypes[sym] || 'stock'}
                            onChange={(e) => setNewSymbolTypes(prev => ({ ...prev, [sym]: e.target.value }))}
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

              {Object.keys(importCurrencies).length > 0 && (
                <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
                  <div className="font-bold text-sm mb-1">Para birimleri</div>
                  <p className="text-xs text-gray-400 mb-2">
                    Fiyatların hangi para biriminde olduğunu kontrol et. Yanlış seçim maliyeti tamamen bozar
                    (ör. ABD hisseleri genelde USD, BIST hisseleri TRY).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(importCurrencies).sort().map(sym => (
                      <div key={sym} className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-1">
                        <span className="font-bold text-sm">{sym}</span>
                        <select
                          value={importCurrencies[sym]}
                          onChange={(e) => setImportCurrencies(prev => ({ ...prev, [sym]: e.target.value }))}
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

              <table className="w-full text-left text-sm">
                <thead className="bg-gray-900/50 text-gray-400">
                  <tr><th className="p-2">Satır</th><th className="p-2">Sembol</th><th className="p-2">İşlem</th><th className="p-2">Adet</th><th className="p-2">Fiyat</th><th className="p-2">Tarih</th></tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-700 ${r.error ? 'text-red-400' : ''}`}>
                      <td className="p-2">{r.row}</td>
                      <td className="p-2 font-bold">{r.symbol}</td>
                      <td className="p-2">{r.type === 'buy' ? 'Alım' : r.type === 'sell' ? 'Satım' : 'Temettü'}</td>
                      <td className="p-2">{r.quantity}</td>
                      <td className="p-2">
                        {r.price}
                        <span className="text-gray-500 ml-1">
                          {(importCurrencies[r.symbol] || r.currency) === 'USD' ? '$' : '₺'}
                        </span>
                      </td>
                      <td className="p-2">{r.error ? r.error : r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
              <button onClick={cancelImport} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600">İptal</button>
              <button onClick={confirmImport} disabled={importBusy} className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 font-bold disabled:opacity-50">
                {importBusy ? "Aktarılıyor..." : "İçe Aktar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function SortHeader({
  label, sortKey, active, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="p-0">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`w-full text-left px-4 py-4 flex items-center gap-1 transition-colors hover:text-white ${isActive ? 'text-white' : ''}`}
      >
        {label}
        {/* Sıralanmayan sütunlarda ok soluk duruyor: tıklanabilir olduğu belli olsun
            ama aktif sütunla karışmasın. */}
        <span className={isActive ? 'text-purple-400' : 'text-gray-600'}>
          {isActive ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}
