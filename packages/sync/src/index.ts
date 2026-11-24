/** Client-side document sync for the editor (ARCHITECTURE §7 "Offline"). */
export {
  type CachedState,
  type ConnectionStatus,
  type DocCache,
  DocClient,
  type DocClientOptions,
  type DocState,
  type PendingTx,
  type SocketLike,
} from "./client.ts";
export { indexedDbCache, memoryCache } from "./idb-cache.ts";
