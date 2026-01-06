import express from 'express';
import fs from 'fs';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const CSV_FILE = './appointments.csv';

// Create CSV header once
if (!fs.existsSync(CSV_FILE)) {
  fs.writeFileSync(
    CSV_FILE,
    'timestamp,patientName,department,doctorName,symptoms,sentiment,confidence\n'
  );
}

app.post('/log-appointment', (req, res) => {
  const {
    patientName,
    department,
    doctorName,
    symptoms,
    sentiment,
    confidence
  } = req.body;

  const row = `"${new Date().toISOString()}","${patientName}","${department}","${doctorName}","${symptoms}","${sentiment}",${confidence}\n`;

  fs.appendFileSync(CSV_FILE, row);
  res.json({ success: true });
});

app.listen(4000, () => {
  console.log('Backend running on http://localhost:4000');
});
