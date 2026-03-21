import { Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

function App() {
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    // Load display name from session storage
    const savedName = sessionStorage.getItem('peer_display_name');
    if (savedName) {
      setDisplayName(savedName);
    }
  }, []);

  const handleDisplayNameChange = (name: string) => {
    setDisplayName(name);
    sessionStorage.setItem('peer_display_name', name);
  };

  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route
          path="/"
          element={<HomePage displayName={displayName} onDisplayNameChange={handleDisplayNameChange} />}
        />
        <Route
          path="/room/:token"
          element={<RoomPage displayName={displayName} />}
        />
      </Routes>
    </div>
  );
}

export default App;
