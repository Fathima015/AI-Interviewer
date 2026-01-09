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
        
        {/* LOGO REMOVED HERE */}
        <div className="mb-10">
            <h1 className="text-xl font-bold text-slate-800">Interview Bot</h1>
            <span className="text-xs font-semibold text-slate-400">AI Powered</span>
        </div>

        <div className="flex flex-col gap-2 flex-grow">
          <NavItem 
            icon="fa-microphone" 
            label="Interview Room" 
            active={activeTab === AppTab.VOICE_BOOKING} 
            onClick={() => onTabChange(AppTab.VOICE_BOOKING)} 
          />
          
          {/* CHATBOT BUTTON REMOVED HERE */}
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs font-medium text-blue-600 mb-1 uppercase tracking-wider">Status</p>
            <p className="text-sm font-bold text-blue-900">System Online</p>
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
        ? 'bg-blue-50 text-blue-700 shadow-sm' 
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`}
  >
    <i className={`fas ${icon} w-5`}></i>
    {label}
  </button>
);

export default Layout;