import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount, type SizeProfile } from '@/lib/account';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export default function SizeProfileScreen() {
  const c = useTheme();
  const { size, setSize } = useAccount();
  const [form, setForm] = useState<SizeProfile>(size ?? {});
  const set = (k: keyof SizeProfile) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    setSize(form);
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four }} keyboardShouldPersistTaps="handled">
        <Txt variant="bodyMd" color="textSecondary" style={{ marginBottom: Spacing.four }}>
          Your measurements power AYVANA&rsquo;s fit recommendations.
        </Txt>

        <Txt variant="label" color="textSecondary" style={{ marginBottom: Spacing.two }}>
          USUAL SIZE
        </Txt>
        <View style={styles.sizeRow}>
          {SIZES.map((s) => {
            const selected = form.usualSize === s;
            return (
              <Pressable
                key={s}
                onPress={() => setForm((f) => ({ ...f, usualSize: s }))}
                style={[
                  styles.sizeTile,
                  { borderColor: selected ? c.text : c.hairline, backgroundColor: selected ? c.text : c.surface },
                ]}>
                <Txt variant="bodySemiMd" color={selected ? 'textOnInk' : 'text'}>
                  {s}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: Spacing.four }} />
        <Field label="Height (cm)" value={form.height ?? ''} onChange={set('height')} keyboardType="number-pad" />
        <Field label="Bust (cm)" value={form.bust ?? ''} onChange={set('bust')} keyboardType="number-pad" />
        <Field label="Waist (cm)" value={form.waist ?? ''} onChange={set('waist')} keyboardType="number-pad" />
        <Field label="Hip (cm)" value={form.hip ?? ''} onChange={set('hip')} keyboardType="number-pad" />

        <Pressable onPress={save} style={[styles.cta, { backgroundColor: c.surfaceInk }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Save size profile
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sizeTile: {
    minWidth: 54,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.control,
  },
  cta: { marginTop: Spacing.five, paddingVertical: Spacing.three + 2, borderRadius: Radii.card, alignItems: 'center' },
});
