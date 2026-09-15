import type { NextConfig } from 'next';
const config: NextConfig = {
    poweredByHeader: false,
    async headers() {
        return [{ source: '/:path*', headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
                    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : "") + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self'; connect-src 'self' ws: wss: https://viacep.com.br https://brasilapi.com.br; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" }
                ] }];
    }
};
export default config;
