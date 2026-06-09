import type { NextFunction, Request, Response } from "express";
import type { PortalUser } from "./types";

declare global {
  namespace Express {
    interface Request {
      user?: PortalUser;
    }
  }
}

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function userFromSsoHeaders(req: Request): PortalUser {
  const id = readHeader(req.headers["x-forwarded-user"]) ?? readHeader(req.headers["x-user-id"]) ?? "u-alex";
  const email =
    readHeader(req.headers["x-forwarded-email"]) ?? readHeader(req.headers["x-user-email"]) ?? `${id}@example.com`;
  const displayName = readHeader(req.headers["x-forwarded-preferred-username"]) ?? readHeader(req.headers["x-user-name"]) ?? id;
  const rawGroups =
    readHeader(req.headers["x-forwarded-groups"]) ?? readHeader(req.headers["x-user-groups"]) ?? "team-alpha";

  return {
    id,
    email,
    displayName,
    groups: rawGroups
      .split(",")
      .map((group) => group.trim())
      .filter(Boolean)
  };
}

export function requireSession(req: Request, _res: Response, next: NextFunction) {
  req.user = userFromSsoHeaders(req);
  next();
}

export const adminGroup = process.env.ADMIN_GROUP ?? "portal-admins";

export function isAdmin(user: PortalUser) {
  return user.groups.includes(adminGroup);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdmin(req.user)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
