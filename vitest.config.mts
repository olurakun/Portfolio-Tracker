import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Saf mantık testleri node'da hızlı çalışsın; bileşen testleri DOM ister.
    // Ortam dosya başında `// @vitest-environment jsdom` ile seçiliyor.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
