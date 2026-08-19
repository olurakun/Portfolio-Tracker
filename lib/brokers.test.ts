import { describe, it, expect } from 'vitest';
import {
  normalizeBroker, brokerKey, brokersOf, filterByBroker, brokerLabel, UNASSIGNED,
} from './brokers';

const tx = (broker?: string | null) => ({ broker });

describe('normalizeBroker', () => {
  it('baştaki/sondaki boşluğu atar, aradakini teke indirir', () => {
    expect(normalizeBroker('  Yapı   Kredi ')).toBe('Yapı Kredi');
  });

  it('yazımı olduğu gibi korur', () => {
    expect(normalizeBroker('MIDAS')).toBe('MIDAS');
  });

  it('boş ve metin olmayan değerlerde belirtilmemiş sayar', () => {
    expect(normalizeBroker('   ')).toBe(UNASSIGNED);
    expect(normalizeBroker(null)).toBe(UNASSIGNED);
    expect(normalizeBroker(undefined)).toBe(UNASSIGNED);
    expect(normalizeBroker(42)).toBe(UNASSIGNED);
  });
});

describe('brokerKey', () => {
  // Serbest metin girildiği için "midas" ile "Midas" ayrı gruplara düşmemeli.
  it('büyük/küçük harf ve boşluk farkını yok sayar', () => {
    expect(brokerKey(' midas ')).toBe(brokerKey('Midas'));
    expect(brokerKey('YAPI KREDİ')).toBe(brokerKey('yapı kredi'));
  });

  // Türkçe locale ile küçültmek BURADA yanlış olurdu: "MIDAS" → "mıdas",
  // "Midas" → "midas" olup aynı kurum iki gruba düşerdi.
  it('Türkçe harfleri doğru katlar', () => {
    expect(brokerKey('İş Yatırım')).toBe(brokerKey('İŞ YATIRIM'));
    expect(brokerKey('İş Yatırım')).toBe('is yatirim');
  });
});

describe('brokersOf', () => {
  it('kurumları Türkçe sıraya göre listeler', () => {
    expect(brokersOf([tx('Midas'), tx('Yapı Kredi'), tx('Ak Yatırım')]))
      .toEqual(['Ak Yatırım', 'Midas', 'Yapı Kredi']);
  });

  it('aynı kurumun farklı yazımlarını teke indirir', () => {
    expect(brokersOf([tx('Midas'), tx('midas'), tx('  MIDAS')])).toEqual(['Midas']);
  });

  // Kullanıcı önce gerçek kurumlarını görmeli.
  it('belirtilmemişi en sona koyar', () => {
    expect(brokersOf([tx(), tx('Midas'), tx(null)])).toEqual(['Midas', UNASSIGNED]);
  });

  it('hiç belirtilmemiş yoksa listeye eklemez', () => {
    expect(brokersOf([tx('Midas')])).toEqual(['Midas']);
  });

  it('boş listede boş döner', () => {
    expect(brokersOf([])).toEqual([]);
  });
});

describe('filterByBroker', () => {
  const rows = [tx('Midas'), tx('midas'), tx('Yapı Kredi'), tx(), tx(null)];

  it('null filtre hepsini döndürür', () => {
    expect(filterByBroker(rows, null)).toHaveLength(5);
  });

  it('yazım farkına bakmadan eşleştirir', () => {
    expect(filterByBroker(rows, 'MIDAS')).toHaveLength(2);
  });

  // Belirtilmemişleri ayrı görebilmek gerekiyor: doldurulacak kayıtlar bunlar.
  it('belirtilmemişleri kendi grubunda toplar', () => {
    expect(filterByBroker(rows, UNASSIGNED)).toHaveLength(2);
  });

  it('eşleşme yoksa boş döner', () => {
    expect(filterByBroker(rows, 'Garanti')).toEqual([]);
  });
});

describe('brokerLabel', () => {
  it('boş değeri okunur bir etikete çevirir', () => {
    expect(brokerLabel(UNASSIGNED)).toBe('Belirtilmemiş');
    expect(brokerLabel('Midas')).toBe('Midas');
  });
});
