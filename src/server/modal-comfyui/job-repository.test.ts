// @vitest-environment node
import {it,expect,vi,beforeEach} from "vitest";
const db=vi.hoisted(()=>({upsert:vi.fn(),updateMany:vi.fn(),findUniqueOrThrow:vi.fn(),findUnique:vi.fn()}));
vi.mock("@/server/db/prisma",()=>({prisma:{modalComfyJob:db}}));
import {modalJobRepository} from "./job-repository";
beforeEach(()=>{vi.resetAllMocks();db.updateMany.mockResolvedValue({count:1});});
it("allows leasing an old known remote job but never resubmits an expired unknown job",async()=>{
 const row={requestId:"request",fingerprint:"original",jobId:"completed-remote-job",createdAt:new Date(Date.now()-48*3600_000),submission:{inputs:{},advanced:{}}};
 db.upsert.mockResolvedValue(row);db.findUniqueOrThrow.mockResolvedValue(row);
 expect((await modalJobRepository.acquire("request","original",60_000)).jobId).toBe(row.jobId);
 db.upsert.mockResolvedValue({...row,jobId:null});
 await expect(modalJobRepository.acquire("request","original",60_000)).rejects.toThrow("MODAL_REQUEST_EXPIRED");
 db.upsert.mockResolvedValue(row);
 await expect(modalJobRepository.acquire("request","different",60_000)).rejects.toThrow("MODAL_REQUEST_CONFLICT");
 db.updateMany.mockResolvedValue({count:0});
 await expect(modalJobRepository.acquire("request","original",60_000)).rejects.toThrow("MODAL_REQUEST_BUSY");
});
