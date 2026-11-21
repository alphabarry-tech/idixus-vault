export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

let doFetch: Fetcher = (input, init) => fetch(input, init);

/** Permet aux tests de bout en bout d'injecter un fetch avec jar de cookies et en-tête Origin. */
export function setFetch(f: Fetcher) {
	doFetch = f;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await doFetch(path, {
		method,
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	let data: unknown = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		// réponse non JSON (page d'erreur) : on garde le texte brut dans le message ci-dessous
	}
	if (!res.ok) {
		const message = (data as { message?: string } | null)?.message ?? `Erreur ${res.status}`;
		throw new ApiError(res.status, message);
	}
	return data as T;
}
