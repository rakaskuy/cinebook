import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DashboardStats } from '../lib/types';
import { fetchDashboardStats } from '../lib/supabase';

export function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  const loadData = async () => {
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading || !stats) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#18181B" />
        <Text style={styles.loadingText}>Memuat statistik festival...</Text>
      </View>
    );
  }

  const filteredBookings = stats.recentBookings.filter((b) => {
    if (selectedFilter === 'ALL') return true;
    return b.status === selectedFilter;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerTitleRow}>
        <View>
          <Text style={styles.pageTitle}>DASHBOARD FESTIVAL</Text>
          <Text style={styles.pageSubtitle}>Pantauan Realtime & Laporan Keuangan</Text>
        </View>
        <TouchableOpacity style={styles.refreshIconBtn} onPress={onRefresh}>
          <Ionicons name="reload" size={16} color="#18181B" />
        </TouchableOpacity>
      </View>

      {/* Primary KPI Cards Grid */}
      <View style={styles.kpiGrid}>
        {/* Revenue Card */}
        <View style={[styles.kpiCard, { backgroundColor: '#FFE600' }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="wallet-outline" size={20} color="#18181B" />
          </View>
          <Text style={styles.kpiLabel}>TOTAL REVENUE OFFLINE</Text>
          <Text style={styles.kpiValue}>
            Rp {stats.totalRevenueToday.toLocaleString('id-ID')}
          </Text>
          <Text style={styles.kpiSub}>Uang tunai kasir terverifikasi</Text>
        </View>

        {/* Total Bookings Card */}
        <View style={[styles.kpiCard, { backgroundColor: '#00F0FF' }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="ticket-outline" size={20} color="#18181B" />
          </View>
          <Text style={styles.kpiLabel}>TOTAL TIKET TERBIT</Text>
          <Text style={styles.kpiValue}>{stats.totalBookingsToday} Tiket</Text>
          <Text style={styles.kpiSub}>Semua paket pemesanan hari ini</Text>
        </View>
      </View>

      {/* Status Breakdown Row */}
      <Text style={styles.sectionHeader}>BREAKDOWN STATUS TIKET</Text>
      <View style={styles.statusBreakdownGrid}>
        <View style={[styles.statusMiniCard, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]}>
          <Text style={styles.statusMiniLabel}>PENDING</Text>
          <Text style={[styles.statusMiniVal, { color: '#B45309' }]}>
            {stats.countsByStatus.PENDING}
          </Text>
        </View>

        <View style={[styles.statusMiniCard, { backgroundColor: '#ECFDF5', borderColor: '#10B981' }]}>
          <Text style={styles.statusMiniLabel}>ACC KASIR</Text>
          <Text style={[styles.statusMiniVal, { color: '#047857' }]}>
            {stats.countsByStatus.ACC}
          </Text>
        </View>

        <View style={[styles.statusMiniCard, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }]}>
          <Text style={styles.statusMiniLabel}>USED (GATE)</Text>
          <Text style={[styles.statusMiniVal, { color: '#1D4ED8' }]}>
            {stats.countsByStatus.USED}
          </Text>
        </View>

        <View style={[styles.statusMiniCard, { backgroundColor: '#F4F4F5', borderColor: '#71717A' }]}>
          <Text style={styles.statusMiniLabel}>EXPIRED</Text>
          <Text style={[styles.statusMiniVal, { color: '#52525B' }]}>
            {stats.countsByStatus.EXPIRED}
          </Text>
        </View>
      </View>

      {/* Recent Bookings Feed */}
      <View style={styles.bookingsHeaderRow}>
        <Text style={styles.sectionHeader}>TRANSAKSI TIKET TERBARU</Text>
        {/* Filter Pills */}
        <View style={styles.filterPillsRow}>
          {['ALL', 'PENDING', 'ACC', 'USED'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterPill,
                selectedFilter === f && styles.filterPillActive,
              ]}
              onPress={() => setSelectedFilter(f)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  selectedFilter === f && styles.filterPillTextActive,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.listContainer}>
        {filteredBookings.map((b) => {
          const statusBg =
            b.status === 'ACC'
              ? '#00F0FF'
              : b.status === 'USED'
              ? '#00E599'
              : b.status === 'PENDING'
              ? '#FFE600'
              : '#E4E4E7';

          return (
            <View key={b.id} style={styles.bookingRowCard}>
              <View style={styles.bookingRowHeader}>
                <Text style={styles.bookingCodeText}>{b.kode_booking}</Text>
                <View style={[styles.bookingStatusBadge, { backgroundColor: statusBg }]}>
                  <Text style={styles.bookingStatusText}>{b.status}</Text>
                </View>
              </View>

              <Text style={styles.bookingNameText}>
                {b.nama_lengkap} ({b.kelas})
              </Text>
              <Text style={styles.bookingFilmText}>🎬 {b.film_judul}</Text>

              <View style={styles.bookingFooterRow}>
                <Text style={styles.bookingPriceText}>
                  Rp {b.total_harga.toLocaleString('id-ID')}
                </Text>
                <Text style={styles.bookingTimeText}>
                  {new Date(b.created_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  WIB
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF7',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFDF7',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    color: '#18181B',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#18181B',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717A',
    marginTop: 2,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#18181B',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  kpiGrid: {
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#18181B',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18181B',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#18181B',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3F3F46',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: '#18181B',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  statusBreakdownGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statusMiniCard: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statusMiniLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#18181B',
  },
  statusMiniVal: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  bookingsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  filterPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#18181B',
    borderRadius: 6,
  },
  filterPillActive: {
    backgroundColor: '#18181B',
  },
  filterPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#18181B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    gap: 10,
  },
  bookingRowCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#18181B',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  bookingRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bookingCodeText: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: '#18181B',
  },
  bookingStatusBadge: {
    borderWidth: 1.5,
    borderColor: '#18181B',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  bookingStatusText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#18181B',
  },
  bookingNameText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#18181B',
  },
  bookingFilmText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52525B',
    marginTop: 2,
  },
  bookingFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  bookingPriceText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FF3366',
  },
  bookingTimeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A1A1AA',
  },
});
