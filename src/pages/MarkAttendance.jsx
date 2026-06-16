import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import { MapPin, CheckCircle, XCircle, Loader2, Wifi, RefreshCw, ShieldCheck, CalendarDays, KeyRound } from 'lucide-react';

// Ray-casting algorithm removed due to unreliability with bowtie polygons

// Audio fingerprint — differs even between two identical phones due to
// hardware-level differences in the audio processing chip
async function getAudioFingerprint() {
  try {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < 500; i++) sum += Math.abs(data[i]);
    return sum.toFixed(15); // High precision to capture tiny hardware differences
  } catch {
    return 'audio-unsupported';
  }
}

// Generate a stable device fingerprint for anti-proxy detection
// Now async to include the audio hardware fingerprint
async function getDeviceFingerprint() {
  const cached = localStorage.getItem('smartattend_device_fp');
  if (cached) return cached;

  try {
    // Canvas fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('SmartAttend-FP', 2, 2);
    const canvasData = canvas.toDataURL();

    // Audio fingerprint — unique per physical device even on identical models
    const audioFP = await getAudioFingerprint();

    const signals = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      canvasData.substring(0, 100),
      audioFP, // Hardware-level audio signal
    ].join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < signals.length; i++) {
      const char = signals.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const fp = 'fp-' + Math.abs(hash).toString(36);
    localStorage.setItem('smartattend_device_fp', fp);
    return fp;
  } catch {
    return 'fp-unknown';
  }
}

// GPS and OTP tunable constants
const MIN_SAMPLES = 5;
const MAX_SAMPLES = 15;
const ACCURACY_TARGET = 30;
const ACCURACY_CUTOFF = 60;
const DELAY_MS = 2000;

export default function MarkAttendance() {
  const { userData } = useAuth();
  const studentUid = userData?.uid || 'demo-student-001';

  const [liveSessions, setLiveSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [distance, setDistance] = useState(null);
  const [allowedDistance, setAllowedDistance] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [nextReverify, setNextReverify] = useState(null);
  const [myStatus, setMyStatus] = useState(null);
  const [progressMsg, setProgressMsg] = useState('');

  // OTP State
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [successSubject, setSuccessSubject] = useState('');
  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Fetch live sessions
  useEffect(() => {
    const fetch = async () => {
      try {
        const sessions = await api.getSessions();
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
  }, [selectedSession]);

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

  // OTP digit input handler
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1); // Only keep last digit
    setOtpDigits(newDigits);
    setOtpError('');

    // Auto-advance to next box
    if (value && index < 3) {
      otpRefs[index + 1].current?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3 && newDigits.every(d => d !== '')) {
      handleSubmitWithOtp(newDigits.join(''));
    }
  };

  // Handle backspace to go to previous box
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  // Handle paste — fill all 4 boxes from pasted text
  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setOtpDigits(newDigits);
      otpRefs[3].current?.focus();
      handleSubmitWithOtp(pasted);
    }
  };

  // Adaptive GPS sampling function
  const getAveragedLocation = async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser');
    }

    let samples = [];
    const getPos = () => new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
    });

    for (let i = 1; i <= MAX_SAMPLES; i++) {
      try {
        const pos = await getPos();
        samples.push(pos.coords);
        const bestAcc = Math.min(...samples.map(s => s.accuracy));
        setProgressMsg(`Getting location... sample ${i}/${MAX_SAMPLES} (±${Math.round(pos.coords.accuracy)}m accuracy)`);
        
        if (i >= MIN_SAMPLES && bestAcc <= ACCURACY_TARGET) {
          break; // Stop early if achieved target after min samples
        }
      } catch (err) {
        setProgressMsg(`Getting location... sample ${i}/${MAX_SAMPLES} (failed to read)`);
      }
      
      // Delay before next sample
      if (i < MAX_SAMPLES) {
        await new Promise(res => setTimeout(res, DELAY_MS));
      }
    }

    if (samples.length === 0) {
      throw new Error('Unable to get your location. Please check permissions and try again.');
    }

    const bestAccuracy = Math.min(...samples.map(s => s.accuracy));
    if (bestAccuracy > ACCURACY_CUTOFF) {
      throw new Error(`GPS signal too weak (±${Math.round(bestAccuracy)}m). Move near a window and try again.`);
    }

    const latitude = samples.reduce((sum, s) => sum + s.latitude, 0) / samples.length;
    const longitude = samples.reduce((sum, s) => sum + s.longitude, 0) / samples.length;

    return { latitude, longitude, accuracy: bestAccuracy, samplesUsed: samples.length };
  };

  // Submit attendance with OTP (main flow)
  const handleSubmitWithOtp = useCallback(async (otpString) => {
    if (!selectedSession) return;
    
    const enteredOTP = otpString || otpDigits.join('');
    if (enteredOTP.length !== 4) {
      setOtpError('Please enter all 4 digits');
      return;
    }

    setLoading(true);
    setLocationError('');
    setDeviceError('');
    setOtpError('');
    setProgressMsg('Initializing GPS...');

    try {
      // Step 1: Get averaged GPS location
      const { latitude, longitude, accuracy, samplesUsed } = await getAveragedLocation();
      setLocation({ latitude, longitude, accuracy });
      setLastChecked(new Date());

      // Step 2: Get device fingerprint
      const fp = await getDeviceFingerprint();

      // Step 3: Calculate late status
      const elapsed = (Date.now() - new Date(selectedSession.startTime).getTime()) / 60000;
      const isLate = elapsed > 10;

      setProgressMsg('Verifying attendance...');

      // Step 4: Call mark-with-otp API
      const record = await api.markAttendanceWithOtp(
        selectedSession.id,
        studentUid,
        enteredOTP,
        latitude,
        longitude,
        accuracy,
        samplesUsed,
        fp,
        isLate
      );

      // Success!
      setCheckResult('inside');
      setMyStatus(record.status);
      setSuccessSubject(selectedSession.className);
      setOtpDigits(['', '', '', '']);

    } catch (e) {
      const errorMsg = e.error || e.message || 'Failed to mark attendance';

      const lowerError = errorMsg.toLowerCase();

      // Categorize errors for appropriate UI feedback
      if (lowerError.includes('classroom buffer') || lowerError.includes('inside or very close to the classroom') || lowerError.includes('classroom building') || lowerError.includes('inside the building')) {
        setCheckResult('building_error');
        setLocationError(errorMsg);
      } else if (lowerError.includes('otp') || lowerError.includes('incorrect') || lowerError.includes('expired') || lowerError.includes('code')) {
        setCheckResult('otp_error');
        setOtpError(errorMsg);
      } else if (lowerError.includes('device') || lowerError.includes('registered') || lowerError.includes('phone')) {
        setCheckResult('device_error');
        setDeviceError(errorMsg);
      } else if (lowerError.includes('gps') || lowerError.includes('location') || lowerError.includes('geolocation') || lowerError.includes('verification failed')) {
        setCheckResult('building_error'); // Use building_error state for all location rejections to show the map UI
        setLocationError(errorMsg);
      } else {
        setCheckResult('device_error');
        setDeviceError(errorMsg);
      }
    }
    setLoading(false);
  }, [selectedSession, studentUid, otpDigits]);

  // Re-verify location (for already-marked students)
  const handleReverify = useCallback(async () => {
    if (!selectedSession) return;
    setLoading(true);
    setLocationError('');
    setProgressMsg('Re-verifying location...');

    try {
      const { latitude, longitude, accuracy } = await getAveragedLocation();
      setLocation({ latitude, longitude, accuracy });
      setLastChecked(new Date());

      await api.reverifyAttendance(selectedSession.id, studentUid, latitude, longitude);
      const records = await api.getSessionRecords(selectedSession.id);
      setMyStatus(records[studentUid]?.status || 'Absent');
      setCheckResult('inside');
    } catch (e) {
      console.error('Reverification failed:', e);
      setLocationError(e.error || e.message || 'Reverification failed');
    }
    setLoading(false);
  }, [selectedSession, studentUid]);

  // Reverification timer (every X minutes)
  useEffect(() => {
    if (checkResult === 'inside' && selectedSession) {
      const REVERIFY_INTERVAL = (selectedSession.reverifyInterval || 20) * 60 * 1000;
      setNextReverify(new Date(Date.now() + REVERIFY_INTERVAL));
      const timer = setInterval(() => {
        setNextReverify(new Date(Date.now() + REVERIFY_INTERVAL));
        handleReverify();
      }, REVERIFY_INTERVAL);
      return () => clearInterval(timer);
    }
  }, [checkResult, selectedSession, handleReverify]);

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

  const isAlreadyMarked = myStatus === 'Present' || myStatus === 'Late Entry';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Mark Attendance</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Enter OTP and verify your location</p>
      </div>

      {liveSessions.length > 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Select Session</label>
          <select
            value={selectedSession?.id || ''}
            onChange={(e) => { setSelectedSession(liveSessions.find(s => s.id === e.target.value)); setCheckResult(null); setLocation(null); setOtpDigits(['', '', '', '']); }}
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
              <h2 className="font-semibold text-slate-900 dark:text-white">{selectedSession.className}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedSession.teacher} • {selectedSession.room}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OTP Input UI — shown when session active and not yet marked */}
      {selectedSession && !isAlreadyMarked && !loading && checkResult !== 'inside' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Enter OTP</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ask your teacher for the 4-digit code</p>
            </div>
          </div>

          {/* 4 digit OTP input boxes */}
          <div className="flex justify-center gap-3 mb-4">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={otpRefs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                className={`w-16 h-20 text-center text-3xl font-bold border-2 rounded-2xl outline-none transition-all
                  ${otpError 
                    ? 'border-red-400 dark:border-red-600 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10' 
                    : 'border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
                  }`}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {otpError && (
            <p className="text-center text-sm text-red-600 dark:text-red-400 mb-3 font-medium">❌ {otpError}</p>
          )}

          <button
            onClick={() => handleSubmitWithOtp()}
            disabled={otpDigits.some(d => d === '')}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-lg rounded-2xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MapPin className="w-6 h-6" />
            Mark Attendance
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 animate-pulse">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">{progressMsg || 'Processing...'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Allowing satellite signal to settle</p>
        </div>
      )}

      {locationError && !checkResult && (
        <div className="p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="font-medium text-red-700 dark:text-red-300">📡 {locationError}</p>
          <button onClick={() => { setCheckResult(null); setLocationError(''); }} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">Try Again</button>
        </div>
      )}

      {/* Success: Attendance Marked */}
      {checkResult === 'inside' && (
        <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-center">
          <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-200 mb-1">✅ {myStatus} — {successSubject || selectedSession?.className}</h3>
          <p className="text-emerald-600 dark:text-emerald-400 text-sm">
            Your attendance has been marked successfully
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-600/80 dark:text-emerald-400/80">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified at {lastChecked?.toLocaleTimeString()}</span>
          </div>
          {nextReverify && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Next reverification at {nextReverify.toLocaleTimeString()}</span>
            </div>
          )}
          <button onClick={handleReverify} className="mt-4 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Re-verify Now
          </button>
        </div>
      )}

      {/* Error: Outside Classroom */}
      {checkResult === 'building_error' && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <div className="inline-flex p-3 rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
            <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-red-800 dark:text-red-200 mb-1">🚫 Location check failed</h3>
          <p className="text-red-600 dark:text-red-400 text-sm">{locationError}</p>
          <button onClick={() => { setCheckResult(null); setLocationError(''); setOtpDigits(['', '', '', '']); }} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      )}

      {/* Error: OTP Failed */}
      {checkResult === 'otp_error' && (
        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-center">
          <div className="inline-flex p-3 rounded-full bg-amber-100 dark:bg-amber-900/40 mb-4">
            <KeyRound className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200 mb-1">❌ Wrong OTP</h3>
          <p className="text-amber-600 dark:text-amber-400 text-sm font-medium">{otpError}</p>
          <button onClick={() => { setCheckResult(null); setOtpError(''); setOtpDigits(['', '', '', '']); otpRefs[0].current?.focus(); }} className="mt-4 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors inline-flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      )}

      {/* Error: Device Mismatch */}
      {checkResult === 'device_error' && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center animate-in zoom-in-95">
          <div className="inline-flex p-3 rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
            <ShieldCheck className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-red-800 dark:text-red-200 mb-2">⚠️ Wrong device detected</h3>
          <p className="text-red-600 dark:text-red-400 text-sm font-medium leading-relaxed max-w-md mx-auto">{deviceError}</p>
          <button onClick={() => setCheckResult(null)} className="mt-6 px-6 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-500/30">
            Acknowledge
          </button>
        </div>
      )}

      {/* Error: Generic outside (legacy) */}
      {checkResult === 'outside' && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <div className="inline-flex p-3 rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
            <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-red-800 dark:text-red-200 mb-1">Outside Classroom Area</h3>
          <p className="text-red-600 dark:text-red-400 text-sm">
            {distance !== null
              ? `You are ${distance}m away (allowed: ${allowedDistance}m)`
              : '❌ Your GPS is outside the classroom boundaries'}
          </p>
          <button onClick={() => { setCheckResult(null); }} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors inline-flex items-center gap-1.5">
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
