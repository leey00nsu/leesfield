// Focused database-suite variables belong to the lower-level debug command.
// Official verification always runs both complete, disjoint baseline suites.
export function verificationEnvironment(environment) {
  const result = { ...environment };
  delete result.PRODUCTION_INTEGRATION_TEST;
  delete result.PRODUCTION_INTEGRATION_TEST_TARGETS;
  return result;
}
