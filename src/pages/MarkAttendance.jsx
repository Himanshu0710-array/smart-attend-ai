import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import { MapPin, CheckCircle, XCircle, Loader2, Wifi, RefreshCw, ShieldCheck, CalendarDays } from 'lucide-react';

// Haversine formula
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function MarkAttendance() {
  const { userData } = useAuth();
  const studentSection = userData?.section || 'A';
  const studentUid = userData?.uid || 'demo-student-001';

  const [liveSessions, setLiveSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [distance, setDistance] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [nextReverify, setNextReverify] = useState(null);
  const [myStatus, setMyStatus] = useState(null);

  // Fetch live sessions
  useEffect(() => {
    const fetch = async () => {
      try {
        const sessions = await api.getSessions(studentSection);
        setLiveSessions(sessions);
        if (sessions.length > 0 && !selectedSession) {
          setSelectedSession(sessions[0]);
        }
        // Remove selected session if it ended
        if (selectedSession && !sessions.find(s => s.id === selectedSession.id)) {
          setSelectedSession(sessions.length > 0 ? sessions[0] : null);
          setCheckResult(null);
          setMyStatus(null);
        }
      } catch (e) { console.error(e); }
    };
    fetch();
    const interval = setInterval(fetch, 3000);
    return () => clearInterval(interval);
  }, [studentSection, selectedSession]);

  // Fetch my current status in selected session
  useEffect(() => {
    if (!selectedSession) return;
    const fetchStatus = async () => {
      try {
        const records = await api.getSessionRecords(selectedSession.id);
        setMyStatus(records[studentUid]?.status || 'Absent');
      } catch (e) { console.error(e); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [selectedSession, studentUid]);

  const checkLocation = useCallback(async () => {
    if (!selectedSession) return;
    setLoading(true);
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setLocation({ latitude, longitude, accuracy });

        const dist = getDistance(latitude, longitude, selectedSession.lat, selectedSession.lon);
        setDistance(Math.round(dist));
        setLastChecked(new Date());

        const isInside = dist <= selectedSession.radius;
        setCheckResult(isInside ? 'inside' : 'outside');

        try {
          if (isInside) {
            if (myStatus === 'Absent' || !myStatus) {
              const elapsed = (Date.now() - new Date(selectedSession.startTime).getTime()) / 60000;
              await api.markAttendance(selectedSession.id, studentUid, dist, elapsed > 10);
            } else {
              await api.reverifyAttendance(selectedSession.id, studentUid, true, dist);
            }
          } else {
            if (myStatus && myStatus !== 'Absent') {
              await api.reverifyAttendance(selectedSession.id, studentUid, false, dist);
            }
          }
          // Re-fetch status
          const records = await api.getSessionRecords(selectedSession.id);
          setMyStatus(records[studentUid]?.status || 'Absent');
        } catch (e) {
          console.error('Failed to update attendance:', e);
        }

        setLoading(false);
      },
      (error) => {
        let msg = 'Unable to get your location.';
        if (error.code === 1) msg = 'Location permission denied. Please enable GPS.';
        else if (error.code === 2) msg = 'Position unavailable. Check your GPS signal.';
        else if (error.code === 3) msg = 'Location request timed out. Try again.';
        setLocationError(msg);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [selectedSession, studentUid, myStatus]);

  // Reverification timer (every 20 minutes)
  useEffect(() => {
    if (checkResult === 'inside' && selectedSession) {
      const REVERIFY_INTERVAL = 20 * 60 * 1000;
      setNextReverify(new Date(Date.now() + REVERIFY_INTERVAL));
      const timer = setInterval(() => {
        setNextReverify(new Date(Date.now() + REVERIFY_INTERVAL));
        checkLocation();
      }, REVERIFY_INTERVAL);
      return () => clearInterval(timer);
    }
  }, [checkResult, selectedSession, checkLocation]);

  if (liveSessions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Mark Attendance</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Verify your location to mark attendance</p>
        </div>
        <div className="mt-8 text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <CalendarDays className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-2">No Active Sessions</h3>
          <p className="text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
            There are no active class sessions for your section right now. Checking every 3 seconds...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Mark Attendance</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Verify your location to mark attendance</p>
      </div>

      {liveSessions.length > 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Select Session</label>
          <select
            value={selectedSession?.id || ''}
            onChange={(e) => { setSelectedSession(liveSessions.find(s => s.id === e.target.value)); setCheckResult(null); setLocation(null); }}
            className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          >
            {liveSessions.map((s) => <option key={s.id} value={s.id}>{s.className} — {s.room} ({s.teacher})</option>)}
          </select>
        </div>
      )}

      {selectedSession && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{selectedSession.className} — {selectedSession.room}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{selectedSession.teacher} • Radius: {selectedSession.radius}m</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-slate-500 dark:text-slate-400">Lat</p>
              <p className="font-medium text-slate-900 dark:text-white">{selectedSession.lat}°</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-slate-500 dark:text-slate-400">Lon</p>
              <p className="font-medium text-slate-900 dark:text-white">{selectedSession.lon}°</p>
            </div>
          </div>
        </div>
      )}

      {!checkResult && !loading && (
        <button onClick={checkLocation} className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-lg rounded-2xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-3">
          <MapPin className="w-6 h-6" />
          Verify My Location
        </button>
      )}

      {loading && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">Checking your location...</p>
        </div>
      )}

      {locationError && (
        <div className="p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="font-medium text-red-700 dark:text-red-300">{locationError}</p>
          <button onClick={checkLocation} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">Try Again</button>
        </div>
      )}

      {checkResult === 'inside' && (
        <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-center">
          <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-200 mb-1">Attendance Marked — {myStatus}!</h3>
          <p className="text-emerald-600 dark:text-emerald-400 text-sm">You are {distance}m from the classroom (within {selectedSession?.radius}m)</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-600/80 dark:text-emerald-400/80">
            <ShieldCheck className="w-4 h-4" />
            <span>GPS verified at {lastChecked?.toLocaleTimeString()}</span>
          </div>
          {nextReverify && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Next reverification at {nextReverify.toLocaleTimeString()}</span>
            </div>
          )}
          <button onClick={checkLocation} className="mt-4 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Re-verify Now
          </button>
        </div>
      )}

      {checkResult === 'outside' && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <div className="inline-flex p-3 rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
            <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-red-800 dark:text-red-200 mb-1">Outside Classroom Area</h3>
          <p className="text-red-600 dark:text-red-400 text-sm">You are {distance}m away (allowed: {selectedSession?.radius}m)</p>
          <button onClick={checkLocation} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Check Again
          </button>
        </div>
      )}

      {location && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-blue-500" /> Your Location
          </h3>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-slate-500 dark:text-slate-400">Latitude</p>
              <p className="font-medium text-slate-900 dark:text-white">{location.latitude.toFixed(6)}°</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-slate-500 dark:text-slate-400">Longitude</p>
              <p className="font-medium text-slate-900 dark:text-white">{location.longitude.toFixed(6)}°</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-slate-500 dark:text-slate-400">Accuracy</p>
              <p className="font-medium text-slate-900 dark:text-white">±{Math.round(location.accuracy)}m</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
