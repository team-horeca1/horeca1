/** All sellable SKUs stay DiSCCO-eligible. Callers cannot turn this off. */
export const PRODUCT_CREDIT_ELIGIBLE = true;

export function coerceCreditEligible(_value?: boolean | null): true {
  return PRODUCT_CREDIT_ELIGIBLE;
}
