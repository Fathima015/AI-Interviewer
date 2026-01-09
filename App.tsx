import React, { useState } from 'react';
import Layout from './components/Layout';
import VoiceAssistant from './components/VoiceAssistant';
import { AppTab } from './types';

const App: React.FC = () => {
  // Default and only tab is VOICE_BOOKING (Interview Room)
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.VOICE_BOOKING);

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="flex-grow relative h-full">
        <div className="absolute inset-0 overflow-auto">
          {/* We no longer need a switch statement since there is only one view */}
          <VoiceAssistant />
        </div>
      </div>
    </Layout>
  );
};

export default App;