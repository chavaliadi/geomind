import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import TaskManager from './components/TaskManager';
import Analytics from './components/Analytics';
import LocationSimulator from './components/LocationSimulator';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const App = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
  });

  // Toast notification system
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Fetch tasks from backend
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/tasks`, {
        headers: { 'Content-Type': 'application/json' },
      });
      setTasks(response.data || []);
      updateStats(response.data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStats = (taskList) => {
    const completed = taskList.filter((t) => t.status === 'triggered').length;
    const pending = taskList.filter((t) => t.status === 'pending').length;
    setStats({
      totalTasks: taskList.length,
      completedTasks: completed,
      pendingTasks: pending,
    });
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchTasks]);

  return (
    <div className="app">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'} {toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <header className="app-header">
        <div className="header-content">
          <h1>🗺️ GeoMind Dashboard</h1>
          <p>Smart Location-Based Reminder System</p>
        </div>
      </header>

      <nav className="app-nav">
        <div className="nav-tabs">
          {[
            { to: '/', label: '📊 Dashboard', icon: '📊' },
            { to: '/tasks', label: '📝 Manage Tasks', icon: '📝' },
            { to: '/analytics', label: '📈 Analytics', icon: '📈' },
            { to: '/simulator', label: '🎯 Location Simulator', icon: '🎯' },
          ].map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              end={tab.to === '/'}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard tasks={tasks} stats={stats} loading={loading} />} />
          <Route path="/tasks" element={<TaskManager tasks={tasks} onTasksUpdate={fetchTasks} apiUrl={API_URL} showToast={showToast} />} />
          <Route path="/analytics" element={<Analytics tasks={tasks} loading={loading} />} />
          <Route path="/simulator" element={<LocationSimulator apiUrl={API_URL} showToast={showToast} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <p>GeoMind © 2026 • Built with React • Powered by Location Intelligence</p>
      </footer>
    </div>
  );
};

export default App;
