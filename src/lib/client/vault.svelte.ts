import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { wipe } from '../crypto/index';
import { ApiError } from './api';
import type { HealthItem } from './health';
import * as p from './protocol';

const LOCK_AFTER_MS = 5 * 60_000;

/**
 * État du coffre déverrouillé. Les clés restent uniquement en mémoire du navigateur :
 * rechargement ou verrouillage = elles disparaissent et le mot de passe maître est redemandé.
 */
class Vault {
	session = $state.raw<p.Unlocked | null>(null);
	spaces = $state.raw<p.SpaceInfo[]>([]);
	currentId = $state<string | null>(null);
	entries = $state.raw<p.Entry[]>([]);
	loading = $state(false);
	error = $state('');

	#keys = new Map<string, Uint8Array>();
	#timer: ReturnType<typeof setInterval> | undefined;
	#lastActivity = Date.now();

	get unlocked() {
		return this.session !== null;
	}

	get current() {
		return this.spaces.find((s) => s.id === this.currentId) ?? null;
	}

	get user() {
		return this.session?.user ?? null;
	}

	open(session: p.Unlocked) {
		this.session = session;
		this.spaces = session.spaces;
		this.error = '';
		this.#lastActivity = Date.now();
		clearInterval(this.#timer);
		this.#timer = setInterval(() => this.checkIdle(), 15_000);
		const first = this.spaces.find((s) => s.kind === 'personal') ?? this.spaces[0];
		return first ? this.select(first.id) : undefined;
	}

	touch() {
		this.#lastActivity = Date.now();
	}

	checkIdle() {
		if (this.session && Date.now() - this.#lastActivity > LOCK_AFTER_MS) this.lock();
	}

	lock() {
		clearInterval(this.#timer);
		for (const k of this.#keys.values()) wipe(k);
		this.#keys.clear();
		if (this.session) wipe(this.session.keys.privateKey);
		this.session = null;
		this.entries = [];
		this.spaces = [];
		this.currentId = null;
	}

	async logout() {
		this.lock();
		await p.logout().catch(() => {});
		await goto(resolve('/(auth)/login'));
	}

	/** Exécute une action et affiche l'erreur ; une session expirée renvoie vers la connexion. */
	async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
		this.error = '';
		try {
			return await fn();
		} catch (e) {
			if (e instanceof ApiError && e.status === 401) {
				this.lock();
				await goto(resolve('/(auth)/login'));
				return;
			}
			this.error = e instanceof Error ? e.message : 'Une erreur est survenue';
		}
	}

	async #keyFor(space: p.SpaceInfo): Promise<Uint8Array> {
		const id = `${space.id}:${space.keyVersion}`;
		let key = this.#keys.get(id);
		if (!key) {
			key = await p.getSpaceKey(space, this.session!.keys);
			this.#keys.set(id, key);
		}
		return key;
	}

	async select(id: string) {
		this.currentId = id;
		this.entries = [];
		await this.reload();
	}

	async reload() {
		await this.run(async () => {
			this.loading = true;
			try {
				this.spaces = await p.refreshSpaces();
				let space = this.current;
				if (!space) {
					// espace supprimé ou quitté : retour au coffre personnel
					space = this.spaces.find((s) => s.kind === 'personal') ?? this.spaces[0] ?? null;
					this.currentId = space?.id ?? null;
				}
				if (!space) return;
				// Un membre est parti : seul un admin de l'espace peut renouveler la clé
				if (space.needsRotation && space.role === 'admin') {
					const newKey = await p.rotateSpace(space, await this.#keyFor(space));
					this.spaces = await p.refreshSpaces();
					space = this.current!;
					this.#keys.set(`${space.id}:${space.keyVersion}`, newKey);
				}
				this.entries = await p.listEntries(space, await this.#keyFor(space));
			} finally {
				this.loading = false;
			}
		});
	}

	async save(data: p.EntryData, id?: string) {
		const space = this.current;
		if (!space) return false;
		const ok = await this.run(async () => {
			const key = await this.#keyFor(space);
			if (id) await p.updateEntry(space, key, id, data);
			else await p.createEntry(space, key, data);
			return true;
		});
		if (ok) await this.reload();
		return ok === true;
	}

	async remove(id: string) {
		const space = this.current;
		if (!space) return;
		const ok = await this.run(async () => {
			await p.deleteEntry(space, id);
			return true;
		});
		if (ok) await this.reload();
	}

	async createSpace(name: string) {
		const id = await this.run(() => p.createSpace(name, this.session!.keys));
		if (id) await this.select(id);
	}

	async renameSpace(name: string) {
		const space = this.current;
		if (!space) return;
		if ((await this.run(() => p.renameSpace(space, name))) !== undefined) await this.reload();
	}

	async deleteSpace() {
		const space = this.current;
		if (!space) return false;
		const done = await this.run(async () => {
			await p.deleteSpace(space);
			return true;
		});
		if (done) {
			const personal = this.spaces.find((s) => s.kind === 'personal');
			this.currentId = personal?.id ?? null;
			await this.reload();
		}
		return done === true;
	}

	members() {
		const space = this.current;
		return space ? this.run(() => p.listMembers(space)) : undefined;
	}

	async addMember(email: string, role: 'admin' | 'member') {
		const space = this.current;
		if (!space) return false;
		const done = await this.run(async () => {
			await p.addMember(space, await this.#keyFor(space), email, role);
			return true;
		});
		return done === true;
	}

	async setRole(userId: string, role: 'admin' | 'member') {
		const space = this.current;
		if (!space) return false;
		return (
			(await this.run(async () => (await p.setMemberRole(space, userId, role), true))) === true
		);
	}

	/** Retire un membre puis renouvelle la clé. Un membre qui se retire lui-même laisse la rotation à un admin. */
	async removeMember(userId: string) {
		const space = this.current;
		if (!space) return false;
		const leaving = userId === this.session!.user.id;
		const done = await this.run(async () => {
			const oldKey = await this.#keyFor(space);
			await p.removeMember(space, userId);
			if (!leaving) {
				this.spaces = await p.refreshSpaces();
				const flagged = this.current!;
				const newKey = await p.rotateSpace(flagged, oldKey);
				this.spaces = await p.refreshSpaces();
				const fresh = this.current!;
				this.#keys.set(`${fresh.id}:${fresh.keyVersion}`, newKey);
			}
			return true;
		});
		if (done) await this.reload();
		return done === true;
	}

	/** Déchiffre toutes les entrées de tous les espaces (tableau de santé des mots de passe). */
	async loadAll(): Promise<HealthItem[]> {
		const out: HealthItem[] = [];
		await this.run(async () => {
			this.spaces = await p.refreshSpaces();
			for (const space of this.spaces) {
				if (space.memberKeyVersion !== space.keyVersion) continue;
				const entries = await p.listEntries(space, await this.#keyFor(space));
				for (const entry of entries) out.push({ space, entry });
			}
		});
		return out;
	}
}

export const vault = new Vault();
