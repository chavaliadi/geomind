import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Zap } from 'lucide-react';
import SmartBundle from './SmartBundle';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const ML_URL  = 'http://localhost:5001';

const CATEGORY_COLORS = {
    grocery:  '#2ecc71',
    pharmacy: '#3498db',
    clothing: '#e67e22',
    general:  '#9b59b6',
};
const CATEGORY_EMOJI = { grocery: '🛒', pharmacy: '💊', clothing: '👕', general: '📌' };
const PRIORITY_META  = {
    high:   { emoji: '🔴', color: '#e74c3c' },
    medium: { emoji: '🟠', color: '#f39c12' },
    low:    { emoji: '🟡', color: '#f1c40f' },
};

const Dashboard = ({ tasks, stats, loading, onTasksUpdate, showToast }) => {
    /* ── Quick-Add state ───────────────────────── */
    const [quickText,   setQuickText]   = useState('');
    const [quickPri,    setQuickPri]    = useState('medium');
    const [quickCat,    setQuickCat]    = useState('general');
    const [suggested,   setSuggested]   = useState(null);
    const [predicting,  setPredicting]  = useState(false);
    const [submitting,  setSubmitting]  = useState(false);

    /* ── Scan state ────────────────────────────── */
    const [scanningId,  setScanningId]  = useState(null);
    const [scanResult,  setScanResult]  = useState({});  // { [taskId]: string }

    const notify = showToast || console.log;

    /* ── ML suggestions (debounced) ────────────── */
    useEffect(() => {
        if (quickText.trim().length < 4 || quickCat !== 'general') {
            setSuggested(null); return;
        }
        setPredicting(true);
        const t = setTimeout(async () => {
            try {
                const r = await axios.post(`${ML_URL}/predict`, { text: quickText.trim() });
                setSuggested(r.data.category);
            } catch { setSuggested(null); }
            finally  { setPredicting(false); }
        }, 500);
        return () => clearTimeout(t);
    }, [quickText, quickCat]);

    /* ── Quick-Add submit ──────────────────────── */
    const handleQuickAdd = async (e) => {
        e.preventDefault();
        if (!quickText.trim()) return;
        setSubmitting(true);
        try {
            await axios.post(`${API_URL}/tasks`, {
                text: quickText.trim(),
                priority: quickPri,
                category_override: quickCat !== 'general' ? quickCat : undefined,
            });
            setQuickText(''); setQuickPri('medium'); setQuickCat('general'); setSuggested(null);
            notify('Task created! ✅', 'success');
            if (onTasksUpdate) onTasksUpdate();
        } catch (err) {
            notify('Error creating task: ' + err.message, 'error');
        } finally { setSubmitting(false); }
    };

    /* ── Per-task trigger scan ─────────────────── */
    const triggerScan = async (task) => {
        setScanningId(task.id);
        try {
            // Use a demo coordinate (Bengaluru centre) — Phase 8B will use real location
            const lat = 12.9716, lng = 77.5946;
            const r = await axios.post(`${API_URL}/location`, { lat, lng });
            const match = r.data.batches?.find(b => b.category === task.category);
            setScanResult(prev => ({
                ...prev,
                [task.id]: match
                    ? `📍 Found: ${match.tasks[0]?.place || match.category} nearby!`
                    : '❌ No nearby match found right now.',
            }));
        } catch (err) {
            setScanResult(prev => ({ ...prev, [task.id]: '⚠️ Scan failed.' }));
        } finally { setScanningId(null); }
    };

    return (
        <div className="dashboard">

            {/* ── Smart Bundle Panel (Phase 1) ── */}
            <SmartBundle tasks={tasks} />

            {/* ── Quick Add Panel ── */}
            <div className="quick-add-panel">
                <h3 className="panel-title">⚡ Quick Add Task</h3>
                <form className="quick-form" onSubmit={handleQuickAdd}>
                    <div className="quick-input-row">
                        <div style={{ flex: 1, position: 'relative' }}>
                            <input
                                className="quick-input"
                                type="text"
                                placeholder="e.g. Buy oranges, Pick up medicine…"
                                value={quickText}
                                onChange={e => setQuickText(e.target.value)}
                            />
                            {predicting && <div className="ml-hint predicting">🧠 Analysing…</div>}
                            {suggested && !predicting && (
                                <div className="ml-hint">
                                    ✨ Suggested: <strong>{suggested}</strong>
                                    &nbsp;
                                    <button type="button" className="accept-btn"
                                        onClick={() => setQuickCat(suggested)}>
                                        Accept
                                    </button>
                                </div>
                            )}
                        </div>
                        <select className="quick-select" value={quickPri} onChange={e => setQuickPri(e.target.value)}>
                            {['high', 'medium', 'low'].map(p =>
                                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                            )}
                        </select>
                        <select className="quick-select" value={quickCat} onChange={e => setQuickCat(e.target.value)}>
                            {['general', 'grocery', 'pharmacy', 'clothing'].map(c =>
                                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                            )}
                        </select>
                        <button className="quick-submit" type="submit" disabled={submitting || !quickText.trim()}>
                            <Plus size={16} />
                            {submitting ? 'Adding…' : 'Add Task'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── Main Grid ── */}
            <div className="dashboard-grid">

                {/* Stats */}
                <div className="stats-section">
                    <h2>Overview</h2>
                    <div className="stats-grid">
                        {[
                            { label: 'Total Tasks',     value: stats.totalTasks,     icon: '📋' },
                            { label: 'Pending',         value: stats.pendingTasks,   icon: '⏳' },
                            { label: 'Completed',       value: stats.completedTasks, icon: '✅' },
                            {
                                label: 'Completion Rate',
                                value: `${stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%`,
                                icon: '📊',
                            },
                        ].map(s => (
                            <div className="stat-card" key={s.label}>
                                <div className="stat-icon">{s.icon}</div>
                                <div className="stat-content">
                                    <div className="stat-label">{s.label}</div>
                                    <div className="stat-value">{s.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Tasks with per-task Scan button */}
                <div className="recent-tasks-section">
                    <h2>Recent Tasks</h2>
                    {loading ? (
                        <div className="skeleton-list">
                            {[1,2,3].map(i => (
                                <div key={i} className="skeleton-task">
                                    <div className="skeleton-circle" />
                                    <div className="skeleton-lines">
                                        <div className="skeleton-line skeleton-line-long" />
                                        <div className="skeleton-line skeleton-line-short" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="empty-state">
                            <p>📭 No tasks yet. Use Quick Add above!</p>
                        </div>
                    ) : (
                        <div className="tasks-list">
                            {tasks.slice(0, 8).map(task => {
                                const cat  = task.category  || 'general';
                                const pri  = task.priority  || 'medium';
                                const badge = PRIORITY_META[pri];
                                const isTriggered = task.status === 'triggered';

                                return (
                                    <div key={task.id} className={`task-item ${isTriggered ? 'triggered' : ''}`}>
                                        <div className="task-status">{isTriggered ? '✅' : '⏳'}</div>
                                        <div className="task-details">
                                            <div className="task-text">{task.raw_text || task.text}</div>
                                            <div className="task-meta">
                                                <span className="category-badge"
                                                    style={{ background: CATEGORY_COLORS[cat] }}>
                                                    {CATEGORY_EMOJI[cat]} {cat}
                                                </span>
                                                <span className="priority-badge"
                                                    style={{ background: badge.color }}>
                                                    {badge.emoji} {pri.toUpperCase()}
                                                </span>
                                                {task.triggered_at && (
                                                    <span className="triggered-time">
                                                        {new Date(task.triggered_at).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                            {scanResult[task.id] && (
                                                <div className="scan-result">{scanResult[task.id]}</div>
                                            )}
                                        </div>
                                        <button
                                            className="scan-btn"
                                            onClick={() => triggerScan(task)}
                                            disabled={scanningId === task.id}
                                            title="Scan for nearby places"
                                        >
                                            {scanningId === task.id
                                                ? <span className="spin">⏳</span>
                                                : <><Zap size={13} /> Scan</>
                                            }
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Category Distribution */}
                <div className="category-section">
                    <h2>Tasks by Category</h2>
                    <div className="category-list">
                        {['grocery', 'pharmacy', 'clothing', 'general'].map(cat => {
                            const count = tasks.filter(t => t.category === cat).length;
                            const pct   = tasks.length > 0 ? (count / tasks.length) * 100 : 0;
                            return (
                                <div key={cat} className="category-item">
                                    <div className="category-info">
                                        <span className="category-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                                        <span className="category-name">{cat}</span>
                                    </div>
                                    <div className="category-bar">
                                        <div className="category-progress"
                                            style={{ width: `${pct}%`, background: CATEGORY_COLORS[cat] }} />
                                    </div>
                                    <span className="category-count">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Priority Distribution */}
                <div className="priority-section">
                    <h2>Tasks by Priority</h2>
                    <div className="priority-list">
                        {['high', 'medium', 'low'].map(pri => {
                            const count = tasks.filter(t => (t.priority || 'medium') === pri).length;
                            const meta  = PRIORITY_META[pri];
                            return (
                                <div key={pri} className="priority-item">
                                    <span className="priority-emoji">{meta.emoji}</span>
                                    <div className="priority-info">
                                        <span className="priority-label">{pri.toUpperCase()}</span>
                                        <span className="priority-count">{count} tasks</span>
                                    </div>
                                    <div className="priority-bar-wrap">
                                        <div className="priority-bar"
                                            style={{
                                                width: `${tasks.length > 0 ? (count / tasks.length) * 100 : 0}%`,
                                                background: meta.color
                                            }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
