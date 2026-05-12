import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/database.js';
import authRoutes from './routes/auth.js';
import programasRoutes from './routes/programas.js';
import proyectosRoutes from './routes/proyectos.js';
import tareasRoutes from './routes/tareas.js';
import responsablesRoutes from './routes/responsables.js';
import hitosRoutes from './routes/hitos.js';
import dependenciasRoutes from './routes/dependencias.js';
import dashboardRoutes from './routes/dashboard.js';
import usuariosRoutes from './routes/usuarios.js';
import comentariosRoutes from './routes/comentarios.js';
import sprintsRoutes from './routes/sprints.js';
import aiRoutes from './routes/ai.js';
import actividadRoutes from './routes/actividad.js';
import adminRoutes from './routes/admin.js';
import { startReminderJobs } from './jobs/reminders.js';
import { join } from 'path';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/programas', programasRoutes);
app.use('/api/proyectos', proyectosRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/responsables', responsablesRoutes);
app.use('/api/hitos', hitosRoutes);
app.use('/api/dependencias', dependenciasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api/sprints', sprintsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/actividad', actividadRoutes);
app.use('/api/admin', adminRoutes);

// Static file serving for uploads
app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server after DB init
async function start() {
  try {
    await initializeDatabase();

    if (process.env.ENABLE_EMAIL === 'true') {
      startReminderJobs();
    }

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default app;
