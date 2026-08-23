// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortfolioChart from './PortfolioChart';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const assets = [{ id: '1', symbol: 'THYAO', type: 'stock' }];
const transactions = [
  { asset_id: '1', type: 'buy', quantity: 100, price: 300, date: '2026-06-01', currency: 'TRY' },
];
const fxRates = { '2026-06-01': 40, '2026-08-20': 41 };

function mockHistory() {
  const fn = vi.fn(async () => ({
    json: async () => ({ series: { THYAO: { currency: 'TRY', prices: { '2026-06-01': 300, '2026-08-20': 320 } } } }),
  } as Response));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const setup = () => render(
  <PortfolioChart assets={assets} transactions={transactions} fxRates={fxRates} />
);

describe('PortfolioChart katlanabilirlik', () => {
  it('varsayılan KAPALI — grafik değil şerit gösterir', () => {
    mockHistory();
    setup();
    expect(screen.getByText('grafiği aç')).toBeTruthy();
    // Aralık düğmeleri yalnızca açıkken anlamlı.
    expect(screen.queryByText('1 Ay')).toBeNull();
  });

  // Bu testin varlık sebebi: 82 sembolün 54'ü TEFAS fonu ve TEFAS'ın resmî
  // API'si yok. Kapalı grafiğin veri çekmesi her sayfa açılışında boşuna
  // istek demek — engellenme riski.
  it('KAPALIYKEN geçmiş veri isteği ATMAZ', () => {
    const fetchFn = mockHistory();
    setup();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('açılınca veriyi çeker ve grafiği gösterir', async () => {
    const fetchFn = mockHistory();
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Portföy Değeri/ }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(screen.getByText('1 Ay')).toBeTruthy();
  });

  it('kapatıp tekrar açmak YENİDEN ÇEKMEZ (aynı veri kümesi)', async () => {
    const fetchFn = mockHistory();
    setup();
    const toggle = () => screen.getByRole('button', { name: /Portföy Değeri/ });
    await userEvent.click(toggle());                                   // aç
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    await userEvent.click(toggle());                                   // kapat
    expect(screen.getByText('grafiği aç')).toBeTruthy();
    await userEvent.click(toggle());                                   // tekrar aç
    await waitFor(() => expect(screen.getByText('1 Ay')).toBeTruthy());
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('istek başarısız olursa tekrar açıldığında YENİDEN DENER', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('ağ hatası'); });
    global.fetch = fetchFn as unknown as typeof fetch;
    setup();
    const toggle = () => screen.getByRole('button', { name: /Portföy Değeri/ });
    await userEvent.click(toggle());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    await userEvent.click(toggle());  // kapat
    await userEvent.click(toggle());  // tekrar aç
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
  });
});
