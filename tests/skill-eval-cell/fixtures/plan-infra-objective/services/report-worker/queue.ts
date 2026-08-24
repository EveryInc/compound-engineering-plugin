// Retrieval already runs here. Consumer config: max_concurrency: 2,
// max_retries: 0. Completion is an R2 marker object the events consumer
// parses and posts back to Convex.
export const JOB_QUEUE_NAMES = ["weekly-retrieval-jobs"]
