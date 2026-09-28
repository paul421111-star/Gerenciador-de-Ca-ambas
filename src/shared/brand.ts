/** Titular dos direitos exibido nos rodapés do sistema e da página pública. */
export const RIGHTS_HOLDER = 'PCB';

export function copyrightLine(year = new Date().getFullYear()): string {
    return `© ${year} ${RIGHTS_HOLDER}. Todos os direitos reservados.`;
}
