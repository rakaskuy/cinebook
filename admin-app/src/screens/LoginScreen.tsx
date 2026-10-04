import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminRole, AdminUser } from '../lib/types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface LoginScreenProps {
  onLoginSuccess: (user: AdminUser) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStandardLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Form Belum Lengkap', 'Masukkan email dan password akun admin panitia.');
      return;
    }

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) throw error;

        // Fetch admin role
        const { data: adminData, error: adminErr } = await supabase
          .from('admins')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (adminErr || !adminData) {
          throw new Error('Akun terdaftar tapi belum memiliki hak akses operasional panitia.');
        }

        onLoginSuccess({
          id: data.user.id,
          email: data.user.email || email,
          nama: adminData.nama || 'Panitia GlaciFest',
          role: adminData.role || 'kasir',
        });
      } else {
        throw new Error('Konfigurasi Supabase belum terhubung.');
      }
    } catch (err: any) {
      Alert.alert('Gagal Login', err.message || 'Email atau password tidak sesuai.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Hero Banner */}
        <View style={styles.heroBox}>
          <View style={styles.badgeTop}>
            <Text style={styles.badgeTopText}>APK POS PANITIA</Text>
          </View>

          <View style={styles.iconCircle}>
            <Ionicons name="snow-outline" size={32} color="#082F49" />
          </View>

          <Text style={styles.title}>GLACIFEST</Text>
          <Text style={styles.subtitle}>POS SCANNER KASIR &amp; GATE</Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>AUTENTIKASI AKUN PANITIA</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL PANITIA</Text>
            <TextInput
              style={styles.input}
              placeholder="kasir@glacifest.id"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleStandardLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#082F49" />
            ) : (
              <Text style={styles.loginBtnText}>MASUK SISTEM ➔</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Sistem Verifikasi E-Ticket GlaciFest • SMAN 1 Kendal
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F7FF',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 50,
  },
  heroBox: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badgeTop: {
    backgroundColor: '#38BDF8',
    borderWidth: 2,
    borderColor: '#082F49',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 12,
  },
  badgeTopText: {
    color: '#082F49',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#BAE6FD',
    borderWidth: 3,
    borderColor: '#082F49',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#082F49',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
    color: '#082F49',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0369A1',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#082F49',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#082F49',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '900',
    color: '#082F49',
    letterSpacing: 1,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#082F49',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#082F49',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#082F49',
  },
  loginBtn: {
    backgroundColor: '#38BDF8',
    borderWidth: 2,
    borderColor: '#082F49',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#082F49',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  loginBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#082F49',
    letterSpacing: 1,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
    marginTop: 24,
  },
});
