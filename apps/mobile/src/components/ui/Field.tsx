import { TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Field({
  label,
  value,
  onChange,
  keyboardType,
  autoCapitalize = 'sentences',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  placeholder?: string;
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
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        style={[
          {
            borderWidth: 1,
            borderColor: c.hairline,
            borderRadius: Radii.control,
            paddingHorizontal: Spacing.three,
            paddingVertical: Spacing.two + 4,
            color: c.text,
            backgroundColor: c.surface,
          },
          Type.bodyMd,
        ]}
      />
    </View>
  );
}
