import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/ProductCard';
import { Txt } from '@/components/ui/Txt';
import { BottomTabInset, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/hooks/use-catalog';

const PAD = Spacing.three;
const GAP = Spacing.three;

export default function BrowseScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ category?: string }>();
  const [active, setActive] = useState<string>(params.category ?? 'all');
  const { data, loading, error, reload } = useCatalog(active);

  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 3 : 2;
  const itemW = Math.floor((width - PAD * 2 - GAP * (cols - 1)) / cols);

  const chips = [{ name: 'All', slug: 'all' }, ...(data?.categories ?? [])];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaView edges={['top']}>
        <View style={styles.head}>
          <Txt variant="displayLg" color="text">
            Browse
          </Txt>
          {data && (
            <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 2 }}>
              {data.products.length} {data.products.length === 1 ? 'abaya' : 'abayas'}
            </Txt>
          )}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={chips}
          keyExtractor={(ch) => ch.slug}
          contentContainerStyle={styles.chipRow}
          ItemSeparatorComponent={() => <View style={{ width: Spacing.two }} />}
          renderItem={({ item }) => {
            const selected = item.slug === active;
            return (
              <Pressable
                onPress={() => setActive(item.slug)}
                style={[
                  styles.chip,
                  { borderColor: selected ? c.text : c.hairline, backgroundColor: selected ? c.text : c.surface },
                ]}>
                <Txt
                  variant="bodySemiMd"
                  color={selected ? 'textOnInk' : 'textSecondary'}
                  style={{ textTransform: 'capitalize' }}>
                  {item.name}
                </Txt>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center' }}>
            {error ?? 'Something went wrong.'}
          </Txt>
          <Pressable onPress={reload} style={[styles.retry, { borderColor: c.text }]}>
            <Txt variant="bodySemiMd" color="text">
              Try again
            </Txt>
          </Pressable>
        </View>
      ) : data.products.length === 0 ? (
        <View style={styles.center}>
          <Txt variant="displaySm" color="text">
            Nothing here yet
          </Txt>
          <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center' }}>
            No abayas in this category. Try another.
          </Txt>
        </View>
      ) : (
        <FlatList
          key={cols}
          data={data.products}
          keyExtractor={(p) => p.id}
          numColumns={cols}
          contentContainerStyle={{ padding: PAD, paddingBottom: BottomTabInset + Spacing.four }}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.four }} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ProductCard item={item} width={itemW} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: PAD, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  chipRow: { paddingHorizontal: PAD, paddingBottom: Spacing.three },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  retry: { borderWidth: 1, borderRadius: Radii.card, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
});
