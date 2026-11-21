<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { api } from '#lib/client/api.ts';
	import { vault } from '#lib/client/vault.svelte.ts';

	type AdminUser = {
		id: string;
		email: string;
		name: string;
		appRole: 'admin' | 'member';
		activatedAt: string | null;
		disabledAt: string | null;
	};
	type Invitation = { id: string; email: string; role: 'admin' | 'member'; expiresAt: string };

	let users = $state<AdminUser[]>([]);
	let invitations = $state<Invitation[]>([]);
	let email = $state('');
	let role = $state<'admin' | 'member'>('member');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	let myId = $derived(vault.user?.id);
	const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

	async function load() {
		const [u, i] = await Promise.all([
			api<{ users: AdminUser[] }>('GET', '/api/admin/users'),
			api<{ invitations: Invitation[] }>('GET', '/api/admin/invitations')
		]);
		users = u.users;
		invitations = i.invitations;
	}

	async function act(fn: () => Promise<unknown>, success = '') {
		busy = true;
		error = notice = '';
		try {
			await fn();
			notice = success;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur';
		} finally {
			busy = false;
		}
	}

	load().catch((e) => (error = e instanceof Error ? e.message : 'Erreur'));

	function invite(event: SubmitEvent) {
		event.preventDefault();
		const target = email.trim().toLowerCase();
		return act(async () => {
			await api('POST', '/api/admin/invitations', { email: target, role });
			email = '';
		}, `Invitation envoyée à ${target}. Le lien est valable 48 h.`);
	}

	function toggle(u: AdminUser) {
		const disabling = !u.disabledAt;
		if (
			disabling &&
			!confirm(
				`Désactiver ${u.name} ? Ses sessions seront coupées et il sera retiré des espaces partagés.`
			)
		)
			return;
		return act(
			() => api('POST', `/api/admin/users/${u.id}/disable`, { disabled: disabling }),
			disabling ? 'Compte désactivé.' : 'Compte réactivé.'
		);
	}

	const status = (u: AdminUser) =>
		u.disabledAt
			? ['Désactivé', 'badge-danger']
			: u.activatedAt
				? ['Actif', 'badge-ok']
				: ['En attente', 'badge-warn'];
</script>

<svelte:head><title>Administration · Idixus Vault</title></svelte:head>

<h1 class="mb-1 text-xl font-bold">Administration</h1>
<p class="mb-6 text-sm text-muted">
	Invitez des collaborateurs et gérez leurs comptes. Les mots de passe restent illisibles pour les
	administrateurs.
</p>

{#if error}<p class="alert alert-danger mb-4" role="alert">{error}</p>{/if}
{#if notice}<p class="alert alert-ok mb-4" role="status">{notice}</p>{/if}

<section class="card mb-6 p-5">
	<h2 class="mb-3 font-semibold">Inviter un collaborateur</h2>
	<form class="flex flex-wrap gap-2" onsubmit={invite}>
		<input
			class="field min-w-0 flex-1 basis-64"
			type="email"
			required
			aria-label="Email du collaborateur"
			placeholder="prenom.nom@idixus.com"
			bind:value={email}
		/>
		<select class="field w-auto" aria-label="Rôle" bind:value={role}>
			<option value="member">Collaborateur</option>
			<option value="admin">Administrateur</option>
		</select>
		<button class="btn btn-primary" disabled={busy}
			><Icon name="mail" size={16} /> Envoyer l’invitation</button
		>
	</form>
</section>

{#if invitations.length > 0}
	<section class="mb-6">
		<h2 class="mb-2 font-semibold">Invitations en attente</h2>
		<ul class="card divide-y divide-line overflow-hidden">
			{#each invitations as inv (inv.id)}
				<li class="flex flex-wrap items-center gap-3 px-4 py-2.5">
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold">{inv.email}</p>
						<p class="text-xs text-muted">Expire le {dateFmt.format(new Date(inv.expiresAt))}</p>
					</div>
					<span class="badge">{inv.role === 'admin' ? 'Administrateur' : 'Collaborateur'}</span>
					<button
						class="btn btn-danger btn-icon"
						disabled={busy}
						onclick={() =>
							act(() => api('DELETE', `/api/admin/invitations/${inv.id}`), 'Invitation révoquée.')}
						aria-label="Révoquer l’invitation de {inv.email}"
					>
						<Icon name="x" size={16} />
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section>
	<h2 class="mb-2 font-semibold">Collaborateurs ({users.length})</h2>
	<ul class="card divide-y divide-line overflow-hidden">
		{#each users as u (u.id)}
			{@const [label, cls] = status(u)}
			<li class="flex flex-wrap items-center gap-3 px-4 py-2.5">
				<div class="min-w-0 flex-1 basis-48">
					<p class="truncate text-sm font-semibold">
						{u.name}{#if u.id === myId}<span class="font-normal text-muted">&nbsp;(vous)</span>{/if}
					</p>
					<p class="truncate text-xs text-muted">{u.email}</p>
				</div>
				<span class="badge {cls}">{label}</span>
				{#if u.id !== myId}
					<select
						class="field w-auto py-1.5 text-sm"
						aria-label="Rôle de {u.name}"
						value={u.appRole}
						disabled={busy}
						onchange={(e) =>
							act(
								() => api('POST', `/api/admin/users/${u.id}/role`, { role: e.currentTarget.value }),
								'Rôle mis à jour.'
							)}
					>
						<option value="member">Collaborateur</option>
						<option value="admin">Administrateur</option>
					</select>
					<button
						class="btn {u.disabledAt ? '' : 'btn-danger'}"
						disabled={busy}
						onclick={() => toggle(u)}
					>
						{u.disabledAt ? 'Réactiver' : 'Désactiver'}
					</button>
				{:else}
					<span class="badge">Administrateur</span>
				{/if}
			</li>
		{/each}
	</ul>
</section>
