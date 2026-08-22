// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionsTab from './TransactionsTab';

afterEach(cleanup);

const assets = [
  { id: 1, symbol: 'THYAO', type: 'stock' },
  { id: 2, symbol: 'AAPL', type: 'stock' },
];

const tx = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 1, asset_id: 1, type: 'buy' as const, quantity: 100, price: 305.25,
  date: '2026-06-15', currency: 'TRY', broker: 'Midas', ...o,
});

const defaults = {
  assets,
  transactions: [tx(), tx({ id: 2, asset_id: 2, type: 'sell' as const, currency: 'USD', broker: 'Yapı Kredi' })],
  fxRates: { '2026-06-15': 33 },
  onEdit: () => {},
  onDelete: () => {},
  onDeleteMany: () => {},
  onDeleteAsset: () => {},
  onAdd: () => {},
  onSetAssetBroker: () => {},
};

// PortfolioTable'daki gibi iki düzen birden DOM'da (jsdom medya sorgusu
// uygulamaz); sorgular hangi düzeni test ettiğini söylemeli.
const setup = (props: Partial<typeof defaults> = {}) =>
  render(<TransactionsTab {...defaults} {...props} />);
const mobile = (c: HTMLElement) => within(c.querySelector('.md\\:hidden') as HTMLElement);
const desktop = (c: HTMLElement) => within(c.querySelector('table') as HTMLElement);

describe('TransactionsTab', () => {
  it('işlemleri tabloda listeler', () => {
    const { container } = setup();
    expect(desktop(container).getAllByText('THYAO').length).toBeGreaterThan(0);
  });

  // Sekiz sütunlu tablo 375px'e sığmıyordu — portföy tablosunda çözülen
  // sorunun aynısı.
  describe('dar ekran kart düzeni', () => {
    it('her işlem için varlık, tarih ve tutar kartta görünür', () => {
      const { container } = setup({ transactions: [tx()] });
      const m = mobile(container);
      expect(m.getByText('THYAO')).toBeInTheDocument();
      expect(m.getByText('2026-06-15')).toBeInTheDocument();
      expect(m.getByText('Alım')).toBeInTheDocument();
    });

    it('kartta düzenle ve sil eylemleri bulunur', async () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const { container } = setup({ transactions: [tx()], onEdit, onDelete });
      const m = mobile(container);
      await userEvent.click(m.getByRole('button', { name: 'Düzenle' }));
      expect(onEdit).toHaveBeenCalled();
      await userEvent.click(m.getByRole('button', { name: 'Sil' }));
      expect(onDelete).toHaveBeenCalled();
    });

    it('temettüde adet gösterilmez, yalnızca tutar', () => {
      const { container } = setup({ transactions: [tx({ type: 'dividend', quantity: 1, price: 125.5 })] });
      expect(mobile(container).getByText(/^125,50/)).toBeInTheDocument();
    });

    it('işlem yoksa bilgilendirir', () => {
      const { container } = setup({ transactions: [] });
      expect(mobile(container).getByText(/Henüz işlem yok/)).toBeInTheDocument();
    });
  });

  // Faz 6 renk kuralı: yeşil/kırmızı YALNIZCA kâr/zarar. İşlem tipi ve
  // "işlem ekle" eylemi bu renkleri kullanmamalı.
  it('işlem tipi etiketleri kâr/zarar renklerini kullanmaz', () => {
    const { container } = setup();
    const alim = desktop(container).getAllByText('Alım')[0];
    expect(alim.className).not.toMatch(/text-(green|red)-400/);
  });

  it('işlem ekle butonu yeşil değil', () => {
    setup();
    expect(screen.getByRole('button', { name: /İşlem ekle/ }).className).not.toMatch(/bg-green/);
  });

  it('aracı kurum filtresi işlemleri daraltır', async () => {
    const { container } = setup();
    // Filtreler sırayla: varlık, işlem tipi, aracı kurum.
    const brokerSelect = screen.getAllByRole('combobox')[2];
    await userEvent.selectOptions(brokerSelect, 'Midas');
    const table = desktop(container);
    expect(table.getAllByText('THYAO').length).toBeGreaterThan(0);
    expect(table.queryByText('AAPL')).not.toBeInTheDocument();
  });
});
