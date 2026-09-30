import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount, type Preferences } from '@/lib/account';

const SIZE_SYSTEMS: Preferences['sizeSystem'][] = ['UK', 'US', 'EU', 'UAE'];

export default function SettingsScreen() {
  const c = useTheme();
  const { user, signedIn, signOut, address, size, prefs, setPrefs } = useAccount();

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: Spacing.three, paddingBottom: Spacing.six }}>
      {/* Account */}
      <Section title="Account" c={c} />
      <Group c={c}>
        {signedIn ? (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodySemiMd" color="text">
                  {user!.name}
                </Txt>
                <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 1 }}>
                  {user!.email}
                </Txt>
              </View>
            </View>
            <Divider c={c} />
            <Pressable style={styles.row} onPress={signOut}>
              <Txt variant="bodyMedMd" color="sale">
                Sign out
              </Txt>
            </Pressable>
          </>
        ) : (
          <NavRow label="Sign in" hint="Sync your bag and orders" onPress={() => router.push('/sign-in')} c={c} />
        )}
      </Group>

      {/* Delivery + size */}
      <Section title="Shopping" c={c} />
      <Group c={c}>
        <NavRow
          label="Delivery address"
          hint={address ? `${address.addressLine1}, ${address.city}` : 'Add a default address'}
          onPress={() => router.push('/address')}
          c={c}
        />
        <Divider c={c} />
        <NavRow
          label="Size profile"
          hint={size?.usualSize ? `Usual size ${size.usualSize}` : 'Set your measurements'}
          onPress={() => router.push('/size-profile')}
          c={c}
        />
      </Group>

      {/* Preferences */}
      <Section title="Preferences" c={c} />
      <Group c={c}>
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two }]}>
          <Txt variant="bodyMedMd" color="text">
            Size system
          </Txt>
          <View style={styles.segment}>
            {SIZE_SYSTEMS.map((s) => {
              const selected = prefs.sizeSystem === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setPrefs({ sizeSystem: s })}
                  style={[styles.seg, { borderColor: selected ? c.text : c.hairline, backgroundColor: selected ? c.text : c.surface }]}>
                  <Txt variant="bodySm" color={selected ? 'textOnInk' : 'textSecondary'}>
                    {s}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Divider c={c} />
        <ToggleRow label="Offers & promotions" value={prefs.offers} onChange={(v) => setPrefs({ offers: v })} c={c} />
        <Divider c={c} />
        <ToggleRow label="Order updates" value={prefs.orderUpdates} onChange={(v) => setPrefs({ orderUpdates: v })} c={c} />
        <Divider c={c} />
        <ToggleRow label="العربية — Arabic" value={prefs.arabic} onChange={(v) => setPrefs({ arabic: v })} c={c} />
      </Group>
    </ScrollView>
  );
}

type C = ReturnType<typeof useTheme>;

function Section({ title, c }: { title: string; c: C }) {
  return (
    <Txt variant="label" color="textSecondary" style={{ marginTop: Spacing.four, marginBottom: Spacing.two, marginLeft: Spacing.one }}>
      {title.toUpperCase()}
    </Txt>
  );
}

function Group({ children, c }: { children: React.ReactNode; c: C }) {
  return (
    <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.hairline }]}>{children}</View>
  );
}

function Divider({ c }: { c: C }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: Spacing.three }} />;
}

function NavRow({ label, hint, onPress, c }: { label: string; hint?: string; onPress: () => void; c: C }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyMedMd" color="text">
          {label}
        </Txt>
        {hint && (
          <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 1 }} numberOfLines={1}>
            {hint}
          </Txt>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.hairlineStrong} />
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, c }: { label: string; value: boolean; onChange: (v: boolean) => void; c: C }) {
  return (
    <View style={styles.row}>
      <Txt variant="bodyMedMd" color="text" style={{ flex: 1 }}>
        {label}
      </Txt>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.tint, false: c.hairline }} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, minHeight: 52 },
  segment: { flexDirection: 'row', gap: Spacing.two },
  seg: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderWidth: 1, borderRadius: Radii.control },
});
