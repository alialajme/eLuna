import { Sym } from '@/components/ui/Sym';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, type ProductListItem } from '@/lib/api';
import { useWishlist } from '@/lib/wishlist';

export function ProductCard({ item, width }: { item: ProductListItem; width: number }) {
  const c = useTheme();
  const { has, toggle } = useWishlist();
  const wishlisted = has(item.slug);

  return (
    <Pressable
      onPress={() => router.push(`/product/${item.slug}`)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.imageWrap, { backgroundColor: c.surfaceAlt, borderColor: c.hairline }]}>
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
        />

        {item.soldOut ? (
          <View style={[styles.badge, styles.badgeTL, { backgroundColor: c.text }]}>
            <Txt variant="label" color="textOnInk">
              SOLD OUT
            </Txt>
          </View>
        ) : item.lowStock ? (
          <View style={[styles.badge, styles.badgeTL, { backgroundColor: c.sale }]}>
            <Txt variant="label" color="textOnInk">
              LOW STOCK
            </Txt>
          </View>
        ) : null}

        <Pressable
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            toggle(item);
          }}
          style={[styles.heart, { backgroundColor: c.surface }]}>
          <Sym
            name={wishlisted ? 'heart-fill' : 'heart'}
            size={17}
            color={wishlisted ? c.sale : c.text}
          />
        </Pressable>
      </View>

      <Txt variant="label" color="textSecondary" style={styles.vendor} numberOfLines={1}>
        {item.vendor.toUpperCase()}
      </Txt>
      <Txt variant="bodyMedMd" color="text" numberOfLines={2} style={styles.title}>
        {item.title}
      </Txt>
      <View style={styles.priceRow}>
        <Txt variant="price" color="text">
          {formatPrice(item.price)}
        </Txt>
        {item.compareAt != null && item.compareAt > item.price && (
          <Txt variant="bodySm" color="textSecondary" style={styles.strike}>
            {formatPrice(item.compareAt)}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    aspectRatio: 3 / 4,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radii.control,
  },
  badgeTL: { left: Spacing.two, top: Spacing.two },
  heart: {
    position: 'absolute',
    right: Spacing.two,
    top: Spacing.two,
    height: 34,
    width: 34,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendor: { marginTop: Spacing.two },
  title: { marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.one },
  strike: { textDecorationLine: 'line-through' },
});
