import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

// https://vitejs.dev/config/
export default defineConfig(() => {
	const zodLocale = zodLocalePlugin(
		fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))
	)

	// Non-cloudflare backends: drop the cloudflare() plugin (workerd) and proxy /stream
	// to the Node server in server/. Keeps vite HMR for Mac dev.
	// Default path is unchanged: cloudflare() handles /stream as before.
	if (process.env.AGENT_BACKEND === 'local' || process.env.AGENT_BACKEND === 'bedrock') {
		const localServerPort = Number(process.env.LOCAL_SERVER_PORT ?? 8787)
		return {
			plugins: [zodLocale, react()],
			server: {
				proxy: {
					'/stream': {
						target: `http://localhost:${localServerPort}`,
						changeOrigin: true,
					},
				},
			},
		}
	}

	return {
		plugins: [zodLocale, cloudflare(), react()],
		// To allow a dev tunnel (e.g. Cloudflare tunnel, ngrok), add the hostname explicitly:
		// server: { allowedHosts: ['your-tunnel-hostname.trycloudflare.com'] },
	}
})
