// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DataSources from './DataSources';

afterEach(cleanup);

describe('DataSources', () => {
  // ExchangeRate-API'nin ücretsiz katmanı atfı ZORUNLU tutuyor ve bağlantı
  // metnini sabitliyor. Bu test bir stil tercihi değil, lisans şartı:
  // kırılırsa o servisin kullanım koşulları ihlal ediliyor demektir.
  it('ExchangeRate-API atfını şartın istediği metinle verir', () => {
    render(<DataSources />);
    const link = screen.getByRole('link', { name: 'Rates By Exchange Rate API' });
    expect(link).toHaveAttribute('href', 'https://www.exchangerate-api.com');
  });

  it('rakamların geldiği diğer kaynakları da künyeye yazar', () => {
    render(<DataSources />);
    for (const name of ['Frankfurter', 'TEFAS', 'Yahoo Finance']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  // Dış bağlantılar yeni sekmede ve referrer sızdırmadan açılmalı.
  it('dış bağlantıları güvenli açar', () => {
    render(<DataSources />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });
});
