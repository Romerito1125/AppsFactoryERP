import { PaginationQueryDto } from '../dto/pagination-query.dto';

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function resolvePagination(query?: PaginationQueryDto) {
  const page = Math.max(1, Number(query?.page ?? 1));
  const limit = Math.min(250, Math.max(1, Number(query?.limit ?? 50)));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
