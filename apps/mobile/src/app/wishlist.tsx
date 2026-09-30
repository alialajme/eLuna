import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ProductCard } from '@/components/ProductCard';
import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWishlist } from '@/lib/wishlist';

const PAD = Spacing.three;
const GAP = Spacing.three;

export default function WishlistScreen() {
  const c = useTheme();
  const { items } = useWishlist();
  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 3 : 2;
  const itemW = Math.floor((width - PAD * 2 - GAP * (cols - 1)) / cols);

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: c.background }]}>
        <View style={[styles.disc, { backgroundColor: c.fillSoft }]}>
          <Ionicons name="heart-outline" size={30} color={c.tint} />
        </View>
        <Txt variant="displaySm" color="text">
          No saved abayas yet
        </Txt>
        <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center', maxWidth: 260 }}>
          Tap the heart on any piece to save it here.
        </Txt>
        <Pressable onPress={() => router.push('/browse')} style={[styles.cta, { backgroundColor: c.surfaceInk }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Browse abayas
          </Txt>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      key={cols}
      data={items}
      keyExtractor={(p) => p.slug}
      numColumns={cols}
      contentContainerStyle={{ padding: PAD }}
      columnWrapperStyle={{ gap: GAP }}
      ItemSeparatorComponent={() => <View style={{ height: Spacing.four }} />}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => <ProductCard item={item} width={itemW} />}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  disc: { height: 72, width: 72, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: Spacing.two, paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, borderRadius: Radii.card },
});
