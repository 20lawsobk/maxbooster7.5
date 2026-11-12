export interface QcFixCandidate {
  id: string;
  fixable: boolean;
  status: string;
  fixAction?: string;
}

export interface QcFixResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

export interface QcFixAttempt {
  checkId: string;
  fixAction: string;
  success: boolean;
  message: string;
}

export interface QcFixBatchResult {
  attempted: number;
  succeeded: number;
  failed: number;
  results: QcFixAttempt[];
}

/**
 * Run every server-advertised fixable QC action and report only confirmed
 * successes. A 2xx response is not sufficient: the server must also
 * acknowledge `success: true`.
 */
export async function applyAllFixableQcChecks(
  releaseId: string,
  checks: QcFixCandidate[],
  send: (input: {
    releaseId: string;
    checkId: string;
    fixAction: string;
  }) => Promise<QcFixResponse>,
): Promise<QcFixBatchResult> {
  if (!releaseId) throw new Error("A release is required to apply QC fixes");

  const candidates = checks.filter(
    (check) => check.fixable && check.status === "failed" && check.fixAction,
  );
  const results: QcFixAttempt[] = [];

  for (const check of candidates) {
    const fixAction = check.fixAction!;
    try {
      const response = await send({
        releaseId,
        checkId: check.id,
        fixAction,
      });
      const body = (await response.json()) as {
        success?: boolean;
        message?: string;
      };
      const success = response.ok && body?.success === true;
      results.push({
        checkId: check.id,
        fixAction,
        success,
        message:
          body?.message ||
          (success
            ? "The server confirmed this fix."
            : "The server did not confirm this fix."),
      });
    } catch (error) {
      results.push({
        checkId: check.id,
        fixAction,
        success: false,
        message:
          error instanceof Error ? error.message : "The fix request failed.",
      });
    }
  }

  const succeeded = results.filter((result) => result.success).length;
  return {
    attempted: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  };
}
