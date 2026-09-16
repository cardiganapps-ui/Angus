/* ── writeErrors ──
   A rejected WRITE, turned into the three things she actually needs:
   what the server did, whether her data is safe, and what to do next.

   Sibling of authErrors.ts, and it exists for the same reason. One
   sentence covered every failure in a twenty-entity app and it blamed
   her connection for all of them — including the ones that never left
   the tab. Migration 019 made every single write answer "permission
   denied for function is_workspace_member"; under that failure the old
   copy sent her to check her wifi.

   Every branch states that the change was rolled back, because
   useCloudStore has already reverted it: the row on screen is the
   server's row, and her edit is gone unless she makes it again. That
   is the one fact the old copy never told her.

   Pure and string-only — the raw message still goes to Ajustes →
   Diagnóstico untouched. */

/** Set by useCloudStore when an update matched zero rows. */
export const MISSING_ROW = "Esa fila ya no está en el servidor.";

export interface WriteFailure {
  /** What she reads. */
  message: string;
  /** Only where a reload genuinely tells her something new — a reload
      never brings her edit back, so it must not be offered as a
      consolation button she'll press expecting a retry. */
  canReload: boolean;
}

/* postgrest-js wraps a failed fetch as "<name>: <message>", and every
   engine words it differently: "Failed to fetch" (Chromium), "Load
   failed" (Safari), "NetworkError when attempting to fetch resource."
   (Firefox), "fetch failed" (undici). None of them reached Postgres. */
const OFFLINE = /failed to fetch|fetch failed|networkerror|load failed|network request failed|err_internet|err_network|offline/;

const SESSION = /jwt expired|invalid jwt|token is expired|refresh token/;

/* 42501 and the RLS refusal. Also the shape migration 019 produced:
   the policy helper itself becoming un-executable. */
const FORBIDDEN = /permission denied|row-level security|row level security|insufficient privilege|42501|not authorized/;

const DUPLICATE = /duplicate key|already exists|unique constraint|23505/;

const FOREIGN_KEY = /foreign key constraint|23503/;

/* A value Postgres would not take: a check constraint mirroring
   data/constants.ts, a missing NOT NULL column, an unparseable date. */
const INVALID = /check constraint|not-null constraint|not null constraint|invalid input|invalid text representation|value too long|23502|23514|22p02/;

/* Writes have no client deadline on purpose, but Postgres has its own
   statement timeout and a gateway can cut the socket. This is the only
   family where the write may have committed anyway. */
const TIMEOUT = /statement timeout|57014|timeout|timed out|gateway time-?out|504/;

export function describeWriteError(raw: string | null | undefined): WriteFailure {
  const m = (raw ?? "").toLowerCase();

  if (raw === MISSING_ROW || m.includes("ya no está en el servidor")) {
    return {
      message:
        "Ese registro ya no está en el servidor — se borró desde otro lado. Tu cambio no se guardó; recarga para ver cómo quedó.",
      canReload: true
    };
  }

  if (OFFLINE.test(m)) {
    return {
      message:
        "Sin internet: tu cambio no llegó a guardarse. Lo que ves es como estaba antes — inténtalo otra vez cuando vuelva la señal.",
      canReload: false
    };
  }

  if (SESSION.test(m)) {
    return {
      message: "Tu sesión caducó, por eso no se guardó. Vuelve a entrar y repite el cambio.",
      canReload: false
    };
  }

  if (FORBIDDEN.test(m)) {
    return {
      message:
        "El servidor no te dejó guardar esto. Deshicimos el cambio, así que lo que ves es lo que está guardado. Si vuelve a pasar, revisa Ajustes → Diagnóstico.",
      canReload: false
    };
  }

  if (DUPLICATE.test(m)) {
    return {
      message: "Eso ya estaba guardado, así que no se duplicó. Recarga para ver la versión del servidor.",
      canReload: true
    };
  }

  if (FOREIGN_KEY.test(m)) {
    return {
      message:
        "Esto apunta a algo que ya no existe — se borró desde otro lado. Tu cambio no se guardó; recarga y vuelve a intentarlo.",
      canReload: true
    };
  }

  if (INVALID.test(m)) {
    return {
      message:
        "El servidor no aceptó uno de los datos. Tu cambio se deshizo — revisa lo que escribiste y vuelve a intentarlo.",
      canReload: false
    };
  }

  if (TIMEOUT.test(m)) {
    return {
      message: "El servidor tardó demasiado y no confirmó tu cambio. Recarga para ver si alcanzó a guardarse.",
      canReload: true
    };
  }

  return {
    message:
      "El servidor rechazó el cambio, así que lo deshicimos: lo que ves es lo que está guardado. Vuelve a intentarlo.",
    canReload: false
  };
}
