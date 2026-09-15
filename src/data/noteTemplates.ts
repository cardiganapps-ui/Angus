import type { IconName } from "../components/Icon";

/* ── Note templates ──
   Starting points for a student who paints. Each is plain markdown the
   editor renders live; the blank one exists so "no template" is a
   real choice. The date placeholder is filled in when picked. */

export interface NoteTemplate {
  id: string;
  name: string;
  icon: IconName;
  title: string;
  content: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  { id: "blank", name: "Nota en blanco", icon: "edit", title: "", content: "" },
  {
    id: "class",
    name: "Apuntes de clase",
    icon: "book",
    title: "Apuntes · {fecha}",
    content: "## Tema\n\n\n## Ideas clave\n- \n\n## Referencias que mencionaron\n- \n\n## Tareas\n[ ] "
  },
  {
    id: "critique",
    name: "Crítica recibida",
    icon: "message",
    title: "Crítica · {fecha}",
    content: "## Pieza\n\n\n## Qué dijeron\n- \n\n## Qué cambiar\n[ ] \n\n## Qué conservar\n- "
  },
  {
    id: "piece",
    name: "Bitácora de pieza",
    icon: "palette",
    title: "Bitácora · ",
    content: "## Intención\n\n\n## Proceso\n- {fecha}: \n\n## Materiales\n- \n\n## Pendientes\n[ ] "
  },
  {
    id: "materials",
    name: "Lista de materiales",
    icon: "clipboard",
    title: "Materiales · ",
    content: "[ ] \n[ ] \n[ ] \n\n## Dónde comprar\n- "
  },
  {
    id: "research",
    name: "Referencias e investigación",
    icon: "search",
    title: "Referencias · ",
    content: "## Artistas\n- \n\n## Lecturas\n- \n\n## Enlaces\n- \n\n## Notas\n"
  }
];

/** Fill the {fecha} placeholder with a display date. */
export function applyTemplate(tpl: NoteTemplate, dateLabel: string): { title: string; content: string } {
  return {
    title: tpl.title.replace("{fecha}", dateLabel).trim(),
    content: tpl.content.replace("{fecha}", dateLabel)
  };
}
