/* TaskDetail.jsx — Phase 8B+: individual task view with mini-map and single-task scan */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { ArrowLeft, MapPin, Zap } from 'lucide-react';
import { fetchNearbyPlaces } from '../services/overpassService';
import './TaskDetail.css';

// Leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const CAT_COLORS = { grocery:'#2ecc71', pharmacy:'#3498db', clothing:'#e67e22', general:'#9b59b6' };
const CAT_EMOJI  = { grocery:'🛒', pharmacy:'💊', clothing:'👕', general:'📌' };
const PRI_COLOR  = { high:'#e74c3c', medium:'#f39c12', low:'#95a5a6' };

const storeIcon = (color) => L.divIcon({
    className: '',
    html: `<div style="
        width:30px;height:30px;border-radius:50% 50% 50% 0;
        background:${color};border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        font-size:13px;transform:rotate(-45deg);
        "><span style="transform:rotate(45deg)">📍</span></div>`,
    iconSize:   [30, 30],
    iconAnchor: [15, 30],
    popupAnchor:[0, -32],
});

const userIcon = L.divIcon({
    className: '',
    html: `<div class="pulse-ring"><div class="pulse-core"></div></div>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
});

function FlyTo({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) map.flyTo(position, map.getZoom(), { animate: true, duration: 1 });
    }, [position, map]);
    return null;
}

const formatDist = d => d < 1000 ? `${d}m` : `${(d/1000).toFixed(1)}km`;

export default function TaskDetail({ apiUrl, showToast }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const API_URL = apiUrl || process.env.REACT_APP_API_URL || 'http://localhost:3000';
    const notify  = showToast || console.log;

    const [task,      setTask]      = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [position,  setPosition]  = useState(() => {
        try {
            const saved = localStorage.getItem('geomind-pos');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return null;
    });
    const [places,    setPlaces]    = useState([]);
    const [scanning,  setScanning]  = useState(false);
    const [gpsError,  setGpsError]  = useState(null);

    useEffect(() => {
        if (position) localStorage.setItem('geomind-pos', JSON.stringify(position));
    }, [position]);

    // Fetch task from backend
    useEffect(() => {
        axios.get(`${API_URL}/api/tasks`)
            .then(r => {
                const found = r.data.find(t => String(t.id) === String(id));
                setTask(found || null);
            })
            .catch(() => setTask(null))
            .finally(() => setLoading(false));
    }, [id, API_URL]);

    // Try to get user position on mount ONLY if we don't have a saved one
    useEffect(() => {
        if (!navigator.geolocation || position) return;
        navigator.geolocation.getCurrentPosition(
            pos => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => setGpsError('Could not get GPS — using default location'),
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }, []);

    const scanNearby = async () => {
        if (!task) return;
        const pos = position || { lat: 25.432247, lng: 81.770706 };
        setScanning(true);
        setPlaces([]);
        try {
            const results = await fetchNearbyPlaces(pos.lat, pos.lng, task.category, task.radius_meters || 2000);
            
            let customPlaces = [];
            try {
                const dbRes = await axios.get(`${API_URL}/nearby?lat=${pos.lat}&lng=${pos.lng}&category=${task.category}&radius=${task.radius_meters || 2000}`);
                if (dbRes.data && Array.isArray(dbRes.data)) {
                    customPlaces = dbRes.data.map(db => ({
                        id: 'db-' + Math.random().toString(36).substr(2, 9),
                        name: db.name + ' ✨',
                        lat: db.lat,
                        lng: db.lng,
                        type: 'Added Custom Place',
                        distance: db.distance
                    }));
                }
            } catch (e) { console.warn('DB custom fetch failed'); }
            
            const merged = [...customPlaces, ...results].sort((a,b) => a.distance - b.distance);
            
            setPlaces(merged.slice(0, 5));
            if (merged.length === 0) notify('No nearby stores found in this radius', 'info');
            else notify(`Found ${merged.length} nearby ${task.category} stores!`, 'success');
        } catch (err) {
            notify('Scan failed: ' + err.message, 'error');
        } finally { setScanning(false); }
    };

    if (loading) return <div className="detail-loading">Loading task…</div>;
    if (!task)   return (
        <div className="detail-loading">
            <p>Task not found.</p>
            <button className="btn-back" onClick={() => navigate('/tasks')}>← Back to Tasks</button>
        </div>
    );

    const cat    = task.category || 'general';
    const pri    = task.priority  || 'medium';
    const pos    = position || { lat: 25.432247, lng: 81.770706 };
    const radius = task.radius_meters || 2000;

    return (
        <div className="task-detail">

            {/* ── Header ── */}
            <div className="detail-header">
                <button className="btn-back" onClick={() => navigate('/tasks')}>
                    <ArrowLeft size={16}/> Back to Tasks
                </button>
                <div className="detail-badges">
                    <span className="cat-badge" style={{background: CAT_COLORS[cat]}}>
                        {CAT_EMOJI[cat]} {cat}
                    </span>
                    <span className="pri-badge" style={{background: PRI_COLOR[pri]}}>
                        {pri.toUpperCase()}
                    </span>
                    <span className={`status-badge ${task.triggered_at ? 'triggered' : 'pending'}`}>
                        {task.triggered_at ? '✅ Triggered' : '⏳ Pending'}
                    </span>
                </div>
            </div>

            {/* ── Task Info Card ── */}
            <div className="detail-card">
                <h2 className="task-title">{task.raw_text || task.text}</h2>
                <div className="task-meta-grid">
                    <div className="meta-item">
                        <span className="meta-label">Created</span>
                        <span className="meta-val">{new Date(task.created_at).toLocaleString()}</span>
                    </div>
                    <div className="meta-item">
                        <span className="meta-label">Trigger Radius</span>
                        <span className="meta-val">📍 {formatDist(radius)}</span>
                    </div>
                    {task.triggered_at && (
                        <div className="meta-item">
                            <span className="meta-label">Triggered At</span>
                            <span className="meta-val">{new Date(task.triggered_at).toLocaleString()}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Scan Button ── */}
            <div className="scan-bar">
                {gpsError && <p className="gps-warn">⚠️ {gpsError}</p>}
                
                <div style={{display:'flex', gap:'10px', alignItems:'center', flexWrap: 'wrap', marginBottom: '12px'}}>
                    <select className="location-select" onChange={e => {
                        if (e.target.value) {
                            const [lat, lng] = e.target.value.split(',');
                            setPosition({lat: parseFloat(lat), lng: parseFloat(lng)});
                            setPlaces([]);
                        }
                    }} style={{padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px'}}>
                        <option value="">🗺️ Override Search Location...</option>
                        <option value="17.45889,78.37302">Divyasree Omega, HYD</option>
                        <option value="12.9716,77.5946">Bengaluru</option>
                        <option value="25.4322,81.7707">Prayagraj</option>
                        <option value="19.0760,72.8777">Mumbai</option>
                        <option value="28.6139,77.2090">Delhi</option>
                    </select>

                    <button className="btn-scan-detail" onClick={scanNearby} disabled={scanning}>
                        <Zap size={15}/> {scanning ? 'Scanning…' : 'Scan Nearby Stores'}
                    </button>
                </div>
                <span className="scan-radius-info">
                    within {formatDist(radius)} · {CAT_EMOJI[cat]} {cat} stores
                </span>
            </div>

            {/* ── Results List ── */}
            {places.length > 0 && (
                <div className="detail-places">
                    <h3>Nearby {cat} Stores</h3>
                    {places.map((pl, i) => (
                        <div key={pl.id || i} className="place-row">
                            <div className="place-rank">{i + 1}</div>
                            <div className="place-info">
                                <div className="place-name">{pl.name}</div>
                                <div className="place-sub">
                                    {pl.type}
                                    {pl.opening && <>&nbsp;·&nbsp; 🕐 {pl.opening}</>}
                                </div>
                            </div>
                            <div className="place-distance">📍 {formatDist(pl.distance)}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Mini Map ── */}
            <div className="detail-map-wrap">
                <div className="map-label">
                    <MapPin size={13}/> Map
                    {position
                        ? ` — ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`
                        : ' — GPS unavailable, showing default location'}
                </div>
                <MapContainer
                    center={[pos.lat, pos.lng]}
                    zoom={14}
                    className="detail-map"
                    zoomControl={true}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <FlyTo position={[pos.lat, pos.lng]} />
                    <Marker position={[pos.lat, pos.lng]} icon={userIcon}>
                        <Popup>📍 Your Location</Popup>
                    </Marker>
                    <Circle
                        center={[pos.lat, pos.lng]}
                        radius={radius}
                        pathOptions={{ color: CAT_COLORS[cat], fillColor: CAT_COLORS[cat], fillOpacity:0.08, weight:2, dashArray:'5,4' }}
                    />
                    {places.map((pl, i) => (
                        <Marker key={i} position={[pl.lat, pl.lng]} icon={storeIcon(CAT_COLORS[cat])}>
                            <Popup>
                                <strong>{pl.name}</strong><br/>
                                {CAT_EMOJI[cat]} {pl.type} · 📍 {formatDist(pl.distance)}
                                {pl.opening && <><br/>🕐 {pl.opening}</>}
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
}
