/* GeoMind Live Map — Phase 8B+ with Overpass API & Smart Trip Grouping */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Zap, List } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { buildTripPlan } from '../services/overpassService';
import { fetchTripRoute } from '../services/routingService';
import './GeoMap.css';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const CAT_COLORS = { grocery:'#2ecc71', pharmacy:'#3498db', clothing:'#e67e22', general:'#9b59b6' };
const CAT_EMOJI  = { grocery:'🛒', pharmacy:'💊', clothing:'👕', general:'📌' };

/* Category-coloured teardrop marker */
const storeIcon = (category, stopNum) => L.divIcon({
    className: '',
    html: `<div style="
        position:relative;width:38px;height:38px;
        border-radius:50% 50% 50% 0;
        background:${CAT_COLORS[category]||'#666'};
        border:3px solid white;
        box-shadow:0 3px 10px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        font-size:16px;transform:rotate(-45deg);
        ">
          <span style="transform:rotate(45deg);line-height:1">${CAT_EMOJI[category]||'📌'}</span>
          <span style="
            position:absolute;top:-8px;right:-8px;
            transform:rotate(45deg);
            background:#0066ff;color:white;
            border-radius:50%;width:18px;height:18px;
            font-size:10px;font-weight:800;
            display:flex;align-items:center;justify-content:center;
            border:2px solid white;
          ">${stopNum}</span>
        </div>`,
    iconSize:   [38, 38],
    iconAnchor: [19, 38],
    popupAnchor:[0, -40],
});

/* Pulsing blue user-location dot */
const userIcon = L.divIcon({
    className: '',
    html: `<div class="pulse-ring"><div class="pulse-core"></div></div>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
});

function ClickHandler({ onMapClick }) {
    useMapEvents({ click: e => onMapClick(e.latlng) });
    return null;
}

function FlyTo({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) map.flyTo(position, map.getZoom(), { animate: true, duration: 1 });
    }, [position, map]);
    return null;
}

const formatDist = d => d < 1000 ? `${d}m` : `${(d/1000).toFixed(1)}km`;

export default function GeoMap({ apiUrl, tasks = [], showToast }) {
    const notify = showToast || console.log;
    const location = useLocation();
    const navigate = useNavigate();

    const [position,  setPosition]  = useState(() => {
        try {
            const saved = localStorage.getItem('geomind-pos');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return { lat: 25.432247, lng: 81.770706 };
    });
    const [radius,    setRadius]    = useState(2000);
    const [scanning,  setScanning]  = useState(false);
    const [tripPlan,  setTripPlan]  = useState(null);   // array of stops
    const [routeData, setRouteData] = useState(null);   // Polyline coords + ETA
    const [gpsActive, setGpsActive] = useState(false);
    const watchId = useRef(null);

    // Persist position when updated
    useEffect(() => {
        localStorage.setItem('geomind-pos', JSON.stringify(position));
    }, [position]);

    const basePendingTasks = tasks.filter(t => t.status !== 'triggered');
    const [activeTasks, setActiveTasks] = useState(location.state?.scanTasks || basePendingTasks);

    // Sync activeTasks if tasks from parent change
    useEffect(() => {
        if (!location.state?.scanTasks) {
            setActiveTasks(basePendingTasks);
        }
    }, [tasks]);

    /* ── Run smart scan ── */
    const runScan = useCallback(async (forcedTasks = null) => {
        const tasksToUse = forcedTasks || activeTasks;
        if (tasksToUse.length === 0) {
            notify('No pending tasks to scan for!', 'info');
            return;
        }
        setScanning(true);
        setTripPlan(null);
        setRouteData(null);
        try {
            const plan = await buildTripPlan(tasksToUse, position.lat, position.lng, radius);
            setTripPlan(plan);
            const stopsWithStore = plan.filter(s => s.store);
            
            if (stopsWithStore.length > 0) {
                const waypoints = [ position, ...stopsWithStore.map(s => ({ lat: s.store.lat, lng: s.store.lng })) ];
                const route = await fetchTripRoute(waypoints);
                if (route) setRouteData(route);
            }

            notify(
                `Trip plan ready — ${stopsWithStore.length} stop${stopsWithStore.length !== 1 ? 's' : ''} found! 🗺️`,
                'success'
            );
        } catch (err) {
            notify('Scan failed: ' + err.message, 'error');
        } finally {
            setScanning(false); 
        }
    }, [activeTasks, position, radius, apiUrl, notify]);

    /* ── GPS tracking ── */
    const startGPS = () => {
        if (!navigator.geolocation) { notify('Geolocation not supported', 'error'); return; }
        setGpsActive(true);
        watchId.current = navigator.geolocation.watchPosition(
            pos => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => { notify('GPS error: ' + err.message, 'error'); setGpsActive(false); },
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
    };
    const stopGPS = () => {
        if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
        setGpsActive(false);
    };
    useEffect(() => () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current); }, []);

    // Auto-scan if navigated from TaskManager "Scan Selected"
    useEffect(() => {
        if (location.state?.scanTasks?.length > 0) {
            const passed = location.state.scanTasks;
            setActiveTasks(passed);
            runScan(passed);
            // Clear state so it doesn't auto-scan on manual page reload
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state?.scanTasks, runScan, navigate, location.pathname]);

    const PRESETS = [
        { label: 'Divyasree Omega, HYD', lat: 17.45889, lng: 78.37302 },
        { label: 'Bengaluru',     lat: 12.9716, lng: 77.5946 },
        { label: 'Prayagraj',     lat: 25.4322, lng: 81.7707 },
        { label: 'Mumbai',        lat: 19.0760, lng: 72.8777 },
        { label: 'Delhi',         lat: 28.6139, lng: 77.2090 },
    ];

    return (
        <div className="geomap-page">
            {/* ── Sidebar ── */}
            <aside className="geomap-sidebar">

                {/* Position */}
                <div className="sidebar-section">
                    <h3 className="sidebar-title"><Navigation size={13}/> Your Position</h3>
                    <div className="coord-row">
                        <div className="coord-group">
                            <label>Lat</label>
                            <input type="number" step="0.000001" value={position.lat}
                                onChange={e => setPosition(p => ({...p, lat: parseFloat(e.target.value)||p.lat}))} />
                        </div>
                        <div className="coord-group">
                            <label>Lng</label>
                            <input type="number" step="0.000001" value={position.lng}
                                onChange={e => setPosition(p => ({...p, lng: parseFloat(e.target.value)||p.lng}))} />
                        </div>
                    </div>
                    <div className="preset-chips">
                        {PRESETS.map(p => (
                            <button key={p.label} className="chip"
                                onClick={() => { setPosition({ lat: p.lat, lng: p.lng }); setTripPlan(null); }}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="gps-row">
                        <button className={`btn-gps ${gpsActive ? 'active' : ''}`}
                            onClick={gpsActive ? stopGPS : startGPS}>
                            <MapPin size={13}/> {gpsActive ? '⏹ Stop GPS' : '▶ Live GPS'}
                        </button>
                        {gpsActive && <span className="gps-indicator">● Live</span>}
                    </div>
                </div>

                {/* Radius */}
                <div className="sidebar-section">
                    <h3 className="sidebar-title">🎯 Search Radius</h3>
                    <input type="range" min="500" max="5000" step="250"
                        value={radius} onChange={e => { setRadius(Number(e.target.value)); setTripPlan(null); }} />
                    <div className="radius-label">
                        <span style={{fontWeight:700}}>{formatDist(radius)}</span>
                        <span style={{color:'#aaa',fontSize:'11px'}}>
                            {radius < 1000 ? 'Tight zone' : radius < 2500 ? 'Neighbourhood' : 'City-wide'}
                        </span>
                    </div>
                </div>

                {/* Scan button */}
                <div className="sidebar-section">
                    <button className="btn-scan" onClick={() => runScan()} disabled={scanning || activeTasks.length === 0}>
                        <Zap size={15}/>
                        {scanning ? 'Scanning real places…' : `Scan All (${activeTasks.length} tasks)`}
                    </button>
                    <p className="scan-hint">
                        {activeTasks.length === 0
                            ? '✅ All tasks triggered!'
                            : '💡 Click map to reposition · Live Overpass data'}
                    </p>
                </div>

                {/* Trip Plan */}
                {tripPlan && (
                    <div className="sidebar-section trip-plan">
                        <h3 className="sidebar-title"><List size={13}/> Your Trip Plan</h3>
                        
                        {routeData && (
                            <div className="route-stats" style={{paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid #eee', fontSize: '13px'}}>
                                <span style={{color: '#666'}}>🚗 Drive Time: </span>
                                <strong>~{Math.round(routeData.durationTotal / 60)} mins</strong>
                                <span style={{color: '#aaa', fontSize: '11px', marginLeft: '6px'}}> ({formatDist(routeData.distanceTotal)})</span>
                            </div>
                        )}

                        {tripPlan.length === 0 ? (
                            <p className="no-match">No stores found in this radius</p>
                        ) : tripPlan.map(stop => (
                            <div key={stop.stop} className={`trip-stop ${!stop.store ? 'no-store' : ''}`}>
                                <div className="stop-header">
                                    <div className="stop-number">{stop.stop}</div>
                                    <div className="stop-info">
                                        <div className="stop-name">
                                            {stop.store
                                                ? stop.store.name
                                                : `No ${stop.category} store found`}
                                        </div>
                                        {stop.store && (
                                            <div className="stop-distance">
                                                {CAT_EMOJI[stop.category]} {stop.category} &nbsp;·&nbsp; 📍 {formatDist(stop.store.distance)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="stop-tasks">
                                    {stop.tasks.map(t => (
                                        <div key={t.id} className="stop-task-item">
                                            · {t.raw_text || t.text}
                                        </div>
                                    ))}
                                </div>
                                {stop.allPlaces?.length > 1 && (
                                    <details className="more-stores">
                                        <summary>{stop.allPlaces.length - 1} more nearby</summary>
                                        {stop.allPlaces.slice(1).map((pl, i) => (
                                            <div key={i} className="alt-store">
                                                {pl.name} — {formatDist(pl.distance)}
                                            </div>
                                        ))}
                                    </details>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pending task list */}
                {activeTasks.length > 0 && !tripPlan && (
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">Pending Tasks ({activeTasks.length})</h3>
                        <div className="task-legend">
                            {activeTasks.slice(0, 8).map(t => (
                                <div key={t.id} className="legend-item">
                                    <span style={{color: CAT_COLORS[t.category]}}>{CAT_EMOJI[t.category]||'📌'}</span>
                                    <span className="legend-text">{t.raw_text || t.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>

            {/* ── Leaflet Map ── */}
            <div className="geomap-canvas">
                <MapContainer
                    center={[position.lat, position.lng]}
                    zoom={14}
                    className="leaflet-map"
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <ClickHandler onMapClick={({ lat, lng }) => { setPosition({ lat, lng }); setTripPlan(null); }} />
                    <FlyTo position={[position.lat, position.lng]} />

                    {/* User pin */}
                    <Marker position={[position.lat, position.lng]} icon={userIcon}>
                        <Popup>
                            <b>📍 Your Position</b><br/>
                            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                            {gpsActive && <><br/><span style={{color:'#00b894'}}>● Live GPS active</span></>}
                        </Popup>
                    </Marker>

                    {/* Radius circle */}
                    <Circle
                        center={[position.lat, position.lng]}
                        radius={radius}
                        pathOptions={{ color:'#0066ff', fillColor:'#0066ff', fillOpacity:0.07, weight:2, dashArray:'6,4' }}
                    />

                    {/* Route line */}
                    {routeData && (
                        <Polyline 
                            positions={routeData.coordinates} 
                            pathOptions={{ color: '#0066ff', weight: 4, dashArray: '10, 8', opacity: 0.7 }} 
                        />
                    )}

                    {/* Store markers from trip plan — FIXED real coords */}
                    {tripPlan && tripPlan.map(stop => stop.store && (
                        <Marker
                            key={`stop-${stop.stop}`}
                            position={[stop.store.lat, stop.store.lng]}
                            icon={storeIcon(stop.category, stop.stop)}
                        >
                            <Popup>
                                <div style={{minWidth:'160px'}}>
                                    <strong style={{fontSize:'14px'}}>
                                        {CAT_EMOJI[stop.category]} {stop.store.name}
                                    </strong><br/>
                                    <span style={{color:'#666',fontSize:'12px'}}>
                                        {stop.store.type} &nbsp;·&nbsp; 📍 {formatDist(stop.store.distance)}
                                    </span>
                                    {stop.store.opening && (
                                        <><br/><span style={{fontSize:'11px',color:'#888'}}>🕐 {stop.store.opening}</span></>
                                    )}
                                    <hr style={{margin:'8px 0'}}/>
                                    <strong style={{fontSize:'11px',color:'#555'}}>Tasks at this stop:</strong>
                                    {stop.tasks.map(t => (
                                        <div key={t.id} style={{fontSize:'12px',paddingLeft:'6px'}}>
                                            · {t.raw_text || t.text}
                                        </div>
                                    ))}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
}
