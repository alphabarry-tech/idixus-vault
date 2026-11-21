import { describe, it, expect, vi } from 'vitest';

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		throw new Error(`${status} ${message}`);
	}
}));

import { rateLimited } from './ratelimit';

describe('rateLimited', () => {
	it('bloque après le maximum de tentatives dans la fenêtre', () => {
		const t = 1_000_000;
		expect(rateLimited('a', 3, 1000, t)).toBe(false);
		expect(rateLimited('a', 3, 1000, t + 1)).toBe(false);
		expect(rateLimited('a', 3, 1000, t + 2)).toBe(false);
		expect(rateLimited('a', 3, 1000, t + 3)).toBe(true);
	});

	it('autorise de nouveau une fois la fenêtre écoulée', () => {
		const t = 2_000_000;
		for (let i = 0; i < 3; i++) rateLimited('b', 3, 1000, t + i);
		expect(rateLimited('b', 3, 1000, t + 10)).toBe(true);
		expect(rateLimited('b', 3, 1000, t + 5000)).toBe(false);
	});

	it('compte séparément chaque clé', () => {
		const t = 3_000_000;
		for (let i = 0; i < 3; i++) rateLimited('c', 3, 1000, t);
		expect(rateLimited('c', 3, 1000, t)).toBe(true);
		expect(rateLimited('d', 3, 1000, t)).toBe(false);
	});
});
