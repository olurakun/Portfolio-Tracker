// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ShareView from './ShareView';
import { buildShareSnapshot, DEFAULT_SHARE_COLUMNS, type ShareableRow, type ShareConfig } from '../../lib/shares';

afterEach(cleanup);

const rows: ShareableRow[] = [
  { symbol: 'THYAO', type: 'stock', totalQty: 100, currentPrice: 305.25, currentPriceUSD: 8.94,
    value: 30525, valueUSD: 894, unrealizedPL: 4231, unrealizedPLUSD: 124, realizedPL: 0, realizedPLUSD: 0 },
  { symbol: 'AAPL', type: 'stock', totalQty: 40, currentPrice: 10122.4, currentPriceUSD: 296.42,
    value: 404896, valueUSD: 11856.8, unrealizedPL: -18420.6, unrealizedPLUSD: -540.1, realizedPL: 0, realizedPLUSD: 0 },
];

const setup = (config: ShareConfig) =>
  render(<ShareView title="Test" updatedAt="2026-08-22T10:00:00Z" snapshot={buildShareSnapshot(rows, config)} />);

describe('ShareView', () => {
  it('tüm sütunlar açıkken toplam satırını gösterir', () => {
    setup({ assetTypes: null, columns: DEFAULT_SHARE_COLUMNS });
    expect(screen.getByText('TOPLAM')).toBeInTheDocument();
  });

  // GERÇEKTE YAŞANAN HATA: kullanıcı "Değer"i kapatıp yalnızca "Pay"ı açık
  // bıraktığında (tam da uygulamanın ilk örneği olan "sadece yüzdeleri
  // göster" senaryosu) toplam satırı HİÇ görünmüyordu, çünkü satır yalnızca
  // "value" sütunu açıksa render ediliyordu.
  it('Değer kapalı, yalnızca Pay açıkken de toplam satırını gösterir', () => {
    setup({
      assetTypes: null,
      columns: { quantity: false, price: false, value: false, share: true, unrealizedPL: false, realizedPL: false },
    });
    expect(screen.getByText('TOPLAM')).toBeInTheDocument();
    expect(screen.getByText('%100')).toBeInTheDocument();
  });

  it('Değer kapalı, yalnızca K/Z açıkken de toplam satırını gösterir', () => {
    setup({
      assetTypes: null,
      columns: { quantity: false, price: false, value: false, share: false, unrealizedPL: true, realizedPL: false },
    });
    const row = screen.getByText('TOPLAM').closest('tr')!;
    // 4231 + (-18420.6) = -14189.6
    expect(row.textContent).toContain('14.189,60');
  });

  // Kullanıcının bildirdiği tam senaryo: Değer kapalı, Anlık K/Z VE Realize
  // K/Z birlikte açık.
  it('Değer kapalı, her iki K/Z de açıkken toplam satırında ikisi de görünür', () => {
    setup({
      assetTypes: null,
      columns: { quantity: false, price: false, value: false, share: false, unrealizedPL: true, realizedPL: true },
    });
    const row = screen.getByText('TOPLAM').closest('tr')!;
    expect(row.textContent).toContain('14.189,60'); // toplam anlık K/Z
    expect(row.textContent).toContain('0,00 ₺');    // toplam realize K/Z
  });

  it('yalnızca adet ve fiyat açıkken toplam satırı hiç çıkmaz (anlamlı bir toplam yok)', () => {
    setup({
      assetTypes: null,
      columns: { quantity: true, price: true, value: false, share: false, unrealizedPL: false, realizedPL: false },
    });
    expect(screen.queryByText('TOPLAM')).not.toBeInTheDocument();
  });

  it('değer açıkken toplam değeri doğru toplar', () => {
    setup({ assetTypes: null, columns: DEFAULT_SHARE_COLUMNS });
    const row = screen.getByText('TOPLAM').closest('tr')!;
    expect(row.textContent).toContain('435.421,00');
  });

  it('hiç varlık yoksa bilgilendirici mesaj gösterir, toplam satırı çıkmaz', () => {
    setup({ assetTypes: ['metal'], columns: DEFAULT_SHARE_COLUMNS });
    expect(screen.getByText(/gösterilecek varlık yok/)).toBeInTheDocument();
    expect(screen.queryByText('TOPLAM')).not.toBeInTheDocument();
  });

  it('varlık tipi rozetini gösterir', () => {
    setup({ assetTypes: null, columns: DEFAULT_SHARE_COLUMNS });
    expect(screen.getAllByText('Hisse')).toHaveLength(2);
  });

  it('gizlenen sütunun başlığı da çıkmaz', () => {
    setup({ assetTypes: null, columns: { ...DEFAULT_SHARE_COLUMNS, unrealizedPL: false } });
    expect(screen.queryByText('Anlık K/Z')).not.toBeInTheDocument();
  });
});
