import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Cross-platform icon. Renders native SF Symbols on iOS (matching the native
 * tab bar) and the equivalent vector icon on Android. One semantic name per
 * icon keeps call sites platform-agnostic. The four-point spark is the AYVANA
 * brand device — SF "sparkle" (single four-point star) on iOS, MaterialComm.
 * "star-four-points" on Android.
 */
export type SymName =
  | 'search'
  | 'arrow-right'
  | 'arrow-up'
  | 'spark'
  | 'chevron-right'
  | 'heart'
  | 'heart-fill'
  | 'close'
  | 'check'
  | 'plus'
  | 'minus'
  | 'bag'
  | 'receipt'
  | 'ruler'
  | 'wallet'
  | 'settings'
  | 'person';

type Entry =
  | { sf: SFSymbol; set: 'ion'; android: keyof typeof Ionicons.glyphMap }
  | { sf: SFSymbol; set: 'mci'; android: keyof typeof MaterialCommunityIcons.glyphMap };

const MAP: Record<SymName, Entry> = {
  search: { sf: 'magnifyingglass', set: 'ion', android: 'search' },
  'arrow-right': { sf: 'arrow.right', set: 'ion', android: 'arrow-forward' },
  'arrow-up': { sf: 'arrow.up', set: 'ion', android: 'arrow-up' },
  spark: { sf: 'sparkle', set: 'mci', android: 'star-four-points' },
  'chevron-right': { sf: 'chevron.right', set: 'ion', android: 'chevron-forward' },
  heart: { sf: 'heart', set: 'ion', android: 'heart-outline' },
  'heart-fill': { sf: 'heart.fill', set: 'ion', android: 'heart' },
  close: { sf: 'xmark', set: 'ion', android: 'close' },
  check: { sf: 'checkmark', set: 'ion', android: 'checkmark' },
  plus: { sf: 'plus', set: 'ion', android: 'add' },
  minus: { sf: 'minus', set: 'ion', android: 'remove' },
  bag: { sf: 'bag', set: 'ion', android: 'bag-outline' },
  receipt: { sf: 'doc.text', set: 'ion', android: 'receipt-outline' },
  ruler: { sf: 'ruler', set: 'ion', android: 'resize-outline' },
  wallet: { sf: 'creditcard', set: 'ion', android: 'wallet-outline' },
  settings: { sf: 'gearshape', set: 'ion', android: 'settings-outline' },
  person: { sf: 'person', set: 'ion', android: 'person-outline' },
};

export function Sym({
  name,
  size = 18,
  color,
  weight = 'regular',
  style,
}: {
  name: SymName;
  size?: number;
  color?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  style?: StyleProp<ViewStyle>;
}) {
  const m = MAP[name];
  if (Platform.OS === 'ios') {
    return (
      <SymbolView name={m.sf} size={size} tintColor={color} weight={weight} type="monochrome" style={style} />
    );
  }
  if (m.set === 'mci') {
    return <MaterialCommunityIcons name={m.android} size={size} color={color} style={style} />;
  }
  return <Ionicons name={m.android} size={size} color={color} style={style} />;
}
