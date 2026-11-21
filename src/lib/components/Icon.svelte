<script lang="ts" module>
	const paths = {
		plus: ['M12 5v14M5 12h14'],
		search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3'],
		copy: ['M9 9h11v11H9z', 'M5 15V4h11'],
		eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
		eyeOff: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M3 3l18 18'],
		trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
		edit: ['M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4'],
		users: [
			'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
			'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
			'M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8'
		],
		shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z', 'M9 12l2 2 4-4'],
		lock: ['M6 11h12v10H6z', 'M8 11V7a4 4 0 0 1 8 0v4'],
		logout: ['M9 4H5v16h4M16 8l4 4-4 4M20 12H9'],
		sliders: ['M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0', 'M14 4v4M8 10v4M16 16v4'],
		refresh: ['M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'],
		check: ['M5 12l5 5L20 7'],
		x: ['M6 6l12 12M18 6L6 18'],
		external: ['M14 4h6v6M20 4l-9 9M10 6H5v13h13v-5'],
		folder: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z'],
		alert: ['M12 4l9 16H3L12 4zM12 10v4M12 17v.01'],
		mail: ['M3 6h18v12H3z', 'M3 7l9 7 9-7'],
		key: [
			'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'
		],
		menu: ['M4 6h16M4 12h16M4 18h16'],
		user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
		download: ['M12 4v12M7 11l5 5 5-5M5 20h14']
	} as const;

	export type IconName = keyof typeof paths;
</script>

<script lang="ts">
	let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each paths[name] as d (d)}
		<path {d} />
	{/each}
</svg>
