import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { palette, spacing, radius } from '@/src/constants/theme';

// ── Card ────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── CardImage ───────────────────────────────────────────

interface CardImageProps {
  source: string | number;
  height?: number;
}

export function CardImage({ source, height = 160 }: CardImageProps) {
  return (
    <Image
      source={typeof source === 'string' ? { uri: source } : source}
      style={[styles.image, { height }]}
      contentFit="cover"
      recyclingKey={typeof source === 'string' ? source : undefined}
    />
  );
}

// ── CardContent ─────────────────────────────────────────

interface CardContentProps {
  children: React.ReactNode;
}

export function CardContent({ children }: CardContentProps) {
  return <View style={styles.content}>{children}</View>;
}

// ── CardBadge ───────────────────────────────────────────

interface CardBadgeProps {
  children: React.ReactNode;
}

export function CardBadge({ children }: CardBadgeProps) {
  return <View style={styles.badgeRow}>{children}</View>;
}

// ── CardTitle ───────────────────────────────────────────

interface CardTitleProps {
  children: string;
  numberOfLines?: number;
}

export function CardTitle({ children, numberOfLines = 1 }: CardTitleProps) {
  return (
    <Text style={styles.title} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

// ── CardSubtitle ────────────────────────────────────────

interface CardSubtitleProps {
  children: string;
}

export function CardSubtitle({ children }: CardSubtitleProps) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: '100%',
  },
  content: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.gray[900],
  },
  subtitle: {
    fontSize: 14,
    color: palette.gray[500],
  },
});
