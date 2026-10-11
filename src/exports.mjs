import { fullName, dateLabel } from './domain.mjs';
const safe = s => typeof s === 'string' && /^[=+@\-\t\r]/.test(s) ? `'${s}` : s;
export async function exportExcel(stats, data, filters) {
  const XLSX = await import('xlsx');
  const rows = stats.rows.map(a => {
    const p = data.people.find(p => p.id === a.person_id),
      v = data.visits.find(v => v.id === a.visit_id);
    return {
      Fecha: v.date,
      Grupo: v.group,
      Destino: data.classes.find(c => c.id === v.class_id)?.name,
      Participante: fullName(p),
      Clase: data.classes.find(c => c.id === a.class_id)?.name,
      Categoría: a.category
    };
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{
    Desde: filters.from,
    Hasta: filters.to,
    Grupo: filters.group || 'Todos',
    Clase: data.classes.find(c => c.id === filters.class_id)?.name || 'Todas',
    Categoría: filters.category || 'Todas',
    Asistencias: stats.total,
    'Personas únicas': stats.unique
  }]), 'Resumen');
  const sheet = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(v)]))));
  sheet['!cols'] = [{
    wch: 13
  }, {
    wch: 13
  }, {
    wch: 24
  }, {
    wch: 32
  }, {
    wch: 24
  }, {
    wch: 27
  }];
  XLSX.utils.book_append_sheet(book, sheet, 'Asistencias');
  XLSX.writeFile(book, `JUPA-${filters.from}-${filters.to}.xlsx`);
}
export async function exportPDF(stats, data, filters) {
  const {
    jsPDF
  } = await import('jspdf');
  const doc = new jsPDF();
  let y = 20;
  const text = (s, size = 11) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(s, 174);
    if (y + lines.length * 6 > 277) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, 18, y);
    y += lines.length * 6 + 3;
  };
  text('ASISTENCIA JUPA', 22);
  text('Juventud Unida de Puente Alto', 12);
  text(`${dateLabel(filters.from, {
    year: 'numeric'
  })} al ${dateLabel(filters.to, {
    year: 'numeric'
  })}`);
  text(`Grupo: ${filters.group || 'Todos'} | Clase: ${data.classes.find(c => c.id === filters.class_id)?.name || 'Todas'}`);
  text(`Categoría: ${filters.category || 'Todas'}`);
  y += 4;
  text(`${stats.total} asistencias | ${stats.unique} personas únicas | ${stats.visits.length} visitas`, 13);
  y += 4;
  text('Participación por clase', 15);
  for (const c of stats.classes) text(`${c.name}: ${c.count} asistencias`);
  y += 4;
  text('Asistencias por visita', 15);
  for (const v of stats.visits) text(`${dateLabel(v.date)} · ${v.group} · ${data.classes.find(c => c.id === v.class_id)?.name}: ${stats.rows.filter(a => a.visit_id === v.id).length}`);
  y += 4;
  text('Participación individual', 15);
  for (const p of stats.people) text(`${fullName(p)}: ${p.count} asistencias`);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Uso interno JUPA · Generado ${new Date().toLocaleDateString('es-CL')} · Página ${i} de ${pages}`, 18, 290);
  }
  doc.save(`JUPA-${filters.from}-${filters.to}.pdf`);
}
