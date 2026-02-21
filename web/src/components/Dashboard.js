import React from 'react';
import './Dashboard.css';

const Dashboard = ({ tasks, stats, loading }) => {
    const getCategoryColor = (category) => {
        const colors = {
            grocery: '#FF6B6B',
            pharmacy: '#4ECDC4',
            clothing: '#FFD93D',
            general: '#95E1D3',
        };
        return colors[category] || '#95E1D3';
    };

    const getPriorityBadge = (priority) => {
        const badges = {
            high: { emoji: '🔴', color: '#FF3B30' },
            medium: { emoji: '🟠', color: '#FF9500' },
            low: { emoji: '🟡', color: '#FFD60A' },
        };
        return badges[priority] || { emoji: '⚪', color: '#666' };
    };

    return (
        <div className="dashboard">
            <div className="dashboard-grid">
                {/* Stats Cards */}
                <div className="stats-section">
                    <h2>Overview</h2>
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon">📋</div>
                            <div className="stat-content">
                                <div className="stat-label">Total Tasks</div>
                                <div className="stat-value">{stats.totalTasks}</div>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon">⏳</div>
                            <div className="stat-content">
                                <div className="stat-label">Pending</div>
                                <div className="stat-value">{stats.pendingTasks}</div>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon">✅</div>
                            <div className="stat-content">
                                <div className="stat-label">Completed</div>
                                <div className="stat-value">{stats.completedTasks}</div>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon">📊</div>
                            <div className="stat-content">
                                <div className="stat-label">Completion Rate</div>
                                <div className="stat-value">
                                    {stats.totalTasks > 0
                                        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                                        : 0}
                                    %
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Tasks */}
                <div className="recent-tasks-section">
                    <h2>Recent Tasks</h2>
                    {loading ? (
                        <div className="loading">Loading tasks...</div>
                    ) : tasks.length === 0 ? (
                        <div className="empty-state">
                            <p>📭 No tasks yet. Create your first reminder!</p>
                        </div>
                    ) : (
                        <div className="tasks-list">
                            {tasks.slice(0, 10).map((task) => {
                                const category = task.category || 'general';
                                const priority = task.priority || 'medium';
                                const badge = getPriorityBadge(priority);
                                const isTriggered = task.status === 'triggered';

                                return (
                                    <div
                                        key={task.id}
                                        className={`task-item ${isTriggered ? 'triggered' : ''}`}
                                    >
                                        <div className="task-status">
                                            {isTriggered ? '✅' : '⏳'}
                                        </div>
                                        <div className="task-details">
                                            <div className="task-text">{task.raw_text}</div>
                                            <div className="task-meta">
                                                <span
                                                    className="category-badge"
                                                    style={{ backgroundColor: getCategoryColor(category) }}
                                                >
                                                    {category}
                                                </span>
                                                <span
                                                    className="priority-badge"
                                                    style={{ backgroundColor: badge.color }}
                                                >
                                                    {badge.emoji} {priority.toUpperCase()}
                                                </span>
                                                {task.triggered_at && (
                                                    <span className="triggered-time">
                                                        Triggered: {new Date(task.triggered_at).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
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
                        {['grocery', 'pharmacy', 'clothing', 'general'].map((cat) => {
                            const count = tasks.filter((t) => t.category === cat).length;
                            const percentage = tasks.length > 0 ? (count / tasks.length) * 100 : 0;

                            return (
                                <div key={cat} className="category-item">
                                    <div className="category-info">
                                        <span
                                            className="category-dot"
                                            style={{ backgroundColor: getCategoryColor(cat) }}
                                        ></span>
                                        <span className="category-name">{cat}</span>
                                    </div>
                                    <div className="category-bar">
                                        <div
                                            className="category-progress"
                                            style={{
                                                width: `${percentage}%`,
                                                backgroundColor: getCategoryColor(cat),
                                            }}
                                        ></div>
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
                        {['high', 'medium', 'low'].map((pri) => {
                            const count = tasks.filter(
                                (t) => (t.priority || 'medium') === pri
                            ).length;
                            const badge = getPriorityBadge(pri);

                            return (
                                <div key={pri} className="priority-item">
                                    <span className="priority-emoji">{badge.emoji}</span>
                                    <div className="priority-info">
                                        <span className="priority-label">{pri.toUpperCase()}</span>
                                        <span className="priority-count">{count} tasks</span>
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
