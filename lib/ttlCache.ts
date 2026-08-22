/**
 * Süreç içi, süreli önbellek.
 *
 * Sayfa açılışında her varlık için ayrı ayrı istenen ama aslında hepsi için
 * aynı olan verileri (güncel USD/TRY kuru gibi) tek çağrıya indirir. Sunucu
 * belleğinde tutulur; kalıcı değildir, sunucu yeniden başlayınca boşalır.
 *
 * Aynı anahtar için eşzamanlı istekler tek bir çağrıya bindirilir — 22 varlık
 * aynı anda kuru isterse dışarıya 22 değil 1 istek gider.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * `shouldCache`: yüklenen değer önbelleğe alınmaya değer mi? Varsayılan her
 * zaman "evet" — bazı çağıranlar için başarısızlığı da (ör. çözülemeyen
 * sembol) önbelleklemek doğru davranış.
 *
 * Ama BAZI çağıranlar için yanlış: `load()` hata FIRLATMADAN "veri yok"
 * anlamına gelen bir değer (null gibi) dönebilir. Böyle bir değeri normal
 * sonuç gibi önbelleğe almak, geçici bir ağ aksaklığını TTL süresince (kimi
 * çağrıda 24 saate kadar) donduruyor demektir — kullanıcı gerçek kur yerine
 * saatlerce sıfır görür. Bu, tam olarak yaşanan hataydı (lib/ttlCache.test.ts).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
): Promise<T> {
  const now = Date.now();

  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  // Aynı anahtar için zaten bir çağrı uçuyorsa ona bindir.
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = load()
    .then(value => {
      if (shouldCache(value)) store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Testler için. */
export function clearTtlCache(): void {
  store.clear();
  inflight.clear();
}
