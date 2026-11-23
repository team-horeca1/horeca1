export function ledgerShadowEnabled(): boolean {
  const value = process.env.LEDGER_SHADOW;
  return value === '1' || value === 'true';
}

export function ledgerLiveEnabled(): boolean {
  const value = process.env.LEDGER_LIVE;
  return value === '1' || value === 'true';
}
