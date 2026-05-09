// login.jsx — Pantalla de login cuando hay backend configurado
const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const u = await KBotAPI.login(username.trim(), password);
      onLogin(u);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-brand">
          <img src="logo.png" alt="K-BOTANAS" />
        </div>
        <div className="login-title">CONTROL DE CAJA</div>
        <div className="login-sub">Inicia sesión para sincronizar</div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <div className="field-label"><span>USUARIO</span></div>
            <input className="text-input" autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="caja1" />
          </div>
          <div className="field">
            <div className="field-label"><span>CONTRASEÑA</span></div>
            <input className="text-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {err && <div className="error-box">⚠ {err}</div>}
          <button className="btn-primary big" type="submit" disabled={loading}>
            {loading ? 'INGRESANDO…' : 'ENTRAR'}
          </button>
        </form>
        <div className="login-foot">
          <span>OFFLINE-READY · PWA</span>
          <button className="link-btn" onClick={() => onLogin(null)}>Continuar sin sincronizar →</button>
        </div>
      </div>
    </div>
  );
};

window.LoginScreen = LoginScreen;
