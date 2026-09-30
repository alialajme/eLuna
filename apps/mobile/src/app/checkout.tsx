import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, placeOrder, type ShippingAddress } from '@/lib/api';
import { useBag } from '@/lib/bag';

export default function CheckoutScreen() {
  const c = useTheme();
  const { lines, subtotal, count, clear } = useBag();
  const [form, setForm] = useState<ShippingAddress>({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    emirate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ShippingAddress) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.fullName.trim() && form.phone.trim() && form.addressLine1.trim() && form.city.trim();

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = lines.map((l) => ({ slug: l.slug, size: l.size, qty: l.qty }));
      await placeOrder(items, form);
      clear();
      router.replace('/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <Txt variant="displaySm" color="text">
          Shipping address
        </Txt>
        <View style={{ height: Spacing.three }} />
        <Field label="Full name" value={form.fullName} onChange={set('fullName')} />
        <Field label="Phone" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" />
        <Field label="Address" value={form.addressLine1} onChange={set('addressLine1')} />
        <Field label="Apartment, floor (optional)" value={form.addressLine2 ?? ''} onChange={set('addressLine2')} />
        <Field label="City" value={form.city} onChange={set('city')} />
        <Field label="Emirate (optional)" value={form.emirate ?? ''} onChange={set('emirate')} />

        <View style={[styles.summary, { borderColor: c.hairline }]}>
          <Row label={`Items (${count})`} value={formatPrice(subtotal)} c={c} />
          <Row label="Shipping" value="Free" c={c} />
          <View style={[styles.divider, { backgroundColor: c.hairline }]} />
          <Row label="Total" value={formatPrice(subtotal)} c={c} strong />
        </View>

        <Txt variant="bodySm" color="textSecondary" style={{ marginTop: Spacing.three }}>
          Cash on delivery · No card is charged in this preview.
        </Txt>
        {error && (
          <Txt variant="bodySm" color="sale" style={{ marginTop: Spacing.two }}>
            {error}
          </Txt>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.dock, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
        <Pressable
          onPress={submit}
          disabled={!valid || submitting}
          style={[styles.cta, { backgroundColor: c.surfaceInk }, (!valid || submitting) && { opacity: 0.4 }]}>
          {submitting ? (
            <ActivityIndicator color={c.textOnInk} />
          ) : (
            <Txt variant="bodySemiMd" color="textOnInk">
              Place order · {formatPrice(subtotal)}
            </Txt>
          )}
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'phone-pad';
}) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: Spacing.three }}>
      <Txt variant="label" color="textSecondary" style={{ marginBottom: Spacing.one }}>
        {label.toUpperCase()}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={c.textSecondary}
        style={[styles.input, { borderColor: c.hairline, color: c.text, backgroundColor: c.surface }, Type.bodyMd]}
      />
    </View>
  );
}

function Row({ label, value, c, strong }: { label: string; value: string; c: ReturnType<typeof useTheme>; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt variant={strong ? 'bodySemiMd' : 'bodyMd'} color={strong ? 'text' : 'textSecondary'}>
        {label}
      </Txt>
      <Txt variant={strong ? 'price' : 'bodyMedMd'} color="text">
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  summary: { marginTop: Spacing.four, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.card, padding: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.one + 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.two },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  cta: { paddingVertical: Spacing.three + 2, borderRadius: Radii.card, alignItems: 'center' },
});
