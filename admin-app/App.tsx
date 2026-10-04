import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { AdminRole, AdminUser } from './src/lib/types';
import { MemphisHeader } from './src/components/MemphisHeader';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { VerifyScreen } from './src/screens/VerifyScreen';
import { GateScreen } from './src/screens/GateScreen';

const STORE_KEY_USER = 'cinebook_admin_session_v1';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Restore session from expo-secure-store on app launch
  useEffect(() => {
    async function restoreSession() {
      try {
        const saved = await SecureStore.getItemAsync(STORE_KEY_USER);
        if (saved) {
          const parsed = JSON.parse(saved);
          setCurrentUser(parsed);
        }
      } catch (err) {
        console.warn('Failed to restore admin session:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    restoreSession();
  }, []);

  const handleLoginSuccess = async (user: AdminUser) => {
    setCurrentUser(user);
    try {
      await SecureStore.setItemAsync(STORE_KEY_USER, JSON.stringify(user));
    } catch (err) {
      console.warn('Failed to save admin session:', err);
    }
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    try {
      await SecureStore.deleteItemAsync(STORE_KEY_USER);
    } catch (err) {
      console.warn('Failed to delete admin session:', err);
    }
  };

  const handleSwitchRole = (newRole: AdminRole) => {
    if (!currentUser) return;
    const updated = { ...currentUser, role: newRole };
    setCurrentUser(updated);
    SecureStore.setItemAsync(STORE_KEY_USER, JSON.stringify(updated)).catch(() => {});
  };

  if (isInitializing) {
    return <View style={styles.loadingContainer} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" backgroundColor="#FFE600" />

      {!currentUser ? (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      ) : (
        <View style={styles.appContainer}>
          <MemphisHeader
            user={currentUser}
            onLogout={handleLogout}
            onSwitchRole={handleSwitchRole}
          />

          <View style={styles.screenContainer}>
            {currentUser.role === 'kasir' && <VerifyScreen user={currentUser} />}
            {currentUser.role === 'gate' && <GateScreen user={currentUser} />}
            {currentUser.role === 'super_admin' && <DashboardScreen />}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFDF7',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFDF7',
  },
  appContainer: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
});
