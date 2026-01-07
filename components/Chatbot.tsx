import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const Chatbot: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      text: "Hello! I'm Medibot, your medical assistant. I can help verify symptoms and check doctor availability. How are you feeling?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [doctorAvailability, setDoctorAvailability] = useState<string>('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(Date.now().toString());

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await fetch('http://localhost:4000/doctors');
        const data = await res.json();
        
        // FORMAT THE DATA FOR THE AI
        // We convert "2026-01-08" into a readable string like "Thursday, Jan 8"
        const slotsText = data.slots.map((s: any) => {
          const dateObj = new Date(s.date);
          const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return `- ${dateStr} at ${s.time} with ${s.doctor} (${s.department})`;
        }).join('\n');
        
        setDoctorAvailability(slotsText);
      } catch (e) {
        console.error("Failed to fetch doctors", e);
        setDoctorAvailability("- 2026-01-08 at 10:00 AM with Dr. Smith");
      }
    };
    fetchDoctors();
  }, []);

  const saveChatTranscript = async (currentMessages: ChatMessage[]) => {
    try {
      await fetch('http://localhost:4000/log-conversation', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          type: 'text-chat',
          messages: currentMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`)
        })
      });
    } catch (e) { console.error(e); }
  };

  const saveAppointment = async (appointmentData: any) => {
    try {
      await fetch('http://localhost:4000/log-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointmentData)
      });
    } catch (e) { console.error(e); }
  };

  const analyzeSentiment = async (currentHistory: ChatMessage[]) => {
    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const conversationText = currentHistory.map(m => `${m.role}: ${m.text}`).join('\n');
      const prompt = `Analyze sentiment of USER. Return JSON: { "sentiment": "Happy|Neutral|Anxious|Angry|Sad", "confidence": 0.0-1.0 }\n\n${conversationText}`;
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
    } catch (e) { return { sentiment: "Unknown", confidence: 0 }; }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: new Date() };
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput('');
    setIsTyping(true);

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      
      // --- NEW: Get Current Date ---
      const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp", 
        systemInstruction: `You are Medibot, a helpful AI medical assistant for Rajagiri Hospital. 
        
        CONTEXT:
        - Today's Date: ${todayStr}
        
        RULES:
        1. Be empathetic, professional, and concise.
        2. DO NOT introduce yourself if you have already done so.
        3. Phone Numbers: ACCEPT any valid 10-digit number.
        
        4. AVAILABILITY (STRICT): 
           Use the following schedule. "Tomorrow" means the day after ${todayStr}.
           
           === CURRENT SCHEDULE ===
           ${doctorAvailability}
           ========================

        5. CONFIRMATION: When you explicitly CONFIRM an appointment, output:
        :::JSON_APPOINTMENT{"patientName": "Name", "phoneNumber": "123", "department": "Dept", "date": "YYYY-MM-DD", "time": "HH:MM"}:::
        `,
      });

      const historyForGemini = newHistory.slice(1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
      }));

      const chat = model.startChat({ history: historyForGemini });
      const assistantId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '', timestamp: new Date() }]);
      const result = await chat.sendMessageStream(input);
      
      let fullResponseText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponseText += chunkText;
        setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, text: fullResponseText } : msg));
      }

      let displayText = fullResponseText;
      const match = fullResponseText.match(/:::JSON_APPOINTMENT({.*?}):::/s);
      if (match && match[1]) {
        try {
          const appointmentData = JSON.parse(match[1]);
          const sentimentResult = await analyzeSentiment(newHistory);
          await saveAppointment({ ...appointmentData, sentiment: sentimentResult.sentiment, confidence: sentimentResult.confidence, source: 'chatbot' });
          displayText = fullResponseText.replace(match[0], '').trim();
          setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, text: displayText } : msg));
        } catch (e) { console.error(e); }
      }
      
      await saveChatTranscript([...newHistory, { id: assistantId, role: 'assistant', text: displayText, timestamp: new Date() }]);
      
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: "Connection error. Please try again.", timestamp: new Date() }]);
    } finally { setIsTyping(false); }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-lg font-bold text-red-700 flex items-center gap-2"><i className="fa-solid fa-user-doctor"></i> Dr. Medibot</h2>
        <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">Online</span>
      </div>
      <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${msg.role === 'user' ? 'bg-red-700 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'}`}>{msg.text}</div>
          </div>
        ))}
        {isTyping && <div className="p-4 text-xs text-slate-400">Medibot is typing...</div>}
      </div>
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <div className="relative flex items-center gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Describe your symptoms..." className="w-full p-3 pr-12 rounded-xl border border-slate-300 outline-none" />
          <button onClick={handleSend} disabled={!input.trim() || isTyping} className="absolute right-2 p-2 text-red-700"><i className="fas fa-paper-plane text-lg"></i></button>
        </div>
      </div>
    </div>
  );
};
export default Chatbot;