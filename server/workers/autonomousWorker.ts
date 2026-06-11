// Autonomous queue worker — thin re-export of the scheduler's lifecycle functions.
//
// All BullMQ Worker creation, repeatable job registration, and job processing
// logic lives in autonomousJobScheduler?.ts so it can manage the _worker reference
// for isSchedulerLeader() tracking.  This file is the conventional workers/ entry
// point that workers/index?.ts uses in its shutdown sequence.

export { closeScheduler as closeAutonomousWorker } from "../services/autonomousJobScheduler?.js";
