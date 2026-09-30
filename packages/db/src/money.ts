import { Prisma } from "@prisma/client";
import { InvalidAmountError } from "./errors";

/**
 * Money handling for AYVANA. All authoritative financial math uses Prisma.Decimal
 * (arbitrary precision) — never IEEE-754 floats. Amounts are AED with 2 decimals.
 *
 * Rationale: `0.1 + 0.2 !== 0.3` in JS. Prices/totals stored as Decimal(10,2) in
 * the DB must be computed with Decimal to avoid drift that corrupts settlement.
 */
export type Money = Prisma.Decimal;
export type MoneyInput = Prisma.Decimal.Value;

export function money(v: MoneyInput): Money {
  return new Prisma.Decimal(v);
}

/** Round to 2 decimal places (AED fils), half-up. */
export function round2(v: MoneyInput): Money {
  return new Prisma.Decimal(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export type PricingLine = {
  unitPrice: MoneyInput;
  quantity: number;
};

export type CartPricing = {
  subtotal: Money;
  shippingFee: Money;
  total: Money;
};

/**
 * Authoritative server-side pricing. Line totals and subtotal are pure Decimal.
 * Free shipping applies when subtotal >= threshold. All inputs are validated.
 */
export function computeCartPricing(
  lines: PricingLine[],
  opts: { freeShippingThreshold: MoneyInput; shippingFee: MoneyInput },
): CartPricing {
  const subtotal = lines.reduce((sum, l) => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
      throw new InvalidAmountError(`Invalid quantity: ${l.quantity}`);
    }
    const unit = money(l.unitPrice);
    if (unit.lt(0)) throw new InvalidAmountError(`Negative unit price: ${unit.toString()}`);
    return sum.plus(unit.mul(l.quantity));
  }, money(0));

  const threshold = money(opts.freeShippingThreshold);
  const shippingFee = subtotal.gte(threshold) ? money(0) : round2(opts.shippingFee);
  const total = round2(subtotal).plus(shippingFee);

  return { subtotal: round2(subtotal), shippingFee, total };
}

export function lineTotal(unitPrice: MoneyInput, quantity: number): Money {
  return money(unitPrice).mul(quantity);
}
