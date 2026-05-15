import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Gantt, Task, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import type { Tarea, Dependencia, Hito } from '../../types';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { calcularProgresoEfectivo } from '../../utils/progreso';
import { GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useLangStore } from '../../store/langStore';
import { useT, formatDateI18n } from '../../i18n';

interface GanttViewProps {
  tareas: Tarea[];
  dependencias: Dependencia[];
  hitos: Hito[];
  onUpdate: () => void;
  onReorder?: (items: { id: number; orden: number }[]) => void;
  onReorderHitos?: (items: { id: number; orden?: number; gantt_orden?: number }[]) => void;
  onEditTarea?: (tarea: Tarea) => void;
  readOnly?: boolean;
}

const colorByEstado: Record<string, string> = {
  pendiente: '#9ca3af',
  en_progreso: '#2563eb',
  completada: '#16a34a',
  bloqueada: '#dc2626',
};

export default function GanttView({ tareas, dependencias, hitos, onUpdate, onReorder, onReorderHitos, onEditTarea, readOnly = false }: GanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [showDeps, setShowDeps] = useState(true);
  const [colWidths, setColWidths] = useState({ name: 200, from: 130, to: 130 });
  // Collapse state owned here so it survives re-renders without being reset
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  // Optimistic date overrides for milestones — prevents snap-back while API call is in flight
  const [pendingHitoDates, setPendingHitoDates] = useState<Record<number, string>>({});

  const { darkMode } = useUIStore();
  const { lang } = useLangStore();
  const t = useT();

  // Stable refs — avoid stale closures in useCallback / event handlers
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;
  const langRef = useRef(lang);
  langRef.current = lang;
  const collapsedIdsRef = useRef(collapsedIds);
  collapsedIdsRef.current = collapsedIds;
  // readOnly and onUpdate refs so handleDateChange can be a stable useCallback
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Ref updated by TaskListTable every render with the visible (non-milestone) task IDs
  // in their actual rendered order — used by handleGanttDragEnd to map index → task ID
  const visibleTaskOrderRef = useRef<string[]>([]);

  const resizingRef = useRef<{ col: 'name' | 'from' | 'to'; startX: number; startWidth: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── Expand / Collapse ───────────────────────────────────────────────────────
  const handleExpanderClick = useCallback((task: Task) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(task.id) ? next.delete(task.id) : next.add(task.id);
      return next;
    });
  }, []);

  // ── Column resize ──────────────────────────────────────────────────────────
  const handleResizeStart = useCallback((col: 'name' | 'from' | 'to', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { col, startX: e.clientX, startWidth: colWidthsRef.current[col] };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!resizingRef.current) return;
        const delta = ev.clientX - resizingRef.current.startX;
        const newWidth = Math.max(60, resizingRef.current.startWidth + delta);
        setColWidths(prev => ({ ...prev, [resizingRef.current!.col]: newWidth }));
      });
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // ── Ordered Tarea list ────────────────────────────────────────────────────
  const orderedTareas = useMemo(() => {
    const roots = tareas.filter(t => !t.tarea_padre_id).sort((a, b) => a.orden - b.orden);
    const getChildren = (parentId: number): Tarea[] =>
      tareas.filter(t => t.tarea_padre_id === parentId).sort((a, b) => a.orden - b.orden);
    const result: { tarea: Tarea; level: number }[] = [];
    const walk = (items: Tarea[], level: number) => {
      for (const t of items) { result.push({ tarea: t, level }); walk(getChildren(t.id), level + 1); }
    };
    walk(roots, 0);
    return result;
  }, [tareas]);

  // ── Build Gantt tasks — interleaved tasks + milestones sorted by combined key ──
  // Sort key space: root tasks at (orden * 1000), their children at (root_orden * 1000 + N),
  // milestones at hito.gantt_orden (defaults to 999999 = bottom). This allows milestones
  // to be dragged to any row position by storing a new gantt_orden midpoint.
  const ganttTasks: Task[] = useMemo(() => {
    const parentDateRange = (parentId: number) => {
      const children = tareas.filter(t => t.tarea_padre_id === parentId);
      let minStart: Date | null = null, maxEnd: Date | null = null;
      for (const c of children) {
        if (c.fecha_inicio) { const s = new Date(c.fecha_inicio + 'T00:00:00'); if (!isNaN(s.getTime()) && (!minStart || s < minStart)) minStart = s; }
        if (c.fecha_fin)    { const e = new Date(c.fecha_fin + 'T23:59:59');    if (!isNaN(e.getTime()) && (!maxEnd || e > maxEnd)) maxEnd = e; }
      }
      return minStart && maxEnd ? { start: minStart, end: maxEnd } : null;
    };

    // Assign sort keys: root tasks at orden*1000, children at root_orden*1000 + subIdx
    type OrderedItem =
      | { type: 'task'; tarea: Tarea; level: number; sortKey: number }
      | { type: 'milestone'; hito: Hito; sortKey: number };

    const items: OrderedItem[] = [];
    let currentRootOrden = 0;
    let subIdx = 0;
    for (const { tarea, level } of orderedTareas) {
      if (level === 0) { currentRootOrden = tarea.orden; subIdx = 0; }
      else { subIdx++; }
      items.push({ type: 'task', tarea, level, sortKey: currentRootOrden * 1000 + (level === 0 ? 0 : subIdx) });
    }
    for (const h of hitos) {
      items.push({ type: 'milestone', hito: h, sortKey: h.gantt_orden ?? 999999 });
    }
    items.sort((a, b) => a.sortKey - b.sortKey);

    const tasks: Task[] = [];
    for (const item of items) {
      if (item.type === 'task') {
        const { tarea: t, level } = item;
        const isParent = tareas.some(sub => sub.tarea_padre_id === t.id);
        const isChild = !!t.tarea_padre_id;
        let start: Date, end: Date;
        if (t.fecha_inicio && t.fecha_fin) {
          start = new Date(t.fecha_inicio + 'T00:00:00');
          end   = new Date(t.fecha_fin   + 'T23:59:59');
        } else if (isParent) {
          const range = parentDateRange(t.id);
          if (!range) continue;
          start = range.start; end = range.end;
        } else continue;
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

        const deps = showDeps
          ? dependencias.filter(d => d.tarea_id === t.id)
              .map(d => `task-${d.tarea_dependiente_id}`)
              .filter(id => orderedTareas.some(ot => `task-${ot.tarea.id}` === id))
          : [];

        const taskId = `task-${t.id}`;
        const barColor = isParent ? '#1e3a5f' : (t.responsable_color || colorByEstado[t.estado] || '#2563eb');
        const indent = level > 0 ? '  '.repeat(level) + '↳ ' : '';

        tasks.push({
          id: taskId,
          name: `${indent}${t.nombre}`,
          start, end,
          progress: calcularProgresoEfectivo(t.id, tareas),
          type: isParent ? 'project' : 'task',
          project: isChild ? `task-${t.tarea_padre_id}` : undefined,
          dependencies: deps,
          isDisabled: readOnly,
          hideChildren: collapsedIds.has(taskId),
          styles: {
            backgroundColor: barColor,
            backgroundSelectedColor: barColor,
            progressColor: '#16a34a',
            progressSelectedColor: '#15803d',
          },
        });
      } else {
        const { hito: h } = item;
        const dateStr = pendingHitoDates[h.id] ?? h.fecha;
        const date = new Date(dateStr + 'T00:00:00');
        if (isNaN(date.getTime())) continue;
        tasks.push({
          id: `milestone-${h.id}`,
          name: `◆ ${h.nombre}`,
          start: date, end: date,
          progress: h.completado ? 100 : 0,
          type: 'milestone',
          isDisabled: readOnly,
          styles: {
            backgroundColor: h.completado ? '#16a34a' : '#eab308',
            backgroundSelectedColor: h.completado ? '#15803d' : '#ca8a04',
          },
        });
      }
    }
    return tasks;
  }, [orderedTareas, tareas, dependencias, hitos, readOnly, showDeps, collapsedIds, pendingHitoDates]);

  // Clear optimistic overrides once fresh hitos arrive from the server
  useEffect(() => { setPendingHitoDates({}); }, [hitos]);

  // ── Drag end — uses visibleTaskOrderRef (set by TaskListTable each render) ─
  const handleGanttDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;

    const order = visibleTaskOrderRef.current;
    const srcRawId = order[result.source.index];
    if (!srcRawId) return;

    // ── Milestone → any row: compute new gantt_orden as midpoint of neighbors ──
    if (srcRawId.startsWith('milestone-') && onReorderHitos) {
      const srcId = parseInt(srcRawId.replace('milestone-', ''));
      const destIdx = result.destination.index;

      // List after the milestone is removed from source
      const without = order.filter((_, i) => i !== result.source.index);
      const prevId  = without[destIdx - 1] as string | undefined;
      const nextId  = without[destIdx]     as string | undefined;

      // Sort key for any item id — same scale as ganttTasks build
      const keyOf = (id: string | undefined): number => {
        if (!id) return undefined as any;
        if (id.startsWith('task-')) {
          let t = tareas.find(x => x.id === parseInt(id.replace('task-', '')));
          if (!t) return 0;
          while (t.tarea_padre_id) {
            const p = tareas.find(x => x.id === t!.tarea_padre_id);
            if (!p) break;
            t = p;
          }
          return t.orden * 1000;
        }
        if (id.startsWith('milestone-')) {
          const h = hitos.find(x => x.id === parseInt(id.replace('milestone-', '')));
          return h?.gantt_orden ?? 999999;
        }
        return 0;
      };

      const prevKey = prevId !== undefined ? keyOf(prevId) : -1000;
      const nextKey = nextId !== undefined ? keyOf(nextId) : 1000000;
      const newGanttOrden = (prevKey + nextKey) / 2;
      onReorderHitos([{ id: srcId, gantt_orden: newGanttOrden }]);
      return;
    }

    // ── Task reorder (same parent only) ───────────────────────────────────
    if (!onReorder) return;
    const dstRawId = order[result.destination.index];
    if (!dstRawId || dstRawId.startsWith('milestone-')) return; // can't drop task onto milestone row

    const srcId = srcRawId.replace('task-', '');
    const dstId = dstRawId.replace('task-', '');

    const srcTarea = tareas.find(t => String(t.id) === srcId);
    const dstTarea = tareas.find(t => String(t.id) === dstId);
    if (!srcTarea || !dstTarea || srcTarea.tarea_padre_id !== dstTarea.tarea_padre_id) return;

    const siblings = tareas
      .filter(t => t.tarea_padre_id === srcTarea.tarea_padre_id)
      .sort((a, b) => a.orden - b.orden);

    const from = siblings.findIndex(t => t.id === srcTarea.id);
    const to   = siblings.findIndex(t => t.id === dstTarea.id);
    if (from === -1 || to === -1) return;

    const reordered = [...siblings];
    const [removed] = reordered.splice(from, 1);
    reordered.splice(to, 0, removed);
    onReorder(reordered.map((t, i) => ({ id: t.id, orden: i })));
  }, [tareas, hitos, onReorder, onReorderHitos]);

  // ── Custom Header ──────────────────────────────────────────────────────────
  const TaskListHeader = useCallback(({ headerHeight }: any) => {
    const dm  = darkModeRef.current;
    const bg  = dm ? '#1f2937' : '#f9fafb';
    const border = dm ? '#374151' : '#e5e7eb';
    const txt = dm ? '#9ca3af' : '#6b7280';
    const hBg = dm ? '#4b5563' : '#d1d5db';

    const cell = (w: number): React.CSSProperties => ({
      width: w, flexShrink: 0, display: 'flex', alignItems: 'center',
      position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
    });
    const lbl: React.CSSProperties = {
      flex: 1, padding: '0 8px', fontSize: 11, fontWeight: 700,
      color: txt, textTransform: 'uppercase', letterSpacing: '0.06em',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    };
    const handle: React.CSSProperties = {
      width: 4, height: '55%', cursor: 'col-resize',
      position: 'absolute', right: 0, top: '22.5%',
      background: hBg, borderRadius: 2, zIndex: 10,
    };

    return (
      <div style={{ display: 'flex', height: headerHeight, alignItems: 'stretch', background: bg, borderBottom: `1px solid ${border}`, userSelect: 'none', boxSizing: 'border-box' }}>
        <div style={{ width: 20, flexShrink: 0 }} />
        <div style={{ width: 20, flexShrink: 0 }} />
        <div style={cell(colWidths.name)}>
          <span style={lbl}>{langRef.current === 'es' ? 'Nombre' : 'Name'}</span>
          <div style={handle}
            onMouseDown={e => handleResizeStart('name', e)}
            onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')}
            onMouseLeave={e => (e.currentTarget.style.background = hBg)} />
        </div>
        <div style={cell(colWidths.from)}>
          <span style={lbl}>{langRef.current === 'es' ? 'Inicio' : 'Start'}</span>
          <div style={handle}
            onMouseDown={e => handleResizeStart('from', e)}
            onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')}
            onMouseLeave={e => (e.currentTarget.style.background = hBg)} />
        </div>
        <div style={cell(colWidths.to)}>
          <span style={lbl}>{langRef.current === 'es' ? 'Fin' : 'End'}</span>
        </div>
      </div>
    );
  }, [colWidths, darkMode, lang, handleResizeStart]);

  // ── Custom Table ───────────────────────────────────────────────────────────
  const TaskListTable = useCallback((props: any) => {
    const { tasks, rowHeight, onExpanderClick: _libExpander } = props;

    const dm = darkModeRef.current;
    const ln = langRef.current;
    const rowBg     = dm ? '#111827' : '#ffffff';
    const rowBorder = dm ? '#1f2937' : '#f3f4f6';
    const nameColor = dm ? '#e5e7eb' : '#111827';
    const dateColor = dm ? '#9ca3af' : '#6b7280';
    const parentClr = dm ? '#93c5fd' : '#1e40af';

    // ── Compute drag indices from the tasks gantt actually passes in
    // (VISIBLE filtered set — respects hideChildren; milestones included)
    const localDragIndexMap: Record<string, number> = {};
    let dIdx = 0;
    (tasks as Task[]).forEach((t: Task) => {
      // tasks draggable: non-milestone tasks + milestones (when onReorderHitos provided)
      const eligible = t.type !== 'milestone' || !!onReorderHitos;
      if (eligible) localDragIndexMap[t.id] = dIdx++;
    });
    // Keep ref in sync so handleGanttDragEnd can map index → task id
    visibleTaskOrderRef.current = Object.entries(localDragIndexMap)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);

    return (
      <Droppable droppableId="gantt-tasks">
        {(drop) => (
          <div ref={drop.innerRef} {...drop.droppableProps} style={{ fontFamily: 'inherit' }}>
            {(tasks as Task[]).map((task: Task) => {
              const tareaId = task.id.startsWith('task-') ? parseInt(task.id.replace('task-', '')) : null;
              const tarea   = tareaId ? tareas.find(t => t.id === tareaId) : null;
              const isMilestone = task.type === 'milestone';
              const isProject   = task.type === 'project';
              const canDrag     = !readOnly && (!isMilestone ? !!onReorder : !!onReorderHitos);
              const dragIndex   = canDrag ? (localDragIndexMap[task.id] ?? -1) : -1;
              const isCollapsed = collapsedIdsRef.current.has(task.id);
              const indent      = tarea?.tarea_padre_id ? 10 : 0;
              const displayName = task.name.replace(/^\s*↳\s*/, '').replace(/^◆\s*/, '');

              const rowContent = (
                <div style={{
                  height: rowHeight, display: 'flex', alignItems: 'center',
                  borderBottom: `1px solid ${rowBorder}`, background: rowBg,
                  boxSizing: 'border-box',
                  minWidth: colWidths.name + colWidths.from + colWidths.to + 40,
                }}>
                  {/* ── Drag handle (ONLY this element, not the whole row) ── */}
                  <div style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {canDrag && (
                      <GripVertical style={{ width: 13, height: 13, color: dm ? '#4b5563' : '#d1d5db', cursor: 'grab' }} />
                    )}
                  </div>

                  {/* ── Expander (only for project/parent rows) ── */}
                  <div style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isProject && (
                      <button
                        onMouseDown={e => e.stopPropagation()} // don't let dnd grab this
                        onClick={e => { e.stopPropagation(); handleExpanderClick(task); }}
                        style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }}
                      >
                        {isCollapsed
                          ? <ChevronRight style={{ width: 14, height: 14, color: dm ? '#6b7280' : '#9ca3af' }} />
                          : <ChevronDown  style={{ width: 14, height: 14, color: dm ? '#6b7280' : '#9ca3af' }} />
                        }
                      </button>
                    )}
                  </div>

                  {/* ── Name ── */}
                  <div style={{ width: colWidths.name, flexShrink: 0, overflow: 'hidden', paddingLeft: indent, paddingRight: 6, boxSizing: 'border-box' }}>
                    <span
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { if (onEditTarea && tarea && !readOnly) { e.stopPropagation(); onEditTarea(tarea); } }}
                      title={displayName}
                      style={{
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: 12, fontWeight: isProject ? 600 : 400,
                        color: isProject ? parentClr : isMilestone ? '#d97706' : nameColor,
                        cursor: onEditTarea && tarea && !readOnly ? 'pointer' : 'default',
                        textDecoration: onEditTarea && tarea && !readOnly ? 'underline dotted' : 'none',
                        textDecorationColor: 'rgba(59,130,246,0.35)',
                      }}
                    >
                      {isMilestone ? `◆ ${displayName}` : displayName}
                    </span>
                  </div>

                  {/* ── Start date ── */}
                  <div style={{ width: colWidths.from, flexShrink: 0, padding: '0 6px', overflow: 'hidden', boxSizing: 'border-box' }}>
                    <span style={{ fontSize: 11, color: dateColor, whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatDateI18n(tarea?.fecha_inicio, ln)}
                    </span>
                  </div>

                  {/* ── End date ── */}
                  <div style={{ width: colWidths.to, flexShrink: 0, padding: '0 6px', overflow: 'hidden', boxSizing: 'border-box' }}>
                    <span style={{ fontSize: 11, color: dateColor, whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatDateI18n(tarea?.fecha_fin, ln)}
                    </span>
                  </div>
                </div>
              );

              if (canDrag && dragIndex >= 0) {
                return (
                  <Draggable key={task.id} draggableId={task.id} index={dragIndex}>
                    {(drag, snap) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        style={{
                          ...drag.draggableProps.style,
                          background: snap.isDragging ? (dm ? '#1e3a5f' : '#eff6ff') : undefined,
                          boxShadow: snap.isDragging ? '0 4px 16px rgba(0,0,0,0.22)' : undefined,
                          opacity: snap.isDragging ? 0.92 : 1,
                          borderRadius: snap.isDragging ? 6 : 0,
                        }}
                      >
                        {/* dragHandleProps only on the GripVertical icon via a wrapper */}
                        {/* We clone rowContent and inject the handle props onto the grip */}
                        <div style={{ position: 'relative' }}>
                          {/* Invisible drag handle overlay just over the grip area */}
                          <div
                            {...drag.dragHandleProps}
                            style={{
                              position: 'absolute', left: 0, top: 0,
                              width: 20, height: rowHeight,
                              zIndex: 1, cursor: 'grab',
                            }}
                          />
                          {rowContent}
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              }

              return <div key={task.id}>{rowContent}</div>;
            })}
            {drop.placeholder}
          </div>
        )}
      </Droppable>
    );
  }, [tareas, readOnly, onReorder, onReorderHitos, onEditTarea, colWidths, darkMode, lang, handleExpanderClick, collapsedIds]);

  // Stable no-op — onProgressChange is also in gantt-task-react's mouse-listener useEffect deps.
  // Inline `async () => {}` would create a new reference every render and break mid-drag.
  const handleProgressChange = useCallback(async () => {}, []);

  // Stable function — MUST NOT change reference between renders or gantt-task-react
  // will remove its SVG mouse listeners mid-drag (its useEffect deps include onDateChange)
  const handleDateChange = useCallback(async (task: Task) => {
    if (readOnlyRef.current) return;
    const ln = langRef.current;
    try {
      if (task.id.startsWith('task-')) {
        const id = parseInt(task.id.replace('task-', ''));
        await api.updateTareaDates(id, task.start.toISOString().split('T')[0], task.end.toISOString().split('T')[0]);
      } else if (task.id.startsWith('milestone-')) {
        const id = parseInt(task.id.replace('milestone-', ''));
        // Local-time date to avoid UTC off-by-one
        const newDate = `${task.start.getFullYear()}-${String(task.start.getMonth() + 1).padStart(2, '0')}-${String(task.start.getDate()).padStart(2, '0')}`;
        // Optimistic: immediately show new position so gantt doesn't snap back
        setPendingHitoDates(prev => ({ ...prev, [id]: newDate }));
        await api.updateHitoDate(id, newDate);
      }
      toast.success(ln === 'es' ? 'Fecha actualizada' : 'Date updated');
      onUpdateRef.current();
    } catch {
      if (task.id.startsWith('milestone-')) {
        const id = parseInt(task.id.replace('milestone-', ''));
        setPendingHitoDates(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
      toast.error(ln === 'es' ? 'Error al actualizar fecha' : 'Error updating date');
    }
  }, []); // empty deps — reads lang/readOnly/onUpdate via refs

  const listCellWidthHint = `${Math.round((colWidths.name + colWidths.from + colWidths.to + 40) / 3)}px`;

  if (ganttTasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>{t('gantt.empty')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm text-gray-500 dark:text-gray-400">Zoom:</span>
        {([
          { label: t('gantt.week'), mode: ViewMode.Week },
          { label: t('gantt.month'), mode: ViewMode.Month },
          { label: t('gantt.year'), mode: ViewMode.Year },
        ] as const).map(({ label, mode }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              viewMode === mode ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={() => setShowDeps(!showDeps)}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
            showDeps ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {showDeps ? t('gantt.depsOn') : t('gantt.depsOff')}
        </button>
      </div>

      <DragDropContext onDragEnd={handleGanttDragEnd}>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            onDateChange={handleDateChange}
            onProgressChange={handleProgressChange}
            onExpanderClick={handleExpanderClick}
            TaskListHeader={TaskListHeader}
            TaskListTable={TaskListTable}
            listCellWidth={listCellWidthHint}
            columnWidth={viewMode === ViewMode.Week ? 60 : viewMode === ViewMode.Month ? 220 : 300}
            barCornerRadius={4}
            barFill={65}
            fontSize="12px"
            rowHeight={40}
            headerHeight={50}
            todayColor="rgba(37, 99, 235, 0.1)"
            TooltipContent={({ task }) => {
              const isProject   = task.type === 'project';
              const isMilestone = task.type === 'milestone';
              const tid   = task.id.startsWith('task-') ? parseInt(task.id.replace('task-', '')) : null;
              const tarea = tid ? tareas.find(t => t.id === tid) : null;
              return (
                <div className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-3 border border-gray-200 dark:border-gray-700 text-xs max-w-xs">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {isProject ? '📁 ' : isMilestone ? '◆ ' : '📋 '}
                    {task.name.replace(/^\s*↳\s*/, '').replace(/^◆\s*/, '')}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {formatDateI18n(task.start.toISOString().split('T')[0], lang, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' → '}
                    {formatDateI18n(task.end.toISOString().split('T')[0], lang, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  {isProject && <p className="text-blue-500 mt-1">{t('gantt.parentProgress')}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                      <div className="h-1.5 bg-green-500 rounded-full" style={{ width: `${task.progress}%` }} />
                    </div>
                    <span className="text-gray-600 dark:text-gray-300">{task.progress}%</span>
                  </div>
                  {tarea?.responsable_nombre && (
                    <p className="text-gray-500 dark:text-gray-400 mt-1">👤 {tarea.responsable_nombre}</p>
                  )}
                  {task.dependencies && task.dependencies.length > 0 && (
                    <p className="text-orange-500 mt-1">↳ {task.dependencies.length} dep.</p>
                  )}
                  {!readOnly && onEditTarea && task.type !== 'milestone' && (
                    <p className="text-blue-400 mt-1 italic">{t('gantt.clickToEdit')}</p>
                  )}
                </div>
              );
            }}
          />
        </div>
      </DragDropContext>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        {[
          { color: '#1e3a5f', label: t('gantt.parentTask') },
          { color: '#2563eb', label: t('gantt.inProgress') },
          { color: '#16a34a', label: t('gantt.completed') },
          { color: '#dc2626', label: t('gantt.blocked') },
          { color: '#9ca3af', label: t('gantt.pending') },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-sm" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rotate-45" style={{ backgroundColor: '#eab308' }} />
          <span>{t('gantt.milestone')}</span>
        </div>
        {!readOnly && onReorder && (
          <div className="flex items-center gap-1.5 text-gray-400">
            <GripVertical className="w-3 h-3" />
            <span>{t('gantt.dragHint')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
