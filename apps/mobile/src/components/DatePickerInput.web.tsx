import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS } from '../constants/theme';

export interface DatePickerInputProps {
  value: Date | null;
  onChange: (date: Date) => void;
  hasError?: boolean;
}

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onChange,
  hasError,
}) => {
  const dateStr = value
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
        value.getDate()
      ).padStart(2, '0')}`
    : '';
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <View style={[styles.container, hasError && styles.errorContainer]}>
      <Ionicons
        name="calendar-outline"
        size={20}
        color={COLORS.outline}
        style={styles.leftIcon}
      />
      {/* Native HTML5 date picker for web */}
      <input
        type="date"
        id="dob-input"
        data-testid="dob-input"
        value={dateStr}
        max={todayStr}
        onChange={(e: any) => {
          if (e.target.value) {
            const [year, month, day] = e.target.value.split('-').map(Number);
            onChange(new Date(year, month - 1, day));
          }
        }}
        style={{
          flex: 1,
          height: 48,
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
          color: COLORS.onSurface,
          paddingRight: 12,
          cursor: 'pointer',
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 14,
  },
  errorContainer: {
    borderColor: '#ba1a1a',
    backgroundColor: '#fff8f7',
  },
  leftIcon: {
    marginRight: 10,
  },
});
