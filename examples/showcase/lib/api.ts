/**
 * In-memory CRM API for the showcase app.
 *
 * This is deliberately shaped like a backend client: typed entities, list/get
 * operations, mutations, delays, and controlled failures. The point is to push
 * Mado app code without adding runtime dependencies or a real server.
 */

export type UserRole = "admin" | "user" | "viewer";
export type AccountStatus = "lead" | "active" | "at-risk" | "churned";
export type DealStage = "new" | "qualified" | "proposal" | "won" | "lost";
export type DealPriority = "low" | "normal" | "high";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Account {
  id: number;
  name: string;
  domain: string;
  ownerId: number;
  status: AccountStatus;
  plan: "starter" | "growth" | "enterprise";
  mrr: number;
  health: number;
  createdAt: string;
  lastTouchAt: string;
  notes: string;
}

export interface Contact {
  id: number;
  accountId: number;
  name: string;
  email: string;
  title: string;
  primary: boolean;
}

export interface Deal {
  id: number;
  accountId: number;
  title: string;
  stage: DealStage;
  priority: DealPriority;
  value: number;
  closeDate: string;
  ownerId: number;
  notes: string;
}

export interface Activity {
  id: number;
  accountId: number;
  kind: "call" | "email" | "meeting" | "note";
  text: string;
  at: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  publishedAt: string;
}

export interface AccountInput {
  name: string;
  domain: string;
  status: AccountStatus;
  plan: Account["plan"];
  mrr: number;
  ownerId: number;
  notes: string;
}

export interface DealInput {
  accountId: number;
  title: string;
  stage: DealStage;
  priority: DealPriority;
  value: number;
  closeDate: string;
  ownerId: number;
  notes: string;
}

export interface DashboardStats {
  accounts: number;
  activeAccounts: number;
  pipeline: number;
  won: number;
  atRisk: number;
  users: number;
  admins: number;
  posts: number;
}

export interface AccountListOptions {
  query?: string;
  status?: AccountStatus | "all";
  sort?: "name" | "mrr" | "health" | "touch";
  page?: number;
  pageSize?: number;
}

export interface AccountListResult {
  rows: Account[];
  total: number;
  page: number;
  pageSize: number;
}

let nextAccountId = 106;
let nextContactId = 406;
let nextDealId = 706;
let nextActivityId = 906;
let failNext = "";
let session: { userId: number } | null = null;

const seedUsers: User[] = [
  { id: 1, name: "Anna Ivanova", email: "anna@example.com", role: "admin", createdAt: "2026-01-15" },
  { id: 2, name: "Boris Petrov", email: "boris@example.com", role: "user", createdAt: "2026-02-03" },
  { id: 3, name: "Victoria Kuznetsova", email: "vika@example.com", role: "user", createdAt: "2026-02-21" },
  { id: 4, name: "Greg Smirnov", email: "greg@example.com", role: "viewer", createdAt: "2026-03-10" },
];

const seedAccounts: Account[] = [
  { id: 101, name: "Northwind Labs", domain: "northwind.example", ownerId: 1, status: "active", plan: "enterprise", mrr: 12800, health: 91, createdAt: "2026-01-08", lastTouchAt: "2026-06-01", notes: "Expansion candidate. CFO asked for security review." },
  { id: 102, name: "Acme Operations", domain: "acme.example", ownerId: 2, status: "lead", plan: "growth", mrr: 4200, health: 64, createdAt: "2026-02-17", lastTouchAt: "2026-05-29", notes: "Interested in workflow automation." },
  { id: 103, name: "Globex Support", domain: "globex.example", ownerId: 1, status: "at-risk", plan: "growth", mrr: 7600, health: 38, createdAt: "2026-03-05", lastTouchAt: "2026-05-20", notes: "Usage dropped after procurement change." },
  { id: 104, name: "Initech Cloud", domain: "initech.example", ownerId: 3, status: "active", plan: "starter", mrr: 950, health: 78, createdAt: "2026-04-12", lastTouchAt: "2026-06-03", notes: "Small team, high engagement." },
  { id: 105, name: "Umbrella Analytics", domain: "umbrella.example", ownerId: 2, status: "churned", plan: "enterprise", mrr: 0, health: 12, createdAt: "2026-01-24", lastTouchAt: "2026-04-15", notes: "Lost to internal tool. Keep warm for Q4." },
];

const seedContacts: Contact[] = [
  { id: 401, accountId: 101, name: "Mila Chen", email: "mila@northwind.example", title: "VP Operations", primary: true },
  { id: 402, accountId: 101, name: "Owen Price", email: "owen@northwind.example", title: "Security Lead", primary: false },
  { id: 403, accountId: 102, name: "Sam Lee", email: "sam@acme.example", title: "COO", primary: true },
  { id: 404, accountId: 103, name: "Nora Volk", email: "nora@globex.example", title: "Support Director", primary: true },
  { id: 405, accountId: 104, name: "Ivan Brooks", email: "ivan@initech.example", title: "Founder", primary: true },
];

const seedDeals: Deal[] = [
  { id: 701, accountId: 101, title: "Enterprise renewal", stage: "proposal", priority: "high", value: 153600, closeDate: "2026-07-15", ownerId: 1, notes: "Legal approved MSA, waiting on procurement." },
  { id: 702, accountId: 102, title: "Workflow pilot", stage: "qualified", priority: "normal", value: 50400, closeDate: "2026-08-01", ownerId: 2, notes: "Pilot scope agreed with operations team." },
  { id: 703, accountId: 103, title: "Rescue package", stage: "new", priority: "high", value: 91200, closeDate: "2026-06-30", ownerId: 1, notes: "Needs exec sponsor before proposal." },
  { id: 704, accountId: 104, title: "Starter upgrade", stage: "won", priority: "low", value: 18000, closeDate: "2026-06-02", ownerId: 3, notes: "Closed after product-led trial." },
  { id: 705, accountId: 105, title: "Win-back Q4", stage: "lost", priority: "normal", value: 120000, closeDate: "2026-05-12", ownerId: 2, notes: "Deferred until budget review." },
];

const seedActivities: Activity[] = [
  { id: 901, accountId: 101, kind: "meeting", text: "Security review completed with two follow-ups.", at: "2026-06-01" },
  { id: 902, accountId: 102, kind: "call", text: "Ops team confirmed pilot goals.", at: "2026-05-29" },
  { id: 903, accountId: 103, kind: "email", text: "Sent rescue plan and adoption report.", at: "2026-05-20" },
  { id: 904, accountId: 104, kind: "note", text: "Founder asked about growth plan limits.", at: "2026-06-03" },
  { id: 905, accountId: 101, kind: "email", text: "Procurement requested DPA redline.", at: "2026-05-27" },
];

const users = new Map<number, User>();
const accounts = new Map<number, Account>();
const contacts = new Map<number, Contact>();
const deals = new Map<number, Deal>();
const activities = new Map<number, Activity>();

for (const u of seedUsers) users.set(u.id, u);
for (const a of seedAccounts) accounts.set(a.id, a);
for (const c of seedContacts) contacts.set(c.id, c);
for (const d of seedDeals) deals.set(d.id, d);
for (const a of seedActivities) activities.set(a.id, a);

const posts: BlogPost[] = [
  {
    slug: "hello-Mado",
    title: "Hello, Mado",
    excerpt: "Why another framework when React, Vue, Solid and dozens more already exist.",
    body: `The very short answer: I got tired.

The platform has grown so much over the last decade that many jobs React and Vue were created for now have native answers: Web Components, ESM, Shadow DOM, fetch+Streams, History API, CSS variables. Mado is thin glue over the platform, not a replacement for it.`,
    publishedAt: "2026-05-01",
  },
  {
    slug: "signals-are-enough",
    title: "Signals Are Enough",
    excerpt: "Why there is no Virtual DOM or Redux here, and why that is fine.",
    body: `Signals plus targeted DOM updates cover almost every UI task in this app category. Virtual DOM was invented to work around the DOM APIs of 2010; modern browsers are much faster than that old mental model.

Mado has no global store. Signals plus context are enough for apps with dozens of screens.`,
    publishedAt: "2026-05-15",
  },
  {
    slug: "bake-vs-ssr",
    title: "Bake Instead Of SSR",
    excerpt: "When static output beats server rendering.",
    body: `Smart Static (bake) is build-time prerender for pages with baked data inside HTML. Googlebot sees content immediately, while Web Components come alive on the client and SPA navigation still works.

It fits blogs, landing pages, docs and small catalogs. It does not fit authenticated dashboards or huge catalogs with frequently changing SKU data.`,
    publishedAt: "2026-06-01",
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(clone(value)), ms));
}

function takeFailure(scope: string): Error | null {
  if (failNext && (scope === failNext || failNext === "*")) {
    const code = failNext;
    failNext = "";
    return new Error(`Controlled API failure: ${code}`);
  }
  return null;
}

function allAccounts(): Account[] {
  return [...accounts.values()];
}

function allDeals(): Deal[] {
  return [...deals.values()];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function primaryContact(accountId: number): Contact | undefined {
  return [...contacts.values()].find((c) => c.accountId === accountId && c.primary);
}

function addActivity(accountId: number, kind: Activity["kind"], text: string): Activity {
  const activity: Activity = { id: nextActivityId++, accountId, kind, text, at: today() };
  activities.set(activity.id, activity);
  const account = accounts.get(accountId);
  if (account) accounts.set(accountId, { ...account, lastTouchAt: activity.at });
  return activity;
}

export const api = {
  failNext(scope = "*"): void {
    failNext = scope;
  },

  // ---- blog ----
  listPosts(): Promise<BlogPost[]> {
    return delay(posts);
  },
  getPost(slug: string): Promise<BlogPost> {
    const post = posts.find((p) => p.slug === slug);
    if (!post) return Promise.reject(new Error(`Post "${slug}" not found`));
    return delay(post);
  },
  allSlugs(): Promise<string[]> {
    const slugs: string[] = [];
    for (const post of posts) slugs.push(post.slug);
    return delay(slugs);
  },

  // ---- auth ----
  login(email: string, password: string): Promise<{ userId: number }> {
    const user = [...users.values()].find((u) => u.email === email);
    if (!user) return Promise.reject(new Error("User not found"));
    if (password.length < 4) return Promise.reject(new Error("Password must be at least 4 characters"));
    session = { userId: user.id };
    return delay({ userId: user.id }, 300);
  },
  logout(): Promise<void> {
    session = null;
    return delay(undefined);
  },
  me(): Promise<User | null> {
    if (!session) return Promise.resolve(null);
    return delay(users.get(session.userId) ?? null, 120);
  },
  isAuthed(): boolean {
    return session !== null;
  },

  // ---- users ----
  listUsers(): Promise<User[]> {
    return delay([...users.values()]);
  },
  getUser(id: number): Promise<User> {
    const user = users.get(id);
    if (!user) return Promise.reject(new Error(`User #${id} not found`));
    return delay(user);
  },
  updateUser(id: number, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const user = users.get(id);
    if (!user) return Promise.reject(new Error(`User #${id} not found`));
    const next: User = { ...user, ...patch };
    users.set(id, next);
    return delay(next);
  },
  deleteUser(id: number): Promise<void> {
    users.delete(id);
    return delay(undefined);
  },

  // ---- dashboard ----
  stats(): Promise<DashboardStats> {
    const failure = takeFailure("stats");
    if (failure) return Promise.reject(failure);
    const accountRows = allAccounts();
    const dealRows = allDeals();
    return delay({
      accounts: accountRows.length,
      activeAccounts: accountRows.filter((a) => a.status === "active").length,
      pipeline: dealRows.filter((d) => d.stage !== "won" && d.stage !== "lost").reduce((sum, d) => sum + d.value, 0),
      won: dealRows.filter((d) => d.stage === "won").reduce((sum, d) => sum + d.value, 0),
      atRisk: accountRows.filter((a) => a.status === "at-risk").length,
      users: users.size,
      admins: [...users.values()].filter((u) => u.role === "admin").length,
      posts: posts.length,
    });
  },
  recentActivity(): Promise<Activity[]> {
    return delay([...activities.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8));
  },

  // ---- accounts ----
  listAccounts(options: AccountListOptions = {}): Promise<AccountListResult> {
    const failure = takeFailure("accounts");
    if (failure) return Promise.reject(failure);
    const page = Math.max(1, options.page ?? 1);
    const pageSize = options.pageSize ?? 8;
    const query = (options.query ?? "").trim().toLowerCase();
    const status = options.status ?? "all";
    const sort = options.sort ?? "name";

    let rows = allAccounts();
    if (query) {
      rows = rows.filter((a) => {
        const contact = primaryContact(a.id);
        const haystack = `${a.name} ${a.domain} ${contact?.name ?? ""} ${contact?.email ?? ""}`.toLowerCase();
        return haystack.includes(query);
      });
    }
    if (status !== "all") rows = rows.filter((a) => a.status === status);
    rows = [...rows].sort((a, b) => {
      if (sort === "mrr") return b.mrr - a.mrr;
      if (sort === "health") return a.health - b.health;
      if (sort === "touch") return b.lastTouchAt.localeCompare(a.lastTouchAt);
      return a.name.localeCompare(b.name);
    });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    return delay({ rows: rows.slice(start, start + pageSize), total, page, pageSize });
  },
  getAccount(id: number): Promise<Account> {
    const failure = takeFailure("account");
    if (failure) return Promise.reject(failure);
    const account = accounts.get(id);
    if (!account) return Promise.reject(new Error(`Account #${id} not found`));
    return delay(account);
  },
  createAccount(input: AccountInput): Promise<Account> {
    const failure = takeFailure("create-account");
    if (failure) return Promise.reject(failure);
    const account: Account = {
      id: nextAccountId++,
      createdAt: today(),
      lastTouchAt: today(),
      health: input.status === "active" ? 82 : 58,
      ...input,
    };
    accounts.set(account.id, account);
    const contact: Contact = {
      id: nextContactId++,
      accountId: account.id,
      name: "Primary contact",
      email: `hello@${account.domain}`,
      title: "Operations",
      primary: true,
    };
    contacts.set(contact.id, contact);
    addActivity(account.id, "note", "Account created from showcase CRM form.");
    return delay(account, 320);
  },
  updateAccount(id: number, patch: Partial<AccountInput>): Promise<Account> {
    const failure = takeFailure("update-account");
    if (failure) return Promise.reject(failure);
    const account = accounts.get(id);
    if (!account) return Promise.reject(new Error(`Account #${id} not found`));
    const next: Account = { ...account, ...patch, lastTouchAt: today() };
    accounts.set(id, next);
    addActivity(id, "note", "Account profile updated.");
    return delay(next, 280);
  },
  deleteAccount(id: number): Promise<void> {
    accounts.delete(id);
    for (const contact of [...contacts.values()]) if (contact.accountId === id) contacts.delete(contact.id);
    for (const deal of [...deals.values()]) if (deal.accountId === id) deals.delete(deal.id);
    for (const activity of [...activities.values()]) if (activity.accountId === id) activities.delete(activity.id);
    return delay(undefined);
  },
  listContacts(accountId: number): Promise<Contact[]> {
    return delay([...contacts.values()].filter((c) => c.accountId === accountId));
  },
  listAccountDeals(accountId: number): Promise<Deal[]> {
    return delay([...deals.values()].filter((d) => d.accountId === accountId));
  },
  listActivities(accountId: number): Promise<Activity[]> {
    return delay([...activities.values()].filter((a) => a.accountId === accountId).sort((a, b) => b.at.localeCompare(a.at)));
  },

  // ---- deals ----
  listDeals(): Promise<Deal[]> {
    const failure = takeFailure("deals");
    if (failure) return Promise.reject(failure);
    return delay(allDeals().sort((a, b) => b.value - a.value));
  },
  getDeal(id: number): Promise<Deal> {
    const deal = deals.get(id);
    if (!deal) return Promise.reject(new Error(`Deal #${id} not found`));
    return delay(deal);
  },
  createDeal(input: DealInput): Promise<Deal> {
    const failure = takeFailure("create-deal");
    if (failure) return Promise.reject(failure);
    if (!accounts.has(input.accountId)) return Promise.reject(new Error(`Account #${input.accountId} not found`));
    const deal: Deal = { id: nextDealId++, ...input };
    deals.set(deal.id, deal);
    addActivity(deal.accountId, "meeting", `Deal created: ${deal.title}.`);
    return delay(deal, 320);
  },
  updateDeal(id: number, patch: Partial<DealInput>): Promise<Deal> {
    const failure = takeFailure("update-deal");
    if (failure) return Promise.reject(failure);
    const deal = deals.get(id);
    if (!deal) return Promise.reject(new Error(`Deal #${id} not found`));
    const next: Deal = { ...deal, ...patch };
    deals.set(id, next);
    addActivity(next.accountId, "note", `Deal updated: ${next.title}.`);
    return delay(next, 260);
  },
};
