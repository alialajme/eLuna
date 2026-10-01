import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { Wordmark } from '@/components/Wordmark';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount } from '@/lib/account';

export default function SignInScreen() {
  const c = useTheme();
  const { signIn } = useAccount();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const valid = name.trim().length > 1 && /.+@.+\..+/.test(email);

  function submit() {
    if (!valid) return;
    signIn(name, email);
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable hitSlop={10} onPress={() => router.back()}>
              <Txt variant="bodyMedMd" color="tint">
                Cancel
              </Txt>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: Spacing.five }}>
          <Wordmark />
          <Txt variant="displayMd" color="text" style={{ marginTop: Spacing.four, textAlign: 'center' }}>
            Welcome
          </Txt>
          <Txt variant="bodyMd" color="textSecondary" style={{ marginTop: Spacing.one, textAlign: 'center' }}>
            Sign in to sync your bag, wishlist and orders.
          </Txt>
        </View>

        <Field label="Full name" value={name} onChange={setName} autoCapitalize="words" />
        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" />

        <Pressable
          onPress={submit}
          disabled={!valid}
          style={[styles.cta, { backgroundColor: c.surfaceInk }, !valid && { opacity: 0.4 }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Continue
          </Txt>
        </Pressable>

        <Txt variant="bodySm" color="textSecondary" style={{ marginTop: Spacing.three, textAlign: 'center' }}>
          Saved on this device for the preview. No password needed.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.four, paddingTop: Spacing.six },
  cta: { marginTop: Spacing.two, paddingVertical: Spacing.three + 2, borderRadius: Radii.card, alignItems: 'center' },
});
