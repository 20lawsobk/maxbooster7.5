export type ApiKeyScopeCategory = "feature" | "service";

export interface ApiKeyScopeDefinition {
  id: string;
  label: string;
  description: string;
  category: ApiKeyScopeCategory;
}

export const API_KEY_SCOPE_DEFINITIONS: ApiKeyScopeDefinition[] = [
  {
    id: "read",
    label: "Read",
    description: "Read-only access across available API resources.",
    category: "feature",
  },
  {
    id: "write",
    label: "Write",
    description: "Create and update access for mutable API resources.",
    category: "feature",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Administrative actions and elevated API operations.",
    category: "feature",
  },
  {
    id: "analytics",
    label: "Analytics Service",
    description: "Access analytics endpoints and reporting data.",
    category: "service",
  },
  {
    id: "distribution",
    label: "Distribution Service",
    description: "Access release distribution and status endpoints.",
    category: "service",
  },
  {
    id: "social",
    label: "Social Service",
    description: "Access social publishing and account integration endpoints.",
    category: "service",
  },
  {
    id: "billing",
    label: "Billing Service",
    description: "Access billing, subscription, and invoicing endpoints.",
    category: "service",
  },
];

export const API_KEY_VALID_SCOPES = new Set(
  API_KEY_SCOPE_DEFINITIONS.map((scope) => scope.id),
);
