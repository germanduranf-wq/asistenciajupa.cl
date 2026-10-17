export function toggleDraft(draft, marks, personId, explicit){
 const previous=draft[personId], saved=marks.find(a=>a.person_id===personId);
 const present=explicit??!(previous?.present??saved?.present);
 const next={...draft};
 if(present===(previous?.basePresent??Boolean(saved?.present)))delete next[personId];
 else next[personId]={person_id:personId,present,version:previous?.version??saved?.version??0,basePresent:previous?.basePresent??Boolean(saved?.present)};
 return next;
}
export function effectiveMarks(marks,draft){
 const map=new Map(marks.map(a=>[a.person_id,a]));
 for(const change of Object.values(draft))map.set(change.person_id,{...map.get(change.person_id),...change});
 return [...map.values()];
}
export const draftConflicts=(marks,draft)=>Object.values(draft).filter(c=>(marks.find(a=>a.person_id===c.person_id)?.version||0)!==c.version);
