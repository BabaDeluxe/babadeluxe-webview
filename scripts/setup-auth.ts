/* eslint-disable @typescript-eslint/naming-convention */
import dotenv from 'dotenv'
import process from 'process'

dotenv.config()

const {
  SUPABASE_PROJECT_REF,
  SUPABASE_PAT,
  VITE_ZITADEL_ISSUER,
  VITE_SITE_URL = 'http://localhost:5173',
} = process.env

if (!SUPABASE_PROJECT_REF || !SUPABASE_PAT) {
  console.error('Error: SUPABASE_PROJECT_REF and SUPABASE_PAT must be set.')
  process.exit(1)
}

const baseUrl = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`
const headers = {
  Authorization: `Bearer ${SUPABASE_PAT}`,
  'Content-Type': 'application/json',
}

async function setupAuth() {
  console.log('Starting Supabase Auth configuration...')

  try {
    // 1. Update Auth Config
    console.log('Updating project auth configuration...')
    const authConfigResponse = await fetch(baseUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        uri_allow_list: `${VITE_SITE_URL},${VITE_SITE_URL}/auth/callback`,
        external_github_enabled: true,
        external_google_enabled: true,
        ...(VITE_ZITADEL_ISSUER ? { saml_enabled: true } : {}),
      }),
    })

    if (!authConfigResponse.ok) {
      const errorData = await authConfigResponse.json()
      throw new Error(`Failed to update auth config: ${JSON.stringify(errorData)}`)
    }

    console.log('Auth config updated successfully.')

    // 2. Register Zitadel if provided
    if (VITE_ZITADEL_ISSUER) {
      console.log('Registering Zitadel as Third-Party Auth issuer...')
      const tpaResponse = await fetch(`${baseUrl}/third-party`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          oidc_issuer_url: VITE_ZITADEL_ISSUER,
        }),
      })

      if (!tpaResponse.ok) {
        if (tpaResponse.status === 409) {
          console.log('Zitadel issuer already registered.')
        } else {
          const errorData = await tpaResponse.json()
          throw new Error(`Failed to register Zitadel: ${JSON.stringify(errorData)}`)
        }
      } else {
        console.log('Zitadel registered successfully.')
      }
    }

    console.log('Auth setup complete!')
  } catch (e: unknown) {
    console.error('Error during auth setup:', (e as Error).message)
    process.exit(1)
  }
}

setupAuth()
