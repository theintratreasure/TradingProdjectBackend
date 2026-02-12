import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();
// updated
app.disable('x-powered-by');

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost",
        "capacitor://localhost",
        "https://trade-portal-uiub.vercel.app",
        "https://admin-dashboard-wheat-pi-59.vercel.app",
        "https://alstrades.com",
        "https://www.alstrades.com",
        "https://admin.alstrades.com",
        "https://user.alstrades.com"
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Pragma"
    ],
    credentials: true
  })
);

app.options("*", cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
