import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI, SchemaType, type Tool, type ChatSession } from '@google/generative-ai';

// --- INTERFACES ---
interface AppointmentDetails {
  patientName: string;
  department: string;
  doctorName: string;
  symptoms: string;
  timeSlot: string;
}

// --- TOOL DEFINITIONS ---
const getDoctorAvailabilityTool: Tool = {
  functionDeclarations: [
    {
      name: 'get_doctor_availability',
      description: 'Get the list of available doctor slots for a specific department.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          department: { type: SchemaType.STRING, description: 'Medical department (e.g. General, Cardiology)' },
        },
        required: ['department'],
      },
    }
  ]
};

const confirmAppointmentTool: Tool = {
  functionDeclarations: [
    {
      name: 'confirm_appointment',
      description: 'Finalize the booking. REQUIRED: You must have a specific time slot selected by the user before calling this.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          patientName: { type: SchemaType.STRING, description: 'Name of patient' },
          department: { type: SchemaType.STRING, description: 'Department booked' },
          doctorName: { type: SchemaType.STRING, description: 'Doctor name' },
          symptoms: { type: SchemaType.STRING, description: 'Patient symptoms' },
          timeSlot: { type: SchemaType.STRING, description: 'The specific time slot selected (e.g. "10:00 AM")' },
        },
        required: ['patientName', 'department', 'symptoms', 'timeSlot'],
      },
    }
  ]
};

const VoiceAssistant: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<string>('Ready to help');
  const [transcription, setTranscription] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState<'en-US' | 'ml-IN'>('en-US');
  
  // Doctor Slots State
  const [doctorSlots, setDoctorSlots] = useState<any[]>([]);

  const chatSessionRef = useRef<ChatSession | null>(null);
  const recognitionRef = useRef<any>(null);
  const historyRef = useRef<string[]>([]);
  const sessionIdRef = useRef(Date.now().toString());

  // 1. FETCH DOCTORS ON MOUNT
  const refreshDoctors = async () => {
    try {
      const res = await fetch('http://localhost:4000/doctors');
      const data = await res.json();
      setDoctorSlots(data.slots || []);
      return data.slots || [];
    } catch (err) {
      console.error("Error loading doctors:", err);
      return [];
    }
  };

  useEffect(() => {
    refreshDoctors();
  }, []);

  // 2. SETUP SPEECH RECOGNITION
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language;
      recognitionRef.current.onresult = (event: any) => handleStandardVoiceInput(event.results[0][0].transcript);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [language]);

  // 3. TEXT-TO-SPEECH
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = language === 'ml-IN' 
        ? (voices.find(v => v.lang === 'ml-IN') || voices.find(v => v.lang === 'en-IN')) 
        : (voices.find(v => v.name.includes('Google') && v.lang === 'en-IN') || voices.find(v => v.lang === 'en-IN'));
    if (selectedVoice) utterance.voice = selectedVoice;
    window.speechSynthesis.speak(utterance);
  };

  // 4. SAVE APPOINTMENT
  const analyzeAndSave = async (details: AppointmentDetails) => {
    setStatus('Finalizing...');
    
    // Attempt Sentiment Analysis (Non-blocking)
    let sentimentData = { sentiment: 'Neutral', confidence: 0.5 };
    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
      const prompt = `Analyze sentiment: ${historyRef.current.join('\n')}. Return JSON { "sentiment": "...", "confidence": 0.0 }`;
      const result = await model.generateContent(prompt);
      sentimentData = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
    } catch (e) { console.warn("Sentiment skipped"); }

    try {
      // Save to Backend
      const response = await fetch('http://localhost:4000/log-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, ...sentimentData, source: 'voice' })
      });
      if (response.ok) setStatus('Saved!');
    } catch (e) { console.error("Save failed", e); }
  };

  // 5. SAVE TRANSCRIPT
  const saveVoiceTranscript = async (currentHistory: string[]) => {
    try {
      await fetch('http://localhost:4000/log-voice-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, messages: currentHistory })
      });
    } catch (e) { console.error("Transcript save failed", e); }
  };

  // 6. MAIN AI LOGIC
  const handleStandardVoiceInput = async (text: string) => {
    const userMsg = `You: ${text}`;
    setTranscription(prev => [...prev, userMsg]);
    historyRef.current.push(userMsg);
    setIsProcessing(true);
    setStatus('Thinking...');

    try {
      if (!chatSessionRef.current) {
        const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
        const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        const model = genAI.getGenerativeModel({ 
          model: 'gemini-3-pro-preview', 
          systemInstruction: `You are Puck, a hospital booking assistant.
            TODAY IS: ${todayStr}.
            
            STRICT RULES:
            1. STEP 1: Ask for Patient Name and Symptoms.
            2. STEP 2: Ask for Department.
            3. STEP 3: Call 'get_doctor_availability' to see slots.
            4. STEP 4: READ the available slots to the user (e.g., "Dr Smith at 10 AM").
            5. STEP 5: WAIT for the user to pick a specific time.
            6. STEP 6: Call 'confirm_appointment' ONLY after the user picks a time.
            
            DO NOT confirm an appointment if the user hasn't selected a time slot.
            
            Output JSON: { "text": "...", "speech": "..." }`,
          tools: [getDoctorAvailabilityTool, confirmAppointmentTool],
        });

        chatSessionRef.current = model.startChat({ history: [] });
      }

      const result = await chatSessionRef.current.sendMessage(text);
      const response = await result.response;
      const functionCalls = response.functionCalls();

      let displayReply = "";
      let speechReply = "";

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        const args = call.args as any;

        if (call.name === 'get_doctor_availability') {
          // Refresh slots just in case
          const currentSlots = await refreshDoctors();
          const reqDept = args.department ? args.department.toLowerCase() : '';
          
          const relevantSlots = currentSlots.filter((s: any) => 
            s.department.toLowerCase().includes(reqDept) || reqDept.includes(s.department.toLowerCase())
          );
          
          const finalSlots = relevantSlots.length > 0 ? relevantSlots : currentSlots;

          const slotString = finalSlots.map((s: any) => {
             // Robust Date Handling
             let dateStr = s.date || s.day; // Fallback to 'day' if 'date' missing
             if (s.date && !isNaN(Date.parse(s.date))) {
                 dateStr = new Date(s.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
             }
             return `${dateStr} at ${s.time} with ${s.doctor}`;
          }).join(', or ');

          const toolResult = { result: `Found slots: ${slotString || 'None'}. Ask user to pick one.` };
          
          const nextResult = await chatSessionRef.current.sendMessage(JSON.stringify(toolResult));
          const parsed = JSON.parse(nextResult.response.text().replace(/```json|```/g, '').trim());
          displayReply = parsed.text;
          speechReply = parsed.speech;
        } 
        else if (call.name === 'confirm_appointment') {
          displayReply = `Confirmed: ${args.doctorName} at ${args.timeSlot}.`;
          speechReply = `I have booked your appointment with ${args.doctorName} for ${args.timeSlot}.`;
          
          await analyzeAndSave({
             patientName: args.patientName,
             department: args.department,
             doctorName: args.doctorName || 'General',
             symptoms: args.symptoms,
             timeSlot: args.timeSlot
          });
        }
      } else {
        const parsed = JSON.parse(response.text().replace(/```json|```/g, '').trim());
        displayReply = parsed.text;
        speechReply = parsed.speech;
      }

      const botMsg = `Puck: ${displayReply}`;
      setTranscription(prev => [...prev, botMsg]);
      historyRef.current.push(botMsg);
      speak(speechReply);
      setStatus('Ready');
      await saveVoiceTranscript(historyRef.current);

    } catch (err) {
      console.error(err);
      setStatus('Error');
      speak("I'm sorry, something went wrong. Please say that again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else {
      window.speechSynthesis.cancel();
      recognitionRef.current?.start();
      setIsListening(true);
      setStatus('Listening...');
    }
  };

  return (
    <div className="flex flex-col h-full p-6 md:p-10 bg-white">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        <header className="mb-8 flex justify-between items-start border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white"><i className="fas fa-plus"></i></div>
             <h2 className="text-2xl font-bold text-slate-900">Rajagiri Voice Assistant</h2>
          </div>
        </header>
        <div className="flex-grow flex flex-col items-center justify-center mb-8">
          <div className={`relative w-60 h-60 rounded-full flex items-center justify-center ${isListening ? 'bg-red-600 shadow-xl' : 'bg-slate-50 border'}`}>
            <button onClick={toggleListening} disabled={isProcessing} className={`w-40 h-40 rounded-full text-white ${isListening ? 'bg-slate-900' : 'bg-red-700'}`}>
              {isProcessing ? <i className="fas fa-spinner fa-spin text-3xl"></i> : <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'} text-3xl`}></i>}
            </button>
          </div>
          <div className="mt-8 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest border">{status}</div>
        </div>
        <div className="bg-slate-50 rounded-[2rem] p-6 border h-64 overflow-y-auto flex flex-col-reverse">
          <div className="space-y-4">
            {transcription.map((t, i) => (
              <div key={i} className={`flex ${t.startsWith('You:') ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl text-xs max-w-[85%] ${t.startsWith('You:') ? 'bg-red-700 text-white' : 'bg-white border'}`}>
                  {t.replace(/^(Puck:|You:)\s*/, '')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;