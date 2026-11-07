import { describe, expect, it } from 'vitest';
import {
  applyBps,
  checkStageChange,
  DEFAULT_SETTINGS,
  formatLeadRef,
  maskName,
  maskPhone,
  normalizeIndianMobile,
  parseLeadRef,
  resolveSettings,
} from './index';

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['0091 9876543210', '9876543210'],
    ['(987) 654-3210', '9876543210'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each(['', '12345', '5876543210', '98765432101', '+1 415 555 0100', 'abcdefghij'])('rejects %s', (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });

  it('handles null and undefined', () => {
    expect(normalizeIndianMobile(null)).toBeNull();
    expect(normalizeIndianMobile(undefined)).toBeNull();
  });
});

describe('masking', () => {
  it('masks phone numbers', () => {
    expect(maskPhone('9876543210')).toBe('98XXXXX210');
    expect(maskPhone('123')).toBe('XXXXXXXXXX');
  });

  it('masks names to first name + last initial', () => {
    expect(maskName('priya sharma')).toBe('Priya S.');
    expect(maskName('  Anil  Kumar  Verma ')).toBe('Anil V.');
    expect(maskName('Priya')).toBe('Priya');
    expect(maskName('   ')).toBe('Customer');
    expect(maskName(null)).toBe('Customer');
  });
});

describe('lead refs', () => {
  it('formats and parses', () => {
    expect(formatLeadRef(123)).toBe('L-000123');
    expect(parseLeadRef('L-000123')).toBe(123);
    expect(parseLeadRef('l-123')).toBe(123);
    expect(parseLeadRef('123')).toBe(123);
    expect(parseLeadRef('X-1')).toBeNull();
  });
});

describe('money', () => {
  it('applies basis points with rounding', () => {
    expect(applyBps(1_000_000, 750)).toBe(75_000); // 7.5% of ₹10,000 = ₹750
    expect(applyBps(333, 1000)).toBe(33); // 33.3 → 33
    expect(applyBps(335, 1000)).toBe(34); // 33.5 → 34
  });
});

describe('checkStageChange', () => {
  it('allows moving an open lead to an agent-settable stage', () => {
    expect(checkStageChange({ current: 'verified', target: 'in_touch' })).toEqual({ kind: 'ok' });
    expect(checkStageChange({ current: 'closed_lost', target: 'in_touch' })).toEqual({ kind: 'ok' });
  });

  it('requires a consultation mode when booking', () => {
    expect(checkStageChange({ current: 'in_touch', target: 'consultation_booked' }).kind).toBe('error');
    expect(
      checkStageChange({ current: 'in_touch', target: 'consultation_booked', consultationMode: 'home_trial' }),
    ).toEqual({ kind: 'ok' });
  });

  it('reports no change for the same stage', () => {
    expect(checkStageChange({ current: 'in_touch', target: 'in_touch' })).toEqual({ kind: 'no_change' });
  });

  it('allows rescheduling a booked consultation', () => {
    expect(
      checkStageChange({ current: 'consultation_booked', target: 'consultation_booked', consultationMode: 'video' }),
    ).toEqual({ kind: 'ok' });
  });

  it('blocks system-only stages and leads that are not open', () => {
    expect(checkStageChange({ current: 'verified', target: 'purchased' }).kind).toBe('error');
    expect(checkStageChange({ current: 'under_review', target: 'in_touch' }).kind).toBe('error');
    expect(checkStageChange({ current: 'purchased', target: 'in_touch' }).kind).toBe('error');
    expect(checkStageChange({ current: 'invalid', target: 'in_touch' }).kind).toBe('error');
    expect(checkStageChange({ current: 'verified', target: 'nonsense' }).kind).toBe('error');
  });
});

describe('resolveSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(resolveSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('applies valid overrides and ignores invalid or unknown keys', () => {
    const s = resolveSettings([
      { key: 'ownership_window_days', value: 60 },
      { key: 'hold_days', value: -5 },
      { key: 'unknown_key', value: true },
      { key: 'stage_labels', value: { in_touch: 'Talking to HO' } },
    ]);
    expect(s.ownership_window_days).toBe(60);
    expect(s.hold_days).toBe(DEFAULT_SETTINGS.hold_days);
    expect(s.stage_labels.in_touch).toBe('Talking to HO');
    expect(s.stage_labels.purchased).toBe(DEFAULT_SETTINGS.stage_labels.purchased);
  });
});
