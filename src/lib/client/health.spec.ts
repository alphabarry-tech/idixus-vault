import { describe, it, expect } from 'vitest';
import { analyzeHealth, type HealthItem } from './health';

const space = { id: 's', name: 'S', kind: 'personal' } as HealthItem['space'];
const item = (id: string, password: string, updatedAt = '2026-01-01T00:00:00Z'): HealthItem => ({
	space,
	entry: {
		id,
		keyVersion: 1,
		updatedAt,
		data: { title: id, username: '', password, url: '', notes: '' }
	}
});
const NOW = new Date('2026-06-01T00:00:00Z').getTime();
const STRONG = 'gT7#kP2$vQ9!zL4@xN8%';

describe('analyzeHealth', () => {
	it('un coffre sain a un score de 100', () => {
		const h = analyzeHealth([item('a', STRONG), item('b', STRONG + 'x')], NOW);
		expect(h.score).toBe(100);
		expect(h.weak).toHaveLength(0);
		expect(h.reused).toHaveLength(0);
	});

	it('repère les mots de passe faibles et réutilisés et baisse le score', () => {
		const h = analyzeHealth(
			[item('a', 'password1'), item('b', STRONG), item('c', STRONG), item('d', STRONG + 'z')],
			NOW
		);
		expect(h.weak.map((i) => i.entry.id)).toEqual(['a']);
		expect(h.reused).toHaveLength(1);
		expect(h.reused[0].map((i) => i.entry.id).sort()).toEqual(['b', 'c']);
		expect(h.score).toBe(25);
	});

	it('repère les mots de passe de plus d’un an et les entrées sans mot de passe', () => {
		const h = analyzeHealth([item('a', STRONG, '2024-01-01T00:00:00Z'), item('b', '')], NOW);
		expect(h.old.map((i) => i.entry.id)).toEqual(['a']);
		expect(h.empty.map((i) => i.entry.id)).toEqual(['b']);
	});

	it('score 100 quand il n’y a aucun mot de passe', () => {
		expect(analyzeHealth([], NOW).score).toBe(100);
	});
});
