import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../context/AppContext";
import type { PaymentMethod, Practice, TextScale, ThemePreference } from "../types";
import {
  DEPOSIT_PERCENT_OPTIONS,
  INSTALLMENT_FREQUENCY,
  MEDIUM_SUGGESTIONS,
  PAYMENT_METHOD,
  PRACTICE,
  TEXT_SCALE_OPTIONS,
  THEME_OPTIONS,
  labelFor
} from "../data/constants";
import { firstName, suggestMediums } from "../utils/settings";
import { formatMXN, sumMoney } from "../utils/money";
import { monthlyTrend } from "../utils/dashboard";
import { todayISO } from "../utils/dates";
import { Icon } from "../components/Icon";
import { ChipMultiSelect } from "../components/ChipMultiSelect";
import { ChipSelect } from "../components/ChipSelect";
import { SegmentedControl } from "../components/SegmentedControl";
import { applyTextScale } from "../lib/appearance";
import { useTheme } from "../hooks/useTheme";
import { haptic } from "../lib/haptics";

/* ── Onboarding ──
   Seven short questions, each persisted the moment she taps Continuar,
   so a refresh resumes where she left off. Everything is skippable; the
   defaults are sensible and Ajustes can change any of it later. The
   payoff is immediate: the greeting, the goal ring and the menu all
   reflect her answers on the very next screen. */

type Step = "name" | "practice" | "mediums" | "terms" | "goal" | "look" | "done";
const STEPS: Step[] = ["name", "practice", "mediums", "terms", "goal", "look", "done"];

const THEME_ITEMS = THEME_OPTIONS.map((o) => ({ k: o.value, l: o.label }));
const SCALE_ITEMS = TEXT_SCALE_OPTIONS.map((o) => ({ k: o.value, l: o.label }));
const FREQ_ITEMS = INSTALLMENT_FREQUENCY.map((o) => ({ k: o.value, l: o.label }));
const DEPOSIT_ITEMS = DEPOSIT_PERCENT_OPTIONS.map((p) => ({ k: String(p), l: `${p}%` }));

export function Onboarding() {
  const { settings, updateSettings, workspace, renameWorkspace, markOnboarded, projects, sales, payments, expenses } =
    useApp();
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  // Local drafts: written to the workspace on each Continuar.
  const [artistName, setArtistName] = useState(settings.artistName);
  const [studioName, setStudioName] = useState(workspace.name);
  const [practice, setPractice] = useState<Practice[]>(settings.practice);
  const [mediums, setMediums] = useState<string[]>(settings.mediums);
  const [customMedium, setCustomMedium] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(settings.defaultPaymentMethod);
  const [deposit, setDeposit] = useState(settings.defaultDepositPercent);
  const [frequency, setFrequency] = useState(settings.defaultInstallmentFrequency);
  const [goal, setGoal] = useState(settings.monthlyIncomeGoal ? String(settings.monthlyIncomeGoal) : "");
  const [themePref, setThemePref] = useState<ThemePreference>(settings.theme);
  const [scale, setScale] = useState<TextScale>(settings.textScale);

  const step = STEPS[index];
  const suggested = useMemo(
    () => [...new Set([...mediums, ...suggestMediums(projects), ...MEDIUM_SUGGESTIONS])],
    [mediums, projects]
  );
  const recentAverage = useMemo(() => {
    const months = monthlyTrend(sales, payments, expenses, todayISO(), 3).filter((m) => m.income > 0);
    return months.length ? sumMoney(months.map((m) => m.income)) / months.length : 0;
  }, [sales, payments, expenses]);

  function persist(current: Step) {
    switch (current) {
      case "name": {
        const name = artistName.trim();
        if (name !== settings.artistName) void updateSettings({ artistName: name });
        const studio = studioName.trim();
        if (studio && studio !== workspace.name) void renameWorkspace(studio);
        return;
      }
      case "practice":
        return void updateSettings({ practice });
      case "mediums": {
        const extra = customMedium.trim();
        const list = extra && !mediums.includes(extra) ? [...mediums, extra] : mediums;
        if (extra) {
          setMediums(list);
          setCustomMedium("");
        }
        return void updateSettings({ mediums: list });
      }
      case "terms":
        return void updateSettings({
          defaultPaymentMethod: method,
          defaultDepositPercent: deposit,
          defaultInstallmentFrequency: frequency
        });
      case "goal":
        return void updateSettings({ monthlyIncomeGoal: goal ? Number(goal) : null });
      case "look":
        return void updateSettings({ theme: themePref, textScale: scale });
      default:
        return;
    }
  }

  function next() {
    haptic.tap();
    persist(step);
    if (index === STEPS.length - 1) {
      haptic.success();
      void markOnboarded();
      return;
    }
    setDirection("forward");
    setIndex((i) => i + 1);
  }

  function back() {
    haptic.tap();
    setDirection("back");
    setIndex((i) => Math.max(0, i - 1));
  }

  function skipAll() {
    haptic.tap();
    persist(step);
    void markOnboarded();
  }

  function previewTheme(next: ThemePreference) {
    setThemePref(next);
    theme.setPreference(next);
  }
  function previewScale(next: TextScale) {
    setScale(next);
    applyTextScale(next);
  }

  const name = firstName(artistName) || "artista";

  const content: Record<Step, ReactNode> = {
    name: (
      <>
        <div className="onb-eyebrow">Bienvenida a Angus</div>
        <h1 className="onb-title">Hola. ¿Cómo te llamas?</h1>
        <p className="onb-lead">Así te saluda Angus cada mañana y así nombra tu estudio.</p>
        <div className="input-group">
          <label className="input-label" htmlFor="onb-name">Tu nombre</label>
          <input
            id="onb-name"
            className="input"
            value={artistName}
            placeholder="Andrea"
            autoFocus
            onChange={(e) => setArtistName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && next()}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="onb-studio">Tu estudio</label>
          <input
            id="onb-studio"
            className="input"
            value={studioName}
            placeholder="Estudio de Andrea"
            onChange={(e) => setStudioName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && next()}
          />
        </div>
      </>
    ),
    practice: (
      <>
        <div className="onb-eyebrow">Tu práctica</div>
        <h1 className="onb-title">¿Qué haces, {name}?</h1>
        <p className="onb-lead">Marca todo lo que aplique. Angus adapta Hoy y el menú a tu práctica.</p>
        <ChipMultiSelect options={PRACTICE} value={practice} onChange={setPractice} ariaLabel="Tu práctica" />
      </>
    ),
    mediums: (
      <>
        <div className="onb-eyebrow">Tus materiales</div>
        <h1 className="onb-title">¿Con qué trabajas?</h1>
        <p className="onb-lead">Tus medios aparecen como sugerencia al registrar cada pieza.</p>
        <ChipMultiSelect
          options={suggested.map((m) => ({ value: m, label: m }))}
          value={mediums}
          onChange={setMediums}
          ariaLabel="Tus medios"
        />
        <div className="input-group" style={{ marginTop: 16 }}>
          <label className="input-label" htmlFor="onb-medium">Otro medio</label>
          <input
            id="onb-medium"
            className="input"
            value={customMedium}
            placeholder="Encáustica, vitral…"
            onChange={(e) => setCustomMedium(e.target.value)}
          />
        </div>
      </>
    ),
    terms: (
      <>
        <div className="onb-eyebrow">Cómo cobras</div>
        <h1 className="onb-title">¿Cómo te pagan normalmente?</h1>
        <p className="onb-lead">
          Son solo los valores por defecto: cada venta se puede ajustar en el momento.
        </p>
        <div className="input-group">
          <span className="input-label">Método habitual</span>
          <ChipSelect options={PAYMENT_METHOD} value={method} onChange={setMethod} ariaLabel="Método habitual" />
        </div>
        <div className="input-group">
          <span className="input-label">Anticipo que pides al confirmar un encargo</span>
          <SegmentedControl
            items={DEPOSIT_ITEMS}
            value={String(deposit)}
            onChange={(k) => setDeposit(Number(k))}
            size="sm"
            role="radiogroup"
            ariaLabel="Anticipo habitual"
          />
        </div>
        <div className="input-group">
          <span className="input-label">Cuando vendes en cuotas</span>
          <SegmentedControl
            items={FREQ_ITEMS}
            value={frequency}
            onChange={(k) => setFrequency(k as "monthly" | "biweekly")}
            size="sm"
            role="radiogroup"
            ariaLabel="Frecuencia de cuotas"
          />
        </div>
      </>
    ),
    goal: (
      <>
        <div className="onb-eyebrow">Tu meta</div>
        <h1 className="onb-title">¿Cuánto quieres cobrar al mes?</h1>
        <p className="onb-lead">
          Opcional. Hoy te muestra qué tan cerca vas cada mes. Puedes cambiarla cuando quieras.
        </p>
        <div className="input-group">
          <label className="input-label" htmlFor="onb-goal">Meta mensual (MXN)</label>
          <div className="money-input-wrap">
            <span className="money-input-symbol">$</span>
            <input
              id="onb-goal"
              className="input money-input"
              type="number"
              inputMode="decimal"
              value={goal}
              placeholder="0"
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
            />
          </div>
          {recentAverage > 0 && (
            <div className="input-help">
              En los últimos meses has cobrado en promedio {formatMXN(recentAverage)} al mes.
            </div>
          )}
        </div>
      </>
    ),
    look: (
      <>
        <div className="onb-eyebrow">Apariencia</div>
        <h1 className="onb-title">¿Cómo lo quieres ver?</h1>
        <p className="onb-lead">Se aplica al instante. Cambia de opinión en Ajustes cuando quieras.</p>
        <div className="input-group">
          <span className="input-label">Tema</span>
          <SegmentedControl
            items={THEME_ITEMS}
            value={themePref}
            onChange={(k) => previewTheme(k as ThemePreference)}
            size="sm"
            role="radiogroup"
            ariaLabel="Tema"
          />
        </div>
        <div className="input-group">
          <span className="input-label">Tamaño de texto</span>
          <SegmentedControl
            items={SCALE_ITEMS}
            value={scale}
            onChange={(k) => previewScale(k as TextScale)}
            size="sm"
            role="radiogroup"
            ariaLabel="Tamaño de texto"
          />
        </div>
      </>
    ),
    done: (
      <>
        <div className="onb-hero">
          <Icon name="sparkles" size={32} strokeWidth={1.6} />
        </div>
        <h1 className="onb-title">Listo, {name}.</h1>
        <p className="onb-lead">
          Angus ya está a tu medida. Esto es lo que dejaste configurado — todo se puede cambiar en Ajustes.
        </p>
        <div className="card onb-summary">
          <Summary label="Estudio" value={studioName.trim() || workspace.name} />
          <Summary
            label="Práctica"
            value={practice.length ? practice.map((p) => labelFor(PRACTICE, p)).join(" · ") : "Por definir"}
          />
          <Summary label="Medios" value={mediums.length ? mediums.join(" · ") : "Por definir"} />
          <Summary
            label="Cobros"
            value={`${labelFor(PAYMENT_METHOD, method)} · anticipo ${deposit}% · cuotas ${labelFor(
              INSTALLMENT_FREQUENCY,
              frequency
            ).toLowerCase()}`}
          />
          <Summary label="Meta mensual" value={goal ? formatMXN(Number(goal)) : "Sin meta"} />
        </div>
      </>
    )
  };

  const last = index === STEPS.length - 1;

  return (
    <div className="onb" role="dialog" aria-label="Configuración inicial">
      <div className="onb-top">
        <div className="onb-dots" aria-label={`Paso ${index + 1} de ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`onb-dot ${i < index ? "onb-dot--done" : i === index ? "onb-dot--current" : ""}`}
            />
          ))}
        </div>
        {!last && (
          <button type="button" className="onb-skip btn-tap" onClick={skipAll}>
            Saltar por ahora
          </button>
        )}
      </div>

      <div className="onb-body scroll-bounce">
        <div key={step} className={`onb-step ${direction === "back" ? "onb-step--back" : ""}`}>
          {content[step]}
        </div>
      </div>

      <div className="onb-foot">
        {index > 0 && (
          <button type="button" className="btn btn-ghost" onClick={back}>
            Atrás
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={next}>
          {last ? "Ir a mi día" : "Continuar"}
        </button>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-item">
      <div className="row-content">
        <div className="row-sub">{label}</div>
        <div className="row-title">{value}</div>
      </div>
    </div>
  );
}
