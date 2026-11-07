import { describe, expect, it } from 'vitest';
import { calculateCommission, describeRule, lineAmount, pickRule, ruleInputSchema, type EngineRule } from './commissions';

const PATCH = 'cat-patch';
const WIG = 'cat-wig';

const rule = (r: Partial<EngineRule> & Pick<EngineRule, 'id'>): EngineRule => ({
  categoryId: null,
  customerType: null,
  rateType: 'percent',
  rateValue: 0,
  minPaise: null,
  maxPaise: null,
  priority: 0,
  ...r,
});

describe('pickRule', () => {
  const rules = [
    rule({ id: 'any', rateValue: 500 }),
    rule({ id: 'new-any', customerType: 'new', rateValue: 1000 }),
    rule({ id: 'patch-any', categoryId: PATCH, rateValue: 800 }),
    rule({ id: 'patch-new', categoryId: PATCH, customerType: 'new', rateValue: 1200 }),
  ];

  it('prefers category + customer type, then category, then customer type, then any', () => {
    expect(pickRule(rules, PATCH, 'new')!.id).toBe('patch-new');
    expect(pickRule(rules, PATCH, 'existing_customer')!.id).toBe('patch-any');
    expect(pickRule(rules, WIG, 'new')!.id).toBe('new-any');
    expect(pickRule(rules, WIG, 'existing_contact')!.id).toBe('any');
  });

  it('breaks ties by priority, then deterministically', () => {
    const tied = [rule({ id: 'b', priority: 1 }), rule({ id: 'a', priority: 1 }), rule({ id: 'c', priority: 0 })];
    expect(pickRule(tied, WIG, 'new')!.id).toBe('a');
  });

  it('returns null when nothing matches', () => {
    expect(pickRule([rule({ id: 'x', categoryId: PATCH })], WIG, 'new')).toBeNull();
  });
});

describe('lineAmount', () => {
  it('applies percent in basis points with half-up rounding to the paisa', () => {
    expect(lineAmount(rule({ id: 'p', rateValue: 750 }), 1_234_567)).toBe(92_593); // 7.5% of ₹12,345.67 = ₹925.925 → ₹925.93
  });

  it('applies flat amounts and clamps to min and max', () => {
    expect(lineAmount(rule({ id: 'f', rateType: 'flat', rateValue: 50_000 }), 10_000_000)).toBe(50_000);
    expect(lineAmount(rule({ id: 'm', rateValue: 100, minPaise: 50_000 }), 1_000_000)).toBe(50_000); // 1% of ₹10,000 = ₹100 → min ₹500
    expect(lineAmount(rule({ id: 'x', rateValue: 1000, maxPaise: 500_000 }), 10_000_000)).toBe(500_000); // capped at ₹5,000
  });

  it('pays nothing on a zero line, even with a minimum', () => {
    expect(lineAmount(rule({ id: 'm', rateValue: 100, minPaise: 50_000 }), 0)).toBe(0);
  });
});

describe('calculateCommission', () => {
  it('matches each line and adds them up', () => {
    const rules = [rule({ id: 'patch', categoryId: PATCH, rateValue: 1000 }), rule({ id: 'any', rateType: 'flat', rateValue: 20_000 })];
    const result = calculateCommission(rules, 'new', [
      { categoryId: PATCH, netPaise: 2_500_000 },
      { categoryId: WIG, netPaise: 6_000_000 },
    ]);
    expect(result.lines.map((l) => [l.rule?.id, l.amountPaise])).toEqual([
      ['patch', 250_000],
      ['any', 20_000],
    ]);
    expect(result.totalPaise).toBe(270_000);
  });

  it('gives a reduced rate for an existing customer when the plan has one', () => {
    const rules = [rule({ id: 'std', rateValue: 1000 }), rule({ id: 'existing', customerType: 'existing_customer', rateValue: 300 })];
    expect(calculateCommission(rules, 'existing_customer', [{ categoryId: WIG, netPaise: 1_000_000 }]).totalPaise).toBe(30_000);
    expect(calculateCommission(rules, 'new', [{ categoryId: WIG, netPaise: 1_000_000 }]).totalPaise).toBe(100_000);
  });
});

describe('describeRule', () => {
  it('reads like a rate card', () => {
    expect(describeRule({ rateType: 'percent', rateValue: 750, minPaise: 50_000, maxPaise: 500_000, customerType: 'new' }, 'Hair patches')).toBe(
      '7.5% of net value · Hair patches · new customers · min ₹500, max ₹5,000',
    );
    expect(describeRule({ rateType: 'flat', rateValue: 100_000, minPaise: null, maxPaise: null, customerType: null }, null)).toBe(
      '₹1,000 flat · any product · any customer',
    );
  });
});

describe('ruleInputSchema', () => {
  it('rejects percentages over 100% and max below min', () => {
    const base = { categoryId: null, customerType: null, rateType: 'percent' as const, minPaise: null, maxPaise: null };
    expect(ruleInputSchema.safeParse({ ...base, rateValue: 10_001 }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, rateValue: 500, minPaise: 1000, maxPaise: 500 }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, customerType: 'invalid', rateValue: 500 }).success).toBe(false);
    expect(ruleInputSchema.parse({ ...base, rateValue: 500 }).priority).toBe(0);
  });
});

describe('benefitUpdateSchema', () => {
  it('never resets untouched fields', async () => {
    const { benefitUpdateSchema } = await import('./commissions');
    expect(benefitUpdateSchema.parse({ active: false })).toEqual({ active: false });
  });
});
