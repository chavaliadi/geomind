/* TaskManager.js */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, Edit2, Plus } from 'lucide-react';
import './TaskManager.css';

const API_URL = 'http://localhost:3000';

export default function TaskManager() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        text: '',
        priority: 'medium',
        category: 'general',
    });
    const [selectedTasks, setSelectedTasks] = useState(new Set());

    const CATEGORIES = ['general', 'grocery', 'pharmacy', 'clothing'];
    const PRIORITIES = ['high', 'medium', 'low'];

    // Fetch tasks
    const fetchTasks = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/api/tasks`);
            setTasks(response.data || []);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 10000);
        return () => clearInterval(interval);
    }, []);

    // Reset form
    const resetForm = () => {
        setFormData({ text: '', priority: 'medium', category: 'general' });
        setEditingId(null);
        setFormOpen(false);
    };

    // Add/Update task
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.text.trim()) {
            alert('Task text is required');
            return;
        }

        try {
            const payload = {
                text: formData.text.trim(),
                priority: formData.priority,
                category_override: formData.category !== 'general' ? formData.category : undefined,
            };

            const response = await axios.post(`${API_URL}/tasks`, payload);

            // Add to local state
            setTasks([response.data, ...tasks]);
            resetForm();
        } catch (error) {
            alert('Error creating task: ' + error.message);
        }
    };

    // Delete task
    const handleDelete = async (taskId) => {
        if (!window.confirm('Delete this task?')) return;

        try {
            await axios.delete(`${API_URL}/api/tasks/${taskId}`);
            setTasks(tasks.filter(t => t.id !== taskId));
            setSelectedTasks(prev => {
                const newSet = new Set(prev);
                newSet.delete(taskId);
                return newSet;
            });
        } catch (error) {
            alert('Error deleting task: ' + error.message);
        }
    };

    // Bulk delete
    const handleBulkDelete = async () => {
        if (selectedTasks.size === 0) return;
        if (!window.confirm(`Delete ${selectedTasks.size} tasks?`)) return;

        try {
            for (const taskId of selectedTasks) {
                await axios.delete(`${API_URL}/api/tasks/${taskId}`);
            }
            setTasks(tasks.filter(t => !selectedTasks.has(t.id)));
            setSelectedTasks(new Set());
        } catch (error) {
            alert('Error deleting tasks: ' + error.message);
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
                        <button className="btn btn-danger" onClick={handleBulkDelete}>
                            Delete Selected ({selectedTasks.size})
                        </button>
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
                                    <td className="task-text-col">{task.text}</td>
                                    <td>
                                        <span
                                            className="badge"
                                            style={{ backgroundColor: getCategoryColor(task.category), color: 'white' }}
                                        >
                                            {getCategoryEmoji(task.category)} {task.category}
                                        </span>
                                    </td>
                                    <td>
                                        <span
                                            className="badge"
                                            style={{ backgroundColor: getPriorityColor(task.priority), color: 'white' }}
                                        >
                                            {task.priority.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status ${task.triggered_at ? 'triggered' : 'pending'}`}>
                                            {task.triggered_at ? '✓ Triggered' : '⏳ Pending'}
                                        </span>
                                    </td>
                                    <td className="date-col">
                                        {new Date(task.created_at).toLocaleDateString()} {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="actions-col">
                                        <button
                                            className="btn-icon delete"
                                            onClick={() => handleDelete(task.id)}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
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
