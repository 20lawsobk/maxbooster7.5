export type CognitiveEntityType =
  | "user"
  | "project"
  | "goal"
  | "task"
  | "agent"
  | "department"
  | "memory"
  | "tool"
  | "workflow"
  | "document"
  | "knowledge_node"
  | "event";

export type CognitiveRelationType =
  | "depends_on"
  | "related_to"
  | "created_by"
  | "assigned_to"
  | "improves"
  | "blocks"
  | "supports"
  | "owns"
  | "contains";

export interface CognitiveRelationship {
  id?: string;
  sourceId: string;
  targetId: string;
  relationType: CognitiveRelationType;
  createdAt?: Date | string;
}

export interface Entity {
  id: string;
  type: CognitiveEntityType;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  ownerId: string;
  tags: string[];
  metadata: Record<string, unknown>;
  relationships: CognitiveRelationship[];
}

export interface CognitiveUser extends Entity {
  type: "user";
  username: string | null;
  email: string;
  role: string;
  preferences: Record<string, unknown>;
  projects: string[];
  goals: string[];
}

export interface CognitiveProject extends Entity {
  type: "project";
  name: string;
  description: string;
  status: "planning" | "active" | "paused" | "completed" | "draft" | "unknown";
  goals: string[];
  agents: string[];
  tasks: string[];
  documents: string[];
}

export interface CognitiveGoal extends Entity {
  type: "goal";
  title: string;
  objective: string;
  priority: "low" | "medium" | "high" | "critical";
  progress: number;
  ownerAgent: string | null;
}

export interface CognitiveTask extends Entity {
  type: "task";
  title: string;
  description: string;
  status: "pending" | "active" | "blocked" | "complete";
  assignedAgent: string | null;
  parentTask?: string;
  dependencies: string[];
}

export interface CognitiveAgent extends Entity {
  type: "agent";
  name: string;
  specialty: string;
  departmentId: string | null;
  status: "active" | "busy" | "offline";
  tools: string[];
  memoryIds: string[];
  childAgents: string[];
  capabilities: string[];
  objectives: string[];
}

export interface CognitiveDepartment extends Entity {
  type: "department";
  name: string;
  leadAgent: string | null;
  members: string[];
  objectives: string[];
}

export interface CognitiveMemory extends Entity {
  type: "memory";
  memoryType: "working" | "episodic" | "semantic" | "project" | "system";
  content: string;
  embeddingId: string | null;
  confidence: number;
  importance: number;
  source: string;
}

export interface CognitiveMemoryShard {
  shardId: string;
  ownerId: string;
  category: string;
  memoryIds: string[];
  vectorIndex: string | null;
  size: number;
}

export interface CognitiveKnowledgeNode extends Entity {
  type: "knowledge_node";
  title: string;
  content: string;
  category: string;
  confidence: number;
}

export interface CognitiveTool extends Entity {
  type: "tool";
  name: string;
  category: string;
  endpoint: string | null;
  permissions: string[];
  enabled: boolean;
}

export interface CognitiveWorkflowStep {
  id: string;
  action: string;
  agentId: string | null;
  toolId: string | null;
  verificationRequired: boolean;
}

export interface CognitiveWorkflow extends Entity {
  type: "workflow";
  name: string;
  trigger: string;
  steps: CognitiveWorkflowStep[];
  status: string;
}

export interface CognitiveDocument extends Entity {
  type: "document";
  title: string;
  contentType: string;
  storageRef: string;
  checksum?: string;
}

export interface CognitiveEvent extends Entity {
  type: "event";
  eventType: string;
  sourceId: string;
  targetId?: string;
  payload: Record<string, unknown>;
}

export interface CognitiveContextPackage {
  query: string;
  relevantMemory: string[];
  activeProjects: string[];
  activeGoals: string[];
  activeAgents: string[];
  knowledgeNodes: string[];
  citations: string[];
  retrievedAt: Date | string;
  retrievalMethod:
    | "postgres_full_text"
    | "bounded_product_project_ranking"
    | "postgres_full_text+bounded_product_project_ranking";
}

export interface CognitiveModelRequest {
  conversationId: string;
  userId: string;
  contextPackage: CognitiveContextPackage;
  reasoningDepth: "fast" | "balanced" | "deep";
}

export interface CognitiveModelResponse {
  output: string;
  confidence: number;
  reasoningTime: number;
  citations: string[];
  followupActions: string[];
}

export interface CognitiveExpansionRule {
  id: string;
  triggerType: "memory" | "task_load" | "knowledge_growth" | "cpu_load" | "agent_load";
  threshold: number;
  action: "spawn_agent" | "create_department" | "create_shard" | "rebalance_memory";
}

export interface CognitiveOrganization {
  user: CognitiveUser;
  departments: CognitiveDepartment[];
  agents: CognitiveAgent[];
  knowledgeGraph: CognitiveKnowledgeNode[];
  memories: CognitiveMemory[];
  workflows: CognitiveWorkflow[];
  tools: CognitiveTool[];
  documents: CognitiveDocument[];
  events: CognitiveEvent[];
  projects: CognitiveProject[];
  goals: CognitiveGoal[];
  tasks: CognitiveTask[];
  relationships: CognitiveRelationship[];
  capabilities: {
    vectorSearch: boolean;
    agentExecution: boolean;
    toolExecution: boolean;
    eventBus: boolean;
    expansionManager: boolean;
    memorySharding: boolean;
  };
}

export interface CognitiveOrganizationResponse {
  status: "ok" | "degraded";
  organization: CognitiveOrganization;
  sourceStatuses: {
    productProjects: "available" | "unavailable";
    cognitiveEntities: "available" | "unavailable";
    relationships: "available" | "unavailable";
    capabilities: "available" | "unavailable";
  };
  bounds: {
    entities: number;
    relationships: number;
    projects: number;
    truncated: boolean;
  };
}
