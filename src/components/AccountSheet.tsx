import { useState } from "react";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { ChangePasswordSheet } from "./ChangePasswordSheet";
import type { Workspace } from "../hooks/useWorkspaces";
import { isAdminEmail } from "../config/admin";

export function AccountSheet({
  email,
  userId,
  workspaces,
  activeId,
  onSelectWorkspace,
  onUpdatePassword,
  onSignOut,
  onClose
}: {
  email: string;
  userId: string;
  workspaces: Workspace[];
  activeId: string | null;
  onUpdatePassword: (password: string) => Promise<string | null>;
  onSelectWorkspace: (id: string) => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const admin = isAdminEmail(email);
  const showSwitcher = workspaces.length > 1;

  async function handleSignOut() {
    setSigningOut(true);
    await onSignOut();
  }

  return (
    <Sheet
      title="Tu cuenta"
      onClose={signingOut ? null : onClose}
      footer={
        <button type="button" className="btn btn-danger" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      }
    >
      <div className="account-identity">
        <div className="account-avatar" aria-hidden="true">
          {email.slice(0, 1).toUpperCase()}
        </div>
        <div className="row-content">
          <div className="row-title">{email}</div>
          <div className="row-sub">{admin ? "Administrador" : "Cuenta personal"}</div>
        </div>
      </div>

      {showSwitcher && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Espacio de trabajo</span>
          </div>
          <div className="card">
            {workspaces.map((w) => {
              const active = w.id === activeId;
              const mine = w.ownerId === userId;
              return (
                <button
                  key={w.id}
                  type="button"
                  className={`row-item ${active ? "row-item--selected" : ""}`}
                  aria-pressed={active}
                  onClick={() => onSelectWorkspace(w.id)}
                >
                  <div className="row-content">
                    <div className="row-title">{w.name}</div>
                    <div className="row-sub">{mine ? "Tuyo" : "Compartido contigo"}</div>
                  </div>
                  {active && (
                    <span className="account-check" aria-hidden="true">
                      <Icon name="check" size={16} strokeWidth={2.4} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="input-help" style={{ marginTop: 8 }}>
            Los datos que ves y editas pertenecen al espacio seleccionado.
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Seguridad</span>
        </div>
        <div className="card">
          <button type="button" className="row-item" onClick={() => setPasswordOpen(true)}>
            <div className="row-content">
              <div className="row-title">Cambiar contraseña</div>
              <div className="row-sub">Se aplica de inmediato, sin correo.</div>
            </div>
            <span className="row-chevron" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
        </div>
      </div>

      {passwordOpen && (
        <ChangePasswordSheet updatePassword={onUpdatePassword} onClose={() => setPasswordOpen(false)} />
      )}
    </Sheet>
  );
}
