export const BIO_UPDATE_UNAVAILABLE =
  "Automatic bio updates and reversions are unavailable: no verified provider adapter is configured. No profile changes or reversions will be scheduled.";

export class WorkflowUnavailableError extends Error {
  readonly status = 501;
  readonly code = "WORKFLOW_UNAVAILABLE";
}
