import express from 'express';
import routes from './routes/index.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
