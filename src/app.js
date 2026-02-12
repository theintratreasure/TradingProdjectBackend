import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();
// updated
app.disable('x-powered-by');

app.use(
  cors({
origin: [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://trade-portal-uiub.vercel.app",
  "https://admin-dashboard-wheat-pi-59.vercel.app",
  "http://localhost:5173",
  "https://alstrades.com",
  "https://admin.alstrades.com",
  "https://user.alstrades.com",
],

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Frontend preflight may include Cache-Control/Pragma; allow them explicitly to avoid CORS failures.
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
    credentials: true
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
