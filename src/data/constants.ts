import type {
  AssignmentStatus,
  AttendanceStatus,
  Availability,
  ContactRelationship,
  EventKind,
  ExpenseCategory,
  IncomeCategory,
  LeadStage,
  PaymentMethod,
  PaymentTerms,
  Practice,
  ProjectStatus,
  QuickAction,
  RecurrenceCadence,
  RecurrenceKind,
  SaleStatus,
  TextScale,
  ThemePreference,
  TuitionCadence,
  CourseKind,
  CourseModality,
  CoursePaymentPlan,
  CourseStatus
} from "../types";
import type { IconName } from "../components/Icon";

export const PROJECT_STATUS: { value: ProjectStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "in_progress", label: "En proceso" },
  { value: "on_hold", label: "En pausa" },
  { value: "completed", label: "Terminado" }
];

/* Inventory state of a piece. Green = available (a good thing on a
   shelf), amber = reserved (pending), teal = sold (the "done" money
   state), gray = not for sale / gifted. */
export const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: "available", label: "Disponible" },
  { value: "reserved", label: "Apartada" },
  { value: "sold", label: "Vendida" },
  { value: "not_for_sale", label: "No se vende" },
  { value: "gifted", label: "Regalada" }
];

export const AVAILABILITY_BADGE: Record<Availability, string> = {
  available: "badge-green",
  reserved: "badge-amber",
  sold: "badge-teal",
  not_for_sale: "badge-gray",
  gifted: "badge-gray"
};

export const PROJECT_STATUS_BADGE: Record<ProjectStatus, string> = {
  idea: "badge-purple",
  in_progress: "badge-teal",
  on_hold: "badge-amber",
  completed: "badge-green"
};

export const CONTACT_RELATIONSHIP_BADGE: Record<ContactRelationship, string> = {
  lead: "badge-amber",
  client: "badge-teal",
  gallery: "badge-purple",
  supplier: "badge-gray",
  collaborator: "badge-green",
  other: "badge-gray"
};

export const LEAD_STAGE_BADGE: Record<LeadStage, string> = {
  new: "badge-gray",
  contacted: "badge-blue",
  negotiating: "badge-amber",
  won: "badge-green",
  lost: "badge-red"
};

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

/* Expense categories, grouped for the chip row (`group` is only a
   heading in the sheet; the value list is flat and mirrors the check
   constraint). */
export type ExpenseGroup = "Taller" | "Obra" | "Vender" | "Administración";

export const EXPENSE_CATEGORY: { value: ExpenseCategory; label: string; group: ExpenseGroup }[] = [
  { value: "materials", label: "Materiales", group: "Obra" },
  { value: "framing", label: "Enmarcado", group: "Obra" },
  { value: "shipping", label: "Envíos", group: "Obra" },
  { value: "studio", label: "Taller", group: "Taller" },
  { value: "rent", label: "Renta", group: "Taller" },
  { value: "services", label: "Servicios", group: "Taller" },
  { value: "equipment", label: "Equipo", group: "Taller" },
  { value: "expo", label: "Expo", group: "Vender" },
  { value: "fees", label: "Comisiones", group: "Vender" },
  { value: "marketing", label: "Difusión", group: "Vender" },
  { value: "transport", label: "Transporte", group: "Administración" },
  { value: "courses", label: "Cursos", group: "Administración" },
  { value: "software", label: "Apps y software", group: "Administración" },
  { value: "taxes", label: "Impuestos", group: "Administración" },
  { value: "food", label: "Comida", group: "Administración" },
  { value: "other", label: "Otro", group: "Administración" }
];

export const EXPENSE_GROUPS: ExpenseGroup[] = ["Obra", "Taller", "Vender", "Administración"];

/* Badge class per expense category — semantic, not decorative: teal for
   what goes INTO the work, amber for the studio's fixed life, blue for
   equipment, green for what sells, red for money that leaves as fees or
   taxes, purple for learning, gray for the rest. */
export const EXPENSE_CATEGORY_BADGE: Record<ExpenseCategory, string> = {
  materials: "badge-teal",
  framing: "badge-teal",
  shipping: "badge-teal",
  studio: "badge-amber",
  rent: "badge-amber",
  services: "badge-amber",
  equipment: "badge-blue",
  expo: "badge-green",
  marketing: "badge-green",
  fees: "badge-red",
  taxes: "badge-red",
  courses: "badge-purple",
  software: "badge-blue",
  transport: "badge-gray",
  food: "badge-gray",
  other: "badge-gray"
};

/* Income categories: what kind of money a sale is. Piezas and comisiones
   are the work itself (teal, the "in progress" state hue); clases and
   talleres are teaching (blue, the class hue); the rest are gray. */
export const INCOME_CATEGORY: { value: IncomeCategory; label: string }[] = [
  { value: "piece", label: "Pieza" },
  { value: "commission", label: "Encargo" },
  { value: "class", label: "Clase" },
  { value: "workshop", label: "Taller" },
  { value: "service", label: "Servicio" },
  { value: "license", label: "Licencia" },
  { value: "grant", label: "Beca o apoyo" },
  { value: "other", label: "Otro" }
];

export const INCOME_CATEGORY_BADGE: Record<IncomeCategory, string> = {
  piece: "badge-teal",
  commission: "badge-teal",
  class: "badge-blue",
  workshop: "badge-blue",
  service: "badge-purple",
  license: "badge-purple",
  grant: "badge-green",
  other: "badge-gray"
};

export const PAYMENT_TERMS: { value: PaymentTerms; label: string; short: string }[] = [
  { value: "single", label: "Pago único", short: "Único" },
  { value: "deposit_balance", label: "Anticipo + liquidación", short: "Anticipo" },
  { value: "installments", label: "En cuotas", short: "Cuotas" }
];

export const RECURRENCE_KIND: { value: RecurrenceKind; label: string }[] = [
  { value: "income", label: "Ingreso" },
  { value: "expense", label: "Gasto" }
];

export const RECURRENCE_CADENCE: { value: RecurrenceCadence; label: string; every: string }[] = [
  { value: "weekly", label: "Semanal", every: "semanas" },
  { value: "biweekly", label: "Quincenal", every: "quincenas" },
  { value: "monthly", label: "Mensual", every: "meses" },
  { value: "quarterly", label: "Trimestral", every: "trimestres" },
  { value: "yearly", label: "Anual", every: "años" }
];

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
  { value: "classes", label: "Doy clases" },
  { value: "workshops", label: "Doy talleres" },
  { value: "studies", label: "Estudio / me formo" },
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
  { value: "contact", label: "Nuevo contacto", icon: "users" },
  { value: "assignment", label: "Nueva tarea", icon: "clipboard" }
];

/* ── Clases ── */
export const TUITION_CADENCE: { value: TuitionCadence; label: string }[] = [
  { value: "monthly", label: "Mensual" },
  { value: "per_session", label: "Por sesión" }
];

export const ATTENDANCE_STATUS: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: "present", label: "Presente", short: "Vino" },
  { value: "absent", label: "Falta", short: "Faltó" },
  { value: "excused", label: "Justificada", short: "Avisó" }
];

export const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  present: "badge-green",
  absent: "badge-red",
  excused: "badge-amber"
};

/* ── Estudios ──
   The courses she takes. Kind colors follow the palette's semantics:
   purple = learning, blue = class, teal = a state (seminar / diploma),
   amber = pending-ish (upcoming), gray = neutral. */
export const COURSE_KIND: { value: CourseKind; label: string }[] = [
  { value: "class", label: "Clase" },
  { value: "workshop", label: "Taller" },
  { value: "master", label: "Maestría" },
  { value: "seminar", label: "Seminario" },
  { value: "diploma", label: "Diplomado" },
  { value: "online", label: "En línea" },
  { value: "other", label: "Otro" }
];
export const COURSE_KIND_BADGE: Record<CourseKind, string> = {
  class: "badge-blue",
  workshop: "badge-blue",
  master: "badge-purple",
  seminar: "badge-teal",
  diploma: "badge-teal",
  online: "badge-gray",
  other: "badge-gray"
};
export const COURSE_STATUS: { value: CourseStatus; label: string }[] = [
  { value: "upcoming", label: "Próximo" },
  { value: "active", label: "En curso" },
  { value: "completed", label: "Terminado" },
  { value: "dropped", label: "Lo dejé" }
];
export const COURSE_STATUS_BADGE: Record<CourseStatus, string> = {
  upcoming: "badge-amber",
  active: "badge-teal",
  completed: "badge-green",
  dropped: "badge-gray"
};
export const COURSE_MODALITY: { value: CourseModality; label: string }[] = [
  { value: "in_person", label: "Presencial" },
  { value: "online", label: "En línea" },
  { value: "hybrid", label: "Híbrido" }
];
export const COURSE_PAYMENT_PLAN: { value: CoursePaymentPlan; label: string }[] = [
  { value: "single", label: "Pago único" },
  { value: "monthly", label: "Mensual" },
  { value: "per_session", label: "Por sesión" },
  { value: "free", label: "Sin costo" }
];
export const ASSIGNMENT_STATUS: { value: AssignmentStatus; label: string }[] = [
  { value: "todo", label: "Pendiente" },
  { value: "in_progress", label: "En proceso" },
  { value: "done", label: "Entregada" }
];
export const ASSIGNMENT_STATUS_BADGE: Record<AssignmentStatus, string> = {
  todo: "badge-amber",
  in_progress: "badge-teal",
  done: "badge-green"
};
