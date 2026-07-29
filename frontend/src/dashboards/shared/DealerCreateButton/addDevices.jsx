import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getProtocolMasterApi,
  getClientsApi,
} from '../../../api/devices';
import { useTheme } from '../../../context/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
const ClientDropdown = ({ clients, value, onChange, loadingData, clientError, ACCENT }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 0 });
  const triggerRef          = useRef(null);
  const wrapRef             = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const toggle = () => {
    if (!isOpen && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
    setIsOpen(v => !v);
  };

  const pick = (v) => {
    const clientObj = clients.find(c => c.value === v) || null;
    onChange(v, clientObj);
    setIsOpen(false);
  };

  const triggerStyle = {
    width: '100%', height: 36, padding: '0 10px', background: '#fff',
    border: `1px solid ${(clientError && clients.length === 0) ? '#ef4444' : isOpen ? ACCENT : '#d0d7de'}`,
    borderRadius: 3, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', userSelect: 'none',
    boxShadow: isOpen ? `0 0 0 2px rgba(61,43,107,0.12)` : 'none',
    fontFamily: 'inherit',
  };

  return (
    <div ref={wrapRef}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
        Client <span style={{ color: '#ef4444' }}>*</span>
      </label>
      {loadingData ? (
        <div style={{ ...triggerStyle, cursor: 'default', color: '#9ca3af', fontSize: 13 }}>
          Loading from User_Master…
        </div>
      ) : (
        <>
          <div ref={triggerRef} style={triggerStyle} onClick={toggle}>
            <span style={{
              fontSize: 13, color: value ? '#1a1f2e' : '#9ca3af',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {value || (clients.length === 0 ? '— No clients available —' : 'Select Client')}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {isOpen && clients.length > 0 && (
            <div style={{
              position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
              zIndex: 99999, background: '#fff',
              border: `1px solid ${ACCENT}`, borderRadius: 3,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              maxHeight: 200, overflowY: 'auto',
            }}>
              <div
                onClick={() => { onChange('', null); setIsOpen(false); }}
                style={{ padding: '8px 12px', fontSize: 13, color: '#9ca3af', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                Select Client
              </div>
              {clients.map(c => (
                <div key={c.user_id ?? c.value} onClick={() => pick(c.value)}
                  style={{
                    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    borderBottom: '1px solid #f8f9fa',
                    background: c.value === value ? '#f0f4ff' : '#fff',
                    color:      c.value === value ? ACCENT   : '#1a1f2e',
                    fontWeight: c.value === value ? 600      : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                  onMouseEnter={e => { if (c.value !== value) e.currentTarget.style.background = '#f8f9fa'; }}
                  onMouseLeave={e => { if (c.value !== value) e.currentTarget.style.background = '#fff'; }}>
                  <span>{c.value}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 3, marginLeft: 8,
                    background: c.active !== false ? '#e8f5e9' : '#fff5f5',
                    color:      c.active !== false ? '#2e7d32' : '#dc2626',
                    border:     `1px solid ${c.active !== false ? '#4caf50' : '#fca5a5'}`,
                  }}>
                    {c.status || (c.active !== false ? 'Active' : 'Inactive')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE SELECT — custom dropdown
// ─────────────────────────────────────────────────────────────────────────────
const LiveSelect = ({ label, req, value, onChange, options, emptyMsg, loadingData, ACCENT }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 0 });
  const triggerRef          = useRef(null);
  const wrapRef             = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const toggle = () => {
    if (!isOpen && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
    setIsOpen(v => !v);
  };

  const pick = (v) => { onChange(v); setIsOpen(false); };

  const triggerStyle = {
    width: '100%', height: 36, padding: '0 10px', background: '#fff',
    border: `1px solid ${isOpen ? ACCENT : '#d0d7de'}`,
    borderRadius: 3, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', userSelect: 'none',
    boxShadow: isOpen ? `0 0 0 2px rgba(61,43,107,0.12)` : 'none',
    fontFamily: 'inherit',
  };

  return (
    <div ref={wrapRef}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
        {label}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {loadingData ? (
        <div style={{ ...triggerStyle, cursor: 'default', color: '#9ca3af', fontSize: 13 }}>
          Loading from database…
        </div>
      ) : (
        <>
          <div ref={triggerRef} style={triggerStyle} onClick={toggle}>
            <span style={{
              fontSize: 13, color: value ? '#1a1f2e' : '#9ca3af',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {value || `Select ${label}`}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {isOpen && (
            <div style={{
              position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
              zIndex: 99999, background: '#fff',
              border: `1px solid ${ACCENT}`, borderRadius: 3,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              maxHeight: 200, overflowY: 'auto',
            }}>
              <div onClick={() => pick('')}
                style={{ padding: '8px 12px', fontSize: 13, color: '#9ca3af', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                Select {label}
              </div>
              {options.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: 12, color: '#ef4444' }}>{emptyMsg}</div>
              ) : (
                options.map(o => (
                  <div key={o} onClick={() => pick(o)}
                    style={{
                      padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                      borderBottom: '1px solid #f8f9fa',
                      background: o === value ? '#f0f4ff' : '#fff',
                      color:      o === value ? ACCENT   : '#1a1f2e',
                      fontWeight: o === value ? 600      : 400,
                    }}
                    onMouseEnter={e => { if (o !== value) e.currentTarget.style.background = '#f8f9fa'; }}
                    onMouseLeave={e => { if (o !== value) e.currentTarget.style.background = '#fff'; }}>
                    {o}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SENSOR CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const SENSOR_TYPES = [
  'Fuel Sensor', 'Temperature Sensor', 'Door Sensor', 'Ignition Sensor',
  'AC Sensor', 'RPM Sensor', 'Driver Behaviour', 'Panic Button',
  'Analog Input', 'Digital Input', 'Voltage Sensor', 'GPS Antenna',
  'Custom Sensor',
];

const CONNECTED_TO_OPTIONS = [
  'ADC1', 'ADC2', 'ADC3', 'ADC4',
  'DIN1', 'DIN2', 'DIN3', 'DIN4',
  'DOUT1', 'DOUT2',
  'RS232', 'RS485',
  'CAN Bus', 'OneWire',
];

const SENSOR_TYPE_OPTIONS = ['Analog', 'Digital', 'Text', 'Custom'];

const EMPTY_SENSOR = {
  name:              '',
  sensorType:        '',
  connectedTo:       '',
  formula:           '',
  value:             '',
  inverse:           false,
  rs232:             false,
  showOnDashboard:   false,
  type:              '',
  unitOfMeasurement: '',
  ifSensor1Text:     '',
  ifSensor0Text:     '',
  calibrationRows:   [],
};

// ─────────────────────────────────────────────────────────────────────────────
// SENSOR SELECT
// ─────────────────────────────────────────────────────────────────────────────
const SensorSelect = ({ label, req, value, onChange, options, ACCENT }) => {
  const sel = {
    width: '100%', height: 36, padding: '0 28px 0 10px',
    border: '1px solid #d0d7de', borderRadius: 3, background: '#fff',
    fontSize: 13, color: value ? '#1a1f2e' : '#9ca3af',
    appearance: 'none', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16,
  };
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
        {label}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      <select style={sel} value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 2px rgba(61,43,107,0.12)`; }}
        onBlur={e  => { e.target.style.borderColor = '#d0d7de'; e.target.style.boxShadow = 'none'; }}>
        <option value="">Select {label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SENSOR TAB
// ─────────────────────────────────────────────────────────────────────────────
const SensorTab = ({
  deviceId,
  existingSensors,
  onSensorsChange,
  ACCENT,
  HEADER_BG,
  isNewDevice = false,
}) => {
  const [sensors,     setSensors]     = useState([]);
  const [showForm,    setShowForm]    = useState(false);
  const [editingIdx,  setEditingIdx]  = useState(null);
  const [sensorForm,  setSensorForm]  = useState({ ...EMPTY_SENSOR });
  const [calibRows,   setCalibRows]   = useState([]);
  const [sensorError, setSensorError] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');
  const calibUploadRef = useRef(null);

  useEffect(() => {
    setSensors(Array.isArray(existingSensors) ? existingSensors : []);
    setShowForm(false);
    setEditingIdx(null);
    setSensorForm({ ...EMPTY_SENSOR });
    setCalibRows([]);
    setSensorError('');
    setSearch('');
  }, [existingSensors, deviceId]);

  const inp = {
    width: '100%', height: 36, padding: '0 10px',
    background: '#fff', border: '1px solid #d0d7de', borderRadius: 3,
    fontSize: 13, color: '#1a1f2e', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const sFocus = e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 2px rgba(61,43,107,0.12)`; };
  const sBlur  = e => { e.target.style.borderColor = '#d0d7de'; e.target.style.boxShadow = 'none'; };

  const SLabel = ({ text, req }) => (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
      {text}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  );

  const SCb = ({ id, label, checked, onChange }) => (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', userSelect: 'none' }}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
      {label}
    </label>
  );

  const ss = (k, v) => setSensorForm(f => ({ ...f, [k]: v }));

  const openAddForm = () => {
    setSensorForm({ ...EMPTY_SENSOR, calibrationRows: [] });
    setCalibRows([]);
    setEditingIdx(null);
    setSensorError('');
    setShowForm(true);
  };

  const openEditForm = (idx, e) => {
    e.stopPropagation();
    const s = sensors[idx];
    setSensorForm({ ...s });
    setCalibRows(Array.isArray(s.calibrationRows) ? s.calibrationRows.map(r => ({ ...r })) : []);
    setEditingIdx(idx);
    setSensorError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingIdx(null);
    setSensorError('');
    setSensorForm({ ...EMPTY_SENSOR, calibrationRows: [] });
    setCalibRows([]);
  };

  const nextSensorId = () => {
    if (sensors.length === 0) return '1';
    const max = Math.max(...sensors.map(s => parseInt(s.sensor_id) || 0));
    return String(max + 1);
  };

  const addCalibRow    = () => setCalibRows(r => [...r, { raw: '', calibrated: '' }]);
  const updateCalibRow = (i, field, val) =>
    setCalibRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const deleteCalibRow = (i) =>
    setCalibRows(rows => rows.filter((_, idx) => idx !== i));
  const loadDemoCalib  = () => setCalibRows([
    { raw: '0',    calibrated: '0'   },
    { raw: '100',  calibrated: '10'  },
    { raw: '500',  calibrated: '50'  },
    { raw: '1000', calibrated: '100' },
  ]);

  const handleCalibUpload = async (file) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const parsed = rows.map(r => ({
        raw:        String(r.raw        || r.Raw        || r.sensor  || r.input  || '').trim(),
        calibrated: String(r.calibrated || r.Calibrated || r.value   || r.output || '').trim(),
      })).filter(r => r.raw || r.calibrated);
      if (parsed.length > 0) setCalibRows(parsed);
    } catch { /* silent */ }
    if (calibUploadRef.current) calibUploadRef.current.value = '';
  };

  const handleSensorSave = async () => {
    setSensorError('');
    if (!sensorForm.name.trim()) return setSensorError('Name is required');
    if (!sensorForm.sensorType)  return setSensorError('Sensor Type is required');
    if (!sensorForm.connectedTo) return setSensorError('Connected To is required');
    if (!sensorForm.type)        return setSensorError('Type is required');

    setSaving(true);
    try {
      const sensorData = { ...sensorForm, calibrationRows: calibRows };
      let updatedSensors;

      if (editingIdx !== null) {
        updatedSensors = sensors.map((s, i) =>
          i === editingIdx ? { ...sensorData, sensor_id: s.sensor_id } : s
        );
      } else {
        updatedSensors = [...sensors, { ...sensorData, sensor_id: nextSensorId() }];
      }

      if (!isNewDevice && deviceId) {
        const { updateDeviceSensorsApi } = await import('../../../api/devices');
        await updateDeviceSensorsApi(deviceId, updatedSensors);
      }

      setSensors(updatedSensors);
      onSensorsChange(updatedSensors);
      closeForm();
    } catch (err) {
      setSensorError(err?.response?.data?.message || 'Failed to save sensor');
    } finally {
      setSaving(false);
    }
  };

  const handleSensorDelete = async (idx, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this sensor?')) return;
    const updatedSensors = sensors.filter((_, i) => i !== idx);

    if (!isNewDevice && deviceId) {
      try {
        const { updateDeviceSensorsApi } = await import('../../../api/devices');
        await updateDeviceSensorsApi(deviceId, updatedSensors);
      } catch { /* silent */ }
    }

    setSensors(updatedSensors);
    onSensorsChange(updatedSensors);
  };

  const filtered = sensors.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.name        || '').toLowerCase().includes(q) ||
           (s.sensorType  || '').toLowerCase().includes(q) ||
           (s.connectedTo || '').toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#f8fafc', border: '1px solid #e2e8f0',
          padding: '0 10px', height: 34, borderRadius: 3, minWidth: 220,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Search sensors…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#1e293b', width: '100%' }} />
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={openAddForm}
          style={{
            height: 34, padding: '0 18px', background: HEADER_BG, color: '#fff',
            border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          ADD
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: HEADER_BG }}>
              {['#', 'Sensor Type', 'Connected To', 'Name', 'Type', 'Inverse', 'RS232', 'Dashboard', 'Delete'].map(h => (
                <th key={h} style={{
                  padding: '10px 14px',
                  textAlign: h === '#' ? 'center' : 'left',
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  {sensors.length === 0
                    ? 'No sensors added yet. Click "+ Add" to add the first sensor.'
                    : 'No sensors match your search.'}
                </td>
              </tr>
            ) : filtered.map((s, i) => {
              const realIdx = sensors.indexOf(s);
              return (
                <tr key={s.sensor_id || i}
                  style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc'}
                  onClick={e => openEditForm(realIdx, e)}>
                  <td style={{ padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#6b7280', fontSize: 12 }}>
                    {s.sensor_id}
                  </td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontWeight: 500 }}>{s.sensorType || '—'}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9' }}>{s.connectedTo || '—'}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9', color: '#1976d2', fontWeight: 500 }}>{s.name || '—'}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    {s.type
                      ? <span style={{ padding: '2px 8px', background: '#ede9fe', color: '#5b21b6', borderRadius: 3, fontSize: 11, fontWeight: 500 }}>{s.type}</span>
                      : '—'}
                  </td>
                  {['inverse', 'rs232', 'showOnDashboard'].map(flag => (
                    <td key={flag} style={{ padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{
                        display: 'inline-block', width: 20, height: 20, lineHeight: '20px',
                        textAlign: 'center', borderRadius: 3, fontSize: 11, fontWeight: 700,
                        background: s[flag] ? '#dbeafe' : '#f1f5f9',
                        color:      s[flag] ? '#1976d2' : '#94a3b8',
                      }}>
                        {s[flag] ? 'Y' : 'N'}
                      </span>
                    </td>
                  ))}
                  <td style={{ padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}
                    onClick={e => handleSensorDelete(realIdx, e)}>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', borderRadius: 3, display: 'inline-flex' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        Showing {filtered.length} of {sensors.length} sensor{sensors.length !== 1 ? 's' : ''}
        {isNewDevice && sensors.length > 0 && (
          <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 500 }}>
            ⚠ Sensors will be saved when you save the device
          </span>
        )}
      </div>

      {/* Add / Edit Sensor Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            width: '92vw', maxWidth: 900, background: '#fff', borderRadius: 4,
            overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', maxHeight: '90vh',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 20px', height: 48, background: HEADER_BG, flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                {editingIdx !== null ? 'Edit Sensor' : 'Add Sensor'}
              </span>
              <button type="button" onClick={closeForm}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Left — form fields */}
              <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', borderRight: '1px solid #e2e8f0' }}>
                {sensorError && (
                  <div style={{
                    padding: '8px 12px', marginBottom: 14,
                    background: '#fff5f5', border: '1px solid #fca5a5',
                    borderLeft: '3px solid #ef4444', borderRadius: 3,
                    fontSize: 12, color: '#dc2626',
                  }}>
                    {sensorError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                  <div>
                    <SLabel text="Name" req />
                    <input style={inp} value={sensorForm.name} placeholder="Enter Name"
                      onChange={e => ss('name', e.target.value)} onFocus={sFocus} onBlur={sBlur} />
                  </div>
                  <SensorSelect label="Sensor Types" req value={sensorForm.sensorType}
                    onChange={v => ss('sensorType', v)} options={SENSOR_TYPES} ACCENT={ACCENT} />
                  <SensorSelect label="Connected To" req value={sensorForm.connectedTo}
                    onChange={v => ss('connectedTo', v)} options={CONNECTED_TO_OPTIONS} ACCENT={ACCENT} />
                  <div>
                    <SLabel text="Formula" />
                    <input style={inp} value={sensorForm.formula} placeholder="x/100"
                      onChange={e => ss('formula', e.target.value)} onFocus={sFocus} onBlur={sBlur} />
                  </div>
                  <div>
                    <SLabel text="Value" />
                    <input style={inp} value={sensorForm.value} placeholder="Value"
                      onChange={e => ss('value', e.target.value)} onFocus={sFocus} onBlur={sBlur} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                    <SCb id="s-inverse"   label="Inverse"           checked={sensorForm.inverse}         onChange={v => ss('inverse', v)} />
                    <SCb id="s-rs232"     label="RS232"             checked={sensorForm.rs232}           onChange={v => ss('rs232', v)} />
                    <SCb id="s-dashboard" label="Show On Dashboard" checked={sensorForm.showOnDashboard} onChange={v => ss('showOnDashboard', v)} />
                  </div>
                  <SensorSelect label="Type" req value={sensorForm.type}
                    onChange={v => ss('type', v)} options={SENSOR_TYPE_OPTIONS} ACCENT={ACCENT} />
                  <div>
                    <SLabel text="Unit Of Measurement" />
                    <input style={inp} value={sensorForm.unitOfMeasurement} placeholder="Unit Of Measurement"
                      onChange={e => ss('unitOfMeasurement', e.target.value)} onFocus={sFocus} onBlur={sBlur} />
                  </div>
                  <div>
                    <SLabel text="If sensor 1 (text)" />
                    <input style={inp} value={sensorForm.ifSensor1Text} placeholder="If sensor 1 (text)"
                      onChange={e => ss('ifSensor1Text', e.target.value)} onFocus={sFocus} onBlur={sBlur} />
                  </div>
                  <div>
                    <SLabel text="If sensor 0 (text)" />
                    <input style={inp} value={sensorForm.ifSensor0Text} placeholder="If sensor 0 (text)"
                      onChange={e => ss('ifSensor0Text', e.target.value)} onFocus={sFocus} onBlur={sBlur} />
                  </div>
                </div>
              </div>

              {/* Right — Calibration Values */}
              <div style={{
                width: 360, padding: '24px 20px', background: '#f8fafc',
                overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 14, textAlign: 'center' }}>
                  Calibration Values
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <button type="button" onClick={addCalibRow}
                    style={{ flex: 1, minWidth: 130, height: 34, background: HEADER_BG, color: '#fff', border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    + ADD CALIBRATED ROW
                  </button>
                  <button type="button" onClick={loadDemoCalib}
                    style={{ height: 34, padding: '0 14px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Demo
                  </button>
                  <input ref={calibUploadRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                    onChange={e => { handleCalibUpload(e.target.files[0]); }} />
                  <button type="button" onClick={() => calibUploadRef.current?.click()}
                    style={{ height: 34, padding: '0 14px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Upload
                  </button>
                </div>

                {calibRows.length > 0 ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Raw (Sensor)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Calibrated</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e2e8f0', width: 36 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {calibRows.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                              <input value={row.raw} onChange={e => updateCalibRow(i, 'raw', e.target.value)}
                                placeholder="0"
                                style={{ width: '100%', height: 28, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 3, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                                onFocus={e => e.target.style.borderColor = ACCENT}
                                onBlur={e  => e.target.style.borderColor = '#e2e8f0'} />
                            </td>
                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                              <input value={row.calibrated} onChange={e => updateCalibRow(i, 'calibrated', e.target.value)}
                                placeholder="0"
                                style={{ width: '100%', height: 28, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 3, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                                onFocus={e => e.target.style.borderColor = ACCENT}
                                onBlur={e  => e.target.style.borderColor = '#e2e8f0'} />
                            </td>
                            <td style={{ padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                              <button type="button" onClick={() => deleteCalibRow(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, borderRadius: 2, display: 'inline-flex', lineHeight: 1 }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '6px 10px', fontSize: 11, color: '#9ca3af', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                      {calibRows.length} row{calibRows.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#9ca3af', fontSize: 12, flexDirection: 'column', gap: 8,
                  }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                      <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                    </svg>
                    No calibration rows yet.<br/>Click "+ ADD CALIBRATED ROW" or upload a CSV.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
              padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0,
            }}>
              <button type="button" onClick={closeForm}
                style={{ height: 36, padding: '0 26px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={handleSensorSave} disabled={saving}
                style={{
                  height: 36, padding: '0 32px',
                  background: saving ? '#a78bfa' : HEADER_BG,
                  color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {saving
                  ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'devSpin .7s linear infinite' }} />Saving…</>
                  : 'Save Sensor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY FORM STATE
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY = {
  imei:                     '',
  sim_card:                 '',
  simOperator:              '',
  secondarySimCard:         '',
  secondarySimOperator:     '',
  device_name:              '',
  client:                   '',
  ignitionWirePlus:         false,
  ignitionWireNotConnected: false,
  acWirePlus:               false,
  attendance:               false,
  timezoneSetting:          false,
};

const HEADER_BG_DEFAULT = '#3d2b6b';
const ACCENT_DEFAULT    = '#3d2b6b';
let HEADER_BG = HEADER_BG_DEFAULT;
let ACCENT    = ACCENT_DEFAULT;

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN HELPER
// ─────────────────────────────────────────────────────────────────────────────
const getToken = () => {
  const JWT_PAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const keys = ['token', 'authToken', 'jwt', 'accessToken', 'auth_token', 'jwtToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v && JWT_PAT.test(v)) return v;
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const AddDevices = ({
  open,
  onClose,
  onSubmit,
  editDevice      = null,
  currentUser     = null,
  loading         = false,
  onSensorsUpdate = null,
}) => {
  const theme = useTheme();
  HEADER_BG = theme?.activeColor || HEADER_BG_DEFAULT;
  ACCENT    = theme?.activeColor || ACCENT_DEFAULT;

  const isDealer = (currentUser?.role || '') === 'dealer';

  const [tab,   setTab]   = useState('device');
  const [form,  setForm]  = useState(EMPTY);
  const [error, setError] = useState('');

  const [simOperators,  setSimOperators]  = useState([]);
  const [protocolTypes, setProtocolTypes] = useState([]);
  const [clients,       setClients]       = useState([]);
  const [loadingData,   setLoadingData]   = useState(false);
  const [protoError,    setProtoError]    = useState('');
  const [clientError,   setClientError]   = useState('');

  const [selectedClientStatus, setSelectedClientStatus] = useState(null);
  const [bufferedSensors, setBufferedSensors] = useState([]);

  // ── COIN STATE ──────────────────────────────────────────────────────────────
  const [coinError, setCoinError] = useState(null);
  const [userCoinAvailable, setUserCoinAvailable] = useState(null);
  const [coinLoading, setCoinLoading] = useState(false);

  // ── ✅ Get coins from currentUser ──────────────────────────────────────────
  const getCoinsFromUser = useCallback(() => {
    if (currentUser) {
      // Try to get availableCoins directly
      let coins = currentUser.availableCoins;
      // If not available, calculate from allocated - used
      if (coins === undefined || coins === null) {
        const allocated = currentUser.allocatedCoins || 0;
        const used = currentUser.usedCoins || 0;
        coins = Math.max(0, allocated - used);
      }
      return coins;
    }
    // Fallback: try localStorage
    try {
      const stored = localStorage.getItem('fleet_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        let coins = parsed.availableCoins;
        if (coins === undefined || coins === null) {
          const allocated = parsed.allocatedCoins || 0;
          const used = parsed.usedCoins || 0;
          coins = Math.max(0, allocated - used);
        }
        return coins;
      }
    } catch (e) {}
    return null;
  }, [currentUser]);

  // ── Fetch current user's coins ────────────────────────────────────────────
  const fetchUserCoins = async () => {
    if (coinLoading) return;
    setCoinLoading(true);
    try {
      const token = getToken();
      if (!token) {
        console.warn('[AddDevices] No token found');
        // Try to get from currentUser
        const coins = getCoinsFromUser();
        if (coins !== null) {
          setUserCoinAvailable(coins);
          console.log('[AddDevices] Coins from currentUser (fallback):', coins);
        }
        setCoinLoading(false);
        return;
      }
      const res = await fetch('/api/users/my-coins', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-cache',
      });
      const data = await res.json();
      if (data.success && data.coins) {
        setUserCoinAvailable(data.coins.available);
        console.log('[AddDevices] Coins fetched from API:', data.coins.available);
      } else {
        console.warn('[AddDevices] Coin fetch response:', data);
        // Fallback to currentUser
        const coins = getCoinsFromUser();
        if (coins !== null) {
          setUserCoinAvailable(coins);
          console.log('[AddDevices] Coins from currentUser (API fallback):', coins);
        }
      }
    } catch (err) {
      console.error('[AddDevices] Coin fetch error:', err);
      // Fallback to currentUser
      const coins = getCoinsFromUser();
      if (coins !== null) {
        setUserCoinAvailable(coins);
        console.log('[AddDevices] Coins from currentUser (error fallback):', coins);
      }
    } finally {
      setCoinLoading(false);
    }
  };

  const buildForm = useCallback((d) => ({
    imei:                     d.IMEI_No                    || d.imei                    || '',
    sim_card:                 d.sim_card                   || d.simNumber               || '',
    simOperator:              d.simOperator                || '',
    secondarySimCard:         d.secondarySimCard           || d.secondarySimNumber       || '',
    secondarySimOperator:     d.secondarySimOperator       || '',
    device_name:              d.device_name                || d.deviceType              || '',
    client:                   d.client                     || d.assignedTo              || '',
    ignitionWirePlus:         d.ignitionWirePlus         ?? false,
    ignitionWireNotConnected: d.ignitionWireNotConnected ?? false,
    acWirePlus:               d.acWirePlus               ?? false,
    attendance:               d.attendance               ?? false,
    timezoneSetting:          d.timezoneSetting          ?? false,
  }), []);

  useEffect(() => {
    if (!open) return;

    setError('');
    setProtoError('');
    setClientError('');
    setCoinError(null);
    setTab('device');
    setSelectedClientStatus(null);

    // ── ✅ Set coins from currentUser immediately ──
    const coins = getCoinsFromUser();
    if (coins !== null) {
      setUserCoinAvailable(coins);
      console.log('[AddDevices] Coins set from currentUser on mount:', coins);
    }

    // ── ✅ Fetch fresh coins from API (background) ──
    fetchUserCoins();

    if (editDevice) {
      setForm(buildForm(editDevice));
      setBufferedSensors(Array.isArray(editDevice.sensors) ? editDevice.sensors : []);
    } else {
      setForm({ ...EMPTY });
      setBufferedSensors([]);
    }

    setSimOperators([]);
    setProtocolTypes([]);
    setClients([]);
    setLoadingData(true);

    const role   = currentUser?.role    || '';
    const userId = currentUser?.user_id || null;

    const promises = isDealer
      ? [getProtocolMasterApi(), Promise.resolve({ data: { clients: [] } })]
      : [getProtocolMasterApi(), getClientsApi({ role, userId })];

    Promise.allSettled(promises).then(([protoRes, clientRes]) => {

      if (protoRes.status === 'fulfilled') {
        const d = protoRes.value?.data?.data || {};
        setSimOperators(Array.isArray(d.sim_operator)   ? d.sim_operator   : []);
        setProtocolTypes(Array.isArray(d.protocol_type) ? d.protocol_type  : []);
      } else {
        setProtoError('Could not load Protocol_Master data.');
      }

      if (!isDealer) {
        if (clientRes.status === 'fulfilled') {
          const list = clientRes.value?.data?.clients || [];
          setClients(list);

          if (editDevice) {
            const currentClientUsername = editDevice.client || editDevice.assignedTo || '';
            const existingClient = list.find(c => c.value === currentClientUsername);
            if (existingClient) {
              setSelectedClientStatus({ status: existingClient.status, active: existingClient.active });
            }
          }

          if (list.length === 0) {
            const r = currentUser?.role || '';
            if      (r === 'super_admin') setClientError('No admin accounts found. Create an admin first.');
            else if (r === 'admin')       setClientError('No dealer accounts found under your account.');
            else if (r === 'dealer')      setClientError('No user accounts found under your account.');
            else                          setClientError('No clients found for your role.');
          }
        } else {
          const msg = clientRes.reason?.response?.data?.message || clientRes.reason?.message || '';
          setClientError(`Could not load clients: ${msg}`);
        }
      }

    }).finally(() => setLoadingData(false));

  }, [open, editDevice, buildForm, currentUser, isDealer, getCoinsFromUser]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReset = () => {
    setError('');
    setCoinError(null);
    setSelectedClientStatus(null);
    if (editDevice) {
      setForm(buildForm(editDevice));
      setBufferedSensors(Array.isArray(editDevice.sensors) ? editDevice.sensors : []);
    } else {
      setForm({ ...EMPTY });
      setBufferedSensors([]);
    }
    // Refresh coins
    const coins = getCoinsFromUser();
    if (coins !== null) setUserCoinAvailable(coins);
    fetchUserCoins();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setCoinError(null);

    const imeiValue = (form.imei || '').trim();
    if (!imeiValue)             return setError('IMEI is required');
    if (imeiValue.length < 10)  return setError('IMEI must be at least 10 characters');
    if (!form.sim_card?.trim()) return setError('SIM Number is required');
    if (!form.simOperator)      return setError('SIM Operator is required');
    if (!form.device_name)      return setError('Device Name is required');

    if (!isDealer && !form.client) return setError('Client is required');

    if (!currentUser?.user_id) return setError('User session not found. Please log in again.');

    // ── COIN CHECK: Only for NEW devices (not edit) ──────────────────────────
    if (!editDevice) {
      // If still loading, wait
      if (coinLoading) {
        return setError('⏳ Checking coin balance... Please wait.');
      }
      // If no data yet, try to get from currentUser
      let coins = userCoinAvailable;
      if (coins === null) {
        coins = getCoinsFromUser();
        if (coins !== null) {
          setUserCoinAvailable(coins);
        }
      }
      // If still null, fetch and retry
      if (coins === null) {
        fetchUserCoins();
        return setError('⏳ Checking coin balance... Please try again in a moment.');
      }
      // Check if SuperAdmin (unlimited)
      if (currentUser?.role !== 'super_admin' && coins <= 0) {
        setCoinError({
          title: '⚠️ Insufficient Coin Balance',
          message: `You need 1 coin to assign this device to a client.\nYou have 0 coins available.\n\nPlease contact your administrator to allocate more coins.`,
        });
        return;
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const submitData = {
      ...form,
      imei:    imeiValue,
      IMEI_No: imeiValue,
      sensors: bufferedSensors,
      creatorRole: currentUser?.role || '',
      deductCoin: !editDevice,
    };

    onSubmit(submitData, currentUser, bufferedSensors);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inp = {
    width: '100%', height: 36, padding: '0 10px',
    background: '#fff', border: '1px solid #d0d7de', borderRadius: 3,
    fontSize: 13, color: '#1a1f2e', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const sFocus = e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = '0 0 0 2px rgba(61,43,107,0.12)'; };
  const sBlur  = e => { e.target.style.borderColor = '#d0d7de'; e.target.style.boxShadow = 'none'; };

  const Label = ({ text, req }) => (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
      {text}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  );

  const Checkbox = ({ id, label, checked, onChange }) => (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: '#374151', userSelect: 'none' }}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: ACCENT, cursor: 'pointer' }} />
      {label}
    </label>
  );

  const dropdownProps = { loadingData, ACCENT };
  const gridCols = isDealer ? 'repeat(3,1fr)' : 'repeat(4,1fr)';

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px 0', overflowY: 'auto',
      }}>
      <div style={{
        width: '96vw', maxWidth: 1420, background: '#f5f7fa', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden', maxHeight: '90vh',
        margin: 'auto',
      }}>

        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', height: 48, background: HEADER_BG, flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            {editDevice ? 'Edit Device' : 'Device Add'}
          </span>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#f0f2f5', borderBottom: '1px solid #dde1e7', flexShrink: 0 }}>
          {[{ id: 'device', label: 'Add Device' }, { id: 'sensor', label: 'Add Sensor Details' }].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              style={{
                padding: '12px 28px', fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                border: 'none',
                borderBottom: tab === t.id ? `3px solid ${ACCENT}` : '3px solid transparent',
                background: tab === t.id ? '#fff' : 'transparent',
                color: tab === t.id ? ACCENT : '#6b7280',
                cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '24px 28px 20px', background: '#fff', flex: 1, overflowY: 'auto' }}>

            {/* ── COIN ERROR POPUP ── */}
            {coinError && (
              <div style={{
                padding: '14px 18px',
                marginBottom: 14,
                background: '#fef2f2',
                border: '2px solid #dc2626',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b' }}>
                    {coinError.title}
                  </div>
                  <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4, whiteSpace: 'pre-line' }}>
                    {coinError.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCoinError(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#991b1b',
                    fontSize: 22,
                    cursor: 'pointer',
                    padding: '0 4px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Banner alerts */}
            {protoError && (
              <div style={{ padding: '8px 12px', marginBottom: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '3px solid #f59e0b', borderRadius: 3, fontSize: 12, color: '#92400e' }}>
                ⚠ {protoError}
              </div>
            )}
            {!isDealer && clientError && (
              <div style={{ padding: '8px 12px', marginBottom: 10, background: '#fff5f5', border: '1px solid #fca5a5', borderLeft: '3px solid #ef4444', borderRadius: 3, fontSize: 12, color: '#dc2626' }}>
                ⚠ {clientError}
              </div>
            )}
            {error && (
              <div style={{ padding: '8px 12px', marginBottom: 12, background: '#fff5f5', border: '1px solid #fca5a5', borderLeft: '3px solid #ef4444', borderRadius: 3, fontSize: 12, color: '#dc2626' }}>
                {error}
              </div>
            )}


            {tab === 'device' && (
              <>
                {/* ── Row 1 ── */}
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '14px 20px', marginBottom: 18 }}>
                  <div>
                    <Label text="IMEI" req />
                    <input
                      style={inp}
                      value={form.imei}
                      onChange={e => set('imei', e.target.value)}
                      placeholder="Enter IMEI number"
                      onFocus={sFocus}
                      onBlur={sBlur}
                    />
                  </div>
                  <div>
                    <Label text="SIM Number" req />
                    <input style={inp} value={form.sim_card}
                      onChange={e => set('sim_card', e.target.value)}
                      placeholder="SIM Number" onFocus={sFocus} onBlur={sBlur} />
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Only contains 24 digit</div>
                  </div>
                  <LiveSelect label="SIM Operator" req value={form.simOperator}
                    onChange={v => set('simOperator', v)} options={simOperators}
                    emptyMsg="No operators in Protocol_Master" {...dropdownProps} />
                  {!isDealer && (
                    <div>
                      <Label text="Secondary SIM Number" />
                      <input style={inp} value={form.secondarySimCard}
                        onChange={e => set('secondarySimCard', e.target.value)}
                        placeholder="SIM Number" onFocus={sFocus} onBlur={sBlur} />
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Only contains 24 digit</div>
                    </div>
                  )}
                </div>

                {/* ── Row 2 ── */}
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '14px 20px', marginBottom: 24 }}>
                  {isDealer && (
                    <div>
                      <Label text="Secondary SIM Number" />
                      <input style={inp} value={form.secondarySimCard}
                        onChange={e => set('secondarySimCard', e.target.value)}
                        placeholder="SIM Number" onFocus={sFocus} onBlur={sBlur} />
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Only contains 24 digit</div>
                    </div>
                  )}
                  <LiveSelect label="Secondary SIM Operator" value={form.secondarySimOperator}
                    onChange={v => set('secondarySimOperator', v)} options={simOperators}
                    emptyMsg="No operators in Protocol_Master" {...dropdownProps} />
                  <LiveSelect label="Device Name" req value={form.device_name}
                    onChange={v => set('device_name', v)} options={protocolTypes}
                    emptyMsg="No device types in Protocol_Master" {...dropdownProps} />
                  {!isDealer && (
                    <ClientDropdown
                      clients={clients}
                      value={form.client}
                      onChange={(username, clientObj) => {
                        setForm(f => ({ ...f, client: username }));
                        setSelectedClientStatus(clientObj
                          ? { status: clientObj.status, active: clientObj.active }
                          : null);
                      }}
                      clientError={clientError}
                      {...dropdownProps}
                    />
                  )}
                </div>

                {/* ── Status + Checkboxes ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {!isDealer && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Status:</label>
                      {selectedClientStatus ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 3, fontSize: 12, fontWeight: 500,
                          background: selectedClientStatus.active ? '#e8f5e9' : '#fff5f5',
                          color:      selectedClientStatus.active ? '#2e7d32' : '#dc2626',
                          border:     `1px solid ${selectedClientStatus.active ? '#4caf50' : '#fca5a5'}`,
                        }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: selectedClientStatus.active ? '#4caf50' : '#ef4444',
                            display: 'inline-block',
                          }} />
                          {selectedClientStatus.status}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                          Select a client to see status
                        </span>
                      )}
                    </div>
                  )}
                  <Checkbox id="cb-ign-p"    label="Ignition wire connected in (+)ve"      checked={form.ignitionWirePlus}         onChange={v => set('ignitionWirePlus', v)} />
                  <Checkbox id="cb-ign-n"    label="Ignition wire not connected"            checked={form.ignitionWireNotConnected} onChange={v => set('ignitionWireNotConnected', v)} />
                  <Checkbox id="cb-ac"       label="Air condition wire connected in (+)ve"  checked={form.acWirePlus}               onChange={v => set('acWirePlus', v)} />
                  <Checkbox id="cb-attend"   label="Attendance"                             checked={form.attendance}              onChange={v => set('attendance', v)} />
                  <Checkbox id="cb-timezone" label="Timezone Setting"                       checked={form.timezoneSetting}         onChange={v => set('timezoneSetting', v)} />
                </div>
              </>
            )}

            {/* ── Sensor Tab ── */}
            {tab === 'sensor' && (
              <SensorTab
                deviceId={editDevice?._id || null}
                existingSensors={
                  editDevice
                    ? (editDevice.sensors || bufferedSensors)
                    : bufferedSensors
                }
                onSensorsChange={(updatedSensors) => {
                  setBufferedSensors(updatedSensors);
                  if (typeof onSensorsUpdate === 'function') onSensorsUpdate(updatedSensors);
                }}
                ACCENT={ACCENT}
                HEADER_BG={HEADER_BG}
                isNewDevice={!editDevice}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
            padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0,
          }}>
            {error && <span style={{ flex: 1, fontSize: 11, color: '#dc2626' }}>{error}</span>}
            <button type="button" onClick={handleReset}
              style={{ height: 36, padding: '0 26px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Reset
            </button>
            {tab === 'device' && (
              <button type="submit" disabled={loading || coinLoading}
                style={{
                  height: 36, padding: '0 32px',
                  background: (loading || coinLoading) ? '#a78bfa' : ACCENT,
                  color: '#fff', border: 'none', borderRadius: 3,
                  fontSize: 13, fontWeight: 600,
                  cursor: (loading || coinLoading) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {(loading || coinLoading)
                  ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'devSpin .7s linear infinite' }} />{coinLoading ? 'Loading coins…' : 'Saving…'}</>
                  : editDevice ? 'Update Device' : 'Save'}
              </button>
            )}
          </div>
        </form>
      </div>
      <style>{`@keyframes devSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AddDevices;