import type { AdminTicketUpdate, PortalUser, RequestTypeDefinition, TicketDetail, TicketSummary } from "../server/types";

export type DemoUserRole = "regular" | "admin";

export const demoUsers: Record<DemoUserRole, { label: string; headers: Record<string, string> }> = {
  regular: {
    label: "Regular user",
    headers: {
      "x-user-id": "u-alex",
      "x-user-name": "Alex Morgan",
      "x-user-email": "alex@example.com",
      "x-user-groups": "team-alpha"
    }
  },
  admin: {
    label: "Admin user",
    headers: {
      "x-user-id": "u-admin",
      "x-user-name": "Morgan Admin",
      "x-user-email": "morgan.admin@example.com",
      "x-user-groups": "team-alpha,portal-admins"
    }
  }
};

const demoUserStorageKey = "devops-portal-demo-user";

export function getDemoUserRole(): DemoUserRole {
  const value = window.localStorage.getItem(demoUserStorageKey);
  return value === "admin" ? "admin" : "regular";
}

export function setDemoUserRole(role: DemoUserRole) {
  window.localStorage.setItem(demoUserStorageKey, role);
}

function getDemoHeaders() {
  return demoUsers[getDemoUserRole()].headers;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getDemoHeaders(),
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getMe() {
  return request<{ user: PortalUser; isAdmin: boolean }>("/api/me");
}

export function getRequestTypes() {
  return request<{ requestTypes: RequestTypeDefinition[] }>("/api/request-types");
}

export function listTickets(params: { scope: "mine" | "team"; status?: string; query?: string }) {
  const search = new URLSearchParams({ scope: params.scope });
  if (params.status) {
    search.set("status", params.status);
  }
  if (params.query) {
    search.set("query", params.query);
  }
  return request<{ tickets: TicketSummary[] }>(`/api/tickets?${search}`);
}

export function getTicket(id: string) {
  return request<{ ticket: TicketDetail }>(`/api/tickets/${id}`);
}

export function createTicket(payload: { requestType: string; fields: Record<string, string>; idempotencyKey: string }) {
  return request<{ ticket: TicketDetail }>("/api/tickets", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function addComment(ticketId: string, body: string) {
  return request<{ comment: TicketDetail["comments"][number] }>(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function listAdminTickets(params: { status?: string; query?: string }) {
  const search = new URLSearchParams();
  if (params.status) {
    search.set("status", params.status);
  }
  if (params.query) {
    search.set("query", params.query);
  }
  return request<{ tickets: TicketSummary[] }>(`/api/admin/tickets?${search}`);
}

export function getAdminTicket(id: string) {
  return request<{ ticket: TicketDetail }>(`/api/admin/tickets/${id}`);
}

export function updateAdminTicket(ticketId: string, payload: AdminTicketUpdate) {
  return request<{ ticket: TicketDetail }>(`/api/admin/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function addAdminComment(ticketId: string, body: string) {
  return request<{ comment: TicketDetail["comments"][number] }>(`/api/admin/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}
