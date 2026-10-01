import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors, Fonts } from '@/constants/theme';

export default function TabLayout() {
  const c = Colors.light;
  return (
    <NativeTabs
      backgroundColor={c.surface}
      labelVisibilityMode="labeled"
      tintColor={c.tint}
      iconColor={c.textSecondary}
      labelStyle={{
        default: { fontFamily: Fonts.bodyMed, fontSize: 11 },
        selected: { fontFamily: Fonts.bodySemi, color: c.tint },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="browse">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
        <NativeTabs.Trigger.Label>Browse</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bag">
        <NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <NativeTabs.Trigger.Label>Bag</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
