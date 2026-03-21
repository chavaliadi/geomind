import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Modal,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// Request notification permissions on app load
const requestNotificationPermissions = async () => {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('❌ Notification permissions not granted');
  } else {
    console.log('✅ Notification permissions granted');
  }
};
const LOCATION_POLL_INTERVAL = 120000; // 2 minutes

// Color Scheme
const COLORS = {
  primary: "#0066FF",
  success: "#34C759",
  danger: "#FF3B30",
  warning: "#FF9500",
  background: "#F8F9FA",
  surface: "#FFFFFF",
  text: "#1A1A1A",
  textSecondary: "#666666",
  border: "#E5E5EA",
  triggered: "#E8F5E9",
  triggeredBorder: "#4CAF50",
};

interface Task {
  id: string;
  text: string;
  category: string;
  isTriggered: boolean;
  priority: "high" | "medium" | "low";
  isSelected: boolean;
}

interface ParsedTask {
  text: string;
  category: string;
}

export default function HomeScreen() {
  const [text, setText] = useState("");
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [result, setResult] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [stagingTasks, setStagingTasks] = useState<(ParsedTask & { priority: "high" | "medium" | "low" })[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);

  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for tracking indicator
  useEffect(() => {
    if (isTracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isTracking]);

  // Request notification permissions on app startup
  useEffect(() => {
    requestNotificationPermissions();
    fetchTasksFromServer(); // U6: load existing tasks on startup
  }, []);

  // U6: Fetch existing tasks from server
  const fetchTasksFromServer = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/tasks`);
      const data = await res.json();
      const fetched: Task[] = data.map((t: any) => ({
        id: String(t.id),
        text: t.raw_text || t.text,
        category: t.category,
        isTriggered: t.status === 'triggered',
        priority: t.priority || 'medium',
        isSelected: t.status !== 'triggered',
      }));
      setTaskList(fetched);
      if (isRefresh) addLog(`🔄 Refreshed: ${fetched.length} tasks loaded`);
    } catch (err) {
      addLog(`❌ Could not load tasks from server`);
    } finally {
      if (isRefresh) setIsRefreshing(false);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setLogs((prev) => [logEntry, ...prev].slice(0, 15));
  };

  const categorizeTask = (taskText: string): string => {
    const t = taskText.toLowerCase();
    if (t.includes("shirt") || t.includes("clothes") || t.includes("dress") || t.includes("wear"))
      return "clothing";
    else if (t.includes("apple") || t.includes("milk") || t.includes("fruit") || t.includes("vegetable") || t.includes("grocery"))
      return "grocery";
    else if (t.includes("medicine") || t.includes("tablet") || t.includes("pharmacy"))
      return "pharmacy";
    return "general";
  };

  const parseMultipleTasks = (input: string): ParsedTask[] => {
    const tasks = input.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    return tasks.map((t) => ({
      text: t,
      category: categorizeTask(t),
    }));
  };

  const addTaskToStaging = () => {
    if (!text.trim()) {
      addLog("⚠️ Task text is empty");
      return;
    }

    const category = categorizeTask(text);
    const newStagingTask = {
      text: text.trim(),
      category,
      priority: "high" as const,
    };

    setStagingTasks((prev) => [newStagingTask, ...prev]);
    addLog(`➕ Added to staging: "${text.trim()}" (${category})`);
    setText("");
  };

  const removeFromStaging = (index: number) => {
    setStagingTasks((prev) => prev.filter((_, i) => i !== index));
    addLog(`🗑️ Removed from staging`);
  };

  const changeStagingPriority = (index: number, newPriority: "high" | "medium" | "low") => {
    setStagingTasks((prev) => {
      const updated = [...prev];
      updated[index].priority = newPriority;
      return updated;
    });
  };

  const saveStagingTasks = async () => {
    if (stagingTasks.length === 0) {
      addLog("⚠️ No tasks to save");
      return;
    }

    setIsLoading(true);
    try {
      addLog(`💾 Saving ${stagingTasks.length} task(s) with priorities...`);

      for (const task of stagingTasks) {
        const res = await fetch(`${API_URL}/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: task.text, priority: task.priority }),
        });

        const data = await res.json();
        const newTask: Task = {
          id: data.id,
          text: task.text,
          category: data.category,
          isTriggered: false,
          priority: task.priority,
          isSelected: true,
        };
        setTaskList((prev) => [newTask, ...prev]);
        addLog(`✅ ${task.priority.toUpperCase()}: ${task.text} (${data.category})`);
      }

      setResult(`✅ ${stagingTasks.length} reminder(s) saved & ready to track`);
      setStagingTasks([]);
      setShowPriorityModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addLog(`❌ Save failed: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const sendLocation = async () => {
    setIsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        addLog("❌ Location permission denied");
        setResult("Permission denied");
        setIsLoading(false);
        return;
      }

      addLog("📍 Fetching location from Google (High Accuracy)...");

      // Request High Accuracy location from Google
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 10,
      });

      const { latitude, longitude, accuracy } = location.coords;
      setCurrentLocation({ latitude, longitude });
      setLocationAccuracy(accuracy);

      addLog(
        `📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy?.toFixed(0)}m)`
      );

      // Get selected tasks with highest priority first
      const selectedTasks = taskList
        .filter((t) => t.isSelected && !t.isTriggered)
        .sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

      if (selectedTasks.length === 0) {
        setResult("✨ No active reminders to check");
        addLog("✨ No selected reminders");
        setIsLoading(false);
        return;
      }

      addLog(`🎯 Checking ${selectedTasks.length} selected task(s)...`);

      const res = await fetch(`${API_URL}/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat: latitude,
          lng: longitude,
        }),
      });

      const data = await res.json();

      // Category emoji mapping
      const categoryEmoji = {
        grocery: "🛒",
        pharmacy: "💊",
        clothing: "👕",
        general: "📌",
      };

      if (data.batches && data.batches.length > 0) {
        addLog(`📦 Received ${data.batches.length} batch(es)`);

        // Collect all triggered tasks for taskList update
        const allTriggeredTaskIds: string[] = [];
        data.batches.forEach((batch: any) => {
          batch.tasks.forEach((t: any) => {
            allTriggeredTaskIds.push(t.task_id);
          });
        });

        // Update task list - mark all triggered tasks
        setTaskList((prev) =>
          prev.map((task) =>
            allTriggeredTaskIds.includes(task.id) ? { ...task, isTriggered: true } : task
          )
        );

        // Send one notification per batch
        for (const batch of data.batches) {
          const emoji = categoryEmoji[batch.category as keyof typeof categoryEmoji] || "📌";
          let title = `${emoji} ${batch.count} ${batch.category} reminder${batch.count !== 1 ? "s" : ""}`;
          let body = "";

          // Build summary with top 3 items (or all if less than 3)
          const displayTasks = batch.tasks.slice(0, 3);
          displayTasks.forEach((task: any) => {
            const priorityBadge =
              task.priority === "high"
                ? "🔴"
                : task.priority === "medium"
                  ? "🟠"
                  : "🟡";
            body += `${priorityBadge} ${task.task} → ${task.place}\n`;
          });

          // Add "...and X more" if there are more than 3
          if (batch.tasks.length > 3) {
            body += `\n+${batch.tasks.length - 3} more...`;
          }

          setResult(`✅ ${title}`);
          addLog(`✅ ${title}: ${batch.tasks.length} task(s)`);

          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "🗺️ GeoMind Alert",
                body: body.trim(),
                sound: true,
                badge: 1,
              },
              trigger: null,
            });
            addLog(`🔔 Notification sent for ${batch.category}`);
          } catch (notifErr) {
            addLog(`❌ Notification error: ${notifErr}`);
          }
        }
      } else {
        setResult("✨ No reminders triggered nearby");
        addLog("✨ No matches yet");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addLog(`❌ Error: ${errorMsg}`);
      setResult("Error: " + errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const startAutoTracking = async () => {
    const selectedCount = taskList.filter((t) => t.isSelected && !t.isTriggered).length;
    if (selectedCount === 0) {
      addLog("⚠️ No selected reminders to track");
      setResult("Select reminders first");
      return;
    }

    addLog(`🚀 Starting auto-tracking (${selectedCount} reminder(s), every 2 min)`);
    setIsTracking(true);
    setResult("🟢 Auto-tracking active - Checking every 2 min");

    // Send location immediately
    await sendLocation();

    // Then set up interval
    trackingIntervalRef.current = setInterval(() => {
      sendLocation();
    }, LOCATION_POLL_INTERVAL);
  };

  const stopAutoTracking = () => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    setIsTracking(false);
    setResult("⏹️ Auto-tracking stopped");
    addLog("⏹️ Auto-tracking stopped");
  };

  const addTask = async () => {
    if (!text.trim()) {
      addLog("⚠️ Task text is empty");
      return;
    }

    setIsLoading(true);
    try {
      addLog(`📝 Saving task: "${text}"`);
      const res = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      const newTask: Task = {
        id: data.id,
        text: text,
        category: data.category,
        isTriggered: false,
        priority: "high",
        isSelected: true,
      };
      setTaskList((prev) => [newTask, ...prev]);
      setResult(`✅ Task saved as "${data.category}"`);
      addLog(`✅ Task categorized as: ${data.category}`);
      setText("");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addLog(`❌ Task save failed: ${errorMsg}`);
      setResult("Error saving task");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTaskSelection = (id: string) => {
    setTaskList((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, isSelected: !task.isSelected } : task
      )
    );
  };

  useEffect(() => {
    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
    };
  }, []);

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      high: "#FF3B30",
      medium: "#FF9500",
      low: "#FFD60A",
    };
    return colors[priority] || "#666";
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      grocery: "#FF6B6B",
      pharmacy: "#4ECDC4",
      clothing: "#FFD93D",
      general: "#95E1D3",
    };
    return colors[category] || "#95E1D3";
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchTasksFromServer(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header Section */}
        <View style={{ marginTop: 12, marginBottom: 24 }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: COLORS.text }}>
            🗺️ GeoMind
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: COLORS.textSecondary,
              marginTop: 4,
              fontWeight: "500",
            }}
          >
            Smart Location-Based Reminders
          </Text>
        </View>

        {/* Status Card */}
        {isTracking && (
          <Animated.View
            style={{
              transform: [{ scale: pulseAnim }],
              marginBottom: 16,
            }}
          >
            <View
              style={{
                backgroundColor: COLORS.success,
                padding: 12,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: COLORS.background,
                }}
              />
              <Text
                style={{
                  color: COLORS.surface,
                  fontWeight: "600",
                  fontSize: 14,
                }}
              >
                Auto-Tracking Active • Sends location every 2 min
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Location Display Card */}
        {currentLocation && (
          <View
            style={{
              backgroundColor: COLORS.surface,
              padding: 12,
              borderRadius: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.textSecondary }}>
              📍 Current Location (Google)
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: COLORS.text,
                marginTop: 6,
                fontFamily: "Courier New",
              }}
            >
              {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
            </Text>
            {locationAccuracy && (
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
                Accuracy: ±{locationAccuracy.toFixed(0)}m {locationAccuracy < 20 ? "✅ (Excellent - Real GPS)" : locationAccuracy < 50 ? "⚠️ (Good)" : "❌ (WiFi/Cell)"}
              </Text>
            )}
          </View>
        )}

        {/* Input Section */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            padding: 16,
            borderRadius: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: COLORS.text,
              marginBottom: 8,
            }}
          >
            Add Reminder
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: COLORS.textSecondary,
              marginBottom: 12,
            }}
          >
            Add one task at a time, set priority, then save
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <TextInput
              placeholder="e.g., Buy apples"
              value={text}
              onChangeText={setText}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 12,
                borderRadius: 10,
                backgroundColor: COLORS.background,
                fontSize: 14,
                color: COLORS.text,
              }}
              placeholderTextColor={COLORS.textSecondary}
            />
            <TouchableOpacity
              onPress={addTaskToStaging}
              disabled={isLoading}
              style={{
                backgroundColor: COLORS.primary,
                paddingHorizontal: 16,
                borderRadius: 10,
                justifyContent: "center",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: COLORS.surface,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                ➕
              </Text>
            </TouchableOpacity>
          </View>

          {/* Staging Tasks Preview */}
          {stagingTasks.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.textSecondary }}>
                Staging ({stagingTasks.length}) - Set priorities below
              </Text>
              {stagingTasks.map((task, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: COLORS.background,
                    padding: 10,
                    borderRadius: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderLeftWidth: 4,
                    borderLeftColor: getPriorityColor(task.priority),
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.text }}>
                      {task.text}
                    </Text>
                    <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 2 }}>
                      {task.category} • {task.priority.toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeFromStaging(idx)}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {/* Save Staged Tasks Button */}
              <TouchableOpacity
                onPress={() => setShowPriorityModal(true)}
                disabled={isLoading}
                style={{
                  backgroundColor: COLORS.primary,
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                  marginTop: 12,
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: COLORS.surface,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  ⚙️ Set Priorities & Save
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 10, marginBottom: 16 }}>
          {!isTracking ? (
            <TouchableOpacity
              onPress={startAutoTracking}
              disabled={isLoading || taskList.filter((t) => t.isSelected && !t.isTriggered).length === 0}
              style={{
                backgroundColor: COLORS.success,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
                opacity: isLoading || taskList.filter((t) => t.isSelected && !t.isTriggered).length === 0 ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: COLORS.surface,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                ▶️ Start Auto-Tracking
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={stopAutoTracking}
              style={{
                backgroundColor: COLORS.danger,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: COLORS.surface,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                ⏹️ Stop Auto-Tracking
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={sendLocation}
            disabled={isLoading}
            style={{
              backgroundColor: COLORS.warning,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading && <ActivityIndicator size="small" color={COLORS.surface} />}
            <Text
              style={{
                color: COLORS.surface,
                fontWeight: "700",
                fontSize: 16,
              }}
            >
              {isLoading ? "Checking..." : "🔍 Check Nearby Now"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Result Display */}
        {result && (
          <View
            style={{
              backgroundColor: result.includes("✅")
                ? COLORS.triggered
                : result.includes("❌")
                  ? "#FFEBEE"
                  : COLORS.triggeredBorder + "20",
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              marginBottom: 16,
              borderLeftWidth: 4,
              borderLeftColor: result.includes("✅")
                ? COLORS.triggeredBorder
                : result.includes("❌")
                  ? COLORS.danger
                  : COLORS.warning,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: COLORS.text,
                fontWeight: "500",
              }}
            >
              {result}
            </Text>
          </View>
        )}

        {/* Saved Tasks Section */}
        {taskList.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: COLORS.text,
                marginBottom: 12,
              }}
            >
              📋 Active Reminders ({taskList.filter((t) => !t.isTriggered).length}/{taskList.length})
            </Text>
            {taskList.map((task) => (
              <TouchableOpacity
                key={task.id}
                onPress={() => !task.isTriggered && toggleTaskSelection(task.id)}
                disabled={task.isTriggered}
                style={{
                  backgroundColor: task.isTriggered
                    ? COLORS.triggered
                    : task.isSelected
                      ? COLORS.surface
                      : "#F0F0F0",
                  padding: 14,
                  borderRadius: 12,
                  marginBottom: 8,
                  borderWidth: 2,
                  borderColor: task.isSelected ? getPriorityColor(task.priority) : COLORS.border,
                  opacity: task.isTriggered ? 0.6 : 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          borderWidth: 2,
                          borderColor: getPriorityColor(task.priority),
                          backgroundColor: task.isSelected ? getPriorityColor(task.priority) : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {task.isSelected && (
                          <Text style={{ color: COLORS.surface, fontWeight: "bold" }}>✓</Text>
                        )}
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: COLORS.text,
                          flex: 1,
                        }}
                      >
                        {task.text}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          backgroundColor: getCategoryColor(task.category),
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: COLORS.surface,
                          }}
                        >
                          {task.category}
                        </Text>
                      </View>
                      {task.isSelected && (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            backgroundColor: getPriorityColor(task.priority),
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "600",
                              color: COLORS.surface,
                            }}
                          >
                            {task.priority.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {task.isTriggered && (
                    <Text style={{ fontSize: 20, marginLeft: 8 }}>✅</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Logs Section */}
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: COLORS.text,
              }}
            >
              📊 Activity Log
            </Text>
            {logs.length > 0 && (
              <TouchableOpacity onPress={() => setLogs([])}>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View
            style={{
              backgroundColor: "#1A1A1A",
              padding: 12,
              borderRadius: 12,
              minHeight: 120,
            }}
          >
            {logs.length === 0 ? (
              <Text style={{ color: "#666", fontSize: 12 }}>Waiting for activity...</Text>
            ) : (
              logs.map((log, idx) => (
                <Text
                  key={idx}
                  style={{
                    color: "#0F0",
                    fontSize: 10,
                    fontFamily: "Courier New",
                    lineHeight: 14,
                  }}
                >
                  {log}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Priority Selection Modal */}
      <Modal visible={showPriorityModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              flex: 1,
              backgroundColor: COLORS.background,
              marginTop: 80,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 16,
              paddingTop: 20,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              Set Priorities for Reminders
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>
              Choose priority level for each reminder
            </Text>

            <ScrollView style={{ flex: 1 }}>
              {stagingTasks.map((task, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: COLORS.surface,
                    padding: 14,
                    borderRadius: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: COLORS.text,
                      marginBottom: 8,
                    }}
                  >
                    {task.text}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: getCategoryColor(task.category),
                      borderRadius: 6,
                      alignSelf: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: COLORS.surface,
                      }}
                    >
                      {task.category}
                    </Text>
                  </View>

                  {/* Priority Buttons */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["high", "medium", "low"].map((p) => (
                      <TouchableOpacity
                        key={p}
                        onPress={() => changeStagingPriority(idx, p as "high" | "medium" | "low")}
                        style={{
                          flex: 1,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor:
                            task.priority === p ? getPriorityColor(p) : COLORS.border,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: task.priority === p ? COLORS.surface : COLORS.textSecondary,
                          }}
                        >
                          {p === "high" ? "🔴" : p === "medium" ? "🟠" : "🟡"}
                          {"\n"}
                          {p.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={{ gap: 10, paddingBottom: 20 }}>
              <TouchableOpacity
                onPress={saveStagingTasks}
                disabled={isLoading}
                style={{
                  backgroundColor: COLORS.success,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: COLORS.surface,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {isLoading ? "Saving..." : "✅ Save & Track"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowPriorityModal(false)}
                disabled={isLoading}
                style={{
                  borderWidth: 2,
                  borderColor: COLORS.border,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: COLORS.text,
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
