import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, Pill, ProgressBar } from '../components/Primitives';
import { palette, spacing, typography } from '../design/theme';
import { requestPasswordReset, signInWithPassword, signUpWithPassword } from '../services/financeApi';

type AuthMode = 'login' | 'register';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const passwordScore = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 34;
    if (/[A-Z]/i.test(password) && /\d/.test(password)) score += 33;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 33;
    return Math.max(18, Math.min(score, 100));
  }, [password]);

  const submitLabel = mode === 'login' ? '登录账本' : '创建账号';

  const handleAuthenticated = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setAuthError('请输入邮箱和密码。');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setAuthError('密码至少需要 8 位。');
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      if (mode === 'login') {
        await signInWithPassword(trimmedEmail, password);
        onAuthenticated();
      } else {
        const result = await signUpWithPassword(trimmedEmail, password, displayName);
        if (result.authenticated) {
          onAuthenticated();
          return;
        }
        setMode('login');
        setPassword('');
        setAuthMessage('账号已创建。请使用刚才的邮箱和密码登录；如果 Supabase 仍要求邮箱确认，请先完成确认。');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '认证失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('请输入邮箱后再发送重置邮件。');
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      await requestPasswordReset(trimmedEmail);
      setAuthMessage('重置密码邮件已发送，请到邮箱完成密码重设后再登录。');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '重置邮件发送失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.shell}>
          <Card style={styles.authCard}>
            <View style={styles.brandHeader}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>AI</Text>
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.kicker}>Ledger AI</Text>
                <Text style={styles.title}>先确认，再入账。</Text>
                <Text style={styles.lead}>AI 个人记账，认证只负责身份，账本数据由后端按用户隔离。</Text>
              </View>
            </View>

            <View style={styles.modeSwitch}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="切换到登录"
                onPress={() => setMode('login')}
                style={[styles.modeButton, mode === 'login' ? styles.modeActive : null]}
              >
                <Ionicons name="log-in-outline" size={18} color={palette.ink} />
                <Text style={styles.modeText}>登录</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="切换到注册"
                onPress={() => setMode('register')}
                style={[styles.modeButton, mode === 'register' ? styles.modeActive : null]}
              >
                <Ionicons name="person-add-outline" size={18} color={palette.ink} />
                <Text style={styles.modeText}>注册</Text>
              </Pressable>
            </View>

            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{mode === 'login' ? '欢迎回来' : '创建你的账本'}</Text>
              <Pill label={mode === 'login' ? 'Supabase Auth 入口' : '首访创建 UserProfile'} tone="blue" />
            </View>

            {mode === 'register' ? (
              <AuthField
                autoComplete="name"
                icon="person-outline"
                label="显示名称"
                onChangeText={setDisplayName}
                placeholder="例如：顾千茜"
                value={displayName}
              />
            ) : null}

            <AuthField
              autoCapitalize="none"
              autoComplete="email"
              icon="mail-outline"
              inputMode="email"
              label="邮箱"
              onChangeText={setEmail}
              placeholder="例如：demo@finance.local"
              value={email}
            />

            <AuthField
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              icon="key-outline"
              label="密码"
              onChangeText={setPassword}
              placeholder="请输入密码"
              secureTextEntry
              value={password}
            />

            {mode === 'register' ? (
              <View style={styles.passwordMeter}>
                <View style={styles.passwordMeterHeader}>
                  <Text style={styles.helperText}>密码强度</Text>
                  <Text style={styles.helperStrong}>{passwordScore}%</Text>
                </View>
                <ProgressBar value={passwordScore} color={passwordScore > 66 ? palette.green : palette.red} />
              </View>
            ) : null}

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedPrivacy }}
              accessibilityLabel="同意隐私说明"
              onPress={() => setAcceptedPrivacy((value) => !value)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, acceptedPrivacy ? styles.checkboxChecked : null]}>
                {acceptedPrivacy ? <Ionicons name="checkmark-outline" size={18} color={palette.ink} /> : null}
              </View>
              <Text style={styles.checkboxText}>我理解 AI 解析结果需要确认后才会写入账本，且模型密钥不会保存在前端。</Text>
            </Pressable>

            <View style={styles.submitArea}>
              <ActionButton
                icon={mode === 'login' ? 'log-in-outline' : 'person-add-outline'}
                label={isSubmitting ? '连接中' : submitLabel}
                disabled={!acceptedPrivacy || isSubmitting || !email.trim() || !password}
                loading={isSubmitting}
                onPress={handleAuthenticated}
              />
            </View>

            {authError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>无法完成认证</Text>
                <Text style={styles.errorText}>{authError}</Text>
              </View>
            ) : null}

            {authMessage ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageTitle}>认证提示</Text>
                <Text style={styles.messageText}>{authMessage}</Text>
              </View>
            ) : null}

            {mode === 'login' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="找回密码"
                onPress={handlePasswordReset}
                style={styles.forgotButton}
              >
                <Text style={styles.forgotText}>忘记密码？发送重置邮件</Text>
              </Pressable>
            ) : (
              <Text style={styles.registerNote}>注册后后端应调用 `/auth/me` 创建或返回 `UserProfile`，业务表统一使用后端派生的用户身份。</Text>
            )}

            <View style={styles.trustStrip}>
              <TrustBadge icon="shield-checkmark-outline" label="JWT 校验" />
              <TrustBadge icon="lock-closed-outline" label="密钥不进前端" />
              <TrustBadge icon="download-outline" label="数据可导出" />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthField({
  icon,
  label,
  ...inputProps
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldLabelRow}>
        <Ionicons name={icon} size={17} color={palette.muted} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

function TrustBadge({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.trustBadge}>
      <Ionicons name={icon} size={16} color={palette.ink} />
      <Text style={styles.trustText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  shell: {
    alignSelf: 'center',
    maxWidth: 640,
    width: '100%',
  },
  authCard: {
    width: '100%',
  },
  brandHeader: {
    alignItems: 'center',
    backgroundColor: palette.yellow,
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  brandCopy: {
    flex: 1,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: palette.acid,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  brandMarkText: {
    color: palette.ink,
    fontSize: typography.h1,
    fontWeight: '900',
  },
  kicker: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: spacing.xs,
  },
  lead: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  modeSwitch: {
    borderColor: palette.ink,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  modeButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  modeActive: {
    backgroundColor: palette.acid,
  },
  modeText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  formHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  formTitle: {
    color: palette.ink,
    fontSize: typography.h1,
    fontWeight: '900',
  },
  fieldBlock: {
    flex: 1,
    minWidth: 148,
    marginBottom: spacing.md,
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '900',
  },
  input: {
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    color: palette.ink,
    fontSize: 16,
    fontWeight: '800',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  passwordMeter: {
    marginBottom: spacing.lg,
  },
  passwordMeterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  helperText: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '900',
  },
  helperStrong: {
    color: palette.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  checkboxRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkboxChecked: {
    backgroundColor: palette.acid,
  },
  checkboxText: {
    color: palette.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 20,
  },
  submitArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  forgotButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    color: palette.blue,
    fontSize: typography.body,
    fontWeight: '900',
  },
  errorBox: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.ink,
    borderWidth: 2,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  errorTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  errorText: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 18,
  },
  messageBox: {
    backgroundColor: palette.greenSoft,
    borderColor: palette.ink,
    borderWidth: 2,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  messageTitle: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  messageText: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 18,
  },
  registerNote: {
    color: palette.muted,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  trustStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  trustBadge: {
    alignItems: 'center',
    backgroundColor: palette.blueSoft,
    borderColor: palette.ink,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  trustText: {
    color: palette.ink,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
});
