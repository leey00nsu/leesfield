import { allowAllRateLimitStore, setRateLimitStoreForTests } from "@/server/rate-limit/limiter";
import { createInMemorySubmissionLedger, setSubmissionLedgerForTests } from "@/server/generation-admission/submission-ledger";

// Installed only for server/route suites. UI and pure model suites do not
// import the DB/admission graph just to render a component or parse data.
setRateLimitStoreForTests(allowAllRateLimitStore);
setSubmissionLedgerForTests(createInMemorySubmissionLedger());
