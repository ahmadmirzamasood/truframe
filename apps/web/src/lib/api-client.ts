import type { ApiError, CreateProjectInput, ProjectDto } from "@truframe/protocol";

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError("NETWORK", "We couldn't reach Truframe. Check your connection.", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) {
    throw new ApiRequestError(
      data?.error?.code ?? "INTERNAL",
      data?.error?.message ?? "Something went wrong. Try again.",
      res.status,
    );
  }
  return data as T;
}

type One = { project: ProjectDto };

/** Browser client for /api/projects. Throws ApiRequestError with a user-facing message. */
export const projectsApi = {
  create: (input: CreateProjectInput) => call<One>("POST", "/api/projects", input),
  rename: (id: string, name: string) => call<One>("PATCH", `/api/projects/${id}`, { name }),
  duplicate: (id: string) => call<One>("POST", `/api/projects/${id}/duplicate`, {}),
  remove: (id: string) => call<One>("DELETE", `/api/projects/${id}`),
  restore: (id: string) => call<One>("POST", `/api/projects/${id}/restore`),
};
