import React, { useState } from 'react';
import StudentApp from './student/StudentApp';
import OwnerApp from './owner/OwnerApp';

export default function App() {
  // Student view opens by default (Requirement 2)
  const [view, setView] = useState('student');

  return (
    <div className="campus-food-module">
      {/* Persistent Campus Hub Navigation Strip (Requirement 6) */}
      <nav className="campus-nav-strip" aria-label="Campus navigation">
        <a href="../index.html" className="campus-hub-link">
          ← Back to Campus Hub
        </a>

        <div className="campus-nav-actions">
          <span className={`nav-mode-badge ${view}`}>
            {view === 'student' ? 'Student View' : 'Canteen Staff Portal'}
          </span>
          {view === 'student' ? (
            <button
              type="button"
              onClick={() => setView('owner')}
              className="nav-switch-btn"
              title="Switch to Canteen Staff Portal"
            >
              🔒 Canteen Staff Login
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setView('student')}
              className="nav-switch-btn"
              title="Return to Student Pre-Order View"
            >
              🍽️ Student Ordering
            </button>
          )}
        </div>
      </nav>

      {/* Main View: Student Pre-ordering App or Kitchen Dashboard */}
      {view === 'student' ? (
        <StudentApp onOpenStaffLogin={() => setView('owner')} />
      ) : (
        <OwnerApp onSwitchToStudent={() => setView('student')} />
      )}
    </div>
  );
}
