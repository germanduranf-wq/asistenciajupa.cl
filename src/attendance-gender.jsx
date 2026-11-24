import React from 'react';
export function AttendanceGenderFilter({value,onChange}){
 return <label className="attendance-gender-filter"><span>Filtrar por género</span><select aria-label="Filtrar por género" value={value} onChange={e=>onChange(e.target.value)}><option value="all">Todos</option><option value="men">Hombres</option><option value="women">Mujeres</option></select></label>;
}
