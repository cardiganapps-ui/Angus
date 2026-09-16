import { describe, expect, it } from "vitest";
import { MISSING_ROW, describeWriteError } from "../../lib/writeErrors";

/* These strings are Postgres's, PostgREST's and the browser fetch
   stack's — not ours. The mapping is the only thing between them and
   the one notice Andrea gets that a write was thrown away. */

const RAW = {
  offline: [
    "TypeError: Failed to fetch",
    "TypeError: Load failed",
    "TypeError: NetworkError when attempting to fetch resource.",
    "TypeError: fetch failed"
  ],
  // The exact shape migration 019 produced on every read and write.
  forbidden: [
    "permission denied for function is_workspace_member",
    'new row violates row-level security policy for table "sales"',
    "permission denied for table projects"
  ],
  invalid: [
    'new row for relation "sales" violates check constraint "sales_status_check"',
    'null value in column "amount" of relation "payments" violates not-null constraint',
    'invalid input syntax for type date: "31/02/2026"'
  ],
  duplicate: ['duplicate key value violates unique constraint "sales_rule_period_idx"'],
  foreignKey: [
    'insert or update on table "installments" violates foreign key constraint "installments_sale_id_fkey"'
  ],
  session: ["JWT expired", "Invalid JWT"],
  timeout: ["canceling statement due to statement timeout"]
};

const ALL_RAW = [...Object.values(RAW).flat(), MISSING_ROW, "", "500 Internal Server Error", "boom"];

describe("describeWriteError", () => {
  it("never blames her connection for something the server refused", () => {
    for (const raw of [...RAW.forbidden, ...RAW.invalid, ...RAW.duplicate, MISSING_ROW]) {
      expect(describeWriteError(raw).message).not.toMatch(/internet|señal|conexi[óo]n/i);
    }
  });

  it("names a real loss of connection as one", () => {
    for (const raw of RAW.offline) {
      const out = describeWriteError(raw);
      expect(out.message).toMatch(/internet/i);
      // Nothing reached the server, so there is nothing to reload.
      expect(out.canReload).toBe(false);
    }
  });

  it("always tells her the change did not stick", () => {
    for (const raw of ALL_RAW) {
      expect(describeWriteError(raw).message).toMatch(
        /no se guard|no lleg[óo] a guardarse|se deshizo|deshicimos|lo deshicimos|no se duplic|no confirm/i
      );
    }
  });

  it("keeps the missing-row failure specific instead of generic", () => {
    const gone = describeWriteError(MISSING_ROW);
    const generic = describeWriteError("boom");
    expect(gone.message).not.toBe(generic.message);
    expect(gone.message).toMatch(/ya no est[áa]/i);
    // The server's copy is the only place the truth lives now.
    expect(gone.canReload).toBe(true);
  });

  it("separates the families a single sentence used to flatten", () => {
    const messages = [
      RAW.offline[0],
      RAW.forbidden[0],
      RAW.invalid[0],
      RAW.duplicate[0],
      RAW.foreignKey[0],
      RAW.session[0],
      RAW.timeout[0],
      MISSING_ROW,
      "boom"
    ].map((raw) => describeWriteError(raw).message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("offers a reload only where reloading shows her something new", () => {
    for (const raw of [RAW.duplicate[0], RAW.foreignKey[0], RAW.timeout[0], MISSING_ROW]) {
      expect(describeWriteError(raw).canReload).toBe(true);
    }
    for (const raw of [RAW.offline[0], RAW.forbidden[0], RAW.invalid[0], RAW.session[0], "boom"]) {
      expect(describeWriteError(raw).canReload).toBe(false);
    }
  });

  it("sends an expired session to the one thing that fixes it", () => {
    for (const raw of RAW.session) {
      expect(describeWriteError(raw).message).toMatch(/sesi[óo]n/i);
    }
  });

  it("answers in Spanish whatever it is handed", () => {
    for (const raw of [...ALL_RAW, null, undefined]) {
      const out = describeWriteError(raw);
      expect(out.message.length).toBeGreaterThan(0);
      expect(out.message).not.toBe(raw);
      // Never leaks the raw Postgres text into the UI.
      expect(out.message).not.toMatch(/constraint|relation|permission denied|null value|TypeError/);
    }
  });

  it("is case-insensitive about what the server shouted", () => {
    expect(describeWriteError("PERMISSION DENIED FOR FUNCTION is_workspace_member").message).toBe(
      describeWriteError("permission denied for function is_workspace_member").message
    );
  });
});
