import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI, SchemaType, type Tool, type ChatSession } from '@google/generative-ai';

// Tool Definition
const getDoctorAvailabilityTool: Tool = {
  functionDeclarations: [
    {
      name: 'get_doctor_availability',
      description: 'Check if a specific doctor or department is available and proceed with booking information.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          patientName: { type: SchemaType.STRING, description: 'The name of the patient.' },
          department: { type: SchemaType.STRING, description: 'The medical department.' },
          doctorName: { type: SchemaType.STRING, description: 'Specific doctor requested.' },
          symptoms: { type: SchemaType.STRING, description: 'Symptoms described by the user.' },
        },
        required: ['patientName', 'department', 'symptoms'],
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

  const chatSessionRef = useRef<ChatSession | null>(null);
  const recognitionRef = useRef<any>(null);

  // 1. SETUP SPEECH RECOGNITION
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language;

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        handleStandardVoiceInput(text);
      };

      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        setStatus('Error listening');
      };
    }
    
    // Force load voices
    window.speechSynthesis.getVoices();
  }, [language]);

  // 2. AGGRESSIVE INDIAN VOICE SELECTOR
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // Debug: Log all available Indian voices to console
    const indianVoices = voices.filter(v => v.lang.includes('IN') || v.name.includes('India'));
    console.log("Available Indian Voices:", indianVoices.map(v => v.name));

    let selectedVoice = null;

    if (language === 'ml-IN') {
      // 1. Try Malayalam
      selectedVoice = voices.find(v => v.lang === 'ml-IN');
      // 2. Try Google India (Best for Manglish)
      if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Google') && v.lang === 'en-IN');
      // 3. Try any India
      if (!selectedVoice) selectedVoice = voices.find(v => v.lang === 'en-IN');
    } else {
      // ENGLISH: Prioritize "Google English (India)" as it sounds most natural
      selectedVoice = voices.find(v => v.name.includes('Google') && v.lang === 'en-IN');
      
      // Fallback to Microsoft/System Indian voices
      if (!selectedVoice) selectedVoice = voices.find(v => v.lang === 'en-IN');
    }

    // Absolute fallback (prevents silence)
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.name.includes('Google US English')); // At least it's clear
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log("SELECTED VOICE:", selectedVoice.name);
    }

    // TWEAKING PARAMETERS TO REDUCE "ROBOTIC" FEEL
    // Slower rate = more time to enunciate
    // Slightly lower pitch = less "tinny"
    utterance.rate = 0.9; 
    utterance.pitch = 0.95; 
    
    window.speechSynthesis.speak(utterance);
  };

  // 3. MAIN AI HANDLER (GEMINI 3 FLASH)
  const handleStandardVoiceInput = async (text: string) => {
    setTranscription(prev => [...prev, `You: ${text}`]);
    setIsProcessing(true);
    setStatus('Thinking...');

    try {
      if (!chatSessionRef.current) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey || apiKey.includes("YourActualKey")) throw new Error("Invalid API Key");

        const genAI = new GoogleGenerativeAI(apiKey);
        
        const model = genAI.getGenerativeModel({ 
          model: 'gemini-3-flash-preview', 
          systemInstruction: `You are Puck, a warm and caring hospital booking assistant for Rajagiri Hospital.
            
            OUTPUT FORMAT:
            Reply in strictly valid JSON:
            {
              "text": "Text to display on screen",
              "speech": "Text for robot to read"
            }

            RULES:
            1. If Malayalam -> "text" is script, "speech" is Manglish.
            2. TONE: Be very polite, use "Please" and "Kindly". Do not sound robotic.
            3. Keep it short.`,
          tools: [getDoctorAvailabilityTool],
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
        if (call.name === 'get_doctor_availability') {
          const args = call.args as any;
          if (language === 'ml-IN') {
             displayReply = `പരിശോധിച്ചു. നാളെ രാവിലെ 11 മണിക്ക് ${args.department}-ൽ ${args.patientName}-ന് ഒഴിവുണ്ട്. ബുക്ക് ചെയ്യട്ടെ?`;
             speechReply = `Parishodhichu. Naale raavile 11 manikku ${args.department}il ${args.patientName}inu ozhivund. Book cheyyatte?`;
          } else {
             displayReply = `I've checked the schedule. We have an opening in ${args.department} for ${args.patientName} tomorrow at 11 AM. Shall I book this?`;
             speechReply = displayReply;
          }
        }
      } else {
        const rawText = response.text();
        try {
          const cleanJson = rawText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          displayReply = parsed.text;
          speechReply = parsed.speech;
        } catch (e) {
          console.error("JSON Parse Error", e);
          displayReply = rawText;
          speechReply = rawText;
        }
      }

      setTranscription(prev => [...prev, `Puck: ${displayReply}`]);
      speak(speechReply);
      setStatus('Ready');

    } catch (err) {
      console.error(err);
      setStatus('API Error');
      if ((err as Error).message.includes('404')) {
         setTranscription(prev => [...prev, `System: Gemini 3 Flash Preview not found. Try 'gemini-1.5-flash'.`]);
      } else {
         setTranscription(prev => [...prev, `System: ${(err as Error).message}`]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      window.speechSynthesis.cancel();
      recognitionRef.current.lang = language; 
      recognitionRef.current?.start();
      setIsListening(true);
      setStatus(language === 'ml-IN' ? 'ശ്രദ്ധിക്കുന്നു...' : 'Listening...');
    }
  };

  return (
    <div className="flex flex-col h-full p-6 md:p-10 bg-white">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        <header className="mb-8 flex justify-between items-start border-b border-slate-100 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white text-xs">
                <i className="fas fa-plus"></i>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Rajagiri Voice Assistant</h2>
            </div>
            <p className="text-slate-500 text-sm">Powered by Gemini 3 Flash</p>
          </div>
          
          <button 
            onClick={() => {
                const newLang = language === 'en-US' ? 'ml-IN' : 'en-US';
                setLanguage(newLang);
                chatSessionRef.current = null;
                setTranscription([]); 
            }}
            className="px-4 py-2 bg-slate-100 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors border border-slate-200"
          >
            <i className="fas fa-language mr-2"></i>
            {language === 'en-US' ? 'English' : 'മലയാളം'}
          </button>
        </header>

        <div className="flex-grow flex flex-col items-center justify-center mb-8">
          <div className={`relative w-60 h-60 rounded-full flex items-center justify-center transition-all duration-500 ${
            isListening ? 'bg-red-600 shadow-[0_0_60px_-10px_rgba(220,38,38,0.3)]' : 'bg-slate-50 border border-slate-200'
          }`}>
            <button
              onClick={toggleListening}
              disabled={isProcessing}
              className={`w-40 h-40 rounded-full flex flex-col items-center justify-center text-white transition-all transform active:scale-95 shadow-xl ${
                isListening ? 'bg-slate-900' : 'bg-red-700 hover:bg-red-800'
              }`}
            >
              {isProcessing ? (
                <i className="fas fa-spinner fa-spin text-3xl"></i>
              ) : (
                <>
                   <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'} text-3xl mb-3`}></i>
                   <span className="text-[10px] font-bold uppercase tracking-widest">
                     {isListening ? 'Stop' : (language === 'ml-IN' ? 'സംസാരിക്കൂ' : 'Talk')}
                   </span>
                </>
              )}
            </button>
          </div>
          <div className="mt-8">
            <div className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm border ${
              isListening ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}>
              {status}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-200 h-64 overflow-y-auto flex flex-col-reverse shadow-inner scrollbar-hide">
          <div className="space-y-4">
            {transcription.map((t, i) => (
              <div key={i} className={`flex ${t.startsWith('You:') ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl text-xs leading-relaxed max-w-[85%] shadow-sm ${
                  t.startsWith('You:') 
                    ? 'bg-red-700 text-white rounded-tr-none' 
                    : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                }`}>
                  {t.replace(/^(Puck:|You:)\s*/, '')}
                </div>
              </div>
            ))}
            {transcription.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                <i className="fas fa-wave-square text-2xl mb-2"></i>
                <p className="text-[10px] font-bold uppercase">Click talk to begin</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;



// // VoiceAssistant.tsx
// import React, { useState, useRef, useEffect } from 'react';
// import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

// const getDoctorAvailabilityFunctionDeclaration: FunctionDeclaration = {
//   name: 'get_doctor_availability',
//   parameters: {
//     type: Type.OBJECT,
//     description: 'Check if a specific doctor or department is available and proceed with booking information.',
//     properties: {
//       patientName: { type: Type.STRING, description: 'The name of the patient.' },
//       department: { type: Type.STRING, description: 'The medical department (e.g. Cardiology, Pediatrics).' },
//       doctorName: { type: Type.STRING, description: 'Specific doctor requested.' },
//       symptoms: { type: Type.STRING, description: 'Symptoms described by the user.' },
//     },
//     required: ['patientName', 'department', 'symptoms'],
//   },
// };

// const VoiceAssistant: React.FC = () => {
//   const [isListening, setIsListening] = useState(false);
//   const [status, setStatus] = useState<string>('Ready to help');
//   const [transcription, setTranscription] = useState<string[]>([]);
//   const [isProcessing, setIsProcessing] = useState(false);

//   const recognitionRef = useRef<any>(null);

//   useEffect(() => {
//     const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
//     if (SpeechRecognition) {
//       recognitionRef.current = new SpeechRecognition();
//       recognitionRef.current.continuous = false;
//       recognitionRef.current.interimResults = false;
//       recognitionRef.current.lang = 'en-US';

//       recognitionRef.current.onresult = (event: any) => {
//         const text = event.results[0][0].transcript;
//         handleStandardVoiceInput(text);
//       };

//       recognitionRef.current.onend = () => {
//         setIsListening(false);
//       };

//       recognitionRef.current.onerror = (event: any) => {
//         console.error('Speech recognition error', event.error);
//         setIsListening(false);
//         setStatus('Error listening');
//       };
//     }
//     // Pre-load voices
//     window.speechSynthesis.getVoices();
//   }, []);

//   const speak = (text: string) => {
//     const utterance = new SpeechSynthesisUtterance(text);
//     const voices = window.speechSynthesis.getVoices();
    
//     // Attempt to find a female voice
//     const femaleVoice = voices.find(v => 
//       v.lang.startsWith('en') && 
//       /female|woman|samantha|victoria|zira|google us english|google uk english female/i.test(v.name)
//     );

//     if (femaleVoice) {
//       utterance.voice = femaleVoice;
//     }

//     // SPEED AND PITCH SETTINGS
//     utterance.rate = 1.3; // Faster speed (1.0 is normal)
//     utterance.pitch = 1.05; // Slightly higher pitch for a clearer female tone
    
//     window.speechSynthesis.speak(utterance);
//   };

//   const handleStandardVoiceInput = async (text: string) => {
//     setTranscription(prev => [...prev, `You: ${text}`]);
//     setIsProcessing(true);
//     setStatus('Thinking...');

//     try {
//       /** 
//        * LOCAL API KEY CONFIGURATION:
//        * Replace process.env.API_KEY with "YOUR_KEY" for quick testing.
//        */
//       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
//       const response = await ai.models.generateContent({
//         model: 'gemini-3-flash-preview',
//         contents: text,
//         config: {
//           systemInstruction: `You are a helpful female hospital booking assistant named Puck for Rajagiri Hospital. 
//           1. Ask for patient name and symptoms.
//           2. Use 'get_doctor_availability' to check slots.
//           3. Respond concisely and warmly.
//           4. If symptoms sound life-threatening, tell them to call 0484 290 5100 or visit the ER immediately.`,
//           tools: [{ functionDeclarations: [getDoctorAvailabilityFunctionDeclaration] }],
//         }
//       });

//       let reply = response.text || "";
      
//       const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
//       if (call && call.functionCall?.name === 'get_doctor_availability') {
//         const args = call.functionCall.args as any;
//         reply = `I've checked the schedule. We have an opening in ${args.department || 'the requested department'} for ${args.patientName} tomorrow at 11 AM. Shall I book this for your ${args.symptoms}?`;
//       }

//       setTranscription(prev => [...prev, `Puck: ${reply}`]);
//       speak(reply);
//       setStatus('Ready');
//     } catch (err) {
//       console.error(err);
//       setStatus('Check API Key');
//     } finally {
//       setIsProcessing(false);
//     }
//   };

//   const toggleListening = () => {
//     if (isListening) {
//       recognitionRef.current?.stop();
//     } else {
//       window.speechSynthesis.cancel();
//       recognitionRef.current?.start();
//       setIsListening(true);
//       setStatus('Listening...');
//     }
//   };

//   return (
//     <div className="flex flex-col h-full p-6 md:p-10 bg-white">
//       <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
//         <header className="mb-8 flex justify-between items-start border-b border-slate-100 pb-6">
//           <div>
//             <div className="flex items-center gap-3 mb-1">
//               <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white text-xs">
//                 <i className="fas fa-plus"></i>
//               </div>
//               <h2 className="text-2xl font-bold text-slate-900">Rajagiri Voice Assistant</h2>
//             </div>
//             <p className="text-slate-500 text-sm">Quick doctor appointments via voice.</p>
//           </div>
//         </header>

//         <div className="flex-grow flex flex-col items-center justify-center mb-8">
//           <div className={`relative w-60 h-60 rounded-full flex items-center justify-center transition-all duration-500 ${
//             isListening ? 'bg-red-600 shadow-[0_0_60px_-10px_rgba(220,38,38,0.3)]' : 'bg-slate-50 border border-slate-200'
//           }`}>
//             <button
//               onClick={toggleListening}
//               disabled={isProcessing}
//               className={`w-40 h-40 rounded-full flex flex-col items-center justify-center text-white transition-all transform active:scale-95 shadow-xl ${
//                 isListening ? 'bg-slate-900' : 'bg-red-700 hover:bg-red-800'
//               }`}
//             >
//               {isProcessing ? (
//                 <i className="fas fa-spinner fa-spin text-3xl"></i>
//               ) : (
//                 <>
//                    <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'} text-3xl mb-3`}></i>
//                    <span className="text-[10px] font-bold uppercase tracking-widest">{isListening ? 'Stop' : 'Talk'}</span>
//                 </>
//               )}
//             </button>
//           </div>
//           <div className="mt-8">
//             <div className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm border ${
//               isListening ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-400 border-slate-200'
//             }`}>
//               {status}
//             </div>
//           </div>
//         </div>

//         <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-200 h-64 overflow-y-auto flex flex-col-reverse shadow-inner scrollbar-hide">
//           <div className="space-y-4">
//             {transcription.map((t, i) => (
//               <div key={i} className={`flex ${t.startsWith('You:') ? 'justify-end' : 'justify-start'}`}>
//                 <div className={`p-4 rounded-2xl text-xs leading-relaxed max-w-[85%] shadow-sm ${
//                   t.startsWith('You:') 
//                     ? 'bg-red-700 text-white rounded-tr-none' 
//                     : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
//                 }`}>
//                   {t.replace(/^(Puck:|You:)\s*/, '')}
//                 </div>
//               </div>
//             ))}
//             {transcription.length === 0 && (
//               <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
//                 <i className="fas fa-wave-square text-2xl mb-2"></i>
//                 <p className="text-[10px] font-bold uppercase">Click talk to begin</p>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default VoiceAssistant;