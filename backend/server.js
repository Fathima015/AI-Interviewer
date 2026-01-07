import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const DB_FILE = path.join(__dirname, 'appointments.json');
const CONVO_FILE = path.join(__dirname, 'conversations.json');     // Text Chat Logs
const VOICE_CONVO_FILE = path.join(__dirname, 'voice_conversations.json'); // <--- NEW: Voice Logs
const DOCTORS_FILE = path.join(__dirname, 'doctors.json');

// Ensure files exist
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
if (!fs.existsSync(CONVO_FILE)) fs.writeFileSync(CONVO_FILE, JSON.stringify([]));
if (!fs.existsSync(VOICE_CONVO_FILE)) fs.writeFileSync(VOICE_CONVO_FILE, JSON.stringify([])); // <--- NEW
if (!fs.existsSync(DOCTORS_FILE)) {
    const defaults = {
        slots: [
            { doctor: "Dr. Smith", department: "General Medicine", date: "2026-01-08", time: "10:00 AM" },
            { doctor: "Dr. Jones", department: "General Medicine", date: "2026-01-08", time: "2:00 PM" }
        ]
    };
    fs.writeFileSync(DOCTORS_FILE, JSON.stringify(defaults, null, 2));
}

// Route: Get Available Doctors
app.get('/doctors', (req, res) => {
    try {
        const fileContent = fs.readFileSync(DOCTORS_FILE, 'utf-8');
        const data = JSON.parse(fileContent);
        res.status(200).json(data);
    } catch (error) {
        console.error("Error fetching doctors:", error);
        res.status(500).json({ error: "Failed to fetch doctors" });
    }
});

// Route: Log Appointment
app.post('/log-appointment', (req, res) => {
    try {
        const newEntry = { id: Date.now(), timestamp: new Date().toISOString(), ...req.body };
        const currentData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8') || '[]');
        currentData.push(newEntry);
        fs.writeFileSync(DB_FILE, JSON.stringify(currentData, null, 2));
        console.log(`[SAVED] Appointment for ${newEntry.patientName}`);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// Route: Log Text Conversation
app.post('/log-conversation', (req, res) => {
    try {
        const { sessionId, messages, type } = req.body;
        const fileContent = fs.readFileSync(CONVO_FILE, 'utf-8');
        let currentData = JSON.parse(fileContent || '[]');

        const existingIndex = currentData.findIndex(entry => entry.sessionId === sessionId);

        if (existingIndex !== -1) {
            currentData[existingIndex].transcript = messages;
            currentData[existingIndex].lastUpdated = new Date().toISOString();
        } else {
            const newEntry = {
                sessionId: sessionId,
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                type: type || 'chat',
                transcript: messages
            };
            currentData.push(newEntry);
        }

        fs.writeFileSync(CONVO_FILE, JSON.stringify(currentData, null, 2));
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- NEW ROUTE: Log Voice Conversation ---
app.post('/log-voice-conversation', (req, res) => {
    try {
        const { sessionId, messages } = req.body;
        const fileContent = fs.readFileSync(VOICE_CONVO_FILE, 'utf-8');
        let currentData = JSON.parse(fileContent || '[]');

        const existingIndex = currentData.findIndex(entry => entry.sessionId === sessionId);

        if (existingIndex !== -1) {
            // Update existing session
            currentData[existingIndex].transcript = messages;
            currentData[existingIndex].lastUpdated = new Date().toISOString();
        } else {
            // Create new session
            const newEntry = {
                sessionId: sessionId,
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                type: 'voice',
                transcript: messages
            };
            currentData.push(newEntry);
        }

        fs.writeFileSync(VOICE_CONVO_FILE, JSON.stringify(currentData, null, 2));
        console.log(`[SAVED] Voice Log ${sessionId}`);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error saving voice log:", error);
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});