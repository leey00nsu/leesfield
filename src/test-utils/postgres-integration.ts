export const postgresIntegrationEnabled =
  process.env.PRODUCTION_INTEGRATION_TEST === "1" &&
  Boolean(process.env.DATABASE_URL);
