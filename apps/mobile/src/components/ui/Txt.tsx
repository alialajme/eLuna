import { Text, type TextProps, type TextStyle } from 'react-native';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ThemePalette } from '@/constants/theme';

type Variant = keyof typeof Type;
type ColorKey = keyof ThemePalette;

export function Txt({
  variant = 'bodyMd',
  color = 'text',
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: ColorKey; style?: TextStyle | TextStyle[] }) {
  const c = useTheme();
  return <Text {...rest} style={[Type[variant] as TextStyle, { color: c[color] as string }, style]} />;
}
