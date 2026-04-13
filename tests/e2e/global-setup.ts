/**
 * Playwright global setup — activate license key before running e2e tests.
 */
export default async function globalSetup() {
  const serverPort = process.env.VITE_SERVER_PORT ?? '16667'
  const url = `http://localhost:${serverPort}/api/activate_license`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: 'CLAW-PILOT-2026-ALPHA-001' }),
  })

  if (!res.ok) {
    console.warn(`[global-setup] License activation failed: ${res.status}`)
  }
}
