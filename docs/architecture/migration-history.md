# Previous architecture migration

This historical record predates the November 2026 follow-up cleanup. Paths and results describe that migration, not current validation. The [current inventory](repository-inventory.md) owns the live directory map.

## Moved and renamed files

254 final file moves/renames are recorded. Redirect chains are resolved to their final destination.

| Original path                                                        | Final path                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/app/_components/auth-actions.ts`                                | `src/features/auth/actions.ts`                                 |
| `src/app/_components/auth-field.tsx`                                 | `src/features/auth/components/auth-field.tsx`                  |
| `src/app/_components/avatar.tsx`                                     | `src/components/navigation/avatar.tsx`                         |
| `src/app/_components/icons.tsx`                                      | `src/components/icons.tsx`                                     |
| `src/app/_components/logo.tsx`                                       | `src/components/brand/logo.tsx`                                |
| `src/app/_components/mobile-navigation.tsx`                          | `src/components/navigation/mobile-navigation.tsx`              |
| `src/app/_components/nav-config.ts`                                  | `src/components/navigation/nav-config.ts`                      |
| `src/app/_components/navigation-menu.tsx`                            | `src/components/navigation/navigation-menu.tsx`                |
| `src/app/_components/site-footer.tsx`                                | `src/components/layout/site-footer.tsx`                        |
| `src/app/_components/top-navigation.tsx`                             | `src/components/navigation/top-navigation.tsx`                 |
| `src/app/(workspace)/_components/form-controls.tsx`                  | `src/components/ui/form-controls.tsx`                          |
| `src/app/(workspace)/_components/gauge-notice.tsx`                   | `src/components/feedback/gauge-notice.tsx`                     |
| `src/app/(workspace)/_components/guild-chat.tsx`                     | `src/features/guilds/components/guild-chat.tsx`                |
| `src/app/(workspace)/_components/meter.tsx`                          | `src/components/ui/meter.tsx`                                  |
| `src/app/(workspace)/_components/page-header.tsx`                    | `src/components/ui/page-header.tsx`                            |
| `src/app/(workspace)/_components/segmented-nav.tsx`                  | `src/components/ui/segmented-nav.tsx`                          |
| `src/app/(workspace)/admin/_components/admin-nav.tsx`                | `src/features/admin/components/admin-nav.tsx`                  |
| `src/app/(workspace)/admin/_components/hooks/useAdminOverview.ts`    | `src/features/admin/hooks/use-admin-overview.ts`               |
| `src/app/(workspace)/admin/_components/hooks/useAdminQuery.ts`       | `src/features/admin/hooks/use-admin-query.ts`                  |
| `src/app/(workspace)/admin/_components/hooks/useAdminUrl.ts`         | `src/features/admin/hooks/use-admin-url.ts`                    |
| `src/app/(workspace)/admin/_components/hooks/useConfirmedAction.tsx` | `src/features/admin/hooks/use-confirmed-action.tsx`            |
| `src/app/(workspace)/admin/_components/overview-live.tsx`            | `src/features/admin/components/overview-live.tsx`              |
| `src/app/(workspace)/admin/_components/overview-view.tsx`            | `src/features/admin/components/overview-view.tsx`              |
| `src/app/(workspace)/admin/_components/parts/AdminResults.tsx`       | `src/features/admin/components/admin-results.tsx`              |
| `src/app/(workspace)/admin/_components/parts/AdminWorkspace.tsx`     | `src/features/admin/components/admin-workspace.tsx`            |
| `src/app/(workspace)/admin/_components/parts/ApiReference.tsx`       | `src/features/admin/components/api-reference.tsx`              |
| `src/app/(workspace)/admin/_components/parts/ConfirmDialog.tsx`      | `src/features/admin/components/confirm-dialog.tsx`             |
| `src/app/(workspace)/admin/_components/parts/ConsoleHandoff.tsx`     | `src/features/admin/components/console-handoff.tsx`            |
| `src/app/(workspace)/admin/_components/parts/ConsoleOnly.tsx`        | `src/features/admin/components/console-only.tsx`               |
| `src/app/(workspace)/admin/_components/parts/DataPanel.tsx`          | `src/features/admin/components/data-panel.tsx`                 |
| `src/app/(workspace)/admin/_components/parts/GuildOversight.tsx`     | `src/features/admin/components/guild-oversight.tsx`            |
| `src/app/(workspace)/admin/_components/parts/OperationFields.tsx`    | `src/features/admin/components/operation-fields.tsx`           |
| `src/app/(workspace)/admin/_components/parts/OperationGuide.tsx`     | `src/features/admin/components/operation-guide.tsx`            |
| `src/app/(workspace)/admin/_components/parts/Trend.tsx`              | `src/features/admin/components/trend.tsx`                      |
| `src/app/(workspace)/admin/_components/screens/AddonsScreen.tsx`     | `src/features/admin/components/screens/addons-screen.tsx`      |
| `src/app/(workspace)/admin/_components/screens/AdminToolsScreen.tsx` | `src/features/admin/components/screens/admin-tools-screen.tsx` |
| `src/app/(workspace)/admin/_components/screens/BackupsScreen.tsx`    | `src/features/admin/components/screens/backups-screen.tsx`     |
| `src/app/(workspace)/admin/_components/screens/BasesScreen.tsx`      | `src/features/admin/components/screens/bases-screen.tsx`       |
| `src/app/(workspace)/admin/_components/screens/CareScreen.tsx`       | `src/features/admin/components/screens/care-screen.tsx`        |
| `src/app/(workspace)/admin/_components/screens/DirectoryScreen.tsx`  | `src/features/admin/components/screens/directory-screen.tsx`   |
| `src/app/(workspace)/admin/_components/screens/DiscordScreen.tsx`    | `src/features/admin/components/screens/discord-screen.tsx`     |
| `src/app/(workspace)/admin/_components/screens/GuildToolsScreen.tsx` | `src/features/admin/components/screens/guild-tools-screen.tsx` |
| `src/app/(workspace)/admin/_components/screens/LiveMapScreen.tsx`    | `src/features/admin/components/screens/live-map-screen.tsx`    |
| `src/app/(workspace)/admin/_components/screens/LogsScreen.tsx`       | `src/features/admin/components/screens/logs-screen.tsx`        |
| `src/app/(workspace)/admin/_components/screens/MapsScreen.tsx`       | `src/features/admin/components/screens/maps-screen.tsx`        |
| `src/app/(workspace)/admin/_components/screens/MarketScreen.tsx`     | `src/features/admin/components/screens/market-screen.tsx`      |
| `src/app/(workspace)/admin/_components/screens/PlayersScreen.tsx`    | `src/features/admin/components/screens/players-screen.tsx`     |
| `src/app/(workspace)/admin/_components/screens/ServerScreen.tsx`     | `src/features/admin/components/screens/server-screen.tsx`      |
| `src/app/(workspace)/admin/_components/screens/StatisticsScreen.tsx` | `src/features/admin/components/screens/statistics-screen.tsx`  |
| `src/app/(workspace)/admin/_components/screens/UpdatesScreen.tsx`    | `src/features/admin/components/screens/updates-screen.tsx`     |
| `src/app/(workspace)/admin/_components/screens/VehiclesScreen.tsx`   | `src/features/admin/components/screens/vehicles-screen.tsx`    |
| `src/app/(workspace)/admin/_components/ui.ts`                        | `src/features/admin/components/ui.ts`                          |
| `src/app/(workspace)/admin/changelog/_components/composer.tsx`       | `src/features/admin/components/changelog/composer.tsx`         |
| `src/app/(workspace)/admin/changelog/_components/embed-preview.tsx`  | `src/features/admin/components/changelog/embed-preview.tsx`    |
| `src/app/(workspace)/bases/_components/base-card.tsx`                | `src/features/bases/components/marketplace/base-card.tsx`      |
| `src/app/(workspace)/bases/_components/delete-button.tsx`            | `src/features/bases/components/marketplace/delete-button.tsx`  |
| `src/app/(workspace)/bases/_components/import-button.tsx`            | `src/features/bases/components/marketplace/import-button.tsx`  |
| `src/app/(workspace)/bases/upload/_components/upload-form.tsx`       | `src/features/bases/components/upload-form.tsx`                |
| `src/app/(workspace)/guild/_components/application-inbox.tsx`        | `src/features/guilds/components/application-inbox.tsx`         |
| `src/app/(workspace)/guild/_components/logo-uploader.tsx`            | `src/features/guilds/components/logo-uploader.tsx`             |
| `src/app/(workspace)/guild/_components/management.tsx`               | `src/features/guilds/components/management.tsx`                |
| `src/app/(workspace)/guild/_components/modal.tsx`                    | `src/features/guilds/components/modal.tsx`                     |
| `src/app/(workspace)/guild/_components/mutation.ts`                  | `src/features/guilds/components/mutation.ts`                   |
| `src/app/(workspace)/guild/_components/question-editor.tsx`          | `src/features/guilds/components/question-editor.tsx`           |
| `src/app/(workspace)/guild/_components/roster.tsx`                   | `src/features/guilds/components/roster.tsx`                    |
| `src/app/(workspace)/guild/_components/settings-form.tsx`            | `src/features/guilds/components/settings-form.tsx`             |
| `src/app/(workspace)/guild/_components/support-panel.tsx`            | `src/features/guilds/components/support-panel.tsx`             |
| `src/app/(workspace)/guilds/_components/application-panel.tsx`       | `src/features/guilds/components/application-panel.tsx`         |
| `src/app/(workspace)/guilds/_components/guild-directory.tsx`         | `src/features/guilds/components/guild-directory.tsx`           |
| `src/app/(workspace)/guilds/_components/listing-card.tsx`            | `src/features/guilds/components/listing-card.tsx`              |
| `src/app/(workspace)/guilds/_components/question-input.tsx`          | `src/features/guilds/components/question-input.tsx`            |
| `src/app/(workspace)/holdings/_components/base-card.tsx`             | `src/features/bases/components/holdings/base-card.tsx`         |
| `src/app/(workspace)/holdings/preview/_components/preview-host.tsx`  | `src/features/bases/components/holdings/preview-host.tsx`      |
| `src/app/(workspace)/map/_components/map-switch.tsx`                 | `src/features/map/components/map-switch.tsx`                   |
| `src/app/(workspace)/market/_components/market-grid.tsx`             | `src/features/market/components/market-grid.tsx`               |
| `src/app/(workspace)/portal/_components/population-chart.tsx`        | `src/features/portal/components/population-chart.tsx`          |
| `src/app/(workspace)/vehicles/_components/access-bar.tsx`            | `src/features/vehicles/components/access-bar.tsx`              |
| `src/app/(workspace)/vehicles/_components/vehicle-card.tsx`          | `src/features/vehicles/components/vehicle-card.tsx`            |
| `src/app/globals.css`                                                | `src/styles/globals.css`                                       |
| `src/app/login/_components/login-panel.tsx`                          | `src/features/auth/components/login-panel.tsx`                 |
| `src/app/setup-password/_components/set-password-form.tsx`           | `src/features/auth/components/set-password-form.tsx`           |
| `src/app/tokens.css`                                                 | `src/styles/tokens.css`                                        |
| `src/config/pterodactyl-egg.mjs`                                     | `scripts/deployment/build-pterodactyl-egg.mjs`                 |
| `src/config/rekey-redis.mjs`                                         | `scripts/maintenance/rekey-redis.mjs`                          |
| `src/config/server-launcher.mjs`                                     | `scripts/server-launcher.mjs`                                  |
| `src/features/format.ts`                                             | `src/lib/format.ts`                                            |
| `src/features/map/components/CoriolisCountdown.tsx`                  | `src/features/map/components/coriolis-countdown.tsx`           |
| `src/features/map/components/MapCanvas.tsx`                          | `src/features/map/components/map-canvas.tsx`                   |
| `src/features/map/components/MapMarker.tsx`                          | `src/features/map/components/map-marker.tsx`                   |
| `src/features/map/components/MapStatusBar.tsx`                       | `src/features/map/components/map-status-bar.tsx`               |
| `src/features/map/components/MapToolbar.tsx`                         | `src/features/map/components/map-toolbar.tsx`                  |
| `src/features/map/components/MapWindow.tsx`                          | `src/features/map/components/map-window.tsx`                   |
| `src/features/map/components/MarkerDetails.tsx`                      | `src/features/map/components/marker-details.tsx`               |
| `src/features/map/components/SectorGridOverlay.tsx`                  | `src/features/map/components/sector-grid-overlay.tsx`          |
| `src/features/map/components/TiledMapImage.tsx`                      | `src/features/map/components/tiled-map-image.tsx`              |
| `src/features/map/hooks/useMapData.ts`                               | `src/features/map/hooks/use-map-data.ts`                       |
| `src/features/map/hooks/useMapDrag.ts`                               | `src/features/map/hooks/use-map-drag.ts`                       |
| `src/features/map/hooks/useMapZoom.ts`                               | `src/features/map/hooks/use-map-zoom.ts`                       |
| `src/features/map/hooks/useRealtimeData.ts`                          | `src/features/map/hooks/use-realtime-data.ts`                  |
| `src/features/map/terrain/models/buildClientModels.mjs`              | `scripts/maintenance/build-client-models.mjs`                  |
| `src/features/map/terrain/models/buildingModels.ts`                  | `src/features/map/terrain/models/building-models.ts`           |
| `src/features/map/terrain/models/sandwormModel.ts`                   | `src/features/map/terrain/models/sandworm-model.ts`            |
| `src/features/map/terrain/models/ueTransform.ts`                     | `src/features/map/terrain/models/ue-transform.ts`              |
| `src/features/map/terrain/models/vehicleModels.ts`                   | `src/features/map/terrain/models/vehicle-models.ts`            |
| `src/features/map/terrain/models/worldModels.ts`                     | `src/features/map/terrain/models/world-models.ts`              |
| `src/features/map/terrain/scene/DeepDesertTerrain.tsx`               | `src/features/map/terrain/scene/deep-desert-terrain.tsx`       |
| `src/features/map/terrain/scene/MapHud.tsx`                          | `src/features/map/terrain/scene/map-hud.tsx`                   |
| `src/features/map/terrain/scene/mapPresentation.ts`                  | `src/features/map/terrain/scene/map-presentation.ts`           |
| `src/features/map/terrain/scene/MapScene3D.tsx`                      | `src/features/map/terrain/scene/map-scene-3d.tsx`              |
| `src/features/map/terrain/scene/renderQuality.ts`                    | `src/features/map/terrain/scene/render-quality.ts`             |
| `src/features/map/terrain/scene/sceneFraming.ts`                     | `src/features/map/terrain/scene/scene-framing.ts`              |
| `src/features/map/terrain/scene/sceneGeometry.ts`                    | `src/features/map/terrain/scene/scene-geometry.ts`             |
| `src/features/map/terrain/scene/sceneModels.ts`                      | `src/features/map/terrain/scene/scene-models.ts`               |
| `src/features/map/terrain/surface/desertDetails.ts`                  | `src/features/map/terrain/surface/desert-details.ts`           |
| `src/features/map/terrain/surface/desertMaterials.ts`                | `src/features/map/terrain/surface/desert-materials.ts`         |
| `src/features/map/terrain/surface/heightSurface.ts`                  | `src/features/map/terrain/surface/height-surface.ts`           |
| `src/features/map/terrain/surface/terrainAssets.ts`                  | `src/features/map/terrain/surface/terrain-assets.ts`           |
| `src/features/map/terrain/surface/terrainGeometry.ts`                | `src/features/map/terrain/surface/terrain-geometry.ts`         |
| `src/features/map/terrain/surface/terrainSupport.ts`                 | `src/features/map/terrain/surface/terrain-support.ts`          |
| `src/features/map/utils/mapData.ts`                                  | `src/features/map/utils/map-data.ts`                           |
| `src/features/map/utils/mapResolution.ts`                            | `src/features/map/utils/map-resolution.ts`                     |
| `src/features/map/utils/sectorGrid.ts`                               | `src/features/map/utils/sector-grid.ts`                        |
| `src/features/portal/bases.ts`                                       | `src/features/bases/view-model.ts`                             |
| `src/features/portal/character.ts`                                   | `src/features/player/character.ts`                             |
| `src/features/portal/inventory.ts`                                   | `src/features/player/inventory.ts`                             |
| `src/features/portal/item-image.ts`                                  | `src/features/player/item-image.ts`                            |
| `src/features/portal/item-images.json`                               | `src/features/player/item-images.json`                         |
| `src/features/portal/storage.ts`                                     | `src/features/player/storage.ts`                               |
| `src/infrastructure/api-read-cache.ts`                               | `src/server/api-read-cache.ts`                                 |
| `src/infrastructure/cookies.ts`                                      | `src/server/cookies.ts`                                        |
| `src/infrastructure/discord.ts`                                      | `src/server/integrations/discord.ts`                           |
| `src/infrastructure/dune.ts`                                         | `src/server/integrations/dune.ts`                              |
| `src/infrastructure/dunedocker/transport.ts`                         | `src/server/integrations/dunedocker/transport.ts`              |
| `src/infrastructure/pages-api.ts`                                    | `src/server/pages-api.ts`                                      |
| `src/lib/redis/rekey-rules.mjs`                                      | `scripts/maintenance/rekey-rules.mjs`                          |
| `src/lib/security/session-store.ts`                                  | `src/features/auth/server/session-store.ts`                    |
| `src/lib/types.ts`                                                   | `src/types/dashboard.ts`                                       |
| `src/modules/admin/server/access.ts`                                 | `src/features/admin/server/access.ts`                          |
| `src/modules/admin/server/guilds.ts`                                 | `src/features/admin/server/guilds.ts`                          |
| `src/modules/admin/server/request.ts`                                | `src/features/admin/server/request.ts`                         |
| `src/modules/admin/server/sanitize.ts`                               | `src/features/admin/server/sanitize.ts`                        |
| `src/modules/auth/server/session.ts`                                 | `src/features/auth/server/session-api.ts`                      |
| `src/modules/bases/components/BaseImport.tsx`                        | `src/features/bases/components/base-import.tsx`                |
| `src/modules/bases/components/BaseModelViewer.tsx`                   | `src/features/bases/components/base-model-viewer.tsx`          |
| `src/modules/bases/components/BasePreview.tsx`                       | `src/features/bases/components/base-preview.tsx`               |
| `src/modules/bases/schema.ts`                                        | `src/features/bases/blueprint.ts`                              |
| `src/modules/bases/server/history.ts`                                | `src/features/bases/server/history.ts`                         |
| `src/modules/bases/server/import.ts`                                 | `src/features/bases/server/import.ts`                          |
| `src/modules/bases/server/owned-export.ts`                           | `src/features/bases/server/owned-export.ts`                    |
| `src/modules/bases/server/preview-settings.ts`                       | `src/features/bases/server/preview-settings.ts`                |
| `src/modules/bases/styles/import.module.css`                         | `src/features/bases/styles/import.module.css`                  |
| `src/modules/bases/styles/preview.module.css`                        | `src/features/bases/styles/preview.module.css`                 |
| `src/modules/bases/types.ts`                                         | `src/features/bases/types.ts`                                  |
| `src/modules/bases/utils/import-blueprint.ts`                        | `src/features/bases/utils/import-blueprint.ts`                 |
| `src/modules/bases/utils/model-export.ts`                            | `src/features/bases/utils/model-export.ts`                     |
| `src/modules/bases/utils/preview-camera.ts`                          | `src/features/bases/utils/preview-camera.ts`                   |
| `src/modules/bases/utils/preview-settings.ts`                        | `src/features/bases/utils/preview-settings.ts`                 |
| `src/modules/bot/server/world.ts`                                    | `src/features/bot/server/world.ts`                             |
| `src/modules/changelog/schema.ts`                                    | `src/features/changelog/schema.ts`                             |
| `src/modules/changelog/server/handler.ts`                            | `src/features/changelog/server/handler.ts`                     |
| `src/modules/changelog/server/read.ts`                               | `src/features/changelog/server/read.ts`                        |
| `src/modules/guilds/applications.ts`                                 | `src/features/guilds/applications.ts`                          |
| `src/modules/guilds/client-api.ts`                                   | `src/features/guilds/client-api.ts`                            |
| `src/modules/guilds/hooks/useSupportUnread.ts`                       | `src/features/guilds/hooks/use-support-unread.ts`              |
| `src/modules/guilds/members.ts`                                      | `src/features/guilds/member-identity.ts`                       |
| `src/modules/guilds/question-fields.ts`                              | `src/features/guilds/question-fields.ts`                       |
| `src/modules/guilds/requirements.ts`                                 | `src/features/guilds/requirements.ts`                          |
| `src/modules/guilds/server/acceptance.ts`                            | `src/features/guilds/server/acceptance.ts`                     |
| `src/modules/guilds/server/application-status.ts`                    | `src/features/guilds/server/application-status.ts`             |
| `src/modules/guilds/server/applications.ts`                          | `src/features/guilds/server/applications.ts`                   |
| `src/modules/guilds/server/chat-receipts.ts`                         | `src/features/guilds/server/chat-receipts.ts`                  |
| `src/modules/guilds/server/chat.ts`                                  | `src/features/guilds/server/chat.ts`                           |
| `src/modules/guilds/server/common.ts`                                | `src/features/guilds/server/common.ts`                         |
| `src/modules/guilds/server/leader.ts`                                | `src/features/guilds/server/leader.ts`                         |
| `src/modules/guilds/server/list.ts`                                  | `src/features/guilds/server/list.ts`                           |
| `src/modules/guilds/server/logo.ts`                                  | `src/features/guilds/server/logo.ts`                           |
| `src/modules/guilds/server/members.ts`                               | `src/features/guilds/server/members.ts`                        |
| `src/modules/guilds/server/membership.ts`                            | `src/features/guilds/server/membership.ts`                     |
| `src/modules/guilds/server/requirements.ts`                          | `src/features/guilds/server/requirements.ts`                   |
| `src/modules/guilds/server/support-receipts.ts`                      | `src/features/guilds/server/support-receipts.ts`               |
| `src/modules/guilds/server/support.ts`                               | `src/features/guilds/server/support.ts`                        |
| `src/modules/home/server/status.ts`                                  | `src/features/server-status/server/status.ts`                  |
| `src/modules/map/server/bases.ts`                                    | `src/features/map/server/bases.ts`                             |
| `src/modules/map/server/handler.ts`                                  | `src/features/map/server/handler.ts`                           |
| `src/modules/map/server/load-map.ts`                                 | `src/features/map/server/load-map.ts`                          |
| `src/modules/map/server/markers.ts`                                  | `src/features/map/server/markers.ts`                           |
| `src/modules/map/server/players.ts`                                  | `src/features/map/server/players.ts`                           |
| `src/modules/map/server/realtime-snapshot.ts`                        | `src/features/map/server/realtime-snapshot.ts`                 |
| `src/modules/map/server/realtime.ts`                                 | `src/features/map/server/realtime.ts`                          |
| `src/modules/map/server/vehicles.ts`                                 | `src/features/map/server/vehicles.ts`                          |
| `src/modules/marketplace/schema.ts`                                  | `src/features/bases/marketplace/schema.ts`                     |
| `src/modules/marketplace/server/publish.ts`                          | `src/features/bases/marketplace/server/publish.ts`             |
| `src/modules/marketplace/server/read.ts`                             | `src/features/bases/marketplace/server/read.ts`                |
| `src/modules/marketplace/server/store.ts`                            | `src/features/bases/marketplace/server/store.ts`               |
| `src/modules/marketplace/utils/import-layout.ts`                     | `src/features/bases/marketplace/utils/import-layout.ts`        |
| `src/modules/player/server/avatar.ts`                                | `src/features/player/server/avatar.ts`                         |
| `src/modules/player/server/handler.ts`                               | `src/features/player/server/handler.ts`                        |
| `src/modules/player/server/helpers.ts`                               | `src/features/player/server/helpers.ts`                        |
| `src/modules/player/server/linked-player.ts`                         | `src/features/player/server/linked-player.ts`                  |
| `src/modules/portal/server/export-base.ts`                           | `src/features/bases/server/export-base.ts`                     |
| `src/modules/portal/server/market-config.ts`                         | `src/features/market/server/market-config.ts`                  |
| `src/modules/portal/server/market-listings.ts`                       | `src/features/market/server/market-listings.ts`                |
| `src/modules/portal/server/market.ts`                                | `src/features/market/server/market.ts`                         |
| `src/modules/portal/server/my-listings.ts`                           | `src/features/market/server/my-listings.ts`                    |
| `src/modules/portal/server/population.ts`                            | `src/features/portal/server/population.ts`                     |
| `src/modules/portal/server/world.ts`                                 | `src/features/portal/server/world.ts`                          |
| `src/modules/portal/utils/market.ts`                                 | `src/features/market/presentation.ts`                          |
| `src/modules/portal/utils/vehicles.ts`                               | `src/features/vehicles/presentation.ts`                        |
| `src/server/admin/access.ts`                                         | `src/features/admin/server/api-access.ts`                      |
| `src/server/admin/catalog.ts`                                        | `src/features/admin/server/catalog.ts`                         |
| `src/server/admin/execute.ts`                                        | `src/features/admin/server/execute.ts`                         |
| `src/server/admin/overview.ts`                                       | `src/features/admin/server/overview.ts`                        |
| `src/server/admin/upload.ts`                                         | `src/features/admin/server/upload.ts`                          |
| `src/server/auth/config.ts`                                          | `src/features/auth/server/config.ts`                           |
| `src/server/auth/password.ts`                                        | `src/features/auth/server/password.ts`                         |
| `src/server/auth/reverify.ts`                                        | `src/features/auth/server/reverify.ts`                         |
| `src/server/auth/users.ts`                                           | `src/features/auth/server/users.ts`                            |
| `src/server/base-marketplace.ts`                                     | `src/features/bases/server/marketplace.ts`                     |
| `src/server/changelog-announce.ts`                                   | `src/features/changelog/server/announce.ts`                    |
| `src/server/discord-webhook.ts`                                      | `src/server/integrations/discord-webhook.ts`                   |
| `src/server/guilds.ts`                                               | `src/features/guilds/server/load.ts`                           |
| `src/server/market.ts`                                               | `src/features/market/server/load.ts`                           |
| `src/server/portal.ts`                                               | `src/features/portal/server/load.ts`                           |
| `src/server/session.ts`                                              | `src/features/auth/server/session.ts`                          |
| `src/server/vehicles.ts`                                             | `src/features/vehicles/server/load.ts`                         |
| `tests/unit/app/admin-fields.test.ts`                                | `tests/unit/admin/admin-fields.test.ts`                        |
| `tests/unit/app/admin-logs.test.ts`                                  | `tests/unit/admin/admin-logs.test.ts`                          |
| `tests/unit/app/admin-navigation.test.ts`                            | `tests/unit/admin/admin-navigation.test.ts`                    |
| `tests/unit/app/admin-passphrase.test.ts`                            | `tests/unit/admin/admin-passphrase.test.ts`                    |
| `tests/unit/app/admin-statistics.test.ts`                            | `tests/unit/admin/admin-statistics.test.ts`                    |
| `tests/unit/app/admin.test.ts`                                       | `tests/unit/admin/api.test.ts`                                 |
| `tests/unit/app/guild-questions.test.ts`                             | `tests/unit/guilds/guild-questions.test.ts`                    |
| `tests/unit/app/guild.test.ts`                                       | `tests/unit/guilds/view.test.ts`                               |
| `tests/unit/app/navigation.test.ts`                                  | `tests/unit/components/navigation.test.ts`                     |
| `tests/unit/features/auth.test.ts`                                   | `tests/unit/auth/identity.test.ts`                             |
| `tests/unit/features/v2-base-marketplace.test.ts`                    | `tests/unit/bases/marketplace-schema.test.ts`                  |
| `tests/unit/features/v2-discord-changelog.test.ts`                   | `tests/unit/changelog/discord.test.ts`                         |
| `tests/unit/features/v2-guilds.test.ts`                              | `tests/unit/guilds/directory.test.ts`                          |
| `tests/unit/features/v2-map.test.ts`                                 | `tests/unit/map/config.test.ts`                                |
| `tests/unit/features/v2-portal-view-model.test.ts`                   | `tests/unit/portal/view-model.test.ts`                         |
| `tests/unit/features/v2-storage.test.ts`                             | `tests/unit/player/storage.test.ts`                            |
| `tests/unit/features/v2-vehicles-market.test.ts`                     | `tests/unit/market/vehicle-normalization.test.ts`              |
| `tests/unit/infrastructure/dune-adapter.test.ts`                     | `tests/unit/server/dune-adapter.test.ts`                       |
| `tests/unit/infrastructure/dunedocker-transport.test.ts`             | `tests/unit/server/dunedocker-transport.test.ts`               |
| `tests/unit/infrastructure/pterodactyl-egg.test.ts`                  | `tests/unit/deployment/pterodactyl-egg.test.ts`                |
| `tests/unit/lib/auth-server.test.ts`                                 | `tests/unit/auth/password.test.ts`                             |
| `tests/unit/lib/env.test.ts`                                         | `tests/unit/config/env.test.ts`                                |
| `tests/unit/lib/redis-rekey.test.ts`                                 | `tests/unit/maintenance/redis-rekey.test.ts`                   |
| `tests/unit/lib/server.test.ts`                                      | `tests/unit/runtime/server-launcher.test.ts`                   |
| `tests/unit/lib/session-reverify.test.ts`                            | `tests/unit/auth/session-reverify.test.ts`                     |
| `tests/unit/portal/inventory.test.ts`                                | `tests/unit/player/inventory.test.ts`                          |
| `tests/unit/portal/item-image.test.ts`                               | `tests/unit/player/item-image.test.ts`                         |
| `tests/unit/portal/market-format.test.ts`                            | `tests/unit/market/format.test.ts`                             |
| `tests/unit/portal/player-presentation.test.ts`                      | `tests/unit/player/presentation.test.ts`                       |

## Removed obsolete structures

- `src/modules/` and `src/infrastructure/` were fully migrated and removed.
- Route-level `_components/` directories were migrated to shared or feature-owned component homes.
- `tests/unit/app/`, `tests/unit/features/`, and `tests/unit/infrastructure/` were reorganized by domain.
- Legacy portal compatibility re-exports and the old `src/config/env.ts` shim were removed.
- The duplicate `src/lib/portal-formatting.ts` module was consolidated into `src/lib/format.ts`.
- The one-time migration manifest tool was removed after use. No compatibility directories remain.

## Verification record

| Command                                                 | Actual result                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                  | Passed; all source, test, and script files matched Prettier                                                 |
| `npm run typecheck`                                     | Passed                                                                                                      |
| `npm run lint`                                          | Passed with zero warnings                                                                                   |
| `npm test`                                              | Passed: 81 files, 869 tests                                                                                 |
| `npm run build`                                         | Passed                                                                                                      |
| `npm run test:production`                               | Passed: runtime smoke, 13 API modules, protected import, telemetry, market, and logout                      |
| `node scripts/deployment/build-pterodactyl-egg.mjs ...` | Passed; generated JSON parsed successfully                                                                  |
| `bash -n test-results/egg-install.sh`                   | Passed; generated installer syntax is valid                                                                 |
| `npm run test:browser`                                  | Completed: 24 passed, 55 failed in older stale UI assertions; these pre-existing failures remain unresolved |
| `npx playwright test tests/browser/navigation.spec.ts`  | Passed: 3 focused desktop, tablet, mobile, permission, and keyboard tests                                   |

## Generated artifacts

`.next/`, `node_modules/`, `coverage/`, `test-results/`, `playwright-report/`, and `tsconfig.tsbuildinfo` are generated and ignored. Playwright browser binaries are installed outside the repository. The architecture root check excludes only the documented TypeScript cache from root source enforcement.

## Remaining risks

- Live Discord, Dune Console, and external Redis services were not exercised by the mocked/local verification.
- No production Redis rekey or Pterodactyl installation was run.
- The full browser suite still has 55 failures in older UI assertions that predate this migration. The focused navigation suite is green, but the repository browser suite is not fully green.
