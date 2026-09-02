/**
 * Contacts / CRM module — public surface ([קטגוריה 4]).
 */
export * from "./models";
export {
  ContactRepository,
  ContactIdentityRepository,
  CustomFieldDefRepository,
  ensureContactIndexes,
} from "./repository";
export {
  syncFromInbound,
  getContact,
  getContactByWaId,
  searchContacts,
  updateContact,
  addTag,
  removeTag,
  blockContact,
  setCustomField,
  listCustomFieldDefs,
  exportContactsCsv,
  importContactsCsv,
  mergeContacts,
  anonymizeContact,
  deleteContactGdpr,
} from "./service";
