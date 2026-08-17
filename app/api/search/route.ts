import { NextResponse } from "next/server";

// Değerli madenler Yahoo aramasında düzgün bulunamıyor: "altın"/"gümüş" hiç sonuç
// vermiyor, "xau" ise ancak "XAU/ROX" gibi anlamsız isimli bir kur paritesi olarak
// çıkıyor, "gold" ise vadeli sözleşmeyi hisse gibi döndürüyor. Bu yüzden madenleri
// sabit bir listeden, birimi ismin içinde açıkça belirterek sunuyoruz.
const METAL_ENTRIES: { symbol: string; name: string; keywords: string[] }[] = [
  { symbol: 'XAU', name: 'Altın (gram)', keywords: ['xau', 'altin', 'altın', 'gold', 'gram altin', 'gram altın'] },
  { symbol: 'XAUOZ', name: 'Altın (ons)', keywords: ['xau', 'xauoz', 'altin', 'altın', 'gold', 'ons altin', 'ons altın', 'ounce'] },
  { symbol: 'XAG', name: 'Gümüş (gram)', keywords: ['xag', 'gumus', 'gümüş', 'silver', 'gram gumus', 'gram gümüş'] },
  { symbol: 'XAGOZ', name: 'Gümüş (ons)', keywords: ['xag', 'xagoz', 'gumus', 'gümüş', 'silver', 'ons gumus', 'ons gümüş', 'ounce'] },
];

// JS'in toLowerCase'i Türkçe'de bozuk sonuç verir ("I" → "i" ama "ı" beklenir),
// ayrıca kullanıcı "altin" diye de yazabilir; karşılaştırmadan önce ASCII'ye katlıyoruz.
const TURKISH_FOLD: Record<string, string> = {
  'İ': 'i', 'I': 'i', 'ı': 'i', 'Ş': 's', 'ş': 's', 'Ğ': 'g', 'ğ': 'g',
  'Ü': 'u', 'ü': 'u', 'Ö': 'o', 'ö': 'o', 'Ç': 'c', 'ç': 'c',
};

function fold(value: string): string {
  return value.trim().replace(/[İIıŞşĞğÜüÖöÇç]/g, c => TURKISH_FOLD[c]).toLowerCase();
}

function matchingMetals(query: string) {
  const q = fold(query);
  if (!q) return [];
  return METAL_ENTRIES
    .filter(m => m.keywords.some(k => fold(k).startsWith(q) || q.startsWith(fold(k))))
    .map(m => ({ symbol: m.symbol, name: m.name, type: 'metal' }));
}

// Yahoo Finance arama sonuçlarını kendi varlık tipimize (stock/fund/currency/metal)
// ve fiyat API'sinin beklediği sembol formatına çevirir.
function classify(q: any): { symbol: string; type: string } | null {
  const rawSymbol: string = q.symbol;
  const quoteType: string = q.quoteType;

  if (quoteType === "CURRENCY") {
    // Yahoo döviz sembolleri "USDTRY=X" gibi 6 haneli parite formatındadır.
    const base = rawSymbol.replace("=X", "").slice(0, 3).toUpperCase();
    // Madenler Yahoo'da da CURRENCY olarak geçiyor ama karşı para birimi rastgele
    // olabiliyor (XAU/ROX gibi); bunun yerine yukarıdaki sabit maden listesini
    // kullandığımız için bu kayıtları eliyoruz.
    if (base === "XAU" || base === "XAG") return null;
    return { symbol: base, type: "currency" };
  }

  if (quoteType === "MUTUALFUND" || quoteType === "ETF") {
    return { symbol: rawSymbol, type: "fund" };
  }

  // EQUITY, INDEX ve diğer her şey: hisse.
  // ÖNEMLİ: borsa soneki (THYAO.IS gibi) burada KORUNUR — fiyat API'sinin
  // doğru borsadan veri çekebilmesi buna bağlı. Daha önce bu sonek siliniyor,
  // sonra fiyat tarafında körlemesine ".IS" ekleniyordu; bu da yabancı
  // hisselerin (AAPL, TSLA vb.) hiç çalışmamasına sebep oluyordu.
  return { symbol: rawSymbol, type: "stock" };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store'
    });
    const data = await res.json();

    const yahooResults = (data.quotes || [])
      .filter((q: any) => q.symbol && q.quoteType)
      .map((q: any) => {
        const classified = classify(q);
        if (!classified) return null;
        return {
          symbol: classified.symbol,
          name: q.longname || q.shortname || q.symbol,
          type: classified.type,
        };
      })
      .filter(Boolean);

    // Madenler en üstte: aranan şey bir madense kullanıcı onu ilk sırada görmeli.
    return NextResponse.json({ results: [...matchingMetals(query), ...yahooResults] });
  } catch (error) {
    // Yahoo'ya ulaşılamasa bile sabit maden listesi çalışmaya devam etsin.
    return NextResponse.json({ results: matchingMetals(query) });
  }
}