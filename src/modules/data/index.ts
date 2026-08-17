/**
 * Generic data platform — public surface ([קטגוריה 28]).
 */
export {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  findRecords,
  getRecord,
  insertRecord,
  updateRecordById,
  updateRecords,
  deleteRecordById,
  deleteRecords,
  incrementRecord,
  countRecords,
  aggregateRecords,
  exportCsv,
  importCsv,
  canAccessCollection,
} from "./service";
export { ensureDataIndexes } from "./repository";
export type {
  CollectionDef,
  FieldDef,
  FieldType,
  DataRecord,
  FilterCond,
  FilterOp,
  QueryInput,
  AggregateInput,
  AggregateMetric,
  AggregateResult,
} from "./models";
