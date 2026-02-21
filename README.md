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

### Phase 1: Core Backend Infrastructure
- ✅ Set up Node.js + Express server on port 3000
- ✅ PostgreSQL database with PostGIS for geospatial queries
- ✅ `smart_tasks` table with priority column and status tracking
- ✅ `places` table with lat/lng coordinates for categories

### Phase 2: Geo-Matching Engine
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

### Phase 4: Mobile App (Expo React Native)
- ✅ Created `/mobile/app/index.tsx`
- ✅ Location auto-tracking (2-minute interval polling)
- ✅ Task staging system (add tasks one-by-one before saving)
- ✅ Priority modal for task creation (buttons: 🔴HIGH, 🟠MEDIUM, 🟡LOW)
- ✅ Auto-categorization (grocery/pharmacy/clothing/general)
- ✅ Notification system with permission handling
- ✅ Offline support with expo-notifications
- ✅ Beautiful gradient UI with category emojis

### Phase 5: Web Dashboard (IN PROGRESS)
- ✅ Created React web app scaffold
- ✅ 4-tab navigation: Dashboard | Manage Tasks | Analytics | Location Simulator
- ✅ **Dashboard**: Stats cards (total/pending/completed/completion rate), task list, category distribution
- ✅ **TaskManager**: Create/delete tasks with priority and category override
- ✅ **Analytics**: Timeline charts, trigger rate by priority, category distribution
- ✅ **LocationSimulator**: Manual lat/lng input to test geo-matching system
- ✅ Responsive CSS styling with color-coded categories
- 🔄 **Pending**: npm install (dependencies not yet installed)

---

## 🚀 What We Will Do in the Future

### Phase 6: Web App Completion & Deployment
- [ ] Complete npm install for all React dependencies
- [ ] Add React Router for better navigation (currently using tab state)
- [ ] Rename all .js files to .jsx (React convention)
- [ ] Test web app with running backend
- [ ] Deploy to Vercel or Netlify

### Phase 7: AI/ML/NLP Integration
- [ ] Create `geomind-ml/` folder with Python environment
- [ ] Build ML dataset (100-200 labeled examples):
  - Examples: "buy apples" → grocery_fruits
  - "get medicine" → pharmacy_medicine
  - "buy shirt" → clothing_casual
  
- [ ] Train TF-IDF + Logistic Regression classifier (not deep learning)
  - Input: Task text (e.g., "buy apples from Whole Foods")
  - Output: Category confidence scores
  
- [ ] Create FastAPI microservice on port 5000
  - Endpoint: `POST /predict` (accepts task text, returns category)
  
- [ ] Integrate ML with backend:
  - Modify `POST /tasks` to call ML service for auto-categorization
  - Return ML confidence scores in response
  
- [ ] Frontend improvements:
  - Show ML confidence scores in Dashboard
  - Allow user to correct auto-categorization
  - Build training feedback loop

### Phase 8: Advanced Features
- [ ] Hierarchical categories (grocery → fruits, dairy, beverage)
- [ ] User authentication with JWT
- [ ] Multi-user support with database isolation
- [ ] Notification history and audit logs
- [ ] Custom location radius per task
- [ ] Recurring reminders (weekly, monthly)
- [ ] Integration with Google Maps/Apple Maps

### Phase 9: Testing & Performance
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
- **Build Tool**: react-scripts 5.0.1
- **Routing**: React Router (to be added)
- **HTTP Client**: axios 1.6.0
- **Charts**: Recharts 2.10.0
- **Icons**: Lucide React 0.294.0
- **Utilities**: date-fns 2.30.0
- **Styling**: CSS Grid/Flexbox (no CSS-in-JS needed)

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
| 5 | Web Dashboard | 🔄 In Progress | 80% |
| 6 | Web App Deployment | ⏳ Pending | 0% |
| 7 | ML/NLP Integration | 🚀 Planned | 0% |
| 8 | Advanced Features | 🚀 Planned | 0% |
| 9 | Testing & Performance | 🚀 Planned | 0% |
| 10 | Production Deployment | 🚀 Planned | 0% |

**Overall Completion**: ~40% (Phases 1-4 done, Phase 5 in progress)

---

## 🎯 Next Immediate Steps

1. **Fix Web App Dependencies**
   - Run `npm install --legacy-peer-deps` in `/web` folder
   - Convert `.js` files to `.jsx` (optional but recommended)
   
2. **Complete Web Dashboard**
   - Ensure all 4 components work correctly
   - Test with running backend
   
3. **Start ML Phase**
   - Create Python environment in `geomind-ml/`
   - Build labeled training dataset
   - Train TF-IDF + Logistic Regression model
   
4. **Deploy & Test End-to-End**
   - Run all three parts: Mobile, Web, Backend
   - Verify notifications work across all platforms

---

## 📝 Database Schema Summary

```sql
CREATE TABLE smart_tasks (
  id SERIAL PRIMARY KEY,
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
  └── geomind-ml/      (Python + FastAPI) [TBD]
  ```

---

**Created**: Feb 2026 | **Status**: Active Development | **License**: MIT
