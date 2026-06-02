import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { IconButton, LoadingIndicator } from './src/components/Primitives';
import { palette, spacing, typography } from './src/design/theme';
import { AuthScreen } from './src/screens/AuthScreen';
import { EntryScreen } from './src/screens/EntryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { clearAuthToken, restoreAuthSession } from './src/services/financeApi';
import type { EntryMode, ScreenKey } from './src/types/finance';

type NavigationOptions = {
  entryMode?: EntryMode;
};

type NavItem = {
  key: ScreenKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const primaryNav: NavItem[] = [
  { key: 'home', label: '首页', icon: 'grid-outline' },
  { key: 'entry', label: '记账', icon: 'create-outline' },
  { key: 'reports', label: '报表', icon: 'bar-chart-outline' },
  { key: 'settings', label: '我的', icon: 'person-outline' },
];

const webNav: NavItem[] = [
  ...primaryNav.slice(0, 2),
  { key: 'transactions', label: '交易', icon: 'list-outline' },
  ...primaryNav.slice(2),
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [screen, setScreen] = useState<ScreenKey>('home');
  const [renderedScreen, setRenderedScreen] = useState<ScreenKey>('home');
  const [entryMode, setEntryMode] = useState<EntryMode>('ai');
  const [requireDeleteConfirmation, setRequireDeleteConfirmation] = useState(true);
  const [isPageSwitching, setIsPageSwitching] = useState(false);
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSwitchToken = useRef(0);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const navItems = isWide ? webNav : primaryNav;
  const handleNavigate = (nextScreen: ScreenKey, options?: NavigationOptions) => {
    const nextEntryMode = nextScreen === 'entry' && options?.entryMode ? options.entryMode : entryMode;
    if (nextScreen === screen && nextEntryMode === entryMode) {
      return;
    }

    if (pageSwitchTimer.current) {
      clearTimeout(pageSwitchTimer.current);
      pageSwitchTimer.current = null;
    }
    const switchToken = pageSwitchToken.current + 1;
    pageSwitchToken.current = switchToken;
    pageOpacity.stopAnimation();

    if (nextScreen === 'entry' && options?.entryMode) {
      setEntryMode(options.entryMode);
    }
    setScreen(nextScreen);
    setIsPageSwitching(true);

    Animated.timing(pageOpacity, {
      toValue: 0.42,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    pageSwitchTimer.current = setTimeout(() => {
      if (pageSwitchToken.current !== switchToken) {
        return;
      }
      setRenderedScreen(nextScreen);
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && pageSwitchToken.current === switchToken) {
          setIsPageSwitching(false);
        }
      });
      pageSwitchTimer.current = null;
    }, 160);
  };

  useEffect(() => {
    let ignore = false;
    restoreAuthSession()
      .then((restored) => {
        if (!ignore) {
          setIsAuthenticated(restored);
        }
      })
      .finally(() => {
        if (!ignore) {
          setAuthResolved(true);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pageSwitchTimer.current) {
        clearTimeout(pageSwitchTimer.current);
      }
    };
  }, []);

  if (!authResolved) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.authLoadingShell}>
          <LoadingIndicator label="恢复登录中" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={[styles.appFrame, isWide ? styles.appFrameWide : null]}>
        {isWide ? <SideNav items={navItems} active={screen} onChange={handleNavigate} /> : null}

        <View style={styles.mainColumn}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.brand}>Ledger AI</Text>
              <Text style={styles.brandSub}>Personal finance</Text>
            </View>
            <View style={styles.topActions}>
              <IconButton icon="list-outline" label="打开交易管理" onPress={() => handleNavigate('transactions')} />
              <IconButton icon="notifications-outline" label="打开提醒" />
            </View>
          </View>

          <View style={styles.contentHost}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.contentScroll}>
              <Animated.View style={[styles.contentInner, { opacity: pageOpacity }]}>
                {renderScreen(
                  renderedScreen,
                  handleNavigate,
                  () => {
                    clearAuthToken();
                    setIsAuthenticated(false);
                    handleNavigate('home');
                  },
                  entryMode,
                  requireDeleteConfirmation,
                  setRequireDeleteConfirmation,
                )}
              </Animated.View>
            </ScrollView>
            {isPageSwitching ? (
              <View accessibilityRole="progressbar" pointerEvents="auto" style={styles.pageSwitchOverlay}>
                <View style={styles.pageSwitchPanel}>
                  <LoadingIndicator label="加载中" />
                </View>
              </View>
            ) : null}
          </View>

          {!isWide ? <BottomNav items={navItems} active={screen} onChange={handleNavigate} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function renderScreen(
  screen: ScreenKey,
  goTo: (screen: ScreenKey, options?: NavigationOptions) => void,
  onSignOut: () => void,
  entryMode: EntryMode,
  requireDeleteConfirmation: boolean,
  setRequireDeleteConfirmation: (value: boolean) => void,
) {
  switch (screen) {
    case 'home':
      return <HomeScreen goTo={goTo} />;
    case 'entry':
      return <EntryScreen initialMode={entryMode} />;
    case 'transactions':
      return <TransactionsScreen goTo={goTo} requireDeleteConfirmation={requireDeleteConfirmation} />;
    case 'reports':
      return <ReportsScreen />;
    case 'settings':
      return (
        <SettingsScreen
          onSignOut={onSignOut}
          requireDeleteConfirmation={requireDeleteConfirmation}
          onRequireDeleteConfirmationChange={setRequireDeleteConfirmation}
        />
      );
    default:
      return <HomeScreen goTo={goTo} />;
  }
}

function BottomNav({
  items,
  active,
  onChange,
}: {
  items: NavItem[];
  active: ScreenKey;
  onChange: (screen: ScreenKey) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => (
        <NavButton key={item.key} item={item} active={active === item.key} onPress={() => onChange(item.key)} />
      ))}
    </View>
  );
}

function SideNav({
  items,
  active,
  onChange,
}: {
  items: NavItem[];
  active: ScreenKey;
  onChange: (screen: ScreenKey) => void;
}) {
  return (
    <View style={styles.sideNav}>
      <View style={styles.sideLogo}>
        <Text style={styles.sideLogoText}>AI</Text>
      </View>
      <View style={styles.sideNavItems}>
        {items.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`切换到${item.label}`}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[styles.sideNavButton, active === item.key ? styles.sideNavActive : null]}
          >
            <Ionicons name={item.icon} size={20} color={palette.ink} />
            <Text style={styles.sideNavText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NavButton({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`切换到${item.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.navButton, active ? styles.navButtonActive : null, pressed ? styles.pressed : null]}
    >
      <Ionicons name={item.icon} size={20} color={palette.ink} />
      <Text style={styles.navLabel}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  appFrame: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  appFrameWide: {
    flexDirection: 'row',
  },
  mainColumn: {
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderBottomColor: palette.ink,
    borderBottomWidth: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 78,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  brand: {
    color: palette.ink,
    fontSize: typography.h2,
    fontWeight: '900',
  },
  brandSub: {
    color: palette.muted,
    fontSize: typography.tiny,
    fontWeight: '900',
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contentHost: {
    flex: 1,
    position: 'relative',
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  contentInner: {
    alignSelf: 'center',
    maxWidth: 1040,
    width: '100%',
  },
  bottomNav: {
    backgroundColor: palette.ink,
    borderTopColor: palette.ink,
    borderTopWidth: 3,
    flexDirection: 'row',
    gap: 1,
    padding: spacing.xs,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 62,
    paddingVertical: spacing.sm,
  },
  navButtonActive: {
    backgroundColor: palette.acid,
  },
  navLabel: {
    color: palette.ink,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  sideNav: {
    backgroundColor: palette.ink,
    gap: spacing.xl,
    padding: spacing.lg,
    width: 220,
  },
  sideLogo: {
    alignItems: 'center',
    backgroundColor: palette.acid,
    borderColor: palette.white,
    borderWidth: 2,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  sideLogoText: {
    color: palette.ink,
    fontSize: typography.h1,
    fontWeight: '900',
  },
  sideNavItems: {
    gap: spacing.sm,
  },
  sideNavButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.white,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  sideNavActive: {
    backgroundColor: palette.yellow,
  },
  sideNavText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
  authLoadingShell: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  pageSwitchOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 244, 0.72)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  pageSwitchPanel: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
