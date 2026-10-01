import { Sym } from '@/components/ui/Sym';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchProduct, formatPrice, type ProductDetail } from '@/lib/api';
import { useBag } from '@/lib/bag';
import { useWishlist } from '@/lib/wishlist';

const LOW_STOCK = 3;

export default function ProductScreen() {
  const c = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const { add } = useBag();
  const { has, toggle } = useWishlist();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [gallery, setGallery] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchProduct(slug)
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [slug]);

  // Group variants into per-size stock, preserving order.
  const sizes = useMemo(() => {
    if (!product) return [];
    const map = new Map<string, number>();
    for (const v of product.variants) map.set(v.size, (map.get(v.size) ?? 0) + v.stock);
    return [...map.entries()].map(([label, stock]) => ({ label, stock }));
  }, [product]);

  useEffect(() => {
    // Preselect when there is only one available size.
    const inStock = sizes.filter((s) => s.stock > 0);
    if (inStock.length === 1) setSize(inStock[0].label);
  }, [sizes]);

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setGallery(Math.round(e.nativeEvent.contentOffset.x / width));

  function onAdd() {
    if (!product || !size) return;
    add({
      slug: product.slug,
      title: product.title,
      vendor: product.vendor.name,
      size,
      price: product.price,
      image: product.images[0] ?? null,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  if (status !== 'ready' || !product) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ headerStyle: { backgroundColor: c.background } }} />
        <View style={styles.center}>
          {status === 'error' ? (
            <Txt variant="bodyMd" color="textSecondary">
              This abaya could not be found.
            </Txt>
          ) : (
            <ActivityIndicator color={c.tint} />
          )}
        </View>
      </View>
    );
  }

  const selectedStock = sizes.find((s) => s.label === size)?.stock ?? 0;
  const galleryH = Math.min(Math.round(width * 1.28), 620);
  const onSale = product.compareAt != null && product.compareAt > product.price;
  const wishlisted = has(product.slug);

  const toggleWishlist = () =>
    toggle({
      id: product.id,
      slug: product.slug,
      title: product.title,
      price: product.price,
      compareAt: product.compareAt,
      image: product.images[0] ?? null,
      vendor: product.vendor.name,
      category: product.category,
      lowStock: false,
      soldOut: false,
    });

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable hitSlop={10} onPress={toggleWishlist}>
              <Sym
                name={wishlisted ? 'heart-fill' : 'heart'}
                size={22}
                color={wishlisted ? c.sale : c.text}
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Gallery */}
        <View style={{ height: galleryH, backgroundColor: c.surfaceAlt }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onGalleryScroll}>
            {(product.images.length ? product.images : [null]).map((uri, i) => (
              <Image
                key={i}
                source={uri ? { uri } : undefined}
                style={{ width, height: galleryH }}
                contentFit="cover"
                transition={250}
              />
            ))}
          </ScrollView>
          {/* Top scrim so the floating back/heart controls stay legible */}
          <LinearGradient
            colors={['rgba(18,18,18,0.28)', 'rgba(18,18,18,0)']}
            style={styles.topScrim}
            pointerEvents="none"
          />
          {product.images.length > 1 && (
            <View style={styles.dots}>
              {product.images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, { backgroundColor: i === gallery ? c.background : 'rgba(247,245,243,0.5)' }]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.body}>
          <Txt variant="label" color="textSecondary">
            {product.vendor.name.toUpperCase()}
          </Txt>
          <Txt variant="displayLg" color="text" style={{ marginTop: Spacing.two }}>
            {product.title}
          </Txt>
          <View style={styles.priceRow}>
            <Txt variant="displaySm" color={onSale ? 'sale' : 'text'}>
              {formatPrice(product.price)}
            </Txt>
            {onSale && (
              <Txt variant="bodyMd" color="textSecondary" style={styles.strike}>
                {formatPrice(product.compareAt!)}
              </Txt>
            )}
          </View>

          {product.fabric ? (
            <View style={[styles.fabric, { borderColor: c.hairline }]}>
              <Txt variant="bodySm" color="textSecondary">
                {product.fabric}
              </Txt>
            </View>
          ) : null}

          {/* Size */}
          <View style={styles.sizeHead}>
            <Txt variant="bodySemiMd" color="text">
              Select size
            </Txt>
            {size && selectedStock > 0 && selectedStock <= LOW_STOCK && (
              <Txt variant="bodySm" color="sale">
                Only {selectedStock} left
              </Txt>
            )}
          </View>
          <View style={styles.sizeRow}>
            {sizes.map((s) => {
              const soldOut = s.stock === 0;
              const selected = s.label === size;
              return (
                <Pressable
                  key={s.label}
                  disabled={soldOut}
                  onPress={() => setSize(s.label)}
                  style={[
                    styles.sizeTile,
                    {
                      borderColor: selected ? c.text : c.hairline,
                      backgroundColor: selected ? c.text : c.surface,
                    },
                    soldOut && { borderColor: c.hairline, backgroundColor: c.surfaceAlt },
                  ]}>
                  <Txt
                    variant="bodySemiMd"
                    color={selected ? 'textOnInk' : soldOut ? 'textSecondary' : 'text'}
                    style={soldOut ? styles.strike : undefined}>
                    {s.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          {/* Fit hint */}
          <View style={[styles.fitHint, { backgroundColor: c.fillSoft }]}>
            <Sym name="spark" size={16} color={c.tint} />
            <Txt variant="bodySm" color="text" style={{ flex: 1 }}>
              Free returns within 14 days · Shipped across the GCC
            </Txt>
          </View>

          {product.description ? (
            <View style={styles.descBlock}>
              <Txt variant="displaySm" color="text" style={{ marginBottom: Spacing.two }}>
                Details
              </Txt>
              <Txt variant="bodyLg" color="textSecondary">
                {product.description}
              </Txt>
            </View>
          ) : null}

          {product.careGuide ? (
            <View style={styles.descBlock}>
              <Txt variant="bodySemiMd" color="text" style={{ marginBottom: Spacing.one }}>
                Care
              </Txt>
              <Txt variant="bodyMd" color="textSecondary">
                {product.careGuide}
              </Txt>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky add-to-bag */}
      <SafeAreaView edges={['bottom']} style={[styles.dock, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
        <View style={styles.dockInner}>
          <View>
            <Txt variant="label" color="textSecondary">
              PRICE
            </Txt>
            <Txt variant="price" color="text">
              {formatPrice(product.price)}
            </Txt>
          </View>
          <Pressable
            onPress={onAdd}
            disabled={!size}
            style={[styles.addBtn, { backgroundColor: added ? c.success : c.surfaceInk }, !size && { opacity: 0.4 }]}>
            {added && <Sym name="check" size={18} color={c.textOnInk} />}
            <Txt variant="bodySemiMd" color="textOnInk">
              {added ? 'Added to bag' : size ? 'Add to bag' : 'Select a size'}
            </Txt>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  dots: { position: 'absolute', bottom: Spacing.three, alignSelf: 'center', flexDirection: 'row', gap: Spacing.one },
  dot: { height: 6, width: 6, borderRadius: Radii.pill },
  body: { padding: Spacing.four },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.three },
  strike: { textDecorationLine: 'line-through' },
  fabric: {
    alignSelf: 'flex-start',
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
  },
  sizeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.five },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  sizeTile: {
    minWidth: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.control,
  },
  fitHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: Radii.card,
  },
  descBlock: { marginTop: Spacing.five },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
  dockInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three + 2,
    borderRadius: Radii.card,
  },
});
