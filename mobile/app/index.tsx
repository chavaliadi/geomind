import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, SafeAreaView, Animated, RefreshControl,
  StyleSheet, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useAuthContext } from './_layout';
import { fetchTasks, createTask, sendLocationCheck, predictCategory, Task } from '../services/api';

// ── Safe notifications shim (removed from Expo Go SDK 53) ────────────────────
let Notifications: any = null;
// Removed explicit require('expo-notifications') as it triggers terminal/LogBox errors in Expo Go SDK 53.

const requestNotifPermissions = async () => {
  if (!Notifications) return;
  try { await Notifications.requestPermissionsAsync(); } catch { /* ignore */ }
};

const scheduleNotification = async (title: string, body: string) => {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, badge: 1 },
      trigger: null,
    });
  } catch { /* ignore */ }
};

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  grocery: '#2ECC71', pharmacy: '#3498DB', clothing: '#E67E22', general: '#9B59B6',
};
const CAT_EMOJI: Record<string, string> = {
  grocery: '🛒', pharmacy: '💊', clothing: '👕', general: '📌',
};
const PRI_COLOR: Record<string, string> = { high: '#E74C3C', medium: '#F39C12', low: '#95A5A6' };

export default function HomeScreen() {
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [isTracking, setIsTracking]   = useState(false);
  const [checking, setChecking]       = useState(false);
  const [location, setLocation]       = useState<{ lat: number; lng: number } | null>(null);
  const [locAccuracy, setLocAccuracy] = useState<number | null>(null);
  const [trackResult, setTrackResult] = useState('');

  const [quickText, setQuickText] = useState('');
  const [quickPri, setQuickPri]   = useState<'high'|'medium'|'low'>('medium');
  const [quickCat, setQuickCat]   = useState('general');
  const [mlSuggest, setMlSuggest] = useState<string | null>(null);
  const [adding, setAdding]       = useState(false);

  // ✅ Use JWT auth context instead of Clerk hooks
  const { user, signOut } = useAuthContext();
  const isSignedIn = !!user;

  const trackingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim        = useRef(new Animated.Value(1)).current;
  const mlTimer          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { const t = await fetchTasks(); setTasks(t); }
    catch (e: any) {
      if (!isRefresh) Alert.alert('Load Error', e.message || 'Could not load tasks');
    }
    finally { setRefreshing(false); setLoading(false); }
  };

  useEffect(() => {
    load();
    (async () => {
      await requestNotifPermissions();
      await Location.requestForegroundPermissionsAsync();
    })();
  }, []);

  // ML debounce
  useEffect(() => {
    if (quickText.trim().length < 4 || quickCat !== 'general') { setMlSuggest(null); return; }
    if (mlTimer.current) clearTimeout(mlTimer.current);
    mlTimer.current = setTimeout(async () => {
      const cat = await predictCategory(quickText.trim());
      setMlSuggest(cat);
    }, 500);
    return () => { if (mlTimer.current) clearTimeout(mlTimer.current); };
  }, [quickText, quickCat]);

  // Pulse animation while tracking
  useEffect(() => {
    if (isTracking) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    }
  }, [isTracking]);

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    setLocAccuracy(loc.coords.accuracy);
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  };

  const checkNearby = async () => {
    setChecking(true);
    try {
      const pos = await getLocation();
      if (!pos) { setTrackResult('❌ GPS permission denied'); return; }
      const data = await sendLocationCheck(pos.lat, pos.lng);
      if (!data?.batches?.length) { setTrackResult('✨ No reminders triggered nearby'); return; }
      const triggered: string[] = [];
      for (const batch of data.batches) {
        const emoji = CAT_EMOJI[batch.category] || '📌';
        triggered.push(`${emoji} ${batch.category}: ${batch.tasks.map((t: any) => t.task).join(', ')}`);
        setTasks(prev => prev.map(t =>
          batch.tasks.find((b: any) => b.task_id === t.id) ? { ...t, status: 'triggered' } : t
        ));
        await scheduleNotification(
          `🗺️ GeoMind — ${emoji} ${batch.category}`,
          batch.tasks.map((t: any) => `${t.task} → ${t.place}`).join('\n'),
        );
      }
      setTrackResult('✅ ' + triggered.join('  ·  '));
    } catch (err: any) {
      setTrackResult('❌ ' + err.message);
    } finally { setChecking(false); }
  };

  const startTracking = async () => {
    const active = tasks.filter(t => t.status !== 'triggered' && t.status !== 'completed');
    if (!active.length) { setTrackResult('⚠️ No active tasks to track'); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsTracking(true);
    const notifNote = Notifications ? '' : '  (notifications unavailable in Expo Go)';
    setTrackResult(`🟢 Tracking active — checking every 2 min${notifNote}`);
    await checkNearby();
    trackingInterval.current = setInterval(checkNearby, 120000);
  };

  const stopTracking = () => {
    if (trackingInterval.current) clearInterval(trackingInterval.current);
    setIsTracking(false);
    setTrackResult('⏹️ Tracking stopped');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleQuickAdd = async () => {
    if (!quickText.trim()) return;
    setAdding(true);
    try {
      const t = await createTask(quickText.trim(), quickPri, quickCat !== 'general' ? quickCat : undefined);
      setTasks(prev => [t, ...prev]);
      setQuickText(''); setMlSuggest(null);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert('Create Failed', e.message || 'Could not create task');
    } finally { setAdding(false); }
  };

  const pending   = tasks.filter(t => t.status === 'pending').length;
  const triggered = tasks.filter(t => t.status === 'triggered').length;
  const total     = tasks.length;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F4FF" />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#0066FF" />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.logo}>🗺️ GeoMind</Text>
            <Text style={s.logoSub}>Smart Location Reminders</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={s.headerBadge}>
              <View style={[s.dot, isTracking ? s.dotActive : s.dotIdle]} />
              <Text style={s.headerBadgeText}>{isTracking ? 'Live' : 'Idle'}</Text>
            </View>
            {isSignedIn ? (
              <TouchableOpacity style={s.authBtn} onPress={signOut}>
                <Text style={s.authBtnText}>Logout</Text>
              </TouchableOpacity>
            ) : (
              <Link href="/sign-in" asChild>
                <TouchableOpacity style={s.authBtn}>
                  <Text style={s.authBtnText}>Sign In</Text>
                </TouchableOpacity>
              </Link>
            )}
          </View>
        </View>

        {/* Expo Go notification banner */}
        {!Notifications && (
          <View style={s.warnCard}>
            <Text style={s.warnText}>⚠️ Push notifications disabled in Expo Go. Use a dev build to enable them.</Text>
          </View>
        )}

        {/* Location card */}
        {location && (
          <View style={s.locCard}>
            <Text style={s.locLabel}>📡 Live GPS</Text>
            <Text style={s.locCoords}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
            {locAccuracy !== null && (
              <Text style={s.locAccuracy}>
                ±{locAccuracy.toFixed(0)}m {locAccuracy < 20 ? '✅ Excellent' : locAccuracy < 50 ? '⚠️ Good' : '📡 WiFi/Cell'}
              </Text>
            )}
          </View>
        )}

        {/* Stats */}
        <View style={s.statsGrid}>
          {[
            { label: 'Total',     value: total,     icon: '📋', color: '#0066FF' },
            { label: 'Pending',   value: pending,   icon: '⏳', color: '#F39C12' },
            { label: 'Triggered', value: triggered, icon: '✅', color: '#2ECC71' },
            { label: 'Done %',    value: total > 0 ? `${Math.round(((total - pending) / total) * 100)}%` : '0%', icon: '📊', color: '#9B59B6' },
          ].map(s2 => (
            <View key={s2.label} style={s.statCard}>
              <Text style={s.statIcon}>{s2.icon}</Text>
              <Text style={[s.statVal, { color: s2.color }]}>{s2.value}</Text>
              <Text style={s.statLabel}>{s2.label}</Text>
            </View>
          ))}
        </View>

        {/* Tracking result */}
        {!!trackResult && (
          <View style={[s.resultCard, trackResult.includes('🟢') ? s.resultGreen : trackResult.includes('❌') ? s.resultRed : s.resultBlue]}>
            <Text style={s.resultText}>{trackResult}</Text>
          </View>
        )}

        {/* Tracking buttons */}
        <View style={s.trackRow}>
          {!isTracking ? (
            <TouchableOpacity style={[s.btn, s.btnGreen]} onPress={startTracking} disabled={checking}>
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={s.btnText}>Start Tracking</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.btn, s.btnRed]} onPress={stopTracking}>
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={s.btnText}>Stop Tracking</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btn, s.btnBlue, { flex: 1 }]} onPress={checkNearby} disabled={checking}>
            {checking ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
            <Text style={s.btnText}>{checking ? 'Checking…' : 'Check Now'}</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Add */}
        <View style={s.card}>
          <Text style={s.cardTitle}>⚡ Quick Add Task</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Buy milk, Pick up medicine…"
              placeholderTextColor="#AAB"
              value={quickText}
              onChangeText={setQuickText}
              returnKeyType="done"
              onSubmitEditing={handleQuickAdd}
            />
            <TouchableOpacity style={s.addBtn} onPress={handleQuickAdd} disabled={adding || !quickText.trim()}>
              {adding ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={22} color="#fff" />}
            </TouchableOpacity>
          </View>

          {mlSuggest && (
            <TouchableOpacity style={s.mlHint} onPress={() => { setQuickCat(mlSuggest!); setMlSuggest(null); }}>
              <Text style={s.mlHintText}>✨ ML suggests: <Text style={{ fontWeight: '800' }}>{mlSuggest}</Text>  Tap to accept</Text>
            </TouchableOpacity>
          )}

          <View style={s.chipRow}>
            {(['high','medium','low'] as const).map(p => (
              <TouchableOpacity key={p} style={[s.chip, quickPri === p && { backgroundColor: PRI_COLOR[p] }]} onPress={() => setQuickPri(p)}>
                <Text style={[s.chipText, quickPri === p && { color: '#fff' }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
              </TouchableOpacity>
            ))}
            <View style={s.chipDivider} />
            {(['general','grocery','pharmacy','clothing'] as const).map(c => (
              <TouchableOpacity key={c} style={[s.chip, quickCat === c && { backgroundColor: CAT_COLOR[c] }]} onPress={() => setQuickCat(c)}>
                <Text style={[s.chipText, quickCat === c && { color: '#fff' }]}>{CAT_EMOJI[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Tasks */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📋 Recent Tasks</Text>
          {loading ? (
            <ActivityIndicator color="#0066FF" style={{ marginTop: 12 }} />
          ) : tasks.length === 0 ? (
            <Text style={s.empty}>No tasks yet. Add one above! 👆</Text>
          ) : (
            tasks.slice(0, 5).map(task => (
              <View key={task.id} style={[s.taskRow, task.status === 'triggered' && s.taskTriggered]}>
                <View style={[s.catDot, { backgroundColor: CAT_COLOR[task.category] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.taskText} numberOfLines={1}>{task.text}</Text>
                  <Text style={s.taskMeta}>{CAT_EMOJI[task.category]} {task.category}  ·  {task.priority}</Text>
                </View>
                <Text style={{ fontSize: 16 }}>{task.status === 'triggered' ? '✅' : task.status === 'completed' ? '🎯' : '⏳'}</Text>
              </View>
            ))
          )}
          {tasks.length > 5 && (
            <Text style={s.viewAll}>+ {tasks.length - 5} more — see Tasks tab</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F0F4FF' },
  scroll:      { flex: 1 },
  content:     { padding: 16, paddingBottom: 32 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, marginTop: 4 },
  logo:        { fontSize: 28, fontWeight: '900', color: '#1A1A2E', letterSpacing: -0.5 },
  logoSub:     { fontSize: 12, color: '#7A8BB5', fontWeight: '500', marginTop: 2 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, shadowColor: '#0066FF', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  dotActive:   { backgroundColor: '#2ECC71' },
  dotIdle:     { backgroundColor: '#CBD5E1' },
  headerBadgeText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  authBtn:     { backgroundColor: '#E0E7FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginLeft: 12 },
  authBtnText: { color: '#0066FF', fontSize: 13, fontWeight: '700' },
  warnCard:    { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FFE082' },
  warnText:    { fontSize: 12, color: '#795548', fontWeight: '500' },
  locCard:     { backgroundColor: '#E8F5FF', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#BAD3F5' },
  locLabel:    { fontSize: 11, fontWeight: '700', color: '#0066FF', marginBottom: 4 },
  locCoords:   { fontSize: 13, fontWeight: '600', color: '#1A1A2E', fontFamily: 'Courier New' },
  locAccuracy: { fontSize: 11, color: '#666', marginTop: 3 },
  statsGrid:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard:    { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statIcon:    { fontSize: 20, marginBottom: 4 },
  statVal:     { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel:   { fontSize: 10, color: '#8896B0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultCard:  { borderRadius: 12, padding: 12, marginBottom: 12, borderLeftWidth: 4 },
  resultGreen: { backgroundColor: '#E8F5E9', borderLeftColor: '#2ECC71' },
  resultRed:   { backgroundColor: '#FFEBEE', borderLeftColor: '#E74C3C' },
  resultBlue:  { backgroundColor: '#E3F2FD', borderLeftColor: '#3498DB' },
  resultText:  { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  trackRow:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 12, flex: 1 },
  btnGreen:    { backgroundColor: '#2ECC71' },
  btnRed:      { backgroundColor: '#E74C3C' },
  btnBlue:     { backgroundColor: '#0066FF' },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle:   { fontSize: 15, fontWeight: '800', color: '#1A1A2E', marginBottom: 12 },
  inputRow:    { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input:       { flex: 1, backgroundColor: '#F5F7FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1A1A2E', borderWidth: 1.5, borderColor: '#E0E4EF' },
  addBtn:      { width: 46, height: 46, backgroundColor: '#0066FF', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mlHint:      { backgroundColor: '#F0F6FF', borderRadius: 8, padding: 10, marginBottom: 10 },
  mlHintText:  { fontSize: 12, color: '#0066FF' },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip:        { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#F0F4FF', borderRadius: 20, borderWidth: 1, borderColor: '#D0DBFF' },
  chipText:    { fontSize: 12, fontWeight: '600', color: '#5571AA' },
  chipDivider: { width: 1, backgroundColor: '#E0E4EF', marginHorizontal: 4 },
  taskRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F2F8' },
  taskTriggered: { backgroundColor: '#F0FFF4', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  catDot:      { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  taskText:    { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  taskMeta:    { fontSize: 11, color: '#8896B0', marginTop: 2 },
  empty:       { color: '#AAB', textAlign: 'center', paddingVertical: 20, fontSize: 13 },
  viewAll:     { textAlign: 'center', color: '#0066FF', fontSize: 12, fontWeight: '600', marginTop: 10 },
});
