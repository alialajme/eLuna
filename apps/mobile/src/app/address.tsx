import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount } from '@/lib/account';
import type { ShippingAddress } from '@/lib/api';

const EMPTY: ShippingAddress = { fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', emirate: '' };

export default function AddressScreen() {
  const c = useTheme();
  const { address, setAddress } = useAccount();
  const [form, setForm] = useState<ShippingAddress>(address ?? EMPTY);
  const set = (k: keyof ShippingAddress) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.fullName.trim() && form.phone.trim() && form.addressLine1.trim() && form.city.trim();

  function save() {
    if (!valid) return;
    setAddress(form);
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four }} keyboardShouldPersistTaps="handled">
        <Txt variant="bodyMd" color="textSecondary" style={{ marginBottom: Spacing.four }}>
          We&rsquo;ll use this to prefill your checkout.
        </Txt>
        <Field label="Full name" value={form.fullName} onChange={set('fullName')} autoCapitalize="words" />
        <Field label="Phone" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" />
        <Field label="Address" value={form.addressLine1} onChange={set('addressLine1')} />
        <Field label="Apartment, floor (optional)" value={form.addressLine2 ?? ''} onChange={set('addressLine2')} />
        <Field label="City" value={form.city} onChange={set('city')} />
        <Field label="Emirate (optional)" value={form.emirate ?? ''} onChange={set('emirate')} />

        <Pressable
          onPress={save}
          disabled={!valid}
          style={[styles.cta, { backgroundColor: c.surfaceInk }, !valid && { opacity: 0.4 }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Save address
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: Spacing.two, paddingVertical: Spacing.three + 2, borderRadius: Radii.card, alignItems: 'center' },
});
