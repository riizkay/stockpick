import { globSync } from "glob";
import { ApiError } from "@helper/Response";

type HttpHandler = (request: Request, server: { params?: Record<string, string> }, context: Record<string, unknown>) => Promise<Response> | Response;

// Bun.serve route: params ada di request, bukan argumen kedua
function routeParams(request: Request): Record<string, string> | undefined {
  const p = (request as Request & { params?: Record<string, string> }).params;
  return p && typeof p === "object" ? p : undefined;
}
type RouteModule = {
  endpoint: string;
  default: Record<string, HttpHandler>;
};
type MiddlewareModule = {
  default: (
    request: Request,
    server: { params?: Record<string, string> },
    context: Record<string, unknown>
  ) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);

  const origin = process.env.CORS_ORIGIN || "*";
  headers.set("Access-Control-Allow-Origin", origin);

  if (origin !== "*") {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-request-id, x-public-user-id, x-internal-user-id, x-internal-role"
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function loadMiddlewares(routeFilePath: string) {
  const relativePath = routeFilePath.replaceAll("\\", "/");
  const segments = relativePath.split("/");
  const middlewareFiles: string[] = [];

  for (let index = 0; index < segments.length - 1; index += 1) {
    const currentDir = segments.slice(0, index + 1).join("/");
    const mwMatches = globSync(`${currentDir}/*.mw.ts`, {
      windowsPathsNoEscape: true,
    });

    middlewareFiles.push(...mwMatches);
  }

  const uniqueFiles = [...new Set(middlewareFiles)].sort();
  const modules = await Promise.all(
    uniqueFiles.map(async (filePath) => {
      const normalizedPath = filePath.replaceAll("\\", "/").replace(/^src\//, "");
      return (await import(new URL(`../${normalizedPath}`, import.meta.url).href)) as MiddlewareModule;
    })
  );

  return modules;
}

export default async function InitRoutes() {
  const routeFiles = globSync("src/**/*.api.{ts,tsx}", {
    windowsPathsNoEscape: true,
  });
  const routes: Record<string, Record<string, HttpHandler>> = {};

  for (const routeFile of routeFiles) {
    const normalizedPath = routeFile.replaceAll("\\", "/").replace(/^src\//, "");
    const importedModule = (await import(new URL(`../${normalizedPath}`, import.meta.url).href)) as RouteModule;
    const middlewareModules = await loadMiddlewares(routeFile);
    const methods = importedModule.default || {};

    routes[importedModule.endpoint] = {};

    for (const [method, handler] of Object.entries(methods)) {
      routes[importedModule.endpoint][method] = async (request: Request) => {
        const server = { params: routeParams(request) };

        try {
          if (request.method === "OPTIONS") {
            return withCors(new Response(null, { status: 204 }));
          }

          const context: Record<string, unknown> = {};

          for (const middlewareModule of middlewareModules) {
            const result = await middlewareModule.default(request, server, context);

            if (result && typeof result === "object") {
              Object.assign(context, result);
            }
          }

          const response = await handler(request, server, context);
          return withCors(response);
        } catch (error) {
          const message = error instanceof ApiError ? error.message : "Terjadi error di server";
          const status = error instanceof ApiError ? error.status : 500;

          return withCors(
            Response.json(
              {
                success: false,
                message,
              },
              {
                status,
              }
            )
          );
        }
      };
    }
  }

  return routes;
}
