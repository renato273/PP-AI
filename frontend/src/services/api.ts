const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('No autenticado');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: any }>('/auth/me'),

  // Dashboard
  dashboardStats: () => request<any>('/dashboard/stats'),

  // Programas
  getProgramas: () => request<any[]>('/programas'),
  getPrograma: (id: number) => request<any>(`/programas/${id}`),
  createPrograma: (data: any) => request<any>('/programas', { method: 'POST', body: JSON.stringify(data) }),
  updatePrograma: (id: number, data: any) => request<any>(`/programas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePrograma: (id: number) => request<any>(`/programas/${id}`, { method: 'DELETE' }),
  getProyectosByPrograma: (programaId: number) => request<any[]>(`/programas/${programaId}/proyectos`),
  copyPrograma: (id: number) => request<any>(`/programas/${id}/copy`, { method: 'POST', body: JSON.stringify({}) }),

  // Proyectos
  getProyectos: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/proyectos${qs}`);
  },
  getProyecto: (id: number) => request<any>(`/proyectos/${id}`),
  createProyecto: (data: any) => request<any>('/proyectos', { method: 'POST', body: JSON.stringify(data) }),
  updateProyecto: (id: number, data: any) => request<any>(`/proyectos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProyecto: (id: number) => request<any>(`/proyectos/${id}`, { method: 'DELETE' }),
  copyProyecto: (id: number, nombre?: string) => request<any>(`/proyectos/${id}/copy`, { method: 'POST', body: JSON.stringify({ nombre }) }),

  // Tareas
  getTareasByProyecto: (proyectoId: number) => request<any[]>(`/tareas/proyecto/${proyectoId}`),
  getTarea: (id: number) => request<any>(`/tareas/${id}`),
  createTarea: (data: any) => request<any>('/tareas', { method: 'POST', body: JSON.stringify(data) }),
  updateTarea: (id: number, data: any) => request<any>(`/tareas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateTareaDates: (id: number, fecha_inicio: string, fecha_fin: string) =>
    request<any>(`/tareas/${id}/dates`, { method: 'PATCH', body: JSON.stringify({ fecha_inicio, fecha_fin }) }),
  deleteTarea: (id: number) => request<any>(`/tareas/${id}`, { method: 'DELETE' }),
  reorderTareas: (items: { id: number; orden: number }[]) =>
    request<void>('/tareas/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),

  // Sprints
  getSprintsByProyecto: (proyectoId: number) => request<any[]>(`/sprints/proyecto/${proyectoId}`),
  createSprint: (data: any) => request<any>('/sprints', { method: 'POST', body: JSON.stringify(data) }),
  updateSprint: (id: number, data: any) => request<any>(`/sprints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSprint: (id: number) => request<any>(`/sprints/${id}`, { method: 'DELETE' }),

  // Actividad
  getActividadByProyecto: (proyectoId: number) => request<any[]>(`/actividad/proyecto/${proyectoId}`),

  // Task progress
  updateTareaProgress: (id: number, porcentaje_avance: number) =>
    request<any>(`/tareas/${id}/progress`, { method: 'PATCH', body: JSON.stringify({ porcentaje_avance }) }),

  // Responsables
  getResponsables: () => request<any[]>('/responsables'),
  getResponsable: (id: number) => request<any>(`/responsables/${id}`),
  createResponsable: (data: any) => request<any>('/responsables', { method: 'POST', body: JSON.stringify(data) }),
  updateResponsable: (id: number, data: any) => request<any>(`/responsables/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResponsable: (id: number) => request<any>(`/responsables/${id}`, { method: 'DELETE' }),

  // Hitos
  getHitosByProyecto: (proyectoId: number) => request<any[]>(`/hitos/proyecto/${proyectoId}`),
  getHitosProximos: () => request<any[]>('/hitos/proximos'),
  createHito: (data: any) => request<any>('/hitos', { method: 'POST', body: JSON.stringify(data) }),
  updateHito: (id: number, data: any) => request<any>(`/hitos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateHitoDate: (id: number, fecha: string) => request<any>(`/hitos/${id}/date`, { method: 'PATCH', body: JSON.stringify({ fecha }) }),
  reorderHitos: (items: { id: number; orden?: number; gantt_orden?: number }[]) => request<void>('/hitos/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  deleteHito: (id: number) => request<any>(`/hitos/${id}`, { method: 'DELETE' }),

  // Dependencias
  getDependenciasByProyecto: (proyectoId: number) => request<any[]>(`/dependencias/proyecto/${proyectoId}`),
  createDependencia: (data: any) => request<any>('/dependencias', { method: 'POST', body: JSON.stringify(data) }),
  deleteDependencia: (id: number) => request<any>(`/dependencias/${id}`, { method: 'DELETE' }),

  // Usuarios
  getUsuarios: () => request<any[]>('/usuarios'),
  getUsuario: (id: number) => request<any>(`/usuarios/${id}`),
  createUsuario: (data: any) => request<any>('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
  updateUsuario: (id: number, data: any) => request<any>(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUsuario: (id: number) => request<any>(`/usuarios/${id}`, { method: 'DELETE' }),

  // Comentarios
  getComentariosByTarea: (tareaId: number) => request<any[]>(`/comentarios/tarea/${tareaId}`),
  getArchivosByTarea: (tareaId: number) => request<any[]>(`/comentarios/archivos/tarea/${tareaId}`),
  createComentario: (data: { tarea_id: number; contenido: string; menciones?: number[] }) =>
    request<any>('/comentarios', { method: 'POST', body: JSON.stringify(data) }),
  updateComentario: (id: number, contenido: string) =>
    request<any>(`/comentarios/${id}`, { method: 'PUT', body: JSON.stringify({ contenido }) }),
  deleteComentario: (id: number) => request<any>(`/comentarios/${id}`, { method: 'DELETE' }),
  uploadArchivo: async (tareaId: number, file: File, comentarioId?: number) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tarea_id', tareaId.toString());
    if (comentarioId) formData.append('comentario_id', comentarioId.toString());
    const res = await fetch(`${API_BASE}/comentarios/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }
    return res.json();
  },
  deleteArchivo: (id: number) => request<any>(`/comentarios/archivo/${id}`, { method: 'DELETE' }),

  // AI
  getAiConfig: () => request<any>('/ai/config'),
  updateAiConfig: (data: any) => request<any>('/ai/config', { method: 'PUT', body: JSON.stringify(data) }),
  testAiConnection: () => request<any>('/ai/test', { method: 'POST', body: JSON.stringify({}) }),
  generatePlan: async (data: { prompt: string; proyecto_id?: number; contexto_proyecto?: string; files?: File[] }) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('prompt', data.prompt);
    if (data.proyecto_id) formData.append('proyecto_id', data.proyecto_id.toString());
    if (data.contexto_proyecto) formData.append('contexto_proyecto', data.contexto_proyecto);
    if (data.files) {
      data.files.forEach(f => formData.append('files', f));
    }
    const res = await fetch(`${API_BASE}/ai/generate-plan`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (res.status === 401) {
      localStorage.removeItem('token'); localStorage.removeItem('user');
      window.location.href = '/login'; throw new Error('No autenticado');
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Error ${res.status}`);
    }
    return res.json();
  },
  applyPlan: (data: { proyecto_id: number; tareas: any[]; sprint?: any }) =>
    request<any>('/ai/apply-plan', { method: 'POST', body: JSON.stringify(data) }),

  chatWithAI: async (data: { proyecto_id: number; messages: { role: string; content: string }[]; files?: File[] }) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('proyecto_id', data.proyecto_id.toString());
    formData.append('messages', JSON.stringify(data.messages));
    if (data.files) data.files.forEach(f => formData.append('files', f));
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (res.status === 401) {
      localStorage.removeItem('token'); localStorage.removeItem('user');
      window.location.href = '/login'; throw new Error('No autenticado');
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Error ${res.status}`);
    }
    return res.json() as Promise<{ mensaje: string; acciones_ejecutadas: { tipo: string; descripcion: string; exito: boolean }[] }>;
  },

  // Auth providers (public — no auth required)
  getAuthProviders: () => request<{ google: boolean; keycloak: boolean }>('/auth/providers'),

  // Admin settings
  getAdminSettings: () => request<any>('/admin/settings'),
  updateAdminSettings: (data: any) =>
    request<any>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
};
