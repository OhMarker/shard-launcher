/**
 * Service wiring. Feature modules are created here and attached to the context, then each
 * module registers its IPC handlers. The order matters only for `init()` style side effects.
 */
import { type AppContext, type Services } from './context'

export interface ServiceBundle {
  services: Services
  registerIpc(): void
  /** Startup work that must not block window creation. */
  start(): Promise<void>
  /** Called before quit. */
  dispose(): Promise<void>
}

export async function createServices(ctx: AppContext): Promise<ServiceBundle> {
  const { createAccountService, registerAuthIpc } = await import('./auth/accounts')
  const { createVersionService, registerVersionIpc } = await import('./minecraft/versions')
  const { createInstanceService, registerInstanceIpc } = await import('./instances/instances')
  const { createJavaService, registerJavaIpc } = await import('./java/java')
  const { createLaunchService, registerLaunchIpc } = await import('./launch/launch')
  const { createModrinthClient } = await import('./modrinth/client')
  const { createModService, registerModIpc } = await import('./mods/mods')
  const { createShardClientService, registerShardIpc } = await import('./shard/client')
  const { createSharedConfigService } = await import('./shard/shared-config')
  const { createCosmeticsService, registerCosmeticsIpc } = await import('./cosmetics/cosmetics')
  const { createSkinService, registerSkinIpc } = await import('./skins/skins')
  const { createUpdateService, registerUpdateIpc } = await import('./updates/updates')
  const { createNewsService, registerNewsIpc } = await import('./updates/news')
  const { createDiscordService } = await import('./discord/rpc')

  const services: Services = {
    accounts: createAccountService(ctx),
    versions: createVersionService(ctx),
    instances: createInstanceService(ctx),
    java: createJavaService(ctx),
    launcher: createLaunchService(ctx),
    modrinth: createModrinthClient(ctx),
    mods: createModService(ctx),
    shard: createShardClientService(ctx),
    sharedConfig: createSharedConfigService(ctx),
    cosmetics: createCosmeticsService(ctx),
    skins: createSkinService(ctx),
    updates: createUpdateService(ctx),
    news: createNewsService(ctx),
    discord: createDiscordService(ctx)
  }
  ctx.services = services

  return {
    services,
    registerIpc() {
      registerAuthIpc(ctx)
      registerVersionIpc(ctx)
      registerInstanceIpc(ctx)
      registerJavaIpc(ctx)
      registerLaunchIpc(ctx)
      registerModIpc(ctx)
      registerShardIpc(ctx)
      registerCosmeticsIpc(ctx)
      registerSkinIpc(ctx)
      registerUpdateIpc(ctx)
      registerNewsIpc(ctx)
    },
    async start() {
      services.updates.init()
      services.discord.setEnabled(ctx.settings.get().discordRpc)
      await services.accounts.refreshAllOnStartup()
    },
    async dispose() {
      await services.launcher.killAll()
      services.discord.dispose()
    }
  }
}
