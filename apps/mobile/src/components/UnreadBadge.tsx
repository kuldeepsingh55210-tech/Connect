import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle, TextStyle } from 'react-native';

interface UnreadBadgeProps {
  count?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Shared Monochrome Editorial unread pill badge:
 * - Black pill (#18181B)
 * - White text (#FFFFFF)
 * - label-sm typography (fontSize 10, bold)
 * - Capped at 99+
 * - Hidden if count is 0 or undefined
 */
export const UnreadBadge: React.FC<UnreadBadgeProps> = ({
  count = 0,
  style,
  textStyle,
  testID = 'unread-badge',
}) => {
  if (!count || count <= 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <View style={[styles.badge, style]} testID={testID}>
      <Text style={[styles.badgeText, textStyle]}>{displayCount}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#18181B',
    borderRadius: 9999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 12,
  },
});
