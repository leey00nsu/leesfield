// Focused database-suite variables belong to the lower-level debug command.
// Official verification always runs both complete, disjoint baseline suites.
export function verificationEnvironment(environment, { memoryConstrained = false, unitWorkers } = {}) {
  const result = { ...environment };
  delete result.PRODUCTION_INTEGRATION_TEST;
  delete result.PRODUCTION_INTEGRATION_TEST_TARGETS;
  delete result.SPACES_E2E_MEMORY_CONSTRAINED;
  if (memoryConstrained) result.SPACES_E2E_MEMORY_CONSTRAINED = "1";
  if (unitWorkers !== undefined) result.VERIFICATION_TEST_WORKERS = String(unitWorkers);
  return result;
}
