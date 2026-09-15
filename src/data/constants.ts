import type {
  ContactRelationship,
  EventKind,
  ExpenseCategory,
  LeadStage,
  PaymentMethod,
  ProjectStatus,
  SaleStatus
} from "../types";

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
  { value: "expo", label: "Expo", color: "var(--teal)" },
  { value: "meeting", label: "Reunión", color: "var(--green)" },
  { value: "deadline", label: "Entrega", color: "var(--red)" },
  { value: "personal", label: "Personal", color: "var(--purple)" },
  { value: "other", label: "Otro", color: "var(--charcoal-xl)" }
];

/* Badge class per event kind — Cardigan's semantic colors
   (blue = class/virtual, teal = active, green = done/meeting,
   red = deadline, purple = personal, gray = neutral). */
export const EVENT_KIND_BADGE: Record<EventKind, string> = {
  class: "badge-blue",
  expo: "badge-teal",
  meeting: "badge-green",
  deadline: "badge-red",
  personal: "badge-purple",
  other: "badge-gray"
};

/* ── Money ──
   SALE_STATUS mirrors the sales.status check constraint; changing it
   means a migration AND a decision in utils/accounting.ts about whether
   the new status counts toward revenue (see saleCountsTowardRevenue). */
export const SALE_STATUS: { value: SaleStatus; label: string }[] = [
  { value: "quoted", label: "Cotizada" },
  { value: "confirmed", label: "Confirmada" },
  { value: "delivered", label: "Entregada" },
  { value: "cancelled", label: "Cancelada" }
];

export const SALE_STATUS_BADGE: Record<SaleStatus, string> = {
  quoted: "badge-gray",
  confirmed: "badge-teal",
  delivered: "badge-green",
  cancelled: "badge-red"
};

export const PAYMENT_METHOD: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card", label: "Tarjeta" },
  { value: "other", label: "Otro" }
];

export const EXPENSE_CATEGORY: { value: ExpenseCategory; label: string }[] = [
  { value: "materials", label: "Materiales" },
  { value: "studio", label: "Taller" },
  { value: "equipment", label: "Equipo" },
  { value: "transport", label: "Transporte" },
  { value: "courses", label: "Cursos" },
  { value: "expo", label: "Expo" },
  { value: "fees", label: "Comisiones" },
  { value: "other", label: "Otro" }
];

export function labelFor<T extends { value: string; label: string }>(
  list: T[],
  value: string
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
