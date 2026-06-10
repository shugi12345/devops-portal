import {
  CheckCircle2,
  ExternalLink,
  Filter,
  GitBranch,
  GitCommit,
  Plus,
  RefreshCcw,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addAdminComment,
  addComment,
  createTicket,
  getAdminTicket,
  getDemoUserRole,
  getMe,
  getRequestTypes,
  getTicket,
  listArgoCdProjects,
  listAdminTickets,
  listTickets,
  setDemoUserRole,
  updateAdminTicket
} from "./api";
import type { DemoUserRole } from "./api";
import type {
  ArgoCdApplicationSummary,
  ArgoCdDashboardTotals,
  CustomerStage,
  PortalUser,
  RequestTypeDefinition,
  TicketDetail,
  TicketSummary
} from "../server/types";

type ActiveTab = "tickets" | "argocd";

const stages: Array<CustomerStage | ""> = [
  "",
  "Submitted",
  "Triaged",
  "In Progress",
  "Waiting on Customer",
  "Resolved",
  "Closed"
];

const devopsAdmins = [
  { id: "morgan", name: "Morgan Admin" },
  { id: "taylor", name: "Taylor DevOps" },
  { id: "casey", name: "Casey Platform" },
  { id: "sam", name: "Sam Release" }
];

const statusMessagePrefix = "[status] ";

const emptyArgoTotals: ArgoCdDashboardTotals = {
  applications: 0,
  outOfSync: 0,
  degraded: 0,
  criticalApps: 0,
  prodApps: 0,
  autoSyncEnabled: 0,
  waitingForSync: 0,
  failedSync: 0,
  openPrs: 0,
  notOnBaseline: 0,
  chartDrift: 0,
  productionRisks: 0
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function stageClass(stage: string) {
  return `stage stage-${stage.toLowerCase().replaceAll(" ", "-")}`;
}

function isDone(ticket: TicketSummary) {
  return ticket.stage === "Resolved" || ticket.stage === "Closed";
}

function removeFromSet(current: Set<string>, value: string) {
  const next = new Set(current);
  next.delete(value);
  return next;
}

function isStatusMessage(body: string) {
  return body.startsWith(statusMessagePrefix);
}

function statusMessage(body: string) {
  return `${statusMessagePrefix}${body}`;
}

function statusMessageText(body: string) {
  return body.slice(statusMessagePrefix.length);
}

export function App() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [requestTypes, setRequestTypes] = useState<RequestTypeDefinition[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [adminTickets, setAdminTickets] = useState<TicketSummary[]>([]);
  const [argoApplications, setArgoApplications] = useState<ArgoCdApplicationSummary[]>([]);
  const [argoTotals, setArgoTotals] = useState<ArgoCdDashboardTotals>(emptyArgoTotals);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [selectedAdminTicket, setSelectedAdminTicket] = useState<TicketDetail | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("tickets");
  const [isAdmin, setIsAdmin] = useState(false);
  const [demoRole, setDemoRole] = useState<DemoUserRole>(() => getDemoUserRole());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [ticketOwners, setTicketOwners] = useState<Record<string, string>>({});
  const [adminUnreadTicketIds, setAdminUnreadTicketIds] = useState<Set<string>>(() => new Set());
  const [developerUnreadTicketIds, setDeveloperUnreadTicketIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [argoLoading, setArgoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [argoError, setArgoError] = useState<string | null>(null);

  async function refreshTickets() {
    const result = await listTickets({ scope: "mine" });
    setTickets(result.tickets);
    if (selectedTicket && !result.tickets.some((ticket) => ticket.id === selectedTicket.id)) {
      setSelectedTicket(null);
    }
  }

  async function refreshAdminTickets() {
    if (!isAdmin) {
      return;
    }
    const result = await listAdminTickets({});
    setAdminTickets(result.tickets);
    if (selectedAdminTicket && !result.tickets.some((ticket) => ticket.id === selectedAdminTicket.id)) {
      setSelectedAdminTicket(null);
    }
  }

  async function refreshArgoCdProjects() {
    setArgoLoading(true);
    setArgoError(null);
    try {
      const result = await listArgoCdProjects();
      setArgoApplications(result.applications);
      setArgoTotals(result.totals);
    } catch (err) {
      setArgoError(err instanceof Error ? err.message : "Failed to load Argo CD projects");
    } finally {
      setArgoLoading(false);
    }
  }

  async function loadPortalData() {
    setLoading(true);
    setError(null);
    const [me, catalog, ticketResult] = await Promise.all([getMe(), getRequestTypes(), listTickets({ scope: "mine" })]);
    setUser(me.user);
    setIsAdmin(me.isAdmin);
    setRequestTypes(catalog.requestTypes);
    setTickets(ticketResult.tickets);
    setSelectedTicket(null);
    setSelectedAdminTicket(null);
    if (me.isAdmin) {
      const adminResult = await listAdminTickets({});
      setAdminTickets(adminResult.tickets);
    } else {
      setAdminTickets([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([getMe(), getRequestTypes(), listTickets({ scope: "mine" })])
      .then(async ([me, catalog, ticketResult]) => {
        if (!mounted) {
          return;
        }
        setUser(me.user);
        setIsAdmin(me.isAdmin);
        setRequestTypes(catalog.requestTypes);
        setTickets(ticketResult.tickets);
        if (me.isAdmin) {
          const adminResult = await listAdminTickets({});
          if (mounted) {
            setAdminTickets(adminResult.tickets);
          }
        } else {
          setAdminTickets([]);
          setSelectedAdminTicket(null);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, [demoRole]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    const handle = window.setTimeout(() => {
      refreshAdminTickets().catch((err: Error) => setError(err.message));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab !== "argocd" || argoApplications.length > 0 || argoLoading) {
      return;
    }
    setArgoLoading(true);
    listArgoCdProjects()
      .then((dashboard) => {
        setArgoApplications(dashboard.applications);
        setArgoTotals(dashboard.totals);
      })
      .catch((err: Error) => setArgoError(err.message))
      .finally(() => setArgoLoading(false));
  }, [activeTab, argoApplications.length, argoLoading]);

  async function openTicket(id: string) {
    setError(null);
    setDeveloperUnreadTicketIds((current) => removeFromSet(current, id));
    const result = await getTicket(id);
    setSelectedTicket(result.ticket);
    setSelectedAdminTicket(null);
  }

  async function openAdminTicket(id: string) {
    setError(null);
    setAdminUnreadTicketIds((current) => removeFromSet(current, id));
    const result = await getAdminTicket(id);
    setSelectedAdminTicket(result.ticket);
    setSelectedTicket(null);
  }

  async function reloadAdminTicket(id: string) {
    const result = await getAdminTicket(id);
    setSelectedAdminTicket(result.ticket);
    await refreshAdminTickets();
  }

  async function handleCreated(ticket: TicketDetail) {
    setIsCreateOpen(false);
    setSelectedTicket(ticket);
    setSelectedAdminTicket(null);
    setAdminUnreadTicketIds((current) => new Set(current).add(ticket.id));
    await refreshTickets();
  }

  function changeDemoRole(role: DemoUserRole) {
    setDemoUserRole(role);
    setDemoRole(role);
  }

  function notifyDevelopers(ticketId: string) {
    setDeveloperUnreadTicketIds((current) => new Set(current).add(ticketId));
  }

  function notifyAdmins(ticketId: string) {
    setAdminUnreadTicketIds((current) => new Set(current).add(ticketId));
  }

  const activeTickets = useMemo(() => tickets.filter((ticket) => !isDone(ticket)), [tickets]);
  const doneTickets = useMemo(() => tickets.filter(isDone), [tickets]);
  const activeAdminTickets = useMemo(() => adminTickets.filter((ticket) => !isDone(ticket)), [adminTickets]);
  const doneAdminTickets = useMemo(() => adminTickets.filter(isDone), [adminTickets]);
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">DevOps</div>

        <nav className="app-nav" aria-label="Primary navigation">
          <button className={activeTab === "tickets" ? "nav-button active" : "nav-button"} onClick={() => setActiveTab("tickets")}>
            {isAdmin ? <ShieldCheck aria-hidden="true" /> : <Filter aria-hidden="true" />}
            {isAdmin ? "Admin Queue" : "Tickets"}
          </button>
          <button className={activeTab === "argocd" ? "nav-button active" : "nav-button"} onClick={() => setActiveTab("argocd")}>
            <GitBranch aria-hidden="true" />
            Argo CD
          </button>
        </nav>

        <div className="header-actions">
          <div className="user-box">
            <span>{user?.displayName ?? "Signed in user"}</span>
          </div>

          <div className="demo-switch" aria-label="Demo user switcher">
            <div className="role-toggle">
              <button className={demoRole === "regular" ? "active" : ""} onClick={() => changeDemoRole("regular")}>
                Regular
              </button>
              <button className={demoRole === "admin" ? "active" : ""} onClick={() => changeDemoRole("admin")}>
                Admin
              </button>
            </div>
          </div>

          <button
            className="ghost-button"
            onClick={() =>
              activeTab === "argocd"
                ? refreshArgoCdProjects()
                : loadPortalData().catch((err: Error) => setError(err.message))
            }
          >
            <RefreshCcw size={17} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      <main className="main">
        <header className="topbar">
          <h1>{activeTab === "argocd" ? "Argo CD" : isAdmin ? "Queue" : "Tasks"}</h1>
          {activeTab === "tickets" && !isAdmin && (
            <button className="primary" onClick={() => setIsCreateOpen(true)}>
              <Plus size={18} aria-hidden="true" /> New
            </button>
          )}
        </header>

        {activeTab === "argocd" ? (
          <ArgoCdView
            loading={argoLoading}
            error={argoError}
            applications={argoApplications}
            totals={argoTotals}
            onRefresh={refreshArgoCdProjects}
          />
        ) : (
        <>
        {error && <div className="error-banner">{error}</div>}
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : isAdmin ? (
          <div className="workspace-grid">
            <div className="ticket-column">
              <section className="ticket-list-panel" aria-label="Admin tickets">
                <div className="ticket-list">
                  {activeAdminTickets.map((ticket) => (
                    <button
                      className={selectedAdminTicket?.id === ticket.id ? "ticket-row selected" : "ticket-row"}
                      key={ticket.id}
                      onClick={() => openAdminTicket(ticket.id).catch((err: Error) => setError(err.message))}
                    >
                      {adminUnreadTicketIds.has(ticket.id) && <span className="update-dot" aria-label="Updated" />}
                      <span className={stageClass(ticket.stage)}>{ticket.stage}</span>
                      <strong>{ticket.title}</strong>
                      <small>{ticket.id}</small>
                    </button>
                  ))}
                  {activeAdminTickets.length === 0 && <div className="empty-state">No tasks.</div>}
                </div>
              </section>

              {doneAdminTickets.length > 0 && (
                <details className="ticket-list-panel done-panel" aria-label="Done admin tickets">
                  <summary>Done</summary>
                  <div className="ticket-list">
                    {doneAdminTickets.map((ticket) => (
                      <button
                        className={selectedAdminTicket?.id === ticket.id ? "ticket-row selected" : "ticket-row"}
                        key={ticket.id}
                        onClick={() => openAdminTicket(ticket.id).catch((err: Error) => setError(err.message))}
                      >
                        {adminUnreadTicketIds.has(ticket.id) && <span className="update-dot" aria-label="Updated" />}
                        <span className={stageClass(ticket.stage)}>{ticket.stage}</span>
                        <strong>{ticket.title}</strong>
                        <small>{ticket.id}</small>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <section className="detail-panel" aria-label="Task detail">
              {selectedAdminTicket ? (
                <AdminTicketDetail
                  assignee={ticketOwners[selectedAdminTicket.id] ?? ""}
                  currentUserName={user?.displayName ?? ""}
                  onAssigneeChange={async (assignee) => {
                    setTicketOwners((current) => ({ ...current, [selectedAdminTicket.id]: assignee }));
                    const ownerName = devopsAdmins.find((admin) => admin.id === assignee)?.name ?? "Unassigned";
                    await addAdminComment(selectedAdminTicket.id, statusMessage(`Owner changed to ${ownerName}.`));
                    await reloadAdminTicket(selectedAdminTicket.id);
                    notifyDevelopers(selectedAdminTicket.id);
                  }}
                  onReload={() => reloadAdminTicket(selectedAdminTicket.id)}
                  onUpdated={() => notifyDevelopers(selectedAdminTicket.id)}
                  ticket={selectedAdminTicket}
                />
              ) : (
                <div className="empty-state">Select a task.</div>
              )}
            </section>
          </div>
        ) : (
          <div className="workspace-grid">
            <div className="ticket-column">
              <section className="ticket-list-panel" aria-label="Tickets">
                <div className="ticket-list">
                  {activeTickets.map((ticket) => (
                    <button
                      className={selectedTicket?.id === ticket.id ? "ticket-row selected" : "ticket-row"}
                      key={ticket.id}
                      onClick={() => openTicket(ticket.id).catch((err: Error) => setError(err.message))}
                    >
                      {developerUnreadTicketIds.has(ticket.id) && <span className="update-dot" aria-label="Updated" />}
                      <span className={stageClass(ticket.stage)}>{ticket.stage}</span>
                      <strong>{ticket.title}</strong>
                      <small>{ticket.id}</small>
                    </button>
                  ))}
                  {activeTickets.length === 0 && <div className="empty-state">No tasks.</div>}
                </div>
              </section>

              {doneTickets.length > 0 && (
                <details className="ticket-list-panel done-panel" aria-label="Done tickets">
                  <summary>Done</summary>
                  <div className="ticket-list">
                    {doneTickets.map((ticket) => (
                      <button
                        className={selectedTicket?.id === ticket.id ? "ticket-row selected" : "ticket-row"}
                        key={ticket.id}
                        onClick={() => openTicket(ticket.id).catch((err: Error) => setError(err.message))}
                      >
                        {developerUnreadTicketIds.has(ticket.id) && <span className="update-dot" aria-label="Updated" />}
                        <span className={stageClass(ticket.stage)}>{ticket.stage}</span>
                        <strong>{ticket.title}</strong>
                        <small>{ticket.id}</small>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="content-column">
              <section className="detail-panel" aria-label="Task detail">
                {selectedTicket ? (
                  <TicketDetailView
                    onCommentAdded={() => openTicket(selectedTicket.id)}
                    onUpdated={() => notifyAdmins(selectedTicket.id)}
                    ticket={selectedTicket}
                  />
                ) : (
                  <div className="empty-state">Select a task.</div>
                )}
              </section>
            </div>
          </div>
        )}
        </>
        )}

        {isCreateOpen && activeTab === "tickets" && !isAdmin && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-ticket-title">
              <div className="modal-heading">
                <h2 id="create-ticket-title">New</h2>
                <button className="icon-button" aria-label="Close new request" onClick={() => setIsCreateOpen(false)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <CreateTicketView requestTypes={requestTypes} onCreated={handleCreated} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function argoStatusClass(value: string) {
  return `argo-badge argo-${value.toLowerCase().replaceAll(" ", "-")}`;
}

function argoEnvClass(value: string) {
  return `argo-badge argo-env-${value}`;
}

function formatMaybeDate(value?: string) {
  return value ? formatDate(value) : "Never";
}

function shortHash(value: string) {
  return value && value !== "HEAD" ? value.slice(0, 7) : value || "Unknown";
}

type ArgoQuickFilter = "all" | "prod" | "outofsync" | "failed";

function ArgoCdView({
  applications,
  error,
  loading,
  onRefresh,
  totals
}: {
  applications: ArgoCdApplicationSummary[];
  error: string | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  totals: ArgoCdDashboardTotals;
}) {
  const [quickFilter, setQuickFilter] = useState<ArgoQuickFilter>("all");

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      if (quickFilter === "prod" && app.environment !== "prd") return false;
      if (quickFilter === "outofsync" && app.syncStatus !== "OutOfSync") return false;
      if (quickFilter === "failed" && app.lastSyncResult !== "Failed" && app.lastSyncResult !== "Error") return false;
      return true;
    });
  }, [applications, quickFilter]);

  const quickFilters: Array<{ id: ArgoQuickFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "prod", label: "PRD only" },
    { id: "outofsync", label: "OutOfSync" },
    { id: "failed", label: "Failed sync" }
  ];

  return (
    <div className="argo-space">
      {error && (
        <div className="error-banner">
          {error}
          <button className="ghost-button" onClick={() => onRefresh()}>
            <RefreshCcw size={16} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      <section className="argo-summary" aria-label="Argo CD summary">
        <div className={totals.outOfSync > 0 ? "risk-card warning" : "risk-card"}>
          <span>OutOfSync</span>
          <strong>{totals.outOfSync}</strong>
        </div>
        <div>
          <span>Applications</span>
          <strong>{totals.applications}</strong>
        </div>
        <div>
          <span>PRD apps</span>
          <strong>{totals.prodApps}</strong>
        </div>
        <div>
          <span>Failed sync</span>
          <strong>{totals.failedSync}</strong>
        </div>
      </section>

      {loading ? (
        <div className="empty-state">Loading Argo CD...</div>
      ) : applications.length === 0 ? (
        <div className="empty-state">No Argo CD applications visible.</div>
      ) : (
        <>
          <section className="argo-controls" aria-label="Argo CD filters">
            <div className="argo-quick-filters">
              {quickFilters.map((filter) => (
                <button className={quickFilter === filter.id ? "active" : ""} key={filter.id} onClick={() => setQuickFilter(filter.id)}>
                  {filter.label}
                </button>
              ))}
            </div>
          </section>

          <div className="simple-app-grid" aria-label="Argo CD applications">
            {filteredApplications.map((app) => (
              <SimpleArgoAppBox app={app} key={`${app.namespace}/${app.name}`} />
            ))}
            {filteredApplications.length === 0 && <div className="empty-state">No applications match the current filter.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function SimpleArgoAppBox({ app }: { app: ArgoCdApplicationSummary }) {
  return (
    <article className="simple-app-box">
      <div className="simple-app-heading">
        <div>
          <strong>{app.name}</strong>
          <small>{app.namespace} / {app.project}</small>
        </div>
        <span className={app.criticality === "critical" ? "argo-badge argo-danger" : "argo-badge"}>{app.criticality}</span>
      </div>

      <div className="simple-status-row">
        <span className={argoEnvClass(app.environment)}>{app.environment.toUpperCase()}</span>
        <span className={argoStatusClass(app.syncStatus)}>{app.syncStatus}</span>
        <span className={argoStatusClass(app.healthStatus)}>{app.healthStatus}</span>
        <span className={app.automated ? "argo-badge argo-auto" : "argo-badge"}>{app.syncMode}</span>
      </div>

      <dl className="simple-app-meta">
        <div><dt>Chart</dt><dd>{app.chartName}</dd></div>
        <div><dt>Chart version</dt><dd>{app.chartVersion}</dd></div>
        <div><dt>Image</dt><dd>{app.desiredImage}</dd></div>
        <div><dt>Repo</dt><dd>{app.repoName}</dd></div>
        <div><dt>Branch</dt><dd>{app.targetRevision}</dd></div>
        <div><dt>Commit</dt><dd>{shortHash(app.lastCommitHash)}</dd></div>
        <div><dt>Last sync</dt><dd>{formatMaybeDate(app.lastSyncedAt)}</dd></div>
        <div><dt>Sync result</dt><dd>{app.lastSyncResult}</dd></div>
      </dl>

      <div className="simple-app-actions">
        {app.links.git && <a href={app.links.git} target="_blank" rel="noreferrer"><GitBranch size={15} aria-hidden="true" /> Repo</a>}
        {app.links.commit && <a href={app.links.commit} target="_blank" rel="noreferrer"><GitCommit size={15} aria-hidden="true" /> Commit</a>}
        <a href={app.links.argoCd} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /> Argo CD</a>
      </div>
    </article>
  );
}

function AdminTicketDetail({
  assignee,
  currentUserName,
  onAssigneeChange,
  onReload,
  onUpdated,
  ticket
}: {
  assignee: string;
  currentUserName: string;
  onAssigneeChange: (assignee: string) => Promise<void>;
  onReload: () => Promise<void>;
  onUpdated: () => void;
  ticket: TicketDetail;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [stage, setStage] = useState<CustomerStage>(ticket.stage);
  const [rawStatus, setRawStatus] = useState(ticket.rawStatus);
  const [teamGroups, setTeamGroups] = useState(ticket.teamGroups.join(", "));
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTitle(ticket.title);
    setStage(ticket.stage);
    setRawStatus(ticket.rawStatus);
    setTeamGroups(ticket.teamGroups.join(", "));
    setBody("");
  }, [ticket.id, ticket.title, ticket.stage, ticket.rawStatus, ticket.teamGroups]);

  async function submitUpdate(event: FormEvent) {
    event.preventDefault();
    const changes = [
      title !== ticket.title ? `Title changed to "${title}"` : "",
      stage !== ticket.stage ? `Stage changed to ${stage}` : ""
    ].filter(Boolean);
    setSubmitting(true);
    try {
      await updateAdminTicket(ticket.id, {
        title,
        stage,
        rawStatus,
        teamGroups: teamGroups
          .split(",")
          .map((group) => group.trim())
          .filter(Boolean)
      });
      if (changes.length > 0) {
        await addAdminComment(ticket.id, statusMessage(`${changes.join(". ")}.`));
      }
      await onReload();
      onUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitResponse(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await addAdminComment(ticket.id, body);
      setBody("");
      await onReload();
      onUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="ticket-detail">
      <div className="detail-heading">
        <div>
          <span className={stageClass(ticket.stage)}>{ticket.stage}</span>
          <h2>{ticket.title}</h2>
          <p>{ticket.id}</p>
        </div>
        <label className="owner-select">
          <span>Owner</span>
          <div className="owner-controls">
            <select value={assignee} onChange={(event) => onAssigneeChange(event.target.value).catch(() => undefined)}>
              <option value="">Unassigned</option>
              {devopsAdmins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </select>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                const me = devopsAdmins.find((admin) => admin.name === currentUserName) ?? devopsAdmins[0];
                onAssigneeChange(me.id).catch(() => undefined);
              }}
            >
              Me
            </button>
          </div>
        </label>
      </div>

      <p className="description-text">{ticket.description}</p>

      <form className="admin-edit-form" onSubmit={submitUpdate}>
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          <span>Stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value as CustomerStage)}>
            {stages.filter(Boolean).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={submitting}>
          <CheckCircle2 size={18} aria-hidden="true" /> Save
        </button>
      </form>

      <section>
        <h3>Messages</h3>
        <div className="comments">
          {ticket.comments.map((comment) => (
            isStatusMessage(comment.body) ? (
              <div className="status-row" key={comment.id}>
                <span>{statusMessageText(comment.body)}</span>
                <small>{formatDate(comment.createdAt)}</small>
              </div>
            ) : (
              <div className="comment" key={comment.id}>
                <strong>{comment.authorName}</strong>
                <small>{formatDate(comment.createdAt)}</small>
                <p>{comment.body}</p>
              </div>
            )
          ))}
          {ticket.comments.length === 0 && <div className="empty-state">No messages.</div>}
        </div>
        <form className="comment-form" onSubmit={submitResponse}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Message"
            required
          />
          <button className="primary" disabled={submitting || !body.trim()}>
            <MessageSquarePlus size={18} aria-hidden="true" /> Send
          </button>
        </form>
      </section>
    </article>
  );
}

function TicketDetailView({
  onCommentAdded,
  onUpdated,
  ticket
}: {
  onCommentAdded: () => Promise<void>;
  onUpdated: () => void;
  ticket: TicketDetail;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await addComment(ticket.id, body);
      setBody("");
      onUpdated();
      await onCommentAdded();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="ticket-detail">
      <div className="detail-heading">
        <span className={stageClass(ticket.stage)}>{ticket.stage}</span>
        <h2>{ticket.title}</h2>
        <p>{ticket.id}</p>
      </div>

      <p className="description-text">{ticket.description}</p>

      <section>
        <h3>Messages</h3>
        <div className="comments">
          {ticket.comments.map((comment) => (
            isStatusMessage(comment.body) ? (
              <div className="status-row" key={comment.id}>
                <span>{statusMessageText(comment.body)}</span>
                <small>{formatDate(comment.createdAt)}</small>
              </div>
            ) : (
              <div className="comment" key={comment.id}>
                <strong>{comment.authorName}</strong>
                <small>{formatDate(comment.createdAt)}</small>
                <p>{comment.body}</p>
              </div>
            )
          ))}
          {ticket.comments.length === 0 && <div className="empty-state">No messages.</div>}
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Message" required />
          <button className="primary" disabled={submitting || !body.trim()}>
            <MessageSquarePlus size={18} aria-hidden="true" /> Send
          </button>
        </form>
      </section>
    </article>
  );
}

function CreateTicketView({
  requestTypes,
  onCreated
}: {
  requestTypes: RequestTypeDefinition[];
  onCreated: (ticket: TicketDetail) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selected = requestTypes[0];

  useEffect(() => {
    setTitle("");
    setDescription("");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    const fields = Object.fromEntries(
      selected.fields.map((field) => {
        if (field.name === "title") {
          return [field.name, title];
        }
        if (field.name === "description") {
          return [field.name, description];
        }
        return [field.name, field.options?.[0] ?? title];
      })
    );
    setSubmitting(true);
    try {
      const result = await createTicket({
        requestType: selected.id,
        fields,
        idempotencyKey: crypto.randomUUID()
      });
      await onCreated(result.ticket);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="create-grid">
      {selected && (
        <form className="request-form" onSubmit={submit}>
          <label>
            <span>Name</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>
          <button className="primary" disabled={submitting}>
            <Send size={18} aria-hidden="true" /> Submit
          </button>
        </form>
      )}
    </div>
  );
}
