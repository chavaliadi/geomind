import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import TaskManager from './components/TaskManager';
import Analytics from './components/Analytics';
import LocationSimulator from './components/LocationSimulator';
import './App.css';

const App = () => {
  const API_URL = 'http://localhost:3000';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
  });

  // Fetch tasks from backend
  const fetchTasks = async () => {
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
  };

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
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🗺️ GeoMind Dashboard</h1>
          <p>Smart Location-Based Reminder System</p>
        </div>
      </header>

      <nav className="app-nav">
        <div className="nav-tabs">
          {[
            { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
            { id: 'tasks', label: '📝 Manage Tasks', icon: '📝' },
            { id: 'analytics', label: '📈 Analytics', icon: '📈' },
            { id: 'simulator', label: '🎯 Location Simulator', icon: '🎯' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="app-main">
        {activeTab === 'dashboard' && (
          <Dashboard tasks={tasks} stats={stats} loading={loading} />
        )}
        {activeTab === 'tasks' && (
          <TaskManager tasks={tasks} onTasksUpdate={fetchTasks} apiUrl={API_URL} />
        )}
        {activeTab === 'analytics' && (
          <Analytics tasks={tasks} />
        )}
        {activeTab === 'simulator' && (
          <LocationSimulator apiUrl={API_URL} />
        )}
      </main>

      <footer className="app-footer">
        <p>GeoMind © 2026 • Built with React • Powered by Location Intelligence</p>
      </footer>
    </div>
  );
};

export default App;
