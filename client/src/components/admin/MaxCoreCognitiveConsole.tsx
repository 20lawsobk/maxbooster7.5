import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Bot, Database, RefreshCw, Search, Waypoints } from "lucide-react";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const API = "/api/maxcore/cognitive";
const QUERY_ROOT = ["maxcore-cognitive"];

type JsonRecord = Record<string, unknown>;
type ApiResult = { httpStatus: number; data: JsonRecord };
type Entity = JsonRecord & { id?: string };

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function apiResult(
  path: string,
  options: RequestInit = {},
  allowNotReady = false,
): Promise<ApiResult> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json", ...options.headers },
    ...options,
  });
  const text = await response.text();
  let data: JsonRecord = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (isRecord(parsed)) data = parsed;
  } catch {
    data = {};
  }
  if (
    !response.ok &&
    !(allowNotReady && response.status === 503) &&
    response.status !== 207
  ) {
    const message =
      typeof data.error === "string"
        ? data.error
        : `MaxCore request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return { httpStatus: response.status, data };
}

async function postJson(path: string, body: JsonRecord): Promise<ApiResult> {
  const csrfToken = getCsrfTokenFromCookie();
  return apiResult(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

function arrayOf(value: unknown): Entity[] {
  return Array.isArray(value)
    ? value.filter(isRecord) as Entity[]
    : [];
}

function entityValue(entity: Entity, key: string): unknown {
  if (key in entity) return entity[key];
  const data = isRecord(entity.data) ? entity.data : null;
  if (data && key in data) return data[key];
  const payload = isRecord(entity.payload) ? entity.payload : null;
  return payload && key in payload ? payload[key] : undefined;
}

function textValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}

function Capability({ name, enabled }: { name: string; enabled: boolean }) {
  return (
    <Badge variant={enabled ? "default" : "outline"} aria-label={`${name}: ${enabled ? "available" : "unavailable"}`}>
      {name}: {enabled ? "available" : "unavailable"}
    </Badge>
  );
}

export function MaxCoreCognitiveConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [agentName, setAgentName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [assignedAgent, setAssignedAgent] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Entity[]>([]);

  const status = useQuery({
    queryKey: [...QUERY_ROOT, "status"],
    queryFn: () => apiResult(`${API}/status`, {}, true),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const organization = useQuery({
    queryKey: [...QUERY_ROOT, "organization"],
    queryFn: () => apiResult(`${API}/organization`),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const expansion = useQuery({
    queryKey: [...QUERY_ROOT, "expansion"],
    queryFn: () => apiResult(`${API}/expansion/status`),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const tools = useQuery({
    queryKey: [...QUERY_ROOT, "tools"],
    queryFn: () => apiResult(`${API}/tools/catalog`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const invalidateCognitive = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_ROOT });
  };
  const createAgent = useMutation({
    mutationFn: async () => postJson(`${API}/agent`, {
      data: {
        name: agentName.trim(),
        specialty: specialty.trim(),
        status: "offline",
        tools: [],
        memoryIds: [],
        childAgents: [],
        capabilities: ["maxcore_text_task_execution"],
        objectives: [],
      },
      tags: [],
      metadata: {},
    }),
    onSuccess: async () => {
      setAgentName("");
      setSpecialty("");
      toast({ title: "Agent registered", description: "The agent is stored as offline until assigned and actually run." });
      await invalidateCognitive();
    },
  });
  const createTask = useMutation({
    mutationFn: async () => postJson(`${API}/task`, {
      data: {
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        status: "pending",
        assignedAgent,
        dependencies: [],
      },
      tags: [],
      metadata: {},
    }),
    onSuccess: async () => {
      setTaskTitle("");
      setTaskDescription("");
      toast({ title: "Task saved", description: "The task is persisted. It is not marked complete until MaxCore returns a verified result." });
      await invalidateCognitive();
    },
  });
  const createMemory = useMutation({
    mutationFn: async () => postJson(`${API}/memory`, {
      data: {
        memoryType: "episodic",
        content: memoryContent.trim(),
        embeddingId: null,
        confidence: 0.5,
        importance: 0.5,
        source: "owner_authored",
      },
      tags: [],
      metadata: { provenance: "authenticated_owner_input" },
    }),
    onSuccess: async () => {
      setMemoryContent("");
      toast({ title: "Memory saved", description: "The owner-authored memory is now in the account’s persistent MaxCore registry." });
      await invalidateCognitive();
    },
  });
  const executeTask = useMutation({
    mutationFn: async (task: Entity) => {
      const id = typeof task.id === "string" ? task.id : "";
      const retryBlocked = entityValue(task, "status") === "blocked";
      if (!id) throw new Error("Task has no valid identifier.");
      return postJson(`${API}/tasks/${encodeURIComponent(id)}/execute`, { retryBlocked });
    },
    onSuccess: async () => {
      toast({ title: "Task run finished", description: "The server returned a verified task outcome." });
      await invalidateCognitive();
    },
  });
  const searchTool = useMutation({
    mutationFn: async () => {
      const result = await postJson(`${API}/tools/database/execute`, {
        query: searchText.trim(),
        limit: 10,
      });
      setSearchResults(arrayOf(result.data.results));
      return result;
    },
  });

  const statusData = status.data?.data ?? {};
  const capabilities = isRecord(statusData)
    ? statusData
    : {};
  const ready = statusData.ready === true && status.data?.httpStatus === 200;
  const org = isRecord(organization.data?.data.organization)
    ? organization.data?.data.organization
    : {};
  const agents = arrayOf(org.agents);
  const tasks = arrayOf(org.tasks);
  const memories = arrayOf(org.memories);
  const projects = arrayOf(org.projects);
  const goals = arrayOf(org.goals);
  const knowledge = arrayOf(org.knowledgeGraph);
  const relationships = arrayOf(org.relationships);
  const events = arrayOf(org.events).slice(0, 8);
  const expansionData = expansion.data?.data ?? {};
  const expansionRule = isRecord(expansionData.rule) ? expansionData.rule : {};
  const toolList = arrayOf(tools.data?.data.tools);
  const databaseTool = toolList.find((tool) => tool.id === "database");
  const databaseToolEnabled = databaseTool?.enabled === true;
  const blockers = Array.isArray(statusData.blockers)
    ? statusData.blockers.filter((item): item is string => typeof item === "string")
    : [];
  const runnableTasks = tasks.filter((task) => {
    const state = entityValue(task, "status");
    return state === "pending" || state === "blocked";
  });

  return (
    <Card data-testid="maxcore-cognitive-console" aria-labelledby="maxcore-cognitive-title">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle id="maxcore-cognitive-title" className="flex items-center gap-2">
            <Activity className="h-5 w-5" aria-hidden="true" />
            MaxCore Cognitive Runtime
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Owner-scoped memory, projects, agents, tasks, events and tools. Model readiness is reported separately from API liveness.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void invalidateCognitive()}
          aria-label="Refresh MaxCore cognitive status"
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {status.isError || organization.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {status.isError
                ? errorMessage(status.error)
                : errorMessage(organization.error)}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert role={ready ? "status" : "alert"} variant={ready ? "default" : "destructive"}>
              <AlertDescription>
                {ready
                  ? "Cognitive registry and MaxCore model readiness are both confirmed."
                  : `Cognitive runtime is degraded. Model ready: ${statusData.maxcoreModelReady === true ? "yes" : "no"}. ${blockers.length ? `Blockers: ${blockers.join(", ")}.` : status.data?.httpStatus === 503 ? "MaxCore returned HTTP 503." : "Waiting for fresh status."}`}
              </AlertDescription>
            </Alert>

            <section aria-label="MaxCore capabilities" className="flex flex-wrap gap-2">
              <Capability name="Model inference" enabled={statusData.maxcoreModelReady === true} />
              <Capability name="Agent task execution" enabled={statusData.agentExecutionReady === true} />
              <Capability name="Read-only search tool" enabled={databaseToolEnabled} />
              <Capability name="Event notifications" enabled={capabilities.eventBus === true} />
              <Capability name="Task-load expansion" enabled={capabilities.expansionManager === true} />
              <Capability name="Memory sharding" enabled={capabilities.memorySharding === true} />
              <Capability name="Vector search" enabled={capabilities.vectorSearch === true} />
            </section>

            <section aria-labelledby="maxcore-counts-title">
              <h3 id="maxcore-counts-title" className="mb-1 font-medium">Loaded account records</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                This view is capped at 100 records per entity type; these are loaded counts, not database totals.
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                {[
                  ["Projects", projects.length],
                  ["Tasks", tasks.length],
                  ["Agents", agents.length],
                  ["Memories", memories.length],
                  ["Goals", goals.length],
                  ["Knowledge nodes", knowledge.length],
                  ["Graph links", relationships.length],
                  ["Recent events", events.length],
                  ["Pending or blocked", runnableTasks.length],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-md border p-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">{count}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-md border p-4" aria-labelledby="maxcore-expansion-title">
              <h3 id="maxcore-expansion-title" className="flex items-center gap-2 font-medium">
                <Waypoints className="h-4 w-4" aria-hidden="true" />
                Bounded agent expansion
              </h3>
              {expansion.isError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Expansion status unavailable: {errorMessage(expansion.error)}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Open pending/blocked tasks: {String(expansionData.openTaskCount ?? "—")}; registered expansion agents: {String(expansionData.autoAgentCount ?? "—")} / {String(expansionRule.maximumAgents ?? "—")}; threshold: more than {String(expansionRule.threshold ?? "—")}. Newly registered agents remain offline and require explicit assignment and a ready model.
                </p>
              )}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div aria-labelledby="maxcore-graph-title" className="rounded-md border p-4">
                <h3 id="maxcore-graph-title" className="mb-2 font-medium">Knowledge graph relationships</h3>
                {relationships.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No relationships are stored for this account.</p>
                ) : (
                  <ul className="space-y-2">
                    {relationships.slice(0, 8).map((relationship, index) => (
                      <li key={String(relationship.id ?? index)} className="rounded border p-2 text-sm">
                        <code className="break-all">{textValue(relationship.sourceId)}</code>
                        <span className="mx-2 text-muted-foreground">
                          {textValue(relationship.relationType, "related_to")}
                        </span>
                        <code className="break-all">{textValue(relationship.targetId)}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div aria-labelledby="maxcore-events-title" className="rounded-md border p-4">
                <h3 id="maxcore-events-title" className="mb-2 font-medium">Recent durable events</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cognitive events are stored for this account.</p>
                ) : (
                  <ul className="space-y-2">
                    {events.map((event, index) => (
                      <li key={String(event.id ?? index)} className="rounded border p-2 text-sm">
                        <span className="font-medium">{textValue(entityValue(event, "eventType"), "Event")}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {textValue(entityValue(event, "createdAt"), "timestamp unavailable")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <form
                className="space-y-3 rounded-md border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createAgent.mutate();
                }}
              >
                <h3 className="flex items-center gap-2 font-medium">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  Register an agent
                </h3>
                <Input
                  aria-label="Agent name"
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                  maxLength={120}
                  placeholder="Agent name"
                  required
                />
                <Input
                  aria-label="Agent specialty"
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  maxLength={120}
                  placeholder="Specialty"
                  required
                />
                {createAgent.isError && (
                  <p role="alert" className="text-sm text-destructive">{errorMessage(createAgent.error)}</p>
                )}
                <Button
                  type="submit"
                  disabled={createAgent.isPending || !agentName.trim() || !specialty.trim()}
                >
                  {createAgent.isPending ? "Saving…" : "Save offline agent"}
                </Button>
              </form>

              <form
                className="space-y-3 rounded-md border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createTask.mutate();
                }}
              >
                <h3 className="font-medium">Create an owner-scoped task</h3>
                <Input
                  aria-label="Task title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  maxLength={200}
                  placeholder="Task title"
                  required
                />
                <Input
                  aria-label="Task description"
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  maxLength={4000}
                  placeholder="Task description"
                  required
                />
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Assigned agent</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    aria-label="Assigned agent"
                    value={assignedAgent}
                    onChange={(event) => setAssignedAgent(event.target.value)}
                    required
                  >
                    <option value="">Select an agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={String(agent.id ?? "")}>
                        {textValue(entityValue(agent, "name"), "Unnamed agent")} ({textValue(entityValue(agent, "status"))})
                      </option>
                    ))}
                  </select>
                </label>
                {createTask.isError && (
                  <p role="alert" className="text-sm text-destructive">{errorMessage(createTask.error)}</p>
                )}
                <Button
                  type="submit"
                  disabled={createTask.isPending || !taskTitle.trim() || !taskDescription.trim() || !assignedAgent}
                >
                  {createTask.isPending ? "Saving…" : "Save pending task"}
                </Button>
              </form>
            </section>

            <form
              className="space-y-3 rounded-md border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                createMemory.mutate();
              }}
            >
              <h3 className="font-medium">Store owner-authored memory</h3>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Memory content</span>
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
                  aria-label="Memory content"
                  value={memoryContent}
                  onChange={(event) => setMemoryContent(event.target.value)}
                  minLength={2}
                  maxLength={12_000}
                  required
                />
              </label>
              {createMemory.isError && (
                <p role="alert" className="text-sm text-destructive">{errorMessage(createMemory.error)}</p>
              )}
              <Button
                type="submit"
                disabled={createMemory.isPending || memoryContent.trim().length < 2}
              >
                {createMemory.isPending ? "Saving…" : "Save memory"}
              </Button>
              <p className="text-xs text-muted-foreground">
                This records owner-provided context only. It does not claim vector indexing or model training.
              </p>
            </form>

            <section aria-labelledby="maxcore-task-list-title">
              <h3 id="maxcore-task-list-title" className="mb-2 font-medium">Recent tasks</h3>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks are stored for this account.</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.slice(0, 8).map((task) => {
                    const state = textValue(entityValue(task, "status"));
                    const canRun = state === "pending" || state === "blocked";
                    return (
                      <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{textValue(entityValue(task, "title"), "Untitled task")}</p>
                          <p className="text-xs text-muted-foreground">
                            {state} · {textValue(entityValue(task, "assignedAgent"), "unassigned")}
                          </p>
                        </div>
                        {canRun && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              executeTask.isPending ||
                              statusData.agentExecutionReady !== true ||
                              !task.id
                            }
                            title={
                              statusData.agentExecutionReady === true
                                ? "Run this task through MaxCore."
                                : "Task execution requires a ready MaxCore model."
                            }
                            onClick={() => executeTask.mutate(task)}
                          >
                            {executeTask.isPending ? "Running…" : state === "blocked" ? "Retry task" : "Run task"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {executeTask.isError && (
                <p role="alert" className="mt-2 text-sm text-destructive">{errorMessage(executeTask.error)}</p>
              )}
            </section>

            <form
              className="space-y-3 rounded-md border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                searchTool.mutate();
              }}
            >
              <h3 className="flex items-center gap-2 font-medium">
                <Database className="h-4 w-4" aria-hidden="true" />
                Read-only cognitive search
              </h3>
              <p className="text-sm text-muted-foreground">
                Searches only this signed-in account’s saved MaxCore records and product projects. It does not execute arbitrary SQL or external tools.
              </p>
              <div className="flex gap-2">
                <Input
                  aria-label="Search saved MaxCore knowledge"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  minLength={2}
                  maxLength={300}
                  placeholder="Search saved knowledge"
                  required
                />
                <Button
                  type="submit"
                  disabled={!databaseToolEnabled || searchTool.isPending || searchText.trim().length < 2}
                >
                  <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                  Search
                </Button>
              </div>
              {searchTool.isError && (
                <p role="alert" className="text-sm text-destructive">{errorMessage(searchTool.error)}</p>
              )}
              {searchTool.isSuccess && searchResults.length === 0 && (
                <p role="status" className="text-sm text-muted-foreground">No matching saved records were found.</p>
              )}
              {searchResults.length > 0 && (
                <ul className="space-y-2" aria-label="Search results">
                  {searchResults.map((result) => (
                    <li key={result.id} className="rounded-md border p-3">
                      <p className="text-sm">{textValue(result.summary)}</p>
                      <code className="mt-1 block break-all text-xs text-muted-foreground">
                        {textValue(result.citation)}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </form>

            {tools.isError && (
              <p role="alert" className="text-sm text-destructive">
                Tool catalog unavailable: {errorMessage(tools.error)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
