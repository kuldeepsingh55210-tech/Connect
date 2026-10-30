import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Path,
  G,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

interface LandingScreenProps {
  navigation: {
    navigate: (screen: string) => void;
  };
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* 1. Top Brand Header */}
        <View style={styles.headerContainer}>
          <View style={styles.brandBadge}>
            <View style={styles.logoCircle}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Circle cx="7" cy="14" r="4" fill="#ffffff" />
                <Circle cx="17" cy="14" r="4" fill="#ffffff" opacity={0.6} />
                <Path
                  d="M7 14h10"
                  stroke="#ffffff"
                  strokeLinecap="round"
                  strokeWidth={2.5}
                />
                <Path
                  d="M7 10a5 5 0 0 1 10 0"
                  stroke="#ffffff"
                  strokeLinecap="round"
                  strokeWidth={2}
                />
              </Svg>
            </View>
            <View style={styles.brandTextContainer}>
              <Text style={styles.brandTextPrimary}>Connect</Text>
              <Text style={styles.brandTextSecondary}>Local</Text>
            </View>
          </View>
        </View>

        {/* 2. Center Hero Graphic Card */}
        <View style={styles.heroCard}>
          {/* Ambient subtle background decorative layers */}
          <View style={styles.ambientBlobTop} />
          <View style={styles.ambientBlobBottom} />

          {/* Collaborative Vector Composition */}
          <View style={styles.svgWrapper}>
            <Svg width={280} height={190} viewBox="0 0 280 208" fill="none">
              {/* Connecting dashed and solid lines */}
              <Path
                d="M60 104 C 90 60, 130 50, 170 80"
                stroke={COLORS.zincBlack}
                strokeDasharray="5, 5"
                strokeLinecap="round"
                strokeWidth={2}
                opacity={0.45}
              />
              <Path
                d="M120 144 C 150 170, 190 150, 220 114"
                stroke={COLORS.zincMedium}
                strokeDasharray="5, 5"
                strokeLinecap="round"
                strokeWidth={2}
                opacity={0.45}
              />
              <Path
                d="M60 104 C 90 140, 160 130, 220 114"
                stroke={COLORS.outlineVariant}
                strokeWidth={1.5}
              />

              {/* Node 1: Left - Woodcraft/Tools (Black) */}
              <G x={36} y={80}>
                <Circle cx={24} cy={24} r={24} fill="#f4f4f5" stroke="#e4e4e7" strokeWidth={1} />
                <Circle cx={24} cy={24} r={20} fill="#18181b" />
                <Path d="M18 20L28 30M28 20L18 30" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2} />
              </G>

              {/* Node 2: Right - Urban Nature (Deep Gray) */}
              <G x={196} y={90}>
                <Circle cx={24} cy={24} r={24} fill="#f4f4f5" stroke="#e4e4e7" strokeWidth={1} />
                <Circle cx={24} cy={24} r={20} fill="#3f3f46" />
                <Path d="M24 16C24 16 18 22 18 26A6 6 0 0 0 30 26C30 22 24 16 24 16Z" fill="#FFFFFF" />
                <Path d="M24 22V28" stroke="#3f3f46" strokeLinecap="round" strokeWidth={1.5} />
              </G>

              {/* Node 3: Center Top - Knowledge (Black) */}
              <G x={116} y={44}>
                <Circle cx={24} cy={24} r={26} fill="#f4f4f5" stroke="#c8c5cb" strokeWidth={1} />
                <Circle cx={24} cy={24} r={22} fill="#18181b" />
                <Path
                  d="M18 20C20 19 23 19 24 21C25 19 28 19 30 20V28C28 27 25 27 24 29C23 27 20 27 18 28V20Z"
                  fill="#FFFFFF"
                />
              </G>

              {/* Micro floating skill chips */}
              {/* Woodcraft */}
              <Rect
                x={18}
                y={44}
                width={78}
                height={24}
                rx={12}
                fill="#FFFFFF"
                stroke="#e4e4e7"
                strokeWidth={1}
              />
              <Circle cx={28} cy={56} r={3.5} fill="#18181b" />
              <SvgText
                x={35}
                y={59}
                fill="#18181b"
                fontSize={10}
                fontWeight="600"
              >
                Woodcraft
              </SvgText>

              {/* Ceramics */}
              <Rect
                x={182}
                y={46}
                width={76}
                height={24}
                rx={12}
                fill="#FFFFFF"
                stroke="#e4e4e7"
                strokeWidth={1}
              />
              <Circle cx={192} cy={58} r={3.5} fill="#52525b" />
              <SvgText
                x={199}
                y={61}
                fill="#18181b"
                fontSize={10}
                fontWeight="600"
              >
                Ceramics
              </SvgText>

              {/* Permaculture */}
              <Rect
                x={90}
                y={150}
                width={98}
                height={24}
                rx={12}
                fill="#FFFFFF"
                stroke="#e4e4e7"
                strokeWidth={1}
              />
              <Circle cx={102} cy={162} r={3.5} fill="#27272a" />
              <SvgText
                x={110}
                y={165}
                fill="#18181b"
                fontSize={10}
                fontWeight="600"
              >
                Permaculture
              </SvgText>
            </Svg>
          </View>

          {/* Neighbors active count pill */}
          <View style={styles.activeCounterBadge}>
            <View style={styles.pulsingDot} />
            <Text style={styles.activeCounterText}>
              1,420 neighbors active this week
            </Text>
          </View>
        </View>

        {/* 3. Headline & Description */}
        <View style={styles.textBlock}>
          <Text style={styles.headline}>
            Meet people who match your{' '}
            <Text style={styles.underlinedWord}>skills</Text> and{' '}
            <Text style={styles.underlinedWord}>interests</Text>
          </Text>
          <Text style={styles.subheadline}>
            Discover people near you with the same skills or interests, and connect only when both sides are interested.
          </Text>
        </View>

        {/* 4. Value Pills */}
        <View style={styles.pillsRow}>
          <View style={styles.valuePill}>
            <MaterialCommunityIcons name="handshake-outline" size={15} color={COLORS.primary} />
            <Text style={styles.valuePillText}>Mutual Opt-in</Text>
          </View>
          <View style={styles.valuePill}>
            <Ionicons name="location-outline" size={15} color={COLORS.primary} />
            <Text style={styles.valuePillText}>Hyperlocal</Text>
          </View>
          <View style={styles.valuePill}>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.primary} />
            <Text style={styles.valuePillText}>Zero Spam</Text>
          </View>
        </View>

        {/* 5. Primary CTA Button: Join Free */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.primaryButtonText}>Join Free</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" style={styles.buttonIcon} />
          </TouchableOpacity>

          {/* 6. Secondary Action: Log In */}
          <TouchableOpacity
            style={styles.loginButton}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginText}>
              Already have an account? <Text style={styles.loginTextBold}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* 7. Bottom Trust Badge */}
        <View style={styles.trustBadgeContainer}>
          <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.outline} />
          <Text style={styles.trustBadgeText}>
            Free to join · 18+ only · Safe by design
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: SPACING.lg,
    justifyContent: 'space-between',
  },
  headerContainer: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logoCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandTextPrimary: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.3,
  },
  brandTextSecondary: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: -0.3,
  },
  heroCard: {
    width: '100%',
    marginVertical: SPACING.md,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceContainerLowest,
    padding: SPACING.md,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  ambientBlobTop: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.surfaceContainerHigh,
    opacity: 0.5,
  },
  ambientBlobBottom: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surfaceContainerHigh,
    opacity: 0.5,
  },
  svgWrapper: {
    width: 280,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCounterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    marginTop: 4,
  },
  pulsingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.primary,
  },
  activeCounterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurface,
    letterSpacing: 0.1,
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    marginVertical: SPACING.xs,
  },
  headline: {
    fontSize: 27,
    lineHeight: 35,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  underlinedWord: {
    textDecorationLine: 'underline',
    textDecorationColor: COLORS.primary,
    textDecorationStyle: 'solid',
    fontWeight: '700',
    color: COLORS.primary,
  },
  subheadline: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: SPACING.sm,
    maxWidth: 320,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginVertical: SPACING.sm,
  },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
  },
  valuePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  ctaContainer: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: SPACING.md,
    gap: 6,
  },
  primaryButton: {
    width: '100%',
    height: 50,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  buttonIcon: {
    marginLeft: 6,
  },
  loginButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  loginText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.secondary,
  },
  loginTextBold: {
    color: COLORS.onSurface,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  trustBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  trustBadgeText: {
    fontSize: 12,
    color: COLORS.outline,
    fontWeight: '500',
  },
});
