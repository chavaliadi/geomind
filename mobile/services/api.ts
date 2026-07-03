import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const ML_URL  = process.env.EXPO_PUBLIC_ML_URL  || 'http://localhost:5001';

export let getAuthToken: (() => Promise<string | null>) | null = null;
export const setTokenGetter = (getter: () => Promise<string | null>) => {
  getAuthToken = getter;
};

let cachedGuestId: string | null = null;

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getAuthToken) {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }
  }

  if (!cachedGuestId) {
    cachedGuestId = await AsyncStorage.getItem('geomind_guest_id');
    if (!cachedGuestId) {
      cachedGuestId = 'guest_' + Math.random().toString(36).substring(2, 15);
      await AsyncStorage.setItem('geomind_guest_id', cachedGuestId);
    }
  }
  headers['X-Guest-ID'] = cachedGuestId;
  return headers;
};

export interface Task {
  id: string;
  text: string;
  raw_text?: string;
  category: 'grocery' | 'pharmacy' | 'clothing' | 'general';
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'triggered' | 'completed';
  triggered_at?: string;
  created_at: string;
  radius_meters?: number;
}

async function handleResponse(res: Response, action: string) {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || JSON.stringify(body);
    } catch { detail = res.statusText; }
    throw new Error(`${action} failed (${res.status}): ${detail}`);
  }
  return res;
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(`${API_URL}/api/tasks`, {
    headers: await getAuthHeaders(),
  });
  await handleResponse(res, 'Fetch tasks');
  const data = await res.json();
  return data.map((t: any): Task => ({
    id: String(t.id),
    text: t.raw_text || t.text,
    raw_text: t.raw_text,
    category: t.category || 'general',
    priority: t.priority || 'medium',
    status: t.status || 'pending',
    triggered_at: t.triggered_at,
    created_at: t.created_at || new Date().toISOString(),
    radius_meters: t.radius_meters || 2000,
  }));
}

export async function createTask(text: string, priority: string, category?: string): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ text, priority, category_override: category }),
  });
  await handleResponse(res, 'Create task');
  const data = await res.json();
  return {
    id: String(data.id),
    text: data.raw_text || text,
    category: data.category || 'general',
    priority: (priority as Task['priority']) || 'medium',
    status: 'pending',
    created_at: new Date().toISOString(),
    radius_meters: 2000,
  };
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  await handleResponse(res, 'Delete task');
}

export async function markTaskComplete(id: string, chosenStore?: string | null, rating?: number | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      status: 'completed',
      chosen_store: chosenStore || null,
      rating: rating ?? null,
    }),
  });
  await handleResponse(res, 'Complete task');
}

export async function sendLocationCheck(lat: number, lng: number) {
  const res = await fetch(`${API_URL}/location`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function sendMLFeedback(taskId: string, text: string, category: string, storeName: string | null, rating: number) {
  try {
    const res = await fetch(`${ML_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        text,
        chosen_category: category,
        chosen_store: storeName,
        rating,
      }),
    });
    if (!res.ok) {
      console.warn('ML feedback failed:', res.status);
    }
  } catch (e) {
    // ML feedback is non-critical — log but don't throw
    console.warn('ML feedback error:', e);
  }
}

export async function predictCategory(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${ML_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    return data.category || null;
  } catch { return null; }
}
