import { useState, type ReactNode } from "react";
import { useApp } from "../context/AppContext";
import { useSession } from "../context/SessionContext";
import type { Route } from "../hooks/useNavigation";
import { useToast } from "../context/ToastContext";
import type { Practice, TextScale, ThemePreference, PaymentMethod } from "../types";
import {
  DEPOSIT_PERCENT_OPTIONS,
  INSTALLMENT_FREQUENCY,
  MEDIUM_SUGGESTIONS,
  PAYMENT_METHOD,
  PRACTICE,
  TEXT_SCALE_OPTIONS,
  THEME_OPTIONS
} from "../data/constants";
import { formatMXN } from "../utils/money";
import { formatFileSize } from "../lib/files";
import { suggestMediums } from "../utils/settings";
import { Icon, type IconName } from "../components/Icon";
import { SegmentedControl } from "../components/SegmentedControl";
import { ChipSelect } from "../components/ChipSelect";
import { ChipMultiSelect } from "../components/ChipMultiSelect";
import { SettingsFieldSheet } from "../components/SettingsFieldSheet";
import { ChangePasswordSheet } from "../components/ChangePasswordSheet";
import { haptic } from "../lib/haptics";

type FieldSheet = "artistName" | "studioName" | "goal" | "medium" | null;

const THEME_ITEMS = THEME_OPTIONS.map((o) => ({ k: o.value, l: o.label }));
const SCALE_ITEMS = TEXT_SCALE_OPTIONS.map((o) => ({ k: o.value, l: o.label }));
const FREQ_ITEMS = INSTALLMENT_FREQUENCY.map((o) => ({ k: o.value, l: o.label }));
const DEPOSIT_ITEMS = DEPOSIT_PERCENT_OPTIONS.map((p) => ({ k: String(p), l: `${p}%` }));

export function Settings({ navigate }: { navigate: (r: Route) => void }) {
  const { settings, updateSettings, workspace, renameWorkspace, projects, documents, noteAttachments } = useApp();
  const fileCount = documents.filter((d) => d.kind === "file").length + noteAttachments.length;
  const fileBytes = documents.reduce((n, d) => n + (d.sizeBytes ?? 0), 0) + noteAttachments.reduce((n, a) => n + (a.sizeBytes ?? 0), 0);
  const session = useSession();
  const { showSuccess } = useToast();
  const [field, setField] = useState<FieldSheet>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const mediumOptions = [...new Set([...settings.mediums, ...suggestMediums(projects), ...MEDIUM_SUGGESTIONS])].map(
    (m) => ({ value: m, label: m })
  );

  function save<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    void updateSettings({ [key]: value });
    showSuccess("Guardado");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{workspace.name}</div>
        <h1 className="page-title">Ajustes</h1>
      </div>

      <Section title="Tu estudio">
        <Row
          icon="user"
          label="Tu nombre"
          value={settings.artistName || "Sin nombre"}
          empty={!settings.artistName}
          onClick={() => setField("artistName")}
        />
        <Row icon="home" label="Nombre del estudio" value={workspace.name} onClick={() => setField("studioName")} />
        <Control label="Qué haces" help="Angus adapta Hoy y el menú a lo que marques aquí.">
          <ChipMultiSelect
            options={PRACTICE}
            value={settings.practice}
            onChange={(next) => save("practice", next as Practice[])}
            ariaLabel="Tu práctica"
          />
        </Control>
        <Control label="Con qué trabajas">
          <ChipMultiSelect
            options={mediumOptions}
            value={settings.mediums}
            onChange={(next) => save("mediums", next)}
            ariaLabel="Tus medios"
          />
          <button
            type="button"
            className="btn btn-ghost btn-mini"
            style={{ marginTop: 10 }}
            onClick={() => setField("medium")}
          >
            + Otro medio
          </button>
        </Control>
      </Section>

      <Section title="Cómo cobras">
        <Row
          icon="target"
          label="Meta mensual"
          hint="Ingresos cobrados que quieres alcanzar cada mes."
          value={settings.monthlyIncomeGoal ? formatMXN(settings.monthlyIncomeGoal) : "Sin meta"}
          empty={!settings.monthlyIncomeGoal}
          onClick={() => setField("goal")}
        />
        <Control label="Método habitual">
          <ChipSelect
            options={PAYMENT_METHOD}
            value={settings.defaultPaymentMethod}
            onChange={(next) => save("defaultPaymentMethod", next as PaymentMethod)}
            ariaLabel="Método de pago habitual"
          />
        </Control>
        <Control label="Anticipo habitual" help="Lo que pides al confirmar una pieza por encargo.">
          <SegmentedControl
            items={DEPOSIT_ITEMS}
            value={String(settings.defaultDepositPercent)}
            onChange={(k) => save("defaultDepositPercent", Number(k))}
            size="sm"
            role="radiogroup"
            ariaLabel="Anticipo habitual"
          />
        </Control>
        <Control label="Cuotas">
          <SegmentedControl
            items={FREQ_ITEMS}
            value={settings.defaultInstallmentFrequency}
            onChange={(k) => save("defaultInstallmentFrequency", k as "monthly" | "biweekly")}
            size="sm"
            role="radiogroup"
            ariaLabel="Frecuencia de cuotas habitual"
          />
        </Control>
      </Section>

      <Section title="Apariencia">
        <Control label="Tema">
          <SegmentedControl
            items={THEME_ITEMS}
            value={settings.theme}
            onChange={(k) => save("theme", k as ThemePreference)}
            size="sm"
            role="radiogroup"
            ariaLabel="Tema"
          />
        </Control>
        <Control label="Tamaño de texto">
          <SegmentedControl
            items={SCALE_ITEMS}
            value={settings.textScale}
            onChange={(k) => save("textScale", k as TextScale)}
            size="sm"
            role="radiogroup"
            ariaLabel="Tamaño de texto"
          />
        </Control>
      </Section>

      <Section title="Tu cuenta">
        <Row icon="mail" label="Correo" value={session.email} static />
        {session.workspaces.length > 1 && (
          <Row
            icon="repeat"
            label="Cambiar de espacio"
            value={workspace.name}
            onClick={() => session.openAccount()}
          />
        )}
        <Row
          icon="edit"
          label="Cambiar contraseña"
          hint="Se aplica de inmediato, sin correo."
          onClick={() => setPasswordOpen(true)}
        />
        <div className="settings-control">
          {confirmSignOut ? (
            <div className="money-confirm">
              <div className="input-help money-confirm-question">¿Cerrar sesión en este dispositivo?</div>
              <button
                type="button"
                className="btn btn-danger btn-mini"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await session.signOut();
                }}
              >
                {signingOut ? "Cerrando…" : "Sí, cerrar sesión"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-mini"
                disabled={signingOut}
                onClick={() => setConfirmSignOut(false)}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-mini"
              style={{ color: "var(--red)" }}
              onClick={() => {
                haptic.warn();
                setConfirmSignOut(true);
              }}
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </Section>

      <Section title="Tus datos">
        <Row
          icon="download"
          label="Exportar a CSV"
          hint="Ventas, pagos y gastos por periodo, desde Reportes."
          onClick={() => navigate("reports")}
        />
        <Row icon="repeat" label="Recurrentes" hint="Ingresos y gastos fijos." onClick={() => navigate("recurring")} />
        <Row icon="target" label="Presupuestos" hint="Límites mensuales por categoría." onClick={() => navigate("budgets")} />
        <Row
          icon="file"
          label="Archivos"
          value={fileCount === 0 ? "Ninguno" : `${fileCount} · ${formatFileSize(fileBytes)}`}
          hint="Material de tus cursos, entregas e imágenes en notas."
          static
        />
      </Section>

      <Section title="Acerca de">
        <div className="card">
          <div className="settings-about">
            <strong>Angus {__APP_VERSION__}</strong> · Tu estudio, en orden. Piezas, contactos, agenda y
            dinero en un solo lugar. Tus datos viven en tu espacio y solo tú (y quien invites) los ve.
          </div>
        </div>
      </Section>

      {field === "artistName" && (
        <SettingsFieldSheet
          title="Tu nombre"
          label="Nombre"
          value={settings.artistName}
          placeholder="Andrea"
          help="Así te saluda Angus cada mañana."
          onSave={(v) => save("artistName", v)}
          onClose={() => setField(null)}
        />
      )}
      {field === "studioName" && (
        <SettingsFieldSheet
          title="Nombre del estudio"
          label="Nombre"
          value={workspace.name}
          placeholder="Estudio de Andrea"
          onSave={(v) => {
            if (v) {
              void renameWorkspace(v);
              showSuccess("Guardado");
            }
          }}
          onClose={() => setField(null)}
        />
      )}
      {field === "goal" && (
        <SettingsFieldSheet
          title="Meta mensual"
          label="Ingresos al mes (MXN)"
          kind="money"
          value={settings.monthlyIncomeGoal ? String(settings.monthlyIncomeGoal) : ""}
          help="Déjalo vacío para no tener meta."
          onSave={(v) => save("monthlyIncomeGoal", v ? Number(v) : null)}
          onClose={() => setField(null)}
        />
      )}
      {field === "medium" && (
        <SettingsFieldSheet
          title="Otro medio"
          label="Medio"
          value=""
          placeholder="Encáustica, vitral…"
          onSave={(v) => {
            if (v && !settings.mediums.includes(v)) save("mediums", [...settings.mediums, v]);
          }}
          onClose={() => setField(null)}
        />
      )}
      {passwordOpen && (
        <ChangePasswordSheet updatePassword={session.updatePassword} onClose={() => setPasswordOpen(false)} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">{title}</span>
      </div>
      <div className="card">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  hint,
  value,
  empty,
  static: isStatic,
  onClick
}: {
  icon: IconName;
  label: string;
  hint?: string;
  value?: string;
  empty?: boolean;
  static?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="settings-row-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="settings-row-main">
        <span className="settings-row-label">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </span>
      {value && <span className={`settings-row-value ${empty ? "settings-row-value--empty" : ""}`}>{value}</span>}
      {!isStatic && (
        <span className="row-chevron" aria-hidden="true">
          <Icon name="chevron-right" size={16} />
        </span>
      )}
    </>
  );
  if (isStatic) return <div className="settings-row settings-row--static">{body}</div>;
  return (
    <button type="button" className="settings-row" onClick={onClick}>
      {body}
    </button>
  );
}

function Control({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="settings-control">
      <div className="settings-control-label">{label}</div>
      {children}
      {help && <div className="settings-control-help">{help}</div>}
    </div>
  );
}
