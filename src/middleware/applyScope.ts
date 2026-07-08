import { Request } from "express";

interface ScopeResult {
  query:  string;
  params: (number | string)[];
}

export function applyScope(baseQuery: string, req: Request): ScopeResult {
  const user = req.user;

  if (!user) throw new Error("Unauthenticated");

  if (user.role === "Admin")
    return { query: baseQuery, params: [] };

  if (user.role === "Regional Officer")
    return {
      query:  baseQuery + " WHERE region_id = $1",
      params: [user.region_id!],
    };

  if (user.role === "District Officer")
    return {
      query:  baseQuery + " WHERE district_id = $1",
      params: [user.district_id!],
    };

  throw new Error("Access denied");
}