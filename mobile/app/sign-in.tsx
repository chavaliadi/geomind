import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthContext } from './_layout';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export default function SignInScreen() {
  const { signIn } = useAuthContext();
  const router     = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');

    const endpoint = isSignUp ? '/auth/register' : '/auth/login';

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // Persist token + user, then navigate home
      await signIn(data.token, data.user);
      router.replace('/');
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.container}
      >
        <View style={s.card}>
          <View style={s.logoContainer}>
            <Ionicons name="location" size={48} color="#0066FF" />
            <Text style={s.title}>GeoMind</Text>
            <Text style={s.subtitle}>Location Intelligence</Text>
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          <Text style={s.inputLabel}>Email Address</Text>
          <TextInput
            autoCapitalize="none"
            value={email}
            placeholder="you@example.com"
            placeholderTextColor="#A0AABF"
            style={s.input}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <Text style={s.inputLabel}>Password</Text>
          <TextInput
            value={password}
            placeholder="••••••••"
            placeholderTextColor="#A0AABF"
            style={s.input}
            secureTextEntry
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={s.primaryBtn}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={s.switchBtn}
            onPress={() => { setIsSignUp(v => !v); setError(''); }}
            disabled={loading}
          >
            <Text style={s.switchBtnText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: '#F0F4FF' },
  container:      { flex: 1, justifyContent: 'center', padding: 20 },
  card:           { backgroundColor: '#fff', borderRadius: 24, padding: 30, shadowColor: '#0066FF', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 30, elevation: 10 },
  logoContainer:  { alignItems: 'center', marginBottom: 30 },
  title:          { fontSize: 28, fontWeight: '900', color: '#1A1A2E', marginTop: 10 },
  subtitle:       { fontSize: 13, color: '#8896B0', fontWeight: '600', letterSpacing: 1 },
  error:          { color: '#E74C3C', backgroundColor: '#FFF0F0', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 20, textAlign: 'center' },
  inputLabel:     { fontSize: 13, fontWeight: '700', color: '#5571AA', marginBottom: 6, marginLeft: 4 },
  input:          { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1A1A2E', marginBottom: 20 },
  primaryBtn:     { backgroundColor: '#0066FF', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 10, shadowColor: '#0066FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  switchBtn:      { marginTop: 24, alignItems: 'center' },
  switchBtnText:  { color: '#5571AA', fontSize: 14, fontWeight: '600' },
});
