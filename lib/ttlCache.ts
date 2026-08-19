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

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  // Aynı anahtar için zaten bir çağrı uçuyorsa ona bindir.
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = load()
    .then(value => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
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
