export enum AppTab {
  VOICE_BOOKING = 'VOICE_BOOKING',
  HEALTH_CHAT = 'HEALTH_CHAT'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface Appointment {
  id: string;
  patientName: string;
  symptoms: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed';
}