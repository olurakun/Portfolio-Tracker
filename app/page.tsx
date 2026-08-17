"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [currentPricesUSD, setCurrentPricesUSD] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [editingPriceIds, setEditingPriceIds] = useState<Set<string>>(new Set());
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  // Form State'leri
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("stock");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [txType, setTxType] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));

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
  // Maliyetin USD karşılığı bu kurlarla hesaplanıyor (bkz. txPrices).
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

  const getHeldQty = (assetId: string) => {
    return transactions
      .filter(tx => tx.asset_id === assetId)
      .reduce((qty, tx) => {
        if (tx.type === 'buy') return qty + Number(tx.quantity);
        if (tx.type === 'sell') return qty - Number(tx.quantity);
        return qty; // temettü adedi değiştirmez
      }, 0);
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (txType === 'sell') {
      const held = getHeldQty(selectedAssetId);
      if (Number(quantity) > held) {
        alert(`Elinizde bu varlıktan sadece ${held} adet var, ${quantity} adet satamazsınız.`);
        return;
      }
    }
    // Temettüde adet kavramı yok; tutarın tamamı fiyat alanında tutulur (adet = 1).
    await supabase.from("transactions").insert([{
      asset_id: selectedAssetId,
      type: txType,
      quantity: txType === 'dividend' ? 1 : Number(quantity),
      price: Number(price),
      date: txDate,
    }]);
    setQuantity(""); setPrice(""); setTxDate(new Date().toISOString().slice(0, 10)); fetchData();
  };

  // Belirli bir tarih aralığındaki portföy değer değişimini hesaplar:
  // (bitiş tarihindeki elde tutulan miktarın bitiş fiyatı) - (başlangıçtaki miktarın başlangıç fiyatı)
  // - dönem içi alımlar + dönem içi satımlar. Böylece hem anlık değer değişimi hem de
  // dönem içindeki alım/satım nakit akışları tek bir K/Z rakamında birleşiyor.
  const calculateRangePL = async () => {
    if (!rangeStart || !rangeEnd) { alert("Başlangıç ve bitiş tarihi seçmelisin."); return; }
    setRangeLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    let total = 0;

    for (const asset of assets) {
      const assetTx = transactions.filter(tx => tx.asset_id === asset.id);
      let qtyBeforeStart = 0, qtyAtEnd = 0, buysInRange = 0, sellsInRange = 0;

      for (const tx of assetTx) {
        const qty = Number(tx.quantity);
        const prices = txPrices(tx);
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

      let priceStart = 0;
      if (qtyBeforeStart !== 0) {
        try {
          const res = await fetch(`/api/price?symbol=${asset.symbol}&type=${asset.type}&date=${rangeStart}`);
          const data = await res.json();
          priceStart = data.price || 0;
        } catch { priceStart = 0; }
      }

      let priceEnd = 0;
      if (qtyAtEnd !== 0) {
        if (rangeEnd >= today) {
          priceEnd = currentPrices[asset.id] || 0;
        } else {
          try {
            const res = await fetch(`/api/price?symbol=${asset.symbol}&type=${asset.type}&date=${rangeEnd}`);
            const data = await res.json();
            priceEnd = data.price || 0;
          } catch { priceEnd = 0; }
        }
      }

      total += (qtyAtEnd * priceEnd - qtyBeforeStart * priceStart) - buysInRange + sellsInRange;
    }

    setRangeResult(total);
    setRangeLoading(false);
  };

  // Tüm varlıkların fiyatı paralel çekilir — sıralı beklemek varlık sayısıyla
  // doğru orantılı yavaşlıyordu ve sayfa açılışındaki otomatik yüklemeyi kullanılamaz kılıyordu.
  const fetchPrices = async () => {
    if (assets.length === 0) return;
    setLoading(true);
    const results = await Promise.all(assets.map(async (asset) => {
      try {
        const res = await fetch(`/api/price?symbol=${asset.symbol}&type=${asset.type}&_=${Date.now()}`);
        const data = await res.json();
        return { id: asset.id, price: data.price || 0, priceUSD: data.priceUSD || 0 };
      } catch {
        return { id: asset.id, price: 0, priceUSD: 0 };
      }
    }));

    const newPrices: Record<string, number> = {};
    const newPricesUSD: Record<string, number> = {};
    for (const r of results) {
      newPrices[r.id] = r.price;
      newPricesUSD[r.id] = r.priceUSD;
    }
    setCurrentPrices(newPrices);
    setCurrentPricesUSD(newPricesUSD);
    setEditingPriceIds(new Set());
    setLoading(false);
  };

  const handleImportFile = async (file: File) => {
    setImportBusy(true);
    setImportError("");
    setImportRows(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || 'Dosya okunamadı.');
      } else {
        setImportRows(data.rows);
        const known = new Set(assets.map(a => a.symbol.toUpperCase()));
        const choices: Record<string, 'create' | 'skip'> = {};
        const types: Record<string, string> = {};
        for (const r of data.rows as any[]) {
          if (!r.error && !known.has(r.symbol) && !(r.symbol in choices)) {
            choices[r.symbol] = 'create';
            types[r.symbol] = 'stock';
          }
        }
        setNewSymbolChoices(choices);
        setNewSymbolTypes(types);

        const currencies: Record<string, string> = {};
        for (const r of data.rows as any[]) {
          if (!r.error && !(r.symbol in currencies)) currencies[r.symbol] = r.currency || 'TRY';
        }
        setImportCurrencies(currencies);
      }
    } catch {
      setImportError('Dosya yüklenemedi.');
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
    setNewSymbolChoices({});
    setNewSymbolTypes({});
    setImportCurrencies({});
    setImportBusy(false);
    fetchData();
    alert(`${toInsert.length} işlem içe aktarıldı.`);
  };

  const cancelImport = () => {
    setImportRows(null);
    setImportError("");
    setNewSymbolChoices({});
    setNewSymbolTypes({});
  };

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
  const rateOn = (date: string): number | null => {
    if (!date) return null;
    if (fxRates[date]) return fxRates[date];
    const earlier = Object.keys(fxRates).filter(d => d <= date).sort();
    if (earlier.length > 0) return fxRates[earlier[earlier.length - 1]];
    return null;
  };

  const txPrices = (tx: any): { tl: number; usd: number } | null => {
    const price = Number(tx.price);
    const currency = (tx.currency || 'TRY').toUpperCase();
    if (currency === 'TRY') {
      const rate = rateOn(tx.date);
      return { tl: price, usd: rate ? price / rate : 0 };
    }
    if (currency === 'USD') {
      const rate = rateOn(tx.date);
      return { tl: rate ? price * rate : 0, usd: price };
    }
    return null;
  };

  // Maliyet FIFO (ilk giren ilk çıkar) yöntemiyle hesaplanıyor: her alım ayrı bir lot
  // olarak kuyruğa girer, satışta en eski lottan düşülür. Midas ekstresi de bu yöntemi
  // kullanıyor, böylece rakamlar ekstreyle birebir tutuyor.
  const portfolio = assets.map(asset => {
    const assetTx = transactions.filter(tx => tx.asset_id === asset.id);
    const lots: { qty: number; tl: number; usd: number }[] = [];
    let realizedPL = 0;      // TL bazlı (kur etkisi dahil)
    let realizedPLUSD = 0;   // USD bazlı (kur etkisi hariç)

    assetTx.forEach(tx => {
      const qty = Number(tx.quantity);
      const prices = txPrices(tx);
      if (!prices) return;

      if (tx.type === 'buy') {
        lots.push({ qty, tl: prices.tl, usd: prices.usd });
      } else if (tx.type === 'sell') {
        let remaining = qty;
        while (remaining > 1e-9 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(remaining, lot.qty);
          realizedPL += (prices.tl - lot.tl) * take;
          realizedPLUSD += (prices.usd - lot.usd) * take;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-9) lots.shift();
        }
      } else if (tx.type === 'dividend') {
        // Temettüde adet değişmez; tutar doğrudan gerçekleşmiş gelir olarak eklenir.
        realizedPL += qty * prices.tl;
        realizedPLUSD += qty * prices.usd;
      }
    });

    const totalQty = lots.reduce((s, l) => s + l.qty, 0);
    const totalCost = lots.reduce((s, l) => s + l.qty * l.tl, 0);
    const totalCostUSD = lots.reduce((s, l) => s + l.qty * l.usd, 0);
    const avgCost = totalQty > 0 ? (totalCost / totalQty) : 0;
    const currentPrice = currentPrices[asset.id] || 0;
    const currentPriceUSD = currentPricesUSD[asset.id] || 0;
    const unrealizedPL = (totalQty * currentPrice) - totalCost;
    const unrealizedPLUSD = (totalQty * currentPriceUSD) - totalCostUSD;
    return {
      ...asset, totalQty, avgCost, currentPrice, currentPriceUSD,
      currentTotalValue: totalQty * currentPrice,
      unrealizedPL, realizedPL, unrealizedPLUSD, realizedPLUSD,
    };
  }).filter(item => item.totalQty > 0 || item.realizedPL !== 0);

  const totalValue = portfolio.reduce((acc, i) => acc + (i.totalQty * i.currentPrice), 0);
  const totalValueUSD = portfolio.reduce((acc, i) => acc + (i.totalQty * i.currentPriceUSD), 0);
  const totalUnrealizedPL = portfolio.reduce((acc, i) => acc + i.unrealizedPL, 0);
  const totalRealizedPL = portfolio.reduce((acc, i) => acc + i.realizedPL, 0);
  const totalPL = totalUnrealizedPL + totalRealizedPL;
  const totalPLUSD = portfolio.reduce((acc, i) => acc + i.unrealizedPLUSD + i.realizedPLUSD, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-[1400px] mx-auto">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Portföy Takip</h1>
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-xl text-right">
            <div className="text-gray-400 text-sm uppercase">Toplam Değer</div>
            <div className="text-3xl font-bold">{totalValue.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</div>
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

             <form onSubmit={addTransaction} className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-3">
                <h2 className="font-bold text-lg mb-2 text-green-400">İşlem Gir</h2>
                <select onChange={(e) => setSelectedAssetId(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600">{assets.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}</select>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setTxType('buy')} className={`flex-1 py-1 rounded text-sm ${txType==='buy' ? 'bg-green-600' : 'bg-gray-700'}`}>Alım</button>
                    <button type="button" onClick={() => setTxType('sell')} className={`flex-1 py-1 rounded text-sm ${txType==='sell' ? 'bg-red-600' : 'bg-gray-700'}`}>Satım</button>
                    <button type="button" onClick={() => setTxType('dividend')} className={`flex-1 py-1 rounded text-sm ${txType==='dividend' ? 'bg-blue-600' : 'bg-gray-700'}`}>Temettü</button>
                </div>
                {txType === 'dividend' ? (
                  <input type="number" step="any" placeholder="Net temettü tutarı (toplam)" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                ) : (
                  <>
                    <input type="number" step="any" placeholder="Adet" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                    <input type="number" step="any" placeholder="Fiyat" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                  </>
                )}
                <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                <button type="submit" className="w-full bg-green-600 py-2 rounded font-bold">Kaydet</button>
             </form>

             <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-3">
                <h2 className="font-bold text-lg text-orange-400">İşlem İçe Aktar</h2>
                <p className="text-xs text-gray-400">
                  CSV veya Excel (.xlsx). Başlık satırında şu sütunlar olmalı:{' '}
                  <span className="text-gray-300">Sembol, İşlem, Adet, Fiyat, Tarih</span>
                </p>
                <a
                  href="/api/template"
                  className="inline-block text-xs text-orange-400 underline hover:text-orange-300"
                >
                  ⬇ Excel şablonunu indir
                </a>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.txt"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-orange-600 file:text-white file:font-bold"
                />
                {importBusy && <div className="text-xs text-gray-400">İşleniyor...</div>}
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
                <tr><th className="p-4">Sembol</th><th className="p-4">Adet</th><th className="p-4">Güncel Fiyat</th><th className="p-4">Anlık K/Z</th><th className="p-4">Realize K/Z</th></tr>
              </thead>
              <tbody>
                {portfolio.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="p-4 font-bold">{item.symbol}</td>
                    <td className="p-4">{item.totalQty}</td>
                    <td className="p-4">
                      {editingPriceIds.has(item.id) ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            autoFocus
                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-32"
                            value={item.currentPrice}
                            onChange={(e) => setCurrentPrices(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                            onBlur={() => toggleEditPrice(item.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') toggleEditPrice(item.id); }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{item.currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          <button type="button" onClick={() => toggleEditPrice(item.id)} title="Elle düzenle" className="text-gray-400 hover:text-white text-xs">✎</button>
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">≈ ${item.currentPriceUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {importRows && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-bold text-lg text-orange-400">İçe Aktarma Önizlemesi</h2>
              <p className="text-sm text-gray-400 mt-1">
                {importRows.filter(r => !r.error).length} geçerli satır
                {importRows.some(r => r.error) && `, ${importRows.filter(r => r.error).length} hatalı satır (atlanacak)`}
              </p>
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