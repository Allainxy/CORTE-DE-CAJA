// users-view.jsx — Administración de usuarios (solo admin)
// Compatible con app.jsx que pasa: cajas, user, refrescar()
// Componentes principales: UsersView, UserModal, PinDisplayModal, PasswordModal, ConfirmPinModal
const useRef = React.useRef;

const ROLES_LIST = [
  { value: 'admin',    label: 'ADMIN',    icon: '👑', desc: 'Acceso total' },
  { value: 'gerente',  label: 'GERENTE',  icon: '🛡️', desc: 'Casi todo, borra con PIN' },
  { value: 'usuario',  label: 'USUARIO',  icon: '👤', desc: 'Captura y consulta' },
  { value: 'consulta', label: 'CONSULTA', icon: '👁️', desc: 'Solo lectura' }
];
function rolMeta(r) {
  return ROLES_LIST.find(x => x.value === r) || ROLES_LIST[2];
}

const UsersView = ({ cajas, user, refrescar }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetingPwd, setResetingPwd] = useState(null);
  const [pinShown, setPinShown] = useState(null); // {nombre, pin}

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await KBotAPI.listUsers();
      setUsers(r.users || []);
    } catch (e) {
      alert('Error al listar usuarios: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const handleDelete = async (u) => {
    if (!confirm(`¿Eliminar definitivamente al usuario "${u.nombre}"?\nEsta acción es irreversible.`)) return;
    try {
      await KBotAPI.deleteUser(u.id);
      cargar();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleToggleActivo = async (u) => {
    const accion = u.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} a "${u.nombre}"?`)) return;
    try {
      await KBotAPI.updateUser(u.id, { activo: !u.activo });
      cargar();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleGeneratePin = async (u) => {
    if (!confirm(`Se generará un nuevo PIN para "${u.nombre}".\n\nEl PIN anterior dejará de funcionar inmediatamente.\n\n¿Continuar?`)) return;
    try {
      const r = await KBotAPI.generatePin(u.id);
      setPinShown({ nombre: u.nombre, pin: r.pin, username: u.username });
      cargar();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  return (
    <div className="view cats-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">SEGURIDAD</div>
          <h1 className="view-title">USUARIOS</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ NUEVO USUARIO</button>
      </header>

      {loading ? (
        <BotanaCard><div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div></BotanaCard>
      ) : (
        <BotanaCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--bg-2, #fff8f0)' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700 }}>USUARIO</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700 }}>NOMBRE</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700 }}>ROL</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700 }}>ESTADO</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700 }}>PIN</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700 }}>CAJAS</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700 }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const meta = rolMeta(u.rol);
                  const necesitaPin = u.rol === 'admin' || u.rol === 'gerente';
                  const cajasAsignadas = u.cajas || [];
                  const todasLasCajas = cajasAsignadas.length === 0;
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--line, #eee)', opacity: u.activo ? 1 : 0.5 }}>
                      <td className="mono" style={{ padding: '10px 12px', fontWeight: 700 }}>{u.username}</td>
                      <td style={{ padding: '10px 12px' }}>{u.nombre}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--ink, #333)', color: '#fff', fontWeight: 700, letterSpacing: 0.5 }}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {u.activo ? (
                          <span style={{ color: 'var(--green, #2EC27E)', fontWeight: 700 }}>● ACTIVO</span>
                        ) : (
                          <span style={{ color: '#888', fontWeight: 700 }}>○ INACTIVO</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {necesitaPin ? (
                          u.tiene_pin ? (
                            <button className="btn-ghost" onClick={() => handleGeneratePin(u)} style={{ fontSize: 11, padding: '4px 10px' }} title="Regenerar PIN (invalida el anterior)">
                              🔑 REGENERAR
                            </button>
                          ) : (
                            <button className="btn-primary" onClick={() => handleGeneratePin(u)} style={{ fontSize: 11, padding: '4px 10px' }}>
                              🔑 GENERAR
                            </button>
                          )
                        ) : (
                          <span style={{ opacity: 0.4, fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11 }}>
                        {u.rol === 'admin' || u.rol === 'gerente' ? (
                          <span style={{ opacity: 0.7 }}>Todas (admin/gerente)</span>
                        ) : todasLasCajas ? (
                          <span style={{ opacity: 0.7 }}>Todas (sin restricción)</span>
                        ) : (
                          <span>{cajasAsignadas.length} caja{cajasAsignadas.length !== 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="ic-btn" onClick={() => setEditing(u)} title="Editar">✏️</button>
                        <button className="ic-btn" onClick={() => setResetingPwd(u)} title="Resetear contraseña">🔒</button>
                        <button className="ic-btn" onClick={() => handleToggleActivo(u)} title={u.activo ? 'Desactivar' : 'Reactivar'}>
                          {u.activo ? '⏸' : '▶️'}
                        </button>
                        <button className="ic-btn danger" onClick={() => handleDelete(u)} title="Eliminar definitivamente">🗑</button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Sin usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </BotanaCard>
      )}

      <BotanaCard style={{ marginTop: 16, padding: 14, background: 'var(--bg-2, #fff8f0)' }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          <strong>📌 Notas:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
            <li>Los roles <strong>ADMIN</strong> y <strong>GERENTE</strong> requieren <strong>PIN de 4 dígitos</strong> para eliminar movimientos y transferencias.</li>
            <li>Genera el PIN una vez y compártelo de forma segura con el gerente. Solo se muestra al generarlo.</li>
            <li>Puedes <strong>regenerar</strong> el PIN cuando quieras (invalida el anterior).</li>
            <li>El sistema bloquea por 5 minutos después de 3 intentos fallidos de PIN.</li>
            <li>Si un usuario no tiene cajas asignadas, puede usar <strong>todas</strong>. Asigna cajas específicas para limitar accesos.</li>
          </ul>
        </div>
      </BotanaCard>

      {/* Modal nuevo / editar */}
      {(showNew || editing) && (
        <UserModal
          user={editing}
          cajas={cajas}
          currentUser={user}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={(generatedPin) => {
            setShowNew(false);
            setEditing(null);
            cargar();
            if (generatedPin) {
              setPinShown(generatedPin);
            }
          }}
        />
      )}

      {/* Modal resetear contraseña */}
      {resetingPwd && (
        <PasswordModal
          user={resetingPwd}
          onClose={() => setResetingPwd(null)}
          onSaved={() => { setResetingPwd(null); cargar(); }}
        />
      )}

      {/* Modal mostrar PIN generado */}
      {pinShown && (
        <PinDisplayModal data={pinShown} onClose={() => setPinShown(null)} />
      )}
    </div>
  );
};

// ----- Modal crear/editar usuario -----
function UserModal({ user, cajas, currentUser, onClose, onSaved }) {
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username || '');
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [rol, setRol] = useState(user?.rol || 'usuario');
  const [password, setPassword] = useState('');
  const [activo, setActivo] = useState(user?.activo !== 0);
  const [cajasAsignadas, setCajasAsignadas] = useState(new Set(user?.cajas || []));
  const [generarPin, setGenerarPin] = useState(!isEdit && (rol === 'admin' || rol === 'gerente'));

  // Cuando cambia el rol, ajustar default de generarPin
  useEffect(() => {
    if (!isEdit) {
      setGenerarPin(rol === 'admin' || rol === 'gerente');
    }
  }, [rol, isEdit]);

  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);
  const isAdminOrGerente = rol === 'admin' || rol === 'gerente';

  const toggleCaja = (id) => {
    const ns = new Set(cajasAsignadas);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setCajasAsignadas(ns);
  };

  const handleSave = async () => {
    if (!username.trim()) return alert('Username requerido');
    if (!nombre.trim()) return alert('Nombre requerido');
    if (!isEdit && !password) return alert('Contraseña inicial requerida');
    if (!isEdit && password.length < 6) return alert('Contraseña mínimo 6 caracteres');

    try {
      let generatedPin = null;
      const cajasArr = Array.from(cajasAsignadas);

      if (isEdit) {
        await KBotAPI.updateUser(user.id, {
          username: username.trim(),
          nombre: nombre.trim(),
          rol,
          activo
        });
        // Actualizar cajas (solo si rol no es admin/gerente)
        if (rol !== 'admin' && rol !== 'gerente') {
          await KBotAPI.setUserCajas(user.id, cajasArr);
        } else {
          // Si pasó a admin/gerente, limpiar cajas (no aplica)
          await KBotAPI.setUserCajas(user.id, []);
        }
      } else {
        const r = await KBotAPI.createUser({
          username: username.trim(),
          nombre: nombre.trim(),
          rol,
          password,
          activo,
          cajas: rol === 'admin' || rol === 'gerente' ? [] : cajasArr
        });
        // Generar PIN si aplica
        if (generarPin && isAdminOrGerente && r.id) {
          const pinRes = await KBotAPI.generatePin(r.id);
          generatedPin = { nombre: nombre.trim(), pin: pinRes.pin, username: username.trim() };
        }
      }
      onSaved(generatedPin);
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <header className="capture-head">
          <h3 style={{ margin: 0 }}>{isEdit ? 'EDITAR USUARIO' : 'NUEVO USUARIO'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="field-row">
            <div className="field">
              <div className="field-label"><span>USERNAME</span></div>
              <input
                type="text"
                className="text-input mono"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                placeholder="ej: juan"
                autoFocus={!isEdit}
                disabled={isEdit && user?.username === 'admin'}
              />
            </div>
            <div className="field">
              <div className="field-label"><span>NOMBRE COMPLETO</span></div>
              <input
                type="text"
                className="text-input"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
          </div>

          <div className="field">
            <div className="field-label"><span>ROL</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {ROLES_LIST.map(r => (
                <button
                  key={r.value}
                  className={'btn-ghost' + (rol === r.value ? ' active' : '')}
                  onClick={() => setRol(r.value)}
                  disabled={isEdit && user?.username === 'admin' && r.value !== 'admin'}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    background: rol === r.value ? 'var(--ink, #333)' : 'transparent',
                    color: rol === r.value ? '#fff' : 'inherit',
                    border: '1px solid var(--ink-soft, #ccc)',
                    borderRadius: 6
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{r.icon} {r.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {!isEdit && (
            <div className="field">
              <div className="field-label"><span>CONTRASEÑA INICIAL (mín. 6 caracteres)</span></div>
              <input
                type="text"
                className="text-input mono"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="ej: kbot2026"
              />
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                Compártela con el usuario. Él podrá cambiarla después desde su perfil.
              </div>
            </div>
          )}

          {!isEdit && isAdminOrGerente && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255, 184, 0, 0.1)', borderRadius: 6, fontSize: 12 }}>
              <input type="checkbox" checked={generarPin} onChange={e => setGenerarPin(e.target.checked)} />
              <span>🔑 Generar PIN automáticamente al crear (recomendado para {rol})</span>
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={activo}
              onChange={e => setActivo(e.target.checked)}
              disabled={isEdit && user?.username === 'admin'}
            />
            <span>Usuario activo (puede iniciar sesión)</span>
          </label>

          {!isAdminOrGerente && cajasActivas.length > 0 && (
            <div className="field">
              <div className="field-label">
                <span>CAJAS PERMITIDAS</span>
                <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>
                  {cajasAsignadas.size === 0 ? 'sin selección = TODAS' : `${cajasAsignadas.size} seleccionada(s)`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, padding: 8, background: 'var(--bg-2, #fff8f0)', borderRadius: 8 }}>
                {cajasActivas.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 12, background: cajasAsignadas.has(c.id) ? 'rgba(46, 194, 126, 0.15)' : 'transparent', borderRadius: 4 }}>
                    <input type="checkbox" checked={cajasAsignadas.has(c.id)} onChange={() => toggleCaja(c.id)} />
                    <span>{c.icon || '💼'} {c.nombre}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                Si no seleccionas ninguna, el usuario podrá usar TODAS las cajas. Selecciona específicas para limitar.
              </div>
            </div>
          )}

          {isAdminOrGerente && (
            <div style={{ padding: 8, background: 'var(--bg-2, #fff8f0)', borderRadius: 6, fontSize: 11, opacity: 0.8 }}>
              ℹ️ Los roles <strong>ADMIN</strong> y <strong>GERENTE</strong> tienen acceso a todas las cajas por defecto.
            </div>
          )}
        </div>

        <footer className="capture-foot" style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>
            {isEdit ? 'GUARDAR CAMBIOS' : 'CREAR USUARIO'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ----- Modal: mostrar el PIN generado (UNA SOLA VEZ) -----
function PinDisplayModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(data.pin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <header className="capture-head" style={{ background: 'var(--ink, #1a1a1a)', color: '#fff', padding: 16 }}>
          <h3 style={{ margin: 0 }}>🔑 PIN GENERADO</h3>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </header>

        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8, letterSpacing: 0.5 }}>
            PIN PARA <strong>{data.username}</strong> · {data.nombre}
          </div>
          <div className="mono" style={{ fontSize: 64, fontWeight: 800, letterSpacing: 16, margin: '20px 0', background: 'var(--bg-2, #fff8f0)', padding: '20px 16px', borderRadius: 12, border: '2px dashed var(--primary, #E63946)' }}>
            {data.pin}
          </div>

          <button className="btn-ghost" onClick={copy} style={{ width: '100%', marginBottom: 12 }}>
            {copied ? '✅ COPIADO' : '📋 COPIAR PIN'}
          </button>

          <div style={{ padding: 12, background: 'rgba(230, 57, 70, 0.08)', borderRadius: 8, fontSize: 12, textAlign: 'left', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--red, #E63946)' }}>⚠️ IMPORTANTE</strong>
            <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
              <li>Este PIN <strong>solo se muestra una vez</strong>.</li>
              <li>Compártelo con <strong>{data.nombre}</strong> de forma segura (WhatsApp, llamada, en persona).</li>
              <li>Si lo pierdes, tendrás que <strong>regenerarlo</strong>.</li>
              <li>Sirve para que pueda eliminar movimientos y transferencias.</li>
            </ul>
          </div>
        </div>

        <footer className="capture-foot" style={{ padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>YA LO ANOTÉ / COMPARTÍ</button>
        </footer>
      </div>
    </div>
  );
}

// ----- Modal resetear contraseña -----
function PasswordModal({ user, onClose, onSaved }) {
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');

  const handleSave = async () => {
    if (pwd1.length < 6) return alert('Contraseña mínimo 6 caracteres');
    if (pwd1 !== pwd2) return alert('Las contraseñas no coinciden');
    if (!confirm(`¿Confirmar reseteo de contraseña para "${user.nombre}"?\n\nLa contraseña anterior dejará de funcionar.`)) return;
    try {
      await KBotAPI.resetPassword(user.id, pwd1);
      alert(`✅ Contraseña actualizada para ${user.nombre}.\n\nCompártesela: ${pwd1}`);
      onSaved();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <header className="capture-head">
          <h3 style={{ margin: 0 }}>🔒 RESETEAR CONTRASEÑA</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Resetear contraseña de <strong>{user.nombre}</strong> ({user.username})
          </div>
          <div className="field">
            <div className="field-label"><span>NUEVA CONTRASEÑA</span></div>
            <input type="text" className="text-input mono" value={pwd1} onChange={e => setPwd1(e.target.value)} placeholder="mínimo 6 caracteres" autoFocus />
          </div>
          <div className="field">
            <div className="field-label"><span>CONFIRMAR</span></div>
            <input type="text" className="text-input mono" value={pwd2} onChange={e => setPwd2(e.target.value)} placeholder="repite la contraseña" />
          </div>
        </div>
        <footer className="capture-foot" style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>ACTUALIZAR</button>
        </footer>
      </div>
    </div>
  );
}

// ----- Modal: pedir PIN para confirmar borrado -----
// Se usa desde movs-list y cualquier otro lugar que requiera PIN
function ConfirmPinModal({ titulo, mensaje, onConfirm, onCancel }) {
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError('El PIN debe tener 4 dígitos');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await onConfirm(pin);
    } catch (e) {
      setError(e.message || 'Error al validar PIN');
      setPin('');
      inputRef.current?.focus();
    }
    setEnviando(false);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <header className="capture-head">
          <h3 style={{ margin: 0 }}>🔑 {titulo || 'CONFIRMAR CON PIN'}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </header>
        <div style={{ padding: 20, textAlign: 'center' }}>
          {mensaje && <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.85 }}>{mensaje}</div>}
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>INGRESA TU PIN DE 4 DÍGITOS</div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            className="text-input mono"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && pin.length === 4 && handleSubmit()}
            style={{
              fontSize: 36,
              letterSpacing: 16,
              textAlign: 'center',
              padding: '16px 12px',
              fontWeight: 800,
              width: '100%'
            }}
            placeholder="••••"
            disabled={enviando}
          />
          {error && (
            <div style={{ marginTop: 12, padding: 8, background: 'rgba(230, 57, 70, 0.1)', color: 'var(--red, #E63946)', borderRadius: 6, fontSize: 12 }}>
              ⚠️ {error}
            </div>
          )}
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 12 }}>
            Después de 3 intentos fallidos quedarás bloqueado 5 minutos.
          </div>
        </div>
        <footer className="capture-foot" style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={enviando} style={{ flex: 1 }}>CANCELAR</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={enviando || pin.length !== 4}
            style={{ flex: 1 }}
          >
            {enviando ? 'VALIDANDO…' : 'CONFIRMAR'}
          </button>
        </footer>
      </div>
    </div>
  );
}

window.UsersView = UsersView;
window.UserModal = UserModal;
window.PinDisplayModal = PinDisplayModal;
window.PasswordModal = PasswordModal;
window.ConfirmPinModal = ConfirmPinModal;
