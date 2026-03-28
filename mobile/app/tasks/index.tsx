import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  SafeAreaView, RefreshControl, StyleSheet, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { fetchTasks, deleteTask, Task } from '../../services/api';

const CAT_COLOR: Record<string, string> = {
  grocery: '#2ECC71', pharmacy: '#3498DB', clothing: '#E67E22', general: '#9B59B6',
};
const CAT_EMOJI: Record<string, string> = {
  grocery: '🛒', pharmacy: '💊', clothing: '👕', general: '📌',
};
const PRI_COLOR: Record<string, string> = { high: '#E74C3C', medium: '#F39C12', low: '#95A5A6' };

type Filter = 'all' | 'pending' | 'triggered' | 'completed';

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [filter, setFilter]           = useState<Filter>('all');
  const [deleting, setDeleting]       = useState<string | null>(null);

  // Multi-select state
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting]   = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { const t = await fetchTasks(); setTasks(t); }
    catch (e: any) {
      if (!isRefresh) Alert.alert('Load Error', e.message || 'Could not load tasks');
    }
    finally { setRefreshing(false); setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = tasks.filter(t => filter === 'all' || t.status === filter);

  // ── Selection helpers ──
  const toggleSelect = (id: string) => {
    const next = new Set(selectedTasks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedTasks(next);
  };

  const toggleSelectAll = () => {
    if (selectedTasks.size === filtered.length && filtered.length > 0) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filtered.map(t => t.id)));
    }
  };

  const clearSelection = () => setSelectedTasks(new Set());

  const isAllSelected = selectedTasks.size === filtered.length && filtered.length > 0;

  // ── Bulk delete ──
  const handleBulkDelete = () => {
    const count = selectedTasks.size;
    if (count === 0) return;
    Alert.alert(
      'Delete Tasks',
      `Delete ${count} selected task${count > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${count}`, style: 'destructive',
          onPress: async () => {
            setBulkDeleting(true);
            try {
              for (const id of selectedTasks) {
                await deleteTask(id);
              }
              setTasks(prev => prev.filter(t => !selectedTasks.has(t.id)));
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Done', `${count} task${count > 1 ? 's' : ''} deleted.`);
              setSelectedTasks(new Set());
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete some tasks');
            } finally { setBulkDeleting(false); }
          },
        },
      ]
    );
  };

  // ── Single delete ──
  const handleDelete = (task: Task) => {
    Alert.alert('Delete Task', `Delete "${task.text}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(task.id);
          try {
            await deleteTask(task.id);
            setTasks(prev => prev.filter(t => t.id !== task.id));
            selectedTasks.delete(task.id);
            setSelectedTasks(new Set(selectedTasks));
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {} finally { setDeleting(null); }
        },
      },
    ]);
  };

  const handleTap = (task: Task) => {
    router.push(`/tasks/${task.id}` as any);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F4FF" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>📋 My Tasks</Text>
        <Text style={s.headerCount}>{tasks.length} total</Text>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {(['all','pending','triggered','completed'] as Filter[]).map(f => (
          <TouchableOpacity key={f} style={[s.filterChip, filter === f && s.filterChipActive]} onPress={() => { setFilter(f); clearSelection(); }}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {' '}({tasks.filter(t => f === 'all' || t.status === f).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Selection Action Bar ── */}
      {selectedTasks.size > 0 && (
        <View style={s.selectionBar}>
          <Text style={s.selectionText}>
            {selectedTasks.size} selected
          </Text>
          <View style={s.selectionActions}>
            <TouchableOpacity style={s.selBtnDanger} onPress={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="trash" size={14} color="#fff" />
              }
              <Text style={s.selBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.selBtnGhost} onPress={clearSelection}>
              <Ionicons name="close" size={14} color="#666" />
              <Text style={s.selBtnGhostText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Select All Row ── */}
      {!loading && filtered.length > 0 && (
        <TouchableOpacity style={s.selectAllRow} onPress={toggleSelectAll} activeOpacity={0.7}>
          <Ionicons
            name={isAllSelected ? 'checkbox' : 'square-outline'}
            size={22}
            color={isAllSelected ? '#0066FF' : '#B0BAC9'}
          />
          <Text style={s.selectAllText}>
            {isAllSelected ? 'Deselect All' : 'Select All'} ({filtered.length})
          </Text>
        </TouchableOpacity>
      )}

      {/* List */}
      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#0066FF" />}
      >
        {loading ? (
          <ActivityIndicator color="#0066FF" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyTitle}>No tasks here</Text>
            <Text style={s.emptyText}>Add tasks from the Home tab</Text>
          </View>
        ) : (
          filtered.map(task => {
            const isSelected = selectedTasks.has(task.id);
            return (
              <TouchableOpacity
                key={task.id}
                style={[
                  s.taskCard,
                  task.status === 'triggered' && s.taskTriggered,
                  task.status === 'completed' && s.taskDone,
                  isSelected && s.taskSelected,
                ]}
                onPress={() => handleTap(task)}
                onLongPress={() => { toggleSelect(task.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                activeOpacity={0.85}
              >
                {/* Left accent */}
                <View style={[s.taskAccent, { backgroundColor: CAT_COLOR[task.category] }]} />

                <View style={s.taskBody}>
                  <View style={s.taskTop}>
                    {/* Checkbox */}
                    <TouchableOpacity
                      style={s.checkbox}
                      onPress={() => { toggleSelect(task.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? '#0066FF' : '#CBD5E1'}
                      />
                    </TouchableOpacity>

                    <Text style={s.taskText} numberOfLines={2}>{task.text}</Text>
                    <View style={s.statusBadge}>
                      <Text style={s.statusText}>
                        {task.status === 'triggered' ? '✅' : task.status === 'completed' ? '🎯' : '⏳'}
                      </Text>
                    </View>
                  </View>

                  <View style={s.taskMeta}>
                    <View style={[s.badge, { backgroundColor: CAT_COLOR[task.category] + '20' }]}>
                      <Text style={[s.badgeText, { color: CAT_COLOR[task.category] }]}>{CAT_EMOJI[task.category]} {task.category}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: PRI_COLOR[task.priority] + '20' }]}>
                      <Text style={[s.badgeText, { color: PRI_COLOR[task.priority] }]}>{task.priority.toUpperCase()}</Text>
                    </View>
                    <Text style={s.taskDate}>{new Date(task.created_at).toLocaleDateString()}</Text>
                  </View>

                  {task.status !== 'completed' && (
                    <View style={s.taskActions}>
                      <TouchableOpacity style={s.btnDetail} onPress={() => handleTap(task)}>
                        <Ionicons name="map-outline" size={14} color="#0066FF" />
                        <Text style={s.btnDetailText}>View & Scan</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnDelete} onPress={() => handleDelete(task)} disabled={deleting === task.id}>
                        {deleting === task.id
                          ? <ActivityIndicator size="small" color="#E74C3C" />
                          : <Ionicons name="trash-outline" size={14} color="#E74C3C" />}
                      </TouchableOpacity>
                    </View>
                  )}

                  {task.status === 'completed' && (
                    <Text style={s.completedText}>🎯 Completed</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: '#F0F4FF' },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  headerTitle:{ fontSize: 22, fontWeight: '800', color: '#1A1A2E' },
  headerCount:{ fontSize: 13, fontWeight: '600', color: '#8896B0' },

  filterBar:   { flexGrow: 0 },
  filterContent:{ paddingHorizontal: 14, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  filterChip:  { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E4EF' },
  filterChipActive: { backgroundColor: '#0066FF', borderColor: '#0066FF' },
  filterText:  { fontSize: 12, fontWeight: '600', color: '#5571AA' },
  filterTextActive: { color: '#fff' },

  // Selection bar
  selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EEF4FF', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#D0DBFF' },
  selectionText: { fontSize: 14, fontWeight: '700', color: '#0066FF' },
  selectionActions: { flexDirection: 'row', gap: 8 },
  selBtnDanger: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E74C3C', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  selBtnText:   { color: '#fff', fontWeight: '700', fontSize: 12 },
  selBtnGhost:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#D0DBFF' },
  selBtnGhostText: { color: '#666', fontWeight: '600', fontSize: 12 },

  // Select all
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E8ECF4' },
  selectAllText: { fontSize: 13, fontWeight: '600', color: '#5571AA' },

  list:        { flex: 1 },
  listContent: { padding: 14, gap: 10 },

  emptyState:  { alignItems: 'center', paddingTop: 60 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  emptyText:   { fontSize: 13, color: '#8896B0' },

  taskCard:    { backgroundColor: '#fff', borderRadius: 14, flexDirection: 'row', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  taskTriggered: { backgroundColor: '#F0FFF4' },
  taskDone:    { opacity: 0.65 },
  taskSelected: { backgroundColor: '#EEF4FF', borderWidth: 1.5, borderColor: '#0066FF' },
  taskAccent:  { width: 5, flexShrink: 0 },
  taskBody:    { flex: 1, padding: 14 },
  taskTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  checkbox:    { paddingRight: 4 },
  taskText:    { flex: 1, fontSize: 14, fontWeight: '700', color: '#1A1A2E', lineHeight: 20 },
  statusBadge: { flexShrink: 0 },
  statusText:  { fontSize: 18 },

  taskMeta:    { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 10 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:   { fontSize: 11, fontWeight: '700' },
  taskDate:    { fontSize: 11, color: '#B0BAC9', marginLeft: 'auto' },

  taskActions:    { flexDirection: 'row', gap: 8 },
  btnDetail:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#EEF4FF', borderRadius: 8 },
  btnDetailText:  { fontSize: 12, fontWeight: '700', color: '#0066FF' },
  btnDelete:      { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F0', borderRadius: 8 },
  completedText:  { fontSize: 12, color: '#2ECC71', fontWeight: '600' },
});
