import {Stats} from './reports.jsx';
import {Activities,ActivityStatus,PasswordChange,UsersAdmin} from './activities.jsx';
import {MODULES,PROFILE_ROLES,canActivity,canPerson,canSchedule,modulesFor,eligiblePerson,activityLabel,ageAt} from './access.mjs';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, CalendarDays, Users, ChartNoAxesCombined, Settings, ChevronRight, ChevronLeft, ArrowUpRight, Plus, Search, Check, MapPin, Clock3, Camera, LayoutList, Grid2X2, LogOut, ShieldCheck, Download, FileSpreadsheet, FileText, RefreshCw, LockKeyhole, Menu, X, Church, UserRound, CalendarCheck, CheckCheck, Ellipsis, ArrowRight, LoaderCircle, WifiOff, SlidersHorizontal, History, Link2, Pencil, Eye, KeyRound } from 'lucide-react';
import * as api from './api.mjs';
import { CATEGORIES, ROLES, groupOf, fullName, today, addDays, canEdit, dateLabel, normalize, statistics } from './domain.mjs';
import { Avatar, Empty, Field, Button, Modal, CropPhoto } from './ui.jsx';
import { PersonForm, VisitForm, ResponsibilityForm } from './forms.jsx';
import { exportExcel, exportPDF } from './exports.mjs';
import './style.css';
const blank = {
  classes: [],
  people: [],
  visits: [],
  attendance: [],
  responsibilities: [],
  profiles: [], activity_modules: [], account_permissions: []
};
const baseNav = [['home', 'Inicio', Home], ['visits', 'Visitas', CalendarDays], ['people', 'Participantes', Users], ['stats', 'Estadísticas', ChartNoAxesCombined], ['admin', 'Administración', Settings]];
function App() {
  const [profile, setProfile] = useState(null),
    [data, setData] = useState(blank),
    [page, setPage] = useState('home'),
    [visitId, setVisitId] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(null),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [recovery, setRecovery] = useState(false);
  const refreshTicket = useRef(0);
  const alive = useRef(true);
  const refresh = async () => {
    const ticket = ++refreshTicket.current;
    if (!api.isDemo()) {
      const activeProfile = await api.fetchProfile();
      if (activeProfile?.must_change_password) { setProfile(activeProfile); setData(blank); setModal(null); return; }
      if (!activeProfile?.active) {
        setProfile(null);
        setData(blank);
        setModal(null);
        throw new Error('La sesión terminó o tu cuenta ya no tiene acceso.');
      }
    }
    if (!api.isDemo()) { const latest = await api.fetchProfile(); if (latest) setProfile(latest); }
    const next = await api.fetchAll();
    if (ticket === refreshTicket.current && alive.current) setData(next);
  };
  const notify = message => {
    setToast(message);
  };
  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const p = await api.fetchProfile();
      if (p?.active && p.must_change_password) { setProfile(p); setData(blank); return; }
      if (p?.active) {
        setProfile(p);
        await refresh();
      } else {
        setProfile(null);
        if (p && !p.active) setError('Esta cuenta está desactivada. Contacta al administrador.');else if (api.supabase) {
          const {
            data: {
              session
            }
          } = await api.supabase.auth.getSession();
          if (session) setError('Tu cuenta aún no tiene acceso. Contacta al administrador.');
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    if (api.configured) load();else setLoading(false);
    const handleOn = () => setOnline(true),
      handleOff = () => setOnline(false);
    window.addEventListener('online', handleOn);
    window.addEventListener('offline', handleOff);
    const sub = api.supabase?.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setData(blank);
      }
    });
    return () => {
      alive.current = false;
      sub?.data.subscription.unsubscribe();
      window.removeEventListener('online', handleOn);
      window.removeEventListener('offline', handleOff);
    };
  }, []);
  useEffect(() => {
    if (!profile) return;
    const sync = () => refresh().catch(() => setError('No pudimos actualizar los datos. Revisa tu conexión y reintenta.'));
    window.addEventListener('storage', sync);
    window.addEventListener('jupa-change', sync);
    window.addEventListener('focus', sync);
    const interval = setInterval(sync, 20000);
    let channel;
    if (!api.isDemo()) channel = api.supabase.channel('jupa-live').on('postgres_changes', {
      event: '*',
      schema: 'public'
    }, sync).subscribe();
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', sync);
      window.removeEventListener('jupa-change', sync);
      window.removeEventListener('focus', sync);
      channel?.unsubscribe();
    };
  }, [profile?.id]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const go = (next, id = null) => {
    setPage(next);
    setVisitId(id);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  const saved = async (message = 'Cambios guardados') => {
    await refresh();
    notify(message);
  };
  const className = id => data.classes.find(c => c.id === id)?.name || 'Sin clase';
  const openVisit = id => go('attendance', id);
  const header = {
    ...Object.fromEntries(Object.entries(MODULES).map(([k,v])=>[k,[v,'Registra y consulta las actividades habilitadas.']])),
    home: ['Tu punto de encuentro', 'Visitas de Viernes'],
    visits: ['Visitas', 'Organiza las visitas y registra la asistencia.'],
    people: ['Participantes', 'Hermanos y hermanas de nuestra jupa.'],
    stats: ['Estadísticas', 'Una mirada a nuestra participación.'],
    admin: ['Administración', 'Todo preparado para la próxima visita.']
  };
  if (profile?.must_change_password) return <PasswordChange profile={profile} onSaved={load}/>;
  if (loading && !profile) return <div className="startup"><img src="/logo-compacto.webp" alt="JUPA" /><LoaderCircle className="spin" /><p>Preparando tu espacio…</p></div>;
  if (!profile || recovery) return <Login error={error} loading={loading} recovery={recovery} onRecovered={() => {
    setRecovery(false);
    load();
  }} onLogin={load} onDemo={async () => {
    api.enterDemo();
    await load();
  }} />;
  const visibleModules = modulesFor(profile,data);
  const nav = [...baseNav.filter(([id]) => id==='admin' ? profile.role==='admin' : id==='visits' ? visibleModules.includes('visita') : id==='stats' ? modulesFor(profile,data,'export').length>0 : true), ...visibleModules.filter(m=>m!=='visita').map(m=>[m,MODULES[m],CalendarDays])];
  const canViewPage = page==='attendance' || nav.some(([id])=>id===page);
  const currentVisit = data.visits.find(v => v.id === visitId);
  return <div className="app-shell"><aside className={`sidebar ${menu ? 'open' : ''}`}><a className="brand" href="#" onClick={e => {
        e.preventDefault();
        go('home');
      }}><img src="/logo-compacto.webp" alt="JUPA" /><span>ASISTENCIA</span></a><div className="side-label">JUVENTUD UNIDA · PUENTE ALTO</div><nav>{nav.map(([id, label, Icon]) => <button key={id} onClick={() => go(id)} className={`nav-item ${page === id || id === 'visits' && page === 'attendance' ? 'active' : ''}`}><Icon size={20} /><span>{label}</span>{page === id && <span className="nav-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="side-note"><Church size={22} /><p>En comunión en cada visita.<small>Juventud Unida de Puente Alto</small></p></div><div className="account"><span className="account-avatar">{profile.name?.[0] || 'A'}</span><span><b>{profile.name}</b><small>{PROFILE_ROLES[profile.role]}</small></span><button title="Cerrar sesión" aria-label="Cerrar sesión" onClick={async () => {
            await api.logout();
            setProfile(null);
            setData(blank);
            setPage('home');
          }}><LogOut size={18} /></button></div></div></aside>{menu && <button className="menu-shade" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
 <div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMenu(true)}><Menu size={22} /></button><div className="breadcrumb">Asistencia JUPA <ChevronRight size={13} /><b>{page === 'attendance' ? 'Pasar asistencia' : nav.find(n => n[0] === page)?.[1]}</b></div><div className="topbar-right"><span className="today-label"><CalendarDays size={15} />{dateLabel(today(), {
              year: 'numeric'
            })}</span><span className="private-badge"><ShieldCheck size={14} /> Acceso privado</span></div></header>
 {api.isDemo() && <div className="demo-banner"><span><span className="demo-dot" /> Vista de prueba · datos ficticios guardados solo en este navegador</span><button onClick={() => {
          api.enterDemo(profile.role === 'admin' ? 'clase' : 'admin');
          load();
          go('home');
        }}>Probar como {profile.role === 'admin' ? 'cuenta de clase' : 'administrador'} <ArrowRight size={14} /></button></div>}
 {!online && <div role="alert" className="offline"><WifiOff size={17} /> Sin conexión. Espera a recuperar internet antes de guardar.</div>}
 {error && <div className="global-error" role="alert">{error}<button onClick={() => {
          setError('');
          refresh().catch(e => setError(e.message));
        }}>Reintentar</button><button aria-label="Cerrar aviso" onClick={() => setError('')}><X size={16} /></button></div>}
 <main>{!canViewPage && <p className='info-line'>Esta sección ya no está habilitada para tu cuenta. Selecciona una opción del menú.</p>}{page !== 'attendance' && <div className="page-heading"><div><div className="eyebrow">{page === 'home' ? 'JUNTOS, VISITA A VISITA' : 'ASISTENCIA JUPA'}</div><h1>{header[page]?.[0]}</h1><p>{header[page]?.[1]}</p></div>{canSchedule(profile,data,'visita',null) && ['home', 'visits'].includes(page) && <button className="button primary" onClick={() => setModal({
            type: 'visit'
          })}><Plus size={18} /> Programar visita</button>}{page === 'people' && <button className="button primary" onClick={() => setModal({
            type: 'person'
          })}><Plus size={18} /> Agregar participante</button>}</div>}
 {page==='home'&&!visibleModules.includes('visita')&&<section className='panel comparison-panel'><h2>Bienvenido, {profile.name}</h2><p>Selecciona una actividad del menú para registrar asistencia.</p>{!visibleModules.length&&<p>No tienes actividades habilitadas todavía. Contacta al administrador.</p>}</section>}
 {page === 'home' && visibleModules.includes('visita') && <Dashboard data={{...data,visits:data.visits.filter(v=>(v.activity_type||'visita')==='visita')}} profile={profile} className={className} openVisit={openVisit} go={go} newVisit={() => setModal({
          type: 'visit'
        })} />}
 {page === 'visits' && visibleModules.includes('visita') && <Visits data={{...data,visits:data.visits.filter(v=>(v.activity_type||'visita')==='visita')}} profile={profile} className={className} openVisit={openVisit} edit={visit => setModal({
          type: 'visit',
          visit
        })} />}
 {visibleModules.filter(m=>m!=='visita').map(m=>page===m&&<Activities key={m} type={m} data={data} profile={profile} openVisit={openVisit} onRefresh={refresh}/>)}
 {page === 'attendance' && currentVisit && <Attendance key={currentVisit.id} visit={currentVisit} data={data} profile={profile} className={className} go={go} onRefresh={refresh} notify={notify} setModal={setModal} online={online} />}
 {page === 'attendance' && !currentVisit && <Empty icon={CalendarDays} title="No encontramos la visita" text="Vuelve al listado para seleccionar una visita." action={<button className="button primary" onClick={() => go('visits')}>Ver visitas</button>} />}
 {page === 'people' && <People data={data} profile={profile} className={className} setModal={setModal} />}
 {page === 'stats' && modulesFor(profile,data,'export').length>0 && <Stats data={data} profile={profile} className={className} notify={notify} />}
 {page === 'admin' && profile.role === 'admin' && <Admin data={data} profile={profile} onSaved={saved} notify={notify} setModal={setModal} />}
 <footer className="page-footer"><span>JUPA · Juventud Unida de Puente Alto</span><span>Hecho para acompañarnos.</span></footer></main></div>
 <nav className="bottom-nav">{nav.filter(([id])=>id!=='admin').map(([id, label, Icon]) => <button key={id} onClick={() => go(id)} className={page === id || id === 'visits' && page === 'attendance' ? 'active' : ''}><Icon size={20} /><span>{label}</span></button>)}</nav>
 {toast && <div role="status" className="toast"><CheckCheck size={18} />{toast}</div>}
 {modal?.type === 'person' && <PersonForm person={modal.person} visit={modal.visit} profile={profile} data={data} onClose={() => setModal(null)} onSaved={async (p, action) => {
      await saved(action==='reactivated' ? 'Participante reincorporado. Su historial se conserva.' : modal.person ? 'Datos actualizados' : 'Participante agregado');
      if (modal.onPerson && action!=='reactivated') await modal.onPerson(p);
    }} />}
 {modal?.type === 'activityStatus' && <ActivityStatus visit={modal.visit} data={data} onClose={()=>setModal(null)} onSaved={()=>saved('Estado actualizado')}/>}
 {modal?.type === 'visit' && <VisitForm visit={modal.visit} data={data} onClose={() => setModal(null)} onSaved={() => saved('Visita guardada')} />}
 {modal?.type === 'photo' && <CropPhoto person={modal.person} onClose={() => setModal(null)} onSave={async blob => {
      await api.savePhoto(modal.person.id, blob);
      await saved('Fotografía guardada');
    }} />}
 {modal?.type === 'responsibility' && <ResponsibilityForm record={modal.record} data={data} onClose={() => setModal(null)} onSaved={() => saved('Resultado guardado')} />}
 {modal?.type === 'history' && <PersonHistory person={modal.person} data={data} className={className} onClose={() => setModal(null)} />}
 {modal?.type === 'merge' && <MergeForm data={data} onClose={() => setModal(null)} onSaved={() => saved('Registros fusionados sin duplicar asistencias')} />}
 </div>;
}
function Login({
  error,
  loading,
  onLogin,
  onDemo,
  recovery,
  onRecovered
}) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [localError, setLocalError] = useState('');
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      if (recovery) {
        const r = await api.supabase.auth.updateUser({
          password
        });
        if (r.error) throw r.error;
        await onRecovered();
      } else {
        await api.login(username, password);
        await onLogin();
      }
    } catch (e) {
      setLocalError(e.message.includes('Invalid login') ? 'El usuario o la contraseña no son correctos.' : e.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="login-page"><div className="login-art"><span className="login-kicker">JUVENTUD UNIDA DE PUENTE ALTO</span><div className="login-message"><div className="login-symbol"><Church size={54} strokeWidth={1} /></div><h1>Por Una JUPA<br />Conforme al Corazón de Cristo.</h1><p>Un espacio para acompañar a nuestra juventud,<br className="desktop" />Al servicio del Señor.🙌</p></div><span className="login-bottom">ASISTENCIA JUPA <span>·</span> PUENTE ALTO</span></div><div className="login-panel"><div className="login-card"><img className="login-logo" src="/logo-completo.webp" alt="JUPA · Juventud Unida de Puente Alto" /><div className="eyebrow">BIENVENIDO A ASISTENCIA JUPA</div><h2>{recovery ? 'Crea una nueva contraseña' : 'Cada visita cuenta.'}</h2><p className="muted">{recovery ? 'Utiliza al menos 12 caracteres.' : 'Ingresa para registrar y acompañar a nuestra juventud.'}</p><form onSubmit={submit}>{!recovery && <Field label="Usuario"><input type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required placeholder="usuario.jupa" disabled={!api.configured} /></Field>}<Field label={recovery ? 'Nueva contraseña' : 'Contraseña'}><input type="password" value={password} minLength={recovery ? 12 : undefined} onChange={e => setPassword(e.target.value)} autoComplete={recovery ? 'new-password' : 'current-password'} required placeholder="Tu contraseña" disabled={!api.configured} /></Field><Button className="button primary full" busy={busy || loading} disabled={!api.configured} type="submit">{recovery ? 'Guardar contraseña' : 'Ingresar'} <ArrowRight size={18} /></Button></form>{(error || localError) && <p role="alert" className="form-error">{localError || error}</p>}{message && <p role="status" className="info-line">{message}</p>}{api.configured && !recovery && <button className="text-button recovery" onClick={() => { setMessage('Solicita al administrador restablecer tu contraseña.'); }}>Olvidé mi contraseña</button>}{api.demoAllowed && !recovery && <div className="demo-entry"><span>CONOCE LA APLICACIÓN</span><button className="button secondary full" onClick={onDemo}>Explorar versión de prueba <ArrowUpRight size={17} /></button><small>Datos ficticios. Puedes probar los flujos sin afectar registros reales.</small></div>}<div className="login-lock"><LockKeyhole size={14} /> Acceso exclusivo para encargados autorizados</div></div></div></div>;
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = ''
}) {
  return <div className={`metric ${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={19} /></span></div><b>{value}</b><small>{detail}</small></div>;
}
function GroupBadge({
  group
}) {
  return <span className={`badge ${group === 'Señoritas' ? 'purple' : 'blue'}`}><span />{group}</span>;
}
function Dashboard({
  data,
  profile,
  className,
  openVisit,
  go,
  newVisit
}) {
  const t = today(),
    month = t.slice(0, 7);
  const visits = [...data.visits].sort((a, b) => b.date.localeCompare(a.date));
  const recent = visits.filter(v => v.date <= t).slice(0, 4);
  const next = [...data.visits].filter(v => v.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  const focus = visits.find(v => v.date === t) || recent[0] || next;
  const monthIds = new Set(visits.filter(v => v.date.startsWith(month) && v.date <= t).map(v => v.id));
  const total = data.attendance.filter(a => a.present && monthIds.has(a.visit_id)).length;
  return <><div className="dashboard-hero"><div className="hero-copy"><span className="hero-kicker"><span />{focus?.date === t ? 'HOY NOS ENCONTRAMOS' : focus?.date < t ? 'ÚLTIMA VISITA' : 'PRÓXIMO ENCUENTRO'}</span><h2>{focus ? className(focus.class_id) : 'Todo comienza con una visita.'}</h2><p>{focus ? <><CalendarDays size={17} />{dateLabel(focus.date, {
              weekday: 'long'
            })}<span className="hero-dot">·</span>{focus.group}</> : 'Programa el primer encuentro de la juventud.'}</p>{focus ? <button className="button hero-button" onClick={() => openVisit(focus.id)}>Pasar asistencia <ArrowRight size={18} /></button> : profile.role === 'admin' && <button className="button hero-button" onClick={newVisit}>Programar primera visita <Plus size={18} /></button>}</div><div className="hero-visual" aria-hidden="true"><div className="hero-ring ring-one" /><div className="hero-ring ring-two" /><div className="hero-church"><Church size={88} strokeWidth={1.1} /></div><span className="floating-check"><Check size={21} /></span><span className="hero-caption">Nos encontramos.<br /><b>Nos acompañamos.</b></span></div></div>
 <div className="metrics"><Metric icon={Users} label="Participantes" value={data.people.filter(p => p.active).length} detail="Hermanos y hermanas registrados" /><Metric icon={Church} label="Clases y locales" value={data.classes.filter(c => c.active).length} detail="Unidos en el mismo propósito" /><Metric icon={CalendarCheck} label="Visitas del mes" value={monthIds.size} detail={new Date(`${t}T12:00:00`).toLocaleDateString('es-CL', {
        month: 'long',
        year: 'numeric'
      })} />{profile.role === 'admin' && <Metric icon={CheckCheck} label="Asistencias del mes" value={total} detail="Participaciones acumuladas" tone="highlight" />}</div>
 <div className="dashboard-columns"><section className="panel"><div className="section-head"><div><h2>Visitas recientes</h2><p>Retoma el registro de nuestros encuentros.</p></div><button className="text-button" onClick={() => go('visits')}>Ver todas <ChevronRight size={16} /></button></div>{recent.length ? recent.map(v => <button className="visit-row" key={v.id} onClick={() => openVisit(v.id)}><DateTile date={v.date} /><div className="visit-row-info"><strong>{className(v.class_id)}</strong><span><GroupBadge group={v.group} /><span className="muted">{data.attendance.filter(a => a.visit_id === v.id && a.present).length} asistentes</span></span></div><ChevronRight size={20} /></button>) : <Empty icon={CalendarDays} title="Las primeras visitas nos esperan" text="Aquí verás los encuentros realizados." />}</section><section className="next-panel"><div className="section-head"><h2>En el calendario</h2><CalendarDays size={20} /></div>{next ? <><GroupBadge group={next.group} /><h3>{className(next.class_id)}</h3><p><CalendarDays size={16} />{dateLabel(next.date, {
              weekday: 'long'
            })}</p><div className="next-rule" /><small>Un nuevo encuentro para compartir.</small><button className="button secondary full" onClick={() => openVisit(next.id)}>Ver visita <ArrowUpRight size={17} /></button></> : <><p>No hay visitas próximas programadas.</p>{profile.role === 'admin' && <button className="button secondary" onClick={newVisit}>Agregar al calendario</button>}</>}<div className="tip"><span><Check size={16} /></span><p><b>Un detalle que ayuda</b>Busca por clase o usa las fotografías para encontrar a cada participante.</p></div></section></div></>;
}
function DateTile({
  date
}) {
  return <span className="date-tile"><b>{Number(date.slice(8))}</b><span>{new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', {
        month: 'short'
      }).replace('.', '')}</span></span>;
}
function Visits({
  data,
  profile,
  className,
  openVisit,
  edit
}) {
  const [group, setGroup] = useState(''),
    [period, setPeriod] = useState('all'),
    [search, setSearch] = useState('');
  const list = [...data.visits].filter(v => (!group || v.group === group) && normalize(className(v.class_id)).includes(normalize(search)) && (period === 'all' || (period === 'next' ? v.date >= today() : v.date < today()))).sort((a, b) => b.date.localeCompare(a.date));
  return <><div className="filter-bar"><div className="segments">{['', 'Jóvenes', 'Señoritas'].map(g => <button key={g} className={group === g ? 'selected' : ''} onClick={() => setGroup(g)}>{g || 'Todas'}</button>)}</div><div className="filter-controls"><label className="search-box"><Search size={18} /><input aria-label="Buscar visita por destino" placeholder="Buscar destino…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Período de visitas" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Todas las fechas</option><option value="next">Próximas visitas</option><option value="past">Visitas anteriores</option></select></div></div><div className="visit-grid">{list.map(v => {
        const count = data.attendance.filter(a => a.visit_id === v.id && a.present).length;
        return <article key={v.id} className="visit-card"><div className="visit-card-top"><DateTile date={v.date} /><GroupBadge group={v.group} /></div><h2>{className(v.class_id)}</h2><p className="muted"><MapPin size={15} /> Circuito de Puente Alto</p><div className="visit-card-meta"><span><Users size={16} />{count} asistentes</span><span className={`small-status ${v.date >= today() ? 'upcoming' : ''}`}>{v.date > today() ? 'Próxima' : v.date === today() ? 'Hoy' : canEdit(v, 'encargado') ? 'Edición abierta' : 'Histórica'}</span></div><div className="visit-card-actions"><button className="button secondary" onClick={() => openVisit(v.id)}>{canEdit(v, profile.role) ? 'Pasar asistencia' : 'Ver asistencia'}<ArrowRight size={16} /></button>{canSchedule(profile,data,'visita',v.class_id) && <button className="icon-button" aria-label={`Editar visita ${className(v.class_id)}`} onClick={() => edit(v)}><Pencil size={18} /></button>}</div></article>;
      })}</div>{!list.length && <Empty icon={CalendarDays} title="No hay visitas para estos filtros" text="Prueba otra fecha o grupo, o programa un nuevo encuentro." />}</>;
}
function Attendance({
  visit,
  data,
  profile,
  className,
  go,
  onRefresh,
  notify,
  setModal,
  online
}) {
  const [search, setSearch] = useState(''),
    [classFilter, setClassFilter] = useState(''),
    [view, setView] = useState('list'),
    [presentOnly, setPresentOnly] = useState(false),
    [allGroups, setAllGroups] = useState(false),
    [pending, setPending] = useState(new Set()),
    [failure, setFailure] = useState('');
  const frozenRank = useRef(Object.fromEntries(data.people.map(p => [p.id, data.attendance.filter(a => a.person_id === p.id && a.present && data.visits.some(v => v.id === a.visit_id && v.group === visit.group && v.date < visit.date)).length])));
  const editable = canEdit(visit, profile.role) && visit.status !== 'suspended' && canActivity(profile,data,visit.activity_type||'visita',visit.class_id,'manage');
  const marks = data.attendance.filter(a => a.visit_id === visit.id),
    count = marks.filter(a => a.present).length;
  const assigned = new Set(data.responsibilities.filter(r => r.visit_id === visit.id).flatMap(r => [r.person_id, r.actual_person_id]));
  const people = data.people.filter(p => (eligiblePerson(visit,p) || marks.some(a=>a.person_id===p.id&&a.present)) && (p.active || marks.some(a => a.person_id === p.id && a.present)) && (visit.group==='Todos' || allGroups || groupOf(p.category) === visit.group || assigned.has(p.id) || marks.some(a => a.person_id === p.id && a.present)) && normalize(fullName(p)).includes(normalize(search)) && (!classFilter || p.class_id === classFilter) && (!presentOnly || marks.some(a => a.person_id === p.id && a.present))).sort((a, b) => (frozenRank.current[b.id] || 0) - (frozenRank.current[a.id] || 0) || fullName(a).localeCompare(fullName(b)));
  const toggle = async (p, explicit) => {
    if (!editable || pending.has(p.id)) return;
    const mark = marks.find(a => a.person_id === p.id);
    setFailure('');
    setPending(s => new Set(s).add(p.id));
    try {
      await api.saveAttendance(visit, p, explicit ?? !mark?.present, mark?.version || 0);
      await onRefresh();
      notify(explicit ?? !mark?.present ? 'Asistencia guardada' : 'Marca retirada');
    } catch (e) {
      setFailure(`${fullName(p)}: ${e.message}`);
      await onRefresh().catch(() => {});
    } finally {
      setPending(s => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
    }
  };
  return <>{canActivity(profile,data,visit.activity_type||'visita',visit.class_id,'manage') && canEdit(visit,profile.role) && <button className='button secondary activity-status-button' onClick={()=>setModal({type:'activityStatus',visit})}>Estado y lugar: {({pending:'Pendiente',held:'Realizada',suspended:'Suspendida'})[visit.status||'pending']}</button>}<p className='eyebrow'>{activityLabel(visit)} · Lugar: {className(visit.venue_class_id||visit.class_id)}</p><button className="back-link" onClick={() => go((visit.activity_type||'visita')==='visita'?'visits':visit.activity_type)}><ChevronLeft size={17} /> Volver al calendario</button><div className="attendance-heading"><div><GroupBadge group={visit.group} /><h1>{className(visit.class_id)}</h1><p><CalendarDays size={17} />{dateLabel(visit.date, {
            weekday: 'long',
            year: 'numeric'
          })}</p></div><div className="attendance-count"><CheckCheck size={25} /><div><b>{count}</b><span>presentes</span></div></div></div><div className="attendance-status"><span className={online ? 'save-indicator' : 'muted'}><span />{pending.size ? 'Guardando…' : online ? 'Actualización automática' : 'Sin conexión'}</span><span><Clock3 size={14} />{profile.role === 'admin' ? 'Puedes corregir esta visita como administrador' : editable ? `Editable hasta el ${dateLabel(addDays(visit.date, 21))}` : visit.date > today() ? 'La asistencia abre el día de la visita' : 'Plazo de edición cerrado'}</span></div>{!editable && <div className="notice"><LockKeyhole size={17} /> {visit.date > today() ? 'Esta visita aún no comienza. Puedes consultar sus responsables.' : 'Han transcurrido más de 21 días. Solo el administrador puede corregir este registro.'}</div>}{visit.notes && <div className="notice">{visit.notes}</div>}
 <section className="panel attendance-panel"><div className="section-head"><div><h2>Pasar asistencia</h2><p>Marca a quienes llegaron. Los más frecuentes aparecen primero.</p></div>{editable && <button className="button primary" aria-label="Agregar participante" onClick={() => setModal({
          type: 'person',
          visit,
          onPerson: p => toggle(p, true)
        })}><Plus size={17} /><span>Agregar participante</span></button>}</div><div className="attendance-filters"><label className="search-box"><Search size={19} /><input placeholder="Buscar por nombre o apellido…" aria-label="Buscar participante" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><X size={16} /></button>}</label><select aria-label="Filtrar por clase" value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">Todas las clases</option>{data.classes.filter(c=>profile.role!=='clase'||c.id===profile.class_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="view-toggle"><button aria-label="Ver listado" aria-pressed={view === 'list'} className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}><LayoutList size={20} /></button><button aria-label="Buscar por fotografía" aria-pressed={view === 'photos'} className={view === 'photos' ? 'selected' : ''} onClick={() => setView('photos')}><Grid2X2 size={19} /></button></div></div><div className="list-subhead"><span>{people.length} participantes</span><div><label><input type="checkbox" checked={allGroups} onChange={e => setAllGroups(e.target.checked)} /> Otros grupos</label><label><input type="checkbox" checked={presentOnly} onChange={e => setPresentOnly(e.target.checked)} /> Solo presentes</label></div></div>{failure && <div className="form-error" role="alert">{failure} <button className="text-button" onClick={() => setFailure('')}>Cerrar</button></div>}
 <div className={view === 'photos' ? 'photo-grid' : 'attendance-list'}>{people.map(p => {
          const present = Boolean(marks.find(a => a.person_id === p.id)?.present),
            busy = pending.has(p.id);
          return <div key={p.id} className={`person-row ${present ? 'present' : ''} ${view === 'photos' ? 'photo-card' : ''}`}><button className="person-mark" disabled={!editable || busy || !online} onClick={() => toggle(p)} aria-pressed={present} aria-label={`${present ? 'Retirar' : 'Marcar'} asistencia de ${fullName(p)}`}><Avatar person={p} large={view === 'photos'} /><span className="person-info"><strong>{fullName(p)}</strong><small>{className(p.class_id)}</small><span className="person-category">{p.category}</span></span><span className={`attendance-check ${present ? 'checked' : ''}`}>{busy ? <LoaderCircle size={18} className="spin" /> : present ? <Check size={19} /> : null}</span></button><button className="photo-action icon-button" aria-label={`Fotografía de ${fullName(p)}`} title="Agregar o cambiar foto" onClick={() => setModal({
              type: 'photo',
              person: p
            })}><Camera size={17} /></button></div>;
        })}</div>{!people.length && <Empty icon={Search} title="No encontramos participantes" text="Prueba con otro nombre o clase. También puedes agregar a alguien nuevo." />}<div className="list-footer"><ShieldCheck size={15} /> Cada marca se guarda por separado para trabajar entre varios encargados.</div></section>
 {(visit.activity_type||'visita')==='visita' && <section className="panel responsibility-panel"><div className="section-head"><div><h2>Responsables de la visita</h2><p>Confirma qué ocurrió con cada función.</p></div>{canSchedule(profile,data,'visita',visit.class_id) && <button className="text-button" onClick={() => setModal({
          type: 'visit',
          visit
        })}>Editar asignación <Pencil size={15} /></button>}</div><div className="responsibility-grid">{ROLES.map(role => {
          const r = data.responsibilities.find(r => r.visit_id === visit.id && r.role === role),
            p = data.people.find(p => p.id === r?.person_id);
          return <div className="responsibility-card" key={role}><span className="responsibility-role">{role}</span><div className="mini-person"><Avatar person={p} /><div><b>{p ? fullName(p) : 'Por asignar'}</b><small>{p ? className(p.class_id) : 'El administrador puede asignarlo.'}</small></div></div>{r && <><span className={`badge ${r.outcome === 'Cumplió' ? 'green' : 'neutral'}`}>{r.outcome}</span>{r.actual_person_id && <small className="actual-person">Realizó: {fullName(data.people.find(p => p.id === r.actual_person_id))}</small>}{r.note && <p className="responsibility-note">{r.note}</p>}<button disabled={!editable} className="text-button" onClick={() => setModal({
                type: 'responsibility',
                record: r
              })}>Registrar resultado <ChevronRight size={15} /></button></>}</div>;
        })}</div></section>}</>;
}
function People({
  data,
  profile,
  className,
  setModal
}) {
  const [q, setQ] = useState(''),
    [cl, setCl] = useState(''),
    [inactive, setInactive] = useState(false);
  const people = data.people.filter(p => (inactive || p.active) && normalize(fullName(p)).includes(normalize(q)) && (!cl || p.class_id === cl)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return <><div className="filter-bar"><label className="search-box"><Search size={18} /><input aria-label="Buscar participante" placeholder="Buscar nombre o apellido…" value={q} onChange={e => setQ(e.target.value)} /></label><select value={cl} aria-label="Clase" onChange={e => setCl(e.target.value)}><option value="">Todas las clases</option>{data.classes.filter(c=>profile.role!=='clase'||c.id===profile.class_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><label className="check-label"><input type="checkbox" checked={inactive} onChange={e => setInactive(e.target.checked)} /> Incluir inactivos</label></div><div className="people-count">{people.length} participantes</div><div className="people-grid">{people.map(p => <article className={`participant-card ${!p.active ? 'inactive' : ''}`} key={p.id}><div className="participant-top"><Avatar person={p} large /><button className="icon-button" aria-label={`Foto de ${fullName(p)}`} onClick={() => setModal({
            type: 'photo',
            person: p
          })}><Camera size={18} /></button></div><h3>{fullName(p)}</h3><p><MapPin size={14} />{className(p.class_id)}</p><span className="badge neutral">{p.category}</span>{p.birth_date&&<small>{ageAt(p.birth_date,today())} años · {dateLabel(p.birth_date,{year:'numeric'})}</small>}{!p.active && <span className="badge neutral">Inactivo</span>}<div className="participant-actions">{canPerson(profile,p.class_id,'edit') ? <><button className="text-button" onClick={() => setModal({
              type: 'history',
              person: p
            })}><History size={15} /> Historial</button><button className="text-button" onClick={() => setModal({
              type: 'person',
              person: p
            })}><Pencil size={15} /> Editar</button></> : <span className="muted">Participante registrado</span>}</div></article>)}</div>{!people.length && <Empty icon={Users} title="No hay participantes para mostrar" text="Agrega el primer participante o cambia los filtros." />}</>;
}
function PersonHistory({
  person,
  data,
  className,
  onClose
}) {
  const rows = data.attendance.filter(a => a.person_id === person.id && a.present).map(a => ({
    ...a,
    visit: data.visits.find(v => v.id === a.visit_id)
  })).filter(a => a.visit).sort((a, b) => b.visit.date.localeCompare(a.visit.date));
  return <Modal title="Historial de asistencia" subtitle={fullName(person)} onClose={onClose}><div className="modal-body"><div className="history-total"><b>{rows.length}</b> asistencias registradas</div>{rows.map(a => <div key={a.visit_id} className="history-row"><DateTile date={a.visit.date} /><div><b>{className(a.visit.class_id)}</b><small>{a.visit.group} · {a.visit.date.slice(0, 4)}</small><small>Contabilizó en {className(a.class_id)} · {a.category}</small></div><Check size={19} /></div>)}{!rows.length && <p className="muted">Aún no tiene asistencias registradas.</p>}</div></Modal>;
}
function Admin({
  data,
  profile,
  onSaved,
  notify,
  setModal
}) {
  const [tab, setTab] = useState('classes'),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [logs, setLogs] = useState([]);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (tab === 'classes') await api.saveClass(form);else await api.manageUser(form);
      await onSaved();
      setForm(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <><div className="filter-bar"><div className="segments">{[['classes', 'Clases y locales'], ['users', 'Usuarios'], ['tools', 'Herramientas']].map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => {
          setTab(id);
          setForm(null);
        }}>{label}</button>)}</div>{tab === 'classes' && <button className="button primary" onClick={() => setForm(tab === 'classes' ? {
        name: '',
        kind: 'Clase',
        active: true
      } : {
        action: 'create',
        name: '',
        username: '',
        password: '',
        role: 'encargado'
      })}><Plus size={18} />{tab === 'classes' ? 'Agregar clase' : 'Crear usuario'}</button>}</div>{tab === 'classes' && <section className="panel admin-list">{data.classes.map(c => <div className="admin-row" key={c.id}><span className="class-icon"><Church size={21} /></span><div><strong>{c.name}</strong><small>{c.kind} · {data.people.filter(p => p.class_id === c.id && p.active).length} participantes{!c.active ? ' · Inactiva' : ''}</small></div><button className="button secondary small" onClick={() => setForm(c)}><Pencil size={15} /> Editar</button></div>)}</section>}{tab === 'users' && <UsersAdmin data={data} profile={profile} onSaved={onSaved}/>}{tab === 'tools' && <div className="admin-tools"><section className="panel tool-card"><Link2 size={27} /><h2>Revisar duplicados</h2><p>Une dos registros de la misma persona y conserva todas sus asistencias.</p><button className="button secondary" onClick={() => setModal({
          type: 'merge'
        })}>Fusionar participantes</button></section><section className="panel tool-card"><History size={27} /><h2>Historial de cambios</h2><p>Consulta las últimas modificaciones registradas por los usuarios.</p><button className="button secondary" onClick={async () => {
          try {
            setLogs(await api.auditLog());
            notify('Historial actualizado');
          } catch (e) {
            notify(e.message);
          }
        }}>Consultar cambios</button></section>{api.isDemo() && <section className="panel tool-card"><RefreshCw size={27} /><h2>Reiniciar la prueba</h2><p>Restaura los ejemplos de este navegador. No afecta una base de datos real.</p><button className="button secondary" onClick={() => setForm({
          action: 'reset'
        })}>Restaurar ejemplos</button></section>}{logs.length > 0 && <section className="panel audit-list">{logs.map(l => <div key={l.id}><strong>{l.action} · {l.table_name}</strong><small>{new Date(l.created_at).toLocaleString('es-CL')} · {data.profiles.find(p => p.id === l.actor)?.name || 'Usuario'}</small></div>)}</section>}</div>}
 {form && <Modal title={tab === 'classes' ? form.id ? 'Editar clase o local' : 'Agregar clase o local' : form.action === 'create' ? 'Crear usuario' : form.action === 'password' ? 'Restablecer contraseña' : form.action === 'reset' ? 'Restaurar datos de prueba' : 'Cambiar acceso'} onClose={busy ? () => {} : () => setForm(null)}><form onSubmit={form.action === 'reset' ? e => {
        e.preventDefault();
        api.resetDemo();
        onSaved('Ejemplos restaurados');
        setForm(null);
      } : submit}><div className="modal-body">{tab === 'classes' ? <><Field label="Nombre *"><input required maxLength={100} value={form.name} onChange={e => setForm({
                ...form,
                name: e.target.value
              })} /></Field><Field label="Tipo"><select value={form.kind} onChange={e => setForm({
                ...form,
                kind: e.target.value
              })}><option>Clase</option><option>Local</option><option>Templo matriz</option></select></Field><Field label="Estado"><select value={form.active ? 'yes' : 'no'} onChange={e => setForm({
                ...form,
                active: e.target.value === 'yes'
              })}><option value="yes">Activa</option><option value="no">Inactiva</option></select></Field></> : form.action === 'create' ? <><Field label="Nombre *"><input required maxLength={100} value={form.name} onChange={e => setForm({
                ...form,
                name: e.target.value
              })} /></Field><Field label="Usuario *"><input type="text" required value={form.username} onChange={e => setForm({
                ...form,
                username: e.target.value
              })} /></Field><Field label="Contraseña inicial *" hint="Al menos 12 caracteres. Compártela de forma privada."><input type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={e => setForm({
                ...form,
                password: e.target.value
              })} /></Field><Field label="Perfil"><select value={form.role} onChange={e => setForm({
                ...form,
                role: e.target.value
              })}><option value="encargado">Encargado</option><option value="admin">Administrador</option></select></Field></> : form.action === 'password' ? <><p>{form.name}</p><Field label="Nueva contraseña *"><input type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={e => setForm({
                ...form,
                password: e.target.value
              })} /></Field></> : form.action === 'reset' ? <p>Se reemplazarán los datos y fotografías que agregaste en esta prueba por los ejemplos iniciales.</p> : <p>{form.active ? 'Se habilitará' : 'Se deshabilitará'} el acceso de <b>{form.name}</b>. Sus cambios anteriores se conservarán.</p>}{error && <div role="alert" className="form-error">{error}</div>}</div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Cancelar</button><Button className="button primary" type="submit" busy={busy}>Confirmar</Button></div></form></Modal>}</>;
}
function MergeForm({
  data,
  onClose,
  onSaved
}) {
  const [source, setSource] = useState(''),
    [target, setTarget] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const options = data.people.filter(p => p.active).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return <Modal title="Fusionar participantes duplicados" subtitle="Verifica que sean la misma persona antes de continuar." onClose={busy ? () => {} : onClose}><form onSubmit={async e => {
      e.preventDefault();
      if (!confirmed) return;
      setBusy(true);
      try {
        await api.mergePeople(source, target);
        await onSaved();
        onClose();
      } catch (e) {
        setError(e.message);
        setBusy(false);
      }
    }}><div className="modal-body"><Field label="Registro duplicado que se desactivará"><select required value={source} onChange={e => {
            setSource(e.target.value);
            setConfirmed(false);
          }}><option value="">Seleccionar</option>{options.filter(p => p.id !== target).map(p => <option value={p.id} key={p.id}>{fullName(p)} · {data.classes.find(c => c.id === p.class_id)?.name}</option>)}</select></Field><Field label="Registro correcto que se conservará"><select required value={target} onChange={e => {
            setTarget(e.target.value);
            setConfirmed(false);
          }}><option value="">Seleccionar</option>{options.filter(p => p.id !== source).map(p => <option value={p.id} key={p.id}>{fullName(p)} · {data.classes.find(c => c.id === p.class_id)?.name}</option>)}</select></Field><p className="hint">Se trasladarán asistencias y responsabilidades. Si ambos aparecen en la misma visita, se contará una sola presencia. Los datos personales del registro correcto se mantienen.</p><label className="check-label"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Confirmo que ambos registros corresponden a la misma persona.</label>{error && <div className="form-error" role="alert">{error}</div>}</div><div className="modal-foot"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><Button className="button primary" busy={busy} disabled={!confirmed || !source || !target} type="submit">Fusionar registros</Button></div></form></Modal>;
}
class ErrorBoundary extends React.Component {
  state = {
    error: false
  };
  static getDerivedStateFromError() {
    return {
      error: true
    };
  }
  render() {
    return this.state.error ? <div className="startup"><h1>No pudimos abrir esta pantalla.</h1><p>Recarga para recuperar el acceso. Los cambios guardados se conservan.</p><button className="button primary" onClick={() => location.reload()}>Recargar</button></div> : this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
