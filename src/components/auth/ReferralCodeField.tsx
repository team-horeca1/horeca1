'use client';

import { FormField, FormInput } from '@/components/ui/form';

export function ReferralCodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField
      label="Referral code (optional)"
      hint="If a partner invited you, enter their code. Example: A-0001."
      htmlFor="referral-code"
      dataField="referralCode"
    >
      <FormInput
        id="referral-code"
        name="referralCode"
        value={value}
        onChange={onChange}
        placeholder="A-0001"
        autoComplete="off"
        maxLength={12}
        spellCheck={false}
        aria-label="Referral code (optional)"
      />
    </FormField>
  );
}
