'use client';
export default function ErrorPage({ reset }: {
    error: Error & {
        digest?: string;
    };
    reset: () => void;
}) { return <div className="loading-screen"><h1>Não foi possível abrir esta página.</h1><p>Tente novamente. Caso persista, informe o administrador.</p><button className="button primary" onClick={reset}>Tentar novamente</button></div>; }
