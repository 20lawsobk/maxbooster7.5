/**
 * Shared module barrel.
 *
 * Allows consumers to "import everything" from `@shared` when convenient,
 * while still keeping `@shared/*` deep imports available for tree-shaking.
 */

export * from './schema.js';
export * from './audioConstants.js';

export * from './ml/types.js';
export * from './ml/audio/index.js';
export * from './ml/models/index.js';
export * from './ml/nlp/index.js';
export * from './ml/coordination/index.js';
export * from './ml/statistics/core.js';
export * from './ml/statistics/timeseries.js';
export * from './ml/algorithms/IsolationForest.js';
export * from './ml/utils/tensor.js';

