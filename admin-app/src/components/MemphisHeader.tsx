import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminRole, AdminUser } from '../lib/types';

interface HeaderProps {
  user: AdminUser;
  onLogout: () => void;
  onSwitchRole?: (role: AdminRole) => void;
}

export function MemphisHeader({ user, onLogout, onSwitchRole }: HeaderProps) {
  const getRoleConfig = (role: AdminRole) => {
    switch (role) {
      case 'kasir':
        return { label: 'KASIR', bg: '#BAE6FD', text: '#082F49' };
      case 'gate':
        return { label: 'GATE ENTRY', bg: '#7DD3FC', text: '#082F49' };
      case 'super_admin':
        return { label: 'SUPER ADMIN', bg: '#0284C7', text: '#FFFFFF' };
    }
  };

  const roleConfig = getRoleConfig(user.role);

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.logoBox}>
          <Ionicons name="snow-outline" size={18} color="#082F49" />
        </View>
        <View>
          <Text style={styles.brandTitle}>GLACIFEST</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg }]}>
            <Text style={[styles.roleText, { color: roleConfig.text }]}>
              {roleConfig.label}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.right}>
        {onSwitchRole && (
          <View style={styles.switchBox}>
            <TouchableOpacity
              onPress={() => onSwitchRole(user.role === 'kasir' ? 'gate' : user.role === 'gate' ? 'super_admin' : 'kasir')}
              style={styles.switchBtn}
            >
              <Ionicons name="swap-horizontal" size={14} color="#082F49" />
              <Text style={styles.switchText}>UBAH ROLE</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color="#082F49" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0F7FF',
    borderBottomWidth: 3,
    borderBottomColor: '#082F49',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 38,
    height: 38,
    backgroundColor: '#38BDF8',
    borderWidth: 2,
    borderColor: '#082F49',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#082F49',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#082F49',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#082F49',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 2,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#082F49',
    borderRadius: 6,
    overflow: 'hidden',
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  switchText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#082F49',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#082F49',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#082F49',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
});
