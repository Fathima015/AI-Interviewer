import React, { useState } from 'react';
import Layout from './components/Layout';
import VoiceAssistant from './components/VoiceAssistant';
import Chatbot from './components/Chatbot';
import { AppTab } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.VOICE_BOOKING);

  const renderContent = () => {
    switch (activeTab) {
      case AppTab.VOICE_BOOKING:
        return <VoiceAssistant />;
      case AppTab.HEALTH_CHAT:
        return <Chatbot />;
      default:
        return <VoiceAssistant />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="flex-grow relative h-full">
        <div className="absolute inset-0 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </Layout>
  );
};

export default App;