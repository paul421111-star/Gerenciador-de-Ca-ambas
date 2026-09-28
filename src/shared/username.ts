/** Nome de usuário: 3 a 40 caracteres, letras minúsculas, números, ponto, hífen ou sublinhado; começa com letra ou número. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
export const USERNAME_HINT = 'Use de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.';

export function normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
    return USERNAME_PATTERN.test(value);
}

/** Sugere um nome de usuário a partir da parte local do e-mail (antes do @); null quando não serve como apelido. */
export function usernameFromEmail(email: string): string | null {
    const local = normalizeUsername(email).split('@')[0] ?? '';
    return isValidUsername(local) ? local : null;
}
