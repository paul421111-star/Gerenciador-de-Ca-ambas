import { randomInt, randomUUID } from 'node:crypto';
import { assert } from './errors.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 10 * 60 * 1000;
const GLYPHS: Record<string, string[]> = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    J: ['00111', '00001', '00001', '00001', '10001', '10001', '01110'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
    '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110']
};

type ChallengeKind = 'IMAGE' | 'MATH';
interface Challenge {
    kind: ChallengeKind;
    answer: string;
    expires: number;
}

const challenges = new Map<string, Challenge>();

function code(): string {
    return Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

function image(answer: string): string {
    const cell = 4;
    const width = 168;
    const height = 58;
    const glyphs = answer.split('').map((char, index) => {
        const shiftX = 12 + index * 31 + randomInt(-2, 3);
        const shiftY = 8 + randomInt(-2, 3);
        return GLYPHS[char].flatMap((row, y) => [...row].flatMap((bit, x) => bit === '1'
            ? [`<rect x="${shiftX + x * cell}" y="${shiftY + y * cell}" width="${cell - 0.4}" height="${cell - 0.4}" rx="0.6"/>`]
            : []));
    }).join('');
    const noise = Array.from({ length: 7 }, () => `<path d="M${randomInt(width)} ${randomInt(height)} C ${randomInt(width)} ${randomInt(height)}, ${randomInt(width)} ${randomInt(height)}, ${randomInt(width)} ${randomInt(height)}" fill="none" stroke="#8d7a45" stroke-width="1.2"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="#f7f1df"/>${noise}<g fill="#1d291f">${glyphs}</g></svg>`;
}

export interface CaptchaChallenge {
    id: string;
    image: string;
    answer: string;
}

function remember(kind: ChallengeKind, answer: string, at: Date): string {
    const now = at.getTime();
    for (const [id, challenge] of challenges)
        if (challenge.expires <= now) challenges.delete(id);
    const id = randomUUID();
    challenges.set(id, { kind, answer, expires: now + TTL_MS });
    return id;
}

export function createCaptcha(at = new Date()): CaptchaChallenge {
    const answer = code();
    const id = remember('IMAGE', answer, at);
    return { id, image: image(answer), answer };
}

export function publicCaptcha(at = new Date()): { id: string; image: string } {
    const { id, image: picture } = createCaptcha(at);
    return { id, image: picture };
}

export interface MathCaptchaChallenge {
    id: string;
    question: string;
    answer: string;
}

/** Conta simples (soma ou subtração, alternadas ao acaso) para a tela de login. O resultado nunca é negativo. */
export function createMathCaptcha(at = new Date()): MathCaptchaChallenge {
    const subtract = randomInt(2) === 1;
    let a = randomInt(1, 10), b = randomInt(1, 10);
    if (subtract && b > a)
        [a, b] = [b, a];
    const answer = String(subtract ? a - b : a + b);
    const id = remember('MATH', answer, at);
    return { id, question: `${a} ${subtract ? '−' : '+'} ${b}`, answer };
}

export function publicMathCaptcha(at = new Date()): { id: string; question: string } {
    const { id, question } = createMathCaptcha(at);
    return { id, question };
}

export function verifyCaptcha(id: string, answer: string, at = new Date(), kind: ChallengeKind = 'IMAGE'): void {
    const challenge = challenges.get(id);
    challenges.delete(id);
    const normalized = answer.trim().toUpperCase().replace(/\s/g, '');
    const message = kind === 'MATH'
        ? 'O resultado da conta não confere. Confira a soma ou subtração e tente de novo.'
        : 'O código da imagem não confere. Gere outro e tente de novo.';
    assert(challenge && challenge.kind === kind && challenge.expires > at.getTime() && challenge.answer === normalized, message, 400);
}
