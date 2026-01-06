
import React from 'react';
import { AppTab } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-64 bg-white border-b md:border-r border-slate-200 p-6 flex flex-col shadow-sm">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-red-700 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg">
            <i className="fas fa-hospital text-xl"></i>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">Rajagiri</h1>
            <span className="text-xs font-semibold text-slate-400">Hospital Assistant</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-grow">
          <NavItem 
            icon="fa-microphone" 
            label="Voice Booking" 
            active={activeTab === AppTab.VOICE_BOOKING} 
            onClick={() => onTabChange(AppTab.VOICE_BOOKING)} 
          />
          <NavItem 
            icon="fa-comments" 
            label="Symptom Chat" 
            active={activeTab === AppTab.HEALTH_CHAT} 
            onClick={() => onTabChange(AppTab.HEALTH_CHAT)} 
          />
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="p-4 bg-red-50 rounded-xl border border-red-100">
            <p className="text-xs font-medium text-red-600 mb-1 uppercase tracking-wider">Emergency 24/7</p>
            <p className="text-sm font-bold text-red-900">0484 290 5100</p>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow flex flex-col relative overflow-hidden">
        {children}
      </main>
    </div>
  );
};

interface NavItemProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
      active 
        ? 'bg-red-50 text-red-700 shadow-sm' 
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`}
  >
    <i className={`fas ${icon} w-5`}></i>
    {label}
  </button>
);

export default Layout;
