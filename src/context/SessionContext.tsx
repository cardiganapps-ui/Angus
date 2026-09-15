import { createContext, useContext } from "react";
import type { Workspace } from "../types";

/* ── Session ──
   Account-level facts and actions (who is signed in, which workspaces
   she can see, sign out, password) for screens that need them — the
   drawer and Ajustes — without threading props through App → Screen. */
export interface SessionValue {
  email: string;
  userId: string;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  selectWorkspace: (id: string) => void;
  signOut: () => Promise<void>;
  updatePassword: (password: string) => Promise<string | null>;
  openAccount: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export const SessionProvider = SessionContext.Provider;

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
