export function buildSuccessResponse<T>(data: T) {
  return { data };
}

export function buildPaginatedResponse<T>(data: T[], page: number, limit: number, total: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
    },
  };
}
