// Kullanıcının kendi Anthropic anahtarı (BYOK).
//
// Anahtar TARAYICIDA durur ve yalnızca dönüştürme isteğiyle birlikte gönderilir;
// sunucuda hiçbir yere yazılmaz, veritabanına girmez. Bunun bilinçli takası şu:
// başkasının fatura kesebilen kimlik bilgisini saklamak, saklayanın üstüne
// şifreleme anahtarı bekçiliği ve toplu sızıntı riski yükler. Bedeli ise
// localStorage'ın sayfadaki bir XSS açığına karşı korunaksız olması — bu yüzden
// ayarlar ekranında kullanıcıya açıkça söyleniyor.
//
// Ticari dağıtımda doğru cevap muhtemelen anahtarı sunucuda şifreli saklamak
// olacak; o zaman burası tek değişecek yer olsun diye erişim tek noktada.

const STORAGE_KEY = 'portfoy-takip:anthropic-key';

/**
 * Anahtarın biçimsel olarak geçerli görünüp görünmediği. Amaç doğrulamak değil
 * (bunu ancak Anthropic yapabilir), yanlış yapıştırılmış bir metni ağ isteğine
 * hiç çıkarmadan yakalamak.
 */
export function isApiKeyFormat(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

/** Ekranda gösterim için: gizli kısmı asla tam yazılmaz. */
export function maskApiKey(value: string): string {
  const key = value.trim();
  if (key.length <= 12) return '••••';
  return `${key.slice(0, 11)}…${key.slice(-4)}`;
}

export function readUserApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    // Gizli sekme / kapalı depolama: özellik yok sayılır, uygulama çalışmaya devam eder.
    return null;
  }
}

export function saveUserApiKey(value: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!isApiKeyFormat(value)) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, value.trim());
    notify();
    return true;
  } catch {
    return false;
  }
}

export function clearUserApiKey(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* yok sayılır */ }
  notify();
}

// localStorage React'in dışında bir depo; arayüz onu efektle kopyalamak yerine
// useSyncExternalStore ile doğrudan okusun diye abonelik sağlıyoruz. Tarayıcının
// 'storage' olayı yalnızca DİĞER sekmelerde tetiklendiği için kendi
// yazmalarımızı ayrıca duyuruyoruz.
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeApiKey(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== 'undefined') window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', cb);
  };
}

/** Sunucu render'ında localStorage yok; her zaman "anahtar yok" varsayılır. */
export function readUserApiKeyServer(): null {
  return null;
}
