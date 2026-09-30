import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { Wordmark } from '@/components/Wordmark';
import { BottomTabInset, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; hint: string; href?: string };

const ROWS: Row[] = [
  { icon: 'receipt-outline', label: 'Orders', hint: 'Track and reorder', href: '/orders' },
  { icon: 'heart-outline', label: 'Wishlist', hint: 'Saved abayas', href: '/wishlist' },
  { icon: 'resize-outline', label: 'Size profile', hint: 'Powers your fit' },
  { icon: 'wallet-outline', label: 'Wallet & cashback', hint: 'AYVANA credit' },
  { icon: 'settings-outline', label: 'Settings', hint: 'Preferences' },
];

export default function ProfileScreen() {
  const c = useTheme();
  const soon = (label: string) => Alert.alert(label, 'Available in the full AYVANA app.');

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaView edges={['top']} style={styles.head}>
        <Txt variant="displayLg" color="text">
          Profile
        </Txt>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.five }}>
        {/* Identity */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: c.surfaceInk }]}>
            <Txt variant="displayMd" color="textOnInk">
              G
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="displaySm" color="text">
              Guest
            </Txt>
            <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 2 }}>
              Sign in to sync your bag and orders
            </Txt>
          </View>
        </View>

        <Pressable onPress={() => soon('Sign in')} style={[styles.signIn, { backgroundColor: c.surfaceInk }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Sign in
          </Txt>
        </Pressable>

        {/* Grouped list */}
        <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          {ROWS.map((row, i) => (
            <Pressable
              key={row.label}
              onPress={() => (row.href ? router.push(row.href) : soon(row.label))}
              style={[styles.row, i > 0 && { borderTopColor: c.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={[styles.rowIcon, { backgroundColor: c.fillSoft }]}>
                <Ionicons name={row.icon} size={18} color={c.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodySemiMd" color="text">
                  {row.label}
                </Txt>
                <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 1 }}>
                  {row.hint}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.hairlineStrong} />
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <Wordmark showSpark />
          <Txt variant="bodySm" color="textSecondary" style={{ marginTop: Spacing.two }}>
            The Abaya Marketplace · v1.0
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  avatar: { height: 60, width: 60, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  signIn: { marginHorizontal: Spacing.three, marginTop: Spacing.four, paddingVertical: Spacing.three, borderRadius: Radii.card, alignItems: 'center' },
  group: { marginHorizontal: Spacing.three, marginTop: Spacing.five, borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  rowIcon: { height: 38, width: 38, borderRadius: Radii.card, alignItems: 'center', justifyContent: 'center' },
  footer: { alignItems: 'center', marginTop: Spacing.six },
});
