/** Always attempt every owned-fixture cleanup, even after another one fails. */
export function contractCleanup(afterAll) {
  const tasks = [];
  afterAll(async () => {
    const failures = [];
    for (const cleanup of tasks.reverse()) {
      try {
        await cleanup();
      }
      catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Owned contract fixture cleanup failed");
  });
  return cleanup => tasks.push(cleanup);
}
