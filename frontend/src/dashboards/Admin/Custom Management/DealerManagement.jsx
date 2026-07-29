import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useTheme } from '../../../context/ThemeContext';
import { getUsersApi, createUserApi, updateUserApi } from '../../../api/users';
import Icon from '../../../components/Icon';
import AddDealer from '../../shared/AdminCreateButton/AddDealer';

// ── SVG Icons ──────────────────────────────────────────────────────────────
const SvgIco = {
  search:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  cal:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  cols:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  plus:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  close:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  eye:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  suspend: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  check:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  sort:    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="12 5 12 19"/><polyline points="6 11 12 5 18 11" opacity="0.5"/><polyline points="6 13 12 19 18 13" opacity="0.5"/></svg>,
  globe:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  img:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  brand:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
};

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const getToken = () => {
  const keys = ['token', 'authToken', 'jwt', 'accessToken', 'auth_token', 'jwtToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v && JWT_PATTERN.test(v)) return v;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i));
    if (v && JWT_PATTERN.test(v)) return v;
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const v = sessionStorage.getItem(sessionStorage.key(i));
    if (v && JWT_PATTERN.test(v)) return v;
  }
  return null;
};

const StatusPill = ({ status }) => {
  const cfg = {
    Active:    { bg:'#e8f5e9', color:'#2e7d32', border:'#4caf50' },
    Inactive:  { bg:'#fff5f5', color:'#dc2626', border:'#fca5a5' },
    Suspended: { bg:'#fff8e1', color:'#b45309', border:'#fcd34d' },
  };
  const s = cfg[status] || cfg.Inactive;
  return (
    <span style={{ padding:'2px 10px', fontSize:11, fontWeight:600, background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:10, display:'inline-block', whiteSpace:'nowrap' }}>
      {status}
    </span>
  );
};

const SortIcon = ({ col, sortCol, sortDir }) => (
  <span style={{ marginLeft:4, opacity: sortCol===col ? 1 : 0.3, fontSize:10, verticalAlign:'middle' }}>
    {sortCol===col ? (sortDir==='asc'?'▲':'▼') : '⇅'}
  </span>
);

const months = [
  {value:'01',label:'January'},{value:'02',label:'February'},{value:'03',label:'March'},
  {value:'04',label:'April'},{value:'05',label:'May'},{value:'06',label:'June'},
  {value:'07',label:'July'},{value:'08',label:'August'},{value:'09',label:'September'},
  {value:'10',label:'October'},{value:'11',label:'November'},{value:'12',label:'December'},
];

const DealerManagement = () => {
  const { user }  = useAuth();
  const toast     = useToast();
  const theme     = useTheme();
  const activeColor = theme?.activeColor || '#1976d2';

  const [dealers,          setDealers]          = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [editingDealer,    setEditingDealer]    = useState(null);
  const [search,           setSearch]           = useState('');
  const [statusFilter,     setStatusFilter]     = useState('ALL');
  const [selectedMonth,    setSelectedMonth]    = useState('');
  const [selectedYear,     setSelectedYear]     = useState('');
  const [sortCol,          setSortCol]          = useState('user_id');
  const [sortDir,          setSortDir]          = useState('asc');
  const [page,             setPage]             = useState(1);
  const [rowsPerPage,      setRowsPerPage]      = useState(10);
  const [colMenuOpen,      setColMenuOpen]      = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const [visibleCols, setVisibleCols] = useState({
    sn:          true,
    owner:       true,
    username:    true,
    name:        true,
    phone:       true,
    vehicles:    true,
    created:     true,
    inactiveDate:true,
    email:       true,
    company:     true,
    companyName: true,
    domain:      true,
    logoUrl:     false,
    primaryColor:false,
    language:    true,
    timezone:    false,
    status:      true,
    password:    true,
    suspension:  true,
    address:     false,
  });

  const colLabel = {
    sn:'S.No', owner:'Admin', username:'Dealer', name:'Full Name', phone:'Phone No',
    vehicles:'Vehicles', created:'Created', inactiveDate:'Inactive Date',
    email:'Email', company:'Company', companyName:'Brand Name', domain:'Domain',
    logoUrl:'Logo', primaryColor:'Theme Color',
    language:'Language', timezone:'Timezone', status:'Status',
    password:'Password', suspension:'Suspension', address:'Address',
  };

  // ── Data Fetch with Tenant Branding Enrichment ─────────────────────────────
  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await getUsersApi({ limit:2000 });
      const all  = res.data.users || [];
      const mine = all.filter(u =>
        u.role === 'dealer' &&
        (Number(u.adminId) === Number(user.user_id) ||
         Number(u.createdBy) === Number(user.user_id))
      );

      // ── Enrich each dealer with Tenant DB branding ──────────────────────
      // This ensures companyName, domain, logoUrl, primaryColor show correctly
      // in the table even if the users API doesn't return them populated.
      const token = getToken();
      const enriched = await Promise.all(
        mine.map(async (d) => {
          // Skip fetch if no user_id or no token
          if (!d.user_id || !token) return d;
          try {
            const r = await fetch(`/api/tenant/by-owner/${d.user_id}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!r.ok) return d;
            const data = await r.json();
            if (data.success && data.tenant) {
              const t = data.tenant;
              return {
                ...d,
                // Tenant DB values take priority; fall back to existing dealer values
                companyName:    t.companyName    || d.companyName    || '',
                logoUrl:        t.logoUrl        || d.logoUrl        || '',
                primaryColor:   t.primaryColor   || d.primaryColor   || '',
                secondaryColor: t.secondaryColor || d.secondaryColor || '',
                domain:         t.domain         || d.domain         || '',
              };
            }
          } catch (_) {
            // Silent fail — show whatever the users API returned
          }
          return d;
        })
      );

      setDealers(enriched);
    } catch (err) {
      console.error('[DealerManagement] fetchDealers error:', err);
      toast.error('Failed to load dealers');
      setDealers([]);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchDealers(); }, [fetchDealers]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      if (editingDealer) {
        const upd = { ...formData };
        delete upd.confirmPassword;
        if (!upd.password) delete upd.password;
        ['superAdminId','adminId','parentId','createdBy','dealerId','role','ownerName']
          .forEach(k => delete upd[k]);
        await updateUserApi(editingDealer._id, upd);
        toast.success(`Dealer "${formData.username}" updated successfully`);
      } else {
        await createUserApi(formData);
        toast.success(`Dealer "${formData.username}" created`);
      }
      setModalOpen(false);
      setEditingDealer(null);
      fetchDealers();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = d => { setEditingDealer(d); setModalOpen(true); };

  const toggleStatus = async (d) => {
    if (d.status === 'Suspended') { toast.info('Please unsuspend the dealer first'); return; }
    const ns = d.status === 'Active' ? 'Inactive' : 'Active';
    setSaving(true);
    try {
      await updateUserApi(d._id, { status:ns, active:ns==='Active' });
      toast.success(`Status updated to ${ns}`);
      fetchDealers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update status'); }
    finally { setSaving(false); }
  };

  const toggleSuspension = async (d) => {
    setSaving(true);
    try {
      const willSuspend = !d.isSuspended;
      await updateUserApi(d._id, {
        isSuspended:    willSuspend,
        status:         willSuspend ? 'Suspended' : (d.active ? 'Active' : 'Inactive'),
        active:         willSuspend ? false : d.active,
        suspensionDate: willSuspend ? new Date() : null,
        suspendedBy:    willSuspend ? (user?.user_id||null) : null,
        suspendedReason:'',
      });
      toast.success(willSuspend ? 'Dealer suspended' : 'Dealer unsuspended');
      fetchDealers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const togglePwd  = id => setVisiblePasswords(p => ({ ...p, [id]: !p[id] }));
  const toggleCol  = k  => setVisibleCols(p => ({ ...p, [k]: !p[k] }));
  const handleSort = col => {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const clearFilters = () => { setStatusFilter('ALL'); setSelectedMonth(''); setSelectedYear(''); setSearch(''); setPage(1); };

  // ── Filter / Sort / Paginate ───────────────────────────────────────────────
  const fc = {
    ALL:      dealers.length,
    ACTIVE:   dealers.filter(d=>d.status==='Active').length,
    INACTIVE: dealers.filter(d=>d.status==='Inactive').length,
  };

  const filtered = dealers
    .filter(d => {
      if (statusFilter==='ACTIVE'   && d.status!=='Active')   return false;
      if (statusFilter==='INACTIVE' && d.status!=='Inactive') return false;
      return true;
    })
    .filter(d => {
      if (!selectedMonth && !selectedYear) return true;
      const dt=new Date(d.createdAt), mo=String(dt.getMonth()+1).padStart(2,'0'), yr=String(dt.getFullYear());
      if (selectedMonth && selectedYear) return mo===selectedMonth && yr===selectedYear;
      if (selectedMonth) return mo===selectedMonth;
      return yr===selectedYear;
    })
    .filter(d => {
      if (!search) return true;
      const q=search.toLowerCase();
      return ['username','fullName','ownerName','email','phone','company','companyName','domain','address']
        .some(k=>(d[k]||'').toLowerCase().includes(q));
    })
    .sort((a,b) => {
      const map = {username:'username', status:'status', vehicles:'maxVehicles', created:'createdAt'};
      const k   = map[sortCol] || 'username';
      const va  = a[k] ?? '';
      const vb  = b[k] ?? '';
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length/rowsPerPage));
  const paginated  = filtered.slice((page-1)*rowsPerPage, page*rowsPerPage);

  const thS = {
    padding:'9px 12px', textAlign:'center', fontSize:12, fontWeight:700,
    color:'#fff', cursor:'pointer', whiteSpace:'nowrap', userSelect:'none',
    background:activeColor, borderRight:'1px solid rgba(255,255,255,0.1)',
    position:'sticky', top:0, zIndex:2,
  };
  const tdS = {
    padding:'9px 12px', fontSize:12, textAlign:'center',
    borderBottom:'1px solid #edf0f4', verticalAlign:'middle',
    whiteSpace:'nowrap', color:'#1e293b',
  };

  return (
    <div style={{ padding:0, background:'#f8fafc', height:'100%', display:'flex', flexDirection:'column' }}>

      {/* Filter Bar */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 15px', background:'#fff', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap', justifyContent:'space-between' }}>

        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', flex:1 }}>

          {/* Search */}
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f1f5f9', border:'1px solid #e2e8f0', padding:'0 10px', height:36, minWidth:200, borderRadius:3 }}>
            {SvgIco.search}
            <input placeholder="Search dealers..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:'#1e293b', width:'100%' }} />
          </div>

          {/* Status radios */}
          <div style={{ display:'flex', alignItems:'center', gap:14, padding:'0 12px', borderLeft:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0', height:36 }}>
            {[{key:'ALL',label:`All (${fc.ALL})`,color:'#1976d2'},{key:'ACTIVE',label:`Active (${fc.ACTIVE})`,color:'#2e7d32'},{key:'INACTIVE',label:`Inactive (${fc.INACTIVE})`,color:'#c62828'}]
              .map(({key,label,color})=>(
              <label key={key} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:13 }}>
                <input type="radio" name="dealerStatus" checked={statusFilter===key} onChange={()=>{setStatusFilter(key);setPage(1);}} style={{ accentColor:color, width:14, height:14 }} />
                <span style={{ color:statusFilter===key?color:'#64748b' }}>{label}</span>
              </label>
            ))}
          </div>

          {/* Month */}
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:'1px solid #e2e8f0', padding:'0 8px', height:36, minWidth:120, borderRadius:3 }}>
            {SvgIco.cal}
            <select value={selectedMonth} onChange={e=>{setSelectedMonth(e.target.value);setPage(1);}}
              style={{ border:'none', outline:'none', fontSize:13, color:'#1e293b', background:'transparent', width:'100%', cursor:'pointer' }}>
              <option value="">Month</option>
              {months.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Year */}
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:'1px solid #e2e8f0', padding:'0 8px', height:36, minWidth:100, borderRadius:3 }}>
            {SvgIco.cal}
            <select value={selectedYear} onChange={e=>{setSelectedYear(e.target.value);setPage(1);}}
              style={{ border:'none', outline:'none', fontSize:13, color:'#1e293b', background:'transparent', width:'100%', cursor:'pointer' }}>
              <option value="">Year</option>
              {Array.from({length:101},(_,i)=>new Date().getFullYear()-50+i).map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {(statusFilter!=='ALL'||selectedMonth||selectedYear||search) && (
            <button onClick={clearFilters}
              style={{ padding:'0 12px', background:'transparent', border:'1px solid #c62828', fontSize:12, color:'#c62828', cursor:'pointer', display:'flex', alignItems:'center', gap:4, height:36, borderRadius:3 }}>
              {SvgIco.close} Clear
            </button>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:13, color:'#64748b' }}>Show</span>
            <select value={rowsPerPage} onChange={e=>{setRowsPerPage(Number(e.target.value));setPage(1);}}
              style={{ height:36, padding:'0 8px', background:'#fff', border:'1px solid #e2e8f0', color:'#1e293b', fontSize:13, cursor:'pointer', outline:'none', minWidth:70, borderRadius:3 }}>
              {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Columns toggle */}
          <div style={{ position:'relative' }}>
            <button onClick={()=>setColMenuOpen(!colMenuOpen)}
              style={{ padding:'0 12px', background:'#fff', border:'1px solid #e2e8f0', fontSize:13, color:'#334155', cursor:'pointer', display:'flex', alignItems:'center', gap:6, height:36, borderRadius:3 }}>
              {SvgIco.cols} Columns ▾
            </button>
            {colMenuOpen && (
              <div style={{ position:'absolute', top:'100%', right:0, marginTop:4, background:'#fff', border:'1px solid #e2e8f0', zIndex:200, minWidth:200, padding:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', maxHeight:320, overflowY:'auto', borderRadius:4 }}>
                {Object.keys(visibleCols).map(k=>(
                  <label key={k} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', cursor:'pointer', fontSize:13, color:'#334155' }}>
                    <input type="checkbox" checked={visibleCols[k]} onChange={()=>toggleCol(k)} style={{ accentColor:activeColor }} />
                    {colLabel[k]||k}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={()=>{setEditingDealer(null);setModalOpen(true);}}
            style={{ padding:'0 16px', background:activeColor, border:'none', fontSize:13, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, height:36, borderRadius:3, fontWeight:600 }}>
            {SvgIco.plus} Add Dealer
          </button>
        </div>
      </div>

      {/* Active filters pill */}
      {(statusFilter!=='ALL'||selectedMonth||selectedYear) && (
        <div style={{ padding:'6px 15px', background:'#e3f2fd', borderBottom:'1px solid #90caf9', fontSize:12, color:'#1976d2', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span><strong>Filters:</strong></span>
          {statusFilter!=='ALL' && <span style={{ background:'#bbdefb', padding:'2px 10px', borderRadius:12 }}>{statusFilter}</span>}
          {selectedMonth && <span style={{ background:'#bbdefb', padding:'2px 10px', borderRadius:12 }}>{months.find(m=>m.value===selectedMonth)?.label}</span>}
          {selectedYear  && <span style={{ background:'#bbdefb', padding:'2px 10px', borderRadius:12 }}>{selectedYear}</span>}
          <span style={{ marginLeft:'auto' }}><strong>{filtered.length}</strong> records found</span>
        </div>
      )}

      {/* Table */}
      <div style={{ border:'1px solid #e2e8f0', borderTop:'none', overflowX:'auto', background:'#fff', width:'100%', flex:1 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto' }}>
          <thead>
            <tr>
              {visibleCols.sn          && <th style={thS}>#</th>}
              {visibleCols.owner       && <th style={thS}>Admin</th>}
              {visibleCols.username    && <th style={thS} onClick={()=>handleSort('username')}>Dealer <SortIcon col="username" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.name        && <th style={thS}>Full Name</th>}
              {visibleCols.phone       && <th style={thS}>Phone</th>}
              {visibleCols.vehicles    && <th style={thS} onClick={()=>handleSort('vehicles')}>Vehicles <SortIcon col="vehicles" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.created     && <th style={thS} onClick={()=>handleSort('created')}>Created <SortIcon col="created" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.inactiveDate&& <th style={thS}>Inactive Date</th>}
              {visibleCols.email       && <th style={thS}>Email</th>}
              {visibleCols.company     && <th style={thS}>Company</th>}
              {visibleCols.companyName && <th style={thS}>Brand Name</th>}
              {visibleCols.domain      && <th style={thS}>Domain</th>}
              {visibleCols.logoUrl     && <th style={thS}>Logo</th>}
              {visibleCols.primaryColor&& <th style={thS}>Theme</th>}
              {visibleCols.language    && <th style={thS}>Language</th>}
              {visibleCols.timezone    && <th style={thS}>Timezone</th>}
              {visibleCols.status      && <th style={thS} onClick={()=>handleSort('status')}>Status <SortIcon col="status" sortCol={sortCol} sortDir={sortDir}/></th>}
              {visibleCols.password    && <th style={thS}>Password</th>}
              {visibleCols.suspension  && <th style={thS}>Suspension</th>}
              {visibleCols.address     && <th style={thS}>Address</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="20" style={{ padding:40, textAlign:'center' }}>
                <div style={{ display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
              </td></tr>
            ) : paginated.length===0 ? (
              <tr><td colSpan="20" style={{ padding:40, textAlign:'center', color:'#64748b', fontSize:13 }}>No dealer accounts found</td></tr>
            ) : paginated.map((d,i) => {
              const isSus = d.status==='Suspended';
              return (
                <tr key={d._id}
                  style={{ background:isSus?'#fff8f0':'#fff', transition:'background 0.15s', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background=isSus?'#ffe8d6':'#f8fafc'}
                  onMouseLeave={e=>e.currentTarget.style.background=isSus?'#fff8f0':'#fff'}
                  onClick={()=>handleEditClick(d)}
                >
                  {visibleCols.sn       && <td style={tdS}>{(page-1)*rowsPerPage+i+1}</td>}
                  {visibleCols.owner    && <td style={tdS}>{d.ownerName||'—'}</td>}

                  {visibleCols.username && (
                    <td style={{ ...tdS, fontWeight:600, color:activeColor, cursor:'pointer' }}
                      onClick={e=>{e.stopPropagation();handleEditClick(d);}}>
                      {d.username}
                    </td>
                  )}

                  {visibleCols.name       && <td style={tdS}>{d.fullName||d.name||'—'}</td>}
                  {visibleCols.phone      && <td style={tdS}>{d.phone||'—'}</td>}

                  {visibleCols.vehicles && (
                    <td style={tdS}>
                      <span style={{ background:(d.maxVehicles??d.maxVehicleCount??0)>0?'#e3f2fd':'#f1f5f9', padding:'3px 10px', fontWeight:600, borderRadius:3, color:(d.maxVehicles??d.maxVehicleCount??0)>0?activeColor:'#64748b' }}>
                        {d.maxVehicles??d.maxVehicleCount??0}
                      </span>
                    </td>
                  )}

                  {visibleCols.created && (
                    <td style={tdS}>
                      {d.createdAt?new Date(d.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}):'—'}
                    </td>
                  )}

                  {visibleCols.inactiveDate && (
                    <td style={tdS}>
                      {d.inactiveDate?new Date(d.inactiveDate).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}):'—'}
                    </td>
                  )}

                  {visibleCols.email    && <td style={tdS}>{d.email||'—'}</td>}
                  {visibleCols.company  && <td style={tdS}>{d.company||'—'}</td>}

                  {/* ── Brand Name — from Branding tab companyName field ── */}
                  {visibleCols.companyName && (
                    <td style={tdS}>
                      {d.companyName
                        ? (
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:5,
                            background:'#f5f3ff', color:'#6d28d9',
                            padding:'3px 10px', borderRadius:4,
                            fontSize:11, fontWeight:600,
                            border:'1px solid #ddd6fe',
                            maxWidth:160, overflow:'hidden',
                            textOverflow:'ellipsis', whiteSpace:'nowrap',
                          }}>
                            {SvgIco.brand}
                            {d.companyName}
                          </span>
                        )
                        : <span style={{ color:'#94a3b8', fontSize:11 }}>—</span>
                      }
                    </td>
                  )}

                  {/* Domain */}
                  {visibleCols.domain && (
                    <td style={tdS} onClick={e=>e.stopPropagation()}>
                      {d.domain
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#f0f9ff', color:'#0369a1', padding:'3px 8px', borderRadius:4, fontSize:11, fontWeight:600, border:'1px solid #bae6fd' }}>
                            {SvgIco.globe} {d.domain}
                          </span>
                        : <span style={{ color:'#94a3b8', fontSize:11 }}>—</span>}
                    </td>
                  )}

                  {/* Logo */}
                  {visibleCols.logoUrl && (
                    <td style={tdS} onClick={e=>e.stopPropagation()}>
                      {d.logoUrl
                        ? <img src={d.logoUrl} alt="logo" style={{ height:28, width:'auto', maxWidth:80, objectFit:'contain', borderRadius:2, border:'1px solid #e5e7eb' }} />
                        : <span style={{ color:'#94a3b8', fontSize:11 }}>—</span>}
                    </td>
                  )}

                  {/* Theme Color */}
                  {visibleCols.primaryColor && (
                    <td style={tdS} onClick={e=>e.stopPropagation()}>
                      {d.primaryColor
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                            <span style={{ width:16, height:16, borderRadius:3, background:d.primaryColor, border:'1px solid #e5e7eb', display:'inline-block' }}/>
                            <span style={{ fontSize:10, fontFamily:'monospace', color:'#64748b' }}>{d.primaryColor}</span>
                          </span>
                        : '—'}
                    </td>
                  )}

                  {visibleCols.language && <td style={tdS}>{d.language||'English'}</td>}
                  {visibleCols.timezone && <td style={tdS}>{d.timezone||'Asia/Calcutta'}</td>}

                  {/* Status */}
                  {visibleCols.status && (
                    <td style={tdS} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>toggleStatus(d)}
                        style={{ background:'none', border:'none', cursor:isSus?'not-allowed':'pointer', padding:0 }}
                        disabled={isSus}>
                        <StatusPill status={d.status}/>
                      </button>
                    </td>
                  )}

                  {/* Password */}
                  {visibleCols.password && (
                    <td style={tdS} onClick={e=>e.stopPropagation()}>
                      {visiblePasswords[d._id]
                        ? <span onClick={()=>togglePwd(d._id)} style={{ fontFamily:'monospace', fontSize:12, padding:'3px 10px', background:'#f1f5f9', color:'#1e293b', border:'1px solid #e2e8f0', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, borderRadius:3 }}>
                            {SvgIco.eyeOff} {d.password||'—'}
                          </span>
                        : <button onClick={()=>togglePwd(d._id)}
                            style={{ background:'#166534', border:'none', padding:'4px 12px', fontSize:12, fontWeight:500, color:'white', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, borderRadius:3 }}>
                            {SvgIco.eye} Show
                          </button>}
                    </td>
                  )}

                  {/* Suspension */}
                  {visibleCols.suspension && (
                    <td style={tdS} onClick={e=>e.stopPropagation()}>
                      {d.isSuspended
                        ? <button onClick={()=>toggleSuspension(d)}
                            style={{ background:'#991b1b', border:'none', padding:'4px 12px', fontSize:12, fontWeight:500, color:'white', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, borderRadius:3 }}>
                            {SvgIco.check} Unsuspend
                          </button>
                        : <button onClick={()=>toggleSuspension(d)}
                            style={{ background:'#78350f', border:'none', padding:'4px 12px', fontSize:12, fontWeight:500, color:'white', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, borderRadius:3 }}>
                            {SvgIco.suspend} Suspend
                          </button>}
                    </td>
                  )}

                  {visibleCols.address && <td style={tdS}>{d.address||'—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'10px 16px', background:'#fff', borderTop:'1px solid #e2e8f0', fontSize:13, flexShrink:0 }}>
        <span style={{ color:'#64748b', marginRight:15 }}>
          Showing <strong style={{ color:'#1e293b' }}>{filtered.length===0?0:(page-1)*rowsPerPage+1}–{Math.min(page*rowsPerPage,filtered.length)}</strong> of <strong style={{ color:'#1e293b' }}>{filtered.length}</strong>
        </span>
        <div style={{ display:'flex', gap:3 }}>
          {[{label:'«',action:()=>setPage(1),disabled:page===1},{label:'‹',action:()=>setPage(p=>Math.max(1,p-1)),disabled:page===1}]
            .map((btn,i)=>(
            <button key={i} onClick={btn.action} disabled={btn.disabled}
              style={{ padding:'5px 10px', border:'1px solid #e2e8f0', background:btn.disabled?'#f5f5f5':'#fff', cursor:btn.disabled?'not-allowed':'pointer', color:btn.disabled?'#bdc3c7':'#1e293b', borderRadius:3 }}>
              {btn.label}
            </button>
          ))}
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
            const p=totalPages<=5?i+1:page<=3?i+1:page>=totalPages-2?totalPages-4+i:page-2+i;
            return (
              <button key={p} onClick={()=>setPage(p)}
                style={{ padding:'5px 10px', border:'1px solid #e2e8f0', background:p===page?activeColor:'#fff', color:p===page?'#fff':'#1e293b', cursor:'pointer', fontWeight:p===page?600:400, borderRadius:3 }}>
                {p}
              </button>
            );
          })}
          {[{label:'›',action:()=>setPage(p=>Math.min(totalPages,p+1)),disabled:page===totalPages},{label:'»',action:()=>setPage(totalPages),disabled:page===totalPages}]
            .map((btn,i)=>(
            <button key={i} onClick={btn.action} disabled={btn.disabled}
              style={{ padding:'5px 10px', border:'1px solid #e2e8f0', background:btn.disabled?'#f5f5f5':'#fff', cursor:btn.disabled?'not-allowed':'pointer', color:btn.disabled?'#bdc3c7':'#1e293b', borderRadius:3 }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Modal */}
      <AddDealer
        open={modalOpen}
        onClose={()=>{setModalOpen(false);setEditingDealer(null);}}
        onSubmit={handleSubmit}
        editDealer={editingDealer}
        currentUser={user}
        loading={saving}
      />
    </div>
  );
};

export default DealerManagement;