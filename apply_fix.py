import sys

filepath = 'src/composables/use-app-logic.ts'
with open(filepath, 'r') as f:
    content = f.read()

search1 = """  onMounted(async () => {
    supabase.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session)
    })"""

replace1 = """  onMounted(async () => {
    if (isOfflineMode()) {
      session.value = {
        access_token: 'offline-token',
        user: {
          id: 'offline-user',
          email: 'offline@local',
          app_metadata: {},
          user_metadata: { full_name: 'Offline User' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as any,
        expires_in: 3600,
        token_type: 'bearer',
      }
    }

    supabase.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session)
    })"""

search2 = """    const { data, error } = await supabase.auth.getSession()
    if (data.session) void loadSettings()

    if (error) {
      logger.error('Failed to retrieve auth session, clearing stale data', { error })
      await supabase.auth.signOut()
      return
    }

    session.value = data.session
  })"""

replace2 = """    if (isOfflineMode()) {
      void loadSettings()
      return
    }

    const { data, error } = await supabase.auth.getSession()
    if (data.session) void loadSettings()

    if (error) {
      logger.error('Failed to retrieve auth session, clearing stale data', { error })
      await supabase.auth.signOut()
      return
    }

    session.value = data.session
  })"""

content = content.replace(search1, replace1)
content = content.replace(search2, replace2)

with open(filepath, 'w') as f:
    f.write(content)
