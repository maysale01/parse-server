import { DatabaseProvider, FilesProvider, CacheProvider, MemoryCache } from './index';
import { ExportAdapter as DEFAULT_DATABASE_ADAPTER, GridStoreAdapter as DEFAULT_FILES_ADAPTER } from '../adapters';
import { addParseCloud } from '../utils';

class ParseServer {
    constructor(args = {}) {
        this._databaseProvider = new DatabaseProvider(args.databaseAdapter || DEFAULT_DATABASE_ADAPTER);
        this._filesProvider = new FilesProvider(args.fileAdapter || (new DEFAULT_FILES_ADAPTER()));
        this._cacheProvider = new CacheProvider(args.cache || (new MemoryCache()));
        if (args.cloud) {
            addParseCloud();
            require(args.cloud);
        }
    }

    getFilesProvider() {
        return this._filesProvider;
    }

    getDatabaseProvider() {
        return this._databaseProvider;
    }

    getCacheProvider() {
        return this._cacheProvider;
    }

    registerApp(appId, app) {
        this._cacheProvider.registerApp(appId, app);
    }
}

export default ParseServer;