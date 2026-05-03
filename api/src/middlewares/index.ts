export function getPublicSession(request: Request) {
  const userId = request.headers.get("x-public-user-id");

  if (!userId) {
    return null;
  }

  return {
    userId,
  };
}

export function getInternalSession(request: Request) {
  const userId = request.headers.get("x-internal-user-id");
  const role = request.headers.get("x-internal-role");

  if (!userId) {
    return null;
  }

  return {
    userId,
    role: role || "staff",
  };
}
