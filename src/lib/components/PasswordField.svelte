<script lang="ts">
	import Icon from './Icon.svelte';
	import StrengthMeter from './StrengthMeter.svelte';

	let {
		value = $bindable(''),
		label,
		id,
		autocomplete = 'current-password',
		strength = false,
		required = true,
		placeholder = '',
		mono = false
	}: {
		value: string;
		label: string;
		id: string;
		autocomplete?: 'current-password' | 'new-password' | 'off';
		strength?: boolean;
		required?: boolean;
		placeholder?: string;
		mono?: boolean;
	} = $props();

	let visible = $state(false);
</script>

<div>
	<label class="label" for={id}>{label}</label>
	<div class="relative">
		<input
			{id}
			class="field pr-11 {mono ? 'font-mono' : ''}"
			type={visible ? 'text' : 'password'}
			bind:value
			{autocomplete}
			{required}
			{placeholder}
			spellcheck="false"
			autocapitalize="off"
		/>
		<button
			type="button"
			class="btn btn-ghost btn-icon absolute top-1/2 right-1 -translate-y-1/2"
			onclick={() => (visible = !visible)}
			aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
			aria-pressed={visible}
		>
			<Icon name={visible ? 'eyeOff' : 'eye'} />
		</button>
	</div>
	{#if strength}<StrengthMeter password={value} />{/if}
</div>
