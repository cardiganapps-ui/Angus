import type { ContactRelationship, EventKind, LeadStage, ProjectStatus } from "../types";

export const PROJECT_STATUS: { value: ProjectStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "in_progress", label: "En proceso" },
  { value: "on_hold", label: "En pausa" },
  { value: "completed", label: "Terminado" }
];

export const CONTACT_RELATIONSHIP: { value: ContactRelationship; label: string }[] = [
  { value: "lead", label: "Prospecto" },
  { value: "client", label: "Cliente" },
  { value: "gallery", label: "Galería" },
  { value: "supplier", label: "Proveedor" },
  { value: "collaborator", label: "Colaborador" },
  { value: "other", label: "Otro" }
];

export const LEAD_STAGE: { value: LeadStage; label: string }[] = [
  { value: "new", label: "Nuevo" },
  { value: "contacted", label: "Contactado" },
  { value: "negotiating", label: "Negociando" },
  { value: "won", label: "Ganado" },
  { value: "lost", label: "Perdido" }
];

export const EVENT_KIND: { value: EventKind; label: string; color: string }[] = [
  { value: "class", label: "Clase", color: "var(--blue)" },
  { value: "expo", label: "Expo", color: "var(--clay)" },
  { value: "meeting", label: "Reunión", color: "var(--sage)" },
  { value: "deadline", label: "Entrega", color: "var(--red)" },
  { value: "personal", label: "Personal", color: "var(--plum)" },
  { value: "other", label: "Otro", color: "var(--charcoal-lt)" }
];

export function labelFor<T extends { value: string; label: string }>(
  list: T[],
  value: string
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
