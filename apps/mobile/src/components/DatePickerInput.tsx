import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
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
  const [showPicker, setShowPicker] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate);
    }
  };

  const displayDate = value
    ? value.toLocaleDateString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : 'mm/dd/yyyy';

  return (
    <View>
      <TouchableOpacity
        style={[styles.container, hasError && styles.errorContainer]}
        activeOpacity={0.8}
        onPress={() => setShowPicker(true)}
      >
        <Ionicons
          name="calendar-outline"
          size={20}
          color={COLORS.outline}
          style={styles.leftIcon}
        />
        <Text style={[styles.dateText, !value && styles.placeholderText]}>
          {displayDate}
        </Text>
        <Ionicons
          name="calendar"
          size={18}
          color={COLORS.onSurface}
          style={styles.rightIcon}
        />
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={value || new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={handleChange}
        />
      )}
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
    justifyContent: 'space-between',
  },
  errorContainer: {
    borderColor: '#ba1a1a',
    backgroundColor: '#fff8f7',
  },
  leftIcon: {
    marginRight: 10,
  },
  dateText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.onSurface,
  },
  placeholderText: {
    color: COLORS.outlineVariant,
  },
  rightIcon: {
    marginLeft: 10,
  },
});
