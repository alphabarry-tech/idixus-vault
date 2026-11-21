import { appendFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import {
	APP_URL,
	SMTP_FROM,
	SMTP_HOST,
	SMTP_PASSWORD,
	SMTP_PORT,
	SMTP_SECURE,
	SMTP_USER
} from '$app/env/private';

type Mail = { to: string; subject: string; text: string; html: string };

const transport = SMTP_HOST
	? nodemailer.createTransport({
			host: SMTP_HOST,
			port: SMTP_PORT,
			secure: SMTP_SECURE,
			auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
		})
	: null;

async function send(mail: Mail) {
	if (transport) {
		await transport.sendMail({ from: SMTP_FROM, ...mail });
		return;
	}
	// Pas de SMTP configuré : on écrit le mail dans un fichier local (développement uniquement)
	console.warn(`[mail] SMTP_HOST non défini, mail pour ${mail.to} écrit dans .dev-mail.log`);
	await appendFile(
		'.dev-mail.log',
		JSON.stringify({
			at: new Date().toISOString(),
			to: mail.to,
			subject: mail.subject,
			text: mail.text
		}) + '\n'
	);
}

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

function layout(title: string, body: string) {
	return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1b1b2f">
<h2 style="color:#6C5CE7;margin:0 0 16px">Idixus Vault</h2>
<h3 style="margin:0 0 12px">${esc(title)}</h3>${body}
<p style="color:#888;font-size:12px;margin-top:32px">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p></div>`;
}

export function sendInvitation(to: string, token: string, invitedByName: string | null) {
	const link = `${APP_URL}/invite/${token}`;
	const who = invitedByName ? `${invitedByName} vous invite` : 'Vous êtes invité';
	return send({
		to,
		subject: 'Invitation à Idixus Vault',
		text: `${who} à rejoindre Idixus Vault, le gestionnaire de mots de passe d'Idixus.\n\nCréez votre compte (lien valable 48 h, à usage unique) :\n${link}\n`,
		html: layout(
			'Vous êtes invité',
			`<p>${esc(who)} à rejoindre le gestionnaire de mots de passe d'Idixus.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#6C5CE7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Créer mon compte</a></p>
<p style="color:#555;font-size:13px">Lien valable 48 h, à usage unique.</p>`
		)
	});
}

export function sendOtp(to: string, code: string) {
	return send({
		to,
		subject: `Votre code Idixus Vault : ${code}`,
		text: `Votre code de vérification : ${code}\n\nIl est valable 5 minutes. Ne le communiquez à personne.\n`,
		html: layout(
			'Code de vérification',
			`<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${esc(code)}</p>
<p style="color:#555;font-size:13px">Valable 5 minutes. Ne le communiquez à personne.</p>`
		)
	});
}
