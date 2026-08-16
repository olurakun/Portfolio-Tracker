"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // Form State'leri
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("stock");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [txType, setTxType] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: assetsData } = await supabase.from("assets").select("*");
    const { data: txData } = await supabase.from("transactions").select("*");
    if (assetsData) {
        setAssets(assetsData);
        if (assetsData.length > 0) setSelectedAssetId(assetsData[0].id);
    }
    if (txData) setTransactions(txData);
  };

  const addAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("assets").insert([{ symbol, name, type }]);
    setSymbol(""); setName(""); fetchData();
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("transactions").insert([{ asset_id: selectedAssetId, type: txType, quantity: Number(quantity), price: Number(price) }]);
    setQuantity(""); setPrice(""); fetchData();
  };

  const fetchPrices = async () => {
    setLoading(true);
    const newPrices: Record<string, number> = {};
    for (const asset of assets) {
      try {
        const res = await fetch(`/api/price?symbol=${asset.symbol}&type=${asset.type}&_=${Date.now()}`);
        const data = await res.json();
        newPrices[asset.id] = data.price || 0;
      } catch { newPrices[asset.id] = 0; }
    }
    setCurrentPrices(newPrices);
    setLoading(false);
  };

  const portfolio = assets.map(asset => {
    const assetTx = transactions.filter(tx => tx.asset_id === asset.id);
    let totalQty = 0, totalCost = 0;
    assetTx.forEach(tx => {
      if (tx.type === 'buy') { totalQty += Number(tx.quantity); totalCost += Number(tx.quantity) * Number(tx.price); }
      else if (tx.type === 'sell') totalQty -= Number(tx.quantity);
    });
    const avgCost = totalQty > 0 ? (totalCost / totalQty) : 0;
    const currentPrice = currentPrices[asset.id] || 0;
    const profitLoss = (totalQty * currentPrice) - (totalQty * avgCost);
    return { ...asset, totalQty, avgCost, currentPrice, currentTotalValue: totalQty * currentPrice, profitLoss };
  }).filter(item => item.totalQty > 0);

  const totalValue = portfolio.reduce((acc, i) => acc + (i.totalQty * i.currentPrice), 0);
  const totalPL = portfolio.reduce((acc, i) => acc + i.profitLoss, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-[1400px] mx-auto">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Portföy Takip</h1>
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-xl text-right">
            <div className="text-gray-400 text-sm uppercase">Toplam Değer</div>
            <div className="text-3xl font-bold">{totalValue.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</div>
            <div className={`font-semibold ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalPL.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺ Kâr/Zarar</div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-1 space-y-6">
             <form onSubmit={addAsset} className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-3">
                <h2 className="font-bold text-lg mb-2 text-blue-400">Yeni Varlık Ekle</h2>
                <input type="text" placeholder="Sembol (THYAO)" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                <input type="text" placeholder="Varlık Adı" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" required />
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600">
                    <option value="stock">Hisse</option><option value="fund">Fon</option><option value="currency">Döviz</option>
                </select>
                <button type="submit" className="w-full bg-blue-600 py-2 rounded font-bold">Ekle</button>
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
                <tr><th className="p-4">Sembol</th><th className="p-4">Adet</th><th className="p-4">Güncel Fiyat</th><th className="p-4">Kâr/Zarar</th></tr>
              </thead>
              <tbody>
                {portfolio.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="p-4 font-bold">{item.symbol}</td>
                    <td className="p-4">{item.totalQty}</td>
                    <td className="p-4">
                      <input type="number" className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-32" value={item.currentPrice} onChange={(e) => setCurrentPrices(prev => ({...prev, [item.id]: parseFloat(e.target.value) || 0}))} />
                    </td>
                    <td className={`p-4 font-bold ${item.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.profitLoss.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
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