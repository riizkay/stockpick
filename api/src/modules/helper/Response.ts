export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function SuccessResponse(data: unknown, init?: ResponseInit) {
  return Response.json(
    {
      success: true,
      data,
    },
    init
  );
}

export async function ValidateFields<T>(payload: T, validator: (value: T) => T) {
  return validator(payload);
}
