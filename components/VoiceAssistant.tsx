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

// --- TOOLS ---
const getDoctorAvailabilityTool: Tool = {
  functionDeclarations: [{
    name: 'get_doctor_availability',
    description: 'Get doctor slots.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { department: { type: SchemaType.STRING } },
      required: ['department'],
    },
  }]
};

const confirmAppointmentTool: Tool = {
  functionDeclarations: [{
    name: 'confirm_appointment',
    description: 'Finalize booking. REQUIRED when user selects a time slot.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        patientName: { type: SchemaType.STRING },
        department: { type: SchemaType.STRING },
        doctorName: { type: SchemaType.STRING },
        symptoms: { type: SchemaType.STRING },
        timeSlot: { type: SchemaType.STRING },
      },
      required: ['patientName', 'department', 'symptoms', 'timeSlot'],
    },
  }]
};

const VoiceAssistant: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<string>('Divya is ready');
  const [transcription, setTranscription] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState<'en-US' | 'ml-IN'>('en-US'); 
  
  const [doctorSlots, setDoctorSlots] = useState<any[]>([]);
  const chatSessionRef = useRef<ChatSession | null>(null);
  const recognitionRef = useRef<any>(null);
  const historyRef = useRef<string[]>([]);
  const sessionIdRef = useRef(Date.now().toString());

  // 1. PLAY AUDIO
  const playBase64Audio = (base64String: string) => {
    try {
      const binaryString = window.atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();
      audio.onended = () => setStatus('Ready');
    } catch (e) {
      console.error("Audio Playback Error:", e);
      setStatus('Error');
    }
  };

  // 2. SPEAK FUNCTION (Switched to 'arya')
  const speak = async (text: string) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    setStatus('Speaking...');

    const sarvamKey = import.meta.env.VITE_SARVAM_API_KEY;

    if (sarvamKey) {
        try {
            const response = await fetch("https://api.sarvam.ai/text-to-speech", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "api-subscription-key": sarvamKey 
                },
                body: JSON.stringify({
                    text: text, 
                    target_language_code: language === 'ml-IN' ? "ml-IN" : "en-IN",
                    // --- VOICE SET TO ARYA ---
                    speaker: "arya", 
                    pitch: 0, 
                    pace: 1.0, 
                    loudness: 1.5, 
                    speech_sample_rate: 16000,
                    enable_preprocessing: true 
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data?.audios?.[0]) {
                    playBase64Audio(data.audios[0]);
                    return;
                }
            }
        } catch (e) { console.error("Sarvam Exception:", e); }
    }

    // FALLBACK
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Zira'));
    if (femaleVoice) utterance.voice = femaleVoice;
    utterance.onend = () => setStatus('Ready');
    window.speechSynthesis.speak(utterance);
  };

  // 3. DOCTOR DATA
  const refreshDoctors = async () => {
    try {
      const res = await fetch('http://localhost:4000/doctors');
      const data = await res.json();
      setDoctorSlots(data.slots || []);
      return data.slots || [];
    } catch (err) { return []; }
  };
  useEffect(() => { refreshDoctors(); window.speechSynthesis.getVoices(); }, []);

  // 4. SPEECH RECOGNITION
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.abort();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = language;
      recognition.onresult = (e: any) => handleStandardVoiceInput(e.results[0][0].transcript);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, [language]);

  // FIX: ROBUST SAVE FUNCTION
  const analyzeAndSave = async (details: AppointmentDetails) => {
    console.log("📝 DIVYA IS SAVING:", details); 
    setStatus('Saving...');
    try {
      const response = await fetch('http://localhost:4000/log-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, source: 'voice' })
      });
      
      if (response.ok) {
          console.log("✅ Saved!");
          setStatus('Saved!');
      } else {
          console.error("❌ Save Failed");
          setStatus('Save Error');
      }
    } catch (e) { 
        console.error("❌ Network Error", e); 
        setStatus('Net Error');
    }
  };

  // 5. MAIN AI LOGIC
  const handleStandardVoiceInput = async (text: string) => {
    const userMsg = `You: ${text}`;
    setTranscription(prev => [...prev, userMsg]);
    historyRef.current.push(userMsg);
    
    setIsProcessing(true);
    setStatus('Thinking...');

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const todayStr = new Date().toLocaleDateString();

      // --- DIVYA PERSONA + NATURAL MALAYALAM ---
      const systemPrompt = `SYSTEM: You are Divya, a hospital receptionist in Kerala. 
      Today: ${todayStr}.
      CURRENT MODE: ${language === 'ml-IN' ? 'MALAYALAM (മലയാളം)' : 'ENGLISH'}.
      
      CRITICAL FLOW:
      1. FIRST: Introduce yourself ("Namaskaram, I am Divya") and ASK FOR USER'S NAME.
      2. Do NOT proceed without the name.
      3. Return JSON: { "text": "...", "speech": "..." }
      
      LANGUAGE RULES (MALAYALAM MODE):
      - Use **Conversational Malayalam** (Manglish style but in Malayalam script).
      - Use English words for technical terms but write them in Malayalam script.
      - Example: "അപ്പോയിന്റ്മെന്റ്" instead of "കൂടിക്കാഴ്ച".
      - Example: "ഡോക്ടർ" instead of "വൈദ്യൻ".
      
      Output JSON Only.`;

      if (!chatSessionRef.current) {
         try {
             const model = genAI.getGenerativeModel({ 
                model: 'gemini-2.0-flash-exp', 
                systemInstruction: systemPrompt,
                tools: [getDoctorAvailabilityTool, confirmAppointmentTool],
             });
             chatSessionRef.current = model.startChat({ history: [] });
         } catch(e) { console.log("Init Error"); }
      }

      let result;
      try {
         result = await chatSessionRef.current.sendMessage(text);
      } catch (firstError: any) {
         console.warn("Gemini 2.0 failed. Switching to Gemini 1.5 Pro.", firstError);
         const fallbackModel = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-pro', 
            tools: [getDoctorAvailabilityTool, confirmAppointmentTool],
         });
         chatSessionRef.current = fallbackModel.startChat({ history: [] });
         await chatSessionRef.current.sendMessage(systemPrompt);
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
          const slots = await refreshDoctors();
          const reqDept = args.department ? args.department.toLowerCase() : '';
          const relevant = slots.filter((s: any) => s.department.toLowerCase().includes(reqDept));
          const slotStr = relevant.map((s:any) => `${s.time} with ${s.doctor}`).join(', ');
          
          const toolRes = { result: `Slots found: ${slotStr}.` };
          
          const nextRes = await chatSessionRef.current.sendMessage(
             `Here is data: ${JSON.stringify(toolRes)}. Explain in ${language === 'ml-IN' ? 'MALAYALAM' : 'ENGLISH'}. Use casual conversational style.`
          );
          const parsed = JSON.parse(nextRes.response.text().replace(/```json|```/g, '').trim());
          displayReply = parsed.text;
          speechReply = parsed.speech;
        } 
        else if (call.name === 'confirm_appointment') {
          console.log("🤖 DIVYA IS BOOKING...", args); 
          
          displayReply = `Confirmed: ${args.doctorName}`;
          speechReply = language === 'ml-IN' 
             ? `ശരി ${args.patientName}, ${args.doctorName}-യുമായുള്ള അപ്പോയിന്റ്മെന്റ് ബുക്ക് ചെയ്തിട്ടുണ്ട്.` 
             : `Done. Booking confirmed for ${args.patientName}.`;
          
          // FORCE SAVE
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

      const botMsg = `Divya: ${displayReply}`;
      setTranscription(prev => [...prev, botMsg]);
      historyRef.current.push(botMsg);
      
      await speak(speechReply);
      
      await fetch('http://localhost:4000/log-voice-conversation', {
        method: 'POST', 
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ sessionId: sessionIdRef.current, messages: historyRef.current })
      });

    } catch (err) {
      console.error(err);
      setStatus('Error');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else { window.speechSynthesis.cancel(); recognitionRef.current?.start(); setIsListening(true); setStatus('Listening...'); }
  };

  return (
    <div className="flex flex-col h-full p-6 md:p-10 bg-white">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        <header className="mb-8 flex justify-between items-center border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white"><i className="fas fa-plus"></i></div>
             <h2 className="text-2xl font-bold text-slate-900">Divya (Rajagiri Assistant)</h2>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setLanguage('en-US')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${language === 'en-US' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              English
            </button>
            <button onClick={() => setLanguage('ml-IN')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${language === 'ml-IN' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Malayalam
            </button>
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
                  {t.replace(/^(Divya:|You:)\s*/, '')}
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