// Türkçe metin karşılaştırma.
//
// JS'in toLowerCase'i büyük/küçük harf duyarsız EŞLEŞTİRME için kullanılamaz:
// varsayılan locale'de "İ" noktalı i'ye düşer, Türkçe locale'de ise "MIDAS"
// → "mıdas" olurken "Midas" → "midas" olur, yani aynı kelime iki ayrı anahtara
// gider. Eşleştirmeden önce Türkçe harfleri ASCII'ye katlıyoruz.
//
// SIRALAMA farklı bir iş: orada localeCompare(..., 'tr') doğru olan
// (bkz. lib/sortPositions.ts) — Ç ve Ö alfabede C ve O'dan hemen sonra gelmeli.

const TURKISH_FOLD: Record<string, string> = {
  'İ': 'i', 'I': 'i', 'ı': 'i', 'Ş': 's', 'ş': 's', 'Ğ': 'g', 'ğ': 'g',
  'Ü': 'u', 'ü': 'u', 'Ö': 'o', 'ö': 'o', 'Ç': 'c', 'ç': 'c',
};

/** Karşılaştırma için normalleştirilmiş hâl: "İŞ Yatırım" → "is yatirim". */
export function fold(value: string): string {
  return value.trim().replace(/[İIıŞşĞğÜüÖöÇç]/g, c => TURKISH_FOLD[c]).toLowerCase();
}
