import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ThemePalette } from '@/constants/theme';

/** The AYVANA wordmark: Jost, wide-tracked, with the four-point spark device. */
export function Wordmark({
  tone = 'onLight',
  showSpark = true,
}: {
  tone?: 'onLight' | 'onInk';
  showSpark?: boolean;
}) {
  const c = useTheme();
  const textColor: keyof ThemePalette = tone === 'onInk' ? 'textOnInk' : 'text';
  const sparkColor = tone === 'onInk' ? c.fill : c.tint;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
      <Txt variant="wordmark" color={textColor}>
        AYVANA
      </Txt>
      {showSpark && <MaterialCommunityIcons name="star-four-points" size={13} color={sparkColor} />}
    </View>
  );
}
