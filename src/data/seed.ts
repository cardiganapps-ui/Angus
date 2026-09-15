import type { Contact, Project, ScheduleEvent } from "../types";
import { todayISO } from "../utils/dates";

function offsetISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const seedContacts: Contact[] = [
  {
    id: "c1",
    name: "Galería Cardinal",
    relationship: "gallery",
    email: "hola@galeriacardinal.mx",
    phone: "",
    leadStage: null,
    followUpDate: null,
    notes: "Interesados en una pieza grande para la muestra de otoño.",
    createdAt: todayISO()
  },
  {
    id: "c2",
    name: "Renata Solís",
    relationship: "lead",
    email: "renata.solis@example.com",
    phone: "55 1234 5678",
    leadStage: "negotiating",
    followUpDate: offsetISO(3),
    notes: "Quiere un retrato por encargo, esperando presupuesto final.",
    createdAt: todayISO()
  }
];

export const seedProjects: Project[] = [
  {
    id: "p1",
    title: "Retrato — Renata",
    medium: "Óleo sobre lienzo",
    status: "in_progress",
    startDate: offsetISO(-10),
    dueDate: offsetISO(14),
    price: 8500,
    contactId: "c2",
    notes: "",
    createdAt: todayISO()
  },
  {
    id: "p2",
    title: "Serie \"Raíces\"",
    medium: "Acrílico",
    status: "idea",
    startDate: null,
    dueDate: null,
    price: null,
    contactId: null,
    notes: "Explorar 4-5 piezas para la expo de primavera.",
    createdAt: todayISO()
  }
];

export const seedEvents: ScheduleEvent[] = [
  {
    id: "e1",
    title: "Clase de grabado",
    kind: "class",
    date: offsetISO(1),
    startTime: "18:00",
    endTime: "20:00",
    location: "Taller Xochimilco",
    projectId: null,
    contactId: null,
    notes: "",
    createdAt: todayISO()
  },
  {
    id: "e2",
    title: "Entrega retrato Renata",
    kind: "deadline",
    date: offsetISO(14),
    startTime: null,
    endTime: null,
    location: "",
    projectId: "p1",
    contactId: "c2",
    notes: "",
    createdAt: todayISO()
  },
  {
    id: "e3",
    title: "Expo colectiva — montaje",
    kind: "expo",
    date: offsetISO(21),
    startTime: "10:00",
    endTime: null,
    location: "Galería Cardinal",
    projectId: null,
    contactId: "c1",
    notes: "",
    createdAt: todayISO()
  }
];
