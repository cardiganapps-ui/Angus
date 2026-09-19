import { describe, expect, it } from "vitest";
import {
  MIN_QUERY_LENGTH,
  buildSearchIndex,
  searchAll,
  type SearchCorpus,
  type SearchEntry,
  type SearchKind
} from "../globalSearch";
import type { Contact, Note, Project, Sale } from "../../types";

/* The helper behind the global search sheet. Everything here is the
   pure half: matching, ranking, the caps and the index build. The sheet
   itself only formats what these return. */

const entry = (
  kind: SearchKind,
  id: string,
  title: string,
  text = "",
  date = "2026-01-01"
): SearchEntry => ({
  kind,
  id,
  title,
  subtitle: text,
  meta: "",
  date,
  nTitle: title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""),
  nText: text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
});

const ids = (entries: SearchEntry[]) => entries.map((e) => e.id);

describe("searchAll — Spanish matching", () => {
  it("ignores accents in both directions", () => {
    const list = [entry("project", "a", "Café de la mañana"), entry("project", "b", "Otra pieza")];
    expect(ids(searchAll(list, "cafe").hits)).toEqual(["a"]);
    expect(ids(searchAll(list, "manana").hits)).toEqual(["a"]);
    expect(ids(searchAll([entry("note", "c", "Sueno ligero")], "sueño").hits)).toEqual(["c"]);
  });

  it("ignores case", () => {
    const list = [entry("contact", "a", "MARISOL TORRES")];
    expect(ids(searchAll(list, "marisol").hits)).toEqual(["a"]);
    expect(ids(searchAll(list, "TORRES").hits)).toEqual(["a"]);
  });

  it("treats several words as AND, in any order", () => {
    const list = [
      entry("project", "both", "Retrato azul", "óleo sobre tela"),
      entry("project", "one", "Retrato rojo", "acuarela")
    ];
    expect(ids(searchAll(list, "retrato azul").hits)).toEqual(["both"]);
    expect(ids(searchAll(list, "azul retrato").hits)).toEqual(["both"]);
    // A term that appears nowhere disqualifies the row entirely.
    expect(searchAll(list, "retrato verde").total).toBe(0);
  });

  it("matches a term that spans title and body", () => {
    const list = [entry("sale", "s1", "Encargo Marisol", "pieza entregada en la galería")];
    expect(ids(searchAll(list, "marisol galeria").hits)).toEqual(["s1"]);
  });

  it("refuses a query shorter than the floor", () => {
    const list = [entry("project", "a", "Azul")];
    expect(searchAll(list, "a").hits).toEqual([]);
    expect(searchAll(list, "   ").total).toBe(0);
    expect("az".length).toBe(MIN_QUERY_LENGTH);
    expect(ids(searchAll(list, "az").hits)).toEqual(["a"]);
  });
});

describe("searchAll — ranking", () => {
  it("puts a prefix match over a word-start over a mid-word one", () => {
    const list = [
      entry("project", "mid", "Reformar el marco"),
      entry("project", "word", "El mar adentro"),
      entry("project", "prefix", "Marco dorado")
    ];
    expect(ids(searchAll(list, "mar").hits)).toEqual(["prefix", "word", "mid"]);
  });

  it("puts the exact title first of all", () => {
    const list = [entry("project", "starts", "Azulejos"), entry("project", "exact", "Azul")];
    expect(ids(searchAll(list, "azul").hits)).toEqual(["exact", "starts"]);
  });

  it("puts a title match over a body match", () => {
    const list = [
      entry("note", "body", "Apuntes de septiembre", "la galería pidió dos piezas"),
      entry("contact", "title", "Galería Norte", "sin notas")
    ];
    expect(ids(searchAll(list, "galeria").hits)).toEqual(["title", "body"]);
  });

  it("breaks ties by recency, then alphabetically", () => {
    const list = [
      entry("sale", "old", "Encargo", "", "2026-01-01"),
      entry("sale", "new", "Encargo", "", "2026-06-01"),
      entry("sale", "same-b", "Encargo bis", "", "2026-06-01"),
      entry("sale", "same-a", "Encargo bis", "", "2026-06-01")
    ];
    // Same score: "new" before "old"; two rows on the same date sort by
    // title and then by id, so the order never depends on store order.
    expect(ids(searchAll(list, "encargo").hits)).toEqual(["new", "old", "same-a", "same-b"]);
  });

  it("is deterministic regardless of the order the rows arrive in", () => {
    const list = [
      entry("project", "a", "Marco dorado"),
      entry("project", "b", "El mar adentro"),
      entry("project", "c", "Reformar el marco")
    ];
    const forward = ids(searchAll(list, "mar").hits);
    const backward = ids(searchAll([...list].reverse(), "mar").hits);
    expect(backward).toEqual(forward);
  });
});

describe("searchAll — caps and grouping", () => {
  const many = (kind: SearchKind, n: number) =>
    Array.from({ length: n }, (_, i) => entry(kind, `${kind}-${i}`, `Azul ${String(i).padStart(2, "0")}`));

  it("caps the list and still reports the true total", () => {
    const list = [...many("project", 40), ...many("note", 40)];
    const res = searchAll(list, "azul", { limit: 12, perKind: 8 });
    expect(res.hits).toHaveLength(12);
    expect(res.total).toBe(80);
  });

  it("caps each kind so one busy table can't push out the others", () => {
    const list = [...many("project", 30), ...many("contact", 3)];
    const res = searchAll(list, "azul", { limit: 30, perKind: 5 });
    expect(res.hits.filter((h) => h.kind === "project")).toHaveLength(5);
    expect(res.hits.filter((h) => h.kind === "contact")).toHaveLength(3);
    expect(res.total).toBe(33);
  });

  it("groups by kind, best group first, and labels them in Spanish", () => {
    const list = [
      entry("note", "n1", "Apuntes", "azulejo de prueba"),
      entry("project", "p1", "Azul profundo")
    ];
    const res = searchAll(list, "azul");
    expect(res.groups.map((g) => g.kind)).toEqual(["project", "note"]);
    expect(res.groups.map((g) => g.label)).toEqual(["Obra", "Notas"]);
    expect(ids(res.groups[0].entries)).toEqual(["p1"]);
  });

  it("keeps the flat hits and the groups in agreement", () => {
    const list = [...many("project", 6), ...many("sale", 6)];
    const res = searchAll(list, "azul", { limit: 8, perKind: 4 });
    expect(res.groups.flatMap((g) => g.entries)).toHaveLength(res.hits.length);
    expect(new Set(ids(res.groups.flatMap((g) => g.entries)))).toEqual(new Set(ids(res.hits)));
  });

  it("lets a server hit in that the client match could not see", () => {
    const list = [entry("note", "n1", "Diario", "escribí sobre sueños")];
    // Postgres stems "soñar" → the row; the literal client match can't.
    expect(searchAll(list, "sonar").total).toBe(0);
    const res = searchAll(list, "sonar", { boostIds: ["n1"] });
    expect(ids(res.hits)).toEqual(["n1"]);
  });

  it("never lets a boosted row outrank a real match", () => {
    const list = [entry("note", "hit", "Sonar despierta"), entry("note", "boosted", "Otra cosa")];
    const res = searchAll(list, "sonar", { boostIds: ["boosted"] });
    expect(ids(res.hits)).toEqual(["hit", "boosted"]);
  });
});

describe("buildSearchIndex", () => {
  const project = (over: Partial<Project> = {}): Project => ({
    id: "p1",
    title: "Retrato de Ana",
    medium: "Óleo",
    status: "in_progress",
    availability: "available",
    startDate: null,
    dueDate: null,
    price: 12000,
    cost: null,
    dimensions: "60 × 80 cm",
    year: 2026,
    edition: "única",
    location: "Taller",
    contactId: "c1",
    courseId: null,
    notes: "falta barnizar",
    createdAt: "2026-02-01",
    ...over
  });
  const contact = (over: Partial<Contact> = {}): Contact => ({
    id: "c1",
    name: "Ana Ruiz",
    relationship: "client",
    email: "ana@example.com",
    phone: "5512345678",
    leadStage: null,
    followUpDate: null,
    notes: "",
    createdAt: "2026-01-15",
    ...over
  });
  const sale = (over: Partial<Sale> = {}): Sale => ({
    id: "s1",
    title: "Encargo de Ana",
    amount: 12000,
    date: "2026-03-10",
    status: "confirmed",
    category: "commission",
    paymentTerms: "single",
    projectId: "p1",
    contactId: "c1",
    eventId: null,
    recurringRuleId: null,
    periodKey: null,
    notes: "",
    createdAt: "2026-03-10",
    ...over
  });
  const note = (over: Partial<Note> = {}): Note => ({
    id: "n1",
    title: "Ideas para la serie",
    content: "# Encabezado\nprobar **azul** de Prusia",
    pinned: false,
    courseId: null,
    eventId: null,
    assignmentId: null,
    projectId: null,
    coverAttachmentId: null,
    createdAt: "2026-04-01",
    updatedAt: "2026-04-02T10:00:00.000Z",
    ...over
  });

  const corpus = (over: Partial<SearchCorpus> = {}): SearchCorpus => ({
    projects: [],
    contacts: [],
    sales: [],
    expenses: [],
    events: [],
    courses: [],
    assignments: [],
    notes: [],
    groups: [],
    ...over
  });

  it("indexes every kind it is given", () => {
    const index = buildSearchIndex(
      corpus({ projects: [project()], contacts: [contact()], sales: [sale()], notes: [note()] })
    );
    expect(index.map((e) => e.kind).sort()).toEqual(["contact", "note", "project", "sale"]);
  });

  it("normalizes title and text up front, so a keystroke never has to", () => {
    const [p] = buildSearchIndex(corpus({ projects: [project()] }));
    expect(p.nTitle).toBe("retrato de ana");
    expect(p.nText).toContain("oleo");
    expect(p.nText).toContain("barnizar");
  });

  it("finds a piece by its medium, its state or its client", () => {
    const index = buildSearchIndex(corpus({ projects: [project()], contacts: [contact()] }));
    expect(ids(searchAll(index, "oleo").hits)).toContain("p1");
    expect(ids(searchAll(index, "proceso").hits)).toContain("p1");
    expect(ids(searchAll(index, "ana").hits)).toEqual(expect.arrayContaining(["p1", "c1"]));
  });

  it("finds a contact by email or phone, which are not in the title", () => {
    const index = buildSearchIndex(corpus({ contacts: [contact()] }));
    expect(ids(searchAll(index, "example.com").hits)).toEqual(["c1"]);
    expect(ids(searchAll(index, "5512").hits)).toEqual(["c1"]);
  });

  it("carries the money already formatted and the date for the tiebreak", () => {
    const index = buildSearchIndex(corpus({ sales: [sale()], contacts: [contact()] }));
    const s = index.find((e) => e.kind === "sale") as SearchEntry;
    expect(s.meta).toContain("12,000");
    expect(s.date).toBe("2026-03-10");
    expect(s.subtitle).toContain("Confirmado");
    expect(s.subtitle).toContain("Ana Ruiz");
  });

  it("strips markdown from a note's subtitle but still searches the body", () => {
    const index = buildSearchIndex(corpus({ notes: [note()] }));
    expect(index[0].subtitle).not.toContain("#");
    expect(index[0].subtitle).not.toContain("**");
    expect(ids(searchAll(index, "prusia").hits)).toEqual(["n1"]);
  });

  it("leaves a cancelled occurrence out — it is hidden everywhere else", () => {
    const base = {
      id: "e1",
      title: "Clase de dibujo",
      kind: "class" as const,
      date: "2026-05-04",
      startTime: "10:00",
      endTime: null,
      location: "Taller",
      projectId: null,
      contactId: null,
      budget: null,
      courseId: null,
      missed: false,
      seriesId: "sr1",
      detached: false,
      notes: "",
      createdAt: "2026-04-01"
    };
    expect(buildSearchIndex(corpus({ events: [{ ...base, cancelled: false }] }))).toHaveLength(1);
    expect(buildSearchIndex(corpus({ events: [{ ...base, cancelled: true }] }))).toHaveLength(0);
  });

  it("gives an untitled note a name rather than an empty row", () => {
    const [n] = buildSearchIndex(corpus({ notes: [note({ title: "" })] }));
    expect(n.title).toBe("Sin título");
  });
});
