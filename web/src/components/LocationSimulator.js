/* LocationSimulator.js */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin } from 'lucide-react';
import './LocationSimulator.css';

const API_URL = 'http://localhost:3000';

export default function LocationSimulator() {
    const [location, setLocation] = useState({
        lat: 25.432247,
        lng: -81.770706,
    });
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [preset, setPreset] = useState('default');

    // Preset locations (in reality these would be around actual locations from the database)
    const PRESETS = {
        default: { name: 'Default (Miami Area)', lat: 25.432247, lng: -81.770706 },
        downtown: { name: 'Downtown', lat: 25.761681, lng: -80.191788 },
        beacharea: { name: 'Beach Area', lat: 25.791830, lng: -80.130006 },
        westside: { name: 'West Side', lat: 25.755088, lng: -80.354003 },
    };

    const handleInputChange = (field, value) => {
        setLocation(prev => ({
            ...prev,
            [field]: parseFloat(value) || 0,
        }));
    };

    const handlePresetChange = (presetKey) => {
        setPreset(presetKey);
        const preset_data = PRESETS[presetKey];
        setLocation({
            lat: preset_data.lat,
            lng: preset_data.lng,
        });
    };

    const handleSimulate = async () => {
        if (!location.lat || !location.lng) {
            alert('Please enter valid coordinates');
            return;
        }

        try {
            setLoading(true);
            setResult(null);

            const response = await axios.post(`${API_URL}/location`, {
                lat: location.lat,
                lng: location.lng,
            });

            setResult({
                success: true,
                data: response.data,
                timestamp: new Date(),
            });
        } catch (error) {
            setResult({
                success: false,
                error: error.response?.data?.error || error.message,
                timestamp: new Date(),
            });
        } finally {
            setLoading(false);
        }
    };

    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
                setPreset('');
            },
            (error) => {
                alert(`Error getting location: ${error.message}`);
            }
        );
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

    const getPriorityColor = (priority) => {
        const colors = {
            high: '#FF6B6B',
            medium: '#FFD93D',
            low: '#95E1D3',
        };
        return colors[priority] || '#95E1D3';
    };

    return (
        <div className="location-simulator">
            <div className="simulator-header">
                <h2>Location Simulator</h2>
                <p className="description">Test the geo-matching system without moving</p>
            </div>

            <div className="simulator-container">
                <div className="input-section">
                    <h3>Location Input</h3>

                    {/* Presets */}
                    <div className="presets">
                        <label>Quick Presets</label>
                        <div className="preset-buttons">
                            {Object.entries(PRESETS).map(([key, data]) => (
                                <button
                                    key={key}
                                    className={`preset-btn ${preset === key ? 'active' : ''}`}
                                    onClick={() => handlePresetChange(key)}
                                >
                                    {data.name.split('(')[0].trim()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Coordinate Inputs */}
                    <div className="coordinates">
                        <div className="input-group">
                            <label>Latitude</label>
                            <input
                                type="number"
                                value={location.lat}
                                onChange={(e) => handleInputChange('lat', e.target.value)}
                                step="0.000001"
                                placeholder="e.g., 25.432247"
                            />
                        </div>
                        <div className="input-group">
                            <label>Longitude</label>
                            <input
                                type="number"
                                value={location.lng}
                                onChange={(e) => handleInputChange('lng', e.target.value)}
                                step="0.000001"
                                placeholder="e.g., -81.770706"
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="action-buttons">
                        <button
                            className="btn btn-primary"
                            onClick={handleSimulate}
                            disabled={loading}
                        >
                            {loading ? 'Simulating...' : 'Simulate Location'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={handleGetCurrentLocation}
                        >
                            <MapPin size={18} />
                            Use My Location
                        </button>
                    </div>

                    {/* Info Box */}
                    <div className="info-box">
                        <p>
                            <strong>Current coordinates:</strong>
                        </p>
                        <p className="coords">
                            {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                        </p>
                        <p style={{ fontSize: '12px', color: '#666', marginTop: '12px' }}>
                            💡 Tip: The system checks all locations from your tasks and triggers
                            notifications for tasks within 50-100 meters of your current location.
                        </p>
                    </div>
                </div>

                {/* Results Section */}
                <div className="result-section">
                    {result ? (
                        <div className={`result ${result.success ? 'success' : 'error'}`}>
                            <div className="result-header">
                                <h3>{result.success ? '✅ Matched Locations' : '❌ Error'}</h3>
                                <span className="timestamp">
                                    {result.timestamp.toLocaleTimeString()}
                                </span>
                            </div>

                            {result.success ? (
                                <div className="batches">
                                    {result.data.batches && result.data.batches.length > 0 ? (
                                        <>
                                            <p className="batches-count">
                                                Found {result.data.batches.length} notification batch(es)
                                            </p>
                                            {result.data.batches.map((batch, idx) => (
                                                <div key={idx} className="batch">
                                                    <div className="batch-header">
                                                        <span className="category">
                                                            {getCategoryEmoji(batch.category)} {batch.category.toUpperCase()}
                                                        </span>
                                                        <span className="count">{batch.count} task(s)</span>
                                                    </div>
                                                    <div className="tasks">
                                                        {batch.tasks && batch.tasks.map((task, taskIdx) => (
                                                            <div key={taskIdx} className="task-preview">
                                                                <span className="task-text">{task.text}</span>
                                                                <span
                                                                    className="priority-badge"
                                                                    style={{ backgroundColor: getPriorityColor(task.priority) }}
                                                                >
                                                                    {task.priority}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {batch.distance && (
                                                        <div className="batch-distance">
                                                            📍 Distance: {batch.distance.toFixed(2)}m
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            <div className="success-message">
                                                🔔 {result.data.batches.length} notification(s) would be sent with {result.data.batches.reduce((sum, b) => sum + b.count, 0)} total task(s)
                                            </div>
                                        </>
                                    ) : (
                                        <p className="no-matches">No matching tasks at this location</p>
                                    )}
                                </div>
                            ) : (
                                <div className="error-message">
                                    <p>{result.error}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-result">
                            <p>👈 Enter coordinates and simulate location to test the system</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Usage Tips */}
            <div className="tips-section">
                <h3>How It Works</h3>
                <div className="tips-grid">
                    <div className="tip-card">
                        <div className="tip-number">1</div>
                        <div className="tip-content">
                            <h4>Add Tasks</h4>
                            <p>Create tasks with locations (e.g., "Buy apples at Whole Foods").</p>
                        </div>
                    </div>
                    <div className="tip-card">
                        <div className="tip-number">2</div>
                        <div className="tip-content">
                            <h4>Set Location</h4>
                            <p>Enter GPS coordinates of your current or desired location.</p>
                        </div>
                    </div>
                    <div className="tip-card">
                        <div className="tip-number">3</div>
                        <div className="tip-content">
                            <h4>Simulate</h4>
                            <p>The system checks for nearby tasks and groups by category.</p>
                        </div>
                    </div>
                    <div className="tip-card">
                        <div className="tip-number">4</div>
                        <div className="tip-content">
                            <h4>See Results</h4>
                            <p>View which tasks would trigger and how they're batched.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
