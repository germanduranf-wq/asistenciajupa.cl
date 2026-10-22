export function visibleBulletin(data,month,day){
 const visible=x=>month!==day.slice(0,7)||x.date>=day;
 return {...data,activities:(data.activities||[]).filter(visible).sort((a,b)=>a.date.localeCompare(b.date)),events:(data.events||[]).filter(visible).sort((a,b)=>a.date.localeCompare(b.date))};
}
