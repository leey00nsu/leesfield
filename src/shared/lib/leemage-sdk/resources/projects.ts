import type { FetchClient } from "../utils/fetch";
import type {
  Project,
  ProjectDetails,
  CreateProjectRequest,
  MessageResponse,
} from "../types/api";

/**
 * Projects API 클라이언트
 */
export class ProjectsResource {
  constructor(private readonly client: FetchClient) {}

  /**
   * 프로젝트 목록 조회
   *
   * @example
   * ```ts
   * const projects = await client.projects.list();
   * console.log(projects);
   * ```
   */
  async list(): Promise<Project[]> {
    return this.client.get<Project[]>("/api/v1/projects");
  }

  /**
   * 프로젝트 상세 조회
   *
   * @param projectId - 프로젝트 ID
   *
   * @example
   * ```ts
   * const project = await client.projects.get("clq1234abcd");
   * console.log(project.files);
   * ```
   */
  async get(projectId: string): Promise<ProjectDetails> {
    return this.client.get<ProjectDetails>(`/api/v1/projects/${projectId}`);
  }

  /**
   * 프로젝트 생성
   *
   * @param data - 프로젝트 생성 데이터
   *
   * @example
   * ```ts
   * const project = await client.projects.create({
   *   name: "My Project",
   *   description: "Project description",
   *   storageProvider: "OCI"
   * });
   * ```
   */
  async create(data: CreateProjectRequest): Promise<Project> {
    return this.client.post<Project>("/api/v1/projects", data);
  }

  /**
   * 프로젝트 삭제
   *
   * @param projectId - 프로젝트 ID
   *
   * @example
   * ```ts
   * await client.projects.delete("clq1234abcd");
   * ```
   */
  async delete(projectId: string): Promise<MessageResponse> {
    return this.client.delete<MessageResponse>(`/api/v1/projects/${projectId}`);
  }
}
