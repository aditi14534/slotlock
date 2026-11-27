import 'dotenv/config';
import express from 'express';
import Redis from 'ioredis';
import { Pool } from 'pg';
import authRoutes from './routes/auth.routes';
import availabilityRoutes from './routes/availability.routes';
import publicRoutes from './routes/public.routes';
import serviceRoutes from './routes/service.routes';
import staffRoutes from './routes/staff.routes';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/staff', staffRoutes);

// 1. Redis connection (Port 6379)
const redis = new Redis({ host: 'localhost', port: 6379 });

// 2. PostgreSQL connection (Port 5432)
const pgPool = new Pool({
  connectionString: 'postgresql://slotlock_admin:slotlock_password@localhost:5432/slotlock_db',
});

app.get('/health', async (_req, res) => {
  try {
    const pgResult = await pgPool.query('SELECT NOW()');
    const redisPing = await redis.ping();

    res.json({
      status: 'OK',
      postgresTime: pgResult.rows[0].now,
      redis: redisPing, // Should return "PONG"
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error });
  }
});

app.listen(5000, () => {
  console.log('SlotLock Server running on http://localhost:5000');
});