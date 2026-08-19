/**
 * Eşzamanlılık sınırlayıcı.
 *
 * Bazı kaynaklar belirli sayıdan fazla eşzamanlı bağlantıda isteği düşürüyor.
 * TEFAS ölçüldü: 7 eşzamanlı istekte sorunsuz, 14'te 8 tanesi bağlantı hatası
 * veriyor. Sayfa açılışında hem güncel fiyat hem geçmiş seri aynı anda
 * istendiği için bu sınır aşılıyor ve fon fiyatları boş dönüyordu.
 */
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/**
 * Geçici ağ hatalarında yeniden dener. Sınırlayıcı eşzamanlılığı düşürse de
 * tek tük bağlantı hatası olabiliyor; bir fon fiyatının boş dönmesi tüm
 * portföyü etkilediği için tek deneme yeterli değil.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  isFailure: (result: T) => boolean,
  attempts = 3,
  delayMs = 250,
): Promise<T> {
  let last = await fn();
  for (let i = 1; i < attempts && isFailure(last); i++) {
    await new Promise(r => setTimeout(r, delayMs * i));
    last = await fn();
  }
  return last;
}
