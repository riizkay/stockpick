export default async function signatureMiddleware(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  return {
    requestId,
  };
}
