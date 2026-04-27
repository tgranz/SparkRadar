#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const CAMERA_FILE = path.resolve('src/data/traffic_cameras.json');

function parseNumberOrThrow(value, fieldName) {
	const num = Number(String(value || '').trim());
	if (!Number.isFinite(num)) {
		throw new Error(`Invalid ${fieldName}. Expected a number.`);
	}
	return num;
}

function normalizeFacing(value) {
	return String(value || '').trim().toUpperCase();
}

async function loadCameraJson(filePath) {
	const raw = await fs.readFile(filePath, 'utf8');
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('traffic_cameras.json must be an object keyed by state name.');
	}
	return parsed;
}

async function promptForCamera() {
	const rl = readline.createInterface({ input, output });

	try {
		console.log('Add a new traffic camera');
		console.log('Leave static/video URL blank if not available.\n');

		const latText = await rl.question('Latitude: ');
		const lonText = await rl.question('Longitude: ');
		const name = (await rl.question('Camera name: ')).trim();
		const state = (await rl.question('State (FULL NAME, CASE SENSITIVE): ')).trim();
		const videoUrl = (await rl.question('Video URL: ')).trim();
		const facing = normalizeFacing(await rl.question('Facing (N, S, E, W, etc.): '));
		const encoding = (await rl.question('Encoding: ')).trim();
		const staticUrl = (await rl.question('Static URL: ')).trim();
		const format = (await rl.question('Format: ')).trim();

		if (!name) throw new Error('Camera name is required.');
		if (!state) throw new Error('State is required.');

		const lat = parseNumberOrThrow(latText, 'latitude');
		const lon = parseNumberOrThrow(lonText, 'longitude');

		return {
			state,
			camera: {
				lat,
				lon,
				name,
				facing,
				stream: {
					static: staticUrl,
					video: videoUrl,
					encoding,
					format,
				},
			},
		};
	} finally {
		rl.close();
	}
}

async function main() {
	const json = await loadCameraJson(CAMERA_FILE);
	const { state, camera } = await promptForCamera();

	if (!Array.isArray(json[state])) {
		json[state] = [];
	}

	json[state].push(camera);

	await fs.writeFile(CAMERA_FILE, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

	console.log(`\nAdded camera to ${state}.`);
	console.log(`New count for ${state}: ${json[state].length}`);
	console.log(`Updated file: ${CAMERA_FILE}`);
}

main().catch((err) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
