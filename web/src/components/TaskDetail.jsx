/* TaskDetail.jsx — Phase 9B: choose route, mark done, star rating ML feedback */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { ArrowLeft, MapPin, Zap, Navigation, CheckCircle, Star } from 'lucide-react';
import { fetchNearbyPlaces } from '../services/overpassService';
import { fetchTripRoute } from '../services/routingService';
import './TaskDetail.css';

// Leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const CAT_COLORS = { grocery: '#2ecc71', pharmacy: '#3498db', clothing: '#e67e22', general: '#9b59b6' };
const CAT_EMOJI  = { grocery: '🛒', pharmacy: '💊', clothing: '👕', general: '📌' };
const PRI_COLOR  = { high: '#e74c3c', medium: '#f39c12', low: '#95a5a6' };

const storeIcon = (color, num, isActive) => L.divIcon({
    className: '',
    html: `<div style="
        width:${isActive ? 38 : 30}px;height:${isActive ? 38 : 30}px;
        border-radius:50% 50% 50% 0;
        background:${color};border:${isActive ? 4 : 2}px solid white;
        box-shadow:0 ${isActive ? 4 : 2}px ${isActive ? 12 : 6}px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        font-size:${isActive ? 15 : 12}px;transform:rotate(-45deg);
        transition: all 0.2s;
        ">
        <span style="transform:rotate(45deg);font-weight:800">${num}</span>
    </div>`,
    iconSize: [isActive ? 38 : 30, isActive ? 38 : 30],
    iconAnchor: [isActive ? 19 : 15, isActive ? 38 : 30],
    popupAnchor: [0, -40],
});

const userIcon = L.divIcon({
    className: '',
    html: `<div class="pulse-ring"><div class="pulse-core"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

function FlyTo({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) map.flyTo(position, map.getZoom(), { animate: true, duration: 0.8 });
    }, [position, map]);
    return null;
}

const formatDist = d => d < 1000 ? `${d}m` : `${(d / 1000).toFixed(1)}km`;
const formatTime = secs => {
    if (secs < 60) return `${Math.round(secs)}s`;
    const mins = Math.round(secs / 60);
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export default function TaskDetail({ apiUrl, showToast }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const API_URL = apiUrl || process.env.REACT_APP_API_URL || 'http://localhost:3000';
    const ML_URL = process.env.REACT_APP_ML_URL || 'http://localhost:5001';
    const notify = showToast || console.log;

    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [position, setPosition] = useState(() => {
        try { const s = localStorage.getItem('geomind-pos'); if (s) return JSON.parse(s); } catch {}
        return null;
    });
    const [places, setPlaces]             = useState([]);
    const [scanning, setScanning]         = useState(false);
    const [gpsLoading, setGpsLoading]     = useState(false);
    const [gpsError, setGpsError]         = useState(null);
    const [activeStoreIdx, setActiveStoreIdx] = useState(0);
    const [routeCache, setRouteCache]     = useState({});
    const [routeLoading, setRouteLoading] = useState(false);
    // Route chosen / done / rating
    const [chosenIdx, setChosenIdx]       = useState(null); // which store was chosen
    const [showDoneModal, setShowDoneModal] = useState(false);
    const [rating, setRating]             = useState(0);
    const [hoverRating, setHoverRating]   = useState(0);
    const [submittingDone, setSubmittingDone] = useState(false);

    useEffect(() => {
        if (position) localStorage.setItem('geomind-pos', JSON.stringify(position));
    }, [position]);

    useEffect(() => {
        axios.get(`${API_URL}/api/tasks`)
            .then(r => { const found = r.data.find(t => String(t.id) === String(id)); setTask(found || null); })
            .catch(() => setTask(null))
            .finally(() => setLoading(false));
    }, [id, API_URL]);

    // Auto GPS on mount
    useEffect(() => {
        if (!navigator.geolocation || position) return;
        navigator.geolocation.getCurrentPosition(
            pos => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => setGpsError('GPS unavailable — pick a location below'),
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }, []); // eslint-disable-line

    const getLiveGPS = () => {
        if (!navigator.geolocation) { notify('Geolocation not supported', 'error'); return; }
        setGpsLoading(true); setGpsError(null);
        navigator.geolocation.getCurrentPosition(
            pos => {
                setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setPlaces([]); setRouteCache({}); setActiveStoreIdx(0); setChosenIdx(null);
                setGpsLoading(false);
                notify('📡 Live GPS location captured!', 'success');
            },
            err => { setGpsError('GPS failed: ' + err.message); setGpsLoading(false); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const fetchRouteForStore = async (idx, storeList, userPos) => {
        if (routeCache[idx] !== undefined) return routeCache[idx];
        const store = storeList[idx];
        if (!store) return null;
        setRouteLoading(true);
        try {
            const route = await fetchTripRoute([userPos, { lat: store.lat, lng: store.lng }]);
            setRouteCache(prev => ({ ...prev, [idx]: route }));
            return route;
        } catch { return null; }
        finally { setRouteLoading(false); }
    };

    const scanNearby = async () => {
        if (!task) return;
        const pos = position || { lat: 25.432247, lng: 81.770706 };
        setScanning(true); setPlaces([]); setRouteCache({}); setActiveStoreIdx(0); setChosenIdx(null);
        try {
            const results = await fetchNearbyPlaces(pos.lat, pos.lng, task.category, task.radius_meters || 2000);
            let customPlaces = [];
            try {
                const dbRes = await axios.get(`${API_URL}/nearby?lat=${pos.lat}&lng=${pos.lng}&category=${task.category}&radius=${task.radius_meters || 2000}`);
                if (dbRes.data && Array.isArray(dbRes.data)) {
                    customPlaces = dbRes.data.map(db => ({ id: 'db-' + Math.random().toString(36).substr(2,9), name: db.name + ' ✨', lat: db.lat, lng: db.lng, type: 'Added Custom Place', distance: db.distance }));
                }
            } catch {}
            const merged = [...customPlaces, ...results].sort((a, b) => a.distance - b.distance).slice(0, 5);
            setPlaces(merged);
            if (merged.length === 0) notify('No nearby stores found', 'info');
            else {
                notify(`Found ${merged.length} nearby ${task.category} stores!`, 'success');
                await fetchRouteForStore(0, merged, pos);
            }
        } catch (err) { notify('Scan failed: ' + err.message, 'error'); }
        finally { setScanning(false); }
    };

    const handleStoreSelect = async (idx) => {
        setActiveStoreIdx(idx);
        const pos = position || { lat: 25.432247, lng: 81.770706 };
        await fetchRouteForStore(idx, places, pos);
    };

    const handleChooseRoute = () => {
        if (places[activeStoreIdx]) {
            setChosenIdx(activeStoreIdx);
            notify(`✅ Route to "${places[activeStoreIdx].name}" chosen! Head there now.`, 'success');
        }
    };

    const handleMarkDone = async () => {
        if (rating === 0) { notify('Please give a star rating before submitting', 'info'); return; }
        setSubmittingDone(true);
        try {
            const chosenStore = chosenIdx !== null ? places[chosenIdx] : places[0];
            // Mark task as done and store lightweight preference history
            await axios.patch(`${API_URL}/api/tasks/${task.id}`, {
                status: 'completed',
                chosen_store: chosenStore?.name || null,
                rating,
            }).catch(() => {});
            // Send ML feedback for periodic retraining
            await axios.post(`${ML_URL}/feedback`, {
                text: task.raw_text || task.text,
                chosen_store: chosenStore?.name || null,
                chosen_category: task.category,
                rating,
                task_id: task.id,
            }).catch(() => {});
            notify(`🌟 Task marked done! Rating (${rating}⭐) sent to ML. Thanks!`, 'success');
            setShowDoneModal(false);
            setTimeout(() => navigate('/tasks'), 1500);
        } catch (err) {
            notify('Error: ' + err.message, 'error');
        } finally { setSubmittingDone(false); }
    };

    if (loading) return <div className="detail-loading">Loading task…</div>;
    if (!task) return (
        <div className="detail-loading">
            <p>Task not found.</p>
            <button className="btn-back" onClick={() => navigate('/tasks')}>← Back to Tasks</button>
        </div>
    );

    const cat    = task.category || 'general';
    const pri    = task.priority || 'medium';
    const pos    = position || { lat: 25.432247, lng: 81.770706 };
    const radius = task.radius_meters || 2000;
    const activeRoute = routeCache[activeStoreIdx] || null;
    const isChosen    = chosenIdx !== null;

    return (
        <div className="task-detail">

            {/* ── Mark Done Modal ── */}
            {showDoneModal && (
                <div className="modal-backdrop" onClick={() => setShowDoneModal(false)}>
                    <div className="done-modal" onClick={e => e.stopPropagation()}>
                        <h3>🎉 Task Completed!</h3>
                        <p>How was your experience at <strong>{places[chosenIdx ?? activeStoreIdx]?.name || 'the store'}</strong>?</p>
                        <div className="star-rating">
                            {[1,2,3,4,5].map(s => (
                                <button
                                    key={s}
                                    className={`star-btn ${s <= (hoverRating || rating) ? 'filled' : ''}`}
                                    onMouseEnter={() => setHoverRating(s)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => setRating(s)}
                                >
                                    <Star size={32} fill={s <= (hoverRating || rating) ? '#f39c12' : 'none'} color={s <= (hoverRating || rating) ? '#f39c12' : '#ccc'} />
                                </button>
                            ))}
                        </div>
                        <p className="rating-label">{
                            rating === 0 ? 'Tap a star to rate' :
                            rating === 1 ? '😞 Poor — we\'ll improve suggestions' :
                            rating === 2 ? '😐 Below average' :
                            rating === 3 ? '🙂 OK — decent match' :
                            rating === 4 ? '😊 Good store recommendation!' :
                            '🌟 Perfect match — ML will learn!'
                        }</p>
                        <div className="modal-actions">
                            <button className="btn-submit-done" onClick={handleMarkDone} disabled={rating === 0 || submittingDone}>
                                <CheckCircle size={16} />
                                {submittingDone ? 'Submitting…' : 'Submit & Complete Task'}
                            </button>
                            <button className="btn-modal-cancel" onClick={() => setShowDoneModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="detail-header">
                <button className="btn-back" onClick={() => navigate('/tasks')}>
                    <ArrowLeft size={16} /> Back to Tasks
                </button>
                <div className="detail-badges">
                    <span className="cat-badge" style={{ background: CAT_COLORS[cat] }}>{CAT_EMOJI[cat]} {cat}</span>
                    <span className="pri-badge" style={{ background: PRI_COLOR[pri] }}>{pri.toUpperCase()}</span>
                    <span className={`status-badge ${isChosen ? 'chosen' : task.triggered_at ? 'triggered' : 'pending'}`}>
                        {isChosen ? '🗺️ Route Chosen' : task.triggered_at ? '✅ Triggered' : '⏳ Pending'}
                    </span>
                    {isChosen && (
                        <button className="btn-mark-done" onClick={() => setShowDoneModal(true)}>
                            <CheckCircle size={14} /> Mark as Done
                        </button>
                    )}
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

            {/* ── Chosen route banner ── */}
            {isChosen && (
                <div className="chosen-banner">
                    <span>🗺️ You're heading to <strong>{places[chosenIdx]?.name}</strong></span>
                    <span className="chosen-dist">📍 {formatDist(places[chosenIdx]?.distance || 0)}</span>
                </div>
            )}

            {/* ── Scan Controls ── */}
            <div className="scan-bar">
                {gpsError && <p className="gps-warn">⚠️ {gpsError}</p>}
                <div className="scan-controls-row">
                    <button className={`btn-live-gps ${gpsLoading ? 'loading' : ''}`} onClick={getLiveGPS} disabled={gpsLoading}>
                        <Navigation size={14} />
                        {gpsLoading ? 'Getting GPS…' : '📡 Use Live GPS'}
                    </button>
                    <select className="location-select" onChange={e => {
                        if (e.target.value) {
                            const [lat, lng] = e.target.value.split(',');
                            setPosition({ lat: parseFloat(lat), lng: parseFloat(lng) });
                            setPlaces([]); setRouteCache({}); setChosenIdx(null);
                        }
                    }}>
                        <option value="">🗺️ Override Location…</option>
                        <option value="17.45889,78.37302">Divyasree Omega, HYD</option>
                        <option value="12.9716,77.5946">Bengaluru</option>
                        <option value="25.4322,81.7707">Prayagraj</option>
                        <option value="19.0760,72.8777">Mumbai</option>
                        <option value="28.6139,77.2090">Delhi</option>
                    </select>
                    <button className="btn-scan-detail" onClick={scanNearby} disabled={scanning}>
                        <Zap size={15} /> {scanning ? 'Scanning…' : 'Scan Nearby Stores'}
                    </button>
                </div>
                <span className="scan-radius-info">within {formatDist(radius)} · {CAT_EMOJI[cat]} {cat} stores</span>
            </div>

            {/* ── Results List ── */}
            {places.length > 0 && (
                <div className="detail-places">
                    <div className="places-header">
                        <h3>Nearby {cat} Stores</h3>
                        <span className="route-hint">Tap a store → view its route → choose it</span>
                    </div>
                    {places.map((pl, i) => (
                        <div
                            key={pl.id || i}
                            className={`place-row ${activeStoreIdx === i ? 'active-store' : ''} ${chosenIdx === i ? 'chosen-store' : ''}`}
                            onClick={() => handleStoreSelect(i)}
                        >
                            <div className="place-rank" style={{
                                background: chosenIdx === i ? '#f39c12' : activeStoreIdx === i ? CAT_COLORS[cat] : '#f0f4ff',
                                color: (chosenIdx === i || activeStoreIdx === i) ? 'white' : '#0066ff'
                            }}>
                                {chosenIdx === i ? '✓' : i + 1}
                            </div>
                            <div className="place-info">
                                <div className="place-name">{pl.name}</div>
                                <div className="place-sub">
                                    {pl.type}
                                    {pl.opening && <> &nbsp;·&nbsp; 🕐 {pl.opening}</>}
                                </div>
                            </div>
                            <div className="place-right">
                                <div className="place-distance">📍 {formatDist(pl.distance)}</div>
                                {chosenIdx === i && <div className="route-active-badge" style={{background:'#fef3cd',color:'#856404'}}>🗺️ Chosen</div>}
                                {activeStoreIdx === i && chosenIdx !== i && <div className="route-active-badge">🗺️ Route Active</div>}
                            </div>
                        </div>
                    ))}

                    {/* Route info bar + Choose button */}
                    {activeRoute && (
                        <div className="route-info-bar">
                            <div className="route-info-left">
                                <span>🚗 <strong>{places[activeStoreIdx]?.name}</strong></span>
                                <span className="route-stats-pills">
                                    <span className="pill">📍 {formatDist(activeRoute.distanceTotal)}</span>
                                    <span className="pill">⏱ ~{formatTime(activeRoute.durationTotal)}</span>
                                </span>
                            </div>
                            {chosenIdx !== activeStoreIdx && (
                                <button className="btn-choose-route" onClick={handleChooseRoute}>
                                    ✅ Choose This Route
                                </button>
                            )}
                            {chosenIdx === activeStoreIdx && (
                                <button className="btn-mark-done-inline" onClick={() => setShowDoneModal(true)}>
                                    <CheckCircle size={14} /> Mark as Done
                                </button>
                            )}
                        </div>
                    )}
                    {routeLoading && !activeRoute && (
                        <div className="route-info-bar muted">⏳ Computing road route…</div>
                    )}
                </div>
            )}

            {/* ── Mini Map ── */}
            <div className="detail-map-wrap">
                <div className="map-label">
                    <MapPin size={13} /> Map
                    {position ? ` — ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : ' — GPS unavailable'}
                </div>
                <MapContainer center={[pos.lat, pos.lng]} zoom={14} className="detail-map" zoomControl={true}>
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
                        pathOptions={{ color: CAT_COLORS[cat], fillColor: CAT_COLORS[cat], fillOpacity: 0.07, weight: 2, dashArray: '5,4' }}
                    />
                    {activeRoute && (
                        <Polyline
                            positions={activeRoute.coordinates}
                            pathOptions={{ color: chosenIdx === activeStoreIdx ? '#f39c12' : CAT_COLORS[cat], weight: 5, opacity: 0.9, lineJoin: 'round' }}
                        />
                    )}
                    {places.map((pl, i) => (
                        <Marker key={i} position={[pl.lat, pl.lng]} icon={storeIcon(
                            chosenIdx === i ? '#f39c12' : i === activeStoreIdx ? CAT_COLORS[cat] : '#aaa',
                            i + 1, i === activeStoreIdx
                        )}>
                            <Popup>
                                <strong>{pl.name}</strong><br />
                                {CAT_EMOJI[cat]} {pl.type} · 📍 {formatDist(pl.distance)}
                                {pl.opening && <><br />🕐 {pl.opening}</>}
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
}
