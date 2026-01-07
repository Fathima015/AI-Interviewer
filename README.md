#  AI Medical Assistant (Rajagiri Hospital Bot)

A full-stack AI-powered medical appointment booking system featuring both a **Text Chatbot** and a **Voice Assistant**. The system uses Google's Gemini AI to understand symptoms, check doctor availability dynamically, and book appointments with sentiment analysis.

## ✨ Features

### 🤖 Intelligent Chatbot
* **Symptom Verification:** Asks relevant questions to understand patient condition.
* **Doctor Availability:** Fetches real-time slots from a backend database (`doctors.json`).
* **Sentiment Analysis:** Analyzes user emotion (e.g., Anxious, Neutral, Negative) during the conversation.
* **Secure Booking:** Saves appointment details only after explicit confirmation.

### 🎙️ Voice Assistant
* **Hands-Free Booking:** Full voice-to-voice interaction using the Web Speech API.
* **Multi-Language Support:** Supports English and Malayalam (Manglish).
* **Dynamic Response:** Speaks back to the user using browser-native text-to-speech.
* **Real-time Transcription:** Displays the conversation log as it happens.

### ⚙️ Backend System
* **Conversation Logging:** Separately logs text and voice chat transcripts for review.
* **Appointment Management:** Saves confirmed bookings to `appointments.json`.
* **Dynamic Scheduling:** Admins can update `doctors.json` to instantly change available slots.

---

## 🛠️ Tech Stack

* **Frontend:** React, TypeScript, Tailwind CSS
* **Backend:** Node.js, Express.js
* **AI Model:** Google Gemini 3 pro preview
* **Database:** JSON-based local storage (NoSQL style)

---

## 🚀 Getting Started

### 1. Prerequisites
* Node.js installed (v16 or higher).
* A Google Gemini API Key.

### 2. Installation

**Clone the repository:**
```bash
git clone [https://github.com/YOUR_USERNAME/rajagiri-ai-bot.git](https://github.com/YOUR_USERNAME/rajagiri-ai-bot.git)
cd rajagiri-ai-bot

# Install Backend Dependencies:

Bash

cd backend
npm install

# Install Frontend Dependencies:

Bash

# Go back to root
cd ..
npm install
3. Configuration
Create a .env file in the root directory and add your API key:

Code snippet

VITE_GEMINI_API_KEY=your_google_gemini_api_key_here
🏃‍♂️ How to Run
You need to run the Backend and Frontend in two separate terminals.

Terminal 1: Start Backend

Bash

cd backend
node server.js
# Server will start on http://localhost:4000
Terminal 2: Start Frontend

Bash

npm run dev
# App will run on http://localhost:5173 (usually)
