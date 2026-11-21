<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import { unlock } from '#lib/client/protocol.ts';
	import { vault } from '#lib/client/vault.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let password = $state('');
	let unlockError = $state('');
	let unlocking = $state(false);
	let menuOpen = $state(false);
	let newSpaceOpen = $state(false);
	let newSpaceName = $state('');

	async function submitUnlock(event: SubmitEvent) {
		event.preventDefault();
		unlocking = true;
		unlockError = '';
		try {
			await vault.open(await unlock(password));
			password = '';
		} catch (e) {
			unlockError = e instanceof Error ? e.message : 'Déverrouillage impossible';
		} finally {
			unlocking = false;
		}
	}

	async function pickSpace(id: string) {
		menuOpen = false;
		if (page.url.pathname !== '/') await goto(resolve('/(app)'));
		await vault.select(id);
	}

	async function createSpace(event: SubmitEvent) {
		event.preventDefault();
		const name = newSpaceName.trim();
		if (!name) return;
		newSpaceOpen = false;
		newSpaceName = '';
		menuOpen = false;
		if (page.url.pathname !== '/') await goto(resolve('/(app)'));
		await vault.createSpace(name);
	}

	type NavLink = { href: string; icon: IconName; label: string; path: string };
	const adminLink: NavLink = {
		href: resolve('/(app)/admin'),
		icon: 'users',
		label: 'Administration',
		path: '/admin'
	};
	const links = $derived<NavLink[]>([
		{
			href: resolve('/(app)/health'),
			icon: 'shield',
			label: 'Santé des mots de passe',
			path: '/health'
		},
		...(data.account.appRole === 'admin' ? [adminLink] : []),
		{ href: resolve('/(app)/settings'), icon: 'sliders', label: 'Paramètres', path: '/settings' }
	]);
</script>

<svelte:window onpointerdown={() => vault.touch()} onkeydown={() => vault.touch()} />
<svelte:document onvisibilitychange={() => vault.checkIdle()} />

{#snippet nav()}
	<div class="flex h-full flex-col">
		<div class="flex items-center gap-2.5 px-4 py-4">
			<span class="grid size-8 place-items-center rounded-lg bg-brand text-[var(--on-brand)]">
				<Icon name="shield" size={18} />
			</span>
			<span class="font-bold tracking-tight">Idixus Vault</span>
		</div>

		<div class="flex-1 overflow-y-auto px-3 pb-3">
			<p class="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Espaces</p>
			<ul class="space-y-0.5">
				{#each vault.spaces as space (space.id)}
					{@const active = vault.currentId === space.id && page.url.pathname === '/'}
					<li>
						<button
							class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm {active
								? 'bg-brand-soft font-semibold text-brand'
								: 'hover:bg-surface-2'}"
							aria-current={active ? 'page' : undefined}
							onclick={() => pickSpace(space.id)}
						>
							<Icon name={space.kind === 'personal' ? 'lock' : 'users'} size={16} />
							<span class="min-w-0 flex-1 truncate">{space.name}</span>
							{#if space.needsRotation}
								<span class="size-2 rounded-full bg-warn" title="Renouvellement de clé en attente"
								></span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
			<button
				class="btn btn-ghost mt-1 w-full justify-start text-sm text-muted"
				onclick={() => (newSpaceOpen = true)}
			>
				<Icon name="plus" size={16} /> Nouvel espace
			</button>

			<p class="px-2 pt-5 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Outils</p>
			<ul class="space-y-0.5">
				{#each links as link (link.path)}
					{@const active = page.url.pathname === link.path}
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- link.href est déjà passé par resolve() -->
						<a
							href={link.href}
							onclick={() => (menuOpen = false)}
							aria-current={active ? 'page' : undefined}
							class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm {active
								? 'bg-brand-soft font-semibold text-brand'
								: 'hover:bg-surface-2'}"
						>
							<Icon name={link.icon} size={16} />
							{link.label}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		</div>

		<div class="border-t border-line p-3">
			<div class="mb-2 px-2">
				<p class="truncate text-sm font-semibold">{data.account.name}</p>
				<p class="truncate text-xs text-muted">{data.account.email}</p>
			</div>
			<div class="flex gap-2">
				<button class="btn flex-1 text-sm" onclick={() => vault.lock()}
					><Icon name="lock" size={16} /> Verrouiller</button
				>
				<button
					class="btn btn-icon"
					onclick={() => vault.logout()}
					aria-label="Se déconnecter"
					title="Se déconnecter"
				>
					<Icon name="logout" size={16} />
				</button>
			</div>
		</div>
	</div>
{/snippet}

{#if !vault.unlocked}
	<main class="grid min-h-dvh place-items-center px-4 py-10">
		<form onsubmit={submitUnlock} class="card w-full max-w-sm space-y-4 p-6 shadow-[var(--shadow)]">
			<div class="text-center">
				<span
					class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"
				>
					<Icon name="lock" size={24} />
				</span>
				<h1 class="text-lg font-semibold">Coffre verrouillé</h1>
				<p class="text-sm text-muted">{data.account.email}</p>
			</div>
			<PasswordField id="unlock" label="Mot de passe maître" bind:value={password} />
			{#if unlockError}<p class="alert alert-danger" role="alert">{unlockError}</p>{/if}
			<button class="btn btn-primary w-full" disabled={unlocking}>
				{unlocking ? 'Déverrouillage…' : 'Déverrouiller'}
			</button>
			<button type="button" class="btn btn-ghost w-full text-sm" onclick={() => vault.logout()}>
				Se déconnecter
			</button>
		</form>
	</main>
{:else}
	<div class="flex min-h-dvh">
		<aside class="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-surface md:block">
			{@render nav()}
		</aside>

		<div class="min-w-0 flex-1">
			<header
				class="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 md:hidden"
			>
				<button
					class="btn btn-ghost btn-icon"
					onclick={() => (menuOpen = true)}
					aria-label="Ouvrir le menu"
				>
					<Icon name="menu" />
				</button>
				<span class="font-bold">Idixus Vault</span>
			</header>
			<main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
				{@render children()}
			</main>
		</div>
	</div>

	{#if menuOpen}
		<Modal title="Menu" onclose={() => (menuOpen = false)} size="sm">
			<div class="-m-5 h-[70vh]">{@render nav()}</div>
		</Modal>
	{/if}

	{#if newSpaceOpen}
		<Modal title="Nouvel espace partagé" onclose={() => (newSpaceOpen = false)} size="sm">
			<form onsubmit={createSpace} class="space-y-4">
				<p class="text-sm text-muted">
					Un espace regroupe les accès d’une équipe ou d’un projet. Vous pourrez y inviter vos
					collègues ensuite.
				</p>
				<div>
					<label class="label" for="space-name">Nom de l’espace</label>
					<input
						id="space-name"
						class="field"
						required
						maxlength="80"
						bind:value={newSpaceName}
						placeholder="ex. Marketing"
					/>
				</div>
				<button class="btn btn-primary w-full">Créer l’espace</button>
			</form>
		</Modal>
	{/if}
{/if}
