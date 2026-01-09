import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

const LOG_FILE = path.join(__dirname, 'chat_history.json');
const INTERVIEW_FILE = path.join(__dirname, 'interviews.json');

// Ensure files exist
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([]));
if (!fs.existsSync(INTERVIEW_FILE)) fs.writeFileSync(INTERVIEW_FILE, JSON.stringify([]));

// --- ROUTES ---

// 1. LOG CHAT (Grouped by Session)
app.post('/log-chat', (req, res) => {
    const { sessionId, role, message } = req.body;

    // A. Terminal Logging (Visuals)
    if (role === 'Candidate') console.log(`\x1b[36m Candidate:\x1b[0m ${message}`);
    else if (role === 'Divya') console.log(`\x1b[35m Divya:\x1b[0m     ${message}`);
    else if (role === 'Alex') console.log(`\x1b[33m Alex:\x1b[0m      ${message}`);

    // B. JSON File Saving (The Structure You Want)
    try {
        const fileContent = fs.readFileSync(LOG_FILE, 'utf-8');
        let sessions = JSON.parse(fileContent || '[]');

        // 1. Find if this Session ID already exists
        const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);

        const newMessage = { role: role, message: message };

        if (sessionIndex !== -1) {
            // CASE 1: Session exists -> Add message to "conversation" array
            sessions[sessionIndex].conversation.push(newMessage);
        } else {
            // CASE 2: New Session -> Create new block
            const newSession = {
                sessionId: sessionId,
                timestamp: new Date().toISOString(), // Use "timestamp" for the session start
                conversation: [newMessage]
            };
            sessions.push(newSession);
        }

        fs.writeFileSync(LOG_FILE, JSON.stringify(sessions, null, 2));
    } catch (e) {
        console.error("Error saving log:", e);
    }

    res.sendStatus(200);
});

// 2. Save Final Interview Result
app.post('/save-interview', (req, res) => {
    try {
        const { candidateName, score, feedback } = req.body;
        console.log(`\n\x1b[32m[SAVING RESULT]\x1b[0m ${candidateName} - Score: ${score}/10`);

        const currentData = JSON.parse(fs.readFileSync(INTERVIEW_FILE, 'utf-8') || '[]');
        currentData.push({ id: Date.now(), candidateName, score, feedback });
        fs.writeFileSync(INTERVIEW_FILE, JSON.stringify(currentData, null, 2));

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("--------------------------------------------------");
});