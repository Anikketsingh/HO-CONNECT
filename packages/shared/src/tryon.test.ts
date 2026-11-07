import { describe, expect, it } from 'vitest';
import { slugify, tryOnLink, withUtm } from './tryon';

describe('slugify', () => {
  it.each([
    ['Glamour Salon & Spa, Andheri', 'glamour-salon-spa-andheri'],
    ["  Rani's  Beauté Parlour  ", 'rani-s-beaute-parlour'],
    ['रानी पार्लर', ''],
    ['A'.repeat(60), 'a'.repeat(40)],
    ['Looks Salon - Unisex Hair and Beauty Studio Delhi', 'looks-salon-unisex-hair-and-beauty-studi'],
  ])('%s → %s', (input, out) => expect(slugify(input)).toBe(out));

  it('never ends on a hyphen after cutting', () => {
    expect(slugify('abcdefghi jklmnopqrstuvwxyz abcdefghijk lmnop')).not.toMatch(/-$/);
  });
});

describe('tryOnLink', () => {
  const partner = { code: 'hoc00042', businessName: 'Glamour Salon' };

  it('tags the try-on app with the partner code', () => {
    expect(tryOnLink('https://aitryon.hairoriginals.com', partner, 'qr')).toBe(
      'https://aitryon.hairoriginals.com/?utm_source=ho_connect&utm_medium=partner_qr&utm_campaign=HOC00042&utm_content=glamour-salon',
    );
    expect(tryOnLink('https://aitryon.hairoriginals.com/', partner, 'link')).toBe(
      'https://aitryon.hairoriginals.com/?utm_source=ho_connect&utm_medium=partner_link&utm_campaign=HOC00042&utm_content=glamour-salon',
    );
  });

  it('leaves out utm_content when the name has nothing usable', () => {
    expect(tryOnLink('https://aitryon.hairoriginals.com', { code: 'HOC00042', businessName: null }, 'qr')).toBe(
      'https://aitryon.hairoriginals.com/?utm_source=ho_connect&utm_medium=partner_qr&utm_campaign=HOC00042',
    );
    expect(tryOnLink('https://aitryon.hairoriginals.com', { code: 'HOC00042', businessName: 'रानी पार्लर' }, 'qr')).not.toContain('utm_content');
  });

  it('keeps a path, other params and a #hash on the base URL, and replaces UTM tags there', () => {
    expect(tryOnLink('https://staging.example.com/try?lang=hi&utm_source=x#style', { code: 'HOC1', businessName: '' }, 'qr')).toBe(
      'https://staging.example.com/try?lang=hi&utm_source=ho_connect&utm_medium=partner_qr&utm_campaign=HOC1#style',
    );
  });
});

describe('withUtm', () => {
  it('encodes values and skips empty ones', () => {
    expect(withUtm('https://hairoriginals.com/pages/stores', [['utm_source', 'ho_store'], ['utm_campaign', 'a b&c'], ['utm_content', null]])).toBe(
      'https://hairoriginals.com/pages/stores?utm_source=ho_store&utm_campaign=a%20b%26c',
    );
  });
});
