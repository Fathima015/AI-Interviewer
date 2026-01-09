import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI, SchemaType, type Tool, type ChatSession } from '@google/generative-ai';

// --- TYPES ---
type InterviewerPersona = 'ALEX' | 'DIVYA';

// --- TOOLS ---
const submitInterviewTool: Tool = {
  functionDeclarations: [{
    name: 'submit_interview',
    description: 'Submit final score.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        candidateName: { type: SchemaType.STRING },
        score: { type: SchemaType.NUMBER },
        feedback: { type: SchemaType.STRING },
      },
      required: ['candidateName', 'score', 'feedback'],
    },
  }]
};

const VoiceAssistant: React.FC = () => {
  const [persona, setPersona] = useState<InterviewerPersona>('DIVYA'); 
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<string>('Ready');
  const [transcription, setTranscription] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveText, setLiveText] = useState<string>(""); 

  const chatSessionRef = useRef<ChatSession | null>(null);
  const recognitionRef = useRef<any>(null);
  const historyRef = useRef<string[]>([]);
  const finalBufferRef = useRef<string>("");
  const interimBufferRef = useRef<string>(""); 
  const messagesEndRef = useRef<HTMLDivElement>(null); 
  
  // *** CRITICAL: Generate Session ID once on load ***
  const sessionIdRef = useRef(Date.now().toString());

  // --- LOGGING ---
  const logToTerminal = async (role: string, message: string) => {
    try {
      await fetch('http://localhost:4000/log-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            sessionId: sessionIdRef.current, // Send the ID
            role, 
            message 
        })
      });
    } catch (e) { console.error(e); }
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [transcription, isProcessing, liveText]);

  useEffect(() => {
     chatSessionRef.current = null;
     setTranscription([]);
     historyRef.current = [];
     setStatus(persona === 'ALEX' ? 'Alex Ready' : 'Divya Ready');
  }, [persona]);

  const speak = async (text: string) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    setStatus('Speaking...');
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    if (persona === 'DIVYA') {
        const female = voices.find(v => v.name.includes('Female') || v.name.includes('Google US English'));
        if (female) utterance.voice = female;
    } else {
        const male = voices.find(v => v.name.includes('Male') || v.name.includes('David'));
        if (male) utterance.voice = male;
    }
    utterance.rate = 1.0;
    utterance.onend = () => setStatus('Waiting for answer...');
    window.speechSynthesis.speak(utterance);
  };

  const processResponse = async (text: string) => {
    const userMsg = `You: ${text}`;
    setTranscription(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setStatus('Thinking...');

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      
      const baseInstructions = `
          GOAL: Conduct a 3-question TECHNICAL interview for an **AI Engineer**.
          FORMAT: Plain text only. NO markdown.
          FLOW: Name -> Q1 -> Q2 -> Q3 -> Score.
      `;

      let systemPrompt = persona === 'DIVYA' 
        ? `SYSTEM: You are "Divya", supportive AI Researcher. ${baseInstructions}`
        : `SYSTEM: You are "Alex", strict MLOps Lead. ${baseInstructions}`;

      if (!chatSessionRef.current) {
         const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.0-flash-exp', 
            systemInstruction: systemPrompt,
            tools: [submitInterviewTool],
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
        if (call.name === 'submit_interview') {
           const cleanFeedback = args.feedback.replace(/\*\*/g, '');
           displayReply = `✅ Score: ${args.score}/10\n${cleanFeedback}`;
           speechReply = `Thank you. Score: ${args.score}. ${cleanFeedback}`;
           await fetch('http://localhost:4000/save-interview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(args)
           });
        }
      } else {
        const textResponse = response.text().replace(/```json|```|\*\*/g, '').trim();
        try {
            const parsed = JSON.parse(textResponse);
            displayReply = parsed.text;
            speechReply = parsed.speech;
        } catch (e) {
            displayReply = textResponse;
            speechReply = textResponse;
        }
      }

      const assistantName = persona === 'ALEX' ? 'Alex' : 'Divya';
      const botMsg = `${assistantName}: ${displayReply}`;
      
      await logToTerminal(assistantName, displayReply);
      setTranscription(prev => [...prev, botMsg]);
      await speak(speechReply);

    } catch (err) {
      console.error(err);
      setStatus('Error');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.abort();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true; 
      recognition.lang = 'en-IN'; 
      recognition.onresult = (e: any) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript;
          else interimChunk += e.results[i][0].transcript;
        }
        if (finalChunk) finalBufferRef.current += finalChunk + " ";
        interimBufferRef.current = interimChunk;
        setLiveText(finalBufferRef.current + interimBufferRef.current);
      };
      recognition.onerror = (e: any) => { if (e.error !== 'no-speech') setIsListening(false); };
      recognitionRef.current = recognition;
    }
  }, []);

  const handleStopAndSubmit = async () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    const fullText = (finalBufferRef.current + interimBufferRef.current).trim();
    if (fullText) {
        await logToTerminal("Candidate", fullText);
        await processResponse(fullText);
        finalBufferRef.current = ""; 
        interimBufferRef.current = ""; 
        setLiveText("");
    }
  };

  const toggleListening = () => {
    if (isListening) handleStopAndSubmit();
    else {
        window.speechSynthesis.cancel();
        finalBufferRef.current = ""; interimBufferRef.current = ""; setLiveText("");
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
             <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-xl ${persona === 'DIVYA' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                <i className="fas fa-brain"></i>
             </div>
             <h2 className="text-2xl font-bold text-slate-900">{persona === 'DIVYA' ? 'Divya (AI)' : 'Alex (MLOps)'}</h2>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
             <button onClick={() => setPersona('DIVYA')} className={`px-4 py-2 text-sm font-bold rounded-md ${persona === 'DIVYA' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Divya</button>
             <button onClick={() => setPersona('ALEX')} className={`px-4 py-2 text-sm font-bold rounded-md ${persona === 'ALEX' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>Alex</button>
          </div>
        </header>

        <div className="flex-grow flex flex-col items-center justify-center mb-8">
          <div className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? (persona === 'DIVYA' ? 'bg-indigo-100' : 'bg-slate-200') + ' scale-110' : 'bg-slate-50 border'}`}>
            <button onClick={toggleListening} disabled={isProcessing} className={`w-32 h-32 rounded-full text-white shadow-lg flex items-center justify-center ${isProcessing ? 'bg-slate-400' : isListening ? (persona === 'DIVYA' ? 'bg-indigo-600 animate-pulse' : 'bg-slate-800 animate-pulse') : 'bg-slate-800'}`}>
              <i className={`fas ${isProcessing ? 'fa-circle-notch fa-spin' : (isListening ? 'fa-paper-plane' : 'fa-microphone')} text-3xl`}></i>
            </button>
          </div>
          <div className="mt-8 text-center min-h-[60px]">
             <div className="px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest border bg-slate-50 text-slate-600 mb-2 inline-block">{status}</div>
             {isListening && (<p className="text-lg font-medium max-w-2xl mx-auto mt-2 text-indigo-700">"{liveText}"</p>)}
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-6 border h-80 overflow-y-auto shadow-inner flex flex-col">
          <div className="flex flex-col gap-2">
            {transcription.map((t, i) => {
               const isUser = t.startsWith('You:');
               return (
                <div key={i} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-4 py-3 text-sm whitespace-pre-wrap shadow-sm max-w-[80%] rounded-2xl ${isUser ? (persona === 'DIVYA' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-white rounded-tr-none') : 'bg-white border text-slate-700 rounded-tl-none'}`}>
                     <span className="block text-[10px] font-bold opacity-50 uppercase mb-1">{isUser ? 'Candidate' : (persona === 'DIVYA' ? 'Divya' : 'Alex')}</span>
                     {t.replace(/^(Alex:|Divya:|You:)\s*/, '')}
                  </div>
                </div>
            )})}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;