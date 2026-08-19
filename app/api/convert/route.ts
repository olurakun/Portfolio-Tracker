import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildRow, type ParsedRow } from "../../../lib/importParse";
import { parseCsv, parseXlsx, gridToText } from "../../../lib/fileGrid";
import { isApiKeyFormat } from "../../../lib/apiKey";
import { userIdFromRequest } from "../../../lib/serverAuth";

// AKILLI İÇE AKTARMA (Faz 5)
// Kullanıcının aracı kurumundan aldığı dosyayı ŞABLONA ÇEVİRİR — içe aktarmaz.
// Çıktı doğrudan veritabanına yazılmaz; mevcut önizleme modalına düşer ve
// kullanıcı onayından geçer. Model burada bir "dönüştürücü", bir karar verici değil.

export const maxDuration = 300;

const MODEL = "claude-opus-5";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 800_000;

const SYSTEM = `Sen bir işlem dökümü dönüştürücüsüsün. Aracı kurum, banka veya borsa ekstrelerini bir portföy takip uygulamasının içe aktarma şablonuna çevirirsin.

Şablon alanları:
- symbol: varlığın borsa/fon kodu, büyük harf (THYAO, AAPL, TLY, XAU). Belgede yalnızca şirket adı geçiyorsa ve kodundan emin değilsen o hareketi skipped'a yaz.
- type: buy (alım), sell (satım) veya dividend (temettü).
- quantity: işlem adedi.
- price: ADET BAŞINA birim fiyat — toplam tutar değil.
- date: işlem tarihi, YYYY-MM-DD.
- currency: TRY veya USD.
- broker: işlemin yapıldığı aracı kurum/banka adı.

Kurallar:
- Yalnızca GERÇEKLEŞMİŞ hareketleri al. İptal edilen, reddedilen, süresi dolan ve bekleyen emirler portföye girmemiştir; atla.
- Kısmi gerçekleşen emirlerde "Gerçekleşen Adet" benzeri bir sütun varsa emir adedini değil onu kullan.
- Belgede yalnızca toplam tutar varsa birim fiyatı adede bölerek bul. Komisyon, BSMV ve stopajı fiyata katma.
- Temettü satırlarında quantity 1, price ise elde edilen net TOPLAM tutardır.
- currency, işlemin gerçekleştiği para birimidir: ABD borsalarındaki hisseler genelde USD, BIST hisseleri ve TEFAS fonları TRY. Bunu belgedeki para birimi sütunundan veya tutar simgesinden belirle; belirleyemiyorsan hareketi skipped'a yaz. Yanlış para birimi kâr/zararı tamamen bozar.
- TRY ve USD dışındaki para birimleri (EUR, GBP gibi) bu uygulamada desteklenmiyor; o hareketleri skipped'a yaz.
- Nakit yatırma/çekme, virman, komisyon, vergi, faiz ve bakiye satırları varlık işlemi değildir; atla.
- Hiçbir alanı tahmin etme ve belgede olmayan bir hareket üretme. Bir hareketin herhangi bir alanını okuyamıyorsan onu rows'a koymak yerine skipped'a yaz.
- broker'ı belgenin başlığından veya antetinden al (ekstreler genelde tek bir kuruma aittir, o zaman her satıra aynı adı yaz). Kurumu belirleyemiyorsan boş bırak — kullanıcı içe aktarma ekranında tek seferde atayabiliyor. UYDURMA.
- sourceTransactionCount: belgede saydığın gerçekleşmiş alım/satım/temettü hareketi sayısı. Bu sayı rows ile karşılaştırılıp kullanıcıya gösterilecek, o yüzden dürüst say.
- skipped: atladığın her hareket için tek cümlelik sebep (ör. "12.03.2026 ASELS satım — emir iptal edilmiş").`;

const SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          type: { type: "string", enum: ["buy", "sell", "dividend"] },
          quantity: { type: "number" },
          price: { type: "number" },
          date: { type: "string" },
          currency: { type: "string", enum: ["TRY", "USD"] },
          broker: { type: "string" },
        },
        required: ["symbol", "type", "quantity", "price", "date", "currency", "broker"],
        additionalProperties: false,
      },
    },
    skipped: { type: "array", items: { type: "string" } },
    sourceTransactionCount: { type: "integer" },
  },
  required: ["rows", "skipped", "sourceTransactionCount"],
  additionalProperties: false,
} as const;

type ConversionOutput = {
  rows: { symbol: string; type: string; quantity: number; price: number; date: string; currency: string; broker: string }[];
  skipped: string[];
  sourceTransactionCount: number;
};

export async function POST(request: Request) {
  // Bu uç dış bir servise ÜCRETLİ çağrı yapıyor; oturumsuz çağrılabilirse
  // adresi bilen herkes sunucu anahtarından harcayabilir.
  const userId = await userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
  }

  // Kullanıcının kendi anahtarı varsa o kullanılır; anahtar sunucuda hiçbir
  // yere yazılmaz, yalnızca bu istek boyunca bellekte durur.
  const userKey = (request.headers.get('x-anthropic-key') ?? '').trim();
  if (userKey && !isApiKeyFormat(userKey)) {
    return NextResponse.json({
      error: 'Girdiğin anahtar Anthropic anahtarına benzemiyor (sk-ant- ile başlamalı).',
    }, { status: 400 });
  }
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: 'Dönüştürme için bir API anahtarı gerekiyor. Kendi Anthropic anahtarını içe aktarma bölümünden girebilirsin.',
      needsKey: true,
    }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Dosya çok büyük (en fazla 12 MB).' }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const client = new Anthropic({ apiKey });

  let content: Anthropic.ContentBlockParam[];
  try {
    if (name.endsWith('.pdf')) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Bu dökümdeki işlemleri şablona çevir.' },
      ];
    } else {
      let text: string;
      if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
        text = gridToText(await parseXlsx(await file.arrayBuffer(), true));
      } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
        text = gridToText(parseCsv(await file.text()));
      } else {
        return NextResponse.json({ error: 'Desteklenmeyen dosya türü. CSV, Excel veya PDF yükleyin.' }, { status: 400 });
      }
      if (text.length > MAX_TEXT_CHARS) {
        return NextResponse.json({
          error: 'Dosya içeriği tek seferde işlenemeyecek kadar uzun. Dosyayı tarih aralığına göre bölüp ayrı ayrı yükleyin.',
        }, { status: 400 });
      }
      if (text.trim().length === 0) {
        return NextResponse.json({ error: 'Dosyada okunabilir içerik bulunamadı.' }, { status: 400 });
      }
      content = [{ type: 'text', text: `Bu dökümdeki işlemleri şablona çevir:\n\n${text}` }];
    }
  } catch {
    return NextResponse.json({ error: 'Dosya okunamadı. Formatı kontrol edin.' }, { status: 400 });
  }

  let output: ConversionOutput;
  try {
    // Uzun ekstrelerde çıktı binlerce token olabiliyor; akış olmadan istek
    // zaman aşımına uğrar.
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'Dosya işlenemedi. Farklı bir dosya deneyin.' }, { status: 422 });
    }
    if (message.stop_reason === 'max_tokens') {
      return NextResponse.json({
        error: 'Dosya tek seferde dönüştürülemeyecek kadar uzun. Tarih aralığına göre bölüp ayrı ayrı yükleyin.',
      }, { status: 400 });
    }

    const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    output = JSON.parse(text) as ConversionOutput;
  } catch (err) {
    // Hata mesajlarında anahtar asla yankılanmaz.
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({
        error: userKey ? 'Girdiğin API anahtarı geçersiz veya iptal edilmiş.' : 'Sunucudaki API anahtarı geçersiz.',
        needsKey: !!userKey,
      }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Kota doldu, biraz sonra tekrar deneyin.' }, { status: 429 });
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json({ error: 'Anahtarın bu modele erişim izni yok veya bakiye yetersiz.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Dönüştürme başarısız oldu. Tekrar deneyin.' }, { status: 502 });
  }

  // Modelin çıktısı da elle hazırlanan şablonla AYNI doğrulama kapısından geçer.
  const rows: ParsedRow[] = [];
  (output.rows ?? []).forEach((r, i) => {
    const row = buildRow(i + 1, r);
    if (row) rows.push(row);
  });

  return NextResponse.json({
    rows,
    converted: true,
    skipped: output.skipped ?? [],
    sourceTransactionCount: output.sourceTransactionCount ?? null,
  });
}
