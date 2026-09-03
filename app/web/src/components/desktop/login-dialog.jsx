import { useState } from "react";
import { CircleX, KeyRound, LogIn, X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { defaultAdminCredentials } from "@/app/desktop-config";

export function LoginDialog({ onClose, onLoggedIn, required = false }) {
  const [email, setEmail] = useState(defaultAdminCredentials.email);
  const [password, setPassword] = useState(defaultAdminCredentials.password);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiClient.login(email.trim(), password);
      onLoggedIn();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="login-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Iniciar sesión"
      >
        <header className="provider-titlebar login-titlebar">
          <span className="provider-title-mark">
            <KeyRound size={14} />
          </span>
          <strong>ACCESO ADMINISTRATIVO</strong>
          {!required && (
            <button
              type="button"
              className="provider-close"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          )}
        </header>
        <form className="login-form" onSubmit={handleSubmit}>
          <p>
            Ingresa una cuenta con permisos de administrador para agregar,
            modificar o borrar registros.
          </p>
          <label>
            Correo
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <footer className="login-actions">
            {!required && (
              <button type="button" onClick={onClose}>
                <CircleX size={14} /> Cancelar
              </button>
            )}
            <button type="submit" disabled={busy}>
              <LogIn size={14} /> {busy ? "Conectando…" : "Ingresar"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
