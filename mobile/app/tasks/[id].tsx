import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  SafeAreaView, StyleSheet, StatusBar, Linking, Modal, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { fetchTasks, markTaskComplete, sendMLFeedback, Task } from '../../services/api';
import { fetchNearbyPlaces, NearbyPlace } from '../../services/overpass';
import { fetchRoute, formatDist, formatTime, RouteResult } from '../../services/routing';

const CAT_COLOR: Record<string, string> = {
  grocery: '#2ECC71', pharmacy: '#3498DB', clothing: '#E67E22', general: '#9B59B6',
};
const CAT_EMOJI: Record<string, string> = {
  grocery: '🛒', pharmacy: '💊', clothing: '👕', general: '📌',
};
const PRI_COLOR: Record<string, string> = { high: '#E74C3C', medium: '#F39C12', low: '#95A5A6' };

const renderMap = (lat: number, lng: number, name: string, userLat?: number, userLng?: number) => {
  const mapHtml = `
  <!DOCTYPE html>
  <html>
  <head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { height: 100vh; width: 100vw; }
  </style>
  </head>
  <body>
  <div id="map"></div>
  <script>
    var map = L.map('map');
    var bounds = [];
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
    
    var dst = L.marker([${lat}, ${lng}]).addTo(map).bindPopup("<b>${name}</b>").openPopup();
    bounds.push([${lat}, ${lng}]);

    ${userLat && userLng ? `
      var src = L.circleMarker([${userLat}, ${userLng}], {color: '#0066FF', radius: 8, fillOpacity: 1}).addTo(map).bindPopup("<b>You</b>");
      bounds.push([${userLat}, ${userLng}]);
    ` : ''}

    map.fitBounds(bounds, { padding: [30, 30] });
  </script>
  </body>
  </html>
  `;
  return (
    <View style={{ height: 220, width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 14, borderWidth: 1, borderColor: '#2176FF' }}>
      <WebView originWhitelist={['*']} source={{ html: mapHtml }} style={{ flex: 1 }} scrollEnabled={false} />
    </View>
  );
};

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [task, setTask]                 = useState<Task | null>(null);
  const [taskLoading, setTaskLoading]   = useState(true);

  // Location
  const [position, setPosition]         = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading]     = useState(false);

  // Scan
  const [places, setPlaces]             = useState<NearbyPlace[]>([]);
  const [scanning, setScanning]         = useState(false);

  // Route
  const [activeIdx, setActiveIdx]       = useState(0);
  const [routeCache, setRouteCache]     = useState<Record<number, RouteResult | null>>({});
  const [routeLoading, setRouteLoading] = useState(false);
  const [chosenIdx, setChosenIdx]       = useState<number | null>(null);

  // Done + rating modal
  const [showDoneModal, setShowDoneModal] = useState(false);
  const [rating, setRating]               = useState(0);
  const [hoverRating, setHoverRating]     = useState(0);
  const [submitting, setSubmitting]       = useState(false);

  // Load task
  useEffect(() => {
    fetchTasks()
      .then(all => { const found = all.find(t => t.id === id); setTask(found || null); })
      .catch(() => setTask(null))
      .finally(() => setTaskLoading(false));

    // Try to get GPS immediately on mount
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, [id]);

  const getLiveGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission', 'Location permission denied'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setPlaces([]); setRouteCache({}); setActiveIdx(0); setChosenIdx(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('GPS Error', e.message); }
    finally { setGpsLoading(false); }
  };

  const scanNearby = async () => {
    if (!task) return;
    if (!position) { Alert.alert('Location', 'Enable GPS first or use "Use Live GPS"'); return; }
    setScanning(true); setPlaces([]); setRouteCache({}); setActiveIdx(0); setChosenIdx(null);
    try {
      const found = await fetchNearbyPlaces(position.lat, position.lng, task.category, task.radius_meters || 2000);
      setPlaces(found);
      if (found.length > 0) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // Auto-route to store #1
        const route = await fetchRoute(position, { lat: found[0].lat, lng: found[0].lng });
        setRouteCache({ 0: route });
      }
    } catch (err: any) { Alert.alert('Scan Failed', err.message); }
    finally { setScanning(false); }
  };

  const handleStoreSelect = async (idx: number) => {
    setActiveIdx(idx);
    if (routeCache[idx] !== undefined || !position || !places[idx]) return;
    setRouteLoading(true);
    try {
      const route = await fetchRoute(position, { lat: places[idx].lat, lng: places[idx].lng });
      setRouteCache(prev => ({ ...prev, [idx]: route }));
    } catch {} finally { setRouteLoading(false); }
  };

  const handleChooseRoute = async () => {
    setChosenIdx(activeIdx);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openMaps = (place: NearbyPlace) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=driving`;
    Linking.openURL(url);
  };

  const handleMarkDone = async () => {
    if (rating === 0) { Alert.alert('Rating', 'Please give a star rating'); return; }
    if (!task) return;
    setSubmitting(true);
    try {
      const store = places[chosenIdx ?? activeIdx] || null;
      await markTaskComplete(task.id, store?.name || null, rating);
      await sendMLFeedback(task.id, task.text, task.category, store?.name || null, rating);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDoneModal(false);
      Alert.alert('🎉 Task Done!', `Rating (${rating}⭐) sent to ML. Great job!`, [
        { text: 'Back to Tasks', onPress: () => router.back() },
      ]);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  if (taskLoading) return (
    <SafeAreaView style={s.safe}>
      <ActivityIndicator size="large" color="#0066FF" style={{ flex: 1 }} />
    </SafeAreaView>
  );

  if (!task) return (
    <SafeAreaView style={s.safe}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: '#888' }}>Task not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.btnBack}>
          <Text style={{ color: '#0066FF', fontWeight: '700' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const cat   = task.category;
  const activeRoute = routeCache[activeIdx];
  const isChosen = chosenIdx !== null;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F4FF" />

      {/* ── Done Modal ── */}
      <Modal visible={showDoneModal} transparent animationType="slide" onRequestClose={() => setShowDoneModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>🎉 Task Complete!</Text>
            <Text style={s.modalSubtitle}>Rate your experience at{'\n'}<Text style={{ fontWeight: '800', color: '#1A1A2E' }}>{places[chosenIdx ?? activeIdx]?.name || 'the store'}</Text></Text>

            <View style={s.starsRow}>
              {[1,2,3,4,5].map(star => (
                <TouchableOpacity key={star} onPress={() => { setRating(star); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                  <Ionicons
                    name={star <= (hoverRating || rating) ? 'star' : 'star-outline'}
                    size={40}
                    color={star <= (hoverRating || rating) ? '#F39C12' : '#D0D8E8'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.ratingLabel}>{
              rating === 0 ? 'Tap a star to rate' :
              rating === 1 ? '😞 Poor — helped us improve' :
              rating === 2 ? '😐 Below average' :
              rating === 3 ? '🙂 OK match' :
              rating === 4 ? '😊 Good recommendation!' :
              '🌟 Perfect — ML will learn from this!'
            }</Text>

            <TouchableOpacity style={[s.btnDone, rating === 0 && { opacity: 0.4 }]} onPress={handleMarkDone} disabled={submitting || rating === 0}>
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={s.btnDoneText}>Submit & Complete</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDoneModal(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: '#AAB', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* ── Back + Status bar ── */}
        <View style={s.topRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color="#0066FF" />
            <Text style={s.backText}>Tasks</Text>
          </TouchableOpacity>
          <View style={[s.statusBadge, {
            backgroundColor:
              isChosen ? '#FEF3CD' :
              task.status === 'triggered' ? '#E8F5E9' : '#EEF0FF',
          }]}>
            <Text style={s.statusText}>
              {isChosen ? '🗺️ Route Chosen' : task.status === 'triggered' ? '✅ Triggered' : '⏳ Pending'}
            </Text>
          </View>
          {isChosen && (
            <TouchableOpacity style={s.doneHeaderBtn} onPress={() => setShowDoneModal(true)}>
              <Ionicons name="checkmark-circle" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Task card ── */}
        <View style={s.taskCard}>
          <View style={s.taskCardRow}>
            <View style={[s.catPill, { backgroundColor: CAT_COLOR[cat] }]}>
              <Text style={s.catPillText}>{CAT_EMOJI[cat]} {cat}</Text>
            </View>
            <View style={[s.priPill, { backgroundColor: PRI_COLOR[task.priority] }]}>
              <Text style={s.priPillText}>{task.priority.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={s.taskTitle}>{task.text}</Text>
          <View style={s.taskMetaRow}>
            <Text style={s.taskMeta}>📍 {formatDist(task.radius_meters || 2000)} radius</Text>
            <Text style={s.taskMeta}>🗓 {new Date(task.created_at).toLocaleDateString()}</Text>
          </View>
        </View>

        {/* ── Chosen route banner ── */}
        {isChosen && places[chosenIdx!] && (
          <View style={s.chosenBanner}>
            <Text style={s.chosenText}>🗺️ Heading to <Text style={{ fontWeight: '800' }}>{places[chosenIdx!].name}</Text></Text>
            <Text style={s.chosenDist}>📍 {formatDist(places[chosenIdx!].distance)}</Text>
          </View>
        )}

        {/* ── GPS + Scan bar ── */}
        <View style={s.scanBar}>
          <TouchableOpacity style={[s.gpsBtn, gpsLoading && { opacity: 0.6 }]} onPress={getLiveGPS} disabled={gpsLoading}>
            {gpsLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="navigate" size={14} color="#fff" />}
            <Text style={s.gpsBtnText}>{gpsLoading ? 'Getting GPS…' : '📡 Live GPS'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.scanBtn, (scanning || !position) && { opacity: 0.55 }]} onPress={scanNearby} disabled={scanning || !position}>
            {scanning ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={14} color="#fff" />}
            <Text style={s.scanBtnText}>{scanning ? 'Scanning…' : 'Scan Stores'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Location Presets ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.presetsWrap} contentContainerStyle={s.presetsContent}>
          {[
            { label: '📍 Bengaluru', lat: 12.9716, lng: 77.5946 },
            { label: '📍 Prayagraj', lat: 25.4322, lng: 81.7707 },
            { label: '📍 Divyasree Omega', lat: 17.45889, lng: 78.37302 },
            { label: '📍 Mumbai', lat: 19.0760, lng: 72.8777 },
            { label: '📍 Delhi', lat: 28.6139, lng: 77.2090 },
          ].map(p => (
            <TouchableOpacity key={p.label} style={s.presetBtn} onPress={() => {
              setPosition({ lat: p.lat, lng: p.lng });
              setPlaces([]); setRouteCache({}); setActiveIdx(0); setChosenIdx(null);
            }}>
              <Text style={s.presetBtnText}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.posRow}>
          {position ? (
            <Text style={s.posLabel}>Active: {position.lat.toFixed(4)}, {position.lng.toFixed(4)}</Text>
          ) : !gpsLoading && (
            <Text style={s.posWarn}>⚠️ Tap "Live GPS" or a Preset above</Text>
          )}
        </View>

        {/* ── Store results ── */}
        {places.length > 0 && (
          <View style={s.storesCard}>
            <View style={s.storesHeader}>
              <Text style={s.storesTitle}>Nearby {cat} Stores</Text>
              <Text style={s.storesHint}>Tap store → choose route</Text>
            </View>

            {/* 🔥 Web Parity Leaflet Map 🔥 */}
            {places[activeIdx] && renderMap(places[activeIdx].lat, places[activeIdx].lng, places[activeIdx].name, position?.lat, position?.lng)}

            {places.map((pl, i) => (
              <TouchableOpacity
                key={pl.id || i}
                style={[s.storeRow, activeIdx === i && s.storeRowActive, chosenIdx === i && s.storeRowChosen]}
                onPress={() => handleStoreSelect(i)}
                activeOpacity={0.8}
              >
                {/* Rank circle */}
                <View style={[s.storeNum, {
                  backgroundColor: chosenIdx === i ? '#F39C12' : activeIdx === i ? CAT_COLOR[cat] : '#EEF0FF',
                }]}>
                  <Text style={[s.storeNumText, (activeIdx === i || chosenIdx === i) && { color: '#fff' }]}>
                    {chosenIdx === i ? '✓' : i + 1}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.storeName} numberOfLines={1}>{pl.name}</Text>
                  <Text style={s.storeType}>{pl.type}{pl.opening ? ` · 🕐 ${pl.opening}` : ''}</Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.storeDist}>📍 {formatDist(pl.distance)}</Text>
                  {chosenIdx === i && <Text style={s.chosenTag}>Chosen</Text>}
                  {activeIdx === i && chosenIdx !== i && <Text style={s.activeTag}>Active</Text>}
                  <TouchableOpacity onPress={() => openMaps(pl)} style={s.mapsBtn}>
                    <Ionicons name="navigate-circle-outline" size={13} color="#0066FF" />
                    <Text style={s.mapsBtnText}>Maps</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}

            {/* Route info bar */}
            {(activeRoute !== undefined) && (
              <View style={[s.routeBar, chosenIdx === activeIdx && s.routeBarChosen]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.routeBarTitle}>🚗 {places[activeIdx]?.name}</Text>
                  <View style={s.pillsRow}>
                    {activeRoute ? (
                      <>
                        <View style={s.pill}><Text style={s.pillText}>📍 {formatDist(activeRoute.distanceTotal)}</Text></View>
                        <View style={s.pill}><Text style={s.pillText}>⏱ ~{formatTime(activeRoute.durationTotal)}</Text></View>
                      </>
                    ) : routeLoading ? (
                      <ActivityIndicator size="small" color="#0066FF" />
                    ) : (
                      <Text style={s.routeNA}>Route unavailable</Text>
                    )}
                  </View>
                </View>

                {chosenIdx !== activeIdx ? (
                  <TouchableOpacity style={s.chooseBtn} onPress={handleChooseRoute}>
                    <Text style={s.chooseBtnText}>✅ Choose</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.markDoneBtn} onPress={() => setShowDoneModal(true)}>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={s.markDoneBtnText}>Mark Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Giant Open In Maps Button for active/chosen store */}
            {places[activeIdx] && (
              <TouchableOpacity style={s.btnBigMaps} onPress={() => openMaps(places[activeIdx])}>
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={s.btnBigMapsText}>Open in Google Maps</Text>
              </TouchableOpacity>
            )}

            {routeLoading && activeRoute === undefined && (
              <View style={[s.routeBar, { justifyContent: 'center' }]}>
                <ActivityIndicator size="small" color="#0066FF" />
                <Text style={{ marginLeft: 8, color: '#888', fontSize: 13 }}>Computing route…</Text>
              </View>
            )}
          </View>
        )}

        {/* ── No stores empty state ── */}
        {places.length === 0 && !scanning && (
          <View style={s.emptyStores}>
            <Text style={s.emptyIcon}>{CAT_EMOJI[cat]}</Text>
            <Text style={s.emptyTitle}>No stores scanned yet</Text>
            <Text style={s.emptyText}>Enable GPS then tap "Scan Stores" to find up to 5 nearby {cat} stores</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#F0F4FF' },
  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 40 },

  // Back row
  topRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  backBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, gap: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  backText: { fontSize: 13, fontWeight: '700', color: '#0066FF' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText:  { fontSize: 12, fontWeight: '700', color: '#1A1A2E' },
  doneHeaderBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F39C12', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  btnBack:  { marginTop: 12, padding: 12 },

  // Task card
  taskCard:    { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  taskCardRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  catPill:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catPillText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  priPill:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  priPillText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  taskTitle:   { fontSize: 20, fontWeight: '800', color: '#1A1A2E', marginBottom: 10 },
  taskMetaRow: { flexDirection: 'row', gap: 16 },
  taskMeta:    { fontSize: 12, color: '#8896B0', fontWeight: '600' },

  // Chosen banner
  chosenBanner: { backgroundColor: '#FEF3CD', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1.5, borderColor: '#F39C12', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chosenText: { fontSize: 13, fontWeight: '600', color: '#856404', flex: 1 },
  chosenDist: { fontSize: 13, fontWeight: '700', color: '#856404' },

  // Scan bar
  // Scan bar & Presets
  scanBar:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
  gpsBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2ECC71', paddingVertical: 12, borderRadius: 12, flex: 1 },
  gpsBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scanBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0066FF', paddingVertical: 12, borderRadius: 12, flex: 1 },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  presetsWrap: { marginBottom: 10, marginHorizontal: -16 },
  presetsContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  presetBtn: { backgroundColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  presetBtnText: { fontSize: 13, fontWeight: '700', color: '#475569' },

  posRow:   { marginBottom: 16, alignItems: 'center' },
  posLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  posWarn:  { fontSize: 13, color: '#E67E22', fontWeight: '700' },

  // Stores
  storesCard:   { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  storesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  storesTitle:  { fontSize: 15, fontWeight: '800', color: '#1A1A2E' },
  storesHint:   { fontSize: 11, color: '#B0BAC9', fontStyle: 'italic' },

  storeRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0F2F8' },
  storeRowActive: { backgroundColor: '#F0F6FF', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10, borderColor: '#0066FF', borderWidth: 1.5, borderBottomWidth: 1.5 },
  storeRowChosen: { backgroundColor: '#FFFBF0', borderColor: '#F39C12', borderWidth: 1.5, borderBottomWidth: 1.5, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  storeNum:     { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  storeNumText: { fontSize: 13, fontWeight: '800', color: '#5571AA' },
  storeName:    { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  storeType:    { fontSize: 11, color: '#8896B0', marginTop: 2 },
  storeDist:    { fontSize: 12, fontWeight: '700', color: '#0066FF' },
  chosenTag:    { fontSize: 10, fontWeight: '700', color: '#856404', backgroundColor: '#FEF3CD', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  activeTag:    { fontSize: 10, fontWeight: '700', color: '#0066FF', backgroundColor: '#EEF4FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  mapsBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mapsBtnText:  { fontSize: 11, color: '#0066FF', fontWeight: '600' },

  // Route bar
  routeBar:     { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 10, padding: 12, backgroundColor: '#F0F6FF', borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#0066FF', gap: 10 },
  routeBarChosen: { backgroundColor: '#FFFBF0', borderLeftColor: '#F39C12' },
  routeBarTitle:{ fontSize: 14, fontWeight: '800', color: '#1A1A2E' },
  pillsRow:     { flexDirection: 'row', gap: 6, marginTop: 4 },
  pill:         { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: '#D0E0FF' },
  pillText:     { fontSize: 12, fontWeight: '700', color: '#0066FF' },
  routeNA:      { fontSize: 12, color: '#AAB', fontStyle: 'italic' },
  chooseBtn:    { backgroundColor: '#2ECC71', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  chooseBtnText:{ color: '#fff', fontWeight: '800', fontSize: 13 },
  markDoneBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F39C12', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  markDoneBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  btnBigMaps:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 14, marginTop: 4, shadowColor: '#3B82F6', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  btnBigMapsText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Empty
  emptyStores:  { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:    { fontSize: 40, marginBottom: 10 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 6 },
  emptyText:    { fontSize: 13, color: '#8896B0', textAlign: 'center', paddingHorizontal: 24 },

  // Modal
  modalBg:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40 },
  modalTitle:{ fontSize: 24, fontWeight: '900', color: '#1A1A2E', textAlign: 'center', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  starsRow:  { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 },
  ratingLabel: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 22, minHeight: 20 },
  btnDone:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0066FF', paddingVertical: 14, borderRadius: 14 },
  btnDoneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
