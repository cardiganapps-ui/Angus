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

/* Badge class per event kind — semantic colors, none of them the
   primary accent (blue = class, teal = in progress / expo, green =
   done/meeting, red = deadline, purple = personal, gray = neutral). */
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

/* Badge class per expense category — semantic, not decorative: teal for
   the materials that become the work, amber for the fixed cost of the
   studio, blue for equipment, purple for learning, green for expos
   (money spent to sell), red for commissions taken out of a sale, gray
   for the pass-through rest.

   `courses` used to be badge-rose. With the app's primary accent now
   rose, a pale-rose pill with rose text is the exact visual formula of
   an accent chip (--accent-pale ground + accent label), so a "Cursos"
   badge sitting next to an amount read as a selected/actionable state
   rather than a label. It moved to purple — the color this palette
   already uses for the personal / self-directed lane (EVENT_KIND
   `personal`), which is what a course is. Purple's previous holder,
   `transport`, joins `other` on gray: both are undifferentiated
   pass-through overhead, and the label is always present next to the
   pill, so one shared neutral costs nothing. Rose is now unclaimed
   app-wide — see the token note in styles/base.css. */
export const EXPENSE_CATEGORY_BADGE: Record<ExpenseCategory, string> = {
  materials: "badge-teal",
  studio: "badge-amber",
  equipment: "badge-blue",
  transport: "badge-gray",
  courses: "badge-purple",
  expo: "badge-green",
  fees: "badge-red",
  other: "badge-gray"
};

export function labelFor<T extends { value: string; label: string }>(
  list: T[],
  value: string
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
