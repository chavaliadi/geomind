# 🌍 GeoMind: Complete Project Summary

## 🎯 Purpose
GeoMind is an intelligent location-aware task management platform that acts as a **proactive, geospatial memory assistant**. Instead of manually managing a rigid to-do list, users can spontaneously add raw thoughts (e.g., "pick up asthma inhaler"). GeoMind uses a Machine Learning Natural Language Processing (NLP) engine to automatically infer the category of the task (Pharmacy), continuously tracking the user's GPS position in the background. When the user naturally wanders near a relevant, verified location, GeoMind triggers a notification and supplies optimal driving routes to seamlessly integrate chores into their daily travel.

---

## 🛠️ Technology Stack
We engineered GeoMind using a modern, scalable, and decoupled microservices architecture:

- **Web Dashboard (Frontend)**: `React` + `Vite` + `TailwindCSS`
  - Leverages **Leaflet** (`react-leaflet`) for interactive maps.
  - Powered by **Clerk** for secure, enterprise-grade authentication.
- **Mobile Application (Frontend)**: `React Native` + `Expo SDK 53`
  - Built with **Expo Router** for deep-linkable, file-based routing.
  - Features custom dual-mode authentication (Guest mode vs JWT storage using `AsyncStorage`) to bypass native WebView login restrictions.
  - Directly hosts Leaflet map injection via `react-native-webview` to achieve perfect Web-to-Mobile feature parity without Google Maps API keys.
- **Backend API Server**: `Node.js` + `Express`
  - Connects out to a heavily typed **PostgreSQL** database using the generic `pg` driver (no ORM bloat).
  - Employs a **Dual-Auth Middleware** (intercepts `X-Guest-ID`, mobile JWT tokens, or Web Clerk tokens) seamlessly routing network traffic.
- **Machine Learning API**: `Python` + `FastAPI`
  - Vectorizes task descriptions via **Scikit-Learn TF-IDF**.
  - Classifies intents using **Logistic Regression / Support Vector Classifiers**. 
  - Hosts `app.py` endpoints for instantaneous task categorization and closed-loop feedback retraining.
- **External Data Engines**: 
  - **Overpass API (OSM)**: Scrapes the globe for verified, highly accurate Points of Interest (Grocery, Clothing, Clinics) free of charge.
  - **OSRM (Open Source Routing Machine)**: Calculates true drive-time and road distances instead of simple straight-line "as the crow flies" math.

---

## ⭐ What Makes This Project Stand Out?
1. **The Active Learning Feedback Loop**: GeoMind doesn't just guess what your task is; it learns from its mistakes. If the ML engine categorizes "get apples" as `General` and you correct it after visiting a grocery store, that feedback rating is stored. The system automatically pipelines this data to retrain the ML model dynamically—making the entire app exponentially smarter based on actual human behavior.
2. **"Ghost Mode" Frictionless Onboarding**: By intercepting server auth locally and using ephemeral `AsyncStorage` identifiers (`X-Guest-ID`), users can instantly experience the ML categorizer and Maps right after launching the app on mobile, removing the "Login Wall" bounce rate completely.
3. **Open-Source Geospatial Supremacy**: Completely sidesteps the massive latency, high cost, and native-compilation headaches of the Google ecosystem by building a custom geospatial bridge across Leaflet, OpenStreetMap, and OSRM inside a singular unified platform.
4. **Resilient Dual-Authentication**: The backend intelligently splits auth. A single Node.js `protect` route seamlessly reads whether the incoming request is a rich Clerk-backed Website session, a long-lived JWT from a registered mobile user, or an anonymous Mobile Guest—without dropping requests or throwing 401 errors.

---

## 🚀 How We Built It (Our Journey)

1. **Foundations (The Web & Backend)**: We started by establishing the PostgreSQL schema. We deployed the React Web Dashboard to allow tasks to be created, read, updated, and deleted, relying heavily on Clerk for identity management.
2. **The ML Brain**: We launched the Python FastAPI server on port `5001`. We wrote the integration scripts so that the Node backend acts as a bridge; the moment a user types a task, Node intercepts it, fires it to Python for ML categorization, and saves both the intended task and its ML tag to the database.
3. **Advanced Geospatial Overlays**: We integrated the Overpass API directly into our node endpoints to fetch the 5 best stores within a 2000m radius of the user's active GPS. Then, we fed those coordinates through OSRM to map out actionable travel times. We displayed these on the web using custom interactive Leaflet markers.
4. **Mobile Auth Overhaul**: When translating to mobile, native wrappers broke our flow. We dynamically stripped out `ClerkProvider` from Expo, rewrote the Node backend with custom bcrypt logic, and engineered our own local JWT context wrapper (`AuthContext`) inside `_layout.tsx` to handle secure login securely.
5. **Mobile Feature Parity**: We faced the challenge of translating Web Maps to Expo Go. Instead of compiling heavy native Google plugins, we smartly injected lightweight `Leaflet HTML` natively into `react-native-webview`, rendering beautiful UI components right alongside our React Native elements.

---
### 📊 Codebase Health Summary
- `server/`: Lightweight, modular API endpoints. Custom DB pooling and dual-auth middleware are cleanly abstracted away from the core routing logic.
- `ml/`: Strictly decoupled from the primary server. It can safely crash or reboot without bringing down the user interface, acting as a true, autonomous microservice.
- `mobile/`: Clean `expo-router` architecture. Centralized API requests in `services/api.ts` handle the heavy lifting (token appending, error catching) so the `.tsx` UI components remain completely logic-free and highly performant.
- `web/`: Component-driven React UI relying entirely on TailwindCSS for responsive design without locking into massive proprietary CSS frameworks.
