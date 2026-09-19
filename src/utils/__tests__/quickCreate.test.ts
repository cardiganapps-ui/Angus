import { describe, expect, it } from "vitest";
import {
  findByName,
  quickAssignment,
  quickContact,
  quickCourse,
  quickExpo,
  quickProject,
  usableName
} from "../quickCreate";

const stamp = { id: "id-1", createdAt: "2026-09-19" };

describe("quickCreate builders", () => {
  it("contact: trims the name, keeps the relationship, stages only a lead", () => {
    const client = quickContact("  Lucía Marín ", "client", stamp);
    expect(client).toEqual({
      id: "id-1",
      createdAt: "2026-09-19",
      name: "Lucía Marín",
      relationship: "client",
      email: "",
      phone: "",
      leadStage: null,
      followUpDate: null,
      notes: ""
    });
    expect(quickContact("Marco", "lead", stamp).leadStage).toBe("new");
    expect(quickContact("Elena", "teacher", stamp).leadStage).toBeNull();
  });

  it("project: ProjectSheet's own defaults unless the context says otherwise", () => {
    expect(quickProject("x", {}, stamp)).toMatchObject({
      status: "idea",
      availability: "available",
      contactId: null,
      courseId: null,
      price: null,
      cost: null,
      year: null,
      dueDate: null,
      medium: ""
    });
    const sold = quickProject("Marea", { status: "completed", availability: "sold", contactId: "c1", price: 9000 }, stamp);
    expect(sold).toMatchObject({ title: "Marea", status: "completed", availability: "sold", contactId: "c1", price: 9000 });
    expect(quickProject("Tarea", { dueDate: "2026-10-01", courseId: "k1" }, stamp)).toMatchObject({ dueDate: "2026-10-01", courseId: "k1" });
  });

  it("expo: kind expo on the given date, nothing else assumed", () => {
    expect(quickExpo("Feria", "2026-10-02", stamp)).toMatchObject({
      kind: "expo",
      date: "2026-10-02",
      budget: null,
      seriesId: null,
      cancelled: false,
      detached: false,
      missed: false
    });
  });

  it("course: an active class starting today, or when the context says", () => {
    expect(quickCourse("Seminario", {}, stamp)).toMatchObject({
      name: "Seminario",
      kind: "class",
      status: "active",
      startDate: "2026-09-19",
      paymentPlan: "single",
      cost: null,
      recurringRuleId: null
    });
    expect(quickCourse("Seminario", { startDate: "2026-08-01" }, stamp).startDate).toBe("2026-08-01");
  });

  it("assignment: a todo on its course with nothing else filled", () => {
    expect(quickAssignment(" Ensayo ", "k1", stamp)).toEqual({
      id: "id-1",
      createdAt: "2026-09-19",
      courseId: "k1",
      title: "Ensayo",
      description: "",
      dueDate: null,
      dueTime: null,
      status: "todo",
      completedAt: null,
      projectId: null,
      grade: "",
      feedback: ""
    });
  });

  it("usableName needs a letter or a digit", () => {
    expect(usableName("Ana")).toBe(true);
    expect(usableName("3/10")).toBe(true);
    expect(usableName("   ")).toBe(false);
    expect(usableName("«»")).toBe(false);
  });

  it("findByName ignores case and surrounding space, and never matches empty", () => {
    const rows = [{ name: "Ana Ruiz" }, { name: "Galería Norte" }];
    expect(findByName(rows, "  ana ruiz ", (r) => r.name)).toBe(rows[0]);
    expect(findByName(rows, "GALERÍA NORTE", (r) => r.name)).toBe(rows[1]);
    expect(findByName(rows, "Ana", (r) => r.name)).toBeNull();
    expect(findByName(rows, "  ", (r) => r.name)).toBeNull();
  });
});
