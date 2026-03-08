import { useState } from 'react';
import LandingPage from './components/LandingPage';
import TrackingView from './components/TrackingView';

export default function App() {
  const [screen, setScreen] = useState('landing'); // 'landing' | 'tracking'
  const [incidentPos, setIncidentPos] = useState(null);

  const handleStartMission = (pos) => {
    setIncidentPos(pos);
    setScreen('tracking');
  };

  const handleBack = () => {
    setScreen('landing');
    setIncidentPos(null);
  };

  return (
    <div className="w-full h-full">
      {screen === 'landing' && (
        <LandingPage onStartMission={handleStartMission} />
      )}
      {screen === 'tracking' && incidentPos && (
        <TrackingView incidentPos={incidentPos} onBack={handleBack} />
      )}
    </div>
  );
}
