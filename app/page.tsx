"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [currentPricesUSD, setCurrentPricesUSD] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // Form State'leri
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("stock");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [txType, setTxType] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  // Varlık arama state'leri
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => { fetchData(); }, []);

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
      .reduce((qty, tx) => tx.type === 'buy' ? qty + Number(tx.quantity) : qty - Number(tx.quantity), 0);
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
    await supabase.from("transactions").insert([{ asset_id: selectedAssetId, type: txType, quantity: Number(quantity), price: Number(price) }]);
    setQuantity(""); setPrice(""); fetchData();
  };

  const fetchPrices = async () => {
    setLoading(true);
    const newPrices: Record<string, number> = {};
    const newPricesUSD: Record<string, number> = {};
    for (const asset of assets) {
      try {
        const res = await fetch(`/api/price?symbol=${asset.symbol}&type=${asset.type}&_=${Date.now()}`);
        const data = await res.json();
        newPrices[asset.id] = data.price || 0;
        newPricesUSD[asset.id] = data.priceUSD || 0;
      } catch { newPrices[asset.id] = 0; newPricesUSD[asset.id] = 0; }
    }
    setCurrentPrices(newPrices);
    setCurrentPricesUSD(newPricesUSD);
    setLoading(false);
  };

  // Ağırlıklı ortalama maliyet (weighted average cost) yöntemiyle hesaplama.
  // Her satışta, o ana kadarki ortalama maliyet üzerinden satılan kısım
  // totalCost'tan düşülür ve realize edilmiş K/Z ayrıca biriktirilir.
  // NOT: transactions kronolojik sırada gelmeli (bkz. fetchData'daki .order()).
  const portfolio = assets.map(asset => {
    const assetTx = transactions.filter(tx => tx.asset_id === asset.id);
    let totalQty = 0, totalCost = 0, realizedPL = 0;
    assetTx.forEach(tx => {
      const qty = Number(tx.quantity);
      const txPrice = Number(tx.price);
      if (tx.type === 'buy') {
        totalQty += qty;
        totalCost += qty * txPrice;
      } else if (tx.type === 'sell') {
        const avgCostBeforeSale = totalQty > 0 ? totalCost / totalQty : 0;
        const sellQty = Math.min(qty, totalQty); // negatife düşmeyi engeller
        realizedPL += (txPrice - avgCostBeforeSale) * sellQty;
        totalCost -= avgCostBeforeSale * sellQty;
        totalQty -= sellQty;
      }
    });
    const avgCost = totalQty > 0 ? (totalCost / totalQty) : 0;
    const currentPrice = currentPrices[asset.id] || 0;
    const currentPriceUSD = currentPricesUSD[asset.id] || 0;
    const unrealizedPL = (totalQty * currentPrice) - totalCost;
    return { ...asset, totalQty, avgCost, currentPrice, currentPriceUSD, currentTotalValue: totalQty * currentPrice, unrealizedPL, realizedPL };
  }).filter(item => item.totalQty > 0 || item.realizedPL !== 0);

  const totalValue = portfolio.reduce((acc, i) => acc + (i.totalQty * i.currentPrice), 0);
  const totalValueUSD = portfolio.reduce((acc, i) => acc + (i.totalQty * i.currentPriceUSD), 0);
  const totalUnrealizedPL = portfolio.reduce((acc, i) => acc + i.unrealizedPL, 0);
  const totalRealizedPL = portfolio.reduce((acc, i) => acc + i.realizedPL, 0);
  const totalPL = totalUnrealizedPL + totalRealizedPL;

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
          </div>
        </header>

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
                    <button type="button" onClick={() => setTxType('buy')} className={`flex-1 py-1 rounded ${txType==='buy' ? 'bg-green-600' : 'bg-gray-700'}`}>Alım</button>
                    <button type="button" onClick={() => setTxType('sell')} className={`flex-1 py-1 rounded ${txType==='sell' ? 'bg-red-600' : 'bg-gray-700'}`}>Satım</button>
                </div>
                <input type="number" placeholder="Adet" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                <input type="number" placeholder="Fiyat" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                <button type="submit" className="w-full bg-green-600 py-2 rounded font-bold">Kaydet</button>
             </form>
          </div>

          <div className="xl:col-span-3 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="font-bold text-lg text-purple-400">Portföy</h2>
                <button onClick={fetchPrices} className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600">{loading ? "Yükleniyor..." : "🔄 Fiyatları Yenile"}</button>
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
                      <input type="number" className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-32" value={item.currentPrice} onChange={(e) => setCurrentPrices(prev => ({...prev, [item.id]: parseFloat(e.target.value) || 0}))} />
                      <div className="text-xs text-gray-400 mt-1">≈ ${item.currentPriceUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className={`p-4 font-bold ${item.unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.unrealizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </td>
                    <td className={`p-4 font-bold ${item.realizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.realizedPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}