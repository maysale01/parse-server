import { DatabaseProvider, FilesProvider, CacheProvider, MemoryCache } from './index';
import { ExportAdapter as DEFAULT_DATABASE_ADAPTER, GridStoreAdapter as DEFAULT_FILES_ADAPTER } from '../adapters';
import { default as ParseApp } from './ParseApp';
import { Parse } from 'parse/node';

class ParseServer {
    constructor(args = {}) {
        this._databaseProvider = new DatabaseProvider(args.databaseAdapter || DEFAULT_DATABASE_ADAPTER);
        this._filesProvider = new FilesProvider(args.fileAdapter || (new DEFAULT_FILES_ADAPTER()));
        this._cacheProvider = new CacheProvider(args.cache || (new MemoryCache()));

        if (args.apps) {
            args.apps.map(appConfig => this.createApp(appConfig));
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

    createApp(appConfig) {
        const DatabaseProvider = this.getDatabaseProvider();
        const CacheProvider = this.getCacheProvider();

        if (!appConfig.database) {
            appConfig.database = DatabaseProvider.getDatabaseConnection(appConfig.applicationId, appConfig.collectionPrefix);
        }

        let app = new ParseApp(appConfig);

        // Initialize the Parse SDK
        // TODO: Silo this for each app, might need to submit PR: 
        // https://github.com/ParsePlatform/Parse-SDK-JS/blob/master/src/Parse.js
        Parse.initialize(app.applicationId, app.javascriptKey || '', app.masterKey);

        // Add the app to the cache
        CacheProvider.getCache().setApp(app.applicationId, app)
    }
}

export default ParseServer;