/** Erro de domínio com mensagem amigável em português e status HTTP. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'error',
  ) {
    super(message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, message: string) {
    super(503, message, `${service}_unavailable`);
  }
}

export const notFound = (msg = 'Recurso não encontrado.') => new AppError(404, msg, 'not_found');
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new AppError(403, msg, 'forbidden');
export const badRequest = (msg: string) => new AppError(400, msg, 'bad_request');
