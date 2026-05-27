import React, { createContext, useContext, useState, useCallback } from 'react';

const SessionContext = createContext();

export function useSession() {
  return useContext(SessionContext);
}

// Demo classroom data
const DEMO_CLASSROOMS = [
  { id: 'cls-1', name: 'Data Structures', section: 'A', semester: '4th', room: 'Room 301', teacher: 'Dr. Sarah Williams', lat: 28.6139, lon: 77.2090, radius: 100 },
  { id: 'cls-2', name: 'Operating Systems', section: 'A', semester: '4th', room: 'Room 205', teacher: 'Dr. Sarah Williams', lat: 28.6150, lon: 77.2100, radius: 80 },
  { id: 'cls-3', name: 'Computer Networks', section: 'B', semester: '4th', room: 'Room 102', teacher: 'Prof. Kumar', lat: 28.6125, lon: 77.2075, radius: 120 },
];

// All demo students
const DEMO_STUDENTS = [
  { uid: 'demo-student-001', name: 'Alex Johnson', roll: 'CS2024001', section: 'A', email: 'student@demo.com' },
  { uid: 's2', name: 'Priya Sharma', roll: 'CS2024002', section: 'A', email: 'priya@example.com' },
  { uid: 's3', name: 'Rahul Verma', roll: 'CS2024003', section: 'A', email: 'rahul@example.com' },
  { uid: 's4', name: 'Ananya Gupta', roll: 'CS2024004', section: 'A', email: 'ananya@example.com' },
  { uid: 's5', name: 'Vikram Singh', roll: 'CS2024005', section: 'A', email: 'vikram@example.com' },
  { uid: 's6', name: 'Neha Patel', roll: 'CS2024006', section: 'A', email: 'neha@example.com' },
  { uid: 's7', name: 'Arjun Das', roll: 'CS2024007', section: 'B', email: 'arjun@example.com' },
  { uid: 's8', name: 'Megha Reddy', roll: 'CS2024008', section: 'B', email: 'megha@example.com' },
];

export function SessionProvider({ children }) {
  // Active sessions started by teachers: { [sessionId]: { classId, className, teacher, startTime, room, lat, lon, radius, section } }
  const [activeSessions, setActiveSessions] = useState({});

  // Attendance records: { [sessionId]: { [studentUid]: { status, markedAt, distance, reverifications } } }
  const [attendanceRecords, setAttendanceRecords] = useState({});

  // Attendance history (persisted across sessions)
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  // Start a session (teacher action)
  const startSession = useCallback((classId, teacherName) => {
    const classroom = DEMO_CLASSROOMS.find(c => c.id === classId);
    if (!classroom) return null;

    const sessionId = `session-${Date.now()}`;
    const session = {
      id: sessionId,
      classId,
      className: classroom.name,
      teacher: teacherName,
      room: classroom.room,
      section: classroom.section,
      lat: classroom.lat,
      lon: classroom.lon,
      radius: classroom.radius,
      startTime: new Date(),
      status: 'active',
    };

    setActiveSessions(prev => ({ ...prev, [sessionId]: session }));

    // Initialize attendance records for all students in that section
    const sectionStudents = DEMO_STUDENTS.filter(s => s.section === classroom.section);
    const records = {};
    sectionStudents.forEach(student => {
      records[student.uid] = {
        studentName: student.name,
        roll: student.roll,
        status: 'Absent',
        markedAt: null,
        distance: null,
        reverifications: 0,
        missedReverifications: 0,
      };
    });
    setAttendanceRecords(prev => ({ ...prev, [sessionId]: records }));

    return sessionId;
  }, []);

  // End a session (teacher action)
  const endSession = useCallback((sessionId) => {
    setActiveSessions(prev => {
      const updated = { ...prev };
      if (updated[sessionId]) {
        updated[sessionId] = { ...updated[sessionId], status: 'ended', endTime: new Date() };

        // Save to history
        const sessionRecords = attendanceRecords[sessionId] || {};
        Object.entries(sessionRecords).forEach(([uid, record]) => {
          setAttendanceHistory(hist => [
            {
              date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              subject: updated[sessionId].className,
              status: record.status,
              studentUid: uid,
              sessionId,
              time: record.markedAt ? new Date(record.markedAt).toLocaleTimeString() : '-',
            },
            ...hist,
          ]);
        });

        delete updated[sessionId];
      }
      return updated;
    });

    // Clean up attendance records for ended session
    setAttendanceRecords(prev => {
      const updated = { ...prev };
      delete updated[sessionId];
      return updated;
    });
  }, [attendanceRecords]);

  // Mark attendance (student action)
  const markAttendance = useCallback((sessionId, studentUid, distance, isLate = false) => {
    setAttendanceRecords(prev => {
      const sessionRecs = { ...(prev[sessionId] || {}) };
      if (sessionRecs[studentUid]) {
        sessionRecs[studentUid] = {
          ...sessionRecs[studentUid],
          status: isLate ? 'Late Entry' : 'Present',
          markedAt: new Date().toISOString(),
          distance: `${Math.round(distance)}m`,
          reverifications: (sessionRecs[studentUid].reverifications || 0) + 1,
          missedReverifications: 0,
        };
      }
      return { ...prev, [sessionId]: sessionRecs };
    });
  }, []);

  // Reverify attendance (student action - called periodically)
  const reverifyAttendance = useCallback((sessionId, studentUid, isInsideGeofence, distance) => {
    setAttendanceRecords(prev => {
      const sessionRecs = { ...(prev[sessionId] || {}) };
      if (sessionRecs[studentUid]) {
        if (isInsideGeofence) {
          sessionRecs[studentUid] = {
            ...sessionRecs[studentUid],
            distance: `${Math.round(distance)}m`,
            reverifications: (sessionRecs[studentUid].reverifications || 0) + 1,
            missedReverifications: 0,
          };
        } else {
          const missed = (sessionRecs[studentUid].missedReverifications || 0) + 1;
          sessionRecs[studentUid] = {
            ...sessionRecs[studentUid],
            missedReverifications: missed,
            distance: `${Math.round(distance)}m`,
            status: missed >= 2 ? 'Left Early' : sessionRecs[studentUid].status,
          };
        }
      }
      return { ...prev, [sessionId]: sessionRecs };
    });
  }, []);

  // Get active sessions for a specific student's section
  const getStudentSessions = useCallback((section) => {
    return Object.values(activeSessions).filter(s => s.status === 'active' && s.section === section);
  }, [activeSessions]);

  // Get attendance records for a session
  const getSessionRecords = useCallback((sessionId) => {
    return attendanceRecords[sessionId] || {};
  }, [attendanceRecords]);

  // Get student's attendance history
  const getStudentHistory = useCallback((studentUid) => {
    return attendanceHistory.filter(h => h.studentUid === studentUid);
  }, [attendanceHistory]);

  const value = {
    activeSessions,
    attendanceRecords,
    attendanceHistory,
    startSession,
    endSession,
    markAttendance,
    reverifyAttendance,
    getStudentSessions,
    getSessionRecords,
    getStudentHistory,
    classrooms: DEMO_CLASSROOMS,
    students: DEMO_STUDENTS,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}
