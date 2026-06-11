/**
 * SmartBundle.jsx — Phase 1 Web UI
 * 
 * The centrepiece of Phase 1: shows the bundle resolver + route optimizer
 * as a single, interactive panel on the GeoMind Dashboard.
 *
 * Features:
 *  - "Plan My Errands" button → calls /api/smart-bundle with real GPS coords
 *  - Store cards ranked by coverage + urgency
 *  - Urgency heat badges per task
 *  - Leaflet map with numbered waypoint pins + OSRM route polyline
 *  - Timeline sidebar: Stop 1 → Stop 2 → Done ✓
 */

import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './SmartBundle.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// ── Category config ───────────────────────────────────────────────────────────
const CAT = {
  grocery:  { emoji: '🛒', color: '#2ecc71', label: 'Grocery'  },
  pharmacy: { emoji: '💊', color: '#3498db', label: 'Pharmacy' },
  clothing: { emoji: '👕', color: '#e67e22', label: 'Clothing' },
  general:  { emoji: '📌', color: '#9b59b6', label: 'General'  },
};

// ── Urgency badge helpers ─────────────────────────────────────────────────────
function urgencyLabel(score) {
  if (score >= 0.75) return { text: '🔴 Critical', cls: 'urg-critical' };
  if (score >= 0.50) return { text: '🟠 High',     cls: 'urg-high'     };
  if (score >= 0.25) return { text: '🟡 Medium',   cls: 'urg-medium'   };
  return               { text: '🟢 Low',      cls: 'urg-low'      };
}

// ── Numbered Leaflet icons ────────────────────────────────────────────────────
function numberedIcon(num, color = '#0066FF') {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:14px;
      border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);">${num}</div>`,
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
    popupAnchor:[0, -20],
  });
}

function userIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:20px;height:20px;border-radius:50%;
      background:#0066FF;border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(0,102,255,0.25);"></div>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  });
}

// ── Map auto-fit helper ───────────────────────────────────────────────────────
function MapFitter({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

// ── Format helpers ────────────────────────────────────────────────────────────
const fmt = {
  dist: m  => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`,
  time: s  => s ? `${Math.round(s / 60)} min` : '—',
  mins: m  => m != null ? `${m} min` : '—',
};

// ═════════════════════════════════════════════════════════════════════════════
export default function SmartBundle({ tasks = [] }) {
  const [state,    setState]    = useState('idle'); // idle | loading | done | error
  const [data,     setData]     = useState(null);
  const [userPos,  setUserPos]  = useState(null);
  const [error,    setError]    = useState('');
  const mapRef = useRef(null);

  const pendingCount = tasks.filter(t => t.status === 'pending').length;

  // ── Trigger bundle ──────────────────────────────────────────────────────────
  const runBundle = async () => {
    setState('loading');
    setError('');
    setData(null);

    // 1. Get GPS
    let pos;
    try {
      pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          err => reject(err),
          { timeout: 8000, enableHighAccuracy: true }
        );
      });
    } catch {
      setError('GPS access denied. Please allow location access and try again.');
      setState('error');
      return;
    }

    setUserPos(pos);

    // 2. Call /api/smart-bundle
    try {
      const res = await axios.get(`${API_URL}/api/smart-bundle`, {
        params: { lat: pos.lat, lng: pos.lng, radius: 2500 },
      });
      setData(res.data);
      setState('done');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Bundle failed');
      setState('error');
    }
  };

  // ── Map data derivation ─────────────────────────────────────────────────────
  const mapPoints = [];
  if (userPos) mapPoints.push({ lat: userPos.lat, lng: userPos.lng, isUser: true });
  if (data?.route?.ordered_stops) {
    data.route.ordered_stops.forEach(s => {
      if (s?.lat && s?.lng) mapPoints.push({ lat: s.lat, lng: s.lng, name: s.name, category: s.category });
    });
  }

  const polyline = data?.route?.geometry || null; // [[lat, lng], ...]

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="sb-root" id="smart-bundle-panel">
      {/* ── Header ── */}
      <div className="sb-header">
        <div className="sb-title-block">
          <h2 className="sb-title">🧭 Plan My Errands</h2>
          <p className="sb-subtitle">
            GeoMind finds the best nearby stores for all your pending tasks, then builds the optimal route.
          </p>
        </div>
        <button
          id="plan-errands-btn"
          className={`sb-btn ${state === 'loading' ? 'sb-btn--loading' : ''}`}
          onClick={runBundle}
          disabled={state === 'loading' || pendingCount === 0}
        >
          {state === 'loading' ? (
            <><span className="sb-spinner" />  Analysing…</>
          ) : (
            <><span>🗺️</span> Plan {pendingCount} Errand{pendingCount !== 1 ? 's' : ''}</>
          )}
        </button>
      </div>

      {pendingCount === 0 && state === 'idle' && (
        <div className="sb-empty">📭 No pending tasks. Add some tasks first.</div>
      )}

      {state === 'error' && (
        <div className="sb-error">❌ {error}</div>
      )}

      {/* ── Results ── */}
      {state === 'done' && data && (
        <div className="sb-results">

          {/* Summary bar */}
          <div className="sb-summary">
            <div className="sb-summary-chip">
              <span className="sb-summary-icon">📋</span>
              <span>{data.summary.total_tasks} tasks</span>
            </div>
            <div className="sb-summary-chip">
              <span className="sb-summary-icon">🏪</span>
              <span>{data.summary.categories_covered}/{data.summary.total_categories} stores found</span>
            </div>
            {data.summary.estimated_time_min != null && (
              <div className="sb-summary-chip sb-summary-chip--highlight">
                <span className="sb-summary-icon">⏱️</span>
                <span>~{data.summary.estimated_time_min} min total</span>
              </div>
            )}
            {data.summary.high_urgency_count > 0 && (
              <div className="sb-summary-chip sb-summary-chip--urgent">
                <span className="sb-summary-icon">🔴</span>
                <span>{data.summary.high_urgency_count} urgent</span>
              </div>
            )}
          </div>

          <div className="sb-body">

            {/* LEFT: Bundle cards */}
            <div className="sb-cards">
              {data.bundles.map((bundle, i) => {
                const meta      = CAT[bundle.category] || CAT.general;
                const stopIndex = (data.route?.ordered_stops || [])
                  .findIndex(s => s.category === bundle.category) + 1;

                return (
                  <div
                    key={bundle.category}
                    className={`sb-card ${bundle.store_found ? '' : 'sb-card--no-store'}`}
                    id={`bundle-card-${bundle.category}`}
                  >
                    <div className="sb-card-head">
                      <div className="sb-card-cat">
                        <span className="sb-cat-emoji">{meta.emoji}</span>
                        <span className="sb-cat-label" style={{ color: meta.color }}>{meta.label}</span>
                        {stopIndex > 0 && (
                          <span className="sb-stop-badge" style={{ background: meta.color }}>
                            Stop {stopIndex}
                          </span>
                        )}
                      </div>
                      <div className="sb-card-urg">
                        avg urgency {Math.round(bundle.avg_urgency * 100)}%
                      </div>
                    </div>

                    {bundle.best_store ? (
                      <div className="sb-store-info">
                        <div className="sb-store-name">🏪 {bundle.best_store.name}</div>
                        <div className="sb-store-meta">
                          <span>📍 {fmt.dist(bundle.best_store.distance_m)}</span>
                          {bundle.best_store.opening_hours && (
                            <span className="sb-store-hours">🕐 {bundle.best_store.opening_hours}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="sb-no-store">⚠️ No {meta.label} store found nearby</div>
                    )}

                    <div className="sb-task-list">
                      {bundle.tasks.map(task => {
                        const urg = urgencyLabel(parseFloat(task.urgency_score));
                        return (
                          <div key={task.id} className="sb-task-row">
                            <span className="sb-task-text">{task.text}</span>
                            <span className={`sb-urg-badge ${urg.cls}`}>{urg.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: Map + Timeline */}
            <div className="sb-right">

              {/* Leaflet Map */}
              {mapPoints.length > 0 && (
                <div className="sb-map-wrap">
                  <MapContainer
                    center={[userPos.lat, userPos.lng]}
                    zoom={14}
                    className="sb-map"
                    ref={mapRef}
                    zoomControl={true}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
                    />
                    <MapFitter points={mapPoints} />

                    {/* User position */}
                    <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()}>
                      <Popup>📍 Your Location</Popup>
                    </Marker>

                    {/* Numbered stop markers */}
                    {(data.route?.ordered_stops || []).map((stop, idx) => {
                      if (!stop?.lat || !stop?.lng) return null;
                      const meta = CAT[stop.category] || CAT.general;
                      return (
                        <Marker
                          key={`stop-${idx}`}
                          position={[stop.lat, stop.lng]}
                          icon={numberedIcon(idx + 1, meta.color)}
                        >
                          <Popup>
                            <strong>Stop {idx + 1}: {stop.name}</strong>
                            <br />{meta.emoji} {meta.label}
                          </Popup>
                        </Marker>
                      );
                    })}

                    {/* OSRM route polyline */}
                    {polyline && (
                      <Polyline
                        positions={polyline}
                        color="#0066FF"
                        weight={4}
                        opacity={0.75}
                        dashArray="8, 4"
                      />
                    )}
                  </MapContainer>
                </div>
              )}

              {/* Route Timeline */}
              {data.route && (
                <div className="sb-timeline">
                  <div className="sb-timeline-title">🗺️ Optimised Route</div>

                  {/* Start */}
                  <div className="sb-timeline-item sb-timeline-start">
                    <div className="sb-tl-dot sb-tl-dot--user" />
                    <div className="sb-tl-content">
                      <span className="sb-tl-label">📍 Your Location</span>
                    </div>
                  </div>

                  {/* Stops */}
                  {(data.route.ordered_stops || []).map((stop, idx) => {
                    const meta = CAT[stop?.category] || CAT.general;
                    const leg  = data.route.legs?.[idx];
                    return (
                      <div key={idx} className="sb-timeline-item">
                        <div className="sb-tl-line" />
                        <div className="sb-tl-dot" style={{ background: meta.color }} />
                        <div className="sb-tl-content">
                          <span className="sb-tl-stop">{idx + 1}. {stop?.name}</span>
                          <span className="sb-tl-meta">
                            {meta.emoji} {meta.label}
                            {leg && <> &nbsp;·&nbsp; {fmt.dist(leg.distance_m)} · {fmt.mins(leg.time_min)}</>}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="sb-timeline-total">
                    <span>Total distance: {fmt.dist(data.route.total_distance_m)}</span>
                    {data.route.total_time_min != null && (
                      <span>Estimated time: ~{data.route.total_time_min} min</span>
                    )}
                    {!data.route.osrm_used && (
                      <span className="sb-tl-fallback">⚠️ Straight-line estimate (OSRM unavailable)</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
