import React, { useState, useRef, useEffect } from 'react';
// We use the standard Web SDK class here
import { GoogleGenerativeAI, ChatSession } from '@google/generative-ai';

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
      text: "Hello! I'm Puck, your medical assistant. I can help verify symptoms and check doctor availability. How are you feeling?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // REF: Store the chat session here so it remembers context!
  const chatSessionRef = useRef<ChatSession | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  // Initialize Chat Session ONCE when component mounts
  useEffect(() => {
    const initChat = async () => {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3-flash-preview", // Switch to 1.5 Pro for better medical reasoning
        systemInstruction: 'You are Puck, a helpful AI medical assistant for Rajagiri Hospital. Be empathetic, professional, and concise. Always advise seeing a real doctor for serious symptoms.',
      });

      chatSessionRef.current = model.startChat({
        history: [], // Start with empty history
      });
    };

    initChat();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    // 1. Add User Message to UI
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      // 2. Check if chat is ready
      if (!chatSessionRef.current) {
        throw new Error("Chat session not initialized");
      }

      // 3. Create placeholder for Assistant Response
      const assistantId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        text: '', // Start empty
        timestamp: new Date()
      }]);

      // 4. Send Message & Stream Response
      const result = await chatSessionRef.current.sendMessageStream(input);
      
      let fullResponseText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text(); // Note: .text() is a function in this SDK
        fullResponseText += chunkText;
        
        // Update UI with new chunk
        setMessages(prev => prev.map(msg => 
          msg.id === assistantId ? { ...msg, text: fullResponseText } : msg
        ));
      }
      
    } catch (err) {
      console.error("Chat Error:", err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        text: "I'm having trouble connecting to the hospital network. Please try again.",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
          <i className="fa-solid fa-user-doctor"></i> Dr. Puck
        </h2>
        <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
          Online
        </span>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${
              msg.role === 'user' 
                ? 'bg-red-700 text-white rounded-tr-none' 
                : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-slate-100 text-slate-500 p-3 rounded-2xl rounded-tl-none text-xs">
              Puck is typing...
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <div className="relative flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Describe your symptoms..."
            className="w-full p-3 pr-12 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-700 focus:border-transparent outline-none transition-all shadow-sm"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-2 p-2 text-red-700 hover:text-red-900 disabled:text-slate-400 transition-colors"
          >
            <i className="fas fa-paper-plane text-lg"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;