import { Prisma } from '@prisma/client';
import { NextApiRequest } from 'next';
import { isProd } from '~/env/other';
import { PaginationInput } from '~/server/schema/base.schema';
import { QS } from '~/utils/qs';

export const DEFAULT_PAGE_SIZE = 20;

export function getPagination(limit: number, page: number | undefined) {
  const take = limit > 0 ? limit : undefined;
  const skip = page && take ? (page - 1) * take : undefined;

  return { take, skip };
}

export function getPagingData<T>(
  data: { count?: number; items: T[] },
  limit?: number,
  page?: number
) {
  const { count: totalItems = 0, items } = data;
  const currentPage = page ?? 1;
  const pageSize = limit ?? totalItems;
  const totalPages = pageSize && totalItems ? Math.ceil((totalItems as number) / pageSize) : 1;

  return { items, totalItems, currentPage, pageSize, totalPages };
}

export function getPaginationLinks({
  req,
  totalPages,
  currentPage,
}: {
  req: NextApiRequest;
  totalPages: number;
  currentPage: number;
}) {
  const baseUrl = new URL(
    req.url ?? '/',
    isProd ? `https://${req.headers.host}` : 'http://localhost:3000'
  );
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = totalPages > 1 && currentPage > 1;
  const nextPageQueryString = hasNextPage
    ? QS.stringify({
        ...req.query,
        page: currentPage + 1,
      })
    : '';
  const prevPageQueryString = hasPrevPage
    ? QS.stringify({
        ...req.query,
        page: currentPage - 1,
      })
    : '';

  const nextPage = hasNextPage
    ? `${baseUrl.origin}${baseUrl.pathname}?${nextPageQueryString}`
    : undefined;
  const prevPage = hasPrevPage
    ? `${baseUrl.origin}${baseUrl.pathname}?${prevPageQueryString}`
    : undefined;

  return { nextPage, prevPage, baseUrl };
}

export async function getPagedData<TQuery extends PaginationInput, TData>(
  { page, limit, ...rest }: TQuery,
  fn: (
    args: { skip?: number; take?: number } & Omit<TQuery, 'page' | 'limit'>
  ) => Promise<{ items: TData; count?: number }>
) {
  const take = !page ? undefined : limit;
  const skip = !page ? undefined : (page - 1) * limit;

  const { items, count } = await fn({ skip, take, ...rest });

  return {
    currentPage: page,
    pageSize: take,
    totalPages: !!take && !!count ? Math.ceil(count / take) : 1,
    totalItems: count,
    items,
  };
}

type SortOrder = 'ASC' | 'DESC';

interface SortField {
  field: string;
  order: SortOrder;
}

function parseSortString(sortString: string): SortField[] {
  return sortString.split(',').map((part) => {
    const [field, order = 'ASC'] = part.trim().split(' ').filter(Boolean);
    return { field, order: order.toUpperCase() as SortOrder };
  });
}

function parseCursor(fields: SortField[], cursor: string | number | bigint) {
  if (typeof cursor === 'number' || typeof cursor === 'bigint')
    return { [fields[0].field]: cursor };

  const values = cursor.split(':').map(Number);
  const result: Record<string, number> = {};
  for (let i = 0; i < fields.length; i++) {
    result[fields[i].field] = values[i];
  }
  return result;
}

export function getCursor(sortString: string, cursor: string | number | bigint | undefined) {
  const sortFields = parseSortString(sortString);
  let where: Prisma.Sql | undefined;
  if (cursor) {
    const cursors = parseCursor(sortFields, cursor);
    const conditions: Prisma.Sql[] = [];

    for (let i = 0; i < sortFields.length; i++) {
      const conditionParts: Prisma.Sql[] = [];
      for (let j = 0; j <= i; j++) {
        const { field, order } = sortFields[j];
        let operator = j < i ? '=' : order === 'DESC' ? '<' : '>';
        if (j < i) operator = '=';

        conditionParts.push(
          Prisma.sql`${Prisma.raw(field)} ${Prisma.raw(operator)} ${cursors[field]}`
        );
      }
      conditions.push(Prisma.sql`(${Prisma.join(conditionParts, ' AND ')})`);
    }

    where = Prisma.sql`(${Prisma.join(conditions, ' OR ')})`;
  }

  const sortProps = sortFields.map((x) => x.field);
  const prop =
    sortFields.length === 1 ? sortFields[0].field : `CONCAT(${sortProps.join(`, ':', `)})`;
  return {
    where,
    prop,
  };
}
