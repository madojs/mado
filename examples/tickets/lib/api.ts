/**
 * Small in-memory ticket API.
 * Replace this file with fetch('/api/...') calls in a real backend project.
 */

export type TicketStatus = "open" | "pending" | "closed";
export type TicketPriority = "low" | "normal" | "high";

export interface Ticket {
  id: number;
  title: string;
  requester: string;
  status: TicketStatus;
  priority: TicketPriority;
  description: string;
  updatedAt: string;
}

export interface TicketFilters {
  query?: string;
  status?: TicketStatus | "all";
}

export interface TicketInput {
  title: string;
  requester: string;
  status: TicketStatus;
  priority: TicketPriority;
  description: string;
}

let nextId = 6;

const tickets = new Map<number, Ticket>([
  [
    1,
    {
      id: 1,
      title: "Cannot export monthly report",
      requester: "maria@example.com",
      status: "open",
      priority: "high",
      description: "Finance export returns an empty CSV for May.",
      updatedAt: "2026-06-01T10:20:00.000Z",
    },
  ],
  [
    2,
    {
      id: 2,
      title: "Invite email never arrived",
      requester: "lee@example.com",
      status: "pending",
      priority: "normal",
      description: "User was created, but the invite email did not arrive.",
      updatedAt: "2026-06-01T15:45:00.000Z",
    },
  ],
  [
    3,
    {
      id: 3,
      title: "Dashboard counter looks stale",
      requester: "ops@example.com",
      status: "open",
      priority: "normal",
      description: "The open ticket count updates only after a full refresh.",
      updatedAt: "2026-06-02T08:05:00.000Z",
    },
  ],
  [
    4,
    {
      id: 4,
      title: "Typo in billing address label",
      requester: "support@example.com",
      status: "closed",
      priority: "low",
      description: "Billing address field has a typo in the account form.",
      updatedAt: "2026-05-30T13:10:00.000Z",
    },
  ],
  [
    5,
    {
      id: 5,
      title: "Webhook retries too noisy",
      requester: "infra@example.com",
      status: "pending",
      priority: "high",
      description: "Retries work, but logs are too noisy during incident windows.",
      updatedAt: "2026-06-03T09:35:00.000Z",
    },
  ],
]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clone(ticket: Ticket): Ticket {
  return { ...ticket };
}

function touch(input: Omit<Ticket, "updatedAt">): Ticket {
  return { ...input, updatedAt: new Date().toISOString() };
}

export const api = {
  async listTickets(filters: TicketFilters = {}): Promise<Ticket[]> {
    await delay(120);
    const query = filters.query?.trim().toLowerCase() ?? "";
    const status = filters.status ?? "all";
    const rows = [...tickets.values()]
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => {
        if (!query) return true;
        return (
          t.title.toLowerCase().includes(query) ||
          t.requester.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const out: Ticket[] = [];
    for (const ticket of rows) out.push(clone(ticket));
    return out;
  },

  async getTicket(id: number): Promise<Ticket> {
    await delay(90);
    const ticket = tickets.get(id);
    if (!ticket) throw new Error(`Ticket ${id} not found`);
    return clone(ticket);
  },

  async createTicket(input: TicketInput): Promise<Ticket> {
    await delay(150);
    const ticket = touch({ ...input, id: nextId++ });
    tickets.set(ticket.id, ticket);
    return clone(ticket);
  },

  async updateTicket(id: number, patch: Partial<TicketInput>): Promise<Ticket> {
    await delay(140);
    const current = tickets.get(id);
    if (!current) throw new Error(`Ticket ${id} not found`);
    const ticket = touch({ ...current, ...patch });
    tickets.set(id, ticket);
    return clone(ticket);
  },

  async deleteTicket(id: number): Promise<void> {
    await delay(120);
    if (!tickets.delete(id)) throw new Error(`Ticket ${id} not found`);
  },

  async stats(): Promise<{
    total: number;
    open: number;
    pending: number;
    closed: number;
    high: number;
  }> {
    await delay(80);
    const list = [...tickets.values()];
    return {
      total: list.length,
      open: list.filter((t) => t.status === "open").length,
      pending: list.filter((t) => t.status === "pending").length,
      closed: list.filter((t) => t.status === "closed").length,
      high: list.filter((t) => t.priority === "high").length,
    };
  },
};
