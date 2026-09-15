import type {
  ContactRelationship,
  EventKind,
  ExpenseCategory,
  LeadStage,
  PaymentMethod,
  Practice,
  ProjectStatus,
  QuickAction,
  SaleStatus,
  TextScale,
  ThemePreference
} from "../types";
import type { IconName } from "../components/Icon";

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

/* ── Workspace settings ──
   Labels for the onboarding + Ajustes controls. PRACTICE values are
   validated by utils/settings.ts (PRACTICES); keep both lists equal. */
export const PRACTICE: { value: Practice; label: string }[] = [
  { value: "pieces", label: "Piezas" },
  { value: "commissions", label: "Comisiones" },
  { value: "classes", label: "Clases" },
  { value: "workshops", label: "Talleres" },
  { value: "expos", label: "Expos" },
  { value: "murals", label: "Murales" },
  { value: "illustration", label: "Ilustración" },
  { value: "other", label: "Otro" }
];

export const MEDIUM_SUGGESTIONS = [
  "Óleo",
  "Acrílico",
  "Acuarela",
  "Tinta",
  "Grabado",
  "Cerámica",
  "Textil",
  "Escultura",
  "Collage",
  "Digital",
  "Mixta"
];

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" }
];

export const TEXT_SCALE_OPTIONS: { value: TextScale; label: string }[] = [
  { value: "sm", label: "Chica" },
  { value: "md", label: "Normal" },
  { value: "lg", label: "Grande" }
];

export const DEPOSIT_PERCENT_OPTIONS = [25, 30, 40, 50];

export const INSTALLMENT_FREQUENCY: { value: "monthly" | "biweekly"; label: string }[] = [
  { value: "monthly", label: "Mensual" },
  { value: "biweekly", label: "Quincenal" }
];

export const QUICK_ACTION: { value: QuickAction; label: string; icon: IconName }[] = [
  { value: "sale", label: "Nueva venta", icon: "banknote" },
  { value: "expense", label: "Nuevo gasto", icon: "receipt" },
  { value: "event", label: "Nuevo evento", icon: "calendar" },
  { value: "project", label: "Nueva pieza", icon: "palette" },
  { value: "contact", label: "Nuevo contacto", icon: "users" }
];
