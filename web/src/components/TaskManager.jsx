/* TaskManager.js */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Trash2, Plus, Edit2, Check, X, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import './TaskManager.css';

// Uses apiUrl + onTasksUpdate + showToast props from App.jsx
export default function TaskManager({ onTasksUpdate, apiUrl, showToast }) {
    const API_URL = apiUrl || process.env.REACT_APP_API_URL || 'http://localhost:3000';
    const notify = showToast || ((msg, type) => type === 'error' ? console.error(msg) : console.log(msg));
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [formData, setFormData] = useState({
        text: '',
        priority: 'medium',
        category: 'general',
        radius_meters: 1000,
    });
    
    const navigate = useNavigate();

    const [selectedTasks, setSelectedTasks] = useState(new Set());
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);
    const [suggestedCategory, setSuggestedCategory] = useState(null);
    const [isPredicting, setIsPredicting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});
    const [scanningId, setScanningId] = useState(null);
    const [scanResults, setScanResults] = useState({});

    const CATEGORIES = ['general', 'grocery', 'pharmacy', 'clothing'];
    const PRIORITIES = ['high', 'medium', 'low'];

    // Fetch tasks
    const fetchTasks = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/api/tasks`);
            setTasks(response.data || []);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        } finally {
            setLoading(false);
        }
    }, [API_URL]);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 10000);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    // ML Category Prediction (Phase 7E)
    useEffect(() => {
        const textToPredict = formData.text.trim();
        if (textToPredict.length > 3 && formData.category === 'general') {
            setIsPredicting(true);
            const timeoutId = setTimeout(async () => {
                try {
                    const response = await axios.post('http://localhost:5001/predict', { text: textToPredict });
                    setSuggestedCategory(response.data.category);
                } catch (error) {
                    console.error("ML Prediction failed:", error);
                    setSuggestedCategory(null);
                } finally {
                    setIsPredicting(false);
                }
            }, 500);
            return () => clearTimeout(timeoutId);
        } else {
            setSuggestedCategory(null);
            setIsPredicting(false);
        }
    }, [formData.text, formData.category]);

    // Reset form
    const resetForm = () => {
        setFormData({ text: '', priority: 'medium', category: 'general', radius_meters: 1000 });
        setSuggestedCategory(null);
        setFormOpen(false);
    };

    // Add/Update task
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.text.trim()) {
            notify('Task text is required', 'error');
            return;
        }

        try {
            const payload = {
                text: formData.text.trim(),
                priority: formData.priority,
                category_override: formData.category !== 'general' ? formData.category : undefined,
                radius_meters: formData.radius_meters,
            };

            const response = await axios.post(`${API_URL}/tasks`, payload);

            // Phase 7E: Feedback Loop - Check if user corrected the ML suggestion
            if (suggestedCategory && formData.category !== 'general' && formData.category !== suggestedCategory) {
                try {
                    await axios.post('http://localhost:5001/feedback', {
                        text: formData.text.trim(),
                        predicted: suggestedCategory,
                        corrected: formData.category
                    });
                    console.log(`Sent feedback: Corrected ${suggestedCategory} -> ${formData.category}`);
                } catch (feedbackErr) {
                    console.error("Failed to send ML feedback", feedbackErr);
                }
            }

            // Add to local state
            setTasks([response.data, ...tasks]);
            resetForm();
            if (onTasksUpdate) onTasksUpdate(); // sync App.jsx
            notify('Task created successfully!', 'success');
        } catch (error) {
            notify('Error creating task: ' + error.message, 'error');
        }
    };

    // Edit task inline
    const handleEditStart = (task) => {
        setEditingId(task.id);
        setEditData({ text: task.raw_text || task.text, priority: task.priority, category: task.category });
    };

    const handleSaveEdit = async (taskId) => {
        try {
            // We PATCH via a delete + re-insert pattern since backend has no PUT yet
            await axios.delete(`${API_URL}/api/tasks/${taskId}`);
            const response = await axios.post(`${API_URL}/tasks`, {
                text: editData.text,
                priority: editData.priority,
                category_override: editData.category,
            });
            setTasks(prev => prev.map(t => t.id === taskId ? response.data : t));
            setEditingId(null);
            if (onTasksUpdate) onTasksUpdate();
            notify('Task updated!', 'success');
        } catch (err) {
            notify('Error updating task: ' + err.message, 'error');
        }
    };

    // Per-task scan
    const triggerScan = async (task) => {
        setScanningId(task.id);
        try {
            const lat = 12.9716, lng = 77.5946; // Bengaluru default; Phase 8B = real GPS
            const r = await axios.post(`${API_URL}/location`, { lat, lng });
            const match = r.data.batches?.find(b => b.category === task.category);
            setScanResults(prev => ({
                ...prev,
                [task.id]: match
                    ? `📍 ${match.tasks[0]?.place || 'Match'} found nearby!`
                    : '❌ No nearby match.',
            }));
        } catch { setScanResults(prev => ({ ...prev, [task.id]: '⚠️ Scan failed.' })); }
        finally { setScanningId(null); }
    };

    // Delete task
    const handleDelete = async (taskId) => {
        setPendingDeleteId(null);
        try {
            await axios.delete(`${API_URL}/api/tasks/${taskId}`);
            setTasks(tasks.filter(t => t.id !== taskId));
            setSelectedTasks(prev => {
                const newSet = new Set(prev);
                newSet.delete(taskId);
                return newSet;
            });
            if (onTasksUpdate) onTasksUpdate(); // sync App.jsx
            notify('Task deleted.', 'success');
        } catch (error) {
            notify('Error deleting task: ' + error.message, 'error');
        }
    };

    // Bulk delete
    const handleBulkDelete = async () => {
        if (selectedTasks.size === 0) return;
        setShowBulkConfirm(false);
        try {
            for (const taskId of selectedTasks) {
                await axios.delete(`${API_URL}/api/tasks/${taskId}`);
            }
            setTasks(tasks.filter(t => !selectedTasks.has(t.id)));
            setSelectedTasks(new Set());
            if (onTasksUpdate) onTasksUpdate(); // sync App.jsx
            notify(`${selectedTasks.size} tasks deleted.`, 'success');
        } catch (error) {
            notify('Error deleting tasks: ' + error.message, 'error');
        }
    };

    // Toggle task selection
    const toggleTaskSelection = (taskId) => {
        const newSet = new Set(selectedTasks);
        if (newSet.has(taskId)) {
            newSet.delete(taskId);
        } else {
            newSet.add(taskId);
        }
        setSelectedTasks(newSet);
    };

    const getPriorityColor = (priority) => {
        const colors = {
            high: '#FF6B6B',
            medium: '#FFD93D',
            low: '#95E1D3',
        };
        return colors[priority] || '#95E1D3';
    };

    const getCategoryColor = (category) => {
        const colors = {
            grocery: '#FF6B6B',
            pharmacy: '#4ECDC4',
            clothing: '#FFD93D',
            general: '#95E1D3',
        };
        return colors[category] || '#95E1D3';
    };

    const getCategoryEmoji = (category) => {
        const emojis = {
            grocery: '🛒',
            pharmacy: '💊',
            clothing: '👕',
            general: '📌',
        };
        return emojis[category] || '📌';
    };

    return (
        <div className="task-manager">
            <div className="manager-header">
                <h2>Manage Tasks</h2>
                <div className="header-actions">
                    {selectedTasks.size > 0 && (
                        showBulkConfirm ? (
                            <div className="inline-confirm">
                                <span>Delete {selectedTasks.size} tasks?</span>
                                <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>Yes, delete</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkConfirm(false)}>Cancel</button>
                            </div>
                        ) : (
                            <div style={{display:'flex', gap:'8px'}}>
                                <button className="btn" style={{background:'#0066ff', color:'white', display:'flex', alignItems:'center', gap:'6px'}} onClick={() => {
                                    // Use String coercion to ensure we don't fail strict Set equality checks
                                    const tasksToScan = tasks.filter(t => Array.from(selectedTasks).some(id => String(id) === String(t.id)));
                                    if (tasksToScan.length > 0) {
                                        navigate('/map', { state: { scanTasks: tasksToScan } });
                                    }
                                }}>
                                    <Zap size={15}/> Scan Selected ({selectedTasks.size})
                                </button>
                                <button className="btn btn-danger" onClick={() => setShowBulkConfirm(true)}>
                                    Delete Selected ({selectedTasks.size})
                                </button>
                            </div>
                        )
                    )}
                    <button className="btn btn-primary" onClick={() => setFormOpen(!formOpen)}>
                        <Plus size={18} />
                        New Task
                    </button>
                </div>
            </div>

            {formOpen && (
                <div className="task-form-container">
                    <form onSubmit={handleSubmit} className="task-form">
                        <div className="form-group">
                            <label>Task Description</label>
                            <input
                                type="text"
                                value={formData.text}
                                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                placeholder="e.g., Buy apples from Whole Foods"
                                autoFocus
                            />
                            {isPredicting ? (
                                <div className="ml-suggestion predicting">🧠 Analyzing text...</div>
                            ) : suggestedCategory ? (
                                <div className="ml-suggestion active">✨ Suggested category: <strong>{suggestedCategory}</strong> ✏️ <em style={{fontSize: '0.85em', color: '#666'}}>(change below if incorrect)</em></div>
                            ) : null}
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Priority</label>
                                <select
                                    value={formData.priority}
                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                >
                                    {PRIORITIES.map(p => (
                                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Category (optional)</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    {CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label style={{display:'flex',justifyContent:'space-between'}}>
                                <span>📍 Trigger Radius</span>
                                <strong style={{color:'#0066ff'}}>
                                    {formData.radius_meters < 1000
                                        ? `${formData.radius_meters}m`
                                        : `${(formData.radius_meters/1000).toFixed(1)}km`}
                                </strong>
                            </label>
                            <input type="range" min="100" max="5000" step="100"
                                value={formData.radius_meters}
                                onChange={e => setFormData({...formData, radius_meters: Number(e.target.value)})}
                                style={{width:'100%', accentColor:'#0066ff'}}
                            />
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'#aaa',marginTop:'2px'}}>
                                <span>100m — tight</span><span>5km — city-wide</span>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary">Create Task</button>
                            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="loading">Loading tasks...</div>
            ) : tasks.length === 0 ? (
                <div className="empty-state">
                    <p>No tasks created yet</p>
                    <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>Create your first task to get started</p>
                </div>
            ) : (
                <div className="tasks-table-container">
                    <table className="tasks-table">
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        checked={selectedTasks.size === tasks.length && tasks.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedTasks(new Set(tasks.map(t => t.id)));
                                            } else {
                                                setSelectedTasks(new Set());
                                            }
                                        }}
                                    />
                                </th>
                                <th>Task</th>
                                    <th>Category</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => (
                                <tr key={task.id} className={selectedTasks.has(task.id) ? 'selected' : ''}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedTasks.has(task.id)}
                                            onChange={() => toggleTaskSelection(task.id)}
                                        />
                                    </td>
                                    <td className="task-text-col">
                                        {editingId === task.id ? (
                                            <input
                                                className="edit-input"
                                                value={editData.text}
                                                onChange={e => setEditData({...editData, text: e.target.value})}
                                            />
                                        ) : (
                                            <Link
                                                to={`/tasks/${task.id}`}
                                                style={{color:'#1a1a2e',textDecoration:'none',fontWeight:600}}
                                                onMouseEnter={e => e.target.style.color='#0066ff'}
                                                onMouseLeave={e => e.target.style.color='#1a1a2e'}
                                            >
                                                {task.raw_text || task.text}
                                            </Link>
                                        )}
                                    </td>
                                    <td>
                                        {editingId === task.id ? (
                                            <select className="edit-select"
                                                value={editData.category}
                                                onChange={e => setEditData({...editData, category: e.target.value})}>
                                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        ) : (
                                            <span className="badge"
                                                style={{ backgroundColor: getCategoryColor(task.category), color: 'white' }}>
                                                {getCategoryEmoji(task.category)} {task.category}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {editingId === task.id ? (
                                            <select className="edit-select"
                                                value={editData.priority}
                                                onChange={e => setEditData({...editData, priority: e.target.value})}>
                                                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        ) : (
                                            <span className="badge"
                                                style={{ backgroundColor: getPriorityColor(task.priority), color: 'white' }}>
                                                {task.priority.toUpperCase()}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {scanResults[task.id] && (
                                            <div style={{fontSize:'11px',color:'#2d6a4f',marginBottom:'2px'}}>{scanResults[task.id]}</div>
                                        )}
                                        <span className={`status ${task.triggered_at ? 'triggered' : 'pending'}`}>
                                            {task.triggered_at ? '✓ Triggered' : '⏳ Pending'}
                                        </span>
                                    </td>
                                    <td className="date-col">
                                        {new Date(task.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="actions-col">
                                        {editingId === task.id ? (
                                            <div className="action-group">
                                                <button className="btn-icon save" onClick={() => handleSaveEdit(task.id)} title="Save"><Check size={15}/></button>
                                                <button className="btn-icon cancel" onClick={() => setEditingId(null)} title="Cancel"><X size={15}/></button>
                                            </div>
                                        ) : pendingDeleteId === task.id ? (
                                            <div className="inline-confirm">
                                                <span>Delete?</span>
                                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(task.id)}>Yes</button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setPendingDeleteId(null)}>No</button>
                                            </div>
                                        ) : (
                                            <div className="action-group">
                                                <button className="btn-icon scan" onClick={() => triggerScan(task)}
                                                    disabled={scanningId === task.id} title="Scan nearby">
                                                    <Zap size={14}/>
                                                </button>
                                                <button className="btn-icon edit" onClick={() => handleEditStart(task)} title="Edit"><Edit2 size={15}/></button>
                                                <button className="btn-icon delete" onClick={() => setPendingDeleteId(task.id)} title="Delete"><Trash2 size={15}/></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
