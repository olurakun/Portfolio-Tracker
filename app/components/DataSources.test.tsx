// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DataSources from './DataSources';

afterEach(cleanup);

describe('DataSources', () => {
  it('rakamların geldiği kaynakları künyeye yazar', () => {
    render(<DataSources />);
    for (const name of ['Frankfurter', 'TEFAS', 'Yahoo Finance']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  // Kullanmadığımız bir servise atıf vermek yanıltıcı olur; kur artık
  // tamamen Frankfurter'dan geliyor (bkz. lib/fx.ts).
  it('kullanılmayan kaynakları listelemez', () => {
    const { container } = render(<DataSources />);
    expect(container.innerHTML).not.toContain('exchangerate-api');
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
