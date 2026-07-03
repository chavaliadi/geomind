# 🗺️ GeoMind - Smart Location-Based Reminder System

## 📍 The Idea

GeoMind is an intelligent location-based reminder system that automatically notifies users when they arrive near places where they need to complete tasks. Instead of remembering to buy groceries every time you visit a store, GeoMind intelligently batches reminders by category and triggers notifications based on your real-time GPS location with smart priority ordering.

**Core Concept:**
- Users create tasks with priority levels (HIGH, MEDIUM, LOW)
- Tasks are auto-categorized (Grocery, Pharmacy, Clothing, General)
- When user arrives within ~50-100m of relevant locations, they receive ONE notification per category
- Notifications are batched smartly (up to 5 tasks per batch for readability)
- Per-category cooldown (30 mins) prevents notification spam
- Priority-ordered display ensures important tasks appear first

---

## ✅ What We've Done Till Now

### Phase 1: Core Backend Infrastructure (COMPLETED)
- ✅ Set up Node.js + Express server on port 3000
- ✅ PostgreSQL database with PostGIS for geospatial queries
- ✅ `smart_tasks` table with priority column and status tracking
- ✅ `places` table with lat/lng coordinates for categories

### Phase 2: Geo-Matching Engine (COMPLETED)
- ✅ `POST /location` endpoint that analyzes user location against stored places
- ✅ Proximity detection using ST_DWithin (PostGIS) within 1km radius
- ✅ Per-task cooldown system to prevent repeated triggers
- ✅ Database schema migration script for quick setup

### Phase 3: Priority System + Smart Batching + Cooldown (COMPLETED)
- ✅ **Phase 3A**: Backend priority system 
  - Tasks stored with priority (high/medium/low)
  - Validated in POST /tasks endpoint
  
- ✅ **Phase 3B**: Smart notification batching
  - 1 notification per category with up to 5 tasks per batch
  - Tasks sorted within batch by priority (HIGH → MEDIUM → LOW)
  - Prevents notification overload
  
- ✅ **Phase 3C**: Per-category cooldown
  - 30-minute cooldown per category per trigger
  - Prevents same category from triggering multiple times in short period
  - Individual per-task cooldown also respected

- ✅ **Real-world testing**: Verified with actual device GPS at (25.432247°N, 81.770706°E)
  - Successfully triggered batches for multiple categories (clothing + grocery)
  - Notifications displayed correctly with category emojis

### Phase 4: Mobile App (Expo React Native) (COMPLETED)
- ✅ Created `/mobile/app/index.tsx`
- ✅ Location auto-tracking (2-minute interval polling)
- ✅ Task staging system (add tasks one-by-one before saving)
- ✅ Priority modal for task creation (buttons: 🔴HIGH, 🟠MEDIUM, 🟡LOW)
- ✅ Auto-categorization (grocery/pharmacy/clothing/general)
- ✅ Notification system with permission handling
- ✅ Offline support with expo-notifications
- ✅ Beautiful gradient UI with category emojis

### Phase 5: Web Dashboard (COMPLETED)
- ✅ Created React web app scaffold
- ✅ 4-tab navigation: Dashboard | Manage Tasks | Analytics | Location Simulator
- ✅ **Dashboard**: Stats cards (total/pending/completed/completion rate), task list, category distribution
- ✅ **TaskManager**: Create/delete tasks with priority and category override
- ✅ **Analytics**: Timeline charts, trigger rate by priority, category distribution
- ✅ **LocationSimulator**: Manual lat/lng input to test geo-matching system
- ✅ Responsive CSS styling with color-coded categories
- ✅ **Dependencies**: All packages installed and functioning locally

---

## 🚀 What We Will Do in the Future

### Phase 6: Web App Completion & Deployment (IN PROGRESS)
- [x] Complete npm install for all React dependencies
- [x] Add React Router for better navigation (currently using tab state)
- [x] Rename all .js files to .jsx (React convention)
- [x] Test web app with running backend
- [ ] Deploy to Vercel or Netlify

### Phase 7: ML/NLP Integration (COMPLETED)
- [x] Create `ml/` folder with Python environment
- [x] Build ML dataset (611 labeled examples with Hinglish, ambiguous, and mixed categories)
- [x] Train TF-IDF + Logistic Regression classifier with Cosine Similarity Fallback
  - Measured performance: **90.2% accuracy**, **0.906 Macro F1-score** on stratified test split
  - Preprocessing: offline-safe, tokenized lemmatizer pipeline
- [x] Create FastAPI microservice on port 5001
  - Endpoint: `POST /predict` (accepts task text, returns category)
  - Endpoint: `POST /urgency` (scores urgency from 0.0 to 1.0)
  - Endpoint: `POST /feedback` (captures manual UI corrections)
- [x] Integrate ML with backend:
  - Modify `POST /tasks` to call ML service with Circuit Breaker pattern
  - Fallback strictly to keywords if ML drops or times out
- [x] Frontend improvements:
  - Show ML `✨ Suggested category` badges in real-time on Dashboard
  - Feed user-corrected task telemetry safely back to ML feedback dataset for periodic retraining

### Phase 8: Advanced Features (IN PROGRESS)
- [ ] Hierarchical categories (grocery → fruits, dairy, beverage)
- [x] User authentication with JWT (Clerk for Web, Custom JWT for Mobile implemented)
- [ ] Multi-user support with database isolation
- [ ] Notification history and audit logs
- [x] Custom location radius per task
- [ ] Recurring reminders (weekly, monthly)
- [x] Integration with Google Maps/Apple Maps (Implemented via Leaflet & react-native-webview)

### Phase 9: Testing & Performance
- [x] Integrate Open Source Routing Machine (OSRM) and Overpass OSM APIs for cost-free, high-performance geospatial routing and ETA calculations.
- [ ] Unit tests for backend endpoints
- [ ] E2E tests for mobile app
- [ ] Load testing for notification system
- [ ] Optimization for large task datasets (1000+ tasks)

### Phase 10: Production Deployment
- [ ] Docker containerization for backend
- [ ] Heroku/Railway deployment
- [ ] Mobile app distribution (TestFlight, Play Store)
- [ ] CDN for web app assets

---

## 🌟 Future Upgrades & Improvements (To Make It Even Better)

Once the core phases are completely deployed, the following architectural upgrades will take GeoMind to the next level:

1. **True Mobile Background Processing (Expo Dev Build)**
   - Transitioning from Expo Go to an Expo Development Build to unlock background GPS polling via `expo-task-manager`. This allows the app to trigger notifications even when swiped away or the phone is locked.
2. **Real-Time Push Sockets (Socket.io)**
   - Instead of polling the server or relying solely on manual refresh, integrating WebSockets would allow the dashboard and mobile app to instantly flash celebratory popups the exact microsecond a task is marked complete.
3. **Smart Polling Acceleration**
   - Implement dynamic GPS polling rates: check every 10 minutes while driving fast, but increase checking speed to every 1 minute when walking near known task hot-zones to save battery life.
4. **Machine Learning Retraining Pipeline**
   - Incorporate the database feedback tables (`user_habits` & `trigger_events`) into a scheduled offline job to periodically retrain the TF-IDF vectorizer and Logistic Regression models.

---

## 🛠️ Tech Stack - What We're Using

### Backend
- **Runtime**: Node.js v24.6.0
- **Framework**: Express 5.2.1
- **Database**: PostgreSQL + PostGIS (geospatial queries)
- **ORM**: pg (native postgres client)
- **Environment**: dotenv 17.2.3
- **CORS**: cors 2.8.6
- **Dev Tools**: nodemon 3.1.11

### Mobile (React Native)
- **Framework**: Expo (managed React Native)
- **Language**: TypeScript
- **Location**: expo-location (GPS tracking)
- **Notifications**: expo-notifications (push notifications)
- **UI**: React Native built-ins (SafeAreaView, FlatList, etc.)

### Web (React)
- **Framework**: React 18.2.0
- **DOM**: react-dom 18.2.0
- **Build Tool**: react-scripts 5.0.1 (Create React App)
- **Routing**: React Router
- **HTTP Client**: axios 1.6.0
- **Charts**: Recharts 2.10.0
- **Icons**: Lucide React 0.294.0
- **Utilities**: date-fns 2.30.0
- **Styling**: Custom CSS with CSS Grid/Flexbox (no Tailwind dependency in the current repo)

### DevOps & Tools
- **Version Control**: Git
- **Package Manager**: npm
- **Editor**: VS Code

---

## 📦 Tech Stack - What We Will Add

### AI/ML/NLP
- **Language**: Python 3.9+
- **ML Framework**: scikit-learn (TF-IDF, Logistic Regression)
- **APIs**: FastAPI (lightweight Python web framework)
- **Server**: Uvicorn (ASGI server for FastAPI)
- **Serialization**: joblib (save/load ML models)
- **Data Processing**: pandas, numpy

### Frontend Enhancements
- **Routing**: react-router-dom 6.20.0 ✅ (already in package.json)
- **State Management**: (Optional) Redux or Recoil if needed
- **Form Validation**: (Optional) react-hook-form
- **Testing**: Jest, React Testing Library

### Backend Improvements
- **Real-time**: Socket.io or WebSockets for live notifications
- **Queue**: Bull or RabbitMQ for background jobs
- **Caching**: Redis for cooldown tracking
- **Logging**: Winston or Pino for structured logging
- **Validation**: Joi or Zod for request validation

### Deployment
- **Containerization**: Docker
- **Orchestration**: Docker Compose (local), Kubernetes (cloud)
- **Cloud Platforms**: Vercel (web), AWS/Railway (backend), Firebase (mobile)
- **Monitoring**: Sentry for error tracking

### Database
- **Backups**: Automated PostgreSQL backups
- **Migration Tool**: Knex.js or Alembic for schema versioning

---

## 📊 Project Status Dashboard

| Phase | Component | Status | Progress |
|-------|-----------|--------|----------|
| 1 | Backend Infrastructure | ✅ Complete | 100% |
| 2 | Geo-Matching Engine | ✅ Complete | 100% |
| 3 | Priority + Batching + Cooldown | ✅ Complete | 100% |
| 4 | Mobile App (Expo) | ✅ Complete | 100% |
| 5 | Web Dashboard | ✅ Complete | 100% |
| 6 | Web App Deployment | 🔄 In Progress | 80% |
| 7 | ML/NLP Integration | ✅ Complete | 100% |
| 8 | Advanced Features | 🔄 In Progress | 40% |
| 9 | Testing & Performance | 🚀 Planned | 0% |
| 10 | Production Deployment | 🚀 Planned | 0% |

**Overall Completion**: ~85% (Phases 1-5 & 7 Done. Phase 6 and 8 in progress)

---

## 🛡️ Hardening Notes

- Set `JWT_SECRET` in every non-local environment; the server will not issue or accept mobile JWTs without it.
- Set `ML_SERVICE_URL` when the FastAPI service is deployed somewhere other than `http://localhost:5001`.
- Set `CORS_ORIGINS` as a comma-separated list for deployed web/mobile clients.
- Smart bundling uses Overpass first, then falls back to local PostGIS `places`; OSRM failures return a straight-line route fallback rather than breaking the request.

## 🎯 Next Immediate Steps

1. **Production Deployment (Phase 6 & 10)**
   - Move off localhost and deploy the Web Frontend to Vercel.
   - Deploy the Node.js API and Python Machine Learning FastAPI server to Render or Railway.
   
2. **Mobile Background GPS (Phase 10)**
   - Create an EAS Dev Build to enable `expo-task-manager` so the app tracks location while in the background.
   
3. **Database Cleanup & Optimization**
   - Lock in database isolations for multi-user capabilities now that Clerk and JWT authentication are wired up.

---

## 📝 Database Schema Summary

```sql
CREATE TABLE smart_tasks (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  raw_text TEXT NOT NULL,
  category VARCHAR(50),
  priority VARCHAR(10) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  cooldown_minutes INT DEFAULT 30
);

CREATE TABLE places (
  id SERIAL PRIMARY KEY,
  name TEXT,
  category VARCHAR(50),
  geom geometry(Point, 4326)
);

CREATE TABLE ml_feedback (
  id SERIAL PRIMARY KEY,
  task_id INTEGER,
  task_text TEXT,
  predicted_category VARCHAR(50),
  corrected_category VARCHAR(50),
  user_rating INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE mobile_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔗 Repository Links

- **GitHub**: https://github.com/chavaliadi/geomind
- **Folder Structure**:
  ```
  Geomind/
  ├── mobile/          (React Native + Expo)
  ├── web/             (React 18)
  ├── server/          (Node.js + Express)
  └── ml/              (Python + FastAPI)
  ```

---

**Created**: Feb 2026 | **Status**: Active Development | **License**: MIT
