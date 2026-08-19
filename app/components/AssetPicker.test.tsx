// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import AssetPicker, { type AssetChoice } from './AssetPicker';

afterEach(cleanup);

// Bileşen kontrollü; gerçek kullanımdaki gibi state'i tutan bir sarmalayıcıyla
// test ediliyor, yoksa yazılan harfler geri gelmez ve test kendini kandırır.
function Harness({ onValue }: { onValue?: (v: AssetChoice) => void }) {
  const [value, setValue] = useState<AssetChoice>({ symbol: '', name: '', type: 'stock' });
  return (
    <AssetPicker
      value={value}
      onChange={(next) => { setValue(next); onValue?.(next); }}
    />
  );
}

const manualInput = () => screen.getByPlaceholderText(/Sembol — BIST/);
const searchInput = () => screen.getByPlaceholderText(/^Ara:/);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => ({ results: [
      { symbol: 'INFO.IS', name: 'Info Yatirim Menkul Degerler A.S.', type: 'stock' },
      { symbol: 'INFO', name: 'Harbor PanAgora Dynamic Large C', type: 'fund' },
    ] }),
  })) as unknown as typeof fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('AssetPicker', () => {
  it('arama kutusuyla açılır', () => {
    render(<Harness />);
    expect(searchInput()).toBeInTheDocument();
  });

  // ASIL HATA: elle yazma alanı `symbol` boşken gösteriliyordu; ilk harf
  // yazılır yazılmaz alan ekrandan kalkıp tek harfi sembol olarak seçiyordu.
  it('elle yazarken ilk harften sonra alan kapanmaz', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText(/Bulamadım, sembolü elle yazayım/));

    await userEvent.type(manualInput(), 'INFO.IS');

    expect(manualInput()).toBeInTheDocument();
    expect(manualInput()).toHaveValue('INFO.IS');
  });

  it('elle yazılan sembolü büyük harfe çevirir', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(screen.getByText(/Bulamadım, sembolü elle yazayım/));
    await userEvent.type(manualInput(), 'info.is');
    expect(manualInput()).toHaveValue('INFO.IS');
  });

  it('elle kipte varlık adı da girilebilir', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText(/Bulamadım, sembolü elle yazayım/));
    await userEvent.type(screen.getByPlaceholderText(/Varlık adı/), 'Info Yatırım');
    expect(screen.getByPlaceholderText(/Varlık adı/)).toHaveValue('Info Yatırım');
  });

  it('aramaya dönünce elle girilen değer temizlenir', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText(/Bulamadım, sembolü elle yazayım/));
    await userEvent.type(manualInput(), 'INFO.IS');
    await userEvent.click(screen.getByText('Aramaya dön'));

    expect(searchInput()).toBeInTheDocument();
    expect(searchInput()).toHaveValue('');
  });

  it('arama sonucundan seçince seçili kartı gösterir', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(searchInput(), 'INFO');

    const hit = await screen.findByText('INFO.IS', {}, { timeout: 2000 });
    await userEvent.click(hit);

    expect(onValue).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'INFO.IS', type: 'stock' }),
    );
    expect(screen.getByText('Info Yatirim Menkul Degerler A.S.')).toBeInTheDocument();
    expect(screen.getByText('Değiştir')).toBeInTheDocument();
  });

  it('"Değiştir" seçimi temizleyip aramaya döner', async () => {
    render(<Harness />);
    await userEvent.type(searchInput(), 'INFO');
    await userEvent.click(await screen.findByText('INFO.IS', {}, { timeout: 2000 }));
    await userEvent.click(screen.getByText('Değiştir'));
    expect(searchInput()).toBeInTheDocument();
  });

  // İki harften kısa sorgu için istek atmak boşuna; Yahoo da anlamlı sonuç vermiyor.
  it('tek harfte arama isteği atmaz', async () => {
    render(<Harness />);
    await userEvent.type(searchInput(), 'I');
    await new Promise(r => setTimeout(r, 500));
    expect(fetch).not.toHaveBeenCalled();
  });

  // Sorgu değişince eski sonuçlar anında kaybolmalı; yoksa kullanıcı yazdığı
  // yeni sorguya ait sanıp yanlış varlığı seçebilir.
  it('sorgu değişince eski sonuçlar ekranda kalmaz', async () => {
    render(<Harness />);
    await userEvent.type(searchInput(), 'INFO');
    await screen.findByText('INFO.IS', {}, { timeout: 2000 });

    await userEvent.type(searchInput(), 'X');
    expect(screen.queryByText('Info Yatirim Menkul Degerler A.S.')).not.toBeInTheDocument();
  });

  it('varlık tipi seçilebilir', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.selectOptions(screen.getByLabelText('Varlık tipi'), 'metal');
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ type: 'metal' }));
  });

  it('arama başarısız olursa çökmez', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ağ hatası'); }) as unknown as typeof fetch);
    render(<Harness />);
    await userEvent.type(searchInput(), 'INFO');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(searchInput()).toBeInTheDocument();
  });
});
