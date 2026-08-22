// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TransactionModal, { type TransactionForm } from './TransactionModal';

afterEach(cleanup);

const ASSETS = [
  { id: '1', symbol: 'THYAO' },
  { id: '2', symbol: 'AAPL' },
];

const FORM: TransactionForm = {
  txType: 'buy', quantity: '', price: '', date: '2026-01-15',
  currency: 'TRY', broker: '', assetId: '1', newAsset: false,
  choice: { symbol: '', name: '', type: 'stock' },
};

function setup(overrides: Partial<TransactionForm> = {}, props: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const { container } = render(
    <TransactionModal
      open onClose={onClose} editing={false} assets={ASSETS}
      value={{ ...FORM, ...overrides }} onChange={onChange} onSubmit={onSubmit}
      heldQuantity={0} onFetchHistoricalPrice={vi.fn()} priceLookup="idle"
      brokers={['Midas', 'Yapı Kredi']}
      {...props}
    />
  );
  return { onChange, onSubmit, onClose, container };
}

describe('TransactionModal', () => {
  it('open=false iken hiçbir şey basmaz', () => {
    const { container } = render(
      <TransactionModal
        open={false} onClose={vi.fn()} editing={false} assets={ASSETS}
        value={FORM} onChange={vi.fn()} onSubmit={vi.fn()}
        heldQuantity={0} onFetchHistoricalPrice={vi.fn()} priceLookup="idle" brokers={[]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('başlıkta seçili varlığın sembolü görünür', () => {
    setup({ assetId: '2' });
    expect(screen.getByRole('heading').textContent).toContain('AAPL');
  });

  it('düzenleme kipinde başlık ve buton değişir, "+ Yeni" gizlenir', () => {
    setup({}, { editing: true });
    expect(screen.getByRole('heading').textContent).toBe('İşlemi Düzenle');
    expect(screen.getByRole('button', { name: 'Güncelle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Yeni' })).toBeNull();
  });

  it('temettüde adet alanı yerine tek tutar alanı gelir', () => {
    setup({ txType: 'dividend' });
    expect(screen.queryByPlaceholderText('Adet')).toBeNull();
    expect(screen.getByPlaceholderText('Net temettü tutarı (toplam)')).toBeTruthy();
  });

  it('satımda elde tutulan adedi gösterir', () => {
    setup({ txType: 'sell' }, { heldQuantity: 12.5 });
    expect(screen.getByText(/Elinizdeki adet: 12,5/)).toBeTruthy();
  });

  // Faz 6 kapanışındaki renk kuralı: yeşil/kırmızı yalnızca kâr/zarar demek.
  // İşlem tipi ve kaydet butonu tipe göre yeşil/kırmızıya dönmemeli.
  it('kaydet butonu ve tip seçimi kâr/zarar renklerini kullanmaz', () => {
    const { container } = setup({ txType: 'sell' });
    const save = screen.getByRole('button', { name: 'Kaydet' });
    expect(save.className).toContain('bg-purple-600');
    expect(container.querySelectorAll('[class*="bg-red-"], [class*="bg-green-"]').length).toBe(0);
  });

  it('seçili işlem tipi aria-pressed ile işaretlenir', () => {
    setup({ txType: 'dividend' });
    expect(screen.getByRole('button', { name: 'Temettü' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Alım' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('alan değişikliği tüm formu koruyarak onChange gönderir', () => {
    const { onChange } = setup({ quantity: '5', broker: 'Midas' });
    fireEvent.change(screen.getByPlaceholderText('Fiyat'), { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ price: '42', quantity: '5', broker: 'Midas' })
    );
  });

  it('"Yeni" varlık kipine geçince seçim kutusu yerine AssetPicker gelir', () => {
    setup({ newAsset: true });
    expect(screen.queryByLabelText('Varlık')).toBeNull();
    expect(screen.getByText('Yeni varlık')).toBeTruthy();
  });

  it('"+ Yeni" tıklanınca kip değişir ve önceki sembol temizlenir', () => {
    const { onChange } = setup({ choice: { symbol: 'ESKI', name: 'Eski', type: 'fund' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Yeni' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ newAsset: true, choice: { symbol: '', name: '', type: 'stock' } })
    );
  });

  it('aracı kurum önerileri datalist olarak basılır', () => {
    const { container } = setup();
    const options = container.querySelectorAll('#broker-suggestions option');
    expect([...options].map(o => o.getAttribute('value'))).toEqual(['Midas', 'Yapı Kredi']);
  });

  it('fiyat aranırken buton kilitlenir', () => {
    setup({}, { priceLookup: 'loading' });
    expect(screen.getByRole('button', { name: '...' }).hasAttribute('disabled')).toBe(true);
  });

  it('fiyat bulunamadığında uyarı gösterir', () => {
    setup({}, { priceLookup: 'error' });
    expect(screen.getByText(/bulunamadı/)).toBeTruthy();
  });

  it('arka plana tıklamak kapatır, formun içine tıklamak kapatmaz', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('heading'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.fixed.inset-0')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('form gönderilince onSubmit çağrılır', () => {
    const { onSubmit } = setup({ quantity: '1', price: '2' });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
