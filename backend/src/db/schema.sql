-- Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK(rol IN ('admin','editor','viewer')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Responsables
CREATE TABLE IF NOT EXISTS responsables (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  rol VARCHAR(100),
  avatar_url TEXT,
  color VARCHAR(10) NOT NULL DEFAULT '#2563eb',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Programas
CREATE TABLE IF NOT EXISTS programas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','inactivo','completado')),
  fecha_inicio DATE,
  fecha_fin DATE,
  presupuesto NUMERIC(15,2),
  color VARCHAR(10) NOT NULL DEFAULT '#2563eb',
  responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Proyectos
CREATE TABLE IF NOT EXISTS proyectos (
  id SERIAL PRIMARY KEY,
  programa_id INTEGER REFERENCES programas(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'planificacion' CHECK(estado IN ('planificacion','en_progreso','en_pausa','completado','cancelado')),
  prioridad VARCHAR(10) NOT NULL DEFAULT 'media' CHECK(prioridad IN ('baja','media','alta','critica')),
  fecha_inicio DATE,
  fecha_fin DATE,
  porcentaje_avance INTEGER NOT NULL DEFAULT 0 CHECK(porcentaje_avance >= 0 AND porcentaje_avance <= 100),
  responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tareas
CREATE TABLE IF NOT EXISTS tareas (
  id SERIAL PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','en_progreso','completada','bloqueada')),
  fecha_inicio DATE,
  fecha_fin DATE,
  duracion_dias INTEGER,
  responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
  tarea_padre_id INTEGER REFERENCES tareas(id) ON DELETE SET NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Dependencias
CREATE TABLE IF NOT EXISTS dependencias (
  id SERIAL PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  tarea_dependiente_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL DEFAULT 'fin_a_inicio' CHECK(tipo IN ('fin_a_inicio','inicio_a_inicio','fin_a_fin'))
);

-- Hitos
CREATE TABLE IF NOT EXISTS hitos (
  id SERIAL PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  fecha DATE NOT NULL,
  completado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Comentarios de tareas (Muro de Actualizaciones)
CREATE TABLE IF NOT EXISTS tarea_comentarios (
  id SERIAL PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Archivos adjuntos
CREATE TABLE IF NOT EXISTS tarea_archivos (
  id SERIAL PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  comentario_id INTEGER REFERENCES tarea_comentarios(id) ON DELETE SET NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_original VARCHAR(500) NOT NULL,
  nombre_archivo VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  tamano INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Menciones en comentarios
CREATE TABLE IF NOT EXISTS tarea_menciones (
  id SERIAL PRIMARY KEY,
  comentario_id INTEGER NOT NULL REFERENCES tarea_comentarios(id) ON DELETE CASCADE,
  responsable_id INTEGER NOT NULL REFERENCES responsables(id) ON DELETE CASCADE
);

-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
  id SERIAL PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'planificacion' CHECK(estado IN ('planificacion','activo','completado','cancelado')),
  fecha_inicio DATE,
  fecha_fin DATE,
  objetivo TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add prioridad to tareas (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='prioridad') THEN
    ALTER TABLE tareas ADD COLUMN prioridad VARCHAR(10) DEFAULT 'media' CHECK(prioridad IN ('baja','media','alta','critica'));
  END IF;
END $$;

-- Add sprint_id to tareas (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='sprint_id') THEN
    ALTER TABLE tareas ADD COLUMN sprint_id INTEGER REFERENCES sprints(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add porcentaje_avance to tareas (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='porcentaje_avance') THEN
    ALTER TABLE tareas ADD COLUMN porcentaje_avance INTEGER NOT NULL DEFAULT 0 CHECK(porcentaje_avance >= 0 AND porcentaje_avance <= 100);
  END IF;
END $$;

-- Add story_points to tareas (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='story_points') THEN
    ALTER TABLE tareas ADD COLUMN story_points INTEGER;
  END IF;
END $$;

-- Add peso to tareas (idempotent) — weight for weighted progress calculation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='peso') THEN
    ALTER TABLE tareas ADD COLUMN peso INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Add dias_laborables to proyectos (idempotent) — comma-separated day numbers 1=Mon..7=Sun
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proyectos' AND column_name='dias_laborables') THEN
    ALTER TABLE proyectos ADD COLUMN dias_laborables VARCHAR(20) DEFAULT '1,2,3,4,5';
  END IF;
END $$;

-- Activity log table
CREATE TABLE IF NOT EXISTS proyecto_actividad (
  id SERIAL PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nombre VARCHAR(255) NOT NULL DEFAULT 'Sistema',
  tipo VARCHAR(50) NOT NULL,
  descripcion TEXT NOT NULL,
  entidad_tipo VARCHAR(50),
  entidad_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Configuración de IA
CREATE TABLE IF NOT EXISTS ai_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL DEFAULT 'azure_openai',
  azure_endpoint VARCHAR(500),
  azure_api_key VARCHAR(500),
  azure_deployment VARCHAR(255),
  azure_api_version VARCHAR(50) DEFAULT '2024-02-01',
  max_tokens INTEGER DEFAULT 4000,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add Groq fields to ai_config (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_config' AND column_name='groq_api_key') THEN
    ALTER TABLE ai_config ADD COLUMN groq_api_key VARCHAR(500);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_config' AND column_name='groq_model') THEN
    ALTER TABLE ai_config ADD COLUMN groq_model VARCHAR(255) DEFAULT 'llama-3.3-70b-versatile';
  END IF;
END $$;

-- Add google_id to usuarios (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='google_id') THEN
    ALTER TABLE usuarios ADD COLUMN google_id VARCHAR(255);
  END IF;
END $$;

-- Make password_hash nullable for Google-only accounts (idempotent)
ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;

-- Add orden to hitos for list drag-reorder (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hitos' AND column_name='orden') THEN
    ALTER TABLE hitos ADD COLUMN orden INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add gantt_orden to hitos for interleaved gantt positioning (idempotent)
-- Value is in the same space as root tasks' (orden * 1000). Milestones default to 999999 (bottom).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hitos' AND column_name='gantt_orden') THEN
    ALTER TABLE hitos ADD COLUMN gantt_orden FLOAT;
    UPDATE hitos SET gantt_orden = 999000 + orden * 100;
  END IF;
END $$;

-- Panel de configuración de la aplicación (fila única, JSON)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_proyectos_programa ON proyectos(programa_id);
CREATE INDEX IF NOT EXISTS idx_tareas_proyecto ON tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tareas_padre ON tareas(tarea_padre_id);
CREATE INDEX IF NOT EXISTS idx_dependencias_tarea ON dependencias(tarea_id);
CREATE INDEX IF NOT EXISTS idx_hitos_proyecto ON hitos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tarea_comentarios_tarea ON tarea_comentarios(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_archivos_tarea ON tarea_archivos(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_menciones_comentario ON tarea_menciones(comentario_id);
CREATE INDEX IF NOT EXISTS idx_sprints_proyecto ON sprints(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tareas_sprint ON tareas(sprint_id);
CREATE INDEX IF NOT EXISTS idx_actividad_proyecto ON proyecto_actividad(proyecto_id);
