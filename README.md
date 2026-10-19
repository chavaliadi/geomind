# GeoMind

**Errand batching and route optimization.** Type tasks in plain language — *"pick up asthma inhaler before dinner"* — and GeoMind infers what kind of place you need, groups tasks that share a destination type, finds real stores nearby, and computes an efficient visit order.

> **Status:** working prototype. The web dashboard and backend are functional end to end. Proactive background reminders are **not** implemented — see [Known limitations](#known-limitations) before evaluating this as a finished product.

<!-- TODO: add live demo link + 60s screen recording here -->

---

## What this project is actually about

The interesting engineering here isn't the text classifier — it's the orchestration layer around it. Every external dependency in the request path can fail, and the system is built so that none of them take the product down:

| Dependency | Failure mode | What happens |
|---|---|---|
| Overpass OSM (live store data) | Outage, rate limit, timeout | Falls back to locally stored POIs in PostGIS; whole-request deadline caps the wait at 8s |
| OSRM (route optimization) | Non-200, malformed payload, socket error | Falls back to Haversine-ordered route; the response flags which router produced it, and the user is told |
| ML service (categorization) | Low confidence (<0.60) | Cosine similarity against category centroids assigns a label rather than failing |

The response also carries an `explainability` array so the user sees *why* a store was chosen — distance, urgency, prior visits, and whether the route came from the real router or the estimate.

### Spatial indexing: a bug worth describing

The proximity query compares a `geometry` column against `ST_GeogFromText(...)`, which forces a `geom::geography` cast. A plain `GIST (geom)` index **cannot serve that cast** — so every location check was silently doing a full sequential scan.

Benchmarked on 100,018 rows (Prayagraj bounding box, synthetic):

```
Before:  Parallel Seq Scan on places     1,135.94 ms
After:   Bitmap Index Scan on idx_places_geom   70.53 ms
```

~16x faster. Fixed by migrating `places.geom` to `geography(Point, 4326)` so the column index is used natively, rather than adding an expression index and requiring every future query to remember the cast syntax.

Raw plans: [`docs/perf/explain-before.txt`](docs/perf/explain-before.txt) · [`docs/perf/explain-after.txt`](docs/perf/explain-after.txt)

---

## Architecture

```mermaid
graph TD
    subgraph Clients
        Web["React Dashboard<br/>(Clerk auth, Leaflet)"]
        Mobile["Expo Client<br/>(JWT + guest auth)"]
    end

    subgraph Backend ["Express Gateway :3000"]
        AuthMid["Dual-Auth Middleware<br/>Clerk / JWT / Guest"]
        TaskEnd["Task Router"]
        BundleRouter["Errand Bundler"]
        GeoTrigger["PostGIS Proximity Engine"]
    end

    DB[(PostgreSQL + PostGIS)]

    subgraph MLService ["FastAPI ML Service :5001"]
        MLApp["Classifier + Urgency Scorer"]
    end

    subgraph External
        OSRM["OSRM /trip (TSP)"]
        Overpass["Overpass OSM"]
    end

    Web & Mobile --> AuthMid
    AuthMid --> TaskEnd & BundleRouter & GeoTrigger
    TaskEnd & BundleRouter & GeoTrigger --> DB
    TaskEnd --> MLApp
    BundleRouter -.->|fallback to DB| OSRM
    BundleRouter -.->|fallback to DB| Overpass
```

### Component responsibilities

**Server gateway (`server/`)**
Responsible for client authentication, task CRUD operations, live location proximity triggering, and orchestrating the smart bundle recommendation pipeline. It serves as the single entry point for both web and mobile clients, handling communication with PostgreSQL, delegating NLP categorization to the FastAPI service, querying live OpenStreetMap nodes via Overpass, and requesting TSP routes from OSRM.
- **Main files:** [`server/index.js`](server/index.js), [`server/middleware/auth.js`](server/middleware/auth.js), [`server/routes/bundles.js`](server/routes/bundles.js), [`server/routes/route.js`](server/routes/route.js), [`server/routes/auth.js`](server/routes/auth.js)
- **Protocols:** Inbound HTTP/REST on port 3000 (JSON); outbound PostgreSQL wire protocol via `pg` connection pool; outbound HTTP to FastAPI (:5001), Overpass API, and OSRM demo server.
- **Reader note:** The server executes dynamic DDL queries on startup in `server/index.js` and `server/routes/auth.js` (`CREATE TABLE IF NOT EXISTS trigger_events`, `CREATE TABLE IF NOT EXISTS mobile_users`, and column migrations on `user_habits`), meaning parts of the schema are instantiated by server initialization rather than migration scripts.

**ML service (`ml/`)**
Responsible for predicting task categories (`grocery`, `pharmacy`, `clothing`, `general`) and scoring task urgency (0.0 to 1.0) from raw task strings. It runs an offline-trained TF-IDF vectorizer and Logistic Regression pipeline with a centroid similarity fallback for low-confidence inferences, and records user corrections to disk.
- **Main files:** [`ml/app.py`](ml/app.py), [`ml/train.py`](ml/train.py), [`ml/preprocessing.py`](ml/preprocessing.py), [`ml/similarity.py`](ml/similarity.py), [`ml/evaluate.py`](ml/evaluate.py), [`ml/config.py`](ml/config.py)
- **Protocols:** Inbound HTTP/REST on port 5001 via FastAPI/Uvicorn (JSON).
- **Reader note:** Model binaries (`.pkl`) are not committed to git and are not trained automatically on startup. If `train.py` has not been run manually, the service boots, reports `status: "ok"` on `/health`, but returns 503 on `/predict`, causing the Express gateway to silently default all tasks to `"general"`.

**Web dashboard (`web/`)**
Responsible for providing a desktop management interface for tasks, errand bundles, interactive Leaflet route visualization, and historical analytics.
- **Main files:** [`web/src/App.jsx`](web/src/App.jsx), [`web/src/components/TaskManager.jsx`](web/src/components/TaskManager.jsx), [`web/src/components/SmartBundle.jsx`](web/src/components/SmartBundle.jsx), [`web/src/components/GeoMap.jsx`](web/src/components/GeoMap.jsx), [`web/src/components/Dashboard.jsx`](web/src/components/Dashboard.jsx)
- **Protocols:** Inbound user browser interactions; outbound HTTPS to Express gateway (:3000) using Axios with Clerk session bearer tokens; outbound HTTPS to CartoDB tile servers for map tiles.
- **Reader note:** Web authentication relies completely on Clerk UI components and third-party servers; unauthenticated users cannot access core web dashboard features without an active Clerk session.

**Mobile client (`mobile/`)**
Responsible for errand management on iOS and Android devices, providing task creation with client-side ML suggestions, a task list with batch actions, and store inspection.
- **Main files:** [`mobile/app/_layout.tsx`](mobile/app/_layout.tsx), [`mobile/app/index.tsx`](mobile/app/index.tsx), [`mobile/app/tasks/index.tsx`](mobile/app/tasks/index.tsx), [`mobile/app/tasks/[id].tsx`](mobile/app/tasks/[id].tsx), [`mobile/services/api.ts`](mobile/services/api.ts)
- **Protocols:** Outbound HTTP to Express gateway (:3000) and ML service (:5001) using Fetch API with custom JWT or `X-Guest-ID` headers.
- **Reader note:** `mobile/services/api.ts` defaults to `http://localhost:3000` and `http://localhost:5001`, so the app will not reach the backend from a physical device or Android emulator without setting `.env` to the host machine's LAN IP. Additionally, maps are rendered by injecting an HTML string with Leaflet into a `react-native-webview` rather than using native map components.

**Database layer (`PostgreSQL + PostGIS`)**
Responsible for persistent storage of tasks, seeded and discovered places, trigger event audit logs, user store preferences, and spatial proximity calculations.
- **Main files:** [`server/migrations/001_phase1_smart_errand.sql`](server/migrations/001_phase1_smart_errand.sql), [`server/seed.sql`](server/seed.sql)
- **Protocols:** PostgreSQL wire protocol (default port 5432 / Docker port 5434).
- **Reader note:** Geographic distance calculations in meters run directly on `geography(Point, 4326)` columns backed by a GIST spatial index (`idx_places_geom`).

---

### Request walkthrough

Here is the concrete trace of a user entering *"pick up asthma inhaler before dinner"* and subsequently opening the smart bundle view:

```
[Client: Web / Mobile]
       │
       │ 1. POST /api/tasks { text: "pick up asthma inhaler before dinner", priority: "medium" }
       ▼
[server/middleware/auth.js:18-47]
       │ 2. Dual-auth: checks Bearer JWT -> X-Guest-ID -> Clerk session. Sets req.auth = { userId }.
       ▼
[server/index.js:144-308 (taskCreateHandler)]
       │
       │ 3. Category omitted -> fires parallel HTTP requests (lines 180-234):
       ├───► POST :5001/predict { text }  ──► [ml/app.py:153-176]
       │                                         Vectorize -> LogisticRegression -> returns "pharmacy" (conf >= 0.60).
       │                                         [Fallback: if conf < 0.60, cosine similarity centroid check runs].
       │                                         [Silent failure: if models missing, /predict returns 503 and
       │                                          gateway silently defaults category to "general" (index.js:192-212)].
       │
       └───► POST :5001/urgency { text }  ──► [ml/app.py:143-150]
                                                 Regex tier match: "inhaler" triggers Tier 2 (+0.30 score).
                                                 [created_at is not passed by gateway; time decay is bypassed].
       │
       │ 4. INSERT INTO smart_tasks (user_id, raw_text, category, priority, status, radius_meters, urgency_score)
       │    VALUES ($1, $2, 'pharmacy', 'medium', 'pending', 1000, 0.30) (lines 237-247).
       ▼
[Later: User opens bundle view]
       │
       │ 5. GET /api/smart-bundle?lat=25.4322&lng=81.7707&radius=2000
       ▼
[server/routes/bundles.js:250-392]
       │ 6. Loads pending tasks for user (lines 269-275) -> grouped into category 'pharmacy'.
       │ 7. Loads store habit history from user_habits (lines 70-87).
       │ 8. Global 8s deadline starts: const overpassCtrl = new AbortController() (lines 290-293).
       │    Fires Overpass query for pharmacies within 2000m (lines 294-308).
       │    [Fallback: on Overpass timeout or failure, lines 304 query local PostGIS places table via ST_DWithin].
       │ 9. Ranks candidate stores via min(1.0, visits * 0.15 + max(0, rating - 3) * 0.2) (lines 89-104).
       │10. If >= 2 stops with stores, calls OSRM /trip with 10s timeout (lines 201-247).
       │    [Fallback: on OSRM timeout or non-200, returns Haversine straight-line route with osrm_used: false].
       │    [Single stop: returns direct distance estimate without calling external router].
       │    [Zero stores found across all categories: returns route: null].
       │11. Assembles explainability array (distance, priority, urgency, router status) and returns JSON.
```

---

### Tech stack

Dependencies read directly from `server/package.json`, `ml/requirements.txt`, `web/package.json`, and `mobile/package.json`:

| Technology | Version | What it does here | Tradeoff |
|---|---|---|---|
| **express** | `^5.2.1` | HTTP web framework and REST API routing gateway in `server/` | Express 5 has async error handling, but the middleware ecosystem predominantly targets Express 4; routes require manual error propagation |
| **pg** | `^8.18.0` | PostgreSQL client with connection pooling for database operations | Raw SQL queries with no ORM abstraction; spatial geometry parsing and migrations must be written by hand |
| **@clerk/clerk-sdk-node** | `^4.13.23` | Authenticates Clerk session tokens from the web dashboard in `server/middleware/auth.js` | Proprietary external vendor dependency for web authentication, creating an architectural split with the mobile JWT implementation |
| **jsonwebtoken** | `^9.0.3` | Signs and verifies HMAC-SHA256 tokens for mobile client authentication | Stateless tokens cannot be revoked before expiration without maintaining a database-backed token blocklist |
| **bcryptjs** | `^3.0.3` | Hashes and compares mobile user passwords in `server/routes/auth.js` | Pure JavaScript implementation is portable but significantly slower under CPU load than native C-bindings |
| **cors** | `^2.8.6` | Configures Cross-Origin Resource Sharing headers on API routes | Permissive defaults if `CORS_ORIGINS` is not defined in the environment |
| **dotenv** | `^17.2.3` | Loads `.env` file variables into `process.env` in `server/` | Fails silently when `.env` is absent; does not validate presence or types of required variables at boot |
| **fastapi** | `0.135.2` | ASGI web framework serving `/predict`, `/urgency`, `/health`, and `/feedback` | Synchronous CPU-bound ML model inference in async handlers can block the Python event loop under high concurrent traffic |
| **uvicorn** | `0.42.0` | ASGI application server hosting the FastAPI service on port 5001 | Runs as a single process in development mode; lacks process supervision or automatic worker restart |
| **scikit-learn** | `1.8.0` | Computes TF-IDF features and runs Logistic Regression classification | Model serialization via `joblib` binds pickled artifacts to specific scikit-learn and Python versions |
| **pandas** | `3.0.1` | Ingests CSV training and feedback data during training in `ml/train.py` | Substantial memory footprint and slow import times for simple tabular file reads |
| **pydantic** | `2.12.5` | Validates inbound JSON payloads on FastAPI endpoints | Schema validation adds parsing overhead to microsecond-level prediction calls |
| **nltk** | `3.9.3` | Stopword list filtering during text preprocessing in `ml/preprocessing.py` | Requires pre-downloaded corpora; runtime corpus downloads fail in offline or air-gapped environments |
| **joblib** | `1.5.3` | Serializes and loads trained classifier, vectorizer, and prototype matrices | Loading untrusted pickle files is an arbitrary code execution risk |
| **react** / **react-dom** | `^18.2.0` (web) | UI component runtime for the web dashboard | React 18 concurrent features remain largely unused in this codebase |
| **react-scripts** | `5.0.1` | Create React App build and bundling tooling in `web/` | Create React App is deprecated, slow to build, and unmaintained by the React team |
| **leaflet** / **react-leaflet** | `^1.9.4` / `^4.2.1` | Renders interactive maps, store markers, and polyline routes on web | Uses DOM-based Leaflet instead of modern WebGL vector tiles; rendering degrades with dense marker sets |
| **@clerk/clerk-react** | `^5.61.4` | User sign-in, session provider, and authentication hooks on web | Heavy client bundle size and vendor lock-in; web dashboard cannot operate without Clerk availability |
| **axios** | `^1.6.0` | HTTP client for web frontend API communication | Redundant with native `window.fetch`, adding unnecessary client bundle weight |
| **react-router-dom** | `^6.20.0` | Client-side routing across dashboard views | Extra routing complexity for an application structured largely as a single-page dashboard |
| **recharts** | `^2.10.0` | SVG charting library for the analytics view in `web/src/components/Analytics.jsx` | Heavy D3/SVG dependencies that noticeably increase the vendor bundle size |
| **expo** | `~54.0.33` | Development framework and tooling for the React Native mobile app | Expo Go sandbox blocks custom native code and background services, forcing foreground stubs |
| **react** / **react-native** | `19.1.0` / `0.81.5` | React Native runtime powering mobile components | React 19 / RN 0.81 New Architecture compatibility issues across older third-party React Native packages |
| **expo-router** | `~6.0.23` | File-based navigation structure in `mobile/app/` | Enforces rigid filesystem conventions and nested layout contexts |
| **react-native-webview** | `13.15.0` | Embedded browser view for rendering Leaflet map HTML inside mobile | Used as a workaround to avoid native map configuration; incurs high memory overhead, sluggish touch gestures, and WebView startup lag |
| **expo-location** | `~19.0.8` | Device GPS coordinate querying in `mobile/app/index.tsx` | Only provides foreground location fixes; true background tracking requires an Expo Dev Build with `expo-task-manager` |
| **expo-notifications** | `~0.32.16` | Push and local notification manager | Completely stubbed out in code (`Notifications = null`) due to runtime incompatibilities inside Expo Go |
| **@react-native-async-storage/async-storage** | `2.2.0` | Persistent key-value storage for JWT and guest tokens on mobile | Unencrypted storage; tokens and guest identifiers are stored in plaintext on disk |
| **@clerk/clerk-expo** | `^2.19.31` | Listed in `mobile/package.json` | *Dead dependency:* Abandoned after migrating mobile to custom JWT; unused code bundled in `package.json` |

---

### Repository layout

```
Geomind/
├── .agents/                 Agent skill configurations and IDE workflow rules
├── docs/                    Performance benchmarks and architecture plans
│   └── perf/                Query EXPLAIN plans before and after spatial indexing
├── ml/                      FastAPI NLP microservice for categorization and urgency
│   ├── data/                Training datasets and offline feedback CSV
│   └── models/              Serialized TF-IDF vectorizer and logistic regression pickles
├── mobile/                  Expo React Native mobile application
│   ├── app/                 File-based router screens (home, tasks, auth)
│   └── services/            API, routing, and Overpass network client helpers
├── server/                  Express API server and PostGIS orchestration gateway
│   ├── middleware/          Dual-auth validation (Clerk, JWT, Guest ID)
│   ├── migrations/          PostgreSQL + PostGIS schema migration scripts
│   ├── routes/              Authentication, smart bundle, and route endpoints
│   └── test/                Node test runner integration and fallback tests
└── web/                     React web dashboard (Create React App)
    ├── public/              Static HTML index and application assets
    └── src/                 React UI components, services, and Leaflet styles
```

---

## Known limitations

Listed plainly because they determine whether this is useful to you.

**No background operation.** Location tracking is a foreground `setInterval` polling every 2 minutes, and push/local notifications are stubbed out (`Notifications = null`) due to native module incompatibility in Expo Go SDK 54. The app only checks proximity while open and on screen. Making this work requires an Expo Dev Client with `expo-task-manager` and `expo-location` registering OS-level geofences — a known, scoped piece of work that has not been done.

**In practice this means GeoMind currently works as a trip planner, not a proactive reminder system.** Open it, see your batched errands, get a route.

**Store opening hours are ignored.** Raw OSM `opening_hours` strings are passed through and displayed, but nothing parses or filters on them. The router will happily send you to a closed pharmacy.

**Urgency time-decay is inert.** The scorer implements an age-based boost (+0.10 at 3 days, +0.20 at 7), but the server never passes `created_at`, and urgency is computed once at task creation when age is always zero. The code path exists and is unreachable.

**Feedback never retrains anything.** Client corrections append to `ml/data/feedback_data.csv`. `train.py` can ingest that file, but no scheduler, worker, or endpoint ever invokes it. Retraining is a manual offline step.

**`/location` issues N+1 queries.** Pending tasks are evaluated in a loop, each doing its own SELECT, UPDATE, and INSERT. At 50 pending tasks that's ~150 round-trips per location ping. Needs rewriting as a single batched query with a `LATERAL` join.

**`/health` is partially honest.** Database and ML service are genuinely probed. OSRM and Overpass status are read from environment variables, not checked.

**External services are demo infrastructure.** Public Overpass endpoints and the OSRM demo server are community resources with usage limits that forbid production or commercial traffic. Any real deployment needs self-hosted OSRM (Docker + a regional `.osm.pbf` extract) and either a self-hosted Overpass instance or a commercial POI provider.

**Test coverage is thin.** 10 tests covering the OSRM fallback path and the proximity query. No frontend, mobile, or ML tests.

**The ML `/feedback` endpoint ([`ml/app.py:207-220`](ml/app.py#L207-L220)) appends raw request bodies to the training CSV with no authentication and no validation.** Anything that can reach port 5001 can write arbitrary rows into training data.

**The ML service reports status "ok" on `/health` even when model pickles failed to load.** Only `/predict` reveals the failure, via HTTP 503.

**`GET /api/smart-bundle` returns `route: null` when zero stores are found across all categories.** This is intended behaviour — there is no route to return — not the OSRM failure case, which always falls back to straight-line distance.

**The 100k-row benchmark seeding script is not committed.** The EXPLAIN numbers above cannot currently be reproduced from a clean clone.

---

## Running it

### Prerequisites
Node 18+ · Python 3.9+ · PostgreSQL with PostGIS

### Database

```bash
createdb geomind
psql -d geomind -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -d geomind -f server/migrations/001_phase1_smart_errand.sql
psql -d geomind -f server/seed.sql
```

### Backend

```bash
cd server
npm install
npm start
```

> **Note on environment configuration:** `server/.env.example` is not present in the repository, so `cp .env.example .env` will fail. Create `server/.env` manually with the following variables:
>
> | Variable | Description |
> |---|---|
> | `PORT` | HTTP port for Express gateway (defaults to `3000`) |
> | `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5434/geomind`) |
> | `JWT_SECRET` | Secret key used to sign and verify mobile client tokens. **Mandatory** — mobile registration and login return 503 if omitted |
> | `CLERK_SECRET_KEY` | Secret key for verifying web dashboard Clerk sessions |
> | `ML_SERVICE_URL` | URL to the FastAPI microservice (defaults to `http://localhost:5001`) |
> | `OSRM_BASE_URL` | Base URL for OSRM driving service (defaults to public demo server) |
> | `OSRM_TRIP_BASE` | Base URL for OSRM `/trip` TSP endpoint (defaults to public demo server) |

### ML service

```bash
cd ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 train.py          # writes classifier.pkl, vectorizer.pkl, prototypes.pkl
python3 app.py
```

Model binaries are not committed; `train.py` regenerates them in a few seconds.

### Web dashboard

```bash
cd web && npm install && npm start
```

### Mobile client

```bash
cd mobile && npm install && npx expo start
```

---

## API

### `GET /api/smart-bundle`

Params: `lat`, `lng`, `radius` (default 2000)

```json
{
  "bundles": [{
    "category": "grocery",
    "best_store": {
      "name": "D-Mart Civil Lines",
      "lat": 25.4540, "lng": 81.8340,
      "distance_m": 180,
      "preference_score": 0.95,
      "source": "local_postgis"
    },
    "tasks": [{
      "id": 12,
      "text": "buy organic milk",
      "priority": "high",
      "urgency_score": "0.78",
      "urgency_reason": "urgently, running out"
    }],
    "task_count": 1,
    "avg_urgency": 0.78,
    "explainability": [
      "D-Mart Civil Lines is close (180m away)",
      "Urgency: High (78%)",
      "Frequently visited store from completion history"
    ]
  }],
  "route": {
    "ordered_stops": [{ "name": "D-Mart Civil Lines", "lat": 25.4540, "lng": 81.8340 }],
    "geometry": [[25.4322, 81.7707], [25.4540, 81.8340]],
    "total_distance_m": 180,
    "total_time_min": 2,
    "osrm_used": true
  }
}
```

`osrm_used: false` means the straight-line fallback produced the route; the explainability array says so too.

### `GET /health`

Reports database and ML service health from live probes; OSRM and Overpass status reflect configuration only.

---

## Schema

```sql
CREATE TABLE smart_tasks (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL,
  raw_text         TEXT NOT NULL,
  category         VARCHAR(50),
  priority         VARCHAR(10) DEFAULT 'medium',
  status           VARCHAR(20) DEFAULT 'pending',
  radius_meters    INT DEFAULT 1000,
  urgency_score    FLOAT DEFAULT 0.5,
  urgency_reason   TEXT,
  triggered_at     TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  cooldown_minutes INT DEFAULT 30
);

CREATE TABLE places (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT,
  name        TEXT,
  category    VARCHAR(50),
  price_level INT,
  rating      FLOAT,
  geom        geography(Point, 4326)   -- geography, not geometry: see indexing note above
);

CREATE INDEX idx_places_geom ON places USING GIST (geom);

CREATE TABLE user_habits (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  task_id      INT,
  category     VARCHAR(50),
  item_text    TEXT,
  store_name   TEXT,
  rating       INT,
  completed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trigger_events (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  task_id       INT REFERENCES smart_tasks(id) ON DELETE CASCADE,
  category      VARCHAR(50),
  place_name    TEXT,
  distance_m    INT,
  radius_meters INT,
  priority      VARCHAR(10),
  urgency_score FLOAT,
  reason        JSONB DEFAULT '[]'::jsonb,
  triggered_at  TIMESTAMPTZ DEFAULT NOW()
);
```

> **Schema drift note:** `trigger_events` and `mobile_users` are created dynamically at runtime on startup in [`server/index.js`](server/index.js) and [`server/routes/auth.js`](server/routes/auth.js), not in `server/migrations/001_phase1_smart_errand.sql`. Similarly, columns `store_name`, `rating`, and `task_id` on `user_habits` are added via startup queries rather than the initial migration file.

---

## Roadmap

In rough priority order:

1. Background geofencing via Expo Dev Client — restores the proactive reminder premise
2. Opening-hours parsing and filtering
3. Self-hosted OSRM and POI source
4. Batch the `/location` proximity evaluation into a single query
5. Wire `created_at` through to the urgency scorer so time-decay activates
6. Calendar integration — surface errands that fit a gap in the day
7. Import from existing task apps (Todoist, Google Tasks, Reminders) to remove the cold-start problem
