// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrokerBar from './BrokerBar';

afterEach(cleanup);

const totals = [
  { broker: 'Midas', value: 1414508.61 },
  { broker: 'Yapı Kredi', value: 2186275.2 },
  { broker: '', value: 170700 },
];
const grand = totals.reduce((a, b) => a + b.value, 0);

const setup = (props: Partial<React.ComponentProps<typeof BrokerBar>> = {}) =>
  render(<BrokerBar totals={totals} selected={null} onSelect={() => {}} grandTotal={grand} {...props} />);

describe('BrokerBar', () => {
  it('her kurumu tutarıyla listeler', () => {
    setup();
    expect(screen.getByRole('button', { name: /Midas/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yapı Kredi/ })).toBeInTheDocument();
  });

  // Aracısı doldurulmamış kayıtlar görünür olmalı: doldurulacak olanlar bunlar.
  it('belirtilmemiş kayıtları da bir grup olarak gösterir', () => {
    setup();
    expect(screen.getByRole('button', { name: /Belirtilmemiş/ })).toBeInTheDocument();
  });

  it('payları toplam üzerinden hesaplar', () => {
    setup();
    expect(screen.getByRole('button', { name: /Yapı Kredi/ })).toHaveTextContent('%58');
  });

  it('kuruma tıklayınca seçimi bildirir', async () => {
    const onSelect = vi.fn();
    setup({ onSelect });
    await userEvent.click(screen.getByRole('button', { name: /Midas/ }));
    expect(onSelect).toHaveBeenCalledWith('Midas');
  });

  it('"Hepsi" seçimi temizler', async () => {
    const onSelect = vi.fn();
    setup({ selected: 'Midas', onSelect });
    await userEvent.click(screen.getByRole('button', { name: /Hepsi/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('seçili kurumu vurgular', () => {
    setup({ selected: 'Yapı Kredi' });
    expect(screen.getByRole('button', { name: /Yapı Kredi/ }).className).toContain('border-purple-500');
    expect(screen.getByRole('button', { name: /Midas/ }).className).not.toContain('border-purple-500');
  });

  // Kırılımı olmayan bir kırılım çubuğu yer kaplamaktan başka bir şey yapmaz.
  it('tek kurum varsa hiç görünmez', () => {
    const { container } = setup({ totals: [{ broker: 'Midas', value: 100 }] });
    expect(container).toBeEmptyDOMElement();
  });

  it('hiç kurum yoksa görünmez', () => {
    const { container } = setup({ totals: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('toplam sıfırken yüzde göstermez', () => {
    setup({ totals: [{ broker: 'Midas', value: 0 }, { broker: 'Yapı Kredi', value: 0 }], grandTotal: 0 });
    expect(screen.getByRole('button', { name: /Midas/ })).not.toHaveTextContent('%');
  });
});
