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
    window.speechSynthesis.getVoices();
  }, []);

  // 2. GOOGLE VOICE HANDLER (Female Malayalam Support)
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    setStatus('Speaking...');

    if (language === 'ml-IN') {
        // GOOGLE SERVER TTS (Female Malayalam)
        // This is the only way to get a female voice for Malayalam without paid APIs
        console.log("Speaking Malayalam via Google...");
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ml&q=${encodeURIComponent(text)}`;
        const audio = new Audio(url);
        audio.play().catch(e => {
            console.error("Google Audio Failed:", e);
            setStatus('Ready');
        });
        audio.onended = () => setStatus('Ready');
    } else {
        // BROWSER TTS (English)
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        
        // Hunt for Female Voice
        let selectedVoice = voices.find(v => v.name === 'Google US English');
        if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Zira')); // Windows
        if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Samantha')); // Mac
        if (!selectedVoice) selectedVoice = voices.find(v => v.lang.includes('en')); 

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            if (!selectedVoice.name.includes('Google')) utterance.pitch = 1.1; 
        }

        utterance.onend = () => setStatus('Ready');
        window.speechSynthesis.speak(utterance);
    }
  };

  // 3. SETUP SPEECH RECOGNITION
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.abort();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = language;
      recognitionRef.current.onresult = (event: any) => handleStandardVoiceInput(event.results[0][0].transcript);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [language]);

  // 4. SAVE APPOINTMENT
  const analyzeAndSave = async (details: AppointmentDetails) => {
    setStatus('Finalizing...');
    try {
      // Just save directly to avoid extra API calls that might fail
      const response = await fetch('http://localhost:4000/log-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, source: 'voice' })
      });
      if (response.ok) setStatus('Saved!');
    } catch (e) { console.error("Save failed", e); }
  };

  const saveVoiceTranscript = async (currentHistory: string[]) => {
    try {
      await fetch('http://localhost:4000/log-voice-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, messages: currentHistory })
      });
    } catch (e) { console.error("Transcript save failed", e); }
  };

  // 5. MAIN AI LOGIC (GEMINI 2.0 FLASH)
  const handleStandardVoiceInput = async (text: string) => {
    const userMsg = `You: ${text}`;
    setTranscription(prev => [...prev, userMsg]);
    historyRef.current.push(userMsg);
    setIsProcessing(true);
    setStatus('Thinking...');

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const todayStr = new Date().toLocaleDateString();

      // SYSTEM INSTRUCTION
      const systemInstruction = `You are Puck, a hospital assistant. Today: ${todayStr}.
      Language: ${language === 'ml-IN' ? 'MALAYALAM' : 'ENGLISH'}.
      
      RULES:
      1. Return JSON with "text" and "speech".
      2. If Malayalam, "text" and "speech" MUST be in Malayalam Script (e.g. ഡോക്ടർ).
      3. Keep answers short.
      
      Flow: Ask Name/Symptoms -> Ask Dept -> Call get_doctor_availability -> Read Slots -> Confirm.
      Output JSON: { "text": "...", "speech": "..." }`;

      // --- MODEL SELECTION STRATEGY ---
      // 1. Try Gemini 2.0 Flash (Experimental)
      // 2. If 404, Try Gemini 1.5 Pro (Stable)
      
      if (!chatSessionRef.current) {
         try {
             // ATTEMPT 1: Gemini 2.0 Flash
             const model = genAI.getGenerativeModel({ 
                model: 'gemini-2.0-flash-exp', 
                systemInstruction,
                tools: [getDoctorAvailabilityTool, confirmAppointmentTool],
             });
             chatSessionRef.current = model.startChat({ history: [] });
         } catch (e) {
             console.log("Model Init Error (Retrying with Fallback)");
         }
      }

      let result;
      try {
         result = await chatSessionRef.current.sendMessage(text);
      } catch (firstError: any) {
         console.warn("Gemini 2.0 failed. Switching to Gemini 1.5 Pro.", firstError);
         
         // FALLBACK: Gemini 1.5 Pro (Known Stable)
         const fallbackModel = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-pro', 
            systemInstruction,
            tools: [getDoctorAvailabilityTool, confirmAppointmentTool],
         });
         chatSessionRef.current = fallbackModel.startChat({ history: [] });
         result = await chatSessionRef.current.sendMessage(text);
      }

      const response = await result.response;
      const functionCalls = response.functionCalls();

      let displayReply = "";
      let speechReply = "";

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        const args = call.args as any;

        if (call.name === 'get_doctor_availability') {
          const currentSlots = await refreshDoctors();
          const reqDept = args.department ? args.department.toLowerCase() : '';
          const relevant = currentSlots.filter((s: any) => s.department.toLowerCase().includes(reqDept));
          const finalSlots = relevant.length ? relevant : currentSlots;
          const slotStr = finalSlots.map((s: any) => `${s.time} with ${s.doctor}`).join(', ');

          const toolResult = { result: `Slots: ${slotStr || 'None'}. Ask user to pick.` };
          const nextRes = await chatSessionRef.current.sendMessage(JSON.stringify(toolResult));
          const parsed = JSON.parse(nextRes.response.text().replace(/```json|```/g, '').trim());
          displayReply = parsed.text;
          speechReply = parsed.speech;
        } 
        else if (call.name === 'confirm_appointment') {
          displayReply = `Confirmed: ${args.doctorName}`;
          speechReply = language === 'ml-IN' 
             ? `ശരി, ${args.doctorName}-യുമായുള്ള അപ്പോയിന്റ്മെന്റ് ബുക്ക് ചെയ്തിട്ടുണ്ട്.` 
             : `Confirmed with ${args.doctorName}.`;

          await analyzeAndSave({
             patientName: args.patientName,
             department: args.department,
             doctorName: args.doctorName || 'General',
             symptoms: args.symptoms,
             timeSlot: args.timeSlot
          });
        }
      } else {
        const textResponse = response.text().replace(/```json|```/g, '').trim();
        try {
            const parsed = JSON.parse(textResponse);
            displayReply = parsed.text;
            speechReply = parsed.speech;
        } catch (e) {
            displayReply = textResponse;
            speechReply = textResponse;
        }
      }

      const botMsg = `Puck: ${displayReply}`;
      setTranscription(prev => [...prev, botMsg]);
      historyRef.current.push(botMsg);
      
      speak(speechReply);
      await saveVoiceTranscript(historyRef.current);

    } catch (err) {
      console.error(err);
      setStatus('Error');
      speak("System error.");
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
        <header className="mb-8 flex justify-between items-center border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white"><i className="fas fa-plus"></i></div>
             <h2 className="text-2xl font-bold text-slate-900">Rajagiri Voice Assistant</h2>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setLanguage('en-US')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${language === 'en-US' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500'}`}>English</button>
            <button onClick={() => setLanguage('ml-IN')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${language === 'ml-IN' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500'}`}>Malayalam</button>
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