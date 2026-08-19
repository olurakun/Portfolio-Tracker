"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import PortfolioChart from "./components/PortfolioChart";
import { computePosition, convertTxPrice, heldQuantity, findNegativePositions } from "../lib/portfolio";
import { findDuplicateRows } from "../lib/importParse";
import AuthGate from "./components/AuthGate";
import Comparison from "./components/Comparison";
import TransactionsTab from "./components/TransactionsTab";
import ApiKeySettings from "./components/ApiKeySettings";
import PortfolioTable from "./components/PortfolioTable";
import ImportPreview from "./components/ImportPreview";
import AssetPicker, { type AssetChoice } from "./components/AssetPicker";
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
  // Yinelenen satırlar varsayılan olarak atlanır ama karar kullanıcınındır:
  // aynı gün aynı fiyattan iki ayrı alım gerçekten olabilir.
  const [importDupes, setImportDupes] = useState<'skip' | 'include'>('skip');

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

  const addAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("assets").insert([{ symbol, name, type }]);
    setSymbol(""); setName(""); setType("stock"); fetchData();
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
      .filter((r, i) => !r.error && symbolToAssetId.has(r.symbol)
        && !(importDupes === 'skip' && importDuplicateFlags[i]))
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
    setImportDupes('skip');
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

  // Aracı kurumlar ekstreyi tarih aralığına göre veriyor ve aralıklar sık sık
  // örtüşüyor. İkinci kez eklenen bir işlem maliyeti sessizce bozar.
  const importDuplicateFlags = (() => {
    if (!importRows) return [];
    const symbolById = new Map(assets.map(a => [String(a.id), String(a.symbol).toUpperCase()]));
    const existing = transactions
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
                <h2 className="font-bold text-lg text-blue-400 mb-2">Yeni Varlık Ekle</h2>

                <AssetPicker value={assetChoice} onChange={setAssetChoice} />

                <button type="submit" disabled={!symbol.trim()}
                  className="w-full bg-blue-600 py-2 rounded font-bold disabled:opacity-50">Ekle</button>
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

          <div className="xl:col-span-3">
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
            />
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
          busy={importBusy}
          onCancel={cancelImport}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}
