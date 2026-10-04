import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { AdminUser, ScanPreviewResult } from '../lib/types';
import { executeScanQrPreview, executeSubmitAdminDecision } from '../lib/supabase';

interface VerifyScreenProps {
  user: AdminUser;
}

export function VerifyScreen({ user }: VerifyScreenProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [previewData, setPreviewData] = useState<ScanPreviewResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Manual input fallback states
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Decline Reason Modal
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || isProcessing) return;
    setScanned(true);
    setIsProcessing(true);

    // Haptic feedback to alert cashier without needing to stare constantly at screen
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    try {
      const result = await executeScanQrPreview(data, 'kasir');
      setPreviewData(result);
    } catch (err: any) {
      Alert.alert('Gagal Scan', err.message || 'QR Code tidak terbaca.');
      setScanned(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSearch = async () => {
    if (!manualCode.trim()) {
      Alert.alert('Kode Kosong', 'Masukkan kode booking (misal: CIN-20260922-A9F4).');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await executeScanQrPreview(manualCode.trim(), 'kasir');
      setPreviewData(result);
      setShowManualInput(false);
      setManualCode('');
    } catch (err: any) {
      Alert.alert('Pencarian Gagal', err.message || 'Data tiket tidak ditemukan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDecision = async (decision: 'ACC' | 'DECLINE', reason?: string) => {
    if (!previewData?.kode_booking) return;

    setSubmittingDecision(true);
    try {
      const res = await executeSubmitAdminDecision(
        previewData.kode_booking,
        decision,
        reason,
        'kasir'
      );

      try {
        await Haptics.notificationAsync(
          decision === 'ACC'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
      } catch {}

      Alert.alert(
        decision === 'ACC' ? '✅ Berhasil ACC' : '⚠️ Berhasil DECLINE',
        res.message,
        [
          {
            text: 'OK (Scan Berikutnya)',
            onPress: () => {
              setPreviewData(null);
              setShowDeclineModal(false);
              setDeclineReason('');
              setScanned(false);
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Gagal Memproses', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner */}
      <View style={styles.topInfoBar}>
        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>VERIFIKASI PEMBAYARAN KASIR</Text>
        </View>
        <Text style={styles.topInstruction}>
          Arahkan kamera ke QR Code e-ticket atau gunakan input kode manual
        </Text>
      </View>

      {/* Camera Viewfinder Area */}
      <View style={styles.cameraContainer}>
        {hasPermission === null ? (
          <View style={styles.permContainer}>
            <ActivityIndicator size="large" color="#18181B" />
            <Text style={styles.permText}>Meminta izin kamera native...</Text>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.deniedContainer}>
            <Ionicons name="camera-reverse-outline" size={48} color="#FF3366" />
            <Text style={styles.deniedTitle}>Akses Kamera Ditolak</Text>
            <Text style={styles.deniedSub}>
              CineBook butuh kamera untuk scan QR. Anda masih bisa memasukkan kode secara manual.
            </Text>
            <TouchableOpacity
              style={styles.openSettingsBtn}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.openSettingsText}>Buka Pengaturan HP</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
            />

            {/* Viewfinder Target Reticle with Memphis styling */}
            <View style={styles.reticleFrame}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
              {isProcessing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#FFE600" />
                  <Text style={styles.processingText}>MEMVALIDASI HMAC...</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => setShowManualInput(true)}
        >
          <Ionicons name="keypad-outline" size={20} color="#18181B" />
          <Text style={styles.manualBtnText}>INPUT MANUAL KODE</Text>
        </TouchableOpacity>

        {scanned && !previewData && (
          <TouchableOpacity
            style={styles.rescanBtn}
            onPress={() => setScanned(false)}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.rescanBtnText}>RESET SCANNER</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Manual Input Modal */}
      <Modal visible={showManualInput} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>INPUT MANUAL KODE BOOKING</Text>
            <Text style={styles.modalSubtitle}>
              Gunakan opsi ini jika kamera rusak atau layar HP pengunjung buram.
            </Text>

            <TextInput
              style={styles.manualInput}
              placeholder="Contoh: CIN-20260922-A9F4"
              placeholderTextColor="#A1A1AA"
              autoCapitalize="characters"
              value={manualCode}
              onChangeText={setManualCode}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowManualInput(false)}
              >
                <Text style={styles.cancelBtnText}>BATAL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitCodeBtn}
                onPress={handleManualSearch}
              >
                <Text style={styles.submitCodeBtnText}>CARI TIKET ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ticket Preview Confirmation Bottom Sheet */}
      <Modal visible={!!previewData} transparent animationType="slide">
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            {previewData && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header Strip */}
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetCode}>{previewData.kode_booking}</Text>
                    <Text style={styles.sheetFilm}>🎬 {previewData.film_judul}</Text>
                  </View>
                  <View
                    style={[
                      styles.sheetStatusPill,
                      {
                        backgroundColor:
                          previewData.status === 'PENDING'
                            ? '#FFE600'
                            : previewData.status === 'ACC'
                            ? '#00F0FF'
                            : '#FF3366',
                      },
                    ]}
                  >
                    <Text style={styles.sheetStatusText}>{previewData.status}</Text>
                  </View>
                </View>

                {/* Repeated Decline Warning if any */}
                {previewData.is_repeated_decline && (
                  <View style={styles.warningBox}>
                    <Ionicons name="warning" size={18} color="#B91C1C" />
                    <Text style={styles.warningText}>
                      PERINGATAN: Tiket ini telah di-DECLINE sebanyak {previewData.decline_count} kali! Periksa bukti transfer dengan cermat.
                    </Text>
                  </View>
                )}

                {/* Details Summary */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>NAMA PEMESAN</Text>
                    <Text style={styles.detailVal}>
                      {previewData.nama_lengkap} ({previewData.kelas})
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>PAKET TIKET</Text>
                    <Text style={styles.detailVal}>
                      {previewData.nama_paket} ({previewData.jumlah_orang} Orang)
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>TOTAL TAGIHAN OFFLINE</Text>
                    <Text style={styles.detailPrice}>
                      Rp {Number(previewData.total_harga || 0).toLocaleString('id-ID')}
                    </Text>
                  </View>
                  {previewData.notice && (
                    <View style={styles.noticeBox}>
                      <Text style={styles.noticeText}>{previewData.notice}</Text>
                    </View>
                  )}
                </View>

                {/* ACC and DECLINE Big Action Buttons */}
                {previewData.can_action ? (
                  <View style={styles.decisionRow}>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => setShowDeclineModal(true)}
                      disabled={submittingDecision}
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.declineBtnText}>TOLAK (DECLINE)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.accBtn}
                      onPress={() => handleConfirmDecision('ACC')}
                      disabled={submittingDecision}
                    >
                      <Ionicons name="checkmark-circle" size={22} color="#18181B" />
                      <Text style={styles.accBtnText}>ACC BAYAR (TERIMA)</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.dismissBtn}
                    onPress={() => {
                      setPreviewData(null);
                      setScanned(false);
                    }}
                  >
                    <Text style={styles.dismissBtnText}>TUTUP PREVIEW</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Decline Reason Modal */}
      <Modal visible={showDeclineModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ALASAN PENOLAKAN (WAJIB)</Text>
            <Text style={styles.modalSubtitle}>
              Sebutkan alasan penolakan pembayaran agar tersimpan di riwayat audit.
            </Text>

            <TextInput
              style={[styles.manualInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Contoh: Uang tunai kurang Rp 5.000 / Bukti transfer palsu"
              placeholderTextColor="#A1A1AA"
              multiline
              value={declineReason}
              onChangeText={setDeclineReason}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowDeclineModal(false)}
              >
                <Text style={styles.cancelBtnText}>BATAL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitCodeBtn, { backgroundColor: '#FF3366' }]}
                onPress={() => {
                  if (!declineReason.trim()) {
                    Alert.alert('Alasan Kosong', 'Alasan penolakan wajib diisi!');
                    return;
                  }
                  handleConfirmDecision('DECLINE', declineReason.trim());
                }}
              >
                <Text style={[styles.submitCodeBtnText, { color: '#FFF' }]}>
                  KIRIM DECLINE ➔
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181B',
  },
  topInfoBar: {
    backgroundColor: '#FFFDF7',
    padding: 14,
    borderBottomWidth: 3,
    borderBottomColor: '#18181B',
    alignItems: 'center',
  },
  topBadge: {
    backgroundColor: '#FFE600',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  topBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18181B',
  },
  topInstruction: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52525B',
    textAlign: 'center',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  cameraWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFDF7',
  },
  permText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#18181B',
    marginTop: 10,
  },
  deniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFDF7',
    padding: 24,
  },
  deniedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#18181B',
    marginTop: 12,
  },
  deniedSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52525B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  openSettingsBtn: {
    backgroundColor: '#00F0FF',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  openSettingsText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  reticleFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#FFE600',
  },
  tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5 },
  tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5 },
  br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 24, 27, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  processingText: {
    color: '#FFE600',
    fontWeight: '900',
    fontSize: 12,
    marginTop: 8,
    letterSpacing: 1,
  },
  bottomBar: {
    backgroundColor: '#FFFDF7',
    borderTopWidth: 3,
    borderTopColor: '#18181B',
    padding: 16,
    flexDirection: 'row',
    gap: 10,
  },
  manualBtn: {
    flex: 1,
    backgroundColor: '#00F0FF',
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#18181B',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  manualBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  rescanBtn: {
    backgroundColor: '#FF3366',
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#18181B',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  rescanBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: '#18181B',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#18181B',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#18181B',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52525B',
    marginTop: 4,
    marginBottom: 14,
  },
  manualInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontWeight: '900',
    color: '#18181B',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#E4E4E7',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  submitCodeBtn: {
    flex: 1,
    backgroundColor: '#00E599',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitCodeBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 4,
    borderColor: '#18181B',
    padding: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetCode: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: '#18181B',
  },
  sheetFilm: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52525B',
    marginTop: 2,
  },
  sheetStatusPill: {
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sheetStatusText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18181B',
  },
  warningBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
  },
  detailsBox: {
    backgroundColor: '#F4F4F5',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#71717A',
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  detailPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FF3366',
  },
  noticeBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  noticeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: '#FF3366',
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  accBtn: {
    flex: 1.4,
    backgroundColor: '#00E599',
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  accBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#18181B',
  },
  dismissBtn: {
    backgroundColor: '#E4E4E7',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
});
