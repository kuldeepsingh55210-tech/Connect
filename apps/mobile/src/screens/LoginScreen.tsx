import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { postDevLogin } from '../services/api';
import { useAuth } from '../auth/AuthContext';

interface LoginScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string) => void;
  };
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { login } = useAuth();
  const [phone, setPhone] = useState('+919876543215');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (phoneToLogin: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const authData = await postDevLogin(phoneToLogin);
      await login(authData.token);
      navigation.navigate('MainTabs');
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log In</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.brandIcon}>
          <Ionicons name="sparkles" size={28} color="#ffffff" />
        </View>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          Sign in using your mobile number or jump in with your test profile.
        </Text>

        {/* Quick Login Button for Priya Sharma */}
        <TouchableOpacity
          style={styles.quickLoginBtn}
          activeOpacity={0.88}
          disabled={isLoading}
          onPress={() => handleLogin('+919876543215')}
          testID="login-priya-sharma-btn"
        >
          <View style={styles.quickBtnRow}>
            <View style={styles.quickAvatar}>
              <Text style={styles.quickAvatarText}>PS</Text>
            </View>
            <View style={styles.quickTextCol}>
              <Text style={styles.quickBtnTitle}>Continue as Priya Sharma</Text>
              <Text style={styles.quickBtnSub}>Delhi • +919876543215</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </View>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or enter phone</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="+919876543215"
            placeholderTextColor={COLORS.outline}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.submitBtn}
            disabled={isLoading || !phone.trim()}
            onPress={() => handleLogin(phone.trim())}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainer,
  },
  backButton: {
    padding: SPACING.xs,
    marginRight: SPACING.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  brandIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 18,
  },
  quickLoginBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 14,
    marginBottom: SPACING.lg,
  },
  quickBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickAvatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  quickTextCol: {
    flex: 1,
  },
  quickBtnTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  quickBtnSub: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: SPACING.lg,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.surfaceContainerHighest,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.outline,
  },
  inputContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
  },
  phoneInput: {
    flex: 1,
    height: 46,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 16,
    fontSize: 14,
    color: COLORS.onSurface,
  },
  submitBtn: {
    height: 46,
    paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
    color: '#dc2626',
  },
});
