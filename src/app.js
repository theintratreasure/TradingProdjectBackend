import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();

app.disable('x-powered-by');

/**
 * CORS CONFIG
 * Frontend domain ko allow karo
 * credentials true rakha for future auth (cookies / headers)
 */
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// Preflight support
app.options('*', cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
