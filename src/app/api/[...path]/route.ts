import { handleApi } from '../../../server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleApi(request);
export const POST = (request: Request) => handleApi(request);
