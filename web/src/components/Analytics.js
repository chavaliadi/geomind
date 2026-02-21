/* Analytics.js */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './Analytics.css';

const API_URL = 'http://localhost:3000';

export default function Analytics() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState('7d'); // 7d, 30d, all
    const [selectedCategory, setSelectedCategory] = useState('all');

    const CATEGORIES = ['all', 'grocery', 'pharmacy', 'clothing', 'general'];

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
        const interval = setInterval(fetchTasks, 30000);
        return () => clearInterval(interval);
    }, []);

    // Filter tasks by date range
    const getFilteredTasks = () => {
        let filtered = tasks;

        if (selectedCategory !== 'all') {
            filtered = filtered.filter(t => t.category === selectedCategory);
        }

        const now = new Date();
        let startDate = new Date();

        if (timeRange === '7d') {
            startDate.setDate(now.getDate() - 7);
        } else if (timeRange === '30d') {
            startDate.setDate(now.getDate() - 30);
        }

        if (timeRange !== 'all') {
            filtered = filtered.filter(t => new Date(t.created_at) >= startDate);
        }

        return filtered;
    };

    const filteredTasks = getFilteredTasks();
    const triggeredTasks = filteredTasks.filter(t => t.triggered_at);

    // Calculate statistics
    const stats = {
        total: filteredTasks.length,
        triggered: triggeredTasks.length,
        pending: filteredTasks.length - triggeredTasks.length,
        triggerRate: filteredTasks.length > 0
            ? ((triggeredTasks.length / filteredTasks.length) * 100).toFixed(1)
            : 0,
    };

    // Prepare data for charts
    const getCategoryDistribution = () => {
        const dist = {};
        filteredTasks.forEach(t => {
            dist[t.category] = (dist[t.category] || 0) + 1;
        });
        return Object.entries(dist).map(([category, count]) => ({
            name: category,
            value: count,
        }));
    };

    const getPriorityDistribution = () => {
        const priorities = { high: 0, medium: 0, low: 0 };
        filteredTasks.forEach(t => {
            priorities[t.priority || 'medium']++;
        });
        return Object.entries(priorities).map(([priority, count]) => ({
            name: priority.charAt(0).toUpperCase() + priority.slice(1),
            value: count,
        }));
    };

    const getTimelineData = () => {
        const timeline = {};
        filteredTasks.forEach(t => {
            const date = new Date(t.created_at).toLocaleDateString();
            timeline[date] = (timeline[date] || 0) + 1;
        });
        return Object.entries(timeline)
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .slice(-14) // Last 14 days
            .map(([date, count]) => ({
                date,
                tasks: count,
            }));
    };

    const getTriggerTimeline = () => {
        const timeline = {};
        triggeredTasks.forEach(t => {
            const date = new Date(t.triggered_at).toLocaleDateString();
            timeline[date] = (timeline[date] || 0) + 1;
        });
        return Object.entries(timeline)
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .slice(-14)
            .map(([date, count]) => ({
                date,
                triggers: count,
            }));
    };

    const getPriorityTriggerRate = () => {
        const stats = {
            high: { total: 0, triggered: 0 },
            medium: { total: 0, triggered: 0 },
            low: { total: 0, triggered: 0 },
        };

        filteredTasks.forEach(t => {
            const priority = t.priority || 'medium';
            if (stats[priority]) {
                stats[priority].total++;
                if (t.triggered_at) {
                    stats[priority].triggered++;
                }
            }
        });

        return Object.entries(stats).map(([priority, data]) => ({
            priority: priority.charAt(0).toUpperCase() + priority.slice(1),
            total: data.total,
            triggered: data.triggered,
            rate: data.total > 0 ? ((data.triggered / data.total) * 100).toFixed(1) : 0,
        }));
    };

    const COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#95E1D3'];

    if (loading) {
        return <div className="loading">Loading analytics data...</div>;
    }

    return (
        <div className="analytics">
            <div className="analytics-header">
                <h2>Analytics & Insights</h2>
                <div className="filters">
                    <div className="filter-group">
                        <label>Time Range</label>
                        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="all">All Time</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Category</label>
                        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                            {CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>
                                    {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {filteredTasks.length === 0 ? (
                <div className="empty-state">
                    <p>No tasks in selected range</p>
                </div>
            ) : (
                <>
                    {/* Stats Cards */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-content">
                                <span className="stat-label">Total Tasks</span>
                                <span className="stat-value">{stats.total}</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-content">
                                <span className="stat-label">Triggered</span>
                                <span className="stat-value" style={{ color: '#4ECDC4' }}>{stats.triggered}</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-content">
                                <span className="stat-label">Pending</span>
                                <span className="stat-value" style={{ color: '#FFD93D' }}>{stats.pending}</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-content">
                                <span className="stat-label">Trigger Rate</span>
                                <span className="stat-value" style={{ color: '#FF6B6B' }}>{stats.triggerRate}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="charts-grid">
                        {/* Timeline */}
                        <div className="chart-card">
                            <h3>Task Creation Timeline</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={getTimelineData()}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f5" />
                                    <XAxis dataKey="date" stroke="#666" style={{ fontSize: '12px' }} />
                                    <YAxis stroke="#666" style={{ fontSize: '12px' }} />
                                    <Tooltip
                                        contentStyle={{ background: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}
                                    />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="tasks"
                                        stroke="#0066ff"
                                        dot={{ fill: '#0066ff', r: 4 }}
                                        activeDot={{ r: 6 }}
                                        name="New Tasks"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Trigger Timeline */}
                        {triggeredTasks.length > 0 && (
                            <div className="chart-card">
                                <h3>Trigger Timeline</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={getTriggerTimeline()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f5" />
                                        <XAxis dataKey="date" stroke="#666" style={{ fontSize: '12px' }} />
                                        <YAxis stroke="#666" style={{ fontSize: '12px' }} />
                                        <Tooltip
                                            contentStyle={{ background: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}
                                        />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="triggers"
                                            stroke="#4ECDC4"
                                            dot={{ fill: '#4ECDC4', r: 4 }}
                                            activeDot={{ r: 6 }}
                                            name="Triggers"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Category Distribution */}
                        <div className="chart-card">
                            <h3>Tasks by Category</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={getCategoryDistribution()}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, value }) => `${name}: ${value}`}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {getCategoryDistribution().map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Priority Distribution */}
                        <div className="chart-card">
                            <h3>Priority Distribution</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={getPriorityDistribution()}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f5" />
                                    <XAxis dataKey="name" stroke="#666" style={{ fontSize: '12px' }} />
                                    <YAxis stroke="#666" style={{ fontSize: '12px' }} />
                                    <Tooltip
                                        contentStyle={{ background: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}
                                    />
                                    <Bar dataKey="value" fill="#0066ff" name="Count" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Priority Trigger Rate Table */}
                    <div className="table-card">
                        <h3>Trigger Rate by Priority</h3>
                        <table className="analytics-table">
                            <thead>
                                <tr>
                                    <th>Priority</th>
                                    <th>Total</th>
                                    <th>Triggered</th>
                                    <th>Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getPriorityTriggerRate().map(data => (
                                    <tr key={data.priority}>
                                        <td className="priority-name">{data.priority}</td>
                                        <td>{data.total}</td>
                                        <td>{data.triggered}</td>
                                        <td className="rate">{data.rate}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
