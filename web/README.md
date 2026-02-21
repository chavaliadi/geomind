# GeoMind Web Dashboard

A comprehensive web interface for managing location-based reminders and viewing analytics.

## Features

- **Dashboard**: Quick overview of tasks, statistics, and distributions
- **Task Manager**: Create, edit, and delete tasks with priority levels
- **Analytics**: Trigger history, timeline charts, and performance metrics
- **Location Simulator**: Test the geo-matching system without physical movement

## Setup

1. Install dependencies:
```bash
npm install
```

2. Ensure the backend is running on `http://localhost:3000`:
```bash
# In the server folder
npm install
npm start
```

3. Start the web app:
```bash
npm start
```

The app will open at `http://localhost:3000` (Note: backend is on :3000, but React dev server will use :3000 after backend closes or you can configure it)

## Architecture

### Components

- **App.js**: Main app container with tab navigation
- **Dashboard.js**: Stats overview and task summary
- **TaskManager.js**: Full CRUD operations for tasks
- **Analytics.js**: Historical data and performance charts
- **LocationSimulator.js**: Manual location testing interface

### API Integration

The web app communicates with the backend via:

- `GET /api/tasks` - Fetch all tasks
- `POST /tasks` - Create new task
- `DELETE /api/tasks/:id` - Delete a task
- `POST /location` - Simulate location and get triggered tasks

## Usage

### Creating a Task

1. Go to "Manage Tasks" tab
2. Click "New Task"
3. Enter task description (e.g., "Buy apples from Whole Foods")
4. Select priority (High/Medium/Low)
5. Optionally override category
6. Click "Create Task"

### Simulating Location

1. Go to "Location Simulator" tab
2. Choose a preset location or enter custom coordinates
3. Click "Simulate Location"
4. View which tasks would be triggered at that location

### Viewing Analytics

1. Go to "Analytics" tab
2. Select time range (7d/30d/all)
3. Filter by category (optional)
4. View charts and statistics

## Technology Stack

- React 18
- Axios (HTTP client)
- Recharts (data visualization)
- Lucide Icons
- CSS Grid/Flexbox

## Environment

Backend API URL is set to `http://localhost:3000` in the components.
Update the `API_URL` constant if your backend is running on a different port.
