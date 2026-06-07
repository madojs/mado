export type TicketStatus = "open" | "pending" | "closed";

export type Ticket = {
  id: string;
  title: string;
  customer: string;
  status: TicketStatus;
  priority: "low" | "normal" | "high";
  notes: string;
};

export type TicketInput = Omit<Ticket, "id">;

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

let tickets: Ticket[] = [
  {
    id: "101",
    title: "Invoice export is missing VAT",
    customer: "Northwind",
    status: "open",
    priority: "high",
    notes: "Finance team needs the export before Monday.",
  },
  {
    id: "102",
    title: "Invite email copy update",
    customer: "Acme",
    status: "pending",
    priority: "normal",
    notes: "Waiting for legal approval.",
  },
  {
    id: "103",
    title: "Archive old workspace",
    customer: "Globex",
    status: "closed",
    priority: "low",
    notes: "Done after customer confirmation.",
  },
];

export const api = {
  async listTickets(params: { search?: string; status?: string }) {
    await delay();
    const search = (params.search ?? "").trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch = !search
        || ticket.title.toLowerCase().includes(search)
        || ticket.customer.toLowerCase().includes(search);
      const matchesStatus = !params.status || params.status === "all" || ticket.status === params.status;
      return matchesSearch && matchesStatus;
    });
  },

  async getTicket(id: string) {
    await delay();
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket) throw new Error("Ticket not found");
    return ticket;
  },

  async createTicket(input: TicketInput) {
    await delay();
    const ticket = { ...input, id: String(Date.now()) };
    tickets = [ticket, ...tickets];
    return ticket;
  },

  async updateTicket(id: string, input: TicketInput) {
    await delay();
    const next = { ...input, id };
    tickets = tickets.map((ticket) => ticket.id === id ? next : ticket);
    return next;
  },
};
