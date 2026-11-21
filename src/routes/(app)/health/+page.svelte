<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/Icon.svelte';
	import { analyzeHealth, type Health, type HealthItem } from '#lib/client/health.ts';
	import { vault } from '#lib/client/vault.svelte.ts';

	let health = $state<Health | null>(null);
	let total = $state(0);

	async function scan() {
		health = null;
		const items = await vault.loadAll();
		total = items.length;
		health = analyzeHealth(items);
	}
	scan();

	const RADIUS = 52;
	const CIRC = 2 * Math.PI * RADIUS;

	let tone = $derived(
		!health
			? 'var(--muted)'
			: health.score >= 80
				? 'var(--ok)'
				: health.score >= 50
					? 'var(--warn)'
					: 'var(--danger)'
	);

	let sections = $derived(
		health
			? ([
					{
						key: 'weak',
						title: 'Mots de passe faibles',
						hint: 'Trop courts ou faciles à deviner. À remplacer en priorité.',
						badge: 'badge-danger',
						groups: health.weak.map((i) => [i])
					},
					{
						key: 'reused',
						title: 'Mots de passe réutilisés',
						hint: 'Le même mot de passe sur plusieurs comptes : une fuite en expose plusieurs.',
						badge: 'badge-warn',
						groups: health.reused
					},
					{
						key: 'old',
						title: 'Plus d’un an sans changement',
						hint: 'Pensez à les renouveler, surtout pour les accès sensibles.',
						badge: '',
						groups: health.old.map((i) => [i])
					},
					{
						key: 'empty',
						title: 'Entrées sans mot de passe',
						hint: 'Elles ne contiennent aucun mot de passe.',
						badge: '',
						groups: health.empty.map((i) => [i])
					}
				] as const)
			: []
	);

	const link = (i: HealthItem) => `${resolve('/(app)')}?space=${i.space.id}&entry=${i.entry.id}`;
</script>

<svelte:head><title>Santé des mots de passe · Idixus Vault</title></svelte:head>

<div class="mb-6 flex items-center gap-3">
	<div class="flex-1">
		<h1 class="text-xl font-bold">Santé des mots de passe</h1>
		<p class="text-sm text-muted">
			Analyse faite dans votre navigateur, sur tous vos espaces. Aucun mot de passe n’est envoyé.
		</p>
	</div>
	<button class="btn" onclick={scan}><Icon name="refresh" size={16} /> Réanalyser</button>
</div>

{#if vault.error}<p class="alert alert-danger mb-4" role="alert">{vault.error}</p>{/if}

{#if !health}
	<p class="py-12 text-center text-sm text-muted">Analyse en cours…</p>
{:else if total === 0}
	<div class="card px-6 py-12 text-center">
		<p class="font-semibold">Rien à analyser</p>
		<p class="text-sm text-muted">
			Ajoutez des entrées à vos espaces pour voir leur état de santé.
		</p>
	</div>
{:else}
	<div class="card mb-6 flex flex-wrap items-center gap-6 p-5">
		<div
			class="relative size-32 shrink-0"
			role="img"
			aria-label="Score de santé : {health.score} sur 100"
		>
			<svg viewBox="0 0 128 128" class="size-full -rotate-90">
				<circle cx="64" cy="64" r={RADIUS} fill="none" stroke="var(--line)" stroke-width="12" />
				<circle
					cx="64"
					cy="64"
					r={RADIUS}
					fill="none"
					stroke={tone}
					stroke-width="12"
					stroke-linecap="round"
					stroke-dasharray={CIRC}
					stroke-dashoffset={CIRC * (1 - health.score / 100)}
				/>
			</svg>
			<div class="absolute inset-0 grid place-items-center">
				<span class="text-3xl font-bold" style:color={tone}
					>{health.score}<span class="text-base">%</span></span
				>
			</div>
		</div>
		<div class="min-w-0 flex-1 basis-60">
			<p class="text-lg font-semibold">
				{#if health.score >= 80}Vos mots de passe sont en bonne santé{:else if health.score >= 50}Des
					améliorations sont possibles{:else}Vos accès sont fragiles{/if}
			</p>
			<p class="text-sm text-muted">
				{total}
				{total > 1 ? 'entrées analysées' : 'entrée analysée'}. Le score correspond à la part de mots
				de passe ni faibles ni réutilisés.
			</p>
			<dl class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				{#each sections as s (s.key)}
					<div class="rounded-lg bg-surface-2 px-3 py-2">
						<dt class="text-xs text-muted">{s.title}</dt>
						<dd class="text-xl font-bold">{s.groups.length}</dd>
					</div>
				{/each}
			</dl>
		</div>
	</div>

	<div class="space-y-5">
		{#each sections as s (s.key)}
			{#if s.groups.length > 0}
				<section>
					<h2 class="font-semibold">{s.title}</h2>
					<p class="mb-2 text-sm text-muted">{s.hint}</p>
					<ul class="card divide-y divide-line overflow-hidden">
						{#each s.groups as group, gi (gi)}
							<li class="px-4 py-2.5">
								{#if group.length > 1}<p class="mb-1 text-xs text-muted">
										Même mot de passe sur {group.length} comptes :
									</p>{/if}
								<div class="flex flex-wrap gap-x-4 gap-y-1">
									{#each group as item (item.entry.id)}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- link() construit son URL avec resolve() -->
										<a
											class="text-sm text-brand underline-offset-2 hover:underline"
											href={link(item)}
										>
											{item.entry.data.title}
											<span class="text-muted">· {item.space.name}</span>
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{/each}
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
		{#if sections.every((s) => s.groups.length === 0)}
			<p class="alert alert-ok"><Icon name="check" size={16} /> Aucun problème détecté.</p>
		{/if}
	</div>
{/if}
