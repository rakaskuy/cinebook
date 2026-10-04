import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { AdminUser, ScanPreviewResult } from '../lib/types';
import { executeScanQrPreview, executeSubmitAdminDecision } from '../lib/supabase';

interface GateScreenProps {
  user: AdminUser;
}

export function GateScreen({ user }: GateScreenProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [previewData, setPreviewData] = useState<ScanPreviewResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Decline Modal
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Manual fallback
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

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

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    try {
      const result = await executeScanQrPreview(data, 'gate');
      setPreviewData(result);
    } catch (err: any) {
      Alert.alert('Scan Gagal', err.message || 'QR Code tidak terbaca.');
      setScanned(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGateDecision = async (decision: 'ACC' | 'DECLINE', reason?: string) => {
    if (!previewData?.kode_booking) return;

    setSubmitting(true);
    try {
      const res = await executeSubmitAdminDecision(
        previewData.kode_booking,
        decision,
        reason,
        'gate'
      );

      try {
        await Haptics.notificationAsync(
          decision === 'ACC'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error
        );
      } catch {}

      Alert.alert(
        decision === 'ACC' ? '🎟️ PINTU DIBUKA (USED)' : '⛔ AKSES DITOLAK',
        res.message,
        [
          {
            text: 'Scan Pengunjung Berikutnya',
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
      Alert.alert('Gagal Memproses Gate', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSearch = async () => {
    if (!manualCode.trim()) return;
    setIsProcessing(true);
    try {
      const res = await executeScanQrPreview(manualCode.trim(), 'gate');
      setPreviewData(res);
      setShowManualInput(false);
      setManualCode('');
    } catch (err: any) {
      Alert.alert('Tiket Tidak Ditemukan', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Fullscreen Camera Scanner */}
      <View style={styles.cameraWrapper}>
        {hasPermission === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FFE600" />
            <Text style={styles.whiteText}>Menghubungkan ke kamera native...</Text>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.center}>
            <Text style={styles.whiteText}>Izin kamera belum diberikan.</Text>
            <TouchableOpacity
              style={styles.yellowBtn}
              onPress={() => setShowManualInput(true)}
            >
              <Text style={styles.yellowBtnText}>GUNAKAN KODE MANUAL</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
        )}

        {/* Minimal High-Contrast HUD for Gate Staff */}
        <View style={styles.hudOverlay}>
          <View style={styles.hudTop}>
            <View style={styles.gateBadge}>
              <Ionicons name="enter" size={16} color="#18181B" />
              <Text style={styles.gateBadgeText}>GATE INGRESS • HIGH-SPEED SCAN</Text>
            </View>
            <TouchableOpacity
              style={styles.manualIconBtn}
              onPress={() => setShowManualInput(true)}
            >
              <Ionicons name="keypad" size={20} color="#18181B" />
            </TouchableOpacity>
          </View>

          {/* Central Target Reticle */}
          <View style={styles.reticle}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            <Text style={styles.reticleHint}>ARAHKAN KE QR TIKET</Text>
          </View>

          <View style={styles.hudBottom}>
            <Text style={styles.hudHelper}>
              Pemberian akses masuk bioskop • Validasi otomatis tanggal hari ini
            </Text>
          </View>
        </View>
      </View>

      {/* Instant Decision Sheet for Gate */}
      <Modal visible={!!previewData} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.card}>
            {previewData && (
              <>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardCode}>{previewData.kode_booking}</Text>
                    <Text style={styles.cardFilm}>{previewData.film_judul}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusTag,
                      {
                        backgroundColor:
                          previewData.status === 'ACC'
                            ? '#00E599'
                            : previewData.status === 'USED'
                            ? '#FF3366'
                            : '#FFE600',
                      },
                    ]}
                  >
                    <Text style={styles.statusTagText}>{previewData.status}</Text>
                  </View>
                </View>

                {/* Date Check Warning */}
                {!previewData.is_session_today && (
                  <View style={styles.alertWrongDate}>
                    <Ionicons name="alert-circle" size={20} color="#991B1B" />
                    <Text style={styles.alertWrongDateText}>
                      BUKAN HARI INI! Tiket untuk tanggal {previewData.tanggal}.
                    </Text>
                  </View>
                )}

                {previewData.notice && (
                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeText}>{previewData.notice}</Text>
                  </View>
                )}

                {/* Attendee Details */}
                <View style={styles.attendeeCard}>
                  <Text style={styles.attendeeName}>
                    {previewData.nama_lengkap} ({previewData.kelas})
                  </Text>
                  <Text style={styles.attendeePkg}>
                    Paket: {previewData.nama_paket} ({previewData.jumlah_orang} Orang)
                  </Text>
                  <Text style={styles.attendeeSchedule}>
                    Jadwal: {previewData.jam_mulai?.substring(0, 5)} WIB
                  </Text>
                </View>

                {/* Big Action Buttons */}
                {previewData.can_action ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.gateDeclineBtn}
                      onPress={() => setShowDeclineModal(true)}
                      disabled={submitting}
                    >
                      <Ionicons name="close" size={24} color="#FFF" />
                      <Text style={styles.gateDeclineBtnText}>TOLAK MASUK</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.gateAccBtn}
                      onPress={() => handleGateDecision('ACC')}
                      disabled={submitting}
                    >
                      <Ionicons name="checkmark-sharp" size={28} color="#18181B" />
                      <Text style={styles.gateAccBtnText}>IZINKAN MASUK (ACC)</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => {
                      setPreviewData(null);
                      setScanned(false);
                    }}
                  >
                    <Text style={styles.closeBtnText}>TUTUP & SCAN ULANG</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Decline Reason Modal */}
      <Modal visible={showDeclineModal} transparent animationType="fade">
        <View style={styles.modalBackdropCenter}>
          <View style={styles.cardCenter}>
            <Text style={styles.declineTitle}>ALASAN TOLAK GATE MASUK</Text>
            <Text style={styles.declineSub}>Wajib diisi untuk catatan audit gate.</Text>

            <TextInput
              style={styles.declineInput}
              placeholder="Contoh: Salah jadwal sesi / Mengganggu ketertiban"
              placeholderTextColor="#A1A1AA"
              multiline
              value={declineReason}
              onChangeText={setDeclineReason}
            />

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.btnBatal}
                onPress={() => setShowDeclineModal(false)}
              >
                <Text style={styles.btnBatalText}>BATAL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnKirimDecline}
                onPress={() => {
                  if (!declineReason.trim()) {
                    Alert.alert('Wajib Diisi', 'Sertakan alasan penolakan.');
                    return;
                  }
                  handleGateDecision('DECLINE', declineReason.trim());
                }}
              >
                <Text style={styles.btnKirimDeclineText}>TOLAK MASUK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Input Modal */}
      <Modal visible={showManualInput} transparent animationType="fade">
        <View style={styles.modalBackdropCenter}>
          <View style={styles.cardCenter}>
            <Text style={styles.declineTitle}>INPUT KODE BOOKING</Text>
            <TextInput
              style={styles.declineInput}
              placeholder="CIN-20260922-A9F4"
              placeholderTextColor="#A1A1AA"
              autoCapitalize="characters"
              value={manualCode}
              onChangeText={setManualCode}
            />
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.btnBatal}
                onPress={() => setShowManualInput(false)}
              >
                <Text style={styles.btnBatalText}>BATAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.yellowBtn} onPress={handleManualSearch}>
                <Text style={styles.yellowBtnText}>VERIFIKASI</Text>
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
    backgroundColor: '#000000',
  },
  cameraWrapper: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  whiteText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 10,
  },
  hudTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gateBadge: {
    backgroundColor: '#00F0FF',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gateBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18181B',
  },
  manualIconBtn: {
    width: 38,
    height: 38,
    backgroundColor: '#FFE600',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    alignSelf: 'center',
    width: 270,
    height: 270,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#00F0FF',
  },
  tl: { top: 0, left: 0, borderTopWidth: 6, borderLeftWidth: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 6, borderRightWidth: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 6, borderLeftWidth: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 6, borderRightWidth: 6 },
  reticleHint: {
    color: '#00F0FF',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    backgroundColor: 'rgba(24, 24, 27, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hudBottom: {
    alignItems: 'center',
    marginBottom: 10,
  },
  hudHelper: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 4,
    borderColor: '#18181B',
    padding: 24,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCode: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: '#18181B',
  },
  cardFilm: {
    fontSize: 13,
    fontWeight: '800',
    color: '#52525B',
    marginTop: 2,
  },
  statusTag: {
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#18181B',
  },
  alertWrongDate: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertWrongDateText: {
    color: '#991B1B',
    fontWeight: '900',
    fontSize: 11,
    flex: 1,
  },
  noticeBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    borderRadius: 8,
    padding: 10,
  },
  noticeText: {
    color: '#92400E',
    fontWeight: '800',
    fontSize: 11,
  },
  attendeeCard: {
    backgroundColor: '#F4F4F5',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  attendeeName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#18181B',
  },
  attendeePkg: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3F3F46',
  },
  attendeeSchedule: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FF3366',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  gateDeclineBtn: {
    flex: 1,
    backgroundColor: '#FF3366',
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gateDeclineBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
  },
  gateAccBtn: {
    flex: 1.6,
    backgroundColor: '#00E599',
    borderWidth: 3,
    borderColor: '#18181B',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gateAccBtnText: {
    color: '#18181B',
    fontSize: 14,
    fontWeight: '900',
  },
  closeBtn: {
    backgroundColor: '#E4E4E7',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  cardCenter: {
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: '#18181B',
    borderRadius: 20,
    padding: 20,
  },
  declineTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#18181B',
  },
  declineSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717A',
    marginBottom: 12,
  },
  declineInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 2.5,
    borderColor: '#18181B',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    fontWeight: '700',
    minHeight: 60,
    marginBottom: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnBatal: {
    flex: 1,
    backgroundColor: '#E4E4E7',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnBatalText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  btnKirimDecline: {
    flex: 1,
    backgroundColor: '#FF3366',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnKirimDeclineText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
  },
  yellowBtn: {
    backgroundColor: '#FFE600',
    borderWidth: 2,
    borderColor: '#18181B',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  yellowBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
});
